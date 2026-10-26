import type { Assertion, ValidateResult } from './scheme';
import type { LayerBinding } from './layer';
import type { ArtifactReference, AssertionReference } from './provenance';

/** Decision a reviewed crosswalk makes for one source assertion. */
export type CrosswalkDisposition = 'carry' | 'review' | 'omit' | 'forbid';

/** Scheme dependency declared by a directional crosswalk. */
export interface CrosswalkSchemeDependency {
    /** Scheme artifact identifier. */
    id: string;
    /** Required scheme version or semver range. */
    version?: string;
}

/** One target assertion a crosswalk can emit or propose. */
export interface CrosswalkTarget extends AssertionReference {
    /** Copy the source assertion's captured value onto this target. */
    copyValue?: boolean;
}

/** Reviewed treatment of one source assertion in a directional crosswalk. */
export interface CrosswalkMapping {
    /** Stable identifier for audit and review. */
    id: string;
    /** Source assertion matched by this mapping. */
    source: AssertionReference;
    /**
     * Target assertions. `carry` mappings emit these automatically; `review`
     * mappings expose them only as proposals. `omit` and `forbid` mappings have
     * no targets.
     */
    targets?: CrosswalkTarget[];
    /** Whether the value is carried, reviewed, omitted, or forbids translation. */
    disposition: CrosswalkDisposition;
    /** Human-readable basis for the decision. */
    reason: string;
    /** Authority or reviewed source behind the mapping, when one exists. */
    authority?: string;
    /** Operator guidance for applying or reviewing this mapping. */
    guidance?: string;
    /** Citation supporting this mapping decision. */
    citation?: string;
}

/** Boolean test over source assertions used to choose a crosswalk candidate. */
export interface CrosswalkSelectionCondition {
    /** At least one referenced assertion must be present. */
    any?: AssertionReference[];
    /** Every referenced assertion must be present. */
    all?: AssertionReference[];
    /** None of the referenced assertions may be present. */
    none?: AssertionReference[];
}

/** One possible reviewed mapping set in a cross-field crosswalk decision. */
export interface CrosswalkSelectionCandidate {
    /** Stable candidate identifier within its selection. */
    id: string;
    /**
     * Treatment applied when this candidate is selected. Omitted, the
     * candidate carries (`carry`).
     */
    disposition?: CrosswalkDisposition;
    /**
     * Predicate used by a `first-match` selection; omission makes this the
     * fallback.
     */
    when?: CrosswalkSelectionCondition;
    /** Assertions counted by a `most-matches` selection. */
    score?: AssertionReference[];
    /** Source assertions covered when this candidate is selected. */
    sources?: AssertionReference[];
    /** Per-assertion mappings activated when this candidate is selected. */
    mappings?: CrosswalkMapping[];
    /** Targets emitted once when this candidate is selected. */
    targets?: CrosswalkTarget[];
    /** Human-readable basis for selecting and applying this candidate. */
    reason: string;
    /** Authority behind the candidate decision, when one exists. */
    authority?: string;
    /** Operator guidance for the candidate decision. */
    guidance?: string;
    /** Citation supporting the candidate decision. */
    citation?: string;
}

/** Strategy for choosing one candidate from a reviewed cross-field decision. */
export type CrosswalkSelectionStrategy = 'first-match' | 'most-matches';

/** Cross-field decision that activates exactly one reviewed mapping candidate. */
export interface CrosswalkSelection {
    /** Stable selection identifier for audit and review. */
    id: string;
    /** Deterministic candidate-selection strategy. */
    strategy: CrosswalkSelectionStrategy;
    /** Ordered candidates; order breaks ties and places a fallback last. */
    candidates: CrosswalkSelectionCandidate[];
}

/**
 * One element a crosswalk layer takes away, named by kind and id. Exactly one
 * key.
 *
 * The same reference-not-a-path reasoning as the scheme family: a mapping or a
 * selection is addressed by the id it was reviewed under, which survives a
 * storage change and validates as a closed set.
 */
export type CrosswalkLayerRemoval =
    | {
          /** The id of the mapping to remove. */
          mapping: string;
      }
    | {
          /** The id of the selection to remove. */
          selection: string;
      };

/**
 * The crosswalk family's layer payload. Required when `type: 'layer'`,
 * forbidden otherwise.
 *
 * A crosswalk layer is how an organization covers source assertions its base
 * crosswalk has never seen. Concepts local to that organization arrive through
 * its own scheme layer, and the sold crosswalk above it structurally could not
 * have mapped them; without a layer they translate as `unmapped`, which is safe
 * but leaves a reviewer holding the decision. The layer's own `mappings` and
 * `selections` are the additions and overrides, written as an ordinary
 * crosswalk document; what it takes away is listed here.
 *
 * Binding and merge rules are the cross-family ones: see `LayerBinding`.
 * A crosswalk layer may add, override, and remove; later wins on a colliding
 * id. The layer's `sourceScheme` and `targetScheme` must name the same pair its
 * base does, since a mapping between one pair of schemes says nothing about
 * another.
 */
export interface CrosswalkLayer extends LayerBinding {
    /** Mappings and selections inherited from below that this layer takes away. */
    removes?: CrosswalkLayerRemoval[];
    /**
     * Mappings and selections an earlier layer removed that this one brings
     * back, with the decision they carried below. Naming an element in both
     * `removes` and `restores` is a load error.
     */
    restores?: CrosswalkLayerRemoval[];
}

/**
 * Directional, versioned mapping between two schemes.
 *
 * A reverse operation requires a separate definition. Directionality is
 * explicit because a safe source-to-target mapping is not necessarily safe in
 * the other direction.
 */
export interface CrosswalkDefinition {
    /** Root `crosswalk:` envelope. */
    crosswalk: {
        /** Unique crosswalk identifier. */
        id: string;
        /** Semantic version of this crosswalk. */
        version: string;
        /** Human-readable crosswalk name. */
        name: string;
        /** Longer description of what this crosswalk translates. */
        description?: string;
        /** General usage and review guidance for this crosswalk. */
        guidance?: string;
        /** Primary citation for the crosswalk artifact. */
        citation?: string;
        /**
         * What kind of document this is. Absent means `'crosswalk'`.
         * `type: 'layer'` requires the `layer` block and `type: 'crosswalk'`
         * forbids it, both enforced at load. Every layerable family wears this
         * same envelope; see `LayerBinding`.
         */
        type?: 'crosswalk' | 'layer';
        /**
         * The crosswalk family's layer payload. Required when `type: 'layer'`,
         * forbidden otherwise.
         */
        layer?: CrosswalkLayer;
        /** The scheme this crosswalk translates from. */
        sourceScheme: CrosswalkSchemeDependency;
        /** The scheme this crosswalk translates to. */
        targetScheme: CrosswalkSchemeDependency;
        /** How each source concept translates into the target scheme. */
        mappings: CrosswalkMapping[];
        /**
         * Optional cross-field decisions whose selected mappings supplement
         * `mappings`.
         */
        selections?: CrosswalkSelection[];
    };
}

/** Input to a composed Context crosswalk operation. */
export interface CrosswalkTranslationInput {
    /** Crosswalk artifact id loaded into the Context. */
    crosswalkId: string;
    /** Source marking text or previously parsed source assertions. */
    marking: string | Assertion[];
}

/** Per-assertion decision produced by a crosswalk translation. */
export interface CrosswalkOutcome {
    /** Source assertion considered by the crosswalk. */
    source: AssertionReference;
    /** Matched mapping id, absent when no mapping covers the assertion. */
    mappingId?: string;
    /** Mapping decision, or `unmapped` when the artifact has no rule. */
    disposition: CrosswalkDisposition | 'unmapped';
    /** Emitted targets for `carry`, proposed targets for `review`. */
    targets: CrosswalkTarget[];
    /** Reviewable explanation of the decision. */
    reason: string;
    /** Authority copied from the mapping, when declared. */
    authority?: string;
    /** Operator guidance copied from the mapping, when declared. */
    guidance?: string;
    /** Supporting citation copied from the mapping, when declared. */
    citation?: string;
}

/** Selected branch of one cross-field crosswalk decision. */
export interface CrosswalkSelectionOutcome {
    /** Selection definition id. */
    selectionId: string;
    /** Candidate chosen by the selection strategy. */
    candidateId: string;
    /** Treatment applied by the selected candidate. */
    disposition: CrosswalkDisposition;
    /** Targets emitted for `carry`, or proposed for `review`. */
    targets: CrosswalkTarget[];
    /** Human-readable basis copied from the selected candidate. */
    reason: string;
    /** Authority copied from the selected candidate, when declared. */
    authority?: string;
    /** Operator guidance copied from the selected candidate, when declared. */
    guidance?: string;
    /** Supporting citation copied from the selected candidate, when declared. */
    citation?: string;
}

/** Completion state of a crosswalk that reached target-scheme processing. */
export type CrosswalkCompletedTranslationStatus =
    | 'complete'
    | 'partial'
    | 'invalid-source';

/** Completion state of a directional crosswalk operation. */
export type CrosswalkTranslationStatus =
    | CrosswalkCompletedTranslationStatus
    | 'forbidden';

/** A per-assertion mapping that prohibited a crosswalk translation. */
export interface CrosswalkMappingForbidMatch {
    /** A per-assertion mapping prohibited the translation. */
    kind: 'mapping';
    /** Stable mapping id. */
    mappingId: string;
    /** Source assertion that matched the mapping. */
    source: AssertionReference;
    /** Human-readable basis for the prohibition. */
    reason: string;
    /** Authority copied from the mapping, when declared. */
    authority?: string;
    /** Operator guidance copied from the mapping, when declared. */
    guidance?: string;
    /** Supporting citation copied from the mapping, when declared. */
    citation?: string;
}

/** A selected cross-field candidate that prohibited a crosswalk translation. */
export interface CrosswalkSelectionForbidMatch {
    /** A selected cross-field candidate prohibited the translation. */
    kind: 'selection-candidate';
    /** Selection definition id. */
    selectionId: string;
    /** Selected candidate id. */
    candidateId: string;
    /** Source assertions explicitly covered by the candidate. */
    sources: AssertionReference[];
    /** Human-readable basis for the prohibition. */
    reason: string;
    /** Authority copied from the candidate, when declared. */
    authority?: string;
    /** Operator guidance copied from the candidate, when declared. */
    guidance?: string;
    /** Supporting citation copied from the candidate, when declared. */
    citation?: string;
}

/**
 * A matched prohibition that aborted a crosswalk translation.
 *
 * Both branches are named types rather than anonymous object literals because
 * the wire mirrors this union, and a generated SDK needs a name for each side.
 */
export type CrosswalkForbidMatch =
    | CrosswalkMappingForbidMatch
    | CrosswalkSelectionForbidMatch;

/** Fields shared by every directional crosswalk result. */
export interface CrosswalkTranslationResultBase {
    /** Crosswalk artifact used for the operation. */
    crosswalk: ArtifactReference;
    /** Source scheme artifact. */
    sourceScheme: ArtifactReference;
    /** Target scheme artifact. */
    targetScheme: ArtifactReference;
    /**
     * What validate answers for the source marking: its facts, whether it
     * stands, and how it was read. A translation reads the source; it does not
     * correct it, so the answer carries no fix paths.
     */
    source: ValidateResult;
    /** Ordered treatment of every source assertion. */
    outcomes: CrosswalkOutcome[];
    /** Cross-field candidate chosen for every declared selection. */
    selections: CrosswalkSelectionOutcome[];
}

/** Translation that reached target-scheme processing. */
export interface CrosswalkCompletedTranslationResult extends CrosswalkTranslationResultBase {
    /**
     * What validate answers for the target marking, built only from the
     * carried assertions. Nothing was read, so it has no `recognition`.
     */
    target: ValidateResult;
    /** Completion state after source and target processing. */
    status: CrosswalkCompletedTranslationStatus;
}

/** Translation aborted before target processing by one or more prohibitions. */
export interface CrosswalkForbiddenTranslationResult extends CrosswalkTranslationResultBase {
    /** No target result exists when translation is forbidden. */
    target?: never;
    /** Every matched prohibition, in deterministic evaluation order. */
    forbiddenBy: CrosswalkForbidMatch[];
    /** Terminal hard-stop state. */
    status: 'forbidden';
}

/** Result of applying a reviewed directional crosswalk. */
export type CrosswalkTranslationResult =
    | CrosswalkCompletedTranslationResult
    | CrosswalkForbiddenTranslationResult;
