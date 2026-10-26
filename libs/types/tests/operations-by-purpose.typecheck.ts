import { expectTypeOf } from 'vitest';
import type {
    Assertion,
    ContextMetadata,
    ContextDefinition,
    CrosswalkCompletedTranslationResult,
    DocumentAuditReport,
    DocumentPartAssessment,
    ExplanationTrace,
    LocalSchemeEngineAdapter,
    MarkingValidation,
    MaybePromise,
    ProcessingContext,
    ProcessResult,
    RecognitionResult,
    RecognitionWithCorrections,
    RegistryProcessResult,
    RemoteContextSchemeEngineAdapter,
    RemoteSchemeEngineAdapter,
    ScanResult,
    SchemeEngineAdapter,
    SuggestResult,
    SuggestResultsByCategory,
    TestOperation,
    TestOperationResults,
    ValidateResult,
} from '../src';

/**
 * The marking operations are split by who is asking, and these pins are the
 * split.
 *
 * Validate is the reader's call and returns exactly what readers use. Process
 * is the author's call and returns that answer plus the authoring extras.
 * Suggest returns options and nothing about the marking. Explain returns the
 * trace that no other result carries. Every pin below is a compile-time claim;
 * every `@ts-expect-error` is its negative control, and it fails the build the
 * day the shape it rules out comes back.
 */

declare const base: SchemeEngineAdapter;
declare const local: LocalSchemeEngineAdapter;
declare const remote: RemoteSchemeEngineAdapter;
declare const remoteContext: RemoteContextSchemeEngineAdapter;
declare const facts: Assertion[];
declare const validated: ValidateResult;
declare const processed: ProcessResult;
declare const suggested: SuggestResult;

// ── The reader's result: these fields and nothing else. ─────────────────────
expectTypeOf<keyof ValidateResult>().toEqualTypeOf<
    | 'assertions'
    | 'valid'
    | 'inputWasValid'
    | 'errors'
    | 'warnings'
    | 'appliedFixes'
    | 'rendered'
    | 'assessment'
    | 'recognition'
    | 'notices'
    | 'displayColor'
>();
// Its recognition says how far it got, what it read the text as and in which
// role, and what it could not account for, and carries no correction edit
// script.
expectTypeOf<keyof RecognitionResult>().toEqualTypeOf<
    'status' | 'inputFormat' | 'role' | 'surface' | 'unmatched'
>();
expectTypeOf(validated.recognition).toEqualTypeOf<
    RecognitionResult | undefined
>();
// @ts-expect-error a reader's recognition has no corrections
void validated.recognition?.corrections;
// @ts-expect-error a reader's result has no fix paths
void validated.proposedFixes;
// @ts-expect-error a reader's result writes one rendering, not a view map
void validated.renders;
// @ts-expect-error the trace is explain's answer
void validated.explanation;

// ── The author's result: the reader's result plus exactly these. ───────────
expectTypeOf<ProcessResult>().toMatchTypeOf<ValidateResult>();
expectTypeOf<
    Exclude<keyof ProcessResult, keyof ValidateResult>
>().toEqualTypeOf<
    'assertionsBeforeRepair' | 'proposedFixes' | 'renders' | 'suggestionsFor'
>();
expectTypeOf(processed.recognition).toEqualTypeOf<
    RecognitionWithCorrections | undefined
>();
expectTypeOf<
    Exclude<keyof RecognitionWithCorrections, keyof RecognitionResult>
>().toEqualTypeOf<'corrections'>();
expectTypeOf(processed.suggestionsFor).toEqualTypeOf<
    SuggestResultsByCategory | undefined
>();
// The names 98 call sites read are kept.
expectTypeOf(processed.rendered).toBeString();
// @ts-expect-error the trace left the process result for explain
void processed.explanation;

// ── Suggest returns options only. ───────────────────────────────────────────
expectTypeOf<keyof SuggestResult>().toEqualTypeOf<'suggestions' | 'warnings'>();
// @ts-expect-error what the marking reads as is validate's and process's answer
void suggested.currentRendered;
// @ts-expect-error whether the marking stands is validate's and process's answer
void suggested.currentValid;
expectTypeOf<SuggestResultsByCategory>().toEqualTypeOf<
    Record<string, SuggestResult>
>();

// ── A scan region is read, not authored. ───────────────────────────────────
expectTypeOf<ScanResult['result']>().toEqualTypeOf<ValidateResult>();

// ── Validate takes text or facts, and nothing that changes the settling. ───
// `surface`, `context` and `parts` say what the marking is judged as; none of
// them changes how it is settled.
type ValidateOptions = {
    inputFormat?: string;
    outputFormat?: string;
    context?: ProcessingContext;
    surface?: string;
    parts?: string[];
    signal?: AbortSignal;
};
// The scheme-addressed overload carries the option bag third; the
// context-bound lane has no scheme selector and carries it second.
expectTypeOf<SchemeEngineAdapter['validate']>()
    .parameter(2)
    .toEqualTypeOf<ValidateOptions | undefined>();
expectTypeOf<LocalSchemeEngineAdapter['validate']>()
    .parameter(2)
    .toEqualTypeOf<ValidateOptions | undefined>();
expectTypeOf<RemoteSchemeEngineAdapter['validate']>()
    .parameter(2)
    .toEqualTypeOf<ValidateOptions | undefined>();
expectTypeOf<RemoteContextSchemeEngineAdapter['validate']>()
    .parameter(1)
    .toEqualTypeOf<ValidateOptions | undefined>();
expectTypeOf(base.validate(facts)).toEqualTypeOf<
    MaybePromise<ValidateResult>
>();
expectTypeOf(local.validate(facts)).toEqualTypeOf<ValidateResult>();
expectTypeOf(remoteContext.validate(facts)).toEqualTypeOf<
    Promise<ValidateResult>
>();
// No lane asks the engine to settle less: whether text was right as written is
// what `inputWasValid` and the applied changes answer.
// @ts-expect-error no stage bypass on validate
local.validate('X', { skipRepair: true });
// @ts-expect-error no stage bypass on validate
local.validate('X', { skipInference: true });
// @ts-expect-error no repair level on validate
base.validate('X', { normalization: 'strict' });
// @ts-expect-error no stage bypass on process
local.process('X', { skipRepair: true });
// @ts-expect-error no stage bypass on process
local.process('X', { skipInference: true });
// @ts-expect-error no stage bypass on the scheme-addressed overload either
local.process('X', 'scheme', { skipRepair: true });
// @ts-expect-error no repair level on process
base.process('X', { normalization: 'strict' });
// @ts-expect-error no repair level over the wire either
remoteContext.process('X', { normalization: 'strict' });
// @ts-expect-error no repair level on explain
base.explain('X', { normalization: 'strict' });
// @ts-expect-error validate takes text or facts, never both
base.validate('X', { assertions: facts });
// `parts` changes what the whole is judged against, so validate takes it too.
base.validate('X', { parts: ['P'] });
// Positive control: process takes what it does take.
base.process('X', { parts: ['P'], outputs: ['level/short'] });
// @ts-expect-error `tolerant` was never read by any engine and is gone
base.process('X', { tolerant: true });
// @ts-expect-error a process result keeps its `rendered`; no switch blanks it
local.process('X', { validateOnly: true });

// ── Process names its outputs and, on request, picker options. ─────────────
base.process('typed', {
    assertions: facts,
    outputs: ['level/short'],
    suggestFor: ['audience'],
});
expectTypeOf<RemoteContextSchemeEngineAdapter['process']>()
    .parameter(1)
    .exclude<undefined>()
    .toHaveProperty('outputs')
    .toEqualTypeOf<string[] | undefined>();
expectTypeOf<RemoteContextSchemeEngineAdapter['process']>()
    .parameter(1)
    .exclude<undefined>()
    .toHaveProperty('suggestFor')
    .toEqualTypeOf<string[] | undefined>();

// ── Explain takes what process takes, less what only adds to a result. ─────
expectTypeOf(base.explain('X')).toEqualTypeOf<MaybePromise<ExplanationTrace>>();
expectTypeOf(local.explain('X')).toEqualTypeOf<ExplanationTrace>();
expectTypeOf(remote.explain('X')).toEqualTypeOf<Promise<ExplanationTrace>>();
expectTypeOf(remoteContext.explain('X')).toEqualTypeOf<
    Promise<ExplanationTrace>
>();
type Bag<Fn> = Fn extends (
    input: string | Assertion[],
    options?: infer Options,
) => unknown
    ? Exclude<keyof NonNullable<Options>, 'signal'>
    : never;
expectTypeOf<Bag<RemoteContextSchemeEngineAdapter['explain']>>().toEqualTypeOf<
    Exclude<
        Bag<RemoteContextSchemeEngineAdapter['process']>,
        'outputs' | 'suggestFor'
    >
>();
// @ts-expect-error explain returns a trace, which has no views to name
base.explain('X', { outputs: ['level/short'] });

// ── Operations that cannot name outputs return the reader's result. ───────
// A process result from them would carry a `renders` that is always empty.
expectTypeOf(base.applyPreset('preset')).toEqualTypeOf<
    MaybePromise<ValidateResult>
>();
expectTypeOf<
    CrosswalkCompletedTranslationResult['source']
>().toEqualTypeOf<ValidateResult>();
expectTypeOf<
    CrosswalkCompletedTranslationResult['target']
>().toEqualTypeOf<ValidateResult>();
expectTypeOf<RegistryProcessResult['result']>().toEqualTypeOf<ValidateResult>();

// ── The document audit hands back every marking's facts and recognition. ───
// Whole and parts alike, on the per-marking answer both use.
expectTypeOf<MarkingValidation['assertions']>().toEqualTypeOf<Assertion[]>();
expectTypeOf<
    MarkingValidation['recognition']
>().toEqualTypeOf<RecognitionResult>();
expectTypeOf<MarkingValidation['inputWasValid']>().toBeBoolean();
expectTypeOf<
    DocumentPartAssessment['validation']
>().toEqualTypeOf<MarkingValidation>();
expectTypeOf<
    DocumentAuditReport['wholeValidation']
>().toEqualTypeOf<MarkingValidation | null>();
// @ts-expect-error the facts live on the validation, not beside it
void ({} as DocumentPartAssessment).assertions;

// ── The portable suite speaks the same operations. ─────────────────────────
expectTypeOf<
    Extract<TestOperation, 'validate' | 'explain' | 'suggestForCategories'>
>().toEqualTypeOf<'validate' | 'explain' | 'suggestForCategories'>();
expectTypeOf<
    TestOperationResults['validate']
>().toEqualTypeOf<ValidateResult>();
expectTypeOf<
    TestOperationResults['explain']
>().toEqualTypeOf<ExplanationTrace>();
expectTypeOf<
    TestOperationResults['suggestForCategories']
>().toEqualTypeOf<SuggestResultsByCategory>();
// Existing suites assert these on process cases; they stay where they were.
expectTypeOf<TestOperationResults['process']['rendered']>().toBeString();
expectTypeOf<TestOperationResults['process']['valid']>().toBeBoolean();
expectTypeOf<TestOperationResults['process']['inputWasValid']>().toBeBoolean();

// Context resolution carries the requested alias separately from concrete identity.
expectTypeOf<keyof ContextMetadata>().toEqualTypeOf<
    'id' | 'requestedVersion' | 'resolvedVersion' | 'description'
>();
expectTypeOf<ContextMetadata['requestedVersion']>().toEqualTypeOf<
    string | undefined
>();
expectTypeOf<ContextMetadata['resolvedVersion']>().toEqualTypeOf<
    string | undefined
>();
expectTypeOf<ContextDefinition['context']['version']>().toEqualTypeOf<string>();
