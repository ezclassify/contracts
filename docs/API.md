# Contract reference

This repository publishes EzClassify's shared document and wire contracts,
schema assets, structural validators, and recorded conformance data. It does
not evaluate markings or make access decisions.

## Generate and browse

After installing dependencies, run `npm run docs` and open
`docs/api/index.html`. TypeDoc reads the maintained package entrypoints below.
The validator and replay server publish handwritten declarations alongside
plain ESM implementations; their API reference reads those declarations.

`npm run docs:check` runs the same reference build without writing it and
fails when an exported declaration, member or parameter of a published package
has no doc comment. CI runs it on every push. Two kinds of member are outside
its reach. The members of a constant typed by a JSON import are schema data,
documented by the schema's own `description` fields, so the reference shows
such a constant without its structure and the published schema file carries
it. And a few members whose comment TypeDoc cannot attach where its check
looks for one, such as a method kept through `Omit`, are listed in
`intentionallyNotDocumented` in [`typedoc.json`](../typedoc.json); each still has its comment.

`npm run docs:source` separately writes `docs/source/index.html` for maintained
TypeScript and ESM source modules and maintenance scripts. It includes internal
exports that are not supported package subpaths. Tests, generated validators,
build output, dependency trees, and JSON/YAML data assets are excluded from
source-symbol documentation. Schema and corpus data remain available through
the package paths and guides below. TypeDoc does not document shell workflows
or verify implementation semantics.

The source reference parses a combined JavaScript/TypeScript program without
compiler diagnostic checking. Its `allowJs` context differs from the native
OpenAPI generator project: a valid native `@ts-expect-error` on the JavaScript
import becomes unused when TypeDoc includes that JavaScript source. Native
`npm test` and package type checks remain the compiler gates.

Both commands fetch pinned TypeDoc and TypeScript tools through npm when they
are not cached. Generated HTML stays local and does not change shipped package
payloads. Runtime-model types marked internal remain visible in this repository
reference so maintainers can inspect the complete exported type model; the
annotation does not turn them into wire contracts.

Canonical comments also refer to runtime-owned `Context`,
`Context.fromComponents`, `loadContextsFile`, and `MappedConceptSource`. Those
symbols have no public implementation reference in this repository and render
as plain text. Link validation is disabled for these canonical comments; emitted
local file links are checked separately. Frozen source offsets are retained
because they participate in generated schema identities.

## Package surfaces

| Package                          | Reference coverage and use                                                                                                           |
| -------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| `@ezclassify/types`              | Root exports: authoring definitions, runtime model types, public views, adapter contracts, display helpers, and secret serialization |
| `@ezclassify/schemas`            | Browser-safe root exports and `./test-suite-schema`; individual document-schema subpaths include additional fragment exports         |
| `@ezclassify/openapi`            | `./wire` request/response declarations; the generated REST document is published as `./openapi.yaml` and `./openapi.json`            |
| `@ezclassify/validator`          | Root document/file validation API and `./scheme`, `./guide`, `./access`, `./context`, and `./crosswalk` structural checks            |
| `@ezclassify/conformance-server` | Root replay-server lifecycle, corpus loading, canonicalization, simulated authentication, and integration scenario API               |
| `@ezclassify/conformance`        | Data package; see its [corpus guide](../libs/conformance/README.md) rather than a callable API                                       |
| `@ezclassify/tsconfig`           | Shared compiler configuration; see its [package guide](../packages/tsconfig/README.md)                                               |

## Choose a contract layer

Authoring definitions describe the YAML/JSON envelope a customer writes. Runtime
model types describe loaded representations. Public views describe the
projections an engine or REST service returns. Adapter interfaces state the
operations a local or remote implementation supports. These roles are distinct:
a runtime model is not automatically valid input to a document loader.

Schemas expose static document schemas and extracted fragments, and every
module is browser-safe. Generated schemas under `json-schemas/` describe the
results a REST client receives, `json-schemas-input/` the authored documents,
and `json-schemas-test/` the scheme test runner's saved run and operation
results.
Their maintained sources and generation commands are recorded in
[ARCHITECTURE.md](../ARCHITECTURE.md).

The validator checks structure against the published schema and adds authored
format and rule-reference checks. A successful result does not prove that a
scheme's rules produce the intended marking. Validation returns `errors` and
`warnings`; `ok` reflects the errors. The licensed runtime owns semantic
execution.

The conformance server replays a finite corpus or a named integration scenario.
Its simulated authentication and deliberate transport failures are test tools,
not a production security boundary or a complete runtime. Use `stop()` to close
its listeners after a harness run. The [replay-server guide](../packages/conformance-server/README.md)
describes HTTP behavior and local integration setup.

See [CONTRIBUTING.md](../CONTRIBUTING.md) for build, schema freshness, OpenAPI,
public-surface, and native test commands. Generated schemas, recordings, and
vendored copies must be updated through their owning generators.
