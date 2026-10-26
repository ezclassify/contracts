# @ezclassify/types

Canonical document, wire, and adapter interfaces shared by the EzClassify runtime, clients, and UI. This package declares contracts; it does not evaluate marking or access policy.

## Contents

- Adapter contracts all engine implementations satisfy: `SchemeEngineAdapter`, `GuideEngineAdapter`, `AccessEngineAdapter`, and the composed `ContextAdapter`. Each has a `Local` narrowing that returns values and a `Remote` narrowing that returns Promises; every method on a base contract works either way
- Input contracts (`SchemeDefinition`, `GuideDefinition`, `AccessDefinition`): the shapes expected for scheme/guide/access YAML/JSON documents
- View types (`SchemePublicView`, `SchemeMetaView`, `CategoryView`, `ConceptView`): typed read-only projections returned by engine operations
- Process/scan result types, assertion types, and diagnostic types
- A small set of runtime helpers, the only exports that are not types: `isContextAdapter` narrows an injected engine to the composed `ContextAdapter`; `resolveVocabulary`, `roleNoun`, and `referenceSurfaceLabel` (with the `GENERIC_ROLE_NOUNS` and `GENERIC_REFERENCE_SURFACE_NOUNS` fallbacks) decide the display word an artifact wears; `describeOutcome` renders a guide rule's outcome and `buildCategoryMap` indexes a flat marking by category. `toSecretDoc` and `readSecretDoc` encode and decode the canonical secret wire representation. These helpers ship here so producers and consumers use the same representation

The shapes are hand-written to match the wire format; no code generation required. The helpers are pure, dependency-free, and hold no state.

The package also has an `@ezclassify/types/internal` entry. It holds the in-memory shapes an engine works with after loading a document, and it exists for EzClassify's own runtime packages, which take it at the same release-train version as the rest of the release. It is not for use outside EzClassify: nothing in it is a published contract, and it changes between releases without notice. Type against the root entry.

## Install

```bash
npm install @ezclassify/types
```

The long-running operations take an optional `signal`, so the emitted
declarations reference the global `AbortSignal`. Node 22 and every current
browser provide it. If you compile against `"lib": ["ES2022"]` with no DOM lib
and no `@types/node`, add one of those or the declarations will not resolve
that name.

## Conditions over contributors

A boolean condition block can evaluate the same expression against each input
that contributed to an aggregate:

```yaml
when:
    target: contributors
    quantifier: any
    all:
        - { category: level, operator: min_order, value: 1 }
        - { category: handling, operator: not_has_concept, value: SHARE }
```

Both predicates must match the same contributor. `quantifier` combines the
per-contributor results using `any`, `all` (the default), or `none`. Missing or
empty contributor sets never satisfy a contributor block. The quantifier is
valid only with `target: contributors`; the runtime rejects other combinations.
A leaf condition with `target: contributors` requires every contributor to
satisfy it.

## License

Apache-2.0. See [LICENSE](./LICENSE).
