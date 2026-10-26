# @ezclassify/conformance-server

A server that answers EzClassify wire requests over real HTTP by replaying what
a real runtime already answered.

It ships with the golden wire corpus: request and response pairs for every
operation the REST contract serves, recorded off the licensed runtime and
validated against the OpenAPI spec as they were recorded.
Point a client at this server and the exchanges in that corpus come back byte
for byte, headers and status included.

There is no engine in this package. It does not parse a marking, resolve a
layer, evaluate a rule, or make an access decision. It looks a request up and
serves what was recorded.

## Quick start

```bash
npx @ezclassify/conformance-server --port 4010
```

```
EzClassify conformance replay server listening on http://127.0.0.1:4010
  corpus v1: 70 recorded exchanges (.../wire/v1/corpus.json)
  contract 1.0.0, auth none
```

The exchange count above is a snapshot of the banner this server actually prints; run it yourself to see the current figure. It will not match a raw count of `corpus.json`'s cases: the corpus also carries the closed-deployment recordings needed to simulate a missing or wrong credential, and this server produces those from its own auth mode rather than serving them as ordinary entries. What is printed is the servable set, the same filtering described in "Where the corpus comes from" below.

```bash
curl -s http://127.0.0.1:4010/v1/health
curl -s http://127.0.0.1:4010/v1/ctx/ez-full/1.0.0/scheme/process \
  -H 'content-type: application/json' \
  -d '{"input":"OPEN"}'
```

In a test harness, start and stop it in process:

```ts
import { startConformanceServer } from '@ezclassify/conformance-server';
import { EzClassifyClient } from '@ezclassify/rest-client';

const server = await startConformanceServer({ port: 0 });
try {
    const client = new EzClassifyClient(server.url);
    await client.ping();
} finally {
    await server.stop();
}
```

`port: 0` takes a free port and reports it on `server.url`, so suites can run in
parallel without agreeing on a number.

### Options

| CLI               | API            | Default            | What it does                           |
| ----------------- | -------------- | ------------------ | -------------------------------------- |
| `--port <n>`      | `port`         | `4010` (API: `0`)  | Port. 0 picks a free one.              |
| `--host <addr>`   | `host`         | `127.0.0.1`        | Interface to bind.                     |
| `--corpus <path>` | `corpus`       | the bundled corpus | Replay a different corpus.             |
| `--auth <mode>`   | `auth`         | `none`             | `none` or `simulated`.                 |
| `--quiet`         | `log: null`    | reports on stderr  | Silence the unmatched-request reports. |
|                   | `maxBodyBytes` | 8 MiB              | Request body ceiling.                  |

## Replay limits

The server answers only recorded requests. Use the licensed runtime to evaluate
new inputs. The public corpus supports SDK development and integration tests
without a license or network access.

The corpus also omits these deployment details:

- **Recorded CORS headers.** Cross-origin policy is deployment configuration.
  An explicit local-development origin can be enabled as described below.
- **Recorded rate limiting, request ids, licensing headers, `Date`.** These
  are deployment details. Integration profiles can deliberately simulate rate
  limiting without presenting it as a recording.
- **Real credentials.** The corpus records which kind of credential a request
  presented, never a value. See below.

## When it cannot match

An unrecorded request gets an HTTP 501 with a diagnostic, never a wire status.
501 is deliberate: every status this wire uses means something specific, and a
replay server answering 404 would be indistinguishable from the runtime
answering a missing resource. Nothing on this wire returns 501, so a 501 is
always this server saying it has nothing.

The body names the nearest recordings, closest path first and then closest body,
and validates what you sent against the contract:

```jsonc
{
    "ezclassifyConformanceServer": {
        "problem": "unmatched-request",
        "operationId": "ctxSchemeProcess",
        "hint": "The request does not satisfy the contract, so no recording could match it. Fix the request against the findings below first.",
        "specValidation": [
            {
                "at": "(root)",
                "keyword": "additionalProperties",
                "field": "scheme_id",
                "message": "(root) has no field \"scheme_id\".",
            },
        ],
        "nearest": [
            {
                "caseId": "ctx-scheme-process.ok",
                "path": "/v1/ctx/ez-full/1.0.0/scheme/process",
                "bodyDiff": {
                    "missing": [],
                    "unexpected": ["scheme_id"],
                    "different": [],
                },
            },
        ],
    },
}
```

Every unmatched request is also reported on stderr. `--quiet` turns that off;
the response body is unaffected.

A body that does not parse as JSON, and a body past `maxBodyBytes`, come back
the same way: a 501 with `problem` set to `malformed-json` or
`request-too-large`. The size refusal answers first and closes the connection
after, so it reads as a refusal rather than as the server falling over.

Requests are matched on method, path and body, not on bytes. Object keys and
query parameters may arrive in any order; array order is significant, because it
is significant on this wire. A request with no body and a request with an empty
one are different requests, because the runtime answers them differently.

One caveat on "byte for byte", stated precisely because it matters to anyone
diffing output. Status, headers and every value in the body are exactly what the
runtime sent. JSON object key order is the corpus's, not the recording server's:
the corpus orders keys recursively when it is written, so the server's insertion
order was never captured and nothing can reproduce it. That is correct for JSON,
where an object is an unordered map, and it is the same order every SDK sees in
the vendored artifact.

## Simulating authentication

`--auth simulated` accepts exactly one bearer:

```
Authorization: Bearer ezclassify-conformance-test-bearer
```

Import it as `TEST_BEARER_TOKEN` rather than copying the literal. It is a
published test value, not a credential any deployment issues: the corpus records
the credential kind without its value, because a signed carrier belongs to whoever minted it and
publishing one would put a value in every consuming repository that no replay
can reproduce.

Every other request (no bearer, wrong bearer, malformed header) gets the
wire's constant refusal, taken byte for byte off the corpus:

```
HTTP/1.1 404 Not Found
content-type: application/json
cache-control: no-store
x-content-type-options: nosniff

{"error":"not_found"}
```

That shape is why the mode exists. A deployment running authentication answers
an unauthenticated request with HTTP 404 without revealing whether the target
exists. Inspect the refusal shape before interpreting that status as a missing
resource: the recorded missing-context and missing-version lookup responses
have their own bodies. An SDK can surface the constant refusal as "possibly not
authenticated", and this is how you test that publicly. `/v1/health` and
`/v1/ready` stay open, as the contract declares.

`--auth none` is the default and does not look at credentials at all.

## Where the corpus comes from

`@ezclassify/conformance` ships it under `wire/v1/`, with a `manifest.json`
recording which contract digest it was validated against, which runtime produced
it, and the places where that runtime and the published contract genuinely
disagree. Nothing in the corpus was authored: every recorded body came back over
a socket from a server that had already answered.

```ts
import {
    readManifest,
    BUNDLED_CORPUS_PATH,
} from '@ezclassify/conformance-server';

readManifest()?.contractDivergences;
```

`--corpus` takes a different one. The server refuses to start on a corpus it
could not answer from unambiguously: two cases that are the same request, a
duplicate case id, or no recorded refusal to simulate authentication with. A
replay server that quietly picked one of two indistinguishable recordings would
let an SDK pass without anyone knowing which answer it was measured against.

The manifest's `contractDivergences` also names the places where the recorded
runtime and the published contract genuinely disagree. See "Known contract
divergences" in the `@ezclassify/conformance` README for what that means for
a client parsing these recordings.

## Testing an application integration

Use the Cedar Valley fixture to connect your normal client, embed UI components
in your application, inspect access outcomes, and exercise error handling:

```bash
npx @ezclassify/conformance-server --scenario cedar-valley --port 4010
# When the application runs on a different browser origin:
npx @ezclassify/conformance-server --scenario cedar-valley --cors-origin http://localhost:5173
npx @ezclassify/conformance-server --list-scenarios
```

Use context `cedar-valley`, version `1.0.0`, and scheme `cedar-valley`.
[The fixture catalog](./scenarios/cedar-valley/README.md) lists supported requests,
including marking, guidance, validation, aggregation, access granted and denied,
empty results, and recorded resource errors. These are finite scenarios, so use
the documented inputs. The server does not compute new answers to arbitrary
markings, guide text, or user attributes.

| Profile              | Behavior                                                                                                                  |
| -------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| `cedar-valley`       | Replay the recorded exchanges, with no injected faults.                                                                   |
| `context-not-found`  | Bootstrap describe, summary, concepts and categories replay the recorded missing-context refusal.                         |
| `version-not-found`  | The same bootstrap requests replay the recorded missing-version refusal.                                                  |
| `slow-response`      | Marking processing waits 1500 ms, useful for loading, timeout and cancellation tests.                                     |
| `transient-error`    | First attempt at each recorded marking request returns a simulated 500; subsequent attempts replay its recording.         |
| `rate-limit`         | First attempt at each recorded marking request returns a simulated 429 and `Retry-After: 1`; subsequent attempts recover. |
| `unavailable`        | Recorded marking requests always return simulated 503.                                                                    |
| `disconnected`       | Recorded marking requests close the socket without a response.                                                            |
| `malformed-json`     | Recorded marking requests return deliberately invalid JSON with HTTP 200.                                                 |
| `malformed-envelope` | Recorded marking requests return a deliberately invalid response envelope with HTTP 200.                                  |

Operation fault profiles affect only matched `ctxSchemeProcess` requests. Context
bootstrap, readiness, guide and access operations still replay normally. A
request nobody recorded always gets the usual 501 diagnostic, including during
fault profiles. Deliberately simulated responses carry `X-EzClassify-Simulation`
with the selected profile name; the disconnected profile has no response to
carry a header. Recorded refusals preserve their real body and headers.

```ts
import {
    readScenarioCases,
    startConformanceServer,
} from '@ezclassify/conformance-server';

const server = await startConformanceServer({ scenario: 'transient-error' });
try {
    const cases = readScenarioCases();
    const input = cases.find(
        (entry) =>
            entry.operationId === 'ctxSchemeProcess' &&
            entry.response.status === 200,
    );
    // Configure your normal client with server.url and use input.request.body.
    // Retry the identical request to observe recovery.
    server.resetScenario(); // Start the transient sequence again for the next test.
} finally {
    await server.stop();
}
```

Counters are isolated per server and per matched request, rather than request
order across the application. `resetScenario()` clears those counters. A restart
also resets them. Delayed responses cancel when the client disconnects or the
server stops. `scenario` and `corpus` are mutually exclusive. Without
`scenario`, the server replays the golden SDK conformance corpus.

`corsOrigin` (CLI `--cors-origin`) permits one exact HTTP or HTTPS origin. It has
no wildcard default. Preflight permits the client authorization and context-token
headers and exposes resolved version, retry and simulation headers. It does not
issue credentials or configure real runtime authentication. To test missing,
invalid and accepted credentials, combine any profile with `--auth simulated`
and use the published test bearer described above.

### Observing access requests and outcomes

An opt-in callback lets a harness collect HTTP outcomes for testing its logging
plumbing. By default it receives method, path without query parameters, fixture
id, operation id, status, duration and whether a response was simulated or the
connection closed early. It never receives request headers, bearer values or
context tokens.

```ts
const exchanges = [];
const server = await startConformanceServer({
    scenario: 'cedar-valley',
    observe: (exchange) => {
        exchanges.push(exchange);
    },
    observeBodies: true,
});
// Exercise recorded access requests through your client, inspect exchanges,
// and close the server in your test's teardown.
```

`observeBodies: true` explicitly includes detached request and response JSON
bodies. Markings, access attributes and explanations can be sensitive. Use test
data and control where the callback stores it. Bodies are never printed by the
server. Callback failures are reported without the callback's error text and do
not change replayed responses. Observation happens when the response closes;
there is no retained server-side log buffer.

These exchanges test your application's logging and response handling. They are
not production audit records and do not prove an authorization policy is correct.
Your application supplies its own authenticated identity, correlation metadata,
retention policy and audit controls.

## License

Apache-2.0. See [LICENSE](./LICENSE).
