import { schemaReader } from './fragment';
import schema from '../generated/validation/v1/guide.schema.json';

/**
 * Static guide schema JSON for validating a complete guide document.
 *
 * Root shape: `{ guide: { id, version, name, targetSchemes: [...], rules: {
 * inline?: [...], external?: [...] } } }`. Required guide fields: `id`,
 * `version`, `name`, `targetSchemes` (at least one entry), and `rules`.
 * `description` is optional.
 *
 * Used by the guide loader to validate a guide YAML/JSON file before parsing.
 * Works in both Node and browser contexts: imported as a static JSON asset.
 */
export const guideSchema = schema as Record<string, unknown>;

const reader = schemaReader(schema, '$defs', 'guide.schema.json');
const defs = reader.defs;
const guideMetadataKeys = new Set([
    'id',
    'version',
    'name',
    'description',
    'targetSchemes',
    'vocabulary',
    'type',
    'layer',
]);
const guideBlock = reader.resolve(
    reader.properties(schema, 'the root').guide,
    'guide',
);
const guideProperties = reader.properties(guideBlock, 'guide');
/**
 * Sub-schema for guide metadata and target-scheme dependencies. Rule and
 * category bodies belong to the complete guide schema.
 *
 * Required identity and target-scheme fields retain their canonical validators,
 * as do optional description, vocabulary, and layer fields.
 */
export const guideMetaSchema = {
    ...guideBlock,
    /** The guide block's metadata properties, with their validators. */
    properties: Object.fromEntries(
        Object.entries(guideProperties).filter(([name]) =>
            guideMetadataKeys.has(name),
        ),
    ),
    /** The guide block's required fields that are metadata. */
    required: reader
        .required(guideBlock, 'guide')
        .filter((name) => guideMetadataKeys.has(name)),
    /** Shared definitions that this fragment's `$ref`s point to. */
    $defs: defs,
};

/**
 * Sub-schema for a single guide rule, resolved from `$defs.guide_rule`.
 *
 * Required fields: `id`, `name`, `outcome` (at least one of `rendered` or
 * `concepts`). Optional: `keywords`, `match[]`, `category`, `when`,
 * `overrides[]`. Used by guide-rule validators and Studio when editing or
 * type-checking individual guide rules.
 */
export const guideRuleSchema = {
    ...reader.definition('guide_rule'),
    /** Shared definitions that this fragment's `$ref`s point to. */
    $defs: defs,
};

/**
 * Sub-schema for a single guide category section, resolved from
 * `$defs.guide_category`.
 *
 * Required fields: `id`, `label`. Optional: `description`. Used by guide
 * category editors and validators when checking section groupings in isolation
 * from the full guide document.
 */
export const guideCategorySchema = {
    ...reader.definition('guide_category'),
    /** Shared definitions that this fragment's `$ref`s point to. */
    $defs: defs,
};

/**
 * Sub-schema for a single `targetSchemes` dependency entry, resolved from
 * `$defs.guide_dependency`.
 *
 * Required field: `id` (scheme ID). Optional: `version` (semver constraint
 * string or `'*'` for any version). Used when validating or building the
 * target-scheme dependency list for a guide.
 */
export const guideDependencySchema = {
    ...reader.definition('guide_dependency'),
    /** Shared definitions that this fragment's `$ref`s point to. */
    $defs: defs,
};

/**
 * All `$defs` from the guide schema: shared definitions referenced by `$ref` in
 * the sub-schemas above (includes `guide_rule`, `guide_category`,
 * `guide_dependency`).
 *
 * Inject into custom JSON Schema validators when resolving `$ref` pointers
 * within guide document fragments.
 */
export { defs as guideSchemaDefs };
