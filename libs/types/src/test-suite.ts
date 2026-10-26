import type {
    Assertion,
    ExplanationTrace,
    ProcessingContext,
    ProcessResult,
    AggregateResult,
    RenderResult,
    SuggestResult,
    SuggestResultsByCategory,
    ValidateResult,
} from './scheme.js';
import type { ScanOutcome } from './engine.js';
import type { EvaluationResult, GuideScanResult } from './guide.js';
import type { AccessDecision } from './access.js';
import type { ComponentRef } from './context.js';
import type { ContextBlock } from './context-definition.js';
import type { ArtifactReference, RuleReference } from './provenance.js';
import type {
    ContextResolution,
    ContextOperationResult,
    DocumentAuditReport,
    DocumentAccessAssessment,
    DocumentResponseProfile,
    GuideDeterminationInput,
} from './document.js';
import type {
    CrosswalkTranslationInput,
    CrosswalkTranslationResult,
} from './crosswalk.js';

/** Inert JSON data accepted by portable test inputs and expectations. */
export type TestValue =
    | null
    | boolean
    | number
    | string
    | TestValue[]
    | { [key: string]: TestValue };

/** Exact artifact composition; suite validation refuses mutable versions. */
export interface TestComposition {
    /**
     * The scheme the cases run against, at an exact version, with any layers.
     */
    scheme: ContextBlock['scheme'];
    /** The guides the cases run with, each at an exact version. */
    guides?: ContextBlock['guides'];
    /** The access policy the cases run with, at an exact version. */
    access?: ContextBlock['access'];
    /** The crosswalks the cases run with, each at an exact version. */
    crosswalks?: ContextBlock['crosswalks'];
}

/**
 * Canonical Context operations available to a portable test case.
 *
 * `valid` and `inputWasValid` mean the same under `validate` and `process`, so
 * a case that asserts them reads the same under either: no option changes how
 * a marking is settled (see `TestOptions`). `rendered` reads the same
 * under both too: a case that names no `outputFormat` gets the default for the
 * marking's role, by the one rule `RenderConfigDoc.surfaces` states. A process
 * case adds the authoring fields to assert on, and an `explain` case asserts
 * on the trace, which only explain returns.
 */
export type TestOperation =
    | 'process'
    | 'validate'
    | 'explain'
    | 'aggregate'
    | 'render'
    | 'suggest'
    | 'suggestForCategories'
    | 'schemeScan'
    | 'guideScan'
    | 'guideEvaluate'
    | 'checkAccess'
    | 'auditDocument'
    | 'assessDocumentAccess'
    | 'translate';

/** Native operation result shapes used to validate typed expectations. */
export interface TestOperationResults {
    /** The result of a `process` case. */
    process: ProcessResult;
    /** The result of a `validate` case. */
    validate: ValidateResult;
    /** The result of an `explain` case. */
    explain: ExplanationTrace;
    /** The result of an `aggregate` case. */
    aggregate: AggregateResult;
    /** The result of a `render` case. */
    render: RenderResult;
    /** The result of a `suggest` case. */
    suggest: SuggestResult;
    /** The result of a `suggestForCategories` case. */
    suggestForCategories: SuggestResultsByCategory;
    /**
     * The result of a `schemeScan` case: the markings found and how far the
     * scan got. A case passes only when the scan read the whole text, unless
     * one of its assertions is on `limits.status`, which is how a case says
     * it expects the scan to stop early.
     */
    schemeScan: ScanOutcome;
    /** The result of a `guideScan` case. */
    guideScan: GuideScanResult[];
    /** The result of a `guideEvaluate` case. */
    guideEvaluate: EvaluationResult;
    /** The result of a `checkAccess` case. */
    checkAccess: ContextOperationResult<AccessDecision>;
    /** The result of an `auditDocument` case. */
    auditDocument: ContextOperationResult<DocumentAuditReport>;
    /** The result of an `assessDocumentAccess` case. */
    assessDocumentAccess: ContextOperationResult<DocumentAccessAssessment>;
    /** The result of a `translate` case. */
    translate: ContextOperationResult<CrosswalkTranslationResult>;
}

/**
 * Typed, inert operation inputs; boundary validation enforces each operation's
 * key set.
 */
export interface TestInput {
    /** The marking text a single-marking operation reads. */
    marking?: string;
    /** The markings an `aggregate` case rolls up. */
    markings?: string[];
    /**
     * The facts an operation reads instead of marking text, or that `render`
     * and `suggestForCategories` start from.
     */
    assertions?: Assertion[];
    /** The text a scan or document operation reads. */
    text?: string;
    /**
     * The guide a `guideScan` or `guideEvaluate` case uses. A scan with none
     * covers every loaded guide.
     */
    guideId?: string;
    /** The guide rules a `guideEvaluate` case selects. */
    ruleIds?: string[];
    /** The categories a `suggestForCategories` case asks options for. */
    categoryIds?: string[];
    /** The user's attributes for a `checkAccess` case. */
    userAttributes?: { [key: string]: TestValue };
    /**
     * Request context values a `checkAccess` case passes to the access policy.
     */
    context?: { [key: string]: TestValue };
    /** Analyst decisions on guide nominations, for a document case. */
    guideDeterminations?: GuideDeterminationInput;
    /** How much a document case's result carries. */
    responseProfile?: DocumentResponseProfile;
    /** The translation request for a `translate` case. */
    translation?: CrosswalkTranslationInput;
}

/**
 * One expected result at an exact JSON path. Array indices are decimal path
 * segments. Equality compares the complete value; contains and excludes check
 * string substrings, object fields, or an array item matching the expected
 * value's fields.
 * Exists and absent test presence, including values that are false or null,
 * and omit value.
 */
export type TestAssertion =
    | {
          /** The JSON path to the value, one segment per key or array index. */
          path: string[];
          /** How the value at `path` is compared with `value`. */
          matcher: 'equals' | 'notEquals' | 'contains' | 'excludes';
          /** The expected value. */
          value: TestValue;
      }
    | {
          /** The JSON path to the value, one segment per key or array index. */
          path: string[];
          /** Whether the value at `path` must be present or absent. */
          matcher: 'exists' | 'absent';
          value?: never;
      };

/**
 * Exact observed member identity; requirements never infer coverage from
 * display text.
 */
export interface TestCoverageRequirement {
    /** Whether the member is a concept or a rule. */
    kind: 'concept' | 'rule';
    /** The artifact the member belongs to. */
    artifact: ArtifactReference;
    /** The concept or rule id within that artifact. */
    memberId: string;
}

/**
 * Inert native operation options; executable callbacks and adapters cannot
 * enter a suite.
 *
 * None of them changes how a marking is settled, so there is no option to
 * settle less than the engine does. Whether text was right as written is what
 * `inputWasValid` and `appliedFixes` answer, and reading is tolerant on
 * purpose.
 */
export interface TestOptions {
    /**
     * The format the input is written in. Omitted, recognition works it out.
     */
    inputFormat?: string;
    /** The format the result is written in. */
    outputFormat?: string;
    /** The role the input is read in and the whole it belongs to. */
    context?: ProcessingContext;
    /**
     * The validation surface the input is, by scheme scope id. Omitted, the
     * input is a whole marking.
     */
    surface?: string;
    /**
     * Part markings the whole must cover, for a validate, process or explain
     * case. The whole is judged as covering them.
     */
    parts?: string[];
    /**
     * What a `render` case asks for: `projection`, the ordinary human
     * projection, or `full`, which fails rather than leave any part of the
     * state unwritten.
     */
    preservation?: 'projection' | 'full';
    /** The text a `suggest` case filters concepts by. */
    filter?: string;
    /**
     * Whether a `suggest` case also lists concepts the filter matches but the
     * scheme's rules currently gate.
     */
    includeGated?: boolean;
    /** Whether a `guideScan` case adds advisory confidence to each span. */
    confidence?: boolean;
    /** The outputs a process case writes into `renders`, by output address. */
    outputs?: string[];
    /** The categories a process case asks picker options for. */
    suggestFor?: string[];
}

/** One portable input and its separately authored oracle. */
export interface TestCase {
    /** Case id, unique across the suite and its parents. */
    id: string;
    /** Short human-readable case name. */
    name?: string;
    /** What the case checks and why. */
    description?: string;
    /** The Context operation the case runs. */
    operation: TestOperation;
    /** The operation's input. */
    input: TestInput;
    /** Operation-native options, with unknown keys refused by the runner. */
    options?: TestOptions;
    /**
     * Every assertion must match for the case to pass.
     * @minItems 1
     */
    assertions: TestAssertion[];
}

/**
 * Immutable versioned suite, with complete expectation overrides of inherited
 * cases.
 */
export interface TestSuite {
    /** The suite format version. */
    apiVersion: 'schemes.ezclassify.com/v1';
    /** Unique suite identifier. */
    id: string;
    /** Exact semantic version of this suite. */
    version: string;
    /** Human-readable suite name. */
    name?: string;
    /** What the suite covers. */
    description?: string;
    /**
     * The parent suite whose cases this suite inherits, at an exact version.
     */
    extends?: ComponentRef;
    /** Omission inherits the parent; presence replaces the entire composition. */
    composition?: TestComposition;
    /** Replacement assertions for inherited cases, keyed by case id. */
    overrides?: {
        [caseId: string]: {
            /** Why the inherited expectation is replaced. */
            reason: string;
            /**
             * Replace the inherited case's complete assertion list.
             * @minItems 1
             */
            assertions: TestAssertion[];
        };
    };
    /**
     * The cases this suite adds. Each id must be new to the inheritance chain.
     */
    cases: TestCase[];
}

/** Case origin and the exact child that supplied its effective expectation. */
export interface EffectiveTestCase {
    /** The case as it runs, with any override's assertions in place. */
    test: TestCase;
    /** The suite that declares the case. */
    owner: ComponentRef;
    /** The override that replaced the case's assertions, when one did. */
    override?: {
        /** The suite that declares the override. */
        owner: ComponentRef;
        /** Why the inherited expectation is replaced. */
        reason: string;
    };
}

/** Resolved parent chain; no parent coverage or execution results are inherited. */
export interface EffectiveTestSuite {
    /** The suite that was resolved. */
    suite: ComponentRef;
    /** Exact selected suite document content, including its authored metadata. */
    suiteDigest: string;
    /**
     * The composition the cases run against: the nearest suite in the chain
     * that declares one.
     */
    composition: TestComposition;
    /** The parent chain, root first, each with its content digest. */
    ancestors: Array<{
        /** The parent suite, at an exact version. */
        ref: ComponentRef;
        /** Content digest of that parent suite document. */
        digest: string;
    }>;
    /** Every effective case, parents' first, in declaration order. */
    cases: EffectiveTestCase[];
    /** Content digest of this resolved suite, checked again before it runs. */
    digest: string;
}

/**
 * Actual engine evidence. Skipped rules are retained but never count as
 * exercised.
 */
export interface TestCoverageObservation extends TestCoverageRequirement {
    /**
     * What the run observed: `used` for a concept, `evaluated` or `matched` for
     * a rule, or `skipped` for a rule that did not apply.
     */
    state: 'used' | 'evaluated' | 'matched' | 'skipped';
    /** The qualified rule reference, for a rule member. */
    rule?: RuleReference;
}

/**
 * Completeness belongs to an operation and family; unobserved partial coverage
 * is unknown.
 */
export interface TestCoverage {
    /** Coverage completeness per artifact family. */
    families: {
        /**
         * `complete` when the observations list every scheme member the
         * operation touched, `incomplete` when they may be partial, and
         * `unavailable` when the operation reports no scheme coverage.
         */
        scheme: 'complete' | 'incomplete' | 'unavailable';
        /**
         * `complete` when the observations list every guide member the
         * operation touched, `incomplete` when they may be partial, and
         * `unavailable` when the operation reports no guide coverage.
         */
        guide: 'complete' | 'incomplete' | 'unavailable';
        /**
         * `complete` when the observations list every access member the
         * operation touched, `incomplete` when they may be partial, and
         * `unavailable` when the operation reports no access coverage.
         */
        access: 'complete' | 'incomplete' | 'unavailable';
    };
    /** Every member the operation was observed to touch. */
    observations: TestCoverageObservation[];
}

/** Compact case evidence referring to the run's exact native observation dictionary. */
export interface TestCoverageReference {
    /** Coverage completeness per artifact family. */
    families: TestCoverage['families'];
    /** Zero-based indices into TestSuiteRun.coverageObservations. */
    observationIndices: number[];
}

/** One failed oracle, preserving both expected and observed values. */
export interface TestMismatch {
    /**
     * Which assertion failed, as `assertions.` followed by its index, or
     * `limits.status` for a `schemeScan` case whose scan stopped before the
     * end of the text when none of its assertions is on `limits.status`.
     */
    path: string;
    /** The value the assertion expected. */
    expected: TestValue;
    /** The value found at the assertion's path. */
    actual: TestValue;
}

/** Immutable execution of one effective case against one pinned composition. */
export interface TestCaseRun {
    /** The id of the case. */
    caseId: string;
    /** The operation the case ran. */
    operation: TestOperation;
    /**
     * `passed`, `failed` when an assertion did not match, `error` when the
     * operation could not run, or `not-evaluated` when the run stopped first.
     */
    status: 'passed' | 'failed' | 'error' | 'not-evaluated';
    /** The operation's result. Absent when the case did not produce one. */
    actual?: TestValue;
    /** What the case was observed to cover. */
    coverage: TestCoverageReference;
    /** Each assertion that did not match. Empty when the case passed. */
    mismatches: TestMismatch[];
    /**
     * Why the case did not run to a result. Set for `error` and
     * `not-evaluated`.
     */
    error?: string;
    /** How long the case took, in milliseconds. */
    durationMs: number;
}

/**
 * Portable report; filtered runs retain their denominator and cannot claim
 * completeness.
 */
export interface TestSuiteRun {
    /** The report format version. */
    reportVersion: 3;
    /** Exact native evidence shared across cases without repeating artifact identities. */
    coverageObservations: TestCoverageObservation[];
    /** The resolved suite the run executed. */
    suite: EffectiveTestSuite;
    /** The version of the engine that ran the cases. */
    engineVersion: string;
    /**
     * Execution configuration identity, never a credential or exported network
     * URL.
     */
    target: string;
    /** The exact artifacts and sources the run resolved. */
    resolution: ContextResolution;
    /**
     * Suite, effective cases, exact resolution, target, and engine content
     * identity.
     */
    executionDigest: string;
    /**
     * Missing artifact digests or mutable sources prevent byte-for-byte replay
     * claims.
     */
    reproducibility: 'reproducible' | 'best-effort';
    /** When the run started, as an ISO 8601 timestamp. */
    startedAt: string;
    /** When the run finished, as an ISO 8601 timestamp. */
    finishedAt: string;
    /** How many cases the run selected. @asType integer */
    selected: number;
    /** How many cases the suite holds. @asType integer */
    total: number;
    /**
     * True when every case in the suite ran. A filtered run is never complete.
     */
    complete: boolean;
    /** Case counts by status. */
    totals: {
        /** Cases that passed. @asType integer */
        passed: number;
        /** Cases with at least one mismatch. @asType integer */
        failed: number;
        /** Cases whose operation could not run. @asType integer */
        errored: number;
        /** Cases the run stopped before evaluating. @asType integer */
        notEvaluated: number;
    };
    /** One entry per selected case, in suite order. */
    cases: TestCaseRun[];
}
