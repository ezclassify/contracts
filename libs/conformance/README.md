# @ezclassify/conformance

Conformance corpus for EzClassify adapters and REST clients. Java, .NET, Python, and Go SDK runners use these vectors and recorded responses to check their public contract behavior. The SDKs do not implement engine policy.

This package is data. There is no runner in it and no code of any kind, which is the point: every implementation is checked against the same vectors by a runner written in its own language.

## Contents

- [`plans/v1/`](plans/v1/): 15 plan files covering process, validate, aggregate, suggest, scan, render, diff, layers, guide evaluation, access checks, outputs declared by surface and view, the coverage of each published output, context operations, and context operations in a scheme other than the primary, plus `plan-schema.json`, the schema they are written against
- [`fixtures/v1/`](fixtures/v1/): reference schemes, guides, and access policies. Most plans share `ref-scheme-1`; `from-layers`, `scope-transport` and `surfaces` load their own `ref-layer-*`, `ref-scope-*` and `ref-surfaces-1` fixtures, `ref-settling-1` backs the validate and process cases about how a marking is settled (a part against its whole, a fact a rule adds, a value handed in), and `ref-scheme-2`, whose parts are written in parentheses, backs the semantic `share-list` case and the scan cases about wrapped marks. The server-slice plans run against the Context fixtures `ref-ctx-1`, which holds `ref-scheme-1` alone, and `ref-ctx-2`, which adds the crosswalk `ref-crosswalk-1` onto `ref-scheme-2` so the Context holds two schemes. `ref-marked-1` is `ref-scheme-1` marked in its own scheme (`marking_scheme: self`): a whole marking on the scheme block and a part on a category, a concept, a render format and a rule, which an engine loads and answers exactly as it does the same document unmarked. `ref-marked-guide-1`, `ref-marked-access-1` and `ref-marked-crosswalk-1` are the same for the other marked families, each naming its marking scheme by reference: a whole on the root block and a part on each rule or mapping. `ref-marked-crosswalk-1` also holds a selection, so translating HIGH/CTRL-A reports CTRL-A as `not-selected`
- [`recordings/v1/`](recordings/v1/): expected outputs for the engine-slice plans, produced by executing the reference engine. `ctx-process` and `ctx-scheme-selector`, the server-slice plans in [`plans/v1/`](plans/v1/), have no recording here; see "Where the expected outputs come from" below
- [`semantic/v1/`](semantic/v1/): the document-assessment semantic contract, its schema, and its fixtures. [`semantic/v1/fixtures/context.json`](semantic/v1/fixtures/context.json) names the reference fixtures a case runs against, and its `variants` map says which fixtures a request's `fixtureVariant` swaps in or drops
- [`replayer-contract/v1/`](replayer-contract/v1/): the contract an HTTP record/replay harness is written against
- [`cache/v1/`](cache/v1/): the response cache contract every REST client follows, `CACHE-SEMANTICS.md`, and `plans.json`, the plans that measure it in wire trips against the wire corpus, written against `plans.schema.json`
- [`matrix.json`](matrix.json): per-SDK support level (`required` / `optional` / `skip`) for each plan; runners read it to skip plans that don't apply to the SDK under test
- [`wire/v1/`](wire/v1/): the golden wire corpus. Canonical request/response pairs for every operation the REST contract serves, recorded off the real runtime, plus a `manifest.json` naming the contract digest they were validated against and the places the runtime and the contract disagree

## Where the expected outputs come from

The reference runner is not in this package and is not published. It executes the engine to produce [`recordings/v1/`](recordings/v1/), so it lives with the engine, and shipping it here would ship the engine with it. What that runner wrote is what you check your implementation against.

This only covers the engine-slice plans. `ctx-process` and `ctx-scheme-selector` ([`matrix.json`](matrix.json) marks them `slice: server`) exercise the Context operations against a live REST API server serving the Context fixtures, not the reference engine directly, so they fall outside the engine runner's recording flow. `ctx-scheme-selector` names a scheme with `scheme`, sent as `?scheme=`, and its `refusedWith` cases are the ones the server refuses with that status. Their cases carry their expected output inline in the plan instead.

## For SDK authors

Write a runner in your language that loads the `plans/v1/*.json` files, dispatches each vector's method and args to your implementation, and compares the result against the matching entry in [`recordings/v1/`](recordings/v1/). The server-slice plans are the exception: they have no recording, so run them against a live server and check each case against its inline `expect` value, or its `refusedWith` status, in the plan (see [`matrix.json`](matrix.json) for which SDKs it applies to). `format-coverage` is an adapter-slice plan: `getScheme` and `getFormatCoverage` are answers an adapter gives in process, with no wire operation behind them, so a REST replayer does not run it. Its recordings hold, for each reference scheme, the published profile and the coverage the engine reports for every output that profile lists. An adapter that answers coverage from the profile it holds checks each answer against the recording for that output. Add a column for your SDK to [`matrix.json`](matrix.json) declaring which plans are required. The plan schema is [`plans/v1/plan-schema.json`](plans/v1/plan-schema.json). An HTTP-based SDK can drive the same vectors through record/replay against [`replayer-contract/v1/`](replayer-contract/v1/), or run `@ezclassify/conformance-server` and go over a real socket.

A recording's key is the lowercase hex SHA-256 of the case's `method`, `args`, `fixture`, `mode`, `ctxId`, `ctxVersion`, `guideFixture` and `accessFixture`, in that order and joined with `|`. `args` and `fixture` are written as key-sorted compact JSON, `mode` defaults to `fromJSON`, and any other field a case leaves out is the empty string. Every field that picks a document is in the key, so two cases that differ only in their guide or access fixture have recordings of their own.

## The wire corpus

[`wire/v1/corpus.json`](wire/v1/corpus.json) is a different kind of vector: not "call this method, expect this value" but "send these bytes, expect these bytes back". Each case names the operation, the request as sent, and the response as received, including status and the headers that carry contract meaning. No credential value is recorded. The `auth` block states the kind of credential the request presented and nothing more.

Two ways to use it. Replay it in process against a transport stub, which is the fast in-process path: assert your client emitted the recorded request, hand it the recorded response, assert what it parsed. Or run `@ezclassify/conformance-server`, which serves the same corpus over real HTTP so a client is exercised through its own stack.

This repository does not generate the corpus. It is recorded off the licensed runtime, so a change to it means the wire moved.

## Cache conformance

[`cache/v1/CACHE-SEMANTICS.md`](cache/v1/CACHE-SEMANTICS.md) is the cache contract: which operations a client caches, how it keys and shares entries, how long they live, what clears them, and why access decisions always reach the wire. [`cache/v1/plans.json`](cache/v1/plans.json) states the same rules as plans. A plan builds one cache-enabled client, calls operations with wire corpus cases, holds or scripts responses where it has to, and asserts how many requests reached the transport and what each caller got back.

Each plan lists the harness capabilities it needs. A port may declare a capability absent only for the reason the plan file states, such as having no per-call cancellation surface, and it runs every plan that needs no such capability.

## Known contract divergences

[`wire/v1/manifest.json`](wire/v1/manifest.json) is the source of truth for where the recorded runtime and the published OpenAPI contract disagree, under `contractDivergences`. It is empty: every recorded request and response validates against the contract this corpus was recorded with, so a client generated from the contract parses the whole corpus.

If an entry ever appears there, read it before assuming your client is wrong: it means a client generated strictly from the contract cannot parse what the wire sends for that operation, and the fix is queued against the contract.

## License

Apache-2.0. See [LICENSE](./LICENSE).
