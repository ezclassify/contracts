import type { SourceReference } from './provenance';
import type { LayerRemovalDoc } from './scheme-definition';

/** Structural role of a marking within a processing operation. */
export type ProcessingRole = 'whole' | 'part';

/** Confidence assigned to an assertion by the processing pipeline. */
export type AssertionConfidence =
    | 'certain'
    | 'inferred'
    | 'repaired'
    | 'uncertain';

/** Severity assigned to a validation issue. */
export type ValidationSeverity = 'error' | 'warning';

/** Discrete mutation represented by an engine `Change`. */
export type FixAction = 'add' | 'remove' | 'replace' | 'reorder';

/** Stable reference to a concept a fix or change touches. */
export interface FixConceptReference {
    /** Concept identifier. */
    conceptId: string;
    /** Owning category identifier. */
    categoryId: string;
}

/**
 * Non-blocking warning category: a deprecated concept, a scheme's authored
 * `warn` rule, or a notice the engine gives about the operation itself.
 */
export type WarningKind = 'deprecation' | 'rule' | 'notice';

/** Confidence assigned to a deterministic repair. */
export type RepairConfidence = 'safe' | 'uncertain';

/**
 * Assertion set a rule condition is evaluated against.
 *
 * - `'self'` (default): the assertions currently under evaluation.
 * - `'context'`: the assertions of the whole marking this one is part of. Such
 * a condition has an answer only when the part has a verified whole, one
 * that reads and is valid. Without one (no whole given, a whole that does
 * not read, or a whole that reads but is invalid) the condition is
 * unresolved, and so is any `all`, `any` or `none` around it whose answer
 * depends on it. A rule whose `when` is unresolved never fires, changes no
 * value, reports no error and offers no fix; a check rule (`require`,
 * `require_any`, `restrict`, `forbid`, `exclusive`, `cardinality`) that the
 * marking already meets still passes, and any other unresolved rule gives
 * the part the `_whole_unverified` notice.
 * - `'contributors'`: each contributing assertion set that went into an
 * aggregate, evaluated separately. The condition holds only when EVERY
 * contributor satisfies it, and it is never satisfied outside aggregation,
 * where there are no contributors to inspect. Use it to describe what must be
 * true of every part of a document, which the merged set can no longer answer
 * once the parts have been collapsed into one.
 */
export type RuleConditionTarget = 'self' | 'context' | 'contributors';

/** Quantifies a condition block over contributing assertion sets. */
export type RuleContributorQuantifier = 'any' | 'all' | 'none';

/**
 * One element a layer takes away or brings back, named by kind and id. Exactly
 * one key. The authored vocabulary also governs the resolved layer.
 *
 * @internal
 */
export type LayerRemoval = LayerRemovalDoc;

/**
 * What makes a scheme a layer. Present only when `type === 'layer'`.
 *
 * A layer states what it takes away here, by reference; what it adds or
 * overrides stays in the ordinary sections as complete elements. Composition is
 * later-wins on id, so an element a layer declares replaces the one it
 * inherited.
 *
 * @internal
 */
export interface LayerBlock {
    /** The scheme or layer this one stacks on, as `id@version`. */
    base: string;
    /** Layers that must be composed before this one. */
    requires?: string[];
    /** Elements inherited from below that this layer takes away. */
    removes?: LayerRemoval[];
    /** Elements an earlier layer removed that this one brings back. */
    restores?: LayerRemoval[];
}

/**
 * Relative position spec for rendering order within siblings. Resolved to
 * numeric at load time.
 *
 * @internal
 */
export type PositionSpec =
    | 'first'
    | 'last'
    | number
    | {
          /** Place this element directly after the sibling with this id. */
          after: string;
      }
    | {
          /** Place this element directly before the sibling with this id. */
          before: string;
      }
    | {
          /** Place this element between the two siblings with these ids. */
          between: [string, string];
      };

/**
 * Relative rank spec for severity/aggregation weight. Resolved to numeric at
 * load time.
 *
 * @internal
 */
export type RankSpec =
    | 'top'
    | 'bottom'
    | number
    | {
          /** Rank this concept directly above the concept with this id. */
          above: string;
      }
    | {
          /** Rank this concept directly below the concept with this id. */
          below: string;
      }
    | {
          /** Rank this concept between the two concepts with these ids. */
          between: [string, string];
      };

/**
 * A single predicate that tests one category's assertions (e.g., has_content,
 * count_gt, min_order).
 */
export interface Condition {
    /**
     * Which assertion set to evaluate against: 'self' (default), 'context' (the
     * whole marking), or 'contributors' (every set that fed an aggregate).
     */
    target?: RuleConditionTarget;
    /**
     * Check the processing context role instead of assertions. When set,
     * category/operator are ignored.
     */
    role?: ProcessingRole;
    /** Id of the category whose assertions the operator tests. */
    category?: string;
    /** The test to apply to the category's assertions. */
    operator?:
        | 'has_content'
        | 'has_concept'
        | 'not_has_concept'
        | 'count_gt'
        | 'count_gte'
        | 'count_eq'
        | 'count_lt'
        | 'count_unique_gt'
        | 'count_unique_gte'
        | 'count_unique_eq'
        | 'count_unique_lt'
        | 'count_unique_lte'
        | 'min_order'
        | 'subset_of' // this category's concepts are a subset of value category's concepts
        | 'shares_concept_with' // same concept asserted in BOTH this category and the one named by value
        | 'every_has_concept' // multi-set only: every assertion set contains the named concept
        | 'any_lacks_concept'; // multi-set only: at least one assertion set is missing the named concept
    /**
     * Operand for the operator: a concept id for the concept tests, a category
     * id for `subset_of` and `shares_concept_with`, and a number for the
     * `count_*` and `min_order` tests.
     */
    value?: string | number;
}

/**
 * A node in a when-block tree: either a leaf condition or a nested any/all/none
 * quantifier.
 */
export type WhenNode =
    | Condition
    | {
          /** Evaluate this entire boolean block within each contributor. */
          target?: 'contributors';
          /**
           * Combine contributor results; defaults to all. Requires target:
           * contributors. Missing or empty contributors never satisfy the block.
           */
          quantifier?: RuleContributorQuantifier;
          /** Holds when at least one node holds. */
          any?: WhenNode[];
          /** Holds when every node holds. */
          all?: WhenNode[];
          /** Holds when no node holds. */
          none?: WhenNode[];
      };

/**
 * Conditional block. Uses standard boolean quantifiers:
 *
 * - Array form: all conditions must pass (single-set AND)
 * - Object with any/all/none: standard OR/AND/NOT-OR over leaf or nested nodes
 *   Multiple quantifier keys on the same object are AND'd together.
 */
export type When =
    | Condition[]
    | {
          /** Evaluate this entire boolean block within each contributor. */
          target?: 'contributors';
          /**
           * Combine contributor results; defaults to all. Requires target:
           * contributors. Missing or empty contributors never satisfy the block.
           */
          quantifier?: RuleContributorQuantifier;
          /** Holds when at least one node holds. */
          any?: WhenNode[];
          /** Holds when every node holds. */
          all?: WhenNode[];
          /** Holds when no node holds. */
          none?: WhenNode[];
          /** Contexts this condition applies in (e.g., ['render', 'suggest']). */
          scope?: string[];
      };

/**
 * Canonical rollup operator. `pipeline` requires a matching entry in the
 * scheme's `rollup_pipelines`. Most merge operators are set-algebraic over each
 * input's assertions; rank-based operators (max/min/least_upper_bound) require
 * categories whose concepts declare `rank`.
 */
export type Rollup =
    | 'max'
    | 'min'
    | 'union'
    | 'intersection'
    | 'symmetric_difference'
    | 'exclusive_or'
    | 'complement'
    | 'first'
    | 'last'
    | 'least_upper_bound'
    | 'pipeline';

/**
 * Group of categories resolved together by a single pipeline. The first
 * category listed is the pipeline's primary category and must declare the
 * `pipeline` rollup; the others may declare any rollup. A category may appear
 * in at most one group. `mode` controls step evaluation:
 *
 * - `ordered` (default): first matching step wins, subsequent steps skipped
 * - `all`: every matching step fires in sequence; effects compose.
 *
 * @internal
 */
export interface RollupPipeline {
    /** Pipeline id. */
    id: string;
    /** Ids of the categories the pipeline resolves; the first is primary. */
    categories: string[];
    /** Conditional steps, evaluated in order. */
    steps: RollupPipelineStep[];
    /** Whether only the first matching step fires or every matching step. */
    mode?: 'ordered' | 'all';
    /** Human-readable explanation of what the pipeline does. */
    explanation?: string;
}

/**
 * A conditional step in a pipeline aggregation rule: when conditions match,
 * apply the then action.
 *
 * @internal
 */
export interface RollupPipelineStep {
    /** Condition block: multi-set quantifiers for aggregation */
    when?: When;
    /** Action to take when condition matches */
    then: {
        /**
         * Assert these concepts in the pipeline's primary category (replaces
         * all other concepts in that category).
         */
        keep?: string | string[];
        /** Remove these concepts from the result */
        remove?: string[];
        /**
         * Intersect a category's concepts across the inputs, with an optional
         * fallback. A group concept is expanded to its members before a
         * single category is intersected.
         * Single object or array: if array, ALL must produce non-empty results
         * or the first empty_fallback fires (and remaining intersects are
         * skipped). fallback_if_only: list of concepts; if the intersection
         * result contains ONLY these concepts (and no others), treat it as
         * empty and fire the fallback.
         */
        intersect?:
            | {
                  /** Id of the category to intersect. */
                  category?: string;
                  /** Ids of several categories to intersect together. */
                  categories?: string[];
                  /**
                   * Concept asserted when the intersection is empty. Firing it
                   * also clears the intersected categories.
                   */
                  empty_fallback?: string;
                  /**
                   * Concept assumed for an input that carries the category's
                   * header concept but none of its concepts.
                   */
                  wildcard_default?: string;
                  /**
                   * Concepts that, if they are all the intersection holds, make
                   * it count as empty.
                   */
                  fallback_if_only?: string[];
              }
            | Array<{
                  /** Id of the category to intersect. */
                  category: string;
                  /**
                   * Concept asserted when the intersection is empty. Firing it
                   * also clears the intersected categories.
                   */
                  empty_fallback?: string;
                  /**
                   * Concept assumed for an input that carries the category's
                   * header concept but none of its concepts.
                   */
                  wildcard_default?: string;
                  /**
                   * Concepts that, if they are all the intersection holds, make
                   * it count as empty.
                   */
                  fallback_if_only?: string[];
              }>;
        /** Also clear these categories from the result */
        clear_categories?: string[];
        /** Union all assertions from input sets for this category */
        union?: boolean;
        /** Replace specific concepts with others in the result */
        replace?: Array<{
            /** Id of the concept to replace. */
            from: string;
            /** Id of the concept that takes its place. */
            to: string;
        }>;
        /**
         * Add concepts to specific categories in the result. Each entry names
         * the concept(s) and target category. Used to re-home a concept into a
         * scheme-defined category during merge.
         */
        add?: Array<{
            /** Id of the concept or concepts to add. */
            concept: string | string[];
            /** Id of the category to add them to. */
            category: string;
        }>;
        /**
         * Copy concepts from one category into another in the result. `exclude`
         * drops specific concepts during the copy.
         */
        copy?: {
            /** Id of the source category. */
            from: string;
            /** Id of the destination category. */
            to: string;
            /** Ids of concepts to leave out of the copy. */
            exclude?: string | string[];
        };
        /**
         * Move concepts from one category into another in the result (copy +
         * remove from source). Concepts named in `exclude` are not moved; they
         * stay in the source category. `keep_intersection: true` also keeps in
         * the source every concept that appears in the source category on
         * every contributing part, but only when at least one concept named in
         * `exclude` is among them. That shared excluded concept anchors the
         * parts as one joint source. When no excluded concept is on every
         * part, every concept not named in `exclude` moves, shared or not.
         */
        move?: {
            /** Id of the source category. */
            from: string;
            /** Id of the destination category. */
            to: string;
            /** Ids of concepts that stay in the source category. */
            exclude?: string | string[];
            /**
             * Also keep in the source the concepts every contributing part
             * shares, as described above.
             */
            keep_intersection?: boolean;
        };
    };
}

/** Minimum contract for items evaluable by the `when` condition framework. */
export interface Selectable {
    /** The id of the concept. */
    conceptId: string;
    /** The id of the category the concept is asserted in. */
    categoryId: string;
}

/**
 * A concept asserted in a category during processing, with confidence level and
 * provenance metadata.
 *
 * Assertions are the core data unit flowing through the engine pipeline.
 * `confidence` records how the assertion was produced: `'certain'` when read
 * or handed in as stated, `'inferred'` when an inference rule added it, and
 * `'repaired'` when the engine added or rewrote it while repairing the
 * marking. The engine does not assign `'uncertain'` itself. `source` says
 * where the assertion came from. `expiresAt` records caller-supplied expiry
 * metadata. The engine does not evaluate that date or automatically change
 * confidence or the marking; the host applies its expiry policy.
 */
export interface Assertion extends Selectable {
    /**
     * How the assertion was produced: `certain` when read or handed in as
     * stated, `inferred` when an inference rule added it, or `repaired` when
     * the engine added or rewrote it while repairing the marking. The engine
     * does not assign `uncertain` itself.
     */
    confidence: AssertionConfidence;
    /**
     * Where this assertion came from. An open string: the engine labels the
     * facts it adds, and a caller or a host may label the facts it hands in
     * however it likes.
     *
     * Four labels mean the engine derived the fact, so it derives the fact
     * again each time it settles a marking: `infer`, and `repair` with a
     * `sourceRule`, a fact a scheme rule adds; `default`, a category's default
     * concept; and `context`, a value a part took from its whole. When
     * validate, process or explain settles a marking, a fact handed in under
     * one of them is set aside and comes back only if the engine derives it
     * again, so no label can make a removal silent.
     *
     * Every other label is the author's statement and is kept as given:
     * `parse` (read from text), `user` (handed in by a caller), `aggregate`
     * (a value a rollup states as its own, even one a contributor derived or
     * took from its whole), every other label the engine writes
     * on a result, and any label a caller or host chooses, such as `stated`.
     */
    source: string;
    /**
     * The id of the scheme rule that produced this assertion, when one did.
     * Otherwise an engine-owned id beginning with `_`, set when the scheme's
     * structure, not a rule, added the assertion. The engine writes two:
     * `_tier_child_requires_parent` (a tier parent required by a stated
     * child) and `_header_of_stated_member` (a header filled in for a stated
     * member). A scheme rule id never begins with `_`.
     */
    sourceRule?: string;
    /** Caller-supplied ISO 8601 expiry date; the engine does not evaluate it. */
    expiresAt?: string;
    /**
     * The value of a concept that takes one (`text_input`).
     *
     * A value handed in is read the way a value in text is: it settles in the
     * spelling the concept's encoding stores. One the encoding cannot read is
     * reported as the error `_invalid_assertion_value`, and a concept that
     * takes a value, handed in with none, as `_missing_assertion_value`. See
     * `ValidationError`.
     */
    value?: string;
    /**
     * Caller-defined data attached to the assertion. The engine assigns it no
     * meaning.
     */
    metadata?: Record<string, unknown>;
    /**
     * The deprecated concept this assertion was modernized from.
     *
     * Set when processing rewrote a deprecated concept into the replacement its
     * scheme declares. `conceptId` is the current concept every downstream
     * stage evaluates; this field records what the data was actually marked
     * with, so an explanation can show the substitution ("concept A was
     * replaced by concept B; B is what your access was compared against")
     * instead of silently presenting a concept the document never carried.
     *
     * It travels on the assertion rather than alongside it because assertion
     * arrays are the engine's state transport: an access check made from
     * transported assertions can still explain the substitution.
     */
    replacedConceptId?: string;
    /**
     * Source provenance for the concept that backed this assertion.
     *
     * Populated only when the concept came from an external source whose
     * records were loaded with the scheme (typically one a scheme's
     * `concepts.external` block declares). Inline-backed assertions leave this
     * field undefined to keep payloads compact for the common single-source
     * case. A concept a scheme document declares in its `inline` list has
     * none, even when one of that document's `external` sources also serves a
     * record with its id. A concept read through a queryable-only source
     * (`SourceCapabilities.queryableOnly`) has none either: that source is
     * asked per lookup and never loaded whole, and a lookup does not say which
     * source answered. Such a source still appears in a composed operation's
     * `resolution.sources`. Across a layered stack the later layer decides: a
     * concept a later layer's source supplies carries that source's provenance
     * even when an earlier document declares it inline, and a concept a later
     * layer declares inline carries none.
     *
     * Identity fields mirror the source's `sourceIdentity()` observation at
     * engine-load time (or the immutable value the Context pinned).
     */
    provenance?: SourceReference;
}

/**
 * A constraint violation detected during validation, referencing the constraint
 * ID and a human-readable message.
 *
 * Carried in the `errors` of every result that judges a marking.
 * `constraintId` identifies the rule that fired; `message` is human-readable.
 * When `severity` is `'warning'`, the violation is advisory and does not set
 * `valid` to `false`. Use `categoryId` and `affectedConcepts` to highlight the
 * specific UI elements involved.
 *
 * Two of the ids the engine keeps for itself are for a fact a caller hands in
 * that cannot be settled as given: `_missing_assertion_value`, a concept that
 * takes a value handed in with none, and `_invalid_assertion_value`, a value
 * the concept's encoding cannot read. Each is an error on the result, not a
 * refused request: the fact is left out of the settled marking and named in
 * `affectedConcepts`.
 *
 * Another, `_exceeds_whole`, is a part that carries more than the whole it is
 * read in: the whole does not cover a value the part holds, carries one the
 * part does not allow, or, in a category a rollup pipeline resolves, would
 * change if rolled up with the part. It is given only for a part that is valid
 * on its own, read in a whole that reads and is valid. `affectedConcepts`
 * names every finding, and no fix answers it. See `ProcessingContext.partOf`.
 */
export interface ValidationError {
    /**
     * The id of the constraint that was violated: a scheme rule's id, or an
     * engine-reserved id beginning with `_`.
     */
    constraintId: string;
    /** What is wrong, in words a person can act on. */
    message: string;
    /**
     * Category ID this error relates to (when determinable from the
     * constraint).
     */
    categoryId?: string;
    /**
     * Severity: 'error' blocks validity, 'warning' is advisory. Default:
     * 'error'.
     */
    severity?: ValidationSeverity;
    /** Concept IDs involved in this validation failure. */
    affectedConcepts?: string[];
    /**
     * The `message` of the proposed fix that answers this error, such as "Add
     * CTRL-A".
     *
     * Set only on a result that carries that fix in its own `proposedFixes`. A
     * result with no fix paths, such as a `ValidateResult` or a scan region,
     * never sets it, so a reader never holds a pointer to a fix it was not
     * given.
     */
    suggestedFix?: string;
    /**
     * The ids of the concepts the unread token was likely meant as. Never
     * empty. They are ids for a program to act on, not spellings to show an
     * author: `message` gives the same hint in words, naming the spellings.
     *
     * Set only on an `_unmatched_token` error, which is about one token the
     * engine could not read, and only when that token reads as a misspelling
     * of some concept's spelling. The concepts named are tied for nearest, so
     * their order ranks none above another.
     *
     * Its absence is no evidence that the token is stray text. A token too
     * short to judge carries none, and so does one equally near to too many
     * concepts. A token that already spells a concept, apart from case,
     * carries none even when it is also near another concept: it was left
     * unread for another reason, such as where it stands, and naming a
     * different concept would point the author away from a word they spelled
     * right.
     *
     * It is not a fix: nothing here has been proven to make the marking
     * valid, and `suggestedFix` and the result's fix paths do not depend on
     * it.
     *
     * @minItems 1
     */
    didYouMean?: string[];
}

/**
 * One way to make the marking valid. Every change in it answers an error.
 *
 * A fix is a whole marking, not a patch: `rendered` is the complete marking the
 * author would end up with. The engine proves each one before offering it: it
 * reads the marking back, judges it the way it judges any input, and offers
 * only those that read back valid.
 */
export interface Fix {
    /** What this fix does, in words. */
    message: string;
    /**
     * The valid marking this fix produces, in the result's output format.
     *
     * It is written exactly as the result's own `rendered` is, so the two can
     * be shown side by side. On an in-process engine with an `afterRender`
     * plugin, that includes the plugin; the proof reads back the engine's own
     * writing from before the plugin ran, so the plugin never decides which
     * fixes are offered.
     */
    rendered: string;
    /** Concepts of the author's marking this fix keeps. */
    keeps: FixConceptReference[];
    /** Concepts this fix adds because an error requires them. */
    adds: FixConceptReference[];
    /**
     * Concepts of the author's marking this fix removes because an error names
     * them.
     */
    removes: FixConceptReference[];
}

/** A change the engine actually made while processing. Lives in `appliedFixes`; a declined addition is not a change. */
export interface Change {
    /**
     * Rule that made this change: a scheme rule's id, or an id the engine
     * keeps for a change no scheme rule names.
     *
     * `_recognition_role` is one of them: the text was read as a view of one
     * role, for a request whose context names the other. See
     * `ValidateResult.inputWasValid`, and `ValidateResult.appliedFixes` for
     * how it is shown.
     */
    ruleId: string;
    /**
     * 'add' (only `add` set), 'remove' (only `remove` set), 'replace' (both),
     * 'reorder' (neither: the input parsed via a tolerant rule; the canonical
     * form is in the result's `rendered`).
     */
    action: FixAction;
    /** Concepts the change added. Set for `add` and `replace`. */
    add?: FixConceptReference[];
    /** Concepts the change removed. Set for `remove` and `replace`. */
    remove?: FixConceptReference[];
    /** Concept IDs whose presence triggered the rule that made this change. */
    triggerConceptIds?: string[];
    /** What the change did, in words. */
    message: string;
}

/**
 * A non-blocking informational signal surfaced in a result's `warnings`.
 *
 * Unlike `ValidationError`, warnings never affect `valid`. `kind:
 * 'deprecation'` fires when a deprecated concept is asserted, and
 * `replacement` names a suggested successor concept. `kind: 'rule'` fires when
 * a scheme's authored `warn` rule matches the marking, with the rule's id as
 * `ruleId`. `kind: 'notice'` is the engine speaking about the operation itself
 * rather than about anything the scheme declares; its `ruleId`, when present,
 * is an engine-reserved id beginning with `_`, the same convention a
 * `ValidationError` follows.
 *
 * A marking's warnings come in a fixed order: deprecations first, then the
 * scheme's rule warnings in the order the scheme declares its rules, then the
 * engine's notices. An aggregate's warnings are about the rolled-up marking,
 * not about each marking that fed it.
 */
export interface Warning {
    /**
     * The scheme rule that gave a `rule` warning, or the engine-reserved id of
     * a `notice`. Absent on a deprecation warning.
     */
    ruleId?: string;
    /**
     * Concept this warning relates to (when applicable). A rule warning names
     * one when the rule's `when` names exactly one concept the marking holds.
     */
    conceptId?: string;
    /**
     * Resolved operational display for `conceptId` (the concept's rendered
     * marking view), for a consumer that shows the warning next to the concept.
     * `conceptId` stays as the machine key; this is the human-visible string.
     */
    conceptName?: string;
    /** Category this warning relates to (when applicable) */
    categoryId?: string;
    /**
     * Warning kind: 'deprecation' for a deprecated concept, 'rule' for a
     * scheme's authored `warn` rule, 'notice' for the engine's own notice.
     */
    kind: WarningKind;
    /** Human-readable message */
    message: string;
    /** When kind=deprecation, the suggested replacement concept id (if any) */
    replacement?: string;
    /**
     * When kind=deprecation, the resolved operational display for `replacement`
     * (the successor concept's rendered marking view). `replacement` stays as
     * the machine key; this is the human-visible string.
     */
    replacementName?: string;
}

/**
 * One step in the engine's explanation trace: which stage acted, what it did,
 * and which concept/rule was involved.
 *
 * Lives in `ExplanationTrace.entries`. Consumers use the trace to render a "why
 * was this marking produced?" breakdown. `stage` is one of `parse | repair |
 * infer | validate | render`; `conceptId` and `ruleId` identify the specific
 * element that drove the action.
 */
export interface TraceEntry {
    /**
     * The pipeline stage that acted, such as `parse`, `normalize`, `repair`,
     * `infer`, `validate`, `render`, `aggregate` or `context`. An open string.
     */
    stage: string;
    /**
     * What the stage did, as a short machine-readable token, such as
     * `asserted`, `inferred`, `removed` or `unmatched`. An open string.
     */
    action: string;
    /**
     * A sentence describing the step for a person. It is prose and must not be
     * parsed; the structured fields carry the ids.
     */
    detail: string;
    /** The concept the step acted on, when it acted on one. */
    conceptId?: string;
    /**
     * Resolved operational display for `conceptId` (the concept's rendered
     * marking view), so a "why" breakdown UI can show the marking rather than
     * the raw id. `conceptId` stays as the machine key.
     */
    conceptName?: string;
    /**
     * Category the action landed in, when the acting rule declared one. This is
     * the structured channel for the category: `detail` is human-facing prose
     * and must never be parsed to recover it.
     */
    categoryId?: string;
    /** The scheme rule that drove the step, when one did. */
    ruleId?: string;
    /** Concept IDs that triggered the rule producing this entry. */
    triggerConceptIds?: string[];
}

/**
 * Full pipeline trace for one marking: parse input, repairs applied, inferences
 * drawn, validation errors, and the final output.
 *
 * What `explain` returns, and nothing else. It takes what `process` takes and
 * answers why the engine settled the marking the way it did, step by step. No
 * other result carries it, because their callers want the answer rather than
 * the working. Debug tools use this to explain why a marking was accepted or
 * rejected. `repairs` lists each repair rule that fired and the before/after
 * strings. `inferences` lists each inference rule that added a concept and the
 * reason text.
 */
export interface ExplanationTrace {
    /** The marking text the explanation was asked for, as given. */
    input: string;
    /** The id of the scheme the marking was read against. */
    schemeId: string;
    /** Every step the pipeline took, in the order it took them. */
    entries: TraceEntry[];
    /** Each repair rule that rewrote the input, in the order applied. */
    repairs: TraceRepair[];
    /** The constraints the settled marking violates. */
    validationErrors: TraceValidationIssue[];
    /** Each concept an inference rule added, in the order added. */
    inferences: TraceInference[];
    /**
     * The assertions the pipeline settled on, listed in print order as a
     * validate result's `assertions` are.
     */
    finalAssertions: Assertion[];
    /** The settled marking, written in the output format. */
    rendered: string;
}

/** Repair recorded in an explanation trace. */
export interface TraceRepair {
    /** The id of the repair rule that fired. */
    ruleId: string;
    /** What the repair does, as the scheme describes it. */
    description: string;
    /** The confidence the scheme declares for the repair rule. */
    confidence: RepairConfidence;
    /** The text before the repair. */
    before: string;
    /** The text after the repair. */
    after: string;
    /**
     * True when the repair changed only formatting and left the assertions as
     * they were.
     */
    cosmetic?: boolean;
}

/**
 * Validation issue recorded in an explanation trace: the constraint that failed
 * and its message, and nothing else. The category, severity and concepts of the
 * error it came from belong to the error, which a validate or process result
 * reports in `errors`.
 */
export interface TraceValidationIssue {
    /** The id of the constraint that failed. */
    constraintId: string;
    /** What is wrong, in words. */
    message: string;
}

/** Inference recorded in an explanation trace. */
export interface TraceInference {
    /** The id of the inference rule that fired. */
    ruleId: string;
    /** The concept the rule added. */
    conceptId: string;
    /**
     * Resolved operational display for `conceptId` (the concept's rendered
     * marking view), so a "why" breakdown UI can show the inferred marking
     * rather than the raw id. `conceptId` stays as the machine key.
     */
    conceptName?: string;
    /** Why the rule added the concept, in words. */
    explanation: string;
}

/**
 * A concept offered to the user in the suggest UI, with label, description,
 * group, and current selection state.
 *
 * Returned in `SuggestResult.suggestions`. `selected: true` means the concept
 * is already in the current marking; clicking it again removes it. `order`
 * controls display position within the group. `views` carries all render-format
 * representations so the UI can switch formats without a second query. `source`
 * distinguishes concepts from parsing the input (`'parse'`), preset shortcuts
 * (`'preset'`), or alias matches (`'alias'`).
 */
export interface Suggestion {
    /** The id of the suggested concept. */
    conceptId: string;
    /** The category the concept belongs to. */
    categoryId: string;
    /** Primary display label in the current render format. */
    label: string;
    /** Secondary label (longer name or alternate view). */
    description: string;
    /** Human-readable concept name. */
    name: string;
    /** All views for this concept. */
    views: Record<string, string>;
    /** Category label for UI grouping. */
    group: string;
    /** True if this concept is already in the current marking. */
    selected: boolean;
    /**
     * Sort order.
     *
     * @asType integer
     */
    order: number;
    /**
     * `preset` on a row that offers a label preset, whose `conceptId` is
     * `preset:` followed by the preset id. A concept row leaves it unset.
     */
    source?: 'parse' | 'preset' | 'alias';
    /**
     * True when this concept matches the active filter but is currently gated
     * by the scheme's rules (a rule prerequisite is unmet, or a constraint
     * forbids it). Gated suggestions are surfaced as non-selectable,
     * explanatory rows so the user can see why the concept is unavailable. Only
     * populated when the caller passes `includeGated: true` and a filter is
     * active.
     */
    gated?: boolean;
    /**
     * When `gated` is true, the unmet prerequisite concept ids that would
     * unlock this concept. Empty array when the concept is gated by a
     * constraint with no specific prerequisite (e.g. mutual exclusion).
     */
    requires?: string[];
    /**
     * Resolved operational display (rendered marking view) for each id in
     * `requires`, index-aligned, so the unlock row can read "add X first" with
     * the marking rather than the raw id. `requires` stays as the machine
     * keys.
     */
    requiresDisplay?: string[];
}

/**
 * What suggest answers: the concepts a picker may offer, and nothing about the
 * marking itself.
 *
 * How the current marking reads and whether it stands are what validate and
 * process answer, and suggest does not repeat them. A caller that wants both in
 * one round trip asks process for them with `suggestFor`.
 */
export interface SuggestResult {
    /** The concepts on offer, in display order. */
    suggestions: Suggestion[];
    /**
     * Advisories raised while building the options, such as a concept source
     * that could not answer in full. Empty when there were none. Advisories
     * about the marking itself belong to validate and process.
     */
    warnings: Warning[];
}

/**
 * Suggestions for several categories, keyed by category id.
 *
 * Each entry holds the options for its own category and no other, answered as
 * if that category's own assertions were not yet chosen, so a picker can offer
 * the alternatives to its current selection, not only what can still be added
 * beside it. A label preset belongs to no category, so no entry offers one.
 * `suggestForCategories` returns this, and so does a process call that names
 * categories in `suggestFor`.
 */
export type SuggestResultsByCategory = Record<string, SuggestResult>;

/** What kind of notice a concept carries. */
export type ConceptNoticeType =
    | 'warning'
    | 'handling'
    | 'admonition'
    | 'distribution'
    | 'info';

/**
 * Regulatory or handling notice attached to a concept: the text the marking
 * requires, what kind of notice it is, whether showing it is mandatory, and an
 * optional condition that gates it.
 *
 * Where the text appears and how it is styled are the host's to decide. A
 * scheme states what has to be said, not where the document says it.
 */
export interface ConceptNotice {
    /** What kind of notice this is. */
    type: ConceptNoticeType;
    /** Whether this notice MUST be displayed (regulatory requirement) */
    required: boolean;
    /** The notice text the marking requires. */
    text: string;
    /** Only show when this concept is also present */
    condition?: string;
    /**
     * The value this notice is registered under, keyed by view.
     *
     * A view that has a controlled vocabulary for notices spells this notice as
     * one of its values; a view that has none, or that does not register this
     * particular notice, has no entry here and the notice travels unregistered.
     * The value belongs to the notice because that is what it names: a second
     * notice on the same concept is a second registration.
     */
    views?: NoticeViewValues;
}

/**
 * The value a notice is registered under, keyed by view name, e.g.
 * `{ ism: 'RD' }`.
 *
 * Structurally the same map as `ViewLabels` and deliberately not the same
 * type. A view label is how a view spells something for a reader; this is the
 * token a view's own vocabulary files the notice under, and one is never
 * substitutable for the other.
 */
export type NoticeViewValues = Record<string, string>;

/**
 * A notice that was resolved and collected for a specific concept in a
 * processed marking. Notices originate from the concept's
 * `documentation.notices` definitions and may be conditional (only fire when
 * another concept is simultaneously asserted) or unconditional.
 *
 * Returned by `SchemeEngine.collectNotices()`, and carried on every result that
 * describes a marking, so reading the notices for a processed marking does not
 * take a second call. The `required` flag indicates whether the notice
 * represents a mandatory acknowledgment the UI must surface before the user can
 * submit the marking.
 */
export interface CollectedNotice {
    /** The concept the notice is attached to. */
    conceptId: string;
    /** The concept's display name, for showing beside the notice. */
    conceptName: string;
    /** What kind of notice this is. */
    type: ConceptNotice['type'];
    /** The notice text the marking requires. */
    text: string;
    /**
     * Whether the notice must be shown. A host surfaces a required notice
     * before the marking is accepted.
     */
    required: boolean;
    /**
     * The notice's own `ConceptNotice.views`, carried through unchanged.
     *
     * A host that emits a notice into a structured form needs the value the
     * form's own vocabulary registers it under, and it has the collected notice
     * rather than the concept it came from. Absent when the notice declares no
     * registration at all.
     */
    views?: NoticeViewValues;
}

/**
 * Display labels keyed by view name, e.g. `{ default: 'SECRET', short: 'S' }`.
 *
 * Concepts and categories carry the identical shape, so they share one type
 * rather than each declaring a parallel map. Two structurally identical
 * component schemas would generate two interchangeable-but-distinct types in
 * every SDK, which is the thing a named shape is supposed to prevent.
 */
export type ViewLabels = Record<string, string>;

/**
 * Locale-specific display labels for a concept, keyed by locale code.
 *
 * Structurally the same map as `ViewLabels` and deliberately not the same
 * type: a locale key selects a language, a view key selects a presentation
 * mode, and collapsing them would let one be passed where the other is meant.
 */
export type ConceptSynonyms = Record<string, string>;

/**
 * Free-text input configuration for a concept that accepts a typed value
 * instead of being a fixed selection.
 */
export interface ConceptTextInput {
    /** Hint text shown in the UI input field. */
    placeholder?: string;
    /** Display label for the input field in forms. */
    label?: string;
    /**
     * Whether a value must be provided. Defaults to true; when false the
     * concept can be asserted without a text value.
     */
    required?: boolean;
    /**
     * How the value is spelled and stored. Absent means plain text.
     *
     * The resolved form of `text_input.encoding`. An encoding states both
     * directions: what may be read and how the stored value is written back.
     */
    encoding?: ValueEncoding;
    /** Hint for locating this concept's free text when nothing has bound it. */
    recognition?: TextInputRecognition;
}

/** Words that may open an unbound run of a concept's free text. */
export interface TextInputRecognition {
    /** Opening words that help find text no field has bound yet. */
    beginsWithWord?: string[];
}

/**
 * What one component of a `composite` encoding stands for: free text, or a
 * reference to known concepts.
 */
export type CompositeEncodingFieldType = 'text' | 'concept';

/** One component of a resolved `composite` encoding. */
export interface CompositeEncodingField {
    /** Component name, used in diagnostics. */
    name: string;
    /** Whether the component is free text or a reference to known concepts. */
    type: CompositeEncodingFieldType;
    /** Whether the component must be present. Default true. */
    required?: boolean;
    /** Written once before the component. */
    prefix?: string;
    /** Written once after the component. */
    suffix?: string;
    /** `type: concept`: the concept ids this component may name. */
    concepts?: string[];
    /** `type: concept`: the view the component is written in. */
    view?: string;
}

/** A free-text value stored exactly as supplied. */
export interface TextValueEncoding {
    /** Plain text, stored exactly as supplied. */
    type: 'text';
    /**
     * Reject a value longer than this many characters.
     *
     * @asType integer
     */
    maxLength?: number;
    /**
     * A validation constraint: the value is rejected unless the whole of it
     * matches. Never a recognition device, and nothing is extracted from it.
     */
    pattern?: string;
}

/**
 * One spelling of a calendar date. The canonical spelling is the one a value is
 * stored in; the others are read on input and written per view.
 */
export type CalendarDateSpelling = 'YYYYMMDD' | 'YYYY-MM-DD';

/**
 * Output spelling per view name. A view not named here writes the canonical
 * spelling.
 */
export type CalendarDateViewSpellings = Record<string, CalendarDateSpelling>;

/** A value that is a calendar date: a real year, month and day. */
export interface CalendarDateValueEncoding {
    /** A calendar date: a real year, month and day. Never a timestamp. */
    type: 'calendar-date';
    /** The spelling the value is stored in. */
    canonical: 'YYYY-MM-DD';
    /** Spellings accepted on input. */
    accepts: CalendarDateSpelling[];
    /** Per-view output spelling; views not named here use `canonical`. */
    views?: CalendarDateViewSpellings;
}

/** An ordered set of components stored as one normalized string. */
export interface CompositeValueEncoding {
    /** An ordered set of components stored as one normalized string. */
    type: 'composite';
    /** Joins the components. */
    separator?: string;
    /** The components, in the order they are written. */
    fields: CompositeEncodingField[];
}

/**
 * How a free-text value is spelled and stored: the resolved codec.
 *
 * A codec, not a validator. Every encoding states both directions, so a value
 * this contract accepts is a value it can write back.
 */
export type ValueEncoding =
    | TextValueEncoding
    | CalendarDateValueEncoding
    | CompositeValueEncoding;

/** Metadata describing which organizations use a concept and any usage notes. */
export interface ConceptApplicability {
    /** Identifiers of the organizations that use the concept. */
    organizations?: string[];
    /** A note on where or how the concept applies, for a person. */
    note?: string;
}

/** Structured documentation for a concept, with basic/detailed typing. */
export interface ConceptDocumentation {
    /** Human-readable definition of this concept (basic, shown in tooltips) */
    definition?: string;
    /**
     * Usage guidance for this concept (detailed, shown in handbook/reference
     * views)
     */
    guidance?: string;
    /** Applicability metadata: which organizations use this concept (detailed) */
    applicability?: ConceptApplicability;
    /** Regulatory or handling notices (basic, always surfaced when present) */
    notices?: ConceptNotice[];
}

/**
 * Portable scheme-default display colors, carried as a text/background pair so
 * contrast is authored together. In category mode they are declared only on
 * concepts in the category named by `render.color_from`; consuming hosts may
 * override them.
 *
 * Both values are CSS hex (`#rgb` or `#rrggbb`). The pair travels together so a
 * host never composes one authored color against an unknown surface (the
 * white-on-white failure mode).
 */
export interface ConceptColor {
    /**
     * Background color as a CSS hex string.
     *
     * @pattern ^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$
     */
    background: string;
    /**
     * Text/foreground color as a CSS hex string.
     *
     * @pattern ^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$
     */
    text: string;
}

/** Ordered scheme-default or host display-color override. */
export interface MarkingColorRule {
    /**
     * Assertion-set condition. Omit only on the final rule to create the
     * standard unconditional/anything-else fallback.
     */
    when?: RuleWhen;
    /** Complete background/text pair to use when the condition matches. */
    color: ConceptColor;
}

/**
 * A concept as the engine holds it after loading: one value a marking can
 * assert, with the categories it belongs to, its spellings and views, its
 * place in any hierarchy, and its documentation.
 *
 * @internal
 */
export interface Concept {
    /** Unique identifier for this concept within the scheme */
    id: string;
    /** Human-readable display name */
    name: string;
    /**
     * Display representations keyed by mode; must include 'default'. Additional
     * views (e.g. 'short', 'full', 'export') provide alternative renderings for
     * different render formats via RenderFormat.view.
     */
    views: ViewLabels;
    /**
     * Scheme-default display color pair. Only meaningful in category mode on
     * concepts in the category named by `render.color_from`; the loader
     * enforces that placement. Hosts retain final presentation precedence.
     */
    color?: ConceptColor;
    /** Alternative strings that parse to this concept (case-insensitive) */
    aliases: string[];
    /**
     * Category IDs this concept belongs to; a concept can appear in multiple
     * categories
     */
    categories: string[];
    /**
     * Broader concept IDs forming a hierarchy chain. Used for inheritance,
     * hierarchy rendering, and circular-reference detection.
     */
    parents: string[];
    /**
     * Resolved display position within a category (lower = rendered earlier).
     * Populated from the concept's YAML file position, or from a relative
     * `position: first | last | { after: <id> }` spec when declared.
     */
    position: number;
    /**
     * Resolved severity rank for max/min aggregation (higher = more severe).
     * Set from the concept's `rank` spec in the scheme document. Undefined
     * when the category does not use rank aggregation.
     */
    rank?: number;
    /**
     * Raw position spec from the scheme document, before resolution.
     * Preserved for layer merging and diagnostics.
     */
    positionSpec?: PositionSpec;
    /**
     * Raw rank spec from the scheme document, before resolution. Preserved for
     * layer merging and diagnostics.
     */
    rankSpec?: RankSpec;
    /**
     * Tier label. Declaring a tier marks this concept as a **partial marking**:
     *
     * - It has no semantic meaning standalone. If parsed without an asserted
     *   parent (anywhere in `parents`), the parser drops it as an orphan.
     * - At render time, the format field's `tiers` entry for this tier names
     *   what attaches the concept to its parent (`attached_by`, e.g. parent +
     *   "-" + child).
     *
     * Concepts WITHOUT `tier:` are complete markings; any `parent:` they carry
     * is treated as taxonomy metadata for hierarchical display only, not as a
     * parsing requirement.
     */
    tier?: string;
    /**
     * For group concepts: the member concept IDs. When the category has
     * collapseGroups enabled and the group is present with all of its
     * members, the group is rendered in place of them.
     */
    members?: string[];
    /**
     * Scope IDs this concept is visible in. Empty or undefined means visible in
     * all scopes.
     */
    scopes?: string[];
    /**
     * Whether this concept is deprecated. Deprecated concepts still parse but
     * generate deprecation warnings in the explanation trace.
     */
    deprecated?: boolean;
    /**
     * Human-readable deprecation message explaining why this concept was
     * deprecated
     */
    deprecatedMessage?: string;
    /** Concept ID that should be used instead of this deprecated concept */
    deprecatedReplacement?: string;
    /** Locale-specific display labels: locale code -> display string */
    synonyms?: ConceptSynonyms;
    /**
     * Structured documentation block. When present,
     * definition/guidance/applicability/notices are read from here.
     */
    documentation?: ConceptDocumentation;
    /**
     * Where in the governing document this concept was read from. Free text,
     * carried through from the authored scheme for provenance and audit.
     *
     * Deliberately NOT part of {@link ConceptDocumentation}: the documentation
     * block is display content (tooltips, handbook views), and a citation is
     * never parsed, matched on, or rendered.
     */
    citation?: string;
    /**
     * Free-text input configuration. When present, this concept accepts
     * user-typed text (e.g., country codes, project names) instead of being a
     * fixed selection. See {@link ConceptTextInput} for the field meanings.
     */
    textInput?: ConceptTextInput;
    /**
     * Concept IDs that this concept supersedes (replaces). When present, the
     * scheme loader generates supersedes constraints from these references.
     */
    supersedes?: string[];
    /**
     * The category whose values this concept stands for: the values a whole
     * holds in it. A part holding the concept takes them when it is read
     * against a whole, and keeps the concept so a format can write it back
     * the way it was read. Authored as `stands_for_whole`.
     */
    standsForWhole?: string;
}

/**
 * A concept that has been marked deprecated. Narrows the deprecation-related
 * fields.
 *
 * @internal
 */
export type DeprecatedConcept = Concept & {
    /** Always `true` for a deprecated concept. */
    deprecated: true;
    /** Why the concept was deprecated. */
    deprecatedMessage: string;
    /** Id of the concept to use instead. */
    deprecatedReplacement?: string;
};

/**
 * A concept that is a partial marking requiring a parent (tiered hierarchy).
 *
 * @internal
 */
export type TieredConcept = Concept & {
    /**
     * Tier label, which a format field's `tiers` entry uses to attach the
     * concept to its parent.
     */
    tier: string;
};

/**
 * A concept that accepts free-text user input.
 *
 * @internal
 */
export type TextInputConcept = Concept & {
    /** How the concept's free-text value is entered and checked. */
    textInput: ConceptTextInput;
};

/**
 * A concept that groups other concepts and can collapse in rendering.
 *
 * @internal
 */
export type GroupConcept = Concept & {
    /** Ids of the concepts the group stands for. */
    members: string[];
};

/** How concepts within a category are sorted during rendering. */
export type SortType = 'position' | 'alphabetical' | 'numeric';

/** A category default evaluated before any category defaults are added. */
export interface ConditionalDefaultConcept {
    /** Concept ID to fill when the category is empty. */
    concept: string;
    /** Existing rule condition; an unresolved condition supplies no default. */
    when: RuleWhen;
}

/**
 * A dimension of a marking (e.g., classification level, dissemination control,
 * or country code) that groups related concepts.
 *
 * Categories define the structural skeleton of a scheme. `required: true` makes
 * the category mandatory for a valid marking. `single: false` allows multiple
 * concepts per category (e.g., country flags). `rollup` controls how multiple
 * parts are aggregated into a whole marking. `hierarchyRoot: true` grades the
 * category's concepts by severity `rank` when coverage is compared.
 *
 * This is the loaded shape; adapters return {@link CategoryView}, and authoring
 * input is the `data.categories` entries of {@link SchemeDefinition}.
 *
 * @internal
 */
export interface Category {
    /** Unique identifier for this category */
    id: string;
    /** Human-readable label for UI display and suggestion grouping */
    label: string;
    /** Additional display views (e.g. export format labels) keyed by view name */
    views?: ViewLabels;
    /**
     * Whether at least one concept must be selected in this category for a
     * valid marking on the surface that owns the category.
     *
     * Requiredness is judged against the validation surface the caller names
     * (the `scope` option on process/validate), not against every call:
     *
     * - Validated as a whole marking (no surface named), a category with no
     *   `scopes` must be covered; a category scoped to an alternate surface is
     *   not demanded, because a whole marking need not carry another surface's
     *   block.
     * - Validated as a named surface, exactly the required categories that
     *   surface owns must be covered. An authority-block fragment is judged on
     *   its authority categories and is never faulted for omitting the
     *   classification line it does not carry.
     */
    required: boolean;
    /**
     * When true, only one concept can be selected in this category. When false,
     * multiple concepts are allowed (e.g., tags, countries).
     */
    single: boolean;
    /**
     * Restrict which concept IDs are allowed in this category. When undefined,
     * all concepts whose `categories` array includes this category ID are
     * allowed. When set, only concepts in this list are shown in suggestions
     * and accepted during validation.
     */
    allowedConcepts?: string[];
    /**
     * Rollup operator used when aggregating multiple markings. When `pipeline`,
     * the category must be referenced by exactly one entry in the scheme's
     * `rollup_pipelines`.
     */
    rollup: Rollup;
    /**
     * Sort order for concepts within this category during rendering. `position`
     * uses each concept's relative `position:` spec (falling back to YAML file
     * position), `alphabetical` sorts by rendered string, and `numeric` parses
     * the rendered value as a number. Can be an array for multi-level sorting.
     */
    sort?: SortType | SortType[];
    /**
     * Numeric positions keyed by concept ID, used by this category's `position`
     * sort instead of the concept's resolved position. Other concepts retain
     * their own positions. Equal positions use the next sort key, then declared
     * concept order. These values affect only this category and never severity.
     */
    positionOverrides?: Record<string, number>;
    /**
     * When true, a group concept present together with every one of its
     * members is rendered alone, with the members folded into it. E.g., if
     * group X has members A, B and C, and X, A, B and C are all present,
     * render "X" instead of "X, A, B, C". A group missing any member is
     * rendered as stated, beside whichever members are present.
     */
    collapseGroups?: boolean;
    /**
     * Concept ID to exclude from the "all members present" check for group
     * collapsing. Useful when one member is a wildcard that should not prevent
     * collapse.
     */
    groupExclude?: string;
    /**
     * When true, the category grades its concepts by severity `rank`: every
     * concept it grades must declare one or the scheme fails to load, and a
     * coverage comparison counts a whole-marking concept here as covering a
     * part's concept of equal or lower rank. It does not change rendering.
     */
    hierarchyRoot?: boolean;
    /**
     * Scope IDs this category belongs to. Empty or undefined places the
     * category on the marking as a whole rather than on one of its surfaces:
     * suggestion offers it wherever the scheme's `defaultScope` allows, and
     * surface validation demands it only on the surface `defaultScope` names.
     */
    scopes?: string[];
    /**
     * Concept ID to assert automatically when no selection exists in this
     * category. With single:true, this provides a default level. With
     * single:false, this concept is added when the category would otherwise be
     * empty.
     */
    defaultConcept?: string | ConditionalDefaultConcept;
    /**
     * When set, suppress this category from rendering if its concept set is a
     * subset of the named category's concept set. Used to avoid redundant
     * display.
     */
    suppressIfSubsetOf?: string;
    /** Suppress this category when conditions match */
    when?: When;
    /**
     * Where in the governing document this category was read from. Free text,
     * carried through from the authored scheme for provenance and audit. Never
     * parsed, matched on, or rendered.
     */
    citation?: string;
}

/**
 * Supported action types for rules. Each action is a constraint, an inference,
 * an aggregation, or an advisory; see {@link ConstraintRule},
 * {@link InferenceRule}, {@link AggregationRule} and {@link AdvisoryRule}.
 *
 * @internal
 */
export type RuleAction =
    | 'forbid'
    | 'exclusive'
    | 'require'
    | 'require_any'
    | 'restrict'
    | 'copy'
    | 'move'
    | 'inherit_parents'
    | 'expand_group'
    | 'cardinality'
    | 'supersede'
    | 'intersect'
    | 'union'
    | 'max'
    | 'warn';

/**
 * A rule target that names concepts by their place in the hierarchy, the
 * resolved form of `RuleTargetSelectorDoc`. Each form is a member of this
 * union.
 *
 * @internal
 */
export type RuleTargetSelector = ChildrenOfSelector;

/**
 * The resolved form of `ChildrenOfSelectorDoc`: every concept of the composed
 * scheme whose `parents` names `childrenOf`, direct children only. The engine
 * resolves it once per composed scheme; an empty set is a real answer, not an
 * error.
 *
 * @internal
 */
export interface ChildrenOfSelector {
    /** The concept whose direct children are the targets. */
    childrenOf: string;
}

/**
 * A single condition in a rule's `when` block. Can test category contents,
 * processing context role, or concept presence.
 */
export interface RuleCondition {
    /**
     * Category to evaluate against. Also serves as a shorthand matching any
     * concept in this category within when blocks.
     */
    category?: string;
    /** Shorthand for has_concept: check if this concept is present */
    has?: string;
    /** Combined operator+value shorthand (e.g. "count_eq 1", "has_content") */
    is?: string;
    /** Explicit operator for the condition */
    operator?: string;
    /** Explicit value for the operator */
    value?: string | number;
    /** Processing context role filter */
    role?: ProcessingRole;
    /**
     * Which assertion set to evaluate: 'self' (default), 'context' (the whole
     * marking), or 'contributors' (every set that fed an aggregate).
     */
    target?: RuleConditionTarget;
}

/**
 * A node in a rule `when`-tree: either a leaf `RuleCondition` or a nested
 * quantifier (`any` / `all` / `none`) over further nodes.
 *
 * The tree structure allows arbitrarily deep boolean logic within a rule's
 * trigger condition. Leaf nodes test assertion or context state; inner nodes
 * combine them with OR (`any`), AND (`all`), or NOT-OR (`none`).
 */
export interface RuleWhenQuantifier {
    /** Evaluate this entire boolean block within each contributor. */
    target?: 'contributors';
    /**
     * Combine contributor results; defaults to all. Requires target:
     * contributors. Missing or empty contributors never satisfy the block.
     */
    quantifier?: RuleContributorQuantifier;
    /** Satisfied when at least one of these nodes is. */
    any?: RuleWhenNode[];
    /** Satisfied when every one of these nodes is. */
    all?: RuleWhenNode[];
    /** Satisfied when none of these nodes is. */
    none?: RuleWhenNode[];
}

/** A leaf condition or recursively nested boolean quantifier in a rule tree. */
export type RuleWhenNode = RuleCondition | RuleWhenQuantifier;

/**
 * Conditions that trigger a rule. Supports shorthand forms:
 *
 * - `string`: concept ID must be present (any category)
 * - `string[]`: any of these concept IDs must be present
 * - `object`: structured `{ any | all | none }` block, possibly nested
 */
export type RuleWhen = string | string[] | RuleWhenQuantifier;

/**
 * A rule defining a trigger condition, action, and action-specific parameters.
 * Each rule has a trigger condition, an action, and action-specific
 * parameters.
 *
 * @internal
 */
export interface Rule {
    /** Unique rule identifier */
    id: string;
    /** Human-readable rule name for UI and audit provenance. */
    name?: string;
    /** Conditions that trigger this rule */
    when?: RuleWhen;
    /** What action to take when conditions are met */
    action: RuleAction;
    /**
     * Surfaces this rule is about, as scheme scope ids. A leading `!` excludes
     * one. When omitted, the rule is about every surface.
     *
     * Where in a marking the rule applies. A rule that excludes a surface is
     * never judged against a fragment of it, which is what lets a rule demand
     * a value that a different surface carries.
     */
    surfaces?: string[];
    /**
     * Evaluation contexts this rule runs in. When omitted, it runs in all of
     * them:
     *
     * - 'pre-merge': each input set on its own, before rollup (aggregate step
     *   1), and a standalone `process()` call
     * - 'post-merge': the merged whole, after rollup
     * - 'validate': an explicit `validate()` call
     * - 'render': the render-time visibility check
     * - 'suggest': suggestion generation
     *
     * When in processing the rule applies, which is a different question from
     * `surfaces`, and both have to say yes. Inclusion only: a rule that names
     * contexts runs in those and no others.
     *
     * These two were one `scope` list carrying both vocabularies, told apart
     * by asking the scheme whether an entry named one of its scope ids. That
     * made every reader of a rule guess, and it made a scheme that named a
     * scope after a context unreadable. Two questions, two fields.
     */
    phases?: Array<
        'pre-merge' | 'post-merge' | 'validate' | 'render' | 'suggest'
    >;
    /** Human-readable explanation of what this rule does */
    explanation?: string;
    /**
     * Where in the governing document this rule was read from. Free text,
     * carried through from the authored scheme for provenance and audit. Never
     * parsed, matched on, or rendered.
     */
    citation?: string;
    /**
     * Validation error message (for constraint-like actions), and the warning
     * a `warn` rule gives.
     */
    message?: string;

    /**
     * Concept(s) or category being acted on: the universal object of the
     * action. A selector names concepts by their place in the hierarchy.
     */
    target?: string | string[] | RuleTargetSelector;
    /**
     * Target category for actions that operate on a category (imply, default,
     * remove, cardinality, expand_group, inherit_parents) or to disambiguate
     * multi-category concepts.
     *
     * A `restrict` rule requires it: it is the category the rule restricts to
     * the targets. On a `require_any` rule it says where a target must appear.
     */
    category?: string;
    /**
     * For supersede: what replaces the target. Polymorphic:
     *
     * - String: single concept replacement (category inferred from concept)
     * - Record<targetId, Array<{ concept, category }>>: per-target replacement
     *   table
     */
    with?:
        | string
        | Record<
              string,
              Array<{
                  /** Id of the replacement concept. */
                  concept: string;
                  /** Id of the category the replacement is asserted in. */
                  category: string;
              }>
          >;
    /**
     * For copy, move, inherit_parents: source category ID. For intersect,
     * union: source category IDs (string or array).
     */
    from?: string | string[];
    /** For copy, move: destination category ID */
    to?: string;
    /** For move/copy: concept ID(s) to exclude from the operation */
    exclude?: string | string[];
    /** For cardinality: minimum count */
    min?: number;
    /** For cardinality: maximum count */
    max?: number;
    /**
     * For exclusive: priority among derived concepts during repair or rollup
     * (first = highest priority). Repair preserves author-stated concepts.
     */
    rank?: string[];
}

/**
 * Narrowed rule type for constraint actions that validate marking correctness.
 *
 * A `ConstraintRule` fires during the validate stage and populates
 * `ProcessResult.errors` when its `when` condition matches. Two of them also
 * change assertions before validation: a `require` that names `category` adds
 * its targets, and permissive processing removes the values a `restrict` does
 * not allow. Actions: `forbid` (concept pair must
 * not co-exist), `require` (every target must be present), `require_any` (at
 * least one target must be present, in `category` when the rule names one and
 * anywhere in the marking otherwise), `restrict` (`category` may hold only the
 * targets, and an empty category satisfies it), `exclusive` (only one concept
 * allowed in a category), and `cardinality` (min/max count check).
 *
 * @internal
 */
export type ConstraintRule = Rule & {
    /** One of the constraint actions. */
    action:
        | 'forbid'
        | 'require'
        | 'require_any'
        | 'restrict'
        | 'exclusive'
        | 'cardinality';
};

/**
 * Narrowed rule type for inference actions that add, remove, or transform
 * assertions during the infer stage.
 *
 * An `InferenceRule` runs before validation and may change `assertions` in
 * `ProcessResult`. Actions: `copy`/`move` transfers concepts between
 * categories, `inherit_parents` walks the concept hierarchy, `expand_group`
 * replaces a group concept with its members, and `supersede` replaces
 * deprecated concepts.
 *
 * @internal
 */
export type InferenceRule = Rule & {
    /** One of the inference actions. */
    action:
        | 'copy'
        | 'move'
        | 'inherit_parents'
        | 'expand_group'
        | 'supersede';
};

/**
 * Narrowed rule type for aggregation actions that combine assertion sets.
 *
 * @internal
 */
export type AggregationRule = Rule & {
    /** One of the aggregation actions. */
    action: 'intersect' | 'union' | 'max';
};

/**
 * Narrowed rule type for the advisory action.
 *
 * An `AdvisoryRule` is judged against the same assertions and in the same
 * contexts as a constraint, and when its `when` holds it adds its `message` to
 * the result's `warnings` as a `kind: 'rule'` warning. It changes nothing else:
 * not the assertions, not the rendering, and not `valid`.
 *
 * @internal
 */
export type AdvisoryRule = Rule & {
    /** The advisory action. */
    action: 'warn';
};

/**
 * A view filter: when its `when:` predicate matches, the named target
 * concept(s) or category(ies) are removed from the output of the specified
 * consumer contexts (`in:`).
 *
 * Filters are presentation-only: they don't transform assertions or report
 * errors. They live in `scheme.filters`, separate from `scheme.rules` (which
 * carries inference + constraint actions).
 *
 * @internal
 */
export interface Filter {
    /** Unique identifier */
    id: string;
    /** Output contexts where this filter applies. Default: ['render', 'suggest'] */
    in?: Array<'render' | 'suggest'>;
    /** Concept ID(s) or category ID(s) to remove from the consumer's output */
    remove: string | string[];
    /** Predicate (same shape as rule.when). When omitted, filter always applies. */
    when?: When;
    /**
     * Render format IDs this filter applies in. Empty or omitted means every
     * format. Only render consults it; suggest is never format-scoped.
     */
    formats?: string[];
    /** Human-readable explanation */
    explanation?: string;
    /** Optional message shown in tooling */
    message?: string;
}

/**
 * One capture group of a recognizer, and the field it fills.
 *
 * The field is named by its own `name`, or by the category it writes, in the
 * format the recognizer feeds.
 *
 * @internal
 */
export interface RecognizerBinding {
    /**
     * Capture-group index in the recognizer's pattern.
     *
     * @asType integer
     */
    group: number;
    /** The field that receives the captured text. */
    field: string;
}

/**
 * A declaration for input no field tree can describe.
 *
 * Deliberately narrow. One bounded pattern, capture groups bound to named
 * fields of one format, and nothing else: no variants, no flags, and above all
 * no priority. It produces candidate bindings into the same evidence graph
 * under the same budgets, competing on evidence like every other reading. It
 * never asserts a concept directly, and it never runs as a second pass after a
 * canonical read has failed, because a fallback that only fires on failure is a
 * way of turning an unrecognized input into a confident one.
 *
 * @internal
 */
export interface Recognizer {
    /** Recognizer identifier, used in diagnostics. */
    id: string;
    /** One bounded pattern from the supported regex subset. */
    pattern: string;
    /** The format whose field tree these captures feed. */
    format: string;
    /** Capture group to field, within `format`. */
    binds: RecognizerBinding[];
    /** Human-readable explanation surfaced with the recognition. */
    message?: string;
}

/**
 * Rule that corrects common input errors before validation.
 *
 * Repair rules come from the scheme's `parse.normalize` list and run in the repair
 * stage, before inference and validation. `type` selects the correction
 * strategy: `'alias'` resolves alternate spellings, `'reorder'` sorts concepts
 * into canonical order, `'separator'` rewrites separator text, `'dedup'`
 * removes duplicate assertions, `'case'` normalizes casing, and
 * `'infer_missing'` adds a required concept when no match was found. Every
 * required addition is applied only when it conflicts with no existing fact.
 * Repair never removes an author-stated concept to satisfy a rule; validation
 * reports the unmet requirement and process proposes choices for the author.
 * `confidence` is recorded with the repair in the
 * explanation trace.
 *
 * @internal
 */
export interface RepairRule {
    /** Rule id. */
    id: string;
    /** The correction strategy. */
    type:
        | 'alias'
        | 'reorder'
        | 'separator'
        | 'dedup'
        | 'case'
        | 'infer_missing';
    /** Human-readable description of the correction. */
    description: string;
    /**
     * Detection or match regex, read per type: for `case` it selects the input
     * that needs correcting; for `separator` it matches the text to replace.
     */
    pattern?: string;
    /**
     * The correction to apply, read per type. For `separator` it is the
     * replacement text. For `case` it is the canonical case of the scheme's
     * grammar, `'upper'` (the default) or `'lower'`; other types ignore it.
     */
    correction?: string;
    /**
     * Id of the concept the repair asserts. A `parse.normalize` entry cannot
     * declare it, so the loader leaves it absent.
     */
    targetConcept?: string;
    /**
     * Id of the category the repair acts on. A `parse.normalize` entry cannot
     * declare it, so the loader leaves it absent.
     */
    categoryId?: string;
    /** How sure the scheme author is that the repair is right. */
    confidence: RepairConfidence;
    /**
     * The author's reason the correction is right. The trace records
     * `description`, not this text.
     */
    explanation: string;
    /**
     * Condition for the repair. A `parse.normalize` entry cannot declare it,
     * and the repair stage does not read it.
     */
    when?: When;
    /**
     * Scope ids for the repair. A `parse.normalize` entry cannot declare them,
     * and the repair stage does not read them.
     */
    scopes?: string[];
}

/**
 * One piece of a conditional affix on a resolved format: text, and when it is
 * written.
 *
 * An entry with no `when` is unconditional. Several entries whose conditions
 * hold concatenate in declaration order, which is what lets independent
 * conditions each contribute their own piece without the format enumerating
 * every combination.
 *
 * @internal
 */
export interface AffixPart {
    /** The text this part writes. */
    text: string;
    /** When this part is written. Absent means always. */
    when?: When;
}

/**
 * A resolved prefix or suffix: the ordered parts it may write.
 *
 * Always a list here, even where the document wrote one plain string, because
 * a consumer of the resolved scheme should not have to handle two shapes for
 * one idea. An affix whose parts all sit behind conditions that do not hold
 * writes nothing, and writes nothing around an otherwise empty result either.
 *
 * @internal
 */
export type Affix = AffixPart[];

/** Affix written around every value of a field, rather than once around all of them. */
export interface EachAffix {
    /** Written before each value. */
    prefix?: string;
    /** Written after each value. */
    suffix?: string;
}

/**
 * How a tiered concept composes inside one field: what attaches a tier level to
 * the one above it, and the view each half of the composed token is written in.
 *
 * The head is the level being composed with and the child is the level this
 * entry governs. They need not agree: a format that spells its concepts out can
 * still want the head short inside a composed token, where the composed form is
 * a name in its own right. Either falls back to the field's view, and neither
 * reaches a head written on its own.
 */
export interface TierComposition {
    /** The tier label this entry governs. */
    tier: string;
    /** What attaches this tier level to the one it composes with. */
    attachedBy: string;
    /** View for the composed token's child; falls back to the field's view. */
    view?: string;
    /** View for the composed token's head; falls back to the field's view. */
    headView?: string;
}

/**
 * A boundary-specific separator between two named adjacent children.
 *
 * Written only when both children produced something, exactly as any other
 * separator is.
 *
 * @internal
 */
export interface FieldJoin {
    /** The two adjacent children, by name or by category id. */
    between: [string, string];
    /** What is written between them. */
    separator: string;
}

/**
 * The properties every resolved field shape carries.
 *
 * @internal
 */
export interface RenderFieldCommon {
    /** Human label for the field, and the name a join or a recognizer uses. */
    name?: string;
    /** When this field applies, read by both emission and recognition. */
    when?: When;
    /** Concept view for this field, overriding the enclosing view. */
    view?: string;
    /** Written once before the field's nonempty result. */
    prefix?: Affix;
    /** Written once after the field's nonempty result. */
    suffix?: Affix;
    /** What this field joins: its values, or its nonempty children. */
    separator?: string;
    /** `xml-attributes` syntax only: the attribute's local name. */
    attribute?: string;
}

/**
 * A resolved field bound to a category, optionally narrowed to one concept.
 *
 * @internal
 */
export interface RenderCategoryField extends RenderFieldCommon {
    /** The category this field writes. Always resolved, never inferred here. */
    category: string;
    /** Narrowed to one concept: a fixed slot such as a header. */
    concept?: string;
    /** Concepts bound elsewhere in this format and excluded here. */
    excludeConcepts?: string[];
    /** Affix written around each value, rather than once around all of them. */
    each?: EachAffix;
    /** How a tiered concept composes inside this field. */
    tiers?: TierComposition[];
}

/**
 * A resolved field made of ordered child fields.
 *
 * @internal
 */
export interface RenderGroupField extends RenderFieldCommon {
    /** The children, in the order they are written. */
    fields: RenderField[];
    /** Separators for particular boundaries between adjacent children. */
    joins?: FieldJoin[];
}

/**
 * A resolved field with several possible representations, one active at a time.
 *
 * @internal
 */
export interface RenderAlternativesField extends RenderFieldCommon {
    /** The possible representations of this one field. */
    alternatives: RenderField[];
}

/**
 * One resolved field of a format. Exactly one binding shape per field.
 *
 * @internal
 */
export type RenderField =
    | RenderCategoryField
    | RenderGroupField
    | RenderAlternativesField;

/**
 * How a resolved format's text is framed: its encoding, not its layout.
 *
 * @internal
 */
export type RenderSyntax =
    | {
          /** Plain text. */
          type: 'text';
          /** How a character the syntax cannot frame is escaped. */
          escape?: 'none' | 'backslash';
      }
    | {
          /** XML attributes on one element. */
          type: 'xml-attributes';
          /** Namespace to write the attributes in, when the format has one. */
          namespace?: {
              /** The namespace prefix the attributes are written with. */
              prefix: string;
              /** The namespace URI the prefix is bound to. */
              uri: string;
          };
      };

/**
 * One way this scheme's markings are written: the resolved form of an authored
 * `render.formats[]` entry.
 *
 * A field-for-field mirror of the authoring contract with ids resolved and the
 * one-or-many spellings normalized, so the tree a renderer walks is the tree
 * the author wrote. The field list is canonical output order; it does not
 * demand that input arrive in that order, because the same tree reads a
 * reordered marking and says what it corrected.
 *
 * Each piece of layout is said once, by the field that owns it.
 *
 * Like the authored {@link FormatDoc}, it names the one surface it writes in
 * `surface` or the several it writes together in `surfaces`, never both.
 *
 * @internal
 */
export type RenderFormat = RenderFormatCommon &
    (
        | {
              /**
               * The semantic part of a marking this format writes: a scheme
               * scope id. `surfaces` is absent.
               */
              surface: string;
              /** Absent: this format writes the one surface `surface` names. */
              surfaces?: never;
          }
        | {
              /** Absent: this format writes the surfaces `surfaces` lists. */
              surface?: never;
              /**
               * The scheme scope ids this format writes together, two or
               * more, in a scheme that declares `surfaceOutputs`. `surface` is
               * absent.
               */
              surfaces: readonly string[];
          }
    );

/**
 * Everything a resolved format holds except the surfaces it writes. A format is
 * this plus exactly one of `surface` or `surfaces`; see {@link RenderFormat}.
 *
 * @internal
 */
export interface RenderFormatCommon {
    /**
     * Format identifier, referenced by `defaultRenderFormat`, by
     * `surfaceOutputs` and by callers.
     */
    id: string;
    /** Layout: `inline` runs the fields together, `block` puts each on its own line. */
    mode: 'inline' | 'block';
    /** Encoding. Absent means plain text. */
    syntax?: RenderSyntax;
    /**
     * Default concept view for fields that do not name one.
     *
     * A view is how this scheme's concepts are written somewhere, which is all
     * a locale is: a scheme that wants its markings in French declares an `fr`
     * view on the concepts that differ in it, and a format names that view.
     * There is no separate localization surface, because a second way to say
     * what a view already says is a second place for the two to disagree.
     */
    view?: string;
    /** Written once before the nonempty whole. */
    prefix?: Affix;
    /** Written once after the nonempty whole. */
    suffix?: Affix;
    /** Joins the nonempty top-level fields. */
    separator?: string;
    /** Separators for particular boundaries between adjacent top-level fields. */
    joins?: FieldJoin[];
    /** Skip empty fields. Defaults to true for `block`, false for `inline`. */
    omitEmpty?: boolean;
    /**
     * Leave assertions with `source: 'default'` out of this format's printed
     * output. A print filter only: every condition in this format still
     * evaluates against the real, unfiltered assertion state, so a condition
     * elsewhere in the same format can never stop firing because of how a
     * category happened to be filled in.
     */
    omitDefaults?: boolean;
    /**
     * Write a part's stand-in in place of the values it took from its whole
     * (see `Concept.standsForWhole`). Applies to a part read on its own,
     * never to a rollup. A print filter only. Authored as
     * `omit_whole_values`.
     */
    omitWholeValues?: boolean;
    /** The fields, in the order they are written. */
    fields: RenderField[];
}

/**
 * Recognition policy: how a spelling found at a boundary is compared against
 * the vocabulary.
 *
 * Not tokenization. Every boundary in a marking belongs to the field that
 * writes it, so there is no global separator here and no last-resort split to
 * be exempt from: a multi-word spelling recognizes itself from the vocabulary
 * rather than surviving a tokenizer.
 *
 * @internal
 */
export interface ParseConfig {
    /** Whether the vocabulary is matched case-sensitively. */
    caseSensitive: boolean;
    /** Whether surrounding whitespace is ignored when a spelling is compared. */
    stripWhitespace: boolean;
}

/** When a host UI should proactively prompt for an embedded marking. */
export type EmbeddedMarkingStyleAutoInsert =
    | 'every-paragraph'
    | 'first-line'
    | 'manual';

/**
 * One way a marking can appear embedded inside free text, e.g. a parenthesized
 * short form like "(H)" at the start of a paragraph. A scheme may declare
 * multiple styles; all are matched during scanning.
 */
export interface EmbeddedMarkingStyle {
    /**
     * RegExp source (no flags) whose first capture group is the raw marking
     * text. Example: `\((.+)\)` for a marking in parentheses.
     */
    pattern: string;
    /**
     * Template used when inserting a new embedded marking. Must include the
     * literal token "{marking}" where the rendered marking is substituted.
     * Example: "({marking}) ".
     */
    template: string;
    /**
     * When the host UI should proactively prompt the user to add a marking.
     * "every-paragraph" pops the picker on each new paragraph; "first-line"
     * only on the first line of the document; "manual" never auto-prompts.
     * Default "manual".
     */
    autoInsert?: EmbeddedMarkingStyleAutoInsert;
}

/**
 * A selectable answer in a wizard question, optionally linked to a concept and
 * implied concepts.
 */
export interface WizardAnswerOption {
    /** Text shown for the answer. */
    label: string;
    /** Value recorded when the answer is chosen. */
    value: string;
    /** Id of the concept the answer selects. */
    conceptId?: string;
    /** Ids of further concepts the answer implies. */
    implies?: string[];
}

/** A single question in a guided wizard flow, with its answer type and options. */
export interface WizardQuestion {
    /** Question id. */
    id: string;
    /** The question as shown to the user. */
    text: string;
    /** Help text shown with the question. */
    hint?: string;
    /** How many answers the user may give. */
    type: 'single-choice' | 'multi-choice' | 'yes-no';
    /** The answers offered. */
    options: WizardAnswerOption[];
}

/** A page in a multi-step wizard containing one or more questions. */
export interface WizardStep {
    /** Step id. */
    id: string;
    /** Title shown for the step. */
    title: string;
    /** Longer explanation shown with the step. */
    description?: string;
    /** The questions on this step, in order. */
    questions: WizardQuestion[];
}

/** A singular/plural display-word pair. */
export interface Term {
    /** The word for one, such as `rule`. */
    singular?: string;
    /** The word for more than one, such as `rules`. */
    plural?: string;
}

/**
 * Author-facing vocabulary: an open map from a term key (e.g. "rule",
 * "concept", "tag") to the display words. Term keys are not enumerated here;
 * consumers pick the keys that matter to them.
 *
 * Purely a presentation hint: nothing in the engine's evaluation logic reads
 * it. Each consumer owns its own default map and calls
 * `resolveVocabulary(source, defaults)` to merge.
 */
export type Vocabulary = Record<string, Term>;

/** Same shape but with every key's singular/plural guaranteed populated. */
export type ResolvedVocabulary = Record<
    string,
    {
        /** The word for one. */
        singular: string;
        /** The word for more than one. */
        plural: string;
    }
>;

/**
 * Resolved display label for an artifact's reference-surface chrome noun: the
 * name its own reference component wears (a scheme's Handbook, a guide's
 * Guidebook, an access policy's Access Handbook). Always fully populated: an
 * artifact that declares no override resolves to the engine's generic noun for
 * that surface, using the same singular/plural `Term` contract as the
 * artifact vocabulary. Kept as its own type because this is an already-resolved
 * reference-surface value rather than the complete author-facing vocabulary.
 */
export interface ReferenceSurfaceLabel {
    /** The noun for one, such as `Handbook`. */
    singular: string;
    /** The noun for more than one, such as `Handbooks`. */
    plural: string;
}

/**
 * Pre-formatted tooltip content for a concept: name, definition, guidance, and
 * applicable rules.
 */
export interface ConceptDescription {
    /** The id of the concept described. */
    conceptId: string;
    /** The category the concept belongs to. */
    categoryId: string;
    /** The concept's display name. */
    name: string;
    /** What the concept means, as the scheme defines it. */
    definition?: string;
    /** How to apply the concept, as the scheme advises. */
    guidance?: string;
    /** The scheme's rules that involve the concept, each as a sentence. */
    rules?: string[];
    /**
     * Pre-formatted lines for tooltip display (header, description, guidance,
     * rules).
     */
    lines: string[];
}

/**
 * Caller-supplied context describing the role of a marking being processed. No
 * context (or role='whole') means an overall/document-level marking.
 * role='part' means a portion/paragraph that belongs to another marking.
 */
export interface ProcessingContext {
    /** Role of this marking: 'whole' for overall markings, 'part' for portions */
    role?: ProcessingRole;
    /**
     * The whole marking this is part of (when role='part').
     *
     * The whole does two jobs. In a role-aware scheme it is the reading
     * context for the scheme's whole-aware rules: a rule condition with
     * `target: 'context'` is answered from it. And in every scheme, role-aware
     * or not, `process`, `validate` and `explain` compare a part that is valid
     * on its own with its whole. That is the comparison a whole is judged by
     * against its parts and the one `checkCoverage` gives, asked of this one
     * part: category by category, in the direction each category's rollup
     * declares. A category a rollup pipeline resolves is judged instead by
     * what rolling the whole up with this part would add or drop. A category
     * whose rollup has no direction one part can be judged by, such as
     * `first`, is left to the whole.
     *
     * What the part carries beyond its whole is one `_exceeds_whole` error on
     * the part. Its `affectedConcepts` names every finding: first what the
     * whole does not cover, then what the whole carries that the part does not
     * allow. Its `categoryId` is set when every finding is in one category. It
     * offers no fix, because whether the part or the whole should change is the
     * author's call. A part that breaks its own rules reports those errors and
     * is not compared. Its own rules are the scheme's: an in-process engine's
     * `afterValidate` plugin runs after the comparison and does not change
     * whether it happens. A call's `parts` and a document scan or audit read
     * each part in the whole without this comparison; they judge coverage on
     * the whole instead.
     *
     * A part is compared with its whole as the engine settles the whole: read,
     * modernized, completed by what the scheme's rules imply and judged, the
     * same settling `valid` reports for the whole on its own. A whole spelled
     * with a retired concept is compared as its replacement, and a fact the
     * whole's rules add is one the part is compared with.
     *
     * The same holds wherever a part meets its whole: here; for each of a
     * call's `parts`, however the call's whole came, as text or as facts; and
     * for each input `SchemeEngineAdapter.aggregate` reads against a whole. A
     * part that takes a value from its whole, such as a list it stands for,
     * takes it from that settled whole.
     *
     * What the part gets depends on the state of its whole:
     *
     * - A whole that reads and is valid is verified. The part's rules read it,
     * and `process`, `validate` and `explain` compare the part with it.
     * - A whole that reads but is invalid, or does not read, is not verified.
     * The part is still read and judged by its own rules but is not compared
     * with the whole, so it never carries `_exceeds_whole`. It always carries
     * the `_whole_unverified` notice.
     * - With no whole given, the part is judged by its own rules alone. It
     * carries the `_whole_unverified` notice only when one of its rules was
     * left unresolved.
     *
     * Without a verified whole, what needs the whole is left open instead of
     * guessed: a rule condition with `target: 'context'` is unresolved, so its
     * rule never fires, as `RuleConditionTarget` describes.
     */
    partOf?: {
        /** Rendered string of the whole marking */
        rendered: string;
        /**
         * Pre-resolved assertions of the whole marking (populated by the
         * engine)
         */
        assertions?: Assertion[];
    };
}

/**
 * Named collection of concept IDs used for organizational grouping in UI and
 * documentation.
 *
 * @internal
 */
export interface ConceptGroup {
    /** Group id. */
    id: string;
    /** Display name of the group. */
    name: string;
    /** What the group collects. */
    description: string;
    /** Ids of the concepts in the group, in display order. */
    conceptIds: string[];
}

/**
 * A predefined marking shortcut that users can select instead of building a
 * marking from individual concepts.
 *
 * @internal
 */
export interface LabelPreset {
    /** Preset id, which `applyPreset` takes. */
    id: string;
    /** Display label for the preset. */
    label: string;
    /** The marking text the preset stands for. */
    marking: string;
    /** Longer explanation of when to use the preset. */
    description?: string;
    /** Free-form tags for filtering presets in a picker. */
    tags?: string[];
    /**
     * Scope this preset belongs to, referencing a `scopes[].id` on the owning
     * scheme. A preset that fills authority-block categories declares the
     * scheme's `authority` scope so a picker can section it under that scope's
     * label instead of intermixing it with classification presets. When
     * omitted, the preset resolves to the scheme's `defaultScope`.
     */
    scope?: string;
}

/**
 * A guarded alternative to a view's format: the resolved form of {@link OutputCaseDoc}.
 *
 * @internal
 */
export interface OutputCase {
    /** When this case holds. */
    when: When;
    /** The format written while this case holds. */
    format: string;
}

/**
 * The format that writes an output and the guarded cases that swap in another:
 * the resolved form of {@link OutputTargetDoc}.
 *
 * @internal
 */
export interface OutputTarget {
    /** The format written when no case holds. */
    format: string;
    /**
     * Mutually exclusive conditions under which another format writes this
     * output instead.
     */
    cases?: OutputCase[];
}

/**
 * A named view of one surface: the resolved form of {@link OutputViewDoc}.
 *
 * @internal
 */
export interface OutputView extends OutputTarget {
    /** View id, unique within its surface. */
    id: string;
    /** The role of the markings this is a view of. Absent, it has none. */
    role?: ProcessingRole;
    /**
     * Formats this view is also read in and never written in, from
     * `also_read_in`.
     */
    alsoReadIn?: string[];
}

/**
 * The outputs one surface offers: the resolved form of {@link SurfaceOutputDoc}.
 *
 * @internal
 */
export interface SurfaceOutput {
    /** The scheme scope id these outputs write. */
    surface: string;
    /**
     * The view written for a marking in each role when a request names none,
     * or names one this surface does not declare. Each is one of `views`.
     *
     * Always the complete map. The loader fills it from the authored
     * `default`: a view id stands for every role, and a map's missing `part`
     * takes its `whole`. Code reading it never has to ask which form the
     * author wrote. A marking with no role is written as a whole.
     */
    default: Record<ProcessingRole, string>;
    /** The views a caller can ask for, in display and result order. */
    views: OutputView[];
}

/**
 * A marking scheme document: concepts, categories, rules, tokens, normalize
 * rules, and render formats. Access rules are a separate first-class document;
 * see AccessPolicy in access/access-policy.ts.
 *
 * @internal Runtime, post-load shape. The published authoring contract is
 * {@link SchemeDefinition}; UI consumers read via {@link SchemePublicView} and
 * the engine's view DTOs.
 */
export interface Scheme {
    /** Scheme identifier. */
    id: string;
    /** Semantic version of the scheme. */
    version: string;
    /** Human-readable display name. */
    name: string;
    /** Longer description of what this scheme covers. */
    description: string;
    /** Official description or definition of the scheme. */
    definition?: string;
    /** Usage notes, restrictions, or guidelines for the scheme. */
    guidance?: string;
    /**
     * Optional display-term overrides consulted by runtime UI components
     * (forms, Handbook, reports). Keys are consumer-defined (e.g. "concept",
     * "marking"); each consumer merges with its own defaults via
     * `resolveVocabulary`. The `"handbook"` key renames this scheme's own
     * reference-surface noun (e.g. `{ handbook: { singular: "Shelving Guide" }
     * }`); read the resolved word off {@link Scheme.referenceSurfaceLabel}
     * rather than reading this raw map directly.
     */
    vocabulary?: Vocabulary;
    /**
     * Display label for this scheme's own reference component, the Handbook.
     * Resolved once at load time from `vocabulary.handbook` (or the engine's
     * generic "Handbook" / "Handbooks" when the scheme declares none) so every
     * consumer reads the same already-resolved word instead of re-resolving the
     * raw map.
     */
    referenceSurfaceLabel: ReferenceSurfaceLabel;
    /**
     * License label shown with the scheme, such as `enterprise`.
     * Informational only: it does not grant or restrict use.
     */
    license?: string;
    /**
     * Document kind. A layer is a partial scheme composed onto a base; a plain
     * scheme stands alone. Absent means `'scheme'`.
     */
    type?: 'scheme' | 'layer';
    /** Layer composition. Present only when `type === 'layer'`. */
    layer?: LayerBlock;
    /** Named shortcut markings, from `ui.label_presets`. */
    label_presets?: LabelPreset[];
    /** Concept groupings for display, from `data.concept_groups`. */
    conceptGroups?: ConceptGroup[];
    /** Every concept, inline and from external sources. */
    concepts: Concept[];
    /** Every category, in declared order. */
    categories: Category[];
    /**
     * Reusable condition trees declared by `scheme.named_conditions`.
     * References are resolved for evaluation, while this map remains available
     * for inspection, composition, and authoring round-trips.
     */
    namedConditions?: Record<string, When>;
    /**
     * Canonical pipeline groups: each groups categories resolved together by
     * one ordered pipeline. Declared via `scheme.rollup_pipelines`.
     */
    rollupPipelines?: RollupPipeline[];
    /**
     * Rules: each has a trigger condition, action, and action-specific
     * parameters
     */
    rules?: Rule[];
    /**
     * Filters: view filters consulted by render and suggest. Separate from
     * rules.
     */
    filters?: Filter[];
    /** Repair rules, from `parse.normalize`, in declared order. */
    normalize: RepairRule[];
    /** Every resolved render format, written or only read. */
    formats: RenderFormat[];
    /**
     * The format id a render uses when the caller names none, from
     * `render.default`.
     *
     * Absent when the scheme names no default. That is not a value in this
     * field's space, because the space is the scheme's own format ids and
     * `default` is an ordinary id a scheme may declare: a marker drawn from the
     * ids would make a scheme that declares a format called `default`
     * indistinguishable from one that named no default at all, and the two want
     * opposite treatment wherever a layer composes over a base.
     *
     * Absent for a scheme that declares `render.surfaces`, which names a
     * default per surface, by role, in {@link Scheme.surfaceOutputs} instead.
     */
    defaultRenderFormat?: string;
    /**
     * The outputs per surface, from `render.surfaces`. When present these are
     * the scheme's outputs and `formats` is the library of their forms,
     * written or only read; absent, every format is an output under its own
     * id.
     */
    surfaceOutputs?: SurfaceOutput[];
    /** Written between the outputs of two surfaces, from `render.surface_separator`. */
    surfaceSeparator?: string;
    /**
     * ID of the category that drives the marking's display color, from
     * `render.color_from`. The named category must be `single: true`, and only
     * its concepts may carry a `color`. Undefined when the scheme declares no
     * category-based colors. Resolution runs after rollup: the resolved
     * assertion in this category supplies the whole marking's color.
     */
    colorFrom?: string;
    /**
     * Ordered compound display-color defaults normalized from the array form of
     * `render.color_from`. First matching rule wins. Hosts may override these
     * presentation defaults.
     */
    colorRules?: MarkingColorRule[];
    /** Recognition policy from `parse`: case sensitivity and whitespace. */
    parse: ParseConfig;
    /**
     * Styles that describe how markings may be embedded inside free text
     * (parens, prefix tags, etc.). Used by the scanner to locate markings in
     * documents and by inline-editing UIs (web forms, Office add-ins) to insert
     * new ones.
     */
    embeddedMarking?: EmbeddedMarkingStyle[];
    /**
     * The scope a marking is in when nothing names one, from the document's
     * `default_scope`. Present exactly when the scheme declares at least one
     * scope.
     */
    defaultScope?: string;
    /** Declared scopes, id and display label, in declared order. */
    scopes?: Array<{
        /** Scope id. */
        id: string;
        /** Display label for the scope. */
        label: string;
    }>;
    /** Display label for the scope selector. */
    scopeLabel?: string;
    /**
     * When true, the scheme reads a marking in the role its context gives: a
     * marking given no context is a whole, and a part's rules read the whole in
     * its `partOf`. When false or absent, a marking is read with no context.
     * Either way, `process`, `validate` and `explain` compare a part that is
     * valid on its own with a whole that reads and is valid, as
     * `ProcessingContext.partOf` describes.
     */
    roleAware?: boolean;
    /**
     * Render format IDs grouped by role.
     *
     * For a scheme without `render.surfaces`, the lists `role_detection`
     * gives, which the scanner reads a marking's role from. For a scheme with
     * them, the scanner takes the role from the view a marking was read as,
     * and these lists are derived from the views for a caller that picks a
     * format per role: each role lists the forms of the views that state it,
     * `format`, case formats and `also_read_in` in that order, surfaces and
     * views in declared order and each format once. A view with no role adds
     * nothing.
     */
    contextFormats?: {
        /** Format ids a whole marking is read in. */
        whole: string[];
        /** Format ids a part marking is read in. */
        part: string[];
    };
    /**
     * How much text a part (portion) marking governs, used by document audit to
     * associate body text with a marking:
     *
     * - `'paragraph'` (DEFAULT): the marking governs only the line(s) it sits on
     *   (US-Gov leading/trailing portion convention).
     * - `'until-next'`: the marking governs from its line through to the next
     *   part marking, a section/heading style where one mark covers several
     *   paragraphs.
     * - `'document'`: the marking governs the whole document.
     *
     * Whole markings always govern the document regardless of this setting; it
     * only affects parts.
     */
    partScope?: 'paragraph' | 'until-next' | 'document';
    /**
     * When a document audit requires each role's marking, from
     * `role_detection.<role>.required_when`. A role without a condition keeps
     * the default: a whole marking is optional and part markings are required.
     */
    markingRequirements?: {
        /** Condition under which the document needs a whole marking. */
        whole?: When;
        /** Condition under which body text needs a part marking. */
        part?: When;
    };
    /**
     * Scheme-defined policy (D8) for how rendering treats a parse that
     * contained an unmatched/unrecognized token. The engine stays
     * domain-neutral; each scheme declares the safety posture appropriate to
     * its domain.
     *
     * - `'preserve_unmatched'` (DEFAULT): unrecognized tokens are kept VISIBLE in
     *   the rendered string (appended verbatim) so they can never silently
     *   vanish. The parse still reports `_unmatched_token` and `valid: false`.
     *   This is the safe default so a new scheme cannot accidentally
     *   under-render.
     * - `'refuse'`: rendering an invalid parse returns an explicit refusal marker
     *   instead of a partial string. The strictest posture: a security scheme
     *   can use this so a display path that ignores `valid` shows nothing
     *   usable rather than a less-restrictive-looking marking.
     * - `'drop_unmatched'`: unrecognized tokens are silently omitted from the
     *   rendered string. Only appropriate for loose tagging schemes that may
     *   ignore an unknown tag.
     */
    renderOfInvalid?: 'preserve_unmatched' | 'refuse' | 'drop_unmatched';
    /**
     * What the `refuse` policy renders in place of the marking. The optional
     * `{tokens}` placeholder is replaced with the comma-joined unmatched
     * tokens; leave it out for a marker that says nothing about the input.
     * Defaults to `[INVALID MARKING: unrecognized {tokens}]`.
     *
     * Only consulted when `renderOfInvalid` is `'refuse'`; the other policies
     * compose their output from the scheme's render formats.
     */
    refusalMarker?: string;
}

/**
 * What validate answers about one marking: the facts it states once settled,
 * whether they stand, and what a reader needs to show why not.
 *
 * Validate is the reader's call. A host that displays a marking, gates on it,
 * stores it, or hands its facts to an access check or a rollup calls it. The
 * result carries no fix paths, no corrections to the text and no output beyond
 * the one rendering, because a reader is not writing the marking. The author's
 * call is process, and a `ProcessResult` is this result with the authoring
 * answers added.
 *
 * Each field means the same wherever it appears: on a validate or process
 * result, on each region of a scan, in-process or over a wire.
 *
 * Scheme and engine metadata (schemeVersion, schemeId) are not on the result;
 * read them from `engine.version`, `engine.scheme.id` and
 * `engine.scheme.version` instead.
 */
export interface ValidateResult {
    /**
     * The facts the marking states, as the engine settled them.
     *
     * Listed in print order: the order the rendered marking places each
     * concept; a concept the rendering leaves out appears where it would print.
     * A concept the rendering has no place for at all follows the others of
     * its category, or comes last when its category has none, in the order
     * the scheme declares.
     */
    assertions: Assertion[];
    /**
     * True when the marking stands once the engine has settled it: read,
     * repaired, completed by what the scheme's rules imply, and judged with no
     * error left.
     *
     * Defined here once, and every result that reports `valid` means this,
     * whichever operation produced it and whichever door it came through.
     * Reading is tolerant on purpose, so the engine settles what it can.
     * Whether the text was right as written is what `inputWasValid` and
     * `appliedFixes` answer; no request asks the engine to settle less, so
     * validate and process give the same `valid` for the same input, context,
     * surface and parts.
     */
    valid: boolean;
    /**
     * True when the text or facts as given needed no change to stand.
     *
     * Defined here once, and judged after the same settling as `valid`. A
     * marking can be `valid` without having been valid as given: the engine
     * settled it into one that stands. A result whose `inputWasValid` is false
     * always says why: each change the engine made is in `appliedFixes`, and
     * whatever it could not settle is in `errors`.
     *
     * Right as written is judged against the view the text was read as, the
     * one `recognition.inputFormat` reports, or for text read on more than one
     * surface, the view each surface's part was read as. A fact settling adds,
     * including a restored tier parent, counts against it only when that view
     * writes the fact. A view that
     * leaves the fact out writes the same text with the fact as without it, so
     * the text was right already. Text read as no single view counts the fact
     * when any view that read it writes it. Facts handed in with no text are
     * judged against what a request that names no output writes them in, by
     * the rule `rendered` follows.
     *
     * Text is also not right as written when the request's context names a
     * role and recognition decided the text is a view of the other role, as
     * `recognition.role` reports. The result carries that departure in
     * `appliedFixes` under `_recognition_role`, and `valid` is judged as it
     * would be without it. A request that names its input format has said
     * which view the text is: the text is judged as that view, and no role
     * departure is raised. On a scan region and on a marking a document audit
     * judges, the role the marking's place gives it stands for the context's
     * role: a region found inside a wrapper is a part, and an audit judges
     * each marking in the role it has in the document.
     */
    inputWasValid: boolean;
    /**
     * What the scheme's rules find wrong with the settled marking. An entry
     * whose severity is `error` makes `valid` false.
     *
     * No entry here points at a fix path: `suggestedFix` is set only on a
     * result that carries the fix it names, and this result carries none.
     */
    errors: ValidationError[];
    /**
     * Advisories that do not affect `valid`, such as a deprecated concept. On
     * a process result whose fix paths were not all proven, this carries a
     * notice whose `ruleId` is `_fixes_unproven`, as
     * `ProcessResult.proposedFixes` describes.
     */
    warnings: Warning[];
    /**
     * Every change the engine actually made while settling the marking: a departure
     * from canonical spelling or order that recognition read through, a
     * repair, a fact a rule required, a handed-in fact settling removed, or
     * text read in the other role from the one the request names. A removed
     * fact is named with the reason it was removed, including a fact handed
     * in with a derived source label that the run does not derive again.
     * A requirement that conflicts with an existing concept is not added and
     * appears in errors and proposed fixes, with no applied change. Repair
     * never removes an author-stated concept. These are the reasons a marking can be `valid`
     * while `inputWasValid` is false.
     *
     * A departure from spelling or order is reported here without a position.
     * On a process result, `recognition.corrections` reports the same
     * departure with the span of the text it covers. They are one change seen
     * two ways, so a display shows one of them, not both. The role departure,
     * `_recognition_role`, is about the whole text: it has no span and no
     * entry in `recognition.corrections`, so it is reported only here, and a
     * display that shows corrections in place of this list still shows it.
     */
    appliedFixes: Change[];
    /**
     * The settled marking, in one string.
     *
     * It is written in the output the request names. With none named, a
     * scheme without `render.surfaces` writes its default format, and a scheme
     * with them writes each surface in its default for the marking's role, by
     * the rule `RenderConfigDoc.surfaces` states. Every operation that returns
     * this shape follows that one rule.
     *
     * For a scheme that declares `render.surfaces`, the string is the output
     * resolved on each surface the result writes, as `RenderConfigDoc.surfaces`
     * describes, in declared surface order and joined by
     * `render.surface_separator`. An output that writes nothing adds nothing,
     * and outputs written as XML attributes in one namespace merge into one
     * attribute list. One refused output refuses the whole string, and
     * `assessment` says which one and why.
     */
    rendered: string;
    /**
     * The assessment of `rendered`: what it wrote of these facts, what it left
     * out, what collapsed into an equivalent, and what it could not write at
     * all. When `rendered` carries more than one surface, this is the
     * combined assessment `RenderResult` describes. Read it before treating
     * `rendered` as a transport.
     */
    assessment: RenderAssessment;
    /**
     * What recognition made of the text: how far it got, what it read the
     * text as, and what it could not account for.
     *
     * Present exactly when there was text to recognize. Given facts, nothing
     * was read, and the field is absent rather than carrying a made-up status
     * about an input that does not exist. The same holds for every other
     * result built from carried facts, notably a crosswalk's target.
     */
    recognition?: RecognitionResult;
    /**
     * The notices the scheme attaches to the concepts in `assertions`,
     * collected the same way `SchemeEngine.collectNotices()` collects them.
     * Always present, empty when the marking carries none, so a consumer can
     * read the field without checking that it exists.
     */
    notices: CollectedNotice[];
    /**
     * Portable scheme-derived display color for the settled marking. Embedding
     * hosts may override this presentation default.
     */
    displayColor?: ConceptColor;
}

/**
 * What process answers: everything validate answers, plus what an author needs
 * to correct and finish the marking.
 *
 * Process is the author's call. A composer, a picker or an editor that helps
 * someone write a marking calls it, often on every keystroke, and can send what
 * was typed together with the facts already chosen. Beside the validate answer
 * it carries:
 *
 * - the corrections that turn the text into canonical text, inside
 * `recognition`;
 * - what was read before repair, when repair changed it;
 * - the fix paths, each a whole valid marking the engine has proven;
 * - the outputs the request named in `outputs`, and only those;
 * - the options for the categories the request named in `suggestFor`, only
 * when it named some.
 *
 * The step-by-step trace of how the engine got here is not part of it. That is
 * what explain answers, from the same request.
 */
export interface ProcessResult extends ValidateResult {
    /**
     * What recognition made of the text, with the corrections that turn it
     * into canonical text. Present exactly when there was text to recognize.
     */
    recognition?: RecognitionWithCorrections;
    /**
     * What was read before repair: the assertions the input stated, before the
     * repair pass took anything away or rewrote it. A retired concept appears
     * under its replacement's name, as it does in `assertions` and in the
     * fixes.
     *
     * Present only when repair rewrote something that was read. Absent,
     * everything read came through repair. This is a record of the reading;
     * proposed fixes are computed against the resulting `assertions`, never
     * against this earlier set. Repair leaves author-stated rule conflicts
     * in the resulting value for the author to resolve.
     *
     * Listed in print order, placed by the same rendering as `assertions`. A
     * concept repair took away has no place in it, so it follows the others
     * of its category.
     */
    assertionsBeforeRepair?: Assertion[];
    /**
     * The ways to make the resulting value valid, computed from that value
     * after applied changes, each a whole marking the engine has
     * read back and found valid before offering it. Empty when the marking is
     * valid, or when no change the engine could prove would make it so. An
     * error's `suggestedFix` names one of these by its `message`.
     *
     * A request's `parts` go back in with each fix, as the caller will send
     * them, so they are read again in the fix's whole and the fix is judged
     * with them: every part that read as a valid part marking in the call
     * still does, and the fix covers every part that does. A part that did
     * not read as a valid part marking in the call is one no fix to the whole
     * can mend, so it does not keep a fix from being offered, and it may
     * still fail beside the fix.
     *
     * Proofs spend what is left of the call's work budget. When a proof runs
     * out of it, or the caller cancels the call, the paths not yet proven are
     * not offered, and `warnings` carries a notice whose `ruleId` is
     * `_fixes_unproven`, so a short list or an empty one is not taken for
     * every fix there is.
     */
    proposedFixes: Fix[];
    /**
     * The outputs the request named in `outputs`, one entry each, keyed by
     * output address. Empty when the request named none.
     *
     * A host that binds one marking to fields written in different outputs
     * names those outputs and gets every one from a single call. An output
     * that could not write the state is present and says so in its
     * assessment, because an output that refused to write a state is a
     * different fact from one nobody asked for.
     */
    renders: RenderResultsByFormat;
    /**
     * The options for each category the request named in `suggestFor`,
     * answered against these settled facts exactly as `suggestForCategories`
     * answers them, in the request's output format and surface.
     *
     * Computed only when asked. Present when the request named `suggestFor`,
     * with one entry per category named; absent otherwise. It is how a
     * composer keystroke gets the reading and the next picker's options in one
     * round trip instead of two.
     */
    suggestionsFor?: SuggestResultsByCategory;
}

/** One span of the input, by offset and text. */
export interface InputSpan {
    /**
     * Start offset in the input string.
     *
     * @asType integer
     */
    start: number;
    /**
     * End offset in the input string.
     *
     * @asType integer
     */
    end: number;
    /** The text at that span. */
    text: string;
}

/**
 * Why recognition rewrote one span of the input on the way to a reading.
 *
 * `alias` covers a concept read in a spelling the reading form does not
 * write, the spelling another of the concept's views gives among them, and a
 * prefix read in one of its `prefix_aliases`. The replacement is the spelling
 * the form writes.
 */
export type RecognitionCorrectionReason =
    | 'case'
    | 'alias'
    | 'order'
    | 'separator';

/** One span recognition rewrote, with what it was and what it became. */
export interface RecognitionCorrection {
    /**
     * Start offset in the input string.
     *
     * @asType integer
     */
    start: number;
    /**
     * End offset in the input string.
     *
     * @asType integer
     */
    end: number;
    /** The text as supplied. */
    original: string;
    /** The canonical text it was read as. */
    replacement: string;
    /** What kind of departure from canonical this was. */
    reason: RecognitionCorrectionReason;
}

/** How far recognition got. */
export type RecognitionStatus =
    | 'complete'
    | 'partial'
    | 'ambiguous'
    | 'unrecognized'
    | 'resource-limit';

/**
 * The ceilings recognition can reach.
 *
 * Closed, because a caller distinguishing a cancelled run from an exhausted
 * one is writing a branch, not a message. `aborted` is the caller's own
 * `AbortSignal` firing, which is a ceiling in the sense that matters here: the
 * answer is not a confident one. `wall-clock` is the operator's time limit, and
 * it is a separate word from `transitions` because the two say different
 * things to whoever set them: one means the input was harder than the work
 * ceiling allows, the other that the host was slower than the time allowed or
 * the input harder than both.
 */
export type RecognitionLimit =
    | 'aborted'
    | 'input-length'
    | 'transitions'
    | 'lookups'
    | 'live-states'
    | 'wall-clock'
    | 'grammar-size'
    | 'depth';

/**
 * What recognition made of an input string: how far it got, what it read, and
 * what it could not account for.
 *
 * Every character of the marking region is accounted for: `complete` means
 * recognized content, declared syntax, or permitted whitespace, with nothing
 * left over. Finding one field is never enough to stop reading. An input that
 * supports two distinct readings is `ambiguous` rather than read as either,
 * because picking one by declaration order, category order, rank, or assertion
 * count is how a guess becomes a confident answer.
 *
 * This is what a reader needs and what validate returns. Process returns
 * `RecognitionWithCorrections`, which adds how to correct the text.
 */
export interface RecognitionResult {
    /** How far recognition got. */
    status: RecognitionStatus;
    /**
     * What the text was read as, when that is decided.
     *
     * For a scheme without `render.surfaces`, the format recognized, when
     * exactly one was. For a scheme with them, the output address,
     * `surface/view`, of the view the text was read as, decided as
     * `RenderConfigDoc.surfaces` states: the same key that view's output has
     * in `renders`. The form it happened to be read in is not reported.
     * Absent when no one view is decided, as for text that carries the
     * categories of more than one surface.
     */
    inputFormat?: string;
    /**
     * Whether the text is spelled as a whole or a part marking: the role of
     * the view it was read as, or, when no one view is decided, the role
     * `RenderConfigDoc.surfaces` decides for it.
     *
     * Present only for a scheme that declares `render.surfaces`, and only
     * when that role is decided, as `RenderConfigDoc.surfaces` states. A
     * request that names no output and gives no context role is written in
     * its surfaces' defaults for this role. A context role the request gives,
     * or the place a document gives the marking, decides the role it is
     * judged and written in.
     */
    role?: ProcessingRole;
    /**
     * The surface the input was read as, by scheme scope id.
     *
     * A caller that named a surface gets it back. A caller that named none gets
     * the surface the recognized format declares, or with `render.surfaces`
     * the surface whose categories the text carries, which tells it which
     * part of a marking the text turned out to be. Absent for text that
     * carries the categories of more than one surface, unless the caller
     * named one.
     */
    surface?: string;
    /** Input not accounted for as content, syntax, or permitted whitespace. */
    unmatched: InputSpan[];
}

/**
 * What recognition made of an input string, with the corrections that turn it
 * into canonical text.
 *
 * The corrections are the edit script recognition read through: each names a
 * span of the input, what it said, and the canonical text it was read as. An
 * author's editor uses them to show what changed and where. A reader has no
 * use for them, which is why only process returns this form.
 */
export interface RecognitionWithCorrections extends RecognitionResult {
    /** Departures from canonical that recognition read through. */
    corrections: RecognitionCorrection[];
}

/** A reference to one assertion of the state being rendered. */
export interface AssertionRef {
    /** The concept asserted. */
    conceptId: string;
    /** The category it was asserted in. */
    categoryId: string;
    /** Its value, for a concept that carries free text. */
    value?: string;
}

/** Two fields of one format that both claim the same assertion. */
export interface RenderFieldConflict {
    /** The field, by `name` or category id. */
    field: string;
    /** The assertions in conflict. */
    assertions: AssertionRef[];
}

/**
 * Why this format cannot write a fact it was given.
 *
 * Closed, like the recognition-side reasons. `unframable` is a value carrying a
 * character the syntax cannot frame; `reserved-literal` a free value equal to a
 * fixed instruction beside it, which would read back as the other concept;
 * `ambiguous-identity` a value indistinguishable from a differently typed one;
 * `no-field` a fact this format's tree has no field for; `no-view` a concept
 * with no spelling in this format's view; `value-lossy` a concept this format
 * writes without its captured text.
 */
export type UnrepresentableFactReason =
    | 'unframable'
    | 'reserved-literal'
    | 'ambiguous-identity'
    | 'no-field'
    | 'no-view'
    | 'value-lossy';

/**
 * Why an output was refused whole, before any of its facts was written.
 *
 * Closed. `unresolved-context` is an output whose choice of format turns on a
 * condition the operation cannot decide, such as one that reads context the
 * caller did not supply. `ambiguous-representation` is an output with more
 * than one representation in force and nothing to choose between them, such
 * as two of its cases holding at once.
 */
export type UnrepresentableOutputReason =
    | 'unresolved-context'
    | 'ambiguous-representation';

/** The union of the two reason sets, kept for code that handles either. */
export type UnrepresentableReason =
    | UnrepresentableFactReason
    | UnrepresentableOutputReason;

/**
 * Something a render could not write: one fact, or a whole output. `reason`
 * tells the two apart, and only a fact carries a `conceptId`.
 */
export type UnrepresentableValue = UnrepresentableFact | UnrepresentableOutput;

/** A fact this format has no way to write. */
export interface UnrepresentableFact {
    /** The concept that cannot be written. */
    conceptId: string;
    /** Why this format cannot write it. */
    reason: UnrepresentableFactReason;
    /** Human-readable detail, for a message rather than a branch. */
    detail?: string;
}

/**
 * An output refused whole. Only a scheme that declares `render.surfaces`
 * refuses one, because only its views choose a format by condition, and a
 * choice that cannot be made is not a fact some format failed to write.
 */
export interface UnrepresentableOutput {
    /** The output refused, by its `surface/view` address. */
    output: string;
    /** Why it was refused. */
    reason: UnrepresentableOutputReason;
    /** Human-readable detail, for a message rather than a branch. */
    detail?: string;
}

/**
 * What a render did to the state it was given, bound to that state and that
 * format.
 *
 * Answered against the state actually rendered: what was emitted, what was
 * left out, what collapsed into an equivalent, and what could not be written
 * at all.
 *
 * A caller that needs full-state preservation reads this. A caller that wants a
 * human projection can ignore it and still get a useful string.
 */
export interface RenderAssessment {
    /** Facts this render wrote. */
    emitted: AssertionRef[];
    /**
     * Facts this render did not write.
     *
     * Some of them come back when the written text is read in the same
     * context, because the scheme derives them from what was written: a fact
     * a rule adds, a category's default, a value a part takes from its whole.
     * The rest are lost to the string, such as a fact of a scope or a surface
     * this render does not write, or one a field that writes only its own
     * view's spellings has no spelling for (`view_only`). Either way the
     * string is a projection of the facts, and a `'full'` render refuses any
     * omission.
     */
    omitted: AssertionRef[];
    /** Groups of facts that collapsed into one written equivalent. */
    collapsed: AssertionRef[][];
    /** Fields that two assertions both claim. */
    conflicts: RenderFieldConflict[];
    /** Facts that cannot be written in this format at all, and outputs refused whole. */
    unrepresentable: UnrepresentableValue[];
}

/**
 * What a caller is asking a render for.
 *
 * `'projection'` is the ordinary human projection: the format writes the fields
 * it declares and the assessment reports the rest. `'full'` is section 7.4's
 * full-preservation request, which fails rather than returning a string when
 * facts were omitted, conflicting, or unrepresentable. Naming the request is
 * what makes the failure possible: a render that only ever returns a string has
 * nowhere to say that the string is not the state.
 */
export type RenderPreservation = 'projection' | 'full';

/**
 * The output of a render: the string, and what producing it did to the state.
 *
 * The assessment travels with the string so that a convenience caller cannot
 * accidentally treat a lossy projection as a transport. It is bound to this
 * render of this state, not to the format in the abstract.
 *
 * For a scheme that declares `render.surfaces`, one result can be composed
 * from the outputs of every surface it writes, and this is what such a
 * composed result holds. The string is composed exactly as
 * `ProcessResult.rendered` is. The assessment combines the surfaces
 * written: it lists a fact as omitted only when no written surface wrote it,
 * and an unrepresentable or conflicting claim from any surface stands. Such a
 * claim is never cancelled because another surface wrote something.
 */
export interface RenderResult {
    /** The rendered marking. */
    rendered: string;
    /** What this render did to the state it was given. */
    assessment: RenderAssessment;
}

/**
 * Renders of one state, one per output, keyed by output address.
 *
 * For a scheme without `render.surfaces` the outputs are its formats, keyed by
 * format id. For a scheme with them they are the views of its surfaces, keyed
 * `surface/view` with each id percent-encoded, surfaces in declared order and
 * each surface's views in theirs. Every view a surface's default names is one
 * of its views, so a default has no entry of its own, and a format no view
 * writes has none either.
 *
 * On a process result it holds exactly the outputs the request named in
 * `outputs`. An output that was asked for and could not write the state says
 * so in its assessment rather than being left out, because a missing key
 * would mean nobody asked for it.
 */
export type RenderResultsByFormat = Record<string, RenderResult>;

/**
 * Output of SchemeEngine.aggregate(): the combined marking produced from
 * multiple portion inputs. By design aggregate always produces the proper
 * aggregate: fixes are applied, never proposed. Every field it shares with
 * `ValidateResult` means what it means there, `valid` included. It differs in
 * that:
 *
 * - There is no `inputWasValid` (input is N portions, not a single string)
 * - `proposedFixes` is always empty (aggregate applies what it can)
 */
export interface AggregateResult {
    /**
     * The assertions of the combined marking, listed in print order as a
     * validate result's are: the order the rendered marking places each
     * concept; a concept the rendering leaves out appears where it would print.
     */
    assertions: Assertion[];
    /** The combined marking, written in the output format. */
    rendered: string;
    /**
     * Portable scheme-derived display color for the final post-rollup marking.
     * Embedding hosts may override this presentation default.
     */
    displayColor?: ConceptColor;

    /**
     * True when the combined marking stands once settled, as
     * `ValidateResult.valid` defines it.
     */
    valid: boolean;

    /** The constraints the combined marking violates. */
    errors: ValidationError[];
    /** Advisory signals about the combined marking. */
    warnings: Warning[];
    /** The changes the rollup made to reach the combined marking. */
    appliedFixes: Change[];
    /** Always empty: aggregate applies every fix it can. */
    proposedFixes: Fix[];

    /**
     * The notices the scheme attaches to the concepts in `assertions`,
     * collected the same way `SchemeEngine.collectNotices()` collects them.
     * Always present, empty when the aggregate carries none, so a consumer can
     * read the field without checking that it exists.
     */
    notices: CollectedNotice[];
}

/**
 * Comparison of two assertion sets: which assertions were added, removed, or
 * shared.
 */
export interface DiffResult {
    /** Assertions in the second marking and not the first. */
    added: Assertion[];
    /** Assertions in the first marking and not the second. */
    removed: Assertion[];
    /**
     * Assertions in both markings, as the first marking holds them. Concept and
     * category decide sameness; confidence, source and value are not compared.
     */
    common: Assertion[];
}

/**
 * Result of a coverage check. The engine is given a list of child markings and
 * a single parent marking, aggregates the children in the scheme's format, then
 * compares the parent with the children category by category.
 *
 * A parent can fail to cover its children in two ways, and each has its own
 * field. `missing` is what the children need that the parent does not carry.
 * `excess` is what the parent carries that the children do not account for. A
 * caller tells "add this" from "remove this" by which field a concept is in,
 * not by reading error text.
 *
 * How a category is judged comes from how the scheme rolls it up. A category
 * that a rollup pipeline names is judged as a `pipeline` category, whatever
 * rollup it declares. Every other category is judged by the rollup it
 * declares.
 *
 * In a `union` category the parent must carry every value the children roll up
 * to, and anything it lacks is missing. A value no child carries is allowed on
 * the parent and is not excess.
 *
 * In an `intersection` category the parent may carry only values every child
 * allows, and anything else it carries is excess. A shorter list, or none, is
 * allowed and is not missing.
 *
 * In a `max`, `min` or `least_upper_bound` category the children roll up to one
 * value, ordered by rank (`max`, `min`) or by the concept hierarchy
 * (`least_upper_bound`). The parent must sit at or above that value for `max`
 * and `least_upper_bound`, and at or below it for `min`. A parent anywhere
 * else, including one the hierarchy does not order against that value, is
 * reported once, under `missing`, and never under `excess`. The value reported
 * is what the parent and children roll up to together. For `max` and `min`
 * that is the children's own value. For `least_upper_bound` it is the bound the
 * parent and children share, which can sit beyond the children's value, and it
 * is the children's own value when the hierarchy gives them no common bound.
 *
 * In a `pipeline` category the parent covers when rolling it up with the
 * children leaves it unchanged. This relies on the pipeline leaving a parent
 * rolled up on its own unchanged, which the scheme author has to make true.
 *
 * The findings in `pipeline` categories are worked out for all the categories
 * one pipeline names together. First they are narrowed to what the children
 * roll up to on their own: a value the rollup of parent and children adds is
 * missing only when the children's own rollup carries it, and a parent value
 * that rollup drops is excess only when the children's own rollup does not
 * carry it. The narrowed findings are then tested by acting on every finding
 * of the report: the excess is taken out of the parent and the missing is put
 * in, replacing what a single-value category held. They are reported only when
 * that gives a parent that is valid under the scheme's rules and covers the
 * children in every category, judged against the children's rollup. Otherwise,
 * and whenever narrowing would leave nothing, the findings are not narrowed:
 * every value the rollup of parent and children adds is missing, and every
 * parent value it drops is excess, including one the children carry.
 * Pipelines are decided one at a time, in the order the scheme lists them.
 * Each is judged with the findings already decided for the pipelines before it
 * and the full findings for those after it.
 *
 * In a `first` or `last` category the children roll up to one value and the
 * rollup has no restrictive direction, so the parent must state that value. A
 * parent that states a different one is reported once, under `missing`, as the
 * value it should state, and never under `excess`. In such a category that
 * holds several values, values the parent states beyond the picked one are not
 * reported.
 *
 * In a `symmetric_difference`, `exclusive_or` or `complement` category the
 * children roll up to a set and the rollup has no restrictive direction, so
 * the parent must state exactly that set. Rolled-up values the parent does not
 * state are missing. Values the parent states beyond that set are excess:
 * stated, but not what the children roll up to. Neither side is more
 * restrictive than the other here.
 *
 * In a category where the scheme has an `expand_group` rule, a parent that
 * carries every member a group declares in that category states the group,
 * and the group is not missing from it. This does not apply to a category
 * whose rollup has no restrictive direction (`first`, `last`,
 * `symmetric_difference`, `exclusive_or`, `complement`),
 * where the parent must state what the children roll up to as it is.
 *
 * In a `union` or `pipeline` category the scheme marks as a hierarchy root, a
 * parent value ranked at or above a needed value also covers it.
 *
 * With no non-empty children, a valid parent is covered and both lists are
 * empty.
 *
 * `rendered` is the aggregate of the children rendered in the requested
 * format; the UI can display it directly as the computed rollup without a
 * separate aggregate() round-trip.
 */
export interface CoverageReport {
    /**
     * Whether the parent covers the children. True when `missing` and `excess`
     * are both empty and no rollup was refused. False otherwise; `missing`,
     * `excess` and `refusals` together say why.
     */
    covered: boolean;
    /**
     * Concepts the children need that the parent does not carry, judged per
     * category as described on this type. In a `pipeline` category whose
     * findings are not narrowed, this can include a value the pipeline itself
     * adds when it rolls the parent up with the children. Empty when the parent
     * lacks nothing.
     */
    missing: Assertion[];
    /**
     * Display labels for the concepts in `missing`, for showing to a person.
     * A label appears once even when several concepts display the same way, so
     * the list can be shorter than `missing` and is not aligned with it by
     * position. Where the operation takes an output format, labels are spelled
     * in it. Empty when `missing` is empty.
     */
    missingLabels: string[];
    /**
     * Concepts the parent carries that the children do not account for,
     * judged per category as described on this type. In a
     * `symmetric_difference`, `exclusive_or` or `complement` category that
     * means values the parent states beyond the set the children roll up to.
     * In a `pipeline` category whose findings are not narrowed it means every
     * parent value the rollup of parent and children drops, which can include
     * values the children carry. Everywhere else it means values the children
     * do not allow.
     *
     * Concepts appear as the author wrote them. When a written value brought
     * others with it, such as a group that stands for its members, only the
     * written value is listed, not the members. In a category where nothing in
     * excess was written by the author, every excess value is listed. `excess`
     * is empty only when the parent carries nothing the children do not
     * account for.
     */
    excess: Assertion[];
    /**
     * Display labels for the concepts in `excess`, for showing to a person.
     * A label appears once even when several concepts display the same way, so
     * the list can be shorter than `excess` and is not aligned with it by
     * position. Where the operation takes an output format, labels are spelled
     * in it. Empty when `excess` is empty.
     */
    excessLabels: string[];
    /**
     * The children's aggregate, written in the requested format, so a UI can
     * show the computed rollup without a separate aggregate call. Empty when
     * there are no child markings.
     */
    rendered: string;
    /**
     * What the scheme said when it refused a rollup this check computed, in
     * the scheme's own words: the children rolled up together, or the parent
     * rolled up with them.
     *
     * Markings that are each valid can still combine into a state the scheme
     * does not allow, and that is a defect in the document rather than in the
     * request: it is the answer a coverage check exists to give, so it is
     * reported here instead of raised. Absent when no rollup was refused.
     * Missing and excess concepts are never reported here; they have their own
     * fields.
     *
     * Each entry names the constraint and carries the message the rule wrote,
     * which is where the contributing markings are named.
     */
    refusals?: ValidationError[];
}
