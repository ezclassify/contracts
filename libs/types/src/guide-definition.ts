import type {
    MarkingSchemeRefDoc,
    SchemeDependencyDoc,
    VocabularyDoc,
} from './scheme-definition';
import type {
    GuideWhenOperator,
    MatchContextSide,
    MatchNearEmit,
    MatchValidationKeep,
} from './guide';
import type { LayerBinding } from './layer';

/**
 * One element a guide layer takes away, named by kind and id. Exactly one key.
 *
 * The same reference-not-a-path reasoning as the scheme family: a rule or a
 * category is addressed by its id, which survives a storage change and
 * validates as a closed set.
 */
export type GuideLayerRemoval =
    | {
          /** The id of the guide rule to remove. */
          rule: string;
      }
    | {
          /** The id of the guide category to remove. */
          category: string;
      };

/**
 * The guide family's layer payload. Required when `type: 'layer'`, forbidden
 * otherwise.
 *
 * Layering a guide is for _tailoring_ one that arrived from above. Adding
 * guidance needs no layer at all, because a Context holds a list of guides and
 * an organization can simply add its own. What an organization cannot do is
 * edit a guide it received read-only, so a layer is how it narrows a rule that
 * does not fit its mission or drops one that does not apply. The layer's own
 * `rules` and `categories` are the additions and overrides, written as an
 * ordinary guide document; what it takes away is listed here.
 *
 * Binding and merge rules are the cross-family ones: see `LayerBinding`.
 * A guide layer may add, override, and remove; later wins on a colliding id.
 * Guidance is advisory content, so an override changes what an author is told,
 * never what the engine permits.
 */
export interface GuideLayer extends LayerBinding {
    /** Rules and categories inherited from below that this layer takes away. */
    removes?: GuideLayerRemoval[];
    /**
     * Rules and categories an earlier layer removed that this one brings back,
     * with the definition they had below. Naming an element in both `removes`
     * and `restores` is a load error.
     */
    restores?: GuideLayerRemoval[];
}

/**
 * Proximity measured in whitespace-delimited tokens.
 *
 * @public
 */
export interface TokenWindowDoc {
    /**
     * The largest distance allowed between two spans, counted in
     * whitespace-delimited tokens between their nearest edges.
     *
     * @asType integer
     * @minimum 0
     */
    tokens: number;
}

/**
 * Proximity measured in characters.
 *
 * @public
 */
export interface CharacterWindowDoc {
    /**
     * The largest distance allowed between two spans, counted in characters
     * (UTF-16 code units) between their nearest edges. Spans that touch or
     * overlap are 0 apart.
     *
     * @asType integer
     * @minimum 0
     */
    chars: number;
}

/**
 * A bounded proximity window. Exactly one token or character bound is
 * present, so a windowed match never widens to the whole line.
 *
 * @public
 */
export type MatchWindowDoc = TokenWindowDoc | CharacterWindowDoc;

/**
 * A match leaf: a built-in matcher by name, or `regex` with its own pattern.
 *
 * @public
 */
export interface GuideMatchLeafDoc {
    /**
     * Matcher type: a built-in name (ipv4, cidr, ipv6, mac_address, email,
     * hostname, url, coordinates, mgrs, phone, ssn, credit_card, date, uuid)
     * or `regex` for a custom pattern.
     *
     * @minLength 1
     */
    type: string;
    /** Custom regex pattern: only used when type is `regex`. */
    pattern?: string;
    /** Display label: overrides the matcher's built-in label. */
    label?: string;
    /**
     * Case-sensitivity for a `type: regex` leaf. When true the pattern matches
     * case exactly, so an `[A-Z]` class means uppercase only. Absent or false,
     * the pattern matches case-insensitively. Ignored on other leaves.
     */
    case_sensitive?: boolean;
    /**
     * `runtime: true` marks a matcher the host provides at runtime. Such a
     * leaf is always valid at load; if the named matcher is not registered it
     * matches nothing, and it resolves normally where it is registered.
     */
    runtime?: boolean;
}

/**
 * The `any` combinator: a span any child matches is a match.
 *
 * @public
 */
export interface GuideMatchAnyDoc {
    /**
     * The alternatives.
     *
     * @minItems 1
     */
    any: GuideMatchNodeDoc[];
    /** Display label for this node's matches. Defaults to `any`. */
    label?: string;
}

/**
 * The `all` combinator: every child must match within `within` of the first
 * child's span, which is the span kept.
 *
 * @public
 */
export interface GuideMatchAllDoc {
    /**
     * The signals that must all match. The first is the anchor.
     *
     * @minItems 1
     */
    all: GuideMatchNodeDoc[];
    /** How close every other child's match must lie to the anchor's. */
    within: MatchWindowDoc;
    /** Display label for this node's matches. Defaults to `all`. */
    label?: string;
}

/**
 * The `not` combinator: keep each `of` span only when no `not` span lies
 * within `within` of it.
 *
 * @public
 */
export interface GuideMatchNotDoc {
    /** The competing cue. */
    not: GuideMatchNodeDoc;
    /** The candidate spans to keep or drop. */
    of: GuideMatchNodeDoc;
    /** How close a `not` span must lie to a candidate to drop it. */
    within: MatchWindowDoc;
    /** Display label for this node's matches. Defaults to `not`. */
    label?: string;
}

/**
 * The `near` combinator: pair an `a` span with a `b` span within `within`.
 *
 * @public
 */
export interface GuideMatchNearDoc {
    /** The pairing to match. */
    near: {
        /** The first span of the pair. Kept by default. */
        a: GuideMatchNodeDoc;
        /** The second span of the pair. */
        b: GuideMatchNodeDoc;
        /** How close the `b` span must lie to the `a` span. */
        within: MatchWindowDoc;
        /** Which span survives a match: `a` (the default), `b`, or `envelope`. */
        emit?: MatchNearEmit;
    };
    /** Display label for this node's matches. Defaults to `near`. */
    label?: string;
}

/**
 * The `context` combinator: keep each candidate span only when a cue span lies
 * within `within` on the given side.
 *
 * @public
 */
export interface GuideMatchContextDoc {
    /** The candidate and the cue it needs. */
    context: {
        /** The spans to keep when the cue is present. */
        candidate: GuideMatchNodeDoc;
        /** The span that must lie near a candidate for it to count. */
        cue: GuideMatchNodeDoc;
        /** How close the cue must lie to the candidate. */
        within: MatchWindowDoc;
        /** Where the cue may lie: `before`, `after`, or `both` (the default). */
        side?: MatchContextSide;
    };
    /** Display label for this node's matches. Defaults to `context`. */
    label?: string;
}

/**
 * The `validate` combinator: run a registered validator over each candidate
 * span and keep the candidates that pass, or the ones that fail.
 *
 * @public
 */
export interface GuideMatchValidateDoc {
    /** The validator to run and which outcome to keep. */
    validate: {
        /** The spans whose matched text the validator checks. */
        candidate: GuideMatchNodeDoc;
        /**
         * Registered validator name.
         *
         * @minLength 1
         */
        with: string;
        /** Which outcome keeps a candidate: `pass` (the default) or `fail`. */
        keep?: MatchValidationKeep;
        /** Optional opaque arguments passed through to the validator. */
        args?: unknown;
    };
    /** Display label for this node's matches. Defaults to `validate`. */
    label?: string;
}

/**
 * One node of a guide rule's `match` list: a leaf, or a combinator over child
 * nodes.
 *
 * @public
 */
export type GuideMatchNodeDoc =
    | GuideMatchLeafDoc
    | GuideMatchAnyDoc
    | GuideMatchAllDoc
    | GuideMatchNotDoc
    | GuideMatchNearDoc
    | GuideMatchContextDoc
    | GuideMatchValidateDoc;

/**
 * A condition that holds when the user selected one rule.
 *
 * @public
 */
export interface GuideWhenHasDoc {
    /** The id of a selectable rule of this guide. */
    has: string;
}

/**
 * A condition that tests the selection with an operator.
 *
 * @public
 */
export interface GuideWhenTestDoc {
    /** The test to apply. */
    operator: GuideWhenOperator;
    /**
     * A rule id for `has_concept` and `not_has_concept`, a count for the
     * `count_*` tests, absent for `has_content`.
     */
    value?: string | number;
}

/**
 * A block of conditions over the rules the user selected. Every list present
 * must hold: `any` when one of its nodes holds, `all` when each does, `none`
 * when none does. Each list present is non-empty.
 *
 * @public
 */
export interface GuideWhenDoc {
    /** At least one of these holds. */
    any?: GuideWhenNodeDoc[];
    /** Every one of these holds. */
    all?: GuideWhenNodeDoc[];
    /** None of these holds. */
    none?: GuideWhenNodeDoc[];
}

/**
 * One node of a guide `when` block: a condition, or a nested block.
 *
 * @public
 */
export type GuideWhenNodeDoc = GuideWhenHasDoc | GuideWhenTestDoc | GuideWhenDoc;

/**
 * A concept in one of the guide's target schemes, as a rule's outcome names
 * it.
 *
 * @public
 */
export interface ConceptRefDoc {
    /** The concept id. It exists in one of the guide's target schemes. */
    id: string;
    /** The category id, required when the concept belongs to several. */
    category?: string;
    /** The value, for a text-input concept such as a country code. */
    value?: string;
}

/**
 * What a guide rule contributes to the marking when it is active.
 *
 * @public
 */
export interface GuideRuleOutcomeDoc {
    /** A marking, read in the target scheme. */
    rendered?: string;
    /** Concepts asserted directly. */
    concepts?: ConceptRefDoc[];
}

/**
 * A section that groups a guide's rules in the UI.
 *
 * @public
 */
export interface GuideCategoryDoc {
    /** Unique identifier within the guide. */
    id: string;
    /** Display label for the section heading. */
    label: string;
    /** Description shown below the heading. */
    description?: string;
}

/**
 * A guide rule as a guide document authors it. A rule an engine answers with
 * is a `GuideRule`, which carries the same facts in the wire shape and no
 * marking.
 *
 * Rules are presented as checkboxes. `keywords` and `match` find the rule in
 * text; `outcome` is what it contributes to the marking. A rule with `when` is
 * computed: it activates from the rules the user selected and is not offered
 * as a checkbox.
 *
 * @public
 */
export interface GuideRuleDoc {
    /** Unique identifier within the guide. */
    id: string;
    /** Human-readable display name. */
    name: string;
    /**
     * This rule's part marking, written in the scheme the document's
     * `marking_scheme` names. Text, never interpreted: no engine parses it,
     * checks it, acts on it, or reports it.
     */
    marking?: string;
    /** Description of the data element this rule covers. */
    description?: string;
    /** Searchable terms for literal keyword matching. */
    keywords?: string[];
    /** Pattern matchers for content evaluation, checked beside `keywords`. */
    match?: GuideMatchNodeDoc[];
    /** Guide category id for grouping in the UI. */
    category?: string;
    /**
     * What this rule contributes when active. At least one of `rendered` or
     * `concepts` is set.
     */
    outcome: GuideRuleOutcomeDoc;
    /** Explanation of why this outcome applies. */
    rationale?: string;
    /**
     * When present, the rule is computed: it activates when this block holds
     * over the selectable rules the user selected.
     */
    when?: GuideWhenDoc;
    /**
     * Rule ids whose outcomes this rule replaces when active. Omitted, this
     * rule's outcome is added alongside the rules it depends on.
     */
    overrides?: string[];
}

/**
 * The body inside the top-level `guide:` envelope: what a marking guide
 * declares. The runtime `Guide` is the engine's resolved in-memory shape after
 * loading and is not part of the published contract.
 *
 * @public
 */
export interface GuideBlock {
    /** Unique guide identifier. */
    id: string;
    /** Semantic version of this guide. */
    version: string;
    /** Human-readable guide name. */
    name: string;
    /**
     * The scheme this document's markings are written in. A guide is not a
     * scheme, so it always names one by reference.
     *
     * Authoring data only: no engine resolves the scheme it names.
     */
    marking_scheme?: MarkingSchemeRefDoc;
    /**
     * The whole marking of this guide document, written in the scheme
     * `marking_scheme` names. Every `marking` on one of its rules is a part of
     * it.
     *
     * Text, never interpreted: no engine parses it, checks it, or acts on it.
     * A guide's summary views report it unchanged for display.
     */
    marking?: string;
    /** Longer description of what this guide covers. */
    description?: string;
    /**
     * Display words this guide advertises for UI consumers. A presentation
     * hint only.
     */
    vocabulary?: VocabularyDoc;
    /**
     * What kind of document this is. Absent means `'guide'`. `type: 'layer'`
     * requires the `layer` block and `type: 'guide'` forbids it, both enforced
     * at load. Every layerable family wears this same envelope; see
     * `LayerBinding`.
     */
    type?: 'guide' | 'layer';
    /**
     * The guide family's layer payload. Required when `type: 'layer'`,
     * forbidden otherwise.
     */
    layer?: GuideLayer;
    /**
     * The schemes this guide's outcomes are written in: at least one.
     *
     * @minItems 1
     */
    target_schemes: SchemeDependencyDoc[];
    /** Sections for organizing rules in the UI. */
    categories?: GuideCategoryDoc[];
    /** The guide's rules, in the order they are offered. */
    rules: GuideRuleDoc[];
}

/**
 * Top-level YAML document for a marking guide: `{ guide: { ... } }`. This is
 * the published 1.0 format every customer authors against.
 *
 * Read it aloud and it says what it is: this document is a guide. A scheme
 * file is `{ scheme: ... }`, an access file is `{ access: ... }`, a crosswalk
 * file is `{ crosswalk: ... }`, a context file is `{ context: ... }`; a guide
 * file is `{ guide: ... }`. The envelope is also what makes a document
 * self-describing on disk: a tool handed a file with no other context reads
 * the envelope key to learn the kind.
 *
 * @public
 */
export interface GuideDefinition {
    /** Root `guide:` envelope. All fields live inside it. */
    guide: GuideBlock;
}
