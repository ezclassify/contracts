import { schemaReader } from './fragment';
import schema from '../generated/validation/v1/access.schema.json';

/**
 * Static access policy schema JSON for validating a complete access policy
 * document.
 *
 * Root shape: `{ access: { id, targetScheme: { id }, rules: { inline?: [...],
 * external?: [...] } } }`. Required top-level fields: `access.id`,
 * `access.targetScheme.id`, `access.rules`. The `targetScheme` field pins which
 * marking scheme this policy governs.
 *
 * Used by `AccessEngine.fromJSON()` to validate an access policy before
 * loading. Works in both Node and browser contexts: imported as a static JSON
 * asset.
 */
export const accessSchema = schema as Record<string, unknown>;

const reader = schemaReader(schema, 'definitions', 'access.schema.json');
const defs = reader.defs;

const envelopeProps = reader.properties(
    reader.definition('AccessPolicyEnvelope'),
    'AccessPolicyEnvelope',
);
const ruleEntry = reader.items(
    reader.properties(envelopeProps.rules, 'access.rules').inline,
    'access.rules.inline',
);
const metadataKeys = new Set([
    'id',
    'version',
    'name',
    'description',
    'targetScheme',
]);

/**
 * Sub-schema for access policy root metadata (id, version, name, description,
 * targetScheme). Sourced from AccessPolicyEnvelope inside the
 * access.schema.json definitions.
 */
export const accessMetaSchema: Record<string, unknown> = {
    type: 'object',
    definitions: defs,
    properties: Object.fromEntries(
        Object.entries(envelopeProps).filter(([name]) =>
            metadataKeys.has(name),
        ),
    ),
};

/**
 * Sub-schema for a single access rule entry within `access.rules.inline[]`.
 *
 * Required fields: `id`, `name`. Optional simple-mapping fields include
 * `attribute`, `categoryId`, and `strategy`; cross-source rules use `check`.
 * Semantic rule requirements remain runtime-owned. Used when validating
 * individual access rules in isolation (e.g., Studio's AccessBuilder editor).
 */
export const accessRuleSchema: Record<string, unknown> = {
    ...ruleEntry,
    definitions: defs,
};

/**
 * All `definitions` from the access schema: includes `AccessPolicyEnvelope`,
 * `AccessRuleEntry`, and their sub-schemas.
 *
 * Pass to validators that resolve `$ref` pointers within access policy
 * fragments (e.g. when validating a partial access rule in the AccessBuilder).
 */
export const accessSchemaDefs = defs;
