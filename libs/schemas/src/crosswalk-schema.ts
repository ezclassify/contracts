import { schemaReader } from './fragment';
import schema from '../generated/validation/v1/crosswalk.schema.json';

/**
 * Static crosswalk schema JSON for validating a crosswalk YAML/JSON document.
 *
 * Root shape: `{ crosswalk: { id, version, name, sourceScheme, targetScheme,
 * mappings, ... } }`. The envelope is required, not optional sugar: a crosswalk
 * file is `{ crosswalk: ... }` the same way a scheme file is `{ scheme: ... }`,
 * which is how a tool handed a bare file learns what kind of document it has.
 * The engine's own loader enforces the same requirement.
 *
 * A crosswalk is directional. `sourceScheme` and `targetScheme` are not
 * interchangeable, and a reverse mapping is a separate document, because a
 * translation that is safe one way is not necessarily safe coming back.
 *
 * This generated validation view preserves the v1 dialect and definition names
 * derived from `crosswalk-definition.schema.json`. The shipped validator checks
 * crosswalk documents against this schema.
 */
export const crosswalkSchema = schema as Record<string, unknown>;

const reader = schemaReader(schema, '$defs', 'crosswalk.schema.json');
const defs = reader.defs;

/**
 * Sub-schema for one entry of `mappings[]`: a source assertion together with
 * the target it translates to and the disposition that records how faithful the
 * translation is. Use it when validating a single mapping row in isolation, for
 * example in a crosswalk editor that validates as the author types.
 */
export const crosswalkMappingSchema = {
    ...reader.definition('CrosswalkMapping'),
    /** Shared definitions that this fragment's `$ref`s point to. */
    $defs: defs,
};

/**
 * Sub-schema for a `sourceScheme` / `targetScheme` block: the `id` + `version`
 * of a scheme this crosswalk is pinned to.
 */
export const crosswalkSchemeDependencySchema = {
    ...reader.definition('CrosswalkSchemeDependency'),
    /** Shared definitions that this fragment's `$ref`s point to. */
    $defs: defs,
};

/**
 * All `$defs` from the crosswalk schema. Inject into a validator when resolving
 * `$ref` pointers inside an isolated crosswalk fragment.
 */
export { defs as crosswalkSchemaDefs };
