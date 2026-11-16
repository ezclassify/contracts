import { expectTypeOf } from 'vitest';
import type {
    AccessComparisonResult,
    AccessDecision,
    AccessOperand,
    AccessOperandSource,
    AccessRequirementsDescription,
    AccessRequirementsInput,
    AccessRuleActivation,
    AccessRuleDescription,
    AccessRuleResult,
    ArtifactReference,
    Assertion,
    AssertionReference,
    AssertionSupport,
    AssessmentLimitation,
    Change,
    ConceptModernization,
    ContentEvidenceSpan,
    ContextOperationResult,
    ContextResolution,
    CoverageReport,
    DecisionProposalOrigin,
    DocumentAssessmentInput,
    DocumentAuditReport,
    DocumentGuideAssessment,
    DocumentInputErrorDetail,
    DocumentResponseCounts,
    DocumentResponseProfile,
    DocumentResponseProjection,
    DocumentUnmarkedSpan,
    EvaluationResult,
    Fix,
    GuideBreakdownEntry,
    GuideCompilationStatus,
    GuideCompiledDetail,
    GuideCompiledResult,
    GuideContentEvaluation,
    GuideContentExclusion,
    GuideDeterminationInput,
    GuideEvaluationUnitInput,
    GuideFactReference,
    GuideFindingDetermination,
    GuideNomination,
    GuideRuleOutcome,
    GuideScopeCoverage,
    GuideUnitEvaluation,
    ManualGuideSelection,
    ManualGuideSelectionInput,
    MarkingValidation,
    RecognitionResult,
    RuleReference,
    ValidateResult,
    ValidationError,
    Vocabulary,
    Warning,
} from '../src/index';

expectTypeOf<ArtifactReference>().toEqualTypeOf<{
    kind: 'scheme' | 'layer' | 'guide' | 'access' | 'crosswalk' | 'context';
    id: string;
    version: string;
    digest?: string;
}>();
expectTypeOf<RuleReference>().toEqualTypeOf<{
    artifact: ArtifactReference;
    ruleId: string;
    ruleDigest: string;
}>();
expectTypeOf<AssertionReference>().toEqualTypeOf<{
    categoryId: string;
    conceptId: string;
    value?: string;
}>();
expectTypeOf<ContentEvidenceSpan>().toEqualTypeOf<{
    start: number;
    end: number;
    offsetEncoding: 'utf-8-bytes';
    rule: RuleReference;
    matched?: string;
}>();
expectTypeOf<GuideFactReference>().toEqualTypeOf<{
    kind: 'accepted-finding' | 'manual-selection' | 'projected-finding';
    factId: string;
}>();
expectTypeOf<AssertionSupport>().toEqualTypeOf<{
    supportId: string;
    assertion: AssertionReference;
    rules: RuleReference[];
    evidence: ContentEvidenceSpan[];
    factReferences: GuideFactReference[];
}>();

expectTypeOf<AssessmentLimitation>().toEqualTypeOf<{
    code: string;
    scope?: string;
    reason: string;
}>();
expectTypeOf<DocumentInputErrorDetail>().toEqualTypeOf<
    | 'empty-document'
    | 'invalid-unicode'
    | 'conflicting-guide-determination'
    | 'conflicting-manual-selection'
    | 'manual-selection-duplicates-finding'
    | 'stale-guide-determination'
    | 'stale-manual-selection'
>();
expectTypeOf<DocumentResponseProfile>().toEqualTypeOf<
    'summary' | 'standard' | 'full'
>();
expectTypeOf<DocumentResponseCounts>().toEqualTypeOf<{
    nominations: number;
    evidenceSpans: number;
    guideUnits: number;
}>();
expectTypeOf<DocumentResponseProjection>().toEqualTypeOf<{
    profile: DocumentResponseProfile;
    detailsComplete: boolean;
    omittedFields: string[];
    counts: DocumentResponseCounts;
}>();
expectTypeOf<ContextResolution>().toEqualTypeOf<{
    contextId: string;
    requestedVersion?: string;
    resolvedVersion: string;
    artifacts: ArtifactReference[];
}>();
expectTypeOf<ContextOperationResult<string>>().toEqualTypeOf<{
    resolution: ContextResolution;
    result: string;
    responseProjection?: DocumentResponseProjection;
}>();

expectTypeOf<DecisionProposalOrigin>().toEqualTypeOf<
    'analyst-authored' | 'agent-drafted' | 'host-imported'
>();
expectTypeOf<GuideFindingDetermination>().toEqualTypeOf<{
    findingId: string;
    documentDigest: string;
    decision: 'accepted' | 'rejected';
    reason: string;
    proposalOrigin?: DecisionProposalOrigin;
}>();
expectTypeOf<ManualGuideSelectionInput>().toEqualTypeOf<{
    documentDigest: string;
    rule: RuleReference;
    evidence: ContentEvidenceSpan[];
    reason: string;
    proposalOrigin?: DecisionProposalOrigin;
}>();
expectTypeOf<ManualGuideSelection>().toEqualTypeOf<{
    selectionId: string;
    documentDigest: string;
    rule: RuleReference;
    evidence: ContentEvidenceSpan[];
    reason: string;
    proposalOrigin?: DecisionProposalOrigin;
}>();
expectTypeOf<GuideDeterminationInput>().toEqualTypeOf<{
    findings: GuideFindingDetermination[];
    manualSelections: ManualGuideSelectionInput[];
}>();
expectTypeOf<GuideNomination>().toEqualTypeOf<{
    findingId: string;
    documentDigest: string;
    origin: 'lexical';
    rule: RuleReference;
    evidence: ContentEvidenceSpan[];
    proposedAssertions: AssertionReference[];
    rationale?: string;
}>();
expectTypeOf<GuideCompiledDetail>().toEqualTypeOf<{
    evaluation: EvaluationResult;
    process: ValidateResult;
}>();
expectTypeOf<GuideBreakdownEntry>().toEqualTypeOf<{
    rule: RuleReference;
    outcome: GuideRuleOutcome;
    isComputed: boolean;
    wasOverridden: boolean;
    overriddenBy?: RuleReference;
}>();
expectTypeOf<GuideCompiledResult>().toEqualTypeOf<{
    assertions: Assertion[];
    rendered: string;
    valid: boolean;
    errors: ValidationError[];
    warnings: Warning[];
    directRules: RuleReference[];
    computedRules: RuleReference[];
    overriddenRules: RuleReference[];
    supportIds: string[];
    detail?: GuideCompiledDetail;
}>();
expectTypeOf<GuideEvaluationUnitInput>().toEqualTypeOf<{
    scopeId: string;
    start: number;
    end: number;
    offsetEncoding: 'utf-8-bytes';
}>();
expectTypeOf<GuideContentExclusion>().toEqualTypeOf<{
    start: number;
    end: number;
    offsetEncoding: 'utf-8-bytes';
}>();
expectTypeOf<GuideUnitEvaluation>().toEqualTypeOf<{
    scopeId: string;
    start: number;
    end: number;
    offsetEncoding: 'utf-8-bytes';
    findingIds: string[];
    determined: GuideCompiledResult | null;
    projected: GuideCompiledResult | null;
}>();
expectTypeOf<GuideContentEvaluation>().toEqualTypeOf<{
    documentDigest: string;
    nominations: GuideNomination[];
    determinations: GuideFindingDetermination[];
    manualSelections: ManualGuideSelection[];
    unresolvedFindingIds: string[];
    acceptedFindingIds: string[];
    rejectedFindingIds: string[];
    supportCatalog: AssertionSupport[];
    units: GuideUnitEvaluation[];
    limitations: AssessmentLimitation[];
}>();
expectTypeOf<GuideCompilationStatus>().toEqualTypeOf<
    | 'not-evaluated'
    | 'no-findings'
    | 'pending-determination'
    | 'determined-sufficient'
    | 'determined-insufficient'
>();
expectTypeOf<GuideScopeCoverage>().toEqualTypeOf<{
    scopeId: string;
    determinedCoverage: CoverageReport | null;
    projectedCoverage: CoverageReport | null;
}>();
expectTypeOf<DocumentGuideAssessment>().toEqualTypeOf<{
    status: GuideCompilationStatus;
    nominationCount: number;
    unresolvedCount: number;
    acceptedCount: number;
    rejectedCount: number;
    evidenceSpanCount: number;
    evaluation?: GuideContentEvaluation;
    unitCoverage: GuideScopeCoverage[];
    determinedRequiredWhole: GuideCompiledResult | null;
    projectedRequiredWhole: GuideCompiledResult | null;
    determinedWholeCoverage: CoverageReport | null;
    projectedWholeCoverage: CoverageReport | null;
}>();

expectTypeOf<AccessOperandSource>().toEqualTypeOf<
    'subject' | 'context' | 'assertion' | 'literal'
>();
expectTypeOf<AccessOperand>().toEqualTypeOf<{
    source: AccessOperandSource;
    path?: string;
    categoryId?: string;
    assertions?: AssertionReference[];
    value?: unknown;
}>();
expectTypeOf<AccessRuleActivation>().toEqualTypeOf<{
    matched: boolean;
    assertions: AssertionReference[];
    contextPaths: string[];
}>();
expectTypeOf<AccessComparisonResult>().toEqualTypeOf<{
    left: AccessOperand;
    operator: string;
    right: AccessOperand;
    matched: boolean;
    missing?: unknown[];
}>();
expectTypeOf<AccessRuleResult>().toEqualTypeOf<{
    ruleIndex: number;
    name: string;
    granted: boolean;
    skipped: boolean;
    reason?: string;
    activation: AccessRuleActivation;
    comparisons: AccessComparisonResult[];
    rule: RuleReference;
    modernizedFrom?: ConceptModernization[];
}>();
expectTypeOf<AccessDecision>().toEqualTypeOf<{
    granted: boolean;
    rules: AccessRuleResult[];
    warnings: Warning[];
}>();
expectTypeOf<AccessRequirementsInput>().toEqualTypeOf<{
    marking?: string;
    assertions?: Assertion[];
}>();
expectTypeOf<AccessRuleDescription>().toEqualTypeOf<{
    rule: RuleReference;
    access: ArtifactReference;
    scheme: ArtifactReference;
    name: string;
    description?: string;
    requirementText: string;
    whenText?: string;
    attributesNeeded: string[];
    dependsOn: RuleReference[];
    overrides: RuleReference[];
}>();
expectTypeOf<AccessRequirementsDescription>().toEqualTypeOf<{
    marking?: string;
    assertions: Assertion[];
    assertionDisplays: string[];
    access: ArtifactReference;
    scheme: ArtifactReference;
    appliedRules: RuleReference[];
    rules: AccessRuleDescription[];
    combinedRequirementText: string;
    combinedAttributesNeeded: string[];
}>();

// One meaning of `valid` and `inputWasValid` at every door, the audit
// included: an audit's strict "right as written" verdict is `inputWasValid`.
// Every audited marking, whole or part, carries its facts and its recognition,
// so no caller reads a marking again after an audit.
expectTypeOf<MarkingValidation>().toEqualTypeOf<{
    assertions: Assertion[];
    recognition: RecognitionResult;
    valid: boolean;
    inputWasValid: boolean;
    errors: ValidationError[];
    proposedFixes: Fix[];
    appliedFixes: Change[];
    rendered: string;
}>();
expectTypeOf<DocumentUnmarkedSpan>().toEqualTypeOf<{
    start: number;
    end: number;
    offsetEncoding: 'utf-8-bytes';
    text?: string;
}>();
expectTypeOf<DocumentAuditReport>().toEqualTypeOf<{
    markingRequirements: { whole: boolean; part: boolean };
    whole: string | null;
    wholes: Array<{
        marking: string;
        start: number;
        end: number;
        offsetEncoding: 'utf-8-bytes';
    }>;
    wholeValidation: MarkingValidation | null;
    parts: Array<{
        marking: string;
        text?: string;
        start: number;
        end: number;
        offsetEncoding: 'utf-8-bytes';
        scopeId: string;
        validation: MarkingValidation;
    }>;
    wholeCoversParts: CoverageReport | null;
    unmarkedSpans: DocumentUnmarkedSpan[];
    proceduralFlags: string[];
    overallVerdict: 'pass' | 'inadequate-coverage' | 'procedural-gap' | 'mixed';
    vocabulary: Vocabulary | null;
    documentDigest: string;
    guideAssessment: DocumentGuideAssessment | null;
    limitations: AssessmentLimitation[];
}>();
expectTypeOf<DocumentAssessmentInput>().toEqualTypeOf<{
    text: string;
    guideDeterminations?: GuideDeterminationInput;
    responseProfile?: DocumentResponseProfile;
}>();

const artifact: ArtifactReference = {
    kind: 'guide',
    id: 'guide',
    version: '1.0.0',
};
const rule: RuleReference = {
    artifact,
    ruleId: 'rule',
    ruleDigest: 'sha256:rule',
};
const span: ContentEvidenceSpan = {
    start: 0,
    end: 1,
    offsetEncoding: 'utf-8-bytes',
    rule,
};
const manual: ManualGuideSelectionInput = {
    documentDigest: 'sha256:document',
    rule,
    evidence: [span],
    reason: 'Analyst reason',
};
const projection: DocumentResponseProjection = {
    profile: 'standard',
    detailsComplete: false,
    omittedFields: ['/matched'],
    counts: {
        nominations: 1,
        evidenceSpans: 1,
        guideUnits: 1,
    },
};
void manual;
void projection;

// @ts-expect-error Qualified rules require a semantic digest.
const ruleWithoutDigest: RuleReference = { artifact, ruleId: 'rule' };
const invalidOffset: ContentEvidenceSpan = {
    start: 0,
    end: 1,
    // @ts-expect-error Evidence offsets use the frozen UTF-8 byte encoding.
    offsetEncoding: 'utf-16',
    rule,
};
// @ts-expect-error Manual selections require an analyst reason.
const manualWithoutReason: ManualGuideSelectionInput = {
    documentDigest: 'sha256:document',
    rule,
    evidence: [span],
};
// @ts-expect-error Response profiles are closed.
const invalidProfile: DocumentResponseProfile = 'compact';
const incompleteProjection: DocumentResponseProjection = {
    profile: 'summary',
    detailsComplete: false,
    omittedFields: [],
    // @ts-expect-error Projection counts describe every normative dimension.
    counts: { nominations: 0 },
};

void ruleWithoutDigest;
void invalidOffset;
void manualWithoutReason;
void invalidProfile;
void incompleteProjection;
