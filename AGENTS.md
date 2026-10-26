# Agent Instructions

## Standards

Read [`STANDARDS.md`](./STANDARDS.md) before any feature, refactor,
architectural decision, or task longer than 30 minutes. These engineering
standards apply to you as they do to any contributor. Skip for quick bug fixes,
typos, and documentation-only changes.

Read [`ARCHITECTURE.md`](./ARCHITECTURE.md) before changing a published type,
schema, the OpenAPI document, the conformance corpus, a generator, or the
dependency direction between packages.

Read [`CONTRIBUTING.md`](./CONTRIBUTING.md) for the command set and the gates CI
runs.

## What this repository is

The public EzClassify contract: the wire and definition types
(`@ezclassify/types`), the JSON Schemas derived from them
(`@ezclassify/schemas`), the OpenAPI document for the REST surface
(`@ezclassify/openapi`), the conformance corpus (`@ezclassify/conformance`), a
server that replays that corpus over HTTP (`@ezclassify/conformance-server`),
a schema-only validator (`@ezclassify/validator`), and the shared TypeScript
configuration (`@ezclassify/tsconfig`). It describes documents and the wire. It
evaluates nothing.

## Three rules that are not negotiable

1. **No dependency on another EzClassify package.** This repository is public
   and Apache-2.0, and it is the bottom of the dependency graph. Its packages
   may depend on third-party packages and on each other, never on an
   `@ezclassify/*` package built somewhere else: not in `dependencies`, not in
   `devDependencies`, not vendored.
2. **No engine semantics.** Nothing here parses a marking, evaluates a rule,
   resolves a layer, or makes an access decision. The conformance recordings
   and the wire corpus are produced by a runtime and committed here as data.
3. **Generated files come from their generators.** [`libs/schemas/generated/`](libs/schemas/generated/),
   [`libs/openapi/openapi.yaml`](libs/openapi/openapi.yaml), [`libs/openapi/openapi.json`](libs/openapi/openapi.json),
   [`libs/openapi/scripts/components.generated.yaml`](libs/openapi/scripts/components.generated.yaml),
   [`packages/validator/src/generated/`](packages/validator/src/generated/), and each package's
   `THIRD-PARTY-NOTICES.md` are regenerated, never hand-edited. Change the
   source and regenerate in the same commit. The CI drift checks fail
   otherwise.

## Build and test

```bash
npm run deps:relock
npm ci
npm run build
npm test
npm run format:check
```

[`CONTRIBUTING.md`](CONTRIBUTING.md) lists every command and the full set of CI gates.
