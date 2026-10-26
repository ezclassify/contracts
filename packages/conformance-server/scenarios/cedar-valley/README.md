# Cedar Valley integration scenarios

Use your normal EzClassify client against the scenario server to exercise connection, UI rendering, response handling, access logging, and failure recovery. Cedar Valley is a fictional school-district teaching policy. These recordings cover selected requests; they do not implement policy evaluation for arbitrary inputs.

```sh
ezclassify-conformance-server --scenario cedar-valley --port 4010
```

Connect to `http://127.0.0.1:4010` and select context `cedar-valley`, version `1.0.0`. The fixture deployment accepts a locally verified Context carrier while recording; the scenario server replays without a credential. Do not use this server to authenticate a user or enforce access.

## Supported workflows

The JSON corpus is the exact request catalog. Property order is insignificant; optional properties and array order must match a recorded request. Read `readScenarioCases('cedar-valley')` from `@ezclassify/conformance-server` to discover the supported inputs and actual responses without copying them into your tests. An unsupported request returns a diagnostic instead of inventing an answer.

| Workflow           | Recorded examples                                                                                                                                                                                                                                                                                 |
| ------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Connect            | Health, readiness, context discovery, version discovery, context description, and the seven scheme profile reads used by the clients                                                                                                                                                              |
| Process and render | Empty input, PUBLIC, INTERNAL, CONFIDENTIAL, full district marking, validation findings, unrecognized text; native UI assertion bindings; full and short renderings                                                                                                                               |
| Document and parts | The Web READMEs' "Mark a Document and Its Parts" form, every request it sends: part and whole roles, inline-marking scans of the title and body, the parts rollup and coverage check, the marking popups, "Set document to CONFIDENTIAL", and the body edited to `(CONFIDENTIAL) Planning notes.` |
| Concept details    | `GET .../scheme/describe-concept` for the concepts the category browser describes as you move through a picker                                                                                                                                                                                    |
| Suggestions        | Empty/C/c input, category filters and batches, PUBLIC/nonpublic/complex assertion baselines, and observed UI autocomplete calls                                                                                                                                                                   |
| Guides             | Guide view, rule description, empty/matching/unmatched scans, empty/selected evaluation, and rule filtering                                                                                                                                                                                       |
| Aggregate          | The worked district example and the repeated-marking/assertion-set forms emitted by the UI examples                                                                                                                                                                                               |
| Access             | PUBLIC grant, CONFIDENTIAL grant/denial, complex grant, separate clearance/content/school/recipient denials, missing attributes, and requirements/rule descriptions                                                                                                                               |
| Document access    | Authored grant, authored denial, marking needing completion, and unmarked document; separate authored and authoritative statuses                                                                                                                                                                  |
| Refusals           | Invalid request body, unknown guide, absent context/version, and the constant authentication refusal recorded from the runtime                                                                                                                                                                    |

Start with `POST /v1/ctx/cedar-valley/1.0.0/scheme/process` and one of these bodies:

```json
{ "input": "PUBLIC" }
```

```json
{ "input": "INTERNAL//FINANCIAL INFORMATION" }
```

The second input returns HTTP 200 with validation findings. Your application must inspect the operation result, as well as the HTTP status. `process.complex` contains the complete Cedar Valley marking with sensitive content, school, external-recipient and handling selections, and can supply realistic text for an embedded field or banner.

## Document and parts form

The `document-form.*` recordings are the requests sent by the document form in the [`@ezclassify/ui`](https://github.com/ezclassify/web/tree/main/libs/ui#mark-a-document-and-its-parts), React, Angular and Vue READMEs. Load the form as written and use it as the README describes: focus each control, open each picker and browse its categories, open the marking popup in the title and body (Ctrl+Enter, or Cmd+Enter on macOS), select **Set document to CONFIDENTIAL**, then change the title to `(PUBLIC) District report card` and the body to `(CONFIDENTIAL) Planning notes.` followed by `(PUBLIC) Published background.` Every request the form sends on that path has a recording, named by the step that first sends it. Requests the form shares with earlier recordings, such as the connection reads, keep those recordings' names. The replayed form ends in the same state as against the runtime: an authored CONFIDENTIAL whole that covers its CONFIDENTIAL parts. Other edits, such as a different part marking, send requests that are not recorded.

## Access decisions and logs

Send `POST /v1/ctx/cedar-valley/1.0.0/access/check`:

```json
{ "marking": "CONFIDENTIAL", "userAttributes": {} }
```

```json
{
    "marking": "CONFIDENTIAL",
    "userAttributes": {
        "clearance": "CONFIDENTIAL",
        "recipient_organizations": ["CEDAR_VALLEY_DISTRICT"]
    }
}
```

Both return HTTP 200. The first decision is denied and the second is granted. For the complex marking, `access.granted` supplies a complete trusted-attribute example; the four `access.denied-*` recordings alter one attribute family at a time. These are synthetic test facts. Your host application remains responsible for obtaining authoritative identity and attributes.

Use the returned decision and rule explanations to verify your application's log fields, alongside the request target, your authenticated actor and your own correlation metadata. Log collection remains your application's responsibility; replaying a granted response proves that plumbing works, rather than proving a real authorization policy is correct.

`document.assess-access-granted` and `document.assess-access-denied` use a complete authored marking and return corresponding authored/authoritative statuses. `document.assess-access-needs-completion` records the runtime's completion of the complex marking and returns `granted` for both bases with the supplied trusted test attributes. `document.assess-access-unmarked` returns `not-evaluated` for both bases with a `missing-overall-marking` limitation; `document.assess-access-conflicting-overall` returns `not-evaluated` with `conflicting-overall-markings`. Keep those statuses distinct from a grant or denial. Guide matches remain nominations that an author reviews.

## Transport and bootstrap failures

Use the server's named `context-not-found`, `version-not-found`, `slow-response`, `transient-error`, `rate-limit`, `unavailable`, `disconnected`, `malformed-json`, and `malformed-envelope` scenarios to test loading states, cancellation, retries, recovery and decoding failures. Failure profiles apply to matched recorded requests, so keep using the supported catalog while testing them. Their transport behavior is deliberate simulation; the Cedar Valley semantic responses are recordings from the real runtime.

## Provenance

[`manifest.json`](manifest.json) identifies the wire contract digest, runtime producer digest and versions, recording-tool digest, and exact approved teaching-content digest. Response bodies came from real HTTP requests and were checked against the published contract. Signed carrier values, volatile headers, machine paths, and timestamps are excluded. Repeated requests must produce identical recorded responses; the generator rejects conflicts. Maintainers regenerate and compare the committed files byte for byte to detect drift. The public package runs from these artifacts alone.
