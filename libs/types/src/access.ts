import type { AccessRuleDoc } from './access-definition';
import type { Assertion, Vocabulary, Warning } from './scheme';
import type {
    ArtifactReference,
    AssertionReference,
    RuleReference,
} from './provenance';

/**
 * Strategy for comparing subject attributes against data assertions in a category
 * during an access check.
 *
 * - `gte`: user's ranked concept must be at or above the data concept's rank
 * - `superset`: user's concept set must include all data concepts
 * - `includes`: user's concept set must include at least one data concept
 * - `exact`: user's concepts must exactly match the data concepts
 *
 * Declared on `AccessRuleDoc.strategy` for simple attribute-mapping rules.
 */
export type AccessRule = 'gte' | 'superset' | 'includes' | 'exact';

/** Source of one operand in an access-policy comparison. */
export type AccessOperandSource =
    | 'subject'
    | 'context'
    | 'assertion'
    | 'literal';

/** Typed operand captured while an access rule is evaluated. */
export interface AccessOperand {
    /** Source domain from which the value was read. */
    source: AccessOperandSource;
    /** Dot-path for subject or context operands. */
    path?: string;
    /** Category addressed by an assertion operand. */
    categoryId?: string;
    /** Assertions addressed by an assertion operand. */
    assertions?: AssertionReference[];
    /** Literal or resolved opaque value. */
    value?: unknown;
}

/** Machine-readable record of why an access rule activated. */
export interface AccessRuleActivation {
    /** Whether the rule's activation predicate matched. */
    matched: boolean;
    /** Assertions that activated the rule. */
    assertions: AssertionReference[];
    /** Context paths consulted by activation. */
    contextPaths: string[];
}

/** Machine-readable result of one access-rule comparison. */
export interface AccessComparisonResult {
    /** Left comparison operand. */
    left: AccessOperand;
    /** Policy operator applied to the operands. */
    operator: string;
    /** Right comparison operand. */
    right: AccessOperand;
    /** Whether the comparison succeeded. */
    matched: boolean;
    /** Required values missing from the evaluated operand, when applicable. */
    missing?: unknown[];
}

/** Result of evaluating a single qualified access rule entry. */
export interface AccessRuleResult {
    /**
     * Zero-based index of the rule in the access policy's evaluated rules.
     *
     * @asType integer
     */
    ruleIndex: number;
    /** Rule name from the access policy (for display). */
    name: string;
    /** Whether this rule passed. */
    granted: boolean;
    /** Whether the rule was skipped because its activation did not match. */
    skipped: boolean;
    /** Denial reason from the rule definition or generated explanation. */
    reason?: string;
    /** Machine-readable activation basis. */
    activation: AccessRuleActivation;
    /** Machine-readable comparisons evaluated by the rule. */
    comparisons: AccessComparisonResult[];
    /** Qualified rule identity and semantic digest. */
    rule: RuleReference;
    /**
     * Deprecated-to-current concept substitutions that processing applied to
     * the data before this rule was evaluated.
     *
     * Present only when the data carried a deprecated concept. It completes the
     * explanation of the decision: the marking the document bears, the current
     * concept it resolved to, and the comparison this rule actually made. A
     * consumer showing why access was granted or denied should surface it, so
     * the verdict is never reported against a concept the reader never saw.
     */
    modernizedFrom?: ConceptModernization[];
}

/**
 * Overall access decision with per-rule breakdown.
 *
 * Returned by `AccessEngineAdapter.check()`. `granted` is `true` only when
 * every non-skipped rule granted access. Inspect `rules` to surface
 * per-category denial reasons in an authorization UI: each `AccessRuleResult`
 * carries a human-readable `reason` field.
 */
export interface AccessDecision {
    /** True when every rule that was not skipped granted access. */
    granted: boolean;
    /** One result per rule in the policy, in policy order. */
    rules: AccessRuleResult[];
    /**
     * Warnings from preparing and evaluating the target, including automatic
     * changes. Present on granted and denied decisions; empty when none apply.
     */
    warnings: Warning[];
}

/**
 * Per-category access evaluation: whether the user met the category's rule,
 * with details on missing concepts.
 */
export interface CategoryAccessResult {
    /** Whether the user's concepts satisfy the category's rule. */
    granted: boolean;
    /** The comparison applied to the category. */
    rule: AccessRule;
    /**
     * Why access was denied, in words, with concepts written as the marking
     * writes them. Absent when granted.
     */
    reason?: string;
    /** The concept ids the data carries in the category. */
    dataConceptIds?: string[];
    /** The concept ids the user holds in the category. */
    userConceptIds?: string[];
    /**
     * Data concept ids the user lacks, for the `superset`, `includes` and
     * `exact` comparisons. Empty when nothing is missing.
     */
    missing?: string[];
    /**
     * Resolved operational display (rendered marking view) for each id in
     * `missing`, index-aligned, so a consumer can list the unsatisfied concepts
     * by their marking rather than their raw ids. `missing` stays as the
     * machine keys.
     */
    missingDisplay?: string[];
    /**
     * Data concepts in this category that processing modernized from a
     * deprecated marking before the rule was evaluated.
     *
     * Present only when the data carried a deprecated concept. It lets an
     * explanation show the full trail (the marking the document bears, the
     * current concept it resolved to, and the comparison actually made against
     * the user) rather than reporting a decision about a concept the reader
     * never saw in the whole-document marking.
     */
    modernizedFrom?: ConceptModernization[];
}

/**
 * One deprecated-to-current concept substitution that processing applied before
 * an access rule was evaluated.
 *
 * The id fields are machine keys; the `*Display` companions carry the rendered
 * marking view, following the same split as `missing` / `missingDisplay`.
 */
export interface ConceptModernization {
    /** Current concept the access rule was evaluated against. */
    conceptId: string;
    /** Deprecated concept the data was actually marked with. */
    replacedConceptId: string;
    /** Resolved operational display for `conceptId`. */
    conceptDisplay: string;
    /** Resolved operational display for `replacedConceptId`. */
    replacedConceptDisplay: string;
}

/**
 * Human-readable description of a single access rule.
 *
 * Returned by `AccessEngineAdapter.describeAccessRule`. Tooling (LLM agents, UI
 * tooltips) can render `requirementText` directly or walk `attributesNeeded` to
 * know which `userAttributes` values a caller has to provide.
 */
export interface AccessRuleDescription {
    /** Qualified rule being described. */
    rule: RuleReference;
    /** Access artifact that owns the rule. */
    access: ArtifactReference;
    /** Scheme artifact whose assertions the rule evaluates. */
    scheme: ArtifactReference;
    /** Human-readable rule name. */
    name: string;
    /** Optional policy-authored description. */
    description?: string;
    /** Human-readable requirement expression. */
    requirementText: string;
    /** Human-readable activation expression. */
    whenText?: string;
    /** Subject or context paths required to evaluate the rule. */
    attributesNeeded: string[];
    /** Qualified rules this rule depends on. */
    dependsOn: RuleReference[];
    /** Qualified rules this rule overrides. */
    overrides: RuleReference[];
    /** Line-oriented rendering of the description. */
    lines: string[];
}

/** Trusted marking/assertion target accepted by access requirement description. */
export interface AccessRequirementsInput {
    /** Marking parsed through the bound scheme. */
    marking?: string;
    /** Structured assertions merged with assertions parsed from the marking. */
    assertions?: Assertion[];
}

/** Aggregated immutable-policy requirements for a trusted target. */
export interface AccessRequirementsDescription {
    /** Normalized marking when the caller supplied or derived one. */
    marking?: string;
    /**
     * Normalized effective target assertions, listed in print order: the
     * order `marking` places each concept; a concept it leaves out appears
     * where it would print.
     */
    assertions: Assertion[];
    /**
     * Resolved operational display (rendered marking view) for each entry in
     * `assertions`, index-aligned. A consumer that instantiates
     * `requirementText` against the target assertions substitutes this rather
     * than the raw concept id, so the requirement renders the concept's marking
     * token instead of its internal id. `assertions` keeps the machine
     * `conceptId` keys.
     */
    assertionDisplays: string[];
    /** Access artifact whose policy was described. */
    access: ArtifactReference;
    /** Scheme artifact used to normalize the target. */
    scheme: ArtifactReference;
    /** Qualified rules activated by the trusted target. */
    appliedRules: RuleReference[];
    /** Per-rule immutable-policy descriptions. */
    rules: AccessRuleDescription[];
    /** Combined human-readable requirement expression. */
    combinedRequirementText: string;
    /** Union of subject and context paths needed to evaluate the target. */
    combinedAttributesNeeded: string[];
    /** Line-oriented rendering of the combined description. */
    lines: string[];
}

/** Which scheme an access policy governs. */
export interface AccessPolicyTargetScheme {
    /** Scheme ID this access policy applies to. */
    id: string;
    /**
     * Optional specific version or version range. Absent means any version.
     */
    version?: string;
}

/**
 * The `access` envelope that wraps all access-policy fields on disk.
 *
 * @internal Runtime, post-load shape. The published document format is
 * {@link AccessDefinition}. Authors and tools that read/write access YAML/JSON
 * should target `AccessDefinition`, not this interface.
 */
export interface AccessPolicyEnvelope {
    /**
     * Unique identifier for this access policy (e.g.
     * `cedar-valley-protection-against-okta-prod`).
     */
    id: string;
    /**
     * Semantic version of this access policy document, independent of the
     * target scheme.
     */
    version?: string;
    /** Human-readable name for catalogs and error messages. */
    name?: string;
    /** Optional longer description shown where the policy is listed. */
    description?: string;
    /**
     * The access document's own overall marking, from `access.marking`. Carried
     * for display and never interpreted.
     */
    marking?: string;
    /**
     * Optional display-term overrides consulted by runtime UI components. Keys
     * are consumer-defined; each consumer merges with its own defaults via
     * `resolveVocabulary`. The `"accessHandbook"` key renames this access
     * document's own reference-surface noun (e.g. `{ accessHandbook: {
     * singular: "Access Guide" } }`); resolve it with
     * `referenceSurfaceLabel(access.vocabulary, 'accessHandbook')`, never by
     * reading the raw map directly.
     */
    vocabulary?: Vocabulary;
    /** The scheme this access policy applies to. */
    targetScheme: AccessPolicyTargetScheme;
    /** Resolved rule list, post-load, in document order. */
    rules: AccessRuleDoc[];
}

/**
 * A first-class access-rules document. Access rules are separate from the
 * marking scheme; load this document into AccessEngine independently via
 * AccessEngine.fromJSON(accessDoc).
 *
 * @internal Runtime, post-load representation. See
 * {@link AccessPolicyEnvelope} for the field-level breakdown and the
 * pointer to the public {@link AccessDefinition} wire format.
 */
export interface AccessPolicy {
    /** Root `access:` wrapper. All fields live inside this envelope. */
    access: AccessPolicyEnvelope;
}
