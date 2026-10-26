import type {
    Assertion,
    Change,
    CoverageReport,
    Fix,
    RecognitionResult,
    ValidateResult,
    ValidationError,
    Vocabulary,
    Warning,
} from './scheme';
import type { EvaluationResult } from './guide';
import type { AccessDecision } from './access';
import type {
    ArtifactReference,
    AssertionReference,
    AssertionSupport,
    ContentEvidenceSpan,
    RuleReference,
    SourceReference,
} from './provenance';

/**
 * Zero-based UTF-8 byte offset carried as a JSON integer.
 *
 * @asType integer
 */
type DocumentByteOffset = number;

/** Analyst determination for a nominated guide finding. */
export type GuideFindingDecision = 'accepted' | 'rejected';

/** Structural verdict derived from authored document markings. */
export type DocumentOverallVerdict =
    | 'pass'
    | 'inadequate-coverage'
    | 'procedural-gap'
    | 'mixed';

/** Authority basis used to construct an access scenario. */
export type AccessScenarioBasis = 'authored' | 'authoritative' | 'projected';

/** Closed evaluation status of an access scenario. */
export type AccessScenarioStatus = 'granted' | 'denied' | 'not-evaluated';

/** Explains why an assessment dimension or conclusion is constrained. */
export interface AssessmentLimitation {
    /** Stable machine-readable limitation code. */
    code: string;
    /** Optional operation scope affected by the limitation. */
    scope?: string;
    /** Human-readable explanation safe for the selected response profile. */
    reason: string;
}

/** Stable INVALID_INPUT detail values emitted by document operations. */
export type DocumentInputErrorDetail =
    | 'empty-document'
    | 'invalid-unicode'
    | 'conflicting-guide-determination'
    | 'conflicting-manual-selection'
    | 'manual-selection-duplicates-finding'
    | 'stale-guide-determination'
    | 'stale-manual-selection';

/** Controls how much evidence detail a document operation returns. */
export type DocumentResponseProfile = 'summary' | 'standard' | 'full';

/** Counts the full, unprojected semantic result of a document operation. */
export interface DocumentResponseCounts {
    /** Number of lexical nominations. @asType integer */
    nominations: number;
    /** Number of evidence spans. @asType integer */
    evidenceSpans: number;
    /** Number of evaluated guide units. @asType integer */
    guideUnits: number;
    /** Access-rule results across all scenarios. @asType integer */
    accessRuleResults: number;
    /** Content requirements across all scenarios. @asType integer */
    contentRequirements: number;
    /** Context requirements across all scenarios. @asType integer */
    contextRequirements: number;
}

/** Describes the explicit projection applied after full evaluation. */
export interface DocumentResponseProjection {
    /** Requested response detail profile. */
    profile: DocumentResponseProfile;
    /** True only when the full profile returned every detail. */
    detailsComplete: boolean;
    /** JSON-pointer paths omitted by the selected profile. */
    omittedFields: string[];
    /** Counts from the full result before projection. */
    counts: DocumentResponseCounts;
}

/** Resolution identity shared by every branch of one Context operation. */
export interface ContextResolution {
    /** Resolved Context identifier. */
    contextId: string;
    /**
     * The version the request named, an alias such as `latest` included, and
     * `latest` when the request named none. `resolvedVersion` is the concrete
     * version that answered. Absent only from a resolution produced in process
     * without a request.
     */
    requestedVersion?: string;
    /** Concrete Context version used by the operation. */
    resolvedVersion: string;
    /** Ordered artifacts participating in the composition. */
    artifacts: ArtifactReference[];
    /** De-duplicated source observations used by the operation. */
    sources: SourceReference[];
}

/** Concrete Context operation envelope shared by local and remote surfaces. */
export interface ContextOperationResult<T> {
    /** Single resolved composition used throughout the operation. */
    resolution: ContextResolution;
    /** Typed operation result. */
    result: T;
    /** Limitations applying to the operation as a whole. */
    operationLimitations: AssessmentLimitation[];
    /** Projection metadata, present only for document operations. */
    responseProjection?: DocumentResponseProjection;
}

/** Records an explicit analyst decision about one lexical nomination. */
export interface GuideFindingDetermination {
    /** Stable identifier of the exact nominated occurrence. */
    findingId: string;
    /** Digest of the exact document revision reviewed. */
    documentDigest: string;
    /** Analyst decision for the nominated occurrence. */
    decision: GuideFindingDecision;
    /** Analyst-supplied reason for the decision. */
    reason: string;
    /** Optional provenance for how the decision proposal was drafted. */
    proposalOrigin?: DecisionProposalOrigin;
}

/** Describes how a decision proposal entered the analyst workflow. */
export type DecisionProposalOrigin =
    | 'analyst-authored'
    | 'agent-drafted'
    | 'host-imported';

/** Input for an analyst-selected rule that lexical scanning missed. */
export interface ManualGuideSelectionInput {
    /** Digest of the exact document revision reviewed. */
    documentDigest: string;
    /** Qualified loaded rule selected by the analyst. */
    rule: RuleReference;
    /** Evidence in the submitted document supporting the selection. */
    evidence: ContentEvidenceSpan[];
    /** Analyst-supplied reason for the selection. */
    reason: string;
    /** Optional provenance for how the selection proposal was drafted. */
    proposalOrigin?: DecisionProposalOrigin;
}

/** Validated manual guide fact bound to a document revision. */
export interface ManualGuideSelection extends ManualGuideSelectionInput {
    /** Deterministic selection identity. */
    selectionId: string;
}

/** Set-semantic analyst input supplied to guide evaluation. */
export interface GuideDeterminationInput {
    /** Decisions for lexical nominations. */
    findings: GuideFindingDetermination[];
    /** Qualified rules manually selected by the analyst. */
    manualSelections: ManualGuideSelectionInput[];
}

/** Evidence-preserving lexical nomination requiring analyst review. */
export interface GuideNomination {
    /** Deterministic identity of this evidence occurrence. */
    findingId: string;
    /** Digest of the exact scanned document bytes. */
    documentDigest: string;
    /**
     * Nomination source; lexical evidence is never authoritative itself.
     *
     * Always `lexical`, and fixed for this major version. A nomination is by
     * definition a rule's evidence matched in the document text, and the
     * counts, determinations and advisory results that refer to nominations
     * all mean lexical ones. A proposal from any other source (an analyst, an
     * agent, a host) reaches the analyst as a manual selection with its own
     * `proposalOrigin`. A new nomination source would change what this list
     * means, so it would arrive as a new field, not as a new value here.
     */
    origin: 'lexical';
    /** Qualified rule nominated by the evidence. */
    rule: RuleReference;
    /** Evidence occurrences supporting the nomination. */
    evidence: ContentEvidenceSpan[];
    /** Assertions the rule would propose if accepted. */
    proposedAssertions: AssertionReference[];
    /** Rule-authored explanation for the nomination. */
    rationale?: string;
}

/** Full guide and scheme breakdown retained by the full response profile. */
export interface GuideCompiledDetail {
    /** Complete guide evaluation breakdown. */
    evaluation: EvaluationResult;
    /**
     * What validate answers for the compiled assertions: the facts settled,
     * whether they stand, and why not. A compiled marking is checked, not
     * corrected, so it carries no fix paths.
     */
    process: ValidateResult;
}

/** Deterministic guide compilation for one authority basis and unit. */
export interface GuideCompiledResult {
    /**
     * Effective compiled assertions, listed in print order as a validate
     * result's are.
     */
    assertions: Assertion[];
    /** Scheme-rendered marking for the compiled assertions. */
    rendered: string;
    /**
     * Whether the compiled marking stands once settled, as
     * `ValidateResult.valid` defines it.
     */
    valid: boolean;
    /** Validation errors from scheme processing. */
    errors: ValidationError[];
    /** Non-fatal scheme-processing warnings. */
    warnings: Warning[];
    /** Direct rules contributing to the result. */
    directRules: RuleReference[];
    /** Computed rules contributing to the result. */
    computedRules: RuleReference[];
    /** Rules replaced by active overrides. */
    overriddenRules: RuleReference[];
    /** References into the evaluation support catalog. */
    supportIds: string[];
    /** Complete evaluation and process breakdown for the full profile. */
    detail?: GuideCompiledDetail;
}

/** Declares a document range to evaluate as one guide scope. */
export interface GuideEvaluationUnitInput {
    /** Opaque stable scope identifier. */
    scopeId: string;
    /** Zero-based inclusive UTF-8 byte offset. @asType integer */
    start: DocumentByteOffset;
    /** Zero-based exclusive UTF-8 byte offset. @asType integer */
    end: DocumentByteOffset;
    /** Frozen byte-offset encoding. */
    offsetEncoding: 'utf-8-bytes';
}

/** Range masked from lexical evaluation while preserving original offsets. */
export interface GuideContentExclusion {
    /** Zero-based inclusive UTF-8 byte offset. @asType integer */
    start: DocumentByteOffset;
    /** Zero-based exclusive UTF-8 byte offset. @asType integer */
    end: DocumentByteOffset;
    /** Frozen byte-offset encoding. */
    offsetEncoding: 'utf-8-bytes';
}

/** Determined and projected compilation for one document unit. */
export interface GuideUnitEvaluation extends GuideEvaluationUnitInput {
    /** Nomination IDs whose evidence belongs to this unit. */
    findingIds: string[];
    /** Compilation over accepted findings and manual selections. */
    determined: GuideCompiledResult | null;
    /** Advisory compilation additionally assuming unresolved nominations. */
    projected: GuideCompiledResult | null;
}

/** Complete evidence and compilation result for document guide evaluation. */
export interface GuideContentEvaluation {
    /** Digest of the exact evaluated document bytes. */
    documentDigest: string;
    /** Canonically ordered lexical nominations. */
    nominations: GuideNomination[];
    /** Validated analyst decisions. */
    determinations: GuideFindingDetermination[];
    /** Validated qualified manual selections. */
    manualSelections: ManualGuideSelection[];
    /** Nomination IDs awaiting analyst decision. */
    unresolvedFindingIds: string[];
    /** Accepted nomination IDs. */
    acceptedFindingIds: string[];
    /** Rejected nomination IDs. */
    rejectedFindingIds: string[];
    /** De-duplicated assertion support graph. */
    supportCatalog: AssertionSupport[];
    /** Compilation results for the document and authored parts. */
    units: GuideUnitEvaluation[];
    /** Guide-dimension limitations. */
    limitations: AssessmentLimitation[];
}

/** Closed status of the analyst-determined guide compilation dimension. */
export type GuideCompilationStatus =
    | 'not-evaluated'
    | 'no-findings'
    | 'pending-determination'
    | 'determined-sufficient'
    | 'determined-insufficient';

/** Coverage of one unit against determined and projected requirements. */
export interface GuideScopeCoverage {
    /** Unit scope identifier. */
    scopeId: string;
    /** Coverage against currently accepted/manual facts. */
    determinedCoverage: CoverageReport | null;
    /** Advisory coverage assuming unresolved nominations are accepted. */
    projectedCoverage: CoverageReport | null;
}

/** Guide dimension of a document audit. */
export interface DocumentGuideAssessment {
    /** Conservative status of the determined compilation. */
    status: GuideCompilationStatus;
    /** Number of lexical nominations. @asType integer */
    nominationCount: number;
    /** Number of unresolved nominations. @asType integer */
    unresolvedCount: number;
    /** Number of accepted nominations. @asType integer */
    acceptedCount: number;
    /** Number of rejected nominations. @asType integer */
    rejectedCount: number;
    /** Number of evidence spans. @asType integer */
    evidenceSpanCount: number;
    /** Evidence and unit detail, omitted by the summary profile. */
    evaluation?: GuideContentEvaluation;
    /** Determined/projected coverage for each evaluation unit. */
    unitCoverage: GuideScopeCoverage[];
    /** Whole-document requirement from accepted/manual facts. */
    determinedRequiredWhole: GuideCompiledResult | null;
    /** Advisory whole-document requirement including unresolved facts. */
    projectedRequiredWhole: GuideCompiledResult | null;
    /** Authored whole coverage of the determined requirement. */
    determinedWholeCoverage: CoverageReport | null;
    /** Authored whole coverage of the projected requirement. */
    projectedWholeCoverage: CoverageReport | null;
}

/**
 * How an audit judged one authored marking, whole or part.
 *
 * `valid` and `inputWasValid` mean exactly what `ValidateResult` defines them
 * to mean. An audit asks whether the marking was right as the author wrote it,
 * and that is `inputWasValid`; `valid` says whether it stands once the engine
 * has settled it, as it does everywhere else.
 *
 * It carries the marking's facts and how far recognition got with it, so a
 * caller that rolls markings up, checks access or offers a correction works
 * from the audit instead of reading each marking a second time.
 */
export interface MarkingValidation {
    /**
     * The facts the marking states, settled and listed in print order as a
     * validate result's `assertions` are, in the role the marking has in this
     * document.
     */
    assertions: Assertion[];
    /** What recognition made of the marking, as `ValidateResult.recognition`. */
    recognition: RecognitionResult;
    /** Whether the marking stands once settled, as `ValidateResult.valid`. */
    valid: boolean;
    /**
     * Whether the marking needed no change as written, as
     * `ValidateResult.inputWasValid`.
     */
    inputWasValid: boolean;
    /** What the scheme's rules find wrong with the settled marking. */
    errors: ValidationError[];
    /**
     * The ways to make the marking valid, each a whole marking the engine has
     * read back and found valid, as `ProcessResult.proposedFixes`. An audit
     * offers them because its caller is usually the author about to fix the
     * document.
     */
    proposedFixes: Fix[];
    /**
     * Every change the engine made while settling the marking, as
     * `ValidateResult.appliedFixes`. Empty when it made none, so a false
     * `inputWasValid` is always explained here or in `errors`.
     */
    appliedFixes: Change[];
    /**
     * The settled marking, written as validate writes it when the request
     * names no output: in the scheme's default format, or for a scheme that
     * declares `render.surfaces`, each written surface in its default for the
     * role the marking has in this document, by the rule
     * `RenderConfigDoc.surfaces` states.
     */
    rendered: string;
}

/** A document range not governed by an authored marking. */
export interface DocumentUnmarkedSpan {
    /** Zero-based inclusive offset in the accepted document. @asType integer */
    start: DocumentByteOffset;
    /** Zero-based exclusive offset in the accepted document. @asType integer */
    end: DocumentByteOffset;
    /** Frozen byte-offset encoding. */
    offsetEncoding: 'utf-8-bytes';
    /** Authored text, omitted outside the full response profile. */
    text?: string;
}

/** One authored document-wide marking occurrence. */
export interface DocumentWholeOccurrence {
    /** The whole marking as the document writes it. */
    marking: string;
    /** Zero-based inclusive UTF-8 byte offset. @asType integer */
    start: DocumentByteOffset;
    /** Zero-based exclusive UTF-8 byte offset. @asType integer */
    end: DocumentByteOffset;
    /** Frozen byte-offset encoding. */
    offsetEncoding: 'utf-8-bytes';
}

/**
 * One authored part marking, the region it governs, and how it was judged,
 * facts included.
 */
export interface DocumentPartAssessment {
    /** The part marking as the document writes it. */
    marking: string;
    /**
     * The text the part marking governs. Omitted outside the full response
     * profile.
     */
    text?: string;
    /** Zero-based inclusive UTF-8 byte offset. @asType integer */
    start: DocumentByteOffset;
    /** Zero-based exclusive UTF-8 byte offset. @asType integer */
    end: DocumentByteOffset;
    /** Frozen byte-offset encoding. */
    offsetEncoding: 'utf-8-bytes';
    /**
     * The scope id the part is evaluated under, `part-` followed by its
     * one-based position in the document. Guide results for the part carry the
     * same id.
     */
    scopeId: string;
    /** How the part marking was judged, with the facts it states. */
    validation: MarkingValidation;
}

/**
 * Canonical marking requirements evaluated for this document from the loaded
 * scheme. Without declared conditions, whole defaults to false and part to true.
 */
export interface DocumentMarkingRequirements {
    /** Whether an authored document-wide marking is required. */
    whole: boolean;
    /** Whether authored part markings are required for document text. */
    part: boolean;
}

/** Authored structural and analyst-determined guide audit of one document. */
export interface DocumentAuditReport {
    /** Evaluated canonical marking requirements, independent of discovered evidence. */
    markingRequirements: DocumentMarkingRequirements;
    /** First authored document-wide marking, or null when absent. */
    whole: string | null;
    /** Every authored document-wide marking occurrence. */
    wholes: DocumentWholeOccurrence[];
    /**
     * How the first authored whole was judged, as a whole that must cover the
     * authored parts that read as markings, with the facts it states. Null
     * when the document has no authored whole.
     */
    wholeValidation: MarkingValidation | null;
    /** Authored part markings and their governed regions. */
    parts: DocumentPartAssessment[];
    /** Authored whole coverage of authored parts. */
    wholeCoversParts: CoverageReport | null;
    /** Authored ranges not governed by a marking. */
    unmarkedSpans: DocumentUnmarkedSpan[];
    /** Stable authored-procedure findings. */
    proceduralFlags: string[];
    /** Verdict derived only from authored structural dimensions. */
    overallVerdict: DocumentOverallVerdict;
    /** Scheme-provided display vocabulary. */
    vocabulary: Vocabulary | null;
    /** SHA-256 digest of the exact accepted UTF-8 document bytes. */
    documentDigest: string;
    /** Guide compilation dimension, or null when no guide applies. */
    guideAssessment: DocumentGuideAssessment | null;
    /** Document-level assessment limitations. */
    limitations: AssessmentLimitation[];
}

/** Input shared by local and remote document audit operations. */
export interface DocumentAssessmentInput {
    /** Exact plain-text document to assess. */
    text: string;
    /** Explicit analyst decisions for this document revision. */
    guideDeterminations?: GuideDeterminationInput;
    /** Requested response detail profile; defaults to standard. */
    responseProfile?: DocumentResponseProfile;
}

/** Effective marking/assertion target evaluated in one access scenario. */
export interface EffectiveDocumentTarget {
    /** Authority basis used to construct the target. */
    basis: AccessScenarioBasis;
    /** Scheme-rendered effective marking. */
    marking: string;
    /**
     * Effective assertions evaluated by access policy, listed in print order:
     * the order `marking` places each concept; a concept it leaves out appears
     * where it would print.
     */
    assertions: Assertion[];
    /** Authored document-wide marking when present. */
    authoredWhole?: string;
    /** Authored part markings. */
    authoredParts: string[];
    /** Whole required by accepted/manual guide facts. */
    determinedGuideRequiredWhole?: string;
    /** Advisory whole additionally assuming unresolved nominations. */
    projectedGuideRequiredWhole?: string;
}

/** Traceable document-side route for causing an assertion to cease applying. */
export interface ContentChangeRequirement {
    /** Access rule that denied the effective target. */
    rule: RuleReference;
    /** Blocking content-derived assertion. */
    assertion: AssertionReference;
    /** Assertion support records proving the content lineage. */
    supportIds: string[];
    /** Conditional instruction that does not synthesize replacement text. */
    instruction: string;
    /** Revised content must always be reassessed. */
    verificationRequired: true;
}

/** Conditional external relationship needed by a subject-context comparison. */
export interface SubjectContextRequirement {
    /** Access rule requiring the relationship. */
    rule: RuleReference;
    /** Immutable subject operand path. */
    subjectPath: string;
    /** Supplied context operand path. */
    contextPath: string;
    /** Comparison operator. */
    operator: string;
    /** Context values that would satisfy the relationship, when known. */
    acceptableValues?: unknown[];
    /** Conditional explanation of the external-state prerequisite. */
    instruction: string;
}

/** Access result for one authored, authoritative, or projected target. */
export interface AccessScenarioAssessment {
    /** Authority basis of this scenario. */
    basis: AccessScenarioBasis;
    /** Whether the scenario is advisory rather than authoritative. */
    advisory: boolean;
    /** Closed evaluation status. */
    status: AccessScenarioStatus;
    /** Effective target, or null when none can be derived. */
    target: EffectiveDocumentTarget | null;
    /** Access decision, omitted for summary and not-evaluated scenarios. */
    decision?: AccessDecision;
    /** Traceable document-side requirements, omitted by summary. */
    contentRequirements?: ContentChangeRequirement[];
    /** Conditional relationship requirements, omitted by summary. */
    contextRequirements?: SubjectContextRequirement[];
    /** Scenario-specific limitations. */
    limitations: AssessmentLimitation[];
}

/** Three-scenario document access result with no fused grant or denial. */
export interface DocumentAccessAssessment {
    /** Structural and guide audit used to build every scenario. */
    audit: DocumentAuditReport;
    /** Decision based only on authored markings. */
    authored: AccessScenarioAssessment;
    /** Decision including accepted findings and manual selections. */
    authoritative: AccessScenarioAssessment;
    /** Advisory unresolved-nomination scenario when it adds an assertion. */
    projected: AccessScenarioAssessment | null;
}

/** Input for deterministic document access assessment. */
export interface DocumentAccessAssessmentInput extends DocumentAssessmentInput {
    /** Immutable user attributes interpreted by the access policy. */
    userAttributes: Record<string, unknown>;
    /** Authoritative contextual attributes for this decision. */
    context?: Record<string, unknown>;
}

/** Resolved Context envelope returned by document audit operations. */
export type ContextDocumentAuditResult =
    ContextOperationResult<DocumentAuditReport>;

/** Resolved Context envelope returned by document access assessment. */
export type ContextDocumentAccessAssessmentResult =
    ContextOperationResult<DocumentAccessAssessment>;
