import type { AccessRule } from './access';
import type { LayerBinding } from './layer';
import type {
    MarkingSchemeRefDoc,
    SchemeDependencyDoc,
    VocabularyDoc,
} from './scheme-definition';

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
 * What a data gate asks of the data before a rule is evaluated.
 *
 * - `has_concept`: the category holds the concept named in `value`.
 * - `has_content`: the category holds anything.
 * - `has_no_content`: the category holds nothing.
 * - `min_order`: the category holds a concept ranked at or above `value`.
 *
 * @public
 */
export type AccessGateOperator =
    | 'has_concept'
    | 'has_content'
    | 'has_no_content'
    | 'min_order';

/**
 * How a check compares its operands.
 *
 * - `is_in`: the left value is one of the right values.
 * - `contains_any`: the two sets share at least one value.
 * - `superset`: the left set holds every right value.
 * - `equals`: the two values are equal.
 * - `gte`: the left value is at or above the right one.
 * - `after`: the left value, a date and time, is later than the moment the
 *   request is decided. It reads no right operand.
 *
 * @public
 */
export type AccessCheckOperator =
    | 'is_in'
    | 'contains_any'
    | 'superset'
    | 'equals'
    | 'gte'
    | 'after';

/**
 * A data gate: the rule is evaluated only when this holds of the data.
 *
 * @public
 */
export interface AccessRuleGateDoc {
    /** The category tested. */
    category: string;
    /** What the gate asks of the category. */
    operator: AccessGateOperator;
    /** A concept id for `has_concept`, a rank for `min_order`. */
    value?: string | number;
}

/**
 * A check that compares a subject attribute, a request context value, the
 * data's concepts in a category, or a literal.
 *
 * The left operand is `user`, or `context` when there is no `user`. The right
 * operand is the first of `context`, `data_category` and `value` that is not
 * already the left one.
 *
 * @public
 */
export interface AccessRuleCheckDoc {
    /** Dot-path into the subject's attributes. */
    user?: string;
    /** Dot-path into the caller-provided request context. */
    context?: string;
    /** A category whose concepts in the data are compared. */
    data_category?: string;
    /** How the operands are compared. */
    operator: AccessCheckOperator;
    /** A literal compared against, when neither other operand is. */
    value?: unknown;
}

/**
 * One access rule as a policy authors it.
 *
 * A simple rule maps a subject attribute onto a category: `attribute`,
 * `category` and `strategy`. A check rule compares operands in a `check`
 * block instead. Either may carry a data gate in `when`.
 *
 * @public
 */
export interface AccessRuleDoc {
    /** Unique identifier for this rule. */
    id: string;
    /** Human-readable name for this rule, shown in access decision output. */
    name: string;
    /**
     * This rule's part marking, written in the scheme the document's
     * `marking_scheme` names. Text, never interpreted: no engine parses it,
     * checks it, acts on it, or reports it.
     */
    marking?: string;
    /** Simple rule: the subject attribute compared (a dot-path). */
    attribute?: string;
    /** The category this rule evaluates. */
    category?: string;
    /**
     * Simple rule: how the attribute is compared with the data's concepts in
     * `category`. Required with `attribute`; a check rule does not read it.
     */
    strategy?: AccessRule;
    /** Simple rule: the concept view the attribute's values are written in. */
    view?: string;
    /** Simple rule: maps attribute values onto concept ids. */
    values?: Record<string, string>;
    /** Evaluate the rule only when the data passes this gate. */
    when?: {
        /** The data gate. */
        data?: AccessRuleGateDoc;
    };
    /** Check rule: the comparison it makes. */
    check?: AccessRuleCheckDoc;
    /**
     * The reason given when this rule denies access. `{variable}` names a
     * value the decision fills in.
     */
    deny_reason?: string;
}

/**
 * Top-level YAML document for an access policy. This is the published 1.0
 * document format; the runtime `AccessPolicy` is the engine's resolved
 * in-memory shape after loading and is not part of the published contract.
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
        /**
         * The scheme this document's markings are written in. An access policy
         * is not a scheme, so it always names one by reference.
         *
         * Authoring data only: no engine resolves the scheme it names.
         */
        marking_scheme?: MarkingSchemeRefDoc;
        /**
         * The whole marking of this access policy document, written in the
         * scheme `marking_scheme` names. Every `marking` on one of its rules is
         * a part of it.
         *
         * Text, never interpreted: no engine parses it, checks it, or acts on
         * it. The policy's summary reports it unchanged for display.
         */
        marking?: string;
        /** Longer description of what this access policy governs. */
        description?: string;
        /**
         * Display words this policy advertises for UI consumers. A presentation
         * hint only.
         */
        vocabulary?: VocabularyDoc;
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
        target_scheme: SchemeDependencyDoc;
        /** The policy's rules, evaluated in order. */
        rules: AccessRuleDoc[];
    };
}
