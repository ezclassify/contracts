import { schemaReader, type SchemaNode } from './fragment';
import schema from '../generated/validation/v1/scheme.schema.json';

/**
 * Static scheme schema JSON for validating a complete scheme document.
 *
 * Root shape: `{ scheme: { id, version, name, data: { categories[], concepts[],
 * concept_imports[] }, rules[], rollup_pipelines[], parse: { recognizers[],
 * normalize[] }, render: { formats[] } } }`. Required top-level fields:
 * `scheme.id`, `scheme.version`, `scheme.name`, `scheme.data`.
 *
 * Used by the loader to validate a scheme YAML/JSON file before parsing. Works
 * in both Node and browser contexts: imported as a static JSON asset.
 */
export const schemeSchema = schema as Record<string, unknown>;

const reader = schemaReader(schema, 'definitions', 'scheme.schema.json');
const defs = reader.defs;

const schemeBlock = reader.resolve(
    reader.properties(schema, 'the root').scheme,
    'scheme',
);
const schemeProps = reader.properties(schemeBlock, 'scheme');
const dataProps = reader.properties(schemeProps.data, 'scheme.data');
const parseProps = reader.properties(schemeProps.parse, 'scheme.parse');
const renderProps = reader.properties(schemeProps.render, 'scheme.render');

/** The item schema of an array node, carrying the definitions it refers to. */
function itemFragment(node: unknown, at: string): SchemaNode {
    return { ...reader.items(node, at), $defs: defs, definitions: defs };
}

/**
 * Sub-schema for a single concept element within
 * `scheme.data.concepts[]`.
 *
 * Required fields: `id`, `name`, `views` (a string or an object with a `default`
 * key), and `categories` (at least one). `aliases` is optional. Used by
 * validators and Studio when editing or type-checking individual concepts in
 * isolation from the full scheme document.
 */
export const conceptSchema = itemFragment(
    dataProps.concepts,
    'scheme.data.concepts',
);

/**
 * Sub-schema for a single category element within `scheme.data.categories[]`.
 *
 * Required fields: `id`, `label`, `rollup`. `required` and `single` are optional. Used by
 * validators and Studio category editors when validating a category element in
 * isolation from the full scheme document.
 */
export const categorySchema = itemFragment(
    dataProps.categories,
    'scheme.data.categories',
);

/**
 * Sub-schema for a single exceptional recognizer within
 * `scheme.parse.recognizers[]`.
 *
 * Required fields: `id`, `pattern`, `format`, `binds`. Used by editors that
 * work on one recognizer in isolation from the full scheme document.
 */
export const recognizerSchema = itemFragment(
    parseProps.recognizers,
    'scheme.parse.recognizers',
);

/**
 * Sub-schema for a single render format within `scheme.render.formats[]`.
 *
 * Required fields: `id`, `mode`, `fields`, and exactly one of `surface` or
 * `surfaces`. The latter carries at least two scope IDs. Used by format editors
 * and validators.
 */
export const renderFormatSchema = itemFragment(
    renderProps.formats,
    'scheme.render.formats',
);

const schemeMetadataKeys = new Set([
    'id',
    'version',
    'name',
    'marking_scheme',
    'marking',
    'description',
    'definition',
    'guidance',
    'tier',
    'type',
    'layer',
    'role_aware',
    'ui',
    'vocabulary',
]);
const metadataProperties = Object.fromEntries(
    Object.entries(schemeProps).filter(([name]) =>
        schemeMetadataKeys.has(name),
    ),
);
/**
 * Sub-schema for metadata in the `scheme` top-level envelope. Policy and
 * rendering sections are validated by the complete scheme schema.
 *
 * Includes the fields declared by the canonical `SchemeBlock`, such as `id`,
 * `version`, `name`, `description`, `role_aware`, and `ui`. The
 * required fields are `id`, `version`, and `name`; optional metadata fields
 * retain their canonical property validators. Used for catalog listings and
 * layer header parsing.
 */
export const schemeMetaSchema = {
    ...schemeBlock,
    /** The scheme block's metadata properties, with their validators. */
    properties: metadataProperties,
    /** The scheme block's required fields that are metadata. */
    required: reader
        .required(schemeBlock, 'scheme')
        .filter((name) => schemeMetadataKeys.has(name)),
    /**
     * The same shared definitions, also under `$defs` for tools that look
     * there.
     */
    $defs: defs,
    /** Shared definitions that this fragment's `$ref`s point to. */
    definitions: defs,
};

/**
 * Sub-schema for the `scheme.parse` section, covering recognition policy,
 * exceptional recognizers, and normalize rules.
 *
 * Includes `recognizers[]` and `normalize[]` (repair rules). Used by the parser configuration validator and
 * editors that modify grammar settings independently of the full scheme
 * document.
 */
export const grammarSchema = {
    ...reader.resolve(schemeProps.parse, 'scheme.parse'),
    /**
     * The same shared definitions, also under `$defs` for tools that look
     * there.
     */
    $defs: defs,
    /** Shared definitions that this fragment's `$ref`s point to. */
    definitions: defs,
};

/**
 * Sub-schema for a single scheme rule within `scheme.rules[]`.
 *
 * Required fields: `id`, `action`. Used by rule editors and validators when
 * checking one rule in isolation from the full scheme document.
 */
export const schemeRuleSchema = itemFragment(schemeProps.rules, 'scheme.rules');

/**
 * Sub-schema for a single rollup pipeline entry within
 * `scheme.rollup_pipelines[]`.
 *
 * Required fields: `id`, `categories` (category IDs resolved together), `steps`
 * (ordered conditional step array). Used by validators and pipeline editors
 * when checking a pipeline rule in isolation.
 */
export const rollupPipelineSchema = itemFragment(
    schemeProps.rollup_pipelines,
    'scheme.rollup_pipelines',
);

/**
 * Sub-schema for a single normalize/repair rule within
 * `scheme.parse.normalize[]`.
 *
 * Required fields: `id`, `type` (one of `dedup | case`), `explanation`.
 * Canonical rewrite fields: `pattern` and `correction`. Used by validators and
 * repair-rule editors.
 */
export const repairRuleSchema = itemFragment(
    parseProps.normalize,
    'scheme.parse.normalize',
);

/**
 * All `$defs` from the scheme schema: shared type definitions referenced by
 * `$ref` in the sub-schemas above.
 *
 * Exported for consumers composing their own fragments. The fragments above
 * already carry both `$defs` and draft-07 `definitions` for their own refs.
 */
export { defs as schemaDefs };
