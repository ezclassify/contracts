import type { AccessPolicyTargetScheme, AccessRuleEntry } from './access';
import type { AccessMappingDoc, ExternalSourceSpec } from './external-source';
import type { LayerBinding } from './layer';
import type { Vocabulary } from './scheme';

/**
 * The access family's layer payload. Required when `type: 'layer'`, forbidden
 * otherwise.
 *
 * An access layer is complete-only, and this type is deliberately nothing but
 * the binding. It has no `removes` and no `restores`, because there is no
 * legitimate way for a layer to take away a mapping its base made: the two
 * fields are absent so the refusal is in the shape, not only in the prose. The
 * layer's own `rules` carry the additions, and a rule id that collides with one
 * inherited from the base is a composition error the loader refuses, not an
 * override that quietly wins.
 *
 * The reason is authority, not tidiness. An organization holds concepts its
 * parent structurally cannot know, and those concepts arrive through its own
 * scheme layer, so mapping them to subject attributes is its own call to make.
 * Everything the parent mapped stays the parent's. A child may complete what
 * its parent could not know; it may not alter what its parent decided.
 *
 * Binding is the cross-family one: see `LayerBinding`.
 */
export interface AccessLayer extends LayerBinding {}

/**
 * Inline-or-external access-rule block. The canonical 1.0 wire format for
 * `AccessDefinition.access.rules`.
 *
 * @public
 */
export interface AccessRulesBlock {
    /**
     * Inline access rules, authored as an array of `AccessRuleEntry`
     * entries with `id` carried as a field on each entry, matches the scheme
     * inline shape (`data.concepts.inline: [...]`) so authoring stays uniform
     * across scheme, guide, and access YAML. Uniqueness of `id` within the
     * array is enforced by the loader's validator; the engine builds a
     * `Map<string, AccessRuleEntry>` index at load time to keep id lookups
     * O(1).
     */
    inline?: AccessRuleEntry[];
    /**
     * Live external rule sources. An array allows an access doc to draw rules
     * from multiple upstream endpoints, composed via
     * `ChainedAccessRuleSource` at load time.
     */
    external?: ExternalSourceSpec<AccessMappingDoc>[];
}

/**
 * Top-level YAML document for an access policy. This is the published 1.0 wire
 * format; the runtime `AccessPolicy` is the engine's resolved in-memory
 * shape after loading and is not part of the published contract.
 *
 * @public
 */
export interface AccessDefinition {
    /** Root `access:` envelope. */
    access: {
        /** Unique access policy identifier. */
        id: string;
        /** Semantic version of this access policy. */
        version?: string;
        /** Human-readable access policy name. */
        name?: string;
        /** Longer description of what this access policy governs. */
        description?: string;
        /**
         * Display words this policy advertises for UI consumers. A presentation
         * hint only.
         */
        vocabulary?: Vocabulary;
        /**
         * What kind of document this is. Absent means `'access'`.
         * `type: 'layer'` requires the `layer` block and `type: 'access'`
         * forbids it, both enforced at load. Every layerable family wears this
         * same envelope; see `LayerBinding`.
         */
        type?: 'access' | 'layer';
        /**
         * The access family's layer payload. Required when `type: 'layer'`,
         * forbidden otherwise.
         */
        layer?: AccessLayer;
        /** The scheme whose markings this policy decides access to. */
        targetScheme: AccessPolicyTargetScheme;
        /** Access rules: inline array and/or external sources. */
        rules: AccessRulesBlock;
    };
}
