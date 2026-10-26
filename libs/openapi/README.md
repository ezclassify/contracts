# @ezclassify/openapi

The OpenAPI document for the EzClassify REST surface, and the declarations it is
generated from.

```js
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);

const spec = require('@ezclassify/openapi/openapi.json');
const yamlPath = require.resolve('@ezclassify/openapi/openapi.yaml');
```

[`openapi.yaml`](openapi.yaml) is the contract. [`openapi.json`](openapi.json) beside it is the same document
restated as JSON for consumers that do not read YAML. Both are exported by name,
so you resolve them instead of guessing at a path inside the package.

The document is the artifact of record rather than a description of whatever a
server happens to expose: a runtime proves its implemented surface matches it.
Everything in it is public. Licensing and debug namespaces are refused, the
operation list is frozen, and components must be reachable by schema reference
or explicitly declared as vocabulary emitted by value. The exceptions and their
reasons are listed in `REACHABLE_BY_VALUE` in
[`scripts/check-public-spec.mjs`](../../scripts/check-public-spec.mjs).

## How it is generated

Each operation has a declaration file under [`src/route-decls/`](src/route-decls/) carrying its
method, path, summary, description, errors, and the request and response types.
[`src/wire.ts`](src/wire.ts) holds those HTTP body types. The generator reads both and writes
the two documents; nothing in them is hand-edited.

That makes the TypeScript types the canonical source for every body shape in
the contract. A change to a body type is a change to the published document,
and the repository's checks fail on any drift between the two.

## Subpaths

| Subpath                          | Resolves to                                        |
| -------------------------------- | -------------------------------------------------- |
| [`./openapi.yaml`](openapi.yaml) | The contract.                                      |
| [`./openapi.json`](openapi.json) | The same document as JSON.                         |
| `./wire`                         | The HTTP body types. Types only, no runtime value. |

`./wire` carries types and nothing else; import it with `import type`. The
route declarations are generator input and are not published.

## License

Apache-2.0. See [LICENSE](./LICENSE).
