<picture>
  <source media="(prefers-color-scheme: dark)" srcset="assets/logo-dark.svg">
  <img alt="EzClassify" src="assets/logo.svg" width="220">
</picture>

# EzClassify Contracts

[![CI](https://github.com/ezclassify/contracts/actions/workflows/ci.yml/badge.svg)](https://github.com/ezclassify/contracts/actions/workflows/ci.yml)
[![npm](https://img.shields.io/npm/v/%40ezclassify%2Ftypes?label=%40ezclassify%2Ftypes)](https://www.npmjs.com/package/@ezclassify/types)
[![license: Apache-2.0](https://img.shields.io/badge/license-Apache--2.0-blue.svg)](LICENSE)
[![Node.js 22 | 24](https://img.shields.io/badge/node-22%20%7C%2024-339933.svg)](package.json)

Public contracts and validation tools for applications that connect to an
EzClassify runtime.

This repository holds the wire and definition types, the JSON Schemas derived
from them, the OpenAPI spec for the REST surface, the conformance corpus every
SDK is measured against, and a schema-only validator you can run on your own
documents. Its packages are Apache-2.0 licensed and depend only on one another and
third-party packages.

The engine that evaluates a scheme, the servers that host it, and the authoring
platform are separate and commercially licensed. Nothing here evaluates a rule,
resolves a layer, or makes an access decision.

## Packages

| Package                          | What it is                                                                                                       |
| -------------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| `@ezclassify/types`              | Hand-written TypeScript interfaces for every document and wire shape. The source of truth.                       |
| `@ezclassify/schemas`            | JSON Schemas for scheme, guide, access, context, and crosswalk documents, derived from the types.                |
| `@ezclassify/openapi`            | The OpenAPI document for the REST surface, plus the route declarations and HTTP body types it is generated from. |
| `@ezclassify/conformance`        | Test vectors: plans, reference fixtures, HTTP recordings, the golden wire corpus, per-SDK matrix.                |
| `@ezclassify/conformance-server` | Replays the wire corpus over real HTTP, so an SDK can be tested through its own HTTP stack.                      |
| `@ezclassify/validator`          | Schema-only document validation with a CLI.                                                                      |
| `@ezclassify/tsconfig`           | Shared TypeScript configuration.                                                                                 |

[`libs/openapi/openapi.yaml`](libs/openapi/openapi.yaml) is the REST contract. [`libs/openapi/openapi.json`](libs/openapi/openapi.json) beside it is the
same document restated as JSON for consumers that do not read YAML. Both ship
inside `@ezclassify/openapi` and are exported by name, so a consumer resolves
them rather than guessing at a path:

```js
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);

const spec = require('@ezclassify/openapi/openapi.json');
const yamlPath = require.resolve('@ezclassify/openapi/openapi.yaml');
```

The document is the artifact of record. A runtime proves its implemented surface
matches it; it is not a description of whatever a server happens to expose. It
is generated here, from the per-route declarations in [`libs/openapi/src/route-decls/`](libs/openapi/src/route-decls/)
and the same types this repository publishes. `npm run codegen` writes it, and
`npm run check:openapi` fails on any drift between the committed file and what
the declarations produce.

This repository also owns the publication rule. Everything in the
spec is public, and `npm run check:spec` holds it that way: the operation
surface is frozen in [`openapi-surface.txt`](openapi-surface.txt), licensing and debug namespaces are
refused outright, entitlement vocabulary may not appear anywhere a name is
declared, and no component may sit in the file with nothing referring to it.

That last rule has one exception, and it is spelled out rather than implied.
Some vocabulary is emitted by value instead of being pointed at by a schema: the
429 response every route can return comes from middleware that runs ahead of
dispatch, and a couple of published enums are switched on by SDK consumers
without the envelope typing a field as them. Those components are listed in
`REACHABLE_BY_VALUE` in [`scripts/check-public-spec.mjs`](scripts/check-public-spec.mjs), each with the reason it
cannot be reached by reference. The list is the record of which ones are
deliberate.

Adding a public operation is a deliberate act: run
`npm run check:spec -- --write` in the same commit. That also restates
[`libs/openapi/openapi.json`](libs/openapi/openapi.json) from the YAML, so the two never drift by hand.

## Validating a document

You do not need an EzClassify license, an account, or a network connection to
check that a scheme is well-formed.

```bash
npx @ezclassify/validator my-scheme.yaml
npx @ezclassify/validator schemes/          # walks a directory
npx @ezclassify/validator --kind guide g.yaml
```

It exits 0 when every document validates, 1 when validation fails or no
documents are found, and 2 for a usage error. What it checks is shape: required
fields, types, enums, and structure. What it cannot check is behavior: whether your rules fire the
way you meant, whether a layer composes as intended, whether an access policy
denies what you think it denies. Those answers come from a runtime.

## Using the types

```ts
import type { SchemeDefinition, ProcessResult } from '@ezclassify/types';
```

Almost everything here is a type. The package also ships a small set of pure
runtime helpers, listed on the `@ezclassify/types` front page and frozen in
[`libs/types/tests/fixtures/public-export-symbols.golden.json`](libs/types/tests/fixtures/public-export-symbols.golden.json), for the questions
a type cannot answer: `isContextAdapter` narrows an injected engine, and the
vocabulary and display helpers decide the word a surface shows. The three layers
to know about:

- `*Definition` shapes are what a customer writes on disk. These are the
  published contracts.
- Runtime shapes (`Scheme`, `Guide`, ...) are what an engine holds after
  loading, along with the in-process seams an engine plugs sources and
  processors into. They are tagged internal and left out of the published
  declarations. `@ezclassify/types/internal` carries them for EzClassify's own
  runtime packages, which install it at the same release-train version as
  everything else they ship with. It is not for use outside EzClassify, and
  its shapes change between releases without notice.
- View shapes (`SchemePublicView`, `ConceptView`, ...) are read-only projections
  a runtime hands back to UIs and remote clients.

## Conformance

[`libs/conformance/`](libs/conformance/) is data. Each plan is a list of method/argument/expected
vectors over synthetic reference documents; `matrix.json` says which plans each
SDK is expected to pass. An SDK author writes a runner in their own language
against this corpus.

The reference runner that produces the expected outputs is not here. It executes
the engine, so it lives with the engine.

[`libs/conformance/wire/v1/`](libs/conformance/wire/v1/) is the golden wire corpus: canonical request and
response pairs for every operation the REST contract serves, recorded off the
real runtime and schema-validated as they were recorded. Nothing in it was
authored by hand.

[`libs/conformance/cache/v1/`](libs/conformance/cache/v1/) is the response cache contract every REST client
follows, with plans that measure it in wire trips against that corpus.

You can run it as a server:

```bash
npx @ezclassify/conformance-server --port 4010
```

That answers real HTTP with the recorded responses and nothing else. It has no
engine in it, so a request the corpus does not contain gets a diagnostic instead
of an answer, which is enough to build and test an SDK against without a
license, and is deliberately not enough to be one.

## Contributing

See [CONTRIBUTING.md](./CONTRIBUTING.md) for how to propose a change, build the
repository, and run its gates.

## License

Apache-2.0. See [LICENSE](./LICENSE).

## API reference

The [reference guide](docs/API.md) covers package APIs and links the separate
maintainer source reference.
