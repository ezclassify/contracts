/**
 * `@ezclassify/types`: the canonical type model shared across every engine
 * implementation, client, and tool. These interfaces are the single source of
 * truth: the JSON Schemas in `@ezclassify/schemas` and the OpenAPI spec are
 * derived from them, never the other way around.
 *
 * The model is organized around three layers per artifact:
 *
 * - Authoring input (`*Definition` / `*Doc`): the on-disk YAML/JSON shape a
 *   customer writes. `SchemeDefinition`, `GuideDefinition`, `AccessDefinition`,
 *   and `ContextDefinition` are the published, `@public` wire contracts. Field
 *   names mirror the YAML (snake_case, document envelopes intact).
 * - Runtime (`Scheme`, `Guide`, `AccessPolicy`, ...): the resolved, flattened
 *   shape the engine holds in memory after loading. They carry post-load detail
 *   (resolved positions/ranks, expanded rules) that is not part of any external
 *   contract, so they are tagged internal and left out of the published
 *   declarations.
 * - Read views (`SchemePublicView`, `ConceptView`, `CategoryView`,
 *   `SchemeMetaView`, ...): typed read-only projections an engine returns to
 *   UIs and remote clients, free of internal rule-evaluation structures.
 *
 * Cross-cutting groups:
 *
 * - Engine surface (`engine.ts`): the adapter contracts every engine satisfies.
 *   One base interface per family (`SchemeEngineAdapter`, `GuideEngineAdapter`,
 *   `AccessEngineAdapter`, and the composed `ContextAdapter`), each with a
 *   `Local` narrowing that returns values and a `Remote` narrowing that returns
 *   Promises. Every method on a base contract works in both modes, so a UI
 *   cannot tell an in-process engine from an HTTP client.
 * - External sources (`external-source.ts`, `auth.ts`, `secret-doc.ts`): the
 *   declarative source documents an artifact references, the resolved secret
 *   shapes, and the codec that carries a secret between processes. The
 *   in-process seams behind them (`source.ts`, `broker-source.ts`,
 *   `local-engine.ts`: source readers, brokers, timing telemetry and marking
 *   processors) carry functions across the boundary and are tagged internal.
 * - Composition (`context.ts`, `context-definition.ts`, `layer.ts`): `Context`
 *   pins a scheme, guides, an access policy, and optional directional
 *   crosswalks into one immutable, versioned bundle. Any of those references
 *   may carry layers; `layer.ts` states once how a layer binds and merges in
 *   every family that has one.
 * - Readiness (`readiness.ts`): the closed set of warning codes a runtime
 *   replica reports on its readiness probe without leaving traffic.
 * - Display helpers (`vocabulary.ts`, `display.ts`): the handful of pure
 *   functions every surface applies to the shapes above before showing them.
 *   Vocabulary resolution decides the word an artifact wears; the rest derive a
 *   display string or a category index. They live here so a UI, a client, and
 *   an engine all reach the same answer for the same input.
 *
 * Almost every export is a type. The exceptions are functions, because a few
 * questions only runtime code can answer: `isContextAdapter` tells a composed
 * Context from a bare scheme engine, the display helpers turn a published
 * shape into the form a surface shows, and `toSecretDoc` and `readSecretDoc`
 * carry a resolved secret between processes.
 *
 * @packageDocumentation
 */

// Specifiers carry the `.js` extension because tsc emits them verbatim and the
// published package is Node ESM, where an extensionless relative specifier does
// not resolve. Type-only re-exports are erased and would survive without it;
// they keep it so the one line that does emit is not the odd one out.
export type * from './scheme.js';
export type * from './scheme-definition.js';
export type * from './guide.js';
export type * from './guide-definition.js';
export type * from './access.js';
export type * from './access-definition.js';
export * from './engine.js';
export type * from './local-engine.js';
export * from './vocabulary.js';
export * from './display.js';
export type * from './format-coverage.js';
export type * from './layer.js';
export type * from './context.js';
export type * from './context-definition.js';
export type * from './crosswalk.js';
export type * from './external-source.js';
export type * from './views.js';
export type * from './source.js';
export type * from './broker-source.js';
export type * from './provenance.js';
export type * from './readiness.js';
export type * from './document.js';
export type * from './auth.js';
export * from './secret-doc.js';
export type * from './test-suite.js';
