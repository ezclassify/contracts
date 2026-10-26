/**
 * `@ezclassify/schemas`: JSON Schema assets derived from `@ezclassify/types`.
 *
 * The TypeScript interfaces in `@ezclassify/types` are the single source of
 * truth for every document contract (scheme, guide, access, context). This
 * package turns those interfaces into language-neutral JSON Schemas so non-TS
 * consumers (Python, the OpenAPI spec, external validators) can validate the
 * same documents.
 *
 * Pipeline (`libs/schemas/build.mjs`): `ts-json-schema-generator` reads each
 * input interface and emits a JSON Schema into `generated/json-schemas-input/`. The
 * published document-validation views in `generated/validation/v1/` add the
 * schema-only constraints and stable definition names declared in
 * `validation-schema.mjs`. Do not hand-edit generated assets: edit the source
 * types or those refinements and re-run the build.
 *
 * This entry point is browser-safe: it re-exports the static schema objects and
 * their extracted sub-schemas (per concept, category, rule, etc.) with no
 * `fs`/`path` dependency.
 */

// Browser-safe entry, no fs/path dependencies
export {
    schemeSchema,
    conceptSchema,
    categorySchema,
    recognizerSchema,
    renderFormatSchema,
    schemeMetaSchema,
    grammarSchema,
    schemeRuleSchema,
    schemaDefs,
} from './scheme-schema';
export {
    guideSchema,
    guideMetaSchema,
    guideRuleSchema,
    guideCategorySchema,
    guideDependencySchema,
    guideSchemaDefs,
} from './guide-schema';
export {
    accessSchema,
    accessMetaSchema,
    accessRuleSchema,
    accessSchemaDefs,
} from './access-schema';
export {
    contextSchema,
    contextComponentRefSchema,
    contextSchemaDefs,
} from './context-schema';
export {
    crosswalkSchema,
    crosswalkMappingSchema,
    crosswalkSchemeDependencySchema,
    crosswalkSchemaDefs,
} from './crosswalk-schema';
