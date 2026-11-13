# Architecture Ownership

This repository is the bottom of the EzClassify dependency graph. It owns the
public contract and nothing that acts on it. Derivation and package
dependencies run one way:

```
@ezclassify/types ──> @ezclassify/schemas ──> @ezclassify/validator
        │
        └──────────> @ezclassify/openapi ──┐
                                           ├──> @ezclassify/conformance-server
                 @ezclassify/conformance ──┘
```

`@ezclassify/tsconfig` is shared build configuration with no runtime role.

## Sources of truth

- **[`libs/types/src/`](libs/types/src/)** holds the hand-written TypeScript interfaces for every
  document and wire shape. The generated JSON Schemas and the OpenAPI
  components are derived from them. Declarations tagged `@internal` are
  stripped from the published `dist/index.d.ts` and kept only in the
  `./internal` entry, which EzClassify's own runtime packages consume at the
  release-train version and which is not for external use. The published
  names and every published declaration are frozen, as built, in
  [`libs/types/tests/fixtures/public-export-symbols.golden.json`](libs/types/tests/fixtures/public-export-symbols.golden.json) and
  [`libs/types/tests/fixtures/public-signatures.golden.json`](libs/types/tests/fixtures/public-signatures.golden.json).
- **[`libs/openapi/src/route-decls/`](libs/openapi/src/route-decls/)** declares each REST operation: path,
  method, operation id, parameters, error responses, and the request and
  response body types. [`libs/openapi/src/wire.ts`](libs/openapi/src/wire.ts) holds the HTTP body types that
  have no document counterpart, and [`libs/openapi/scripts/openapi-http-overlay.yaml`](libs/openapi/scripts/openapi-http-overlay.yaml)
  holds the shared parameters and error responses, the only hand-authored
  component content in the document.
- **[`libs/schemas/validation-schema.mjs`](libs/schemas/validation-schema.mjs)** derives the published document
  schema for each kind (scheme, guide, access, crosswalk, context and test
  suite) from the `*Definition` types. It owns schema-only constraints and stable
  definition names, rather than a second set of document shapes. `npm run bundle`
  generates them, together with the result schemas.
- **[`libs/conformance/`](libs/conformance/)** is data. Plans and reference fixtures are authored
  here. The engine-slice recordings and the golden wire corpus are produced by a
  runtime and committed as recorded; this repository does not generate them.
- **[`openapi-surface.txt`](openapi-surface.txt)** is the frozen list of public operations.

## Generated code

| Output                                                                                                                                                                                                                 | Generator                                                                                          | Freshness check                                                                                                   |
| ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------- |
| [`libs/schemas/generated/json-schemas/`](libs/schemas/generated/json-schemas/), [`libs/schemas/generated/validation/v1/`](libs/schemas/generated/validation/v1/)                                                       | `npm run bundle` ([`libs/schemas/build.mjs`](libs/schemas/build.mjs))                              | `npm run check:schemas`; CI reruns `npm run bundle` and fails on a dirty tree                                     |
| [`libs/openapi/openapi.yaml`](libs/openapi/openapi.yaml), [`libs/openapi/openapi.json`](libs/openapi/openapi.json), [`libs/openapi/scripts/components.generated.yaml`](libs/openapi/scripts/components.generated.yaml) | `npm run codegen` ([`libs/openapi/scripts/emit-openapi.ts`](libs/openapi/scripts/emit-openapi.ts)) | `npm run check:openapi`                                                                                           |
| [`libs/openapi/openapi.json`](libs/openapi/openapi.json) restated from the YAML, and [`openapi-surface.txt`](openapi-surface.txt)                                                                                      | `npm run check:spec -- --write`                                                                    | `npm run check:spec`                                                                                              |
| `packages/validator/src/generated/*.validator.mjs`                                                                                                                                                                     | `npm run generate:standalone -w @ezclassify/validator`                                             | [`packages/validator/tests/standalone.spec.ts`](packages/validator/tests/standalone.spec.ts)                      |
| `THIRD-PARTY-NOTICES.md` in each package that ships third-party code                                                                                                                                                   | `npm run notices`                                                                                  | `npm run check:notices`; [`scripts/tests/third-party-notices.spec.ts`](scripts/tests/third-party-notices.spec.ts) |

Generated schemas are committed so language generators downstream can consume
them, and so drift shows up as a diff in review. Response schemas are generated
open and request schemas closed; [`libs/schemas/build.mjs`](libs/schemas/build.mjs) and
[`libs/openapi/scripts/emit-openapi.ts`](libs/openapi/scripts/emit-openapi.ts) own that decision.

The published OpenAPI document, generated JSON Schemas, and conformance corpus
are vendored by the EzClassify spec bot into every client repository. Successful
routine `main` push CI automatically starts full qualification through
[`.github/workflows/spec-contract-dispatch.yml`](.github/workflows/spec-contract-dispatch.yml).
The launcher waits for the exact returned full run to succeed, then explicitly
starts the guarded dispatcher: GitHub suppresses the follow-on `workflow_run`
event when CI was launched with `GITHUB_TOKEN`. Only successful full CI for the
current official revision may dispatch the verified source to the receiver. No source-path filter may suppress this chain.
[`scripts/tests/spec-dispatch-paths.spec.ts`](scripts/tests/spec-dispatch-paths.spec.ts)
checks the launcher, refusal paths, full qualification proof and bundle inputs.

## Handwritten seams

- `@ezclassify/types` ships a small set of pure runtime helpers next to its
  types (the Context adapter guard and the vocabulary and display helpers),
  frozen in the public export golden.
- `@ezclassify/schemas` re-exports the static schemas and the sub-schemas read
  out of them, all browser-safe.
- `@ezclassify/validator` checks document shape against the published schemas
  and adds a CLI. It reports structure only.
- `@ezclassify/conformance-server` looks a request up in the wire corpus and
  serves what was recorded. Its simulated authentication mode stands in for a
  closed deployment.
- [`scripts/check-public-spec.mjs`](scripts/check-public-spec.mjs) owns the publication rule for the OpenAPI
  document. Components emitted by value rather than by reference are listed in
  its `REACHABLE_BY_VALUE` with the reason for each.

## Forbidden ownership

- No engine semantics: nothing here parses a marking, evaluates a rule,
  resolves a layer, makes an access decision, or produces a conformance
  recording. The reference runner that executes the engine lives in the runtime repository.
- No dependency on an `@ezclassify/*` package built outside this repository, in
  any dependency field.
- No private, licensing, debug, admin, or entitlement surface in the OpenAPI
  document.
- No hand edits to any output in the table above.
- No reformatting of [`libs/types/src/`](libs/types/src/), [`libs/schemas/src/`](libs/schemas/src/), [`libs/openapi/src/`](libs/openapi/src/),
  the OpenAPI files, or the conformance corpus. The schema generator names
  anonymous structures after their source offsets, so a reflow renames
  published `$ref` identifiers. [`.prettierignore`](.prettierignore) records the full list.

## Required gates

- `npm run build` and `npm test`: the contract type-checks, every Vitest spec,
  and the freeze goldens for public exports, signatures, input schemas, and the
  wire contract.
- `npm run check:openapi`, `npm run check:spec`, and a clean tree after
  `npm run bundle`: the committed document and schemas match their sources and
  the document stays public.
- `node scripts/check-mirror-list.mjs`: every publishable package is on the
  mirror list and first-party ranges admit a prerelease.
- `npm run format:check` and `npm audit --audit-level=critical`.
- Review obligation: a new dependency in any package manifest here is checked by
  hand against the rule that this repository depends on no EzClassify package
  built elsewhere. No script enforces it.
