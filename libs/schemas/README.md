# @ezclassify/schemas

Language-neutral spec bundle for EzClassify. Provides the JSON schemas consumed
by other-language SDK generators and documentation tooling.

## What ships

```
generated/json-schemas/         result schemas: the shapes a REST client receives
generated/json-schemas-input/   input schemas: the documents you author
generated/json-schemas-test/    scheme test output: a saved suite run and the
                                operation results its expectations check
dist/lib/                       the document schemas as objects, ESM and CJS
```

Every [`generated/`](generated/) set is produced from the TypeScript interfaces in
`@ezclassify/types`, so they always describe the same shapes the types do.

## Install

```sh
npm install @ezclassify/schemas
```

## Usage

```ts
import { schemeSchema, guideSchema } from '@ezclassify/schemas';
```

Each family also has its own subpath, so a consumer that wants one schema does
not pull the whole bundle:

```ts
import { crosswalkSchema } from '@ezclassify/schemas/crosswalk-schema';
```

The document families are `./scheme-schema`, `./guide-schema`,
`./access-schema`, `./context-schema` and `./crosswalk-schema`.

`./test-suite-schema` additionally exports `testSuiteSchema` for portable test
suite input, `testOperationResultsSchema` for operation expectations, and
`testSuiteRunSchema` for saved reports. Runtime runners own the suite's semantic
inheritance and operation checks.

Guide descriptions are optional in the canonical input types, generated input
schema, and v1 document validator. When present, `description` must be a string.
`guideRuleSchema` validates one inline guide rule, including its required
outcome and nested references. Validate the enclosing `guide.rules` block
through `guideSchema`.

## License

Apache-2.0. See [LICENSE](./LICENSE).
