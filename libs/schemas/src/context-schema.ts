import { schemaReader } from './fragment';
import schema from '../generated/json-schemas-input/context-definition.schema.json';

/**
 * Static context schema JSON for validating a Context YAML/JSON document.
 *
 * Root shape: `{ context: { id, version, scheme: { id, version, layers? }, ...
 * } }`. The on-disk Context YAML wraps the body in a top-level `context:` key.
 * Required inner fields are `id`, `version`, `scheme.id`, `scheme.version`.
 * Optional inner fields: `description`, `guides[]`, `access`, and
 * `crosswalks[]`.
 *
 * Every one of those references takes the same shape: an `id` + `version` with
 * an optional `layers[]` nested inside it. Layers are never a top-level
 * sibling, because a layer is a derivative of the one artifact it names.
 *
 * Generated from `ContextDefinition` in `@ezclassify/types`, so the schema and
 * the type are one contract. Works in both Node and browser contexts.
 */
export const contextSchema = schema as Record<string, unknown>;

const reader = schemaReader(
    schema,
    'definitions',
    'context-definition.schema.json',
);
const defs = reader.defs;

/**
 * Sub-schema for a single `{ id, version }` component reference: a layer
 * reference nested inside a scheme, guide, crosswalk or access reference. Both
 * `id` and `version` are required; `version` may be a semver string or the
 * literal `'latest'`.
 */
export const contextComponentRefSchema = {
    ...reader.definition('ComponentRef'),
    /** Shared definitions that this fragment's `$ref`s point to. */
    definitions: defs,
};

/**
 * Sub-schema for the Context's `scheme:` reference: a component reference with
 * an optional `layers[]` array nested inside.
 */
export const contextSchemeRefSchema = {
    ...reader.definition('ContextSchemeRef'),
    /** Shared definitions that this fragment's `$ref`s point to. */
    definitions: defs,
};

/**
 * Sub-schema for one entry of the Context's `guides[]` list: a component
 * reference with an optional `layers[]` array nested inside.
 */
export const contextGuideRefSchema = {
    ...reader.definition('ContextGuideRef'),
    /** Shared definitions that this fragment's `$ref`s point to. */
    definitions: defs,
};

/**
 * Sub-schema for one entry of the Context's `crosswalks[]` list: a component
 * reference with an optional `layers[]` array nested inside.
 */
export const contextCrosswalkRefSchema = {
    ...reader.definition('ContextCrosswalkRef'),
    /** Shared definitions that this fragment's `$ref`s point to. */
    definitions: defs,
};

/**
 * Sub-schema for the Context's `access:` reference: a component reference with
 * an optional `layers[]` array nested inside.
 */
export const contextAccessRefSchema = {
    ...reader.definition('ContextAccessRef'),
    /** Shared definitions that this fragment's `$ref`s point to. */
    definitions: defs,
};

/**
 * Sub-schema for the body inside the `context:` envelope, `ContextBlock`. Use
 * it to validate a Context body that has already been taken out of its
 * envelope.
 */
export const contextBlockSchema = {
    ...reader.definition('ContextBlock'),
    /** Shared definitions that this fragment's `$ref`s point to. */
    definitions: defs,
};

/**
 * Every named definition of the context schema: `ComponentRef`, the four
 * per-family references and `ContextBlock`. Inject into a validator when
 * resolving the `$ref`s of a fragment validated in isolation.
 */
export { defs as contextSchemaDefs };
