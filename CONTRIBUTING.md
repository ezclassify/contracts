# Contributing to EzClassify contracts

Thanks for your interest in contributing. This page covers how to propose a
change and how to build and check the repository. What each package owns, and
which files are generated from which, is in [`ARCHITECTURE.md`](ARCHITECTURE.md).

## Before You Start

1. **Sign off your commits.** Contributions come in under the
   [Developer Certificate of Origin](https://developercertificate.org/), so
   every commit carries a `Signed-off-by` line. `git commit -s` adds it. There
   is no agreement to sign and nothing to send.
2. **Fork the repository.** All contributions come through pull requests from
   forks.
3. **Open an issue first** for non-trivial changes. A change to a published
   type, schema, or the OpenAPI document reaches every client repository, so it
   is worth agreeing on the shape before writing it.

## Development

Use Node.js 22 or 24. Nothing here needs an EzClassify license, an
account, or a running server.

```bash
npm run deps:relock
npm ci
npm run build     # types, then schemas, then OpenAPI
npm test
```

The lockfile is not committed, so `npm run deps:relock` creates one from an
empty dependency tree and `npm ci` installs exactly that. It resolves only
versions published at least seven days ago, then fails if any package in the
lockfile is younger than that or resolves from a machine-local registry.

[`libs/schemas/generated/`](libs/schemas/generated/) is generated from the types by `npm run bundle` and is
committed on purpose, so language generators downstream can consume it and drift
shows up as a diff in review.

### Commands

| Command                           | What it does                                                                                                                                                                                                                                                                     |
| --------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `npm run build`                   | Builds `@ezclassify/types`, then `@ezclassify/schemas` (which regenerates [`libs/schemas/generated/`](libs/schemas/generated/)), then `@ezclassify/openapi`.                                                                                                                     |
| `npm test`                        | Type-checks the contract, the OpenAPI package and the replay server, then runs every Vitest spec.                                                                                                                                                                                |
| `npm run bundle`                  | Regenerates [`libs/schemas/generated/`](libs/schemas/generated/) from the types.                                                                                                                                                                                                 |
| `npm run codegen`                 | Regenerates [`libs/openapi/openapi.yaml`](libs/openapi/openapi.yaml), [`libs/openapi/openapi.json`](libs/openapi/openapi.json) and [`libs/openapi/scripts/components.generated.yaml`](libs/openapi/scripts/components.generated.yaml) from the route declarations and the types. |
| `npm run check:openapi`           | Fails if the committed OpenAPI document differs from what the route declarations produce. Writes nothing.                                                                                                                                                                        |
| `npm run check:spec`              | Checks the OpenAPI document is public: frozen operation surface, no reserved namespaces, no entitlement vocabulary, no unreachable component.                                                                                                                                    |
| `npm run docs:check`              | Fails if any exported declaration, member or parameter of a published package lacks a doc comment. Writes nothing.                                                                                                                                                               |
| `npm run check:schemas`           | Fails if [`libs/schemas/generated/`](libs/schemas/generated/) differs from a fresh generation. Writes nothing.                                                                                                                                                                   |
| `npm run notices`                 | Regenerates each package's `THIRD-PARTY-NOTICES.md` from its production dependency tree. `npm run check:notices` checks them without writing.                                                                                                                                    |
| `npm run validate -- <path>`      | Runs the schema-only validator CLI on a document or a directory.                                                                                                                                                                                                                 |
| `npm run format:check`            | Prettier, as CI runs it. `npm run format` rewrites.                                                                                                                                                                                                                              |
| `npm run deps:relock`             | Deletes `node_modules` and the lockfile, resolves a new lockfile from versions published at least seven days ago, then runs the two checks below.                                                                                                                                |
| `npm run check:lockfile-portable` | Fails if the lockfile resolves anything from a machine-local registry.                                                                                                                                                                                                           |
| `npm run check:dependency-age`    | Fails if any registry package in the lockfile was published less than seven days ago. Contracts packages are workspace links and are not checked.                                                                                                                                |

The validator's precompiled schema validators in
[`packages/validator/src/generated/`](packages/validator/src/generated/) come from
`npm run generate:standalone -w @ezclassify/validator`; the test suite fails if
they are stale.

### What CI runs

Every push and pull request runs, on Node 22 and 24: the install above,
`npm run check:dependency-age` (Node 22 only), `npm run build`, `npm test`,
`node scripts/check-mirror-list.mjs`, `npm run check:spec`,
`npm run docs:check`, `npm run check:openapi`, `npm run bundle` followed by a clean-tree check,
`npm run format:check`, the validator CLI against a shipped example, and
`npm audit --audit-level=critical`. Run the same commands before you open a
pull request.

## Generated references

Run `npm run docs` to write the public API reference to `docs/api/index.html`.
Run `npm run docs:source` to write the separate maintained-source reference to
`docs/source/index.html`. Both commands use pinned npm tools; generated HTML is
local build output. See [the reference guide](docs/API.md) for coverage and
source exclusions.

## Pull Request Expectations

- **Bring tests.** New behavior needs tests; a bug fix needs a regression test
  that fails without the fix. The suite is Vitest (`npm test`).
- **Regenerate in the same commit.** A change to a type that feeds the schemas
  or the OpenAPI document includes the regenerated files. Never hand-edit
  [`libs/schemas/generated/`](libs/schemas/generated/), [`libs/openapi/openapi.yaml`](libs/openapi/openapi.yaml), [`libs/openapi/openapi.json`](libs/openapi/openapi.json), or
  [`packages/validator/src/generated/`](packages/validator/src/generated/).
- **Add public operations on purpose.** A new or renamed operation fails
  `npm run check:spec` until you run `npm run check:spec -- --write` in the same
  commit, which updates [`openapi-surface.txt`](openapi-surface.txt) and restates [`libs/openapi/openapi.json`](libs/openapi/openapi.json).
- **Keep goldens deliberate.** The public export and signature goldens under
  [`libs/types/tests/fixtures/`](libs/types/tests/fixtures/) and the input-schema golden under
  [`libs/schemas/tests/fixtures/`](libs/schemas/tests/fixtures/) change only with a deliberate contract change.
  Do not regenerate one to silence a failure you have not explained.
- **Decide nothing.** This repository describes documents and the wire. A
  change that evaluates a rule, resolves a layer, or makes an access decision
  belongs in a runtime, not here.
- **Read the standards.** Engineering standards for design, code quality,
  testing, and decision-making are in [`STANDARDS.md`](STANDARDS.md); read it
  before any significant work.

## Commit Messages

Use conventional commits (`fix:`, `feat:`, `docs:`) and sign off each one with
`git commit -s`.

## Security

Do not open public issues for vulnerabilities. Follow
[`SECURITY.md`](SECURITY.md) for the disclosure process.

## Code of Conduct

This project follows the [Code of Conduct](https://github.com/ezclassify/ezclassify/blob/main/CODE_OF_CONDUCT.md). By
participating, you agree to uphold it.
