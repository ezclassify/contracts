# @ezclassify/validator

Checks that an EzClassify document is well-formed, against the same JSON
Schemas the product publishes. No license, no account, and no network.

```bash
npx @ezclassify/validator my-scheme.yaml
npx @ezclassify/validator schemes/          # walks a directory
npx @ezclassify/validator --kind guide g.yaml
```

It reads the kind off the document's envelope key, so a scheme file
(`scheme:`), a guide (`guide:`), an access policy (`access:`), a context
(`context:`), and a crosswalk (`crosswalk:`) all validate without being told
which is which. `--kind` forces one when you want a file checked as something
it does not announce.

Directories are walked recursively. A file inside one that carries no
recognized envelope is skipped, because a scheme folder legitimately holds
other YAML and JSON. A file you name explicitly is always validated, so you
always get an answer about the file you asked about.
Malformed YAML or JSON inside a walked directory is reported as a failure:
its envelope cannot be checked until it parses.

## What it checks, and what it does not

It checks required fields, types, enums, and document structure. Scheme checks
also report invalid rule-field combinations and authored-format plan problems,
such as references or delimiters that cannot describe usable output. Findings
include a document pointer; errors fail validation, while warnings leave an
otherwise valid document accepted.

It does not check behavior. Whether your rules fire the way you meant, whether
a layer composes the way you intended, whether an access policy denies what you
think it denies: those are questions for a runtime, and no schema can answer
them. Nothing in this package loads a scheme, resolves a layer, evaluates a
rule, or makes an access decision.

## Exit codes

| Code | Meaning                                                     |
| ---- | ----------------------------------------------------------- |
| `0`  | Every document validated.                                   |
| `1`  | At least one document failed, or no documents were found.   |
| `2`  | Usage error: an unknown option, a bad `--kind`, no targets. |

A mistyped path is reported as a failed document rather than ending the run, so
one bad argument does not hide the answer for everything else you named.

## As a library

```js
import { validateFile, validateTargets } from '@ezclassify/validator';

const result = validateFile('my-scheme.yaml');
// { file, ok, kind, errors: [{ path, message }], warnings: [] }
```

## License

Apache-2.0. See [LICENSE](./LICENSE).
