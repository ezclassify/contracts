import { schemaReader } from './fragment';
import schema from '../generated/validation/v1/access.schema.json';

/**
 * Static access policy schema JSON for validating a complete access policy
 * document.
 *
 * Root shape: `{ access: { id, target_scheme: { id }, rules: [...] } }`.
 * Required top-level fields: `access.id`, `access.target_scheme.id`,
 * `access.rules`. The `target_scheme` field pins which marking scheme this
 * policy governs.
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
const ruleEntry = reader.items(envelopeProps.rules, 'access.rules');
const metadataKeys = new Set([
    'id',
    'version',
    'name',
    'marking_scheme',
    'marking',
    'description',
    'target_scheme',
]);

/**
 * Sub-schema for access policy root metadata (id, version, name,
 * marking_scheme, marking, description, target_scheme). Sourced from AccessPolicyEnvelope inside the
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
 * Sub-schema for a single access rule within `access.rules[]`.
 *
 * Required fields: `id`, `name`. Optional fields include the part `marking`;
 * simple-mapping fields are `attribute`, `category`, and `strategy`;
 * cross-source rules use `check`.
 * Semantic rule requirements remain runtime-owned. Used when validating
 * individual access rules in isolation (e.g., Studio's AccessBuilder editor).
 */
export const accessRuleSchema: Record<string, unknown> = {
    ...ruleEntry,
    definitions: defs,
};

/**
 * All `definitions` from the access schema: includes `AccessPolicyEnvelope`,
 * `AccessRuleDoc`, and their sub-schemas.
 *
 * Pass to validators that resolve `$ref` pointers within access policy
 * fragments (e.g. when validating a partial access rule in the AccessBuilder).
 */
export const accessSchemaDefs = defs;
