import type { RuleWhen, Vocabulary } from './scheme';
import type { GuideRuleSource } from './source';
import type {
    ArtifactReference,
    RuleReference,
    SourceReference,
} from './provenance';

/** A span where a pattern matched in the scanned text. */
export interface MatchSpan {
    /**
     * Start offset of the match in the scanned text, in UTF-16 code units.
     *
     * @asType integer
     */
    start: number;
    /**
     * End offset of the match, exclusive, in UTF-16 code units.
     *
     * @asType integer
     */
    end: number;
    /** The matched text. */
    matched: string;
}

/** A named pattern matcher: returns all match spans in a body of text. */
export interface GuideMatcher {
    /** Unique name (e.g. 'ipv4', 'cidr', 'email'). */
    name: string;
    /** Human-readable label for documentation. */
    label: string;
    /**
     * Find all occurrences in text. Returns spans with start/end positions.
     *
     * @param text - Text to search.
     */
    match(text: string): MatchSpan[];
}

/**
 * A named pattern matcher specification. Use built-in types like 'ipv4',
 * 'email', 'coordinates', or 'regex' with a custom pattern.
 */
export interface GuideMatchSpec {
    /**
     * Matcher type: a built-in name (ipv4, cidr, ipv6, mac_address, email,
     * hostname, url, coordinates, mgrs, phone, ssn, credit_card, date, uuid)
     * or 'regex' for custom. Domain-specific packs (usgov, healthcare,
     * financial, ...) add further names when registered.
     *
     * @minLength 1
     */
    type: string;
    /** Custom regex pattern: only used when type is 'regex'. */
    pattern?: string;
    /** Display label: overrides the matcher's built-in label. */
    label?: string;
    /**
     * Case-sensitivity for a `type: 'regex'` leaf. When true the pattern
     * compiles without the `i` flag, so an `[A-Z]` class means uppercase only.
     * Absent or false, the pattern matches case-insensitively. Ignored on
     * non-`regex` leaves.
     */
    caseSensitive?: boolean;
    /**
     * `runtime: true` marks a matcher provided by the host at runtime. Such a
     * leaf is always valid at load; if the named matcher is not registered it
     * matches nothing here, and resolves normally where it is registered.
     */
    runtime?: boolean;
}

/** Proximity measured in whitespace-delimited tokens. */
export interface TokenWindow {
    /**
     * The largest distance allowed between two spans, counted in
     * whitespace-delimited tokens between their nearest edges.
     *
     * @asType integer
     * @minimum 0
     */
    tokens: number;
}

/** Proximity measured in raw characters. */
export interface CharacterWindow {
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
 * A bounded proximity window. Exactly one token or character bound is present,
 * so a windowed operation can never widen to the whole line accidentally.
 */
export type Win = TokenWindow | CharacterWindow;

/** Span emitted by a near-expression match. */
export type MatchNearEmit = 'a' | 'b' | 'envelope';

/** Relative position accepted by a context-expression cue. */
export type MatchContextSide = 'before' | 'after' | 'both';

/** Validator outcome retained by a validation expression. */
export type MatchValidationKeep = 'pass' | 'fail';

/**
 * The `any` combinator: a union of child spans under one label. Used to express
 * a multi-format value as several small, individually screened leaves instead
 * of one giant alternation.
 */
export interface MatchAnyNode {
    /**
     * The alternatives. A span any of them matches is a match.
     *
     * @minItems 1
     */
    any: MatchNode[];
    /** Display label for this node's matches. Defaults to `any`. */
    label?: string;
}

/**
 * The `all` combinator: every child must match, and all children must overlap
 * within `within` of the first child's span. The emitted span is the first
 * child's (the anchor). Used to require several signals co-occur.
 */
export interface MatchAllNode {
    /**
     * The signals that must all match. The first is the anchor whose span is
     * kept.
     *
     * @minItems 1
     */
    all: MatchNode[];
    /** How close every other child's match must lie to the anchor's. */
    within: Win;
    /** Display label for this node's matches. Defaults to `all`. */
    label?: string;
}

/**
 * The `not` combinator: keep each `of` candidate span only when NO `not` span
 * lies within `within` of it. Drops a candidate that has a competing cue
 * nearby.
 */
export interface MatchNotNode {
    /**
     * The competing cue. A candidate with one of its spans nearby is dropped.
     */
    not: MatchNode;
    /** The candidate spans to keep or drop. */
    of: MatchNode;
    /** How close a `not` span must lie to a candidate to drop it. */
    within: Win;
    /** Display label for this node's matches. Defaults to `not`. */
    label?: string;
}

/**
 * The `near` combinator: pair an `a` span with a `b` span that lies within
 * `within`. `emit` selects which span survives: the `a` span (default), the `b`
 * span, or the envelope spanning both.
 */
export interface MatchNearNode {
    /** The pairing to match. */
    near: MatchNearExpression;
    /** Display label for this node's matches. Defaults to `near`. */
    label?: string;
}

/** Pairing expression used by the near combinator. */
export interface MatchNearExpression {
    /** The first span of the pair. Kept by default. */
    a: MatchNode;
    /** The second span of the pair. */
    b: MatchNode;
    /** How close the `b` span must lie to the `a` span. */
    within: Win;
    /**
     * Which span survives a match: `a` (the default), `b`, or `envelope`, the
     * span covering both.
     */
    emit?: MatchNearEmit;
}

/**
 * The `context` combinator: keep each `candidate` span only when a `cue` span
 * lies within `within` on the given `side` (default `both`). Used to require a
 * positive cue (e.g. a ZIP only counts with a postal/state cue nearby).
 */
export interface MatchContextNode {
    /** The candidate and the cue it needs. */
    context: MatchContextExpression;
    /** Display label for this node's matches. Defaults to `context`. */
    label?: string;
}

/** Cue relationship used by the context combinator. */
export interface MatchContextExpression {
    /** The spans to keep when the cue is present. */
    candidate: MatchNode;
    /** The span that must lie near a candidate for it to count. */
    cue: MatchNode;
    /** How close the cue must lie to the candidate. */
    within: Win;
    /**
     * Where the cue may lie relative to the candidate: `before`, `after`, or
     * `both` (the default).
     */
    side?: MatchContextSide;
}

/**
 * The `validate` combinator: run the named validator over each `candidate`
 * span's matched text and keep the candidate when the validator passes (`keep:
 * 'pass'`, the default) or when it fails (`keep: 'fail'`). The validator is
 * content-free arithmetic or structure registered in the validator registry; an
 * unknown name is a load-time error.
 */
export interface MatchValidateNode {
    /** The validator to run and which outcome to keep. */
    validate: MatchValidationExpression;
    /** Display label for this node's matches. Defaults to `validate`. */
    label?: string;
}

/** Validator invocation used by the validate combinator. */
export interface MatchValidationExpression {
    /** The spans whose matched text the validator checks. */
    candidate: MatchNode;
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
}

/**
 * A declarative match expression: a `GuideMatchSpec` leaf, or one of the
 * combinator nodes composed over child nodes. A guide rule's `match` array is a
 * list of these.
 */
export type MatchNode =
    | GuideMatchSpec
    | MatchAnyNode
    | MatchAllNode
    | MatchNotNode
    | MatchNearNode
    | MatchContextNode
    | MatchValidateNode;

/** A target scheme dependency declared by a guide. */
export interface GuideDependency {
    /** Scheme ID that must be loaded for this guide to evaluate. */
    id: string;
    /** Optional semver constraint (e.g. ">=2.0.0") or "*" for any version. */
    version?: string;
}

/** A section grouping guide rules for UI organization. */
export interface GuideCategory {
    /** Unique identifier within the guide. */
    id: string;
    /** Display label for the category heading. */
    label: string;
    /** Optional description shown below the heading. */
    description?: string;
}

/**
 * A reference to a concept in a dependent scheme. Resolved to a full Assertion
 * during guide evaluation.
 */
export interface ConceptRef {
    /** Concept ID: must exist in one of the guide's target schemes. */
    id: string;
    /** Category ID: required when the concept belongs to multiple categories. */
    category?: string;
    /** Value for text-input concepts (e.g., country codes, project names). */
    value?: string;
}

/** The effect of a guide rule: what it contributes to the marking. */
export interface GuideRuleOutcome {
    /**
     * Pre-rendered marking string: parsed by engine.process() during
     * evaluation.
     */
    rendered?: string;
    /**
     * Direct concept references: converted to assertions, then
     * engine.process()'d.
     */
    concepts?: ConceptRef[];
}

/**
 * A rule in a marking guide: a data-element description with an outcome that
 * contributes to the aggregate marking when activated.
 *
 * Rules are presented as checkboxes in the UI. `keywords` enables
 * keyword-search filtering; `match` enables text-scan detection (e.g., finding
 * IPv4 addresses in a document body). `outcome.rendered` or `outcome.concepts`
 * provides the marking contribution. Rules with `when` are computed; they
 * auto-activate based on sibling rule selection state and do not appear as
 * user-visible checkboxes.
 *
 * This is the named runtime/read-result shape. Authoring input is carried by
 * the guide definition's `rules.inline` entries.
 */
export interface GuideRule {
    /** Unique identifier within the guide. */
    id: string;
    /** Human-readable display name. */
    name: string;
    /** Description of the data element this rule covers. */
    description?: string;
    /**
     * Searchable terms for literal keyword filtering (absent on computed
     * rules).
     */
    keywords?: string[];
    /**
     * Named pattern matchers for content evaluation. Each entry is a
     * `MatchNode`: a leaf spec referencing a built-in matcher (e.g. `{
     * type: 'ipv4' }`) or a custom regex (`{ type: 'regex', pattern: '...' }`),
     * or a combinator node (`any` / `all` / `not` / `near` / `context` /
     * `validate`) composed over child nodes. When content is evaluated, both
     * `keywords` and `match` are checked.
     */
    match?: MatchNode[];
    /** Guide category ID for grouping in the UI. */
    category?: string;
    /**
     * What this rule contributes when active. At least one of rendered or
     * concepts must be set.
     */
    outcome: GuideRuleOutcome;
    /** Explanation of why this outcome applies. */
    rationale?: string;
    /**
     * When present, this rule auto-activates based on other rules' selection
     * state. Uses the same when framework as scheme rules. `has` references
     * guide rule IDs. Rules with `when` are "computed"; they don't appear as
     * checkboxes.
     */
    when?: RuleWhen;
    /**
     * Rule IDs whose outcomes this rule replaces when active. When omitted
     * (default), this rule's outcome is additive: it contributes alongside the
     * rules it depends on.
     */
    overrides?: string[];
}

/**
 * A marking guide document: a curated set of rules that help a user build an
 * accurate marking for a specific data type or workflow.
 *
 * Guides are independent of the marking scheme; they reference a scheme via
 * `targetSchemes` but load separately into `GuideEngine`. A rule's `outcome` is
 * merged by the engine into a single aggregate marking via
 * `GuideEngine.evaluate()`. Rules with `when` auto-activate based on other
 * rules' selection state and do not appear as user-visible checkboxes.
 *
 * @internal Runtime, post-load shape. The published wire format is
 * `GuideDefinition` (`guide.rules: GuideRulesBlock`, `{ inline, external }`).
 * Authors and tools that read/write guide YAML/JSON should target
 * `GuideDefinition`, not `Guide`.
 */
export interface Guide {
    /** Unique identifier. */
    id: string;
    /** Semantic version. */
    version: string;
    /** Display name. */
    name: string;
    /** Long description. */
    description: string;
    /**
     * Optional display-term overrides consulted by runtime UI components. Keys
     * are consumer-defined (e.g. "rule", "category"); each consumer merges with
     * its own defaults via `resolveVocabulary`. The `"guidebook"` key renames
     * this guide's own reference-surface noun (e.g. `{ guidebook: { singular:
     * "SGCs" } }`); resolve it with `referenceSurfaceLabel(guide.vocabulary,
     * 'guidebook')`, never by reading the raw map directly.
     */
    vocabulary?: Vocabulary;
    /** Target scheme dependencies: at least one required. */
    targetSchemes: GuideDependency[];
    /** Sections for organizing rules in the UI. */
    categories?: GuideCategory[];
    /**
     * Resolved rule list, post-load. Each entry carries its `id` inline; this
     * is the in-memory shape the engine evaluates against, not the wire format.
     * The wire format (`GuideBlock.rules`) is the `{ inline: <map>,
     * external?: [...] }` block; the loader materializes external sources and
     * projects the `inline` map back to this flat array.
     */
    rules: GuideRule[];
}

/** Per-rule breakdown in a guide evaluation result. */
export interface GuideBreakdownEntry {
    /** Qualified rule whose outcome was evaluated. */
    rule: RuleReference;
    /** Rule outcome evaluated by the guide engine. */
    outcome: GuideRuleOutcome;
    /** Whether the rule was activated from other guide facts. */
    isComputed: boolean;
    /** Whether an active rule replaced this rule's outcome. */
    wasOverridden: boolean;
    /** Qualified overriding rule when this outcome was replaced. */
    overriddenBy?: RuleReference;
}

/** Aggregated guide output: one rolled-up marking per target scheme id. */
export interface AggregatedMarkings {
    [identifier: string]: string;
}

/**
 * Output of GuideEngine.evaluate(): the aggregate marking produced by
 * evaluating a set of selected guide rules. Parallels SchemeEngine.process() on
 * the scheme side.
 */
export interface EvaluationResult {
    /**
     * The id of the guide evaluated. Absent when the result combines several
     * guides.
     */
    guideId?: string;
    /**
     * The selected rules that were evaluated. Rules with a `when` condition are
     * computed, not selected, and are not listed here.
     */
    selectedRules: GuideRule[];
    /** The computed rules whose `when` condition the selection satisfied. */
    activeComputedRules: GuideRule[];
    /**
     * The marking each contributing rule's outcome resolves to. Overridden
     * rules contribute none.
     */
    effectiveMarkings: string[];
    /**
     * The effective markings rolled up into one marking by the target scheme.
     * Empty when no rule contributed, or when the result spans more than one
     * target scheme, in which case `aggregatedMarkings` holds one per scheme.
     */
    aggregatedMarking: string;
    /**
     * Aggregated output keyed by target scheme id. Present when guide
     * evaluation routed through more than one target scheme.
     */
    aggregatedMarkings?: AggregatedMarkings;
    /**
     * One entry per evaluated rule: for each guide, its selected rules, then its
     * computed rules.
     */
    breakdown: GuideBreakdownEntry[];
    /**
     * Subset of `breakdown` that actually contributed to `aggregatedMarking`
     * (i.e. `breakdown.filter(b => !b.wasOverridden)`). Precomputed so UI
     * layers stop re-filtering the full breakdown.
     */
    contributingBreakdown: GuideBreakdownEntry[];
    /** External guide-rule source observation used by this evaluation. */
    provenance?: SourceReference;
}

/** A guide rule matched by keyword search. */
export interface GuideSearchResult {
    /** The rule that matched. */
    rule: GuideRule;
    /** Id of the guide that holds the rule, when the search spans guides. */
    guideId?: string;
    /** Query keywords that matched the rule. */
    matchedKeywords: string[];
    /**
     * Relevance score. Higher is more relevant; results are sorted by it,
     * highest first. Only the ordering is meaningful.
     */
    score: number;
}

/**
 * A span, by offsets into the scanned text, where a guide rule keyword or
 * pattern matched.
 */
export interface GuideScanSpan {
    /** The keyword that matched, or the label of the matcher that did. */
    keyword: string;
    /**
     * Offset in the scanned text where the match starts, in UTF-16 code units.
     *
     * @asType integer
     */
    start: number;
    /**
     * Offset in the scanned text just past the end of the match, in UTF-16
     * code units.
     *
     * @asType integer
     */
    end: number;
    /**
     * Advisory confidence in [0, 1], present only when the scan asked for it
     * with the `confidence` scan option. An ordinal hint derived from the
     * match's shape, not a calibrated probability.
     */
    confidence?: number;
}

/**
 * A guide rule matched by text scanning, with every span where the rule's
 * keywords or matchers fired. Returned by the engine's `scanGuides` and the
 * standalone `scanTextForRules` / `scanMultipleGuides` helpers.
 *
 * Parallels the scheme-side scan result: one entry per rule hit, with offsets
 * into the scanned text.
 */
export interface GuideScanResult {
    /** The guide rule that matched. */
    rule: GuideRule;
    /**
     * The id of the guide the rule belongs to, when the scan covered more than
     * one.
     */
    guideId?: string;
    /** Each keyword or matcher label that fired, once each. */
    matchedKeywords: string[];
    /** Every place in the text where the rule fired, in the order found. */
    spans: GuideScanSpan[];
    /**
     * Source provenance for the guide-rule source that supplied the matched
     * rule.
     *
     * Populated only when the rule came from an external `GuideRuleSource`
     * override wired into the `GuideEngine` at load time (typically a
     * `MappedGuideRuleSource` the server's Context loader built from a guide
     * YAML's `rules.external` block). Inline-backed results leave this field
     * undefined to keep payloads compact for the common single-source case.
     *
     * Identity fields mirror the source's `sourceIdentity()` observation at
     * engine-construction time.
     */
    provenance?: SourceReference;
}

/**
 * Human-readable description of a guide rule. Parallels `ConceptDescription` on
 * the scheme side.
 */
export interface RuleDescription {
    /** Qualified rule being described. */
    rule: RuleReference;
    /** Guide artifact that owns the rule. */
    guide: ArtifactReference;
    /** Human-readable rule name. */
    name: string;
    /** Optional policy-authored description. */
    description?: string;
    /** Human-readable outcome expression. */
    outcomeText: string;
    /** Human-readable activation expression. */
    whenText?: string;
    /** Whether the rule is computed from other guide facts. */
    isComputed: boolean;
    /** Qualified rules referenced by this rule's activation block. */
    dependsOn: RuleReference[];
    /** Qualified rules this rule overrides when it fires. */
    overrides: RuleReference[];
    /** Flattened multi-line description matching `ConceptDescription.lines`. */
    lines: string[];
}

/** Validation result for a guide document. */
export interface GuideValidationResult {
    /** True when the guide document has no issues. */
    valid: boolean;
    /** Each problem found in the guide document, in words. Empty when valid. */
    issues: string[];
}

/**
 * Optional progress callback. Receives `(current, total)`, where `total` is the
 * length of the scanned text in UTF-16 code units and `current` is how far the
 * scan has advanced on that scale, across every guide being scanned. It is
 * invoked at least at the start and end of the scan.
 *
 * @param current - How far the scan has advanced, on the same scale as `total`.
 * @param total - Length of the scanned text, in UTF-16 code units.
 */
export type GuideScanProgressCallback = (
    current: number,
    total: number,
) => void;

/** Options accepted by guide scan operations. */
export interface GuideScanOptions {
    /** Optional progress callback invoked as the scan advances. */
    onProgress?: GuideScanProgressCallback;
    /**
     * Opt in to advisory confidence on emitted spans. Default `false`.
     *
     * When `false` or absent, no span carries a `confidence` field. When
     * `true`, each emitted span gets a deterministic, advisory `confidence` in
     * `[0, 1]` derived purely from the match's shape (see the engine's
     * `confidenceForNode` tiers). It is an ordinal hint, not a calibrated
     * probability, and never enters any serialized or hashed form.
     */
    confidence?: boolean;
    /**
     * Optional source used instead of the guide's inline rule collection.
     *
     * @internal
     */
    source?: GuideRuleSource;
}
