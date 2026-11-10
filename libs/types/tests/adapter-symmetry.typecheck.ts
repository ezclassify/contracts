import { expectTypeOf } from 'vitest';
import type {
    AccessDecision,
    AccessEngineAdapter,
    AccessRuleDescription,
    AggregateResult,
    Assertion,
    ContextAdapter,
    ContextCompositionPresence,
    ContextCrosswalkDescriptor,
    ConceptView,
    ContextOperationResult,
    ContextSchemeEngineAdapter,
    CrosswalkTranslationResult,
    DiffResult,
    DocumentAuditReport,
    EvaluationResult,
    FilterResult,
    GuideEngineAdapter,
    LocalAccessEngineAdapter,
    LocalContextAdapter,
    LocalContextSchemeEngineAdapter,
    LocalContextGuideEngineAdapter,
    LocalGuideEngineAdapter,
    LocalSchemeEngineAdapter,
    MaybePromise,
    ProcessingContext,
    ProcessResult,
    RemoteAccessEngineAdapter,
    RemoteContextAdapter,
    RemoteContextSchemeEngineAdapter,
    RemoteGuideEngineAdapter,
    RemoteSchemeEngineAdapter,
    RenderOptions,
    RenderResult,
    RuleDescription,
    SchemeEngineAdapter,
    SchemeGrammar,
    SchemeStructuralView,
    SuggestResult,
    ValidateResult,
} from '../src';

/**
 * The both-modes rule, asserted rather than promised.
 *
 * A UI is handed one of these interfaces and never learns whether an engine is
 * running in its own process or behind HTTP. That only holds if three things
 * are true, and each of them is a compile-time claim this file makes: every
 * operation lives on the base contract, the `Local` and `Remote` narrowings
 * differ from it only in sync versus Promise, and the members that could never
 * work in both modes are not on a base contract at all.
 */

declare const base: SchemeEngineAdapter;
declare const local: LocalSchemeEngineAdapter;
declare const remote: RemoteSchemeEngineAdapter;
declare const abort: AbortSignal;
declare const assertions: Assertion[];

// Promoted to the base contract: the wire serves all of them, so a UI can call
// them without knowing which engine it holds.
expectTypeOf(base.validate('X')).toEqualTypeOf<MaybePromise<ValidateResult>>();
expectTypeOf(base.normalize('X')).toEqualTypeOf<MaybePromise<string>>();
expectTypeOf(base.diff('A', 'B')).toEqualTypeOf<MaybePromise<DiffResult>>();
expectTypeOf(base.filterConcepts('q')).toEqualTypeOf<
    MaybePromise<FilterResult>
>();
expectTypeOf(base.buildSchemeView()).toEqualTypeOf<
    MaybePromise<SchemeStructuralView>
>();
expectTypeOf(base.listCategoriesFlat()).toEqualTypeOf<
    MaybePromise<Array<{ id: string; label: string }>>
>();
expectTypeOf(base.suggestForCategories(assertions, ['cat'])).toEqualTypeOf<
    MaybePromise<Record<string, SuggestResult>>
>();

// The narrowings say sync or Promise and nothing else.
expectTypeOf(local.validate('X')).toEqualTypeOf<ValidateResult>();
expectTypeOf(remote.validate('X')).toEqualTypeOf<Promise<ValidateResult>>();
expectTypeOf(local.diff('A', 'B')).toEqualTypeOf<DiffResult>();
expectTypeOf(remote.diff('A', 'B')).toEqualTypeOf<Promise<DiffResult>>();
expectTypeOf(local.suggestForCategories(assertions, ['cat'])).toEqualTypeOf<
    Record<string, SuggestResult>
>();
expectTypeOf(remote.suggestForCategories(assertions, ['cat'])).toEqualTypeOf<
    Promise<Record<string, SuggestResult>>
>();
expectTypeOf(remote.aggregateAssertions([assertions])).toEqualTypeOf<
    Promise<AggregateResult>
>();
expectTypeOf<RemoteSchemeEngineAdapter['render']>()
    .parameter(3)
    .toEqualTypeOf<RenderOptions | undefined>();
expectTypeOf(
    remote.render(assertions, 'banner', 'demo', {
        preservation: 'full',
        signal: abort,
    }),
).toEqualTypeOf<Promise<RenderResult>>();

// Access and guide operations left the scheme contract: they are another
// family's material, and the composed path is ContextAdapter.
expectTypeOf<SchemeEngineAdapter>().not.toHaveProperty('checkAccess');
expectTypeOf<SchemeEngineAdapter>().not.toHaveProperty('evaluateGuide');
expectTypeOf<SchemeEngineAdapter>().not.toHaveProperty('evaluateGuides');
expectTypeOf<RemoteSchemeEngineAdapter>().not.toHaveProperty('checkAccess');

// No lane asks the engine to settle less. Whether text was right as written
// is what `inputWasValid` and the applied changes answer, and reading is
// tolerant on purpose, so a repair level or a stage to skip has no place on the
// local lane or the wire. The exact option bags below are what keeps them from
// creeping back onto any lane, and the OpenAPI package pins those bags to the
// wire request body.
expectTypeOf<
    NonNullable<Parameters<LocalSchemeEngineAdapter['process']>[1]>
>().not.toHaveProperty('skipRepair');
expectTypeOf<
    NonNullable<Parameters<LocalSchemeEngineAdapter['process']>[1]>
>().not.toHaveProperty('skipInference');
expectTypeOf<
    NonNullable<Parameters<LocalSchemeEngineAdapter['process']>[1]>
>().not.toHaveProperty('normalization');
// Neither a no-op flag nor a switch that blanks `rendered` belongs on the
// author's call: `tolerant` was never read, and `validateOnly` made a process
// result whose `rendered` broke its own definition.
expectTypeOf<
    NonNullable<Parameters<LocalSchemeEngineAdapter['process']>[1]>
>().not.toHaveProperty('validateOnly');
expectTypeOf<
    NonNullable<Parameters<LocalSchemeEngineAdapter['process']>[1]>
>().not.toHaveProperty('tolerant');
expectTypeOf<RemoteSchemeEngineAdapter['process']>().parameter(2).toEqualTypeOf<
    | {
          inputFormat?: string;
          outputFormat?: string;
          assertions?: Assertion[];
          context?: ProcessingContext;
          surface?: string;
          parts?: string[];
          outputs?: string[];
          suggestFor?: string[];
          signal?: AbortSignal;
      }
    | undefined
>();
expectTypeOf<SchemeEngineAdapter['process']>().parameter(2).toEqualTypeOf<
    | {
          inputFormat?: string;
          outputFormat?: string;
          assertions?: Assertion[];
          context?: ProcessingContext;
          surface?: string;
          parts?: string[];
          outputs?: string[];
          suggestFor?: string[];
          signal?: AbortSignal;
      }
    | undefined
>();

// Construction is not an operation: ids only, and the default slot is
// read-only on every adapter.
expectTypeOf<SchemeEngineAdapter['loadScheme']>().parameter(0).toBeString();
expectTypeOf<SchemeEngineAdapter['loadLayer']>().parameter(0).toBeString();
expectTypeOf<LocalSchemeEngineAdapter>().not.toHaveProperty('setDefaultScheme');

/**
 * A UI-shaped caller. It compiles only while every operation it uses is on the
 * base contract and accepts a cancellation signal, which is the whole claim.
 */
async function pickAMarking(engine: SchemeEngineAdapter): Promise<string> {
    await engine.loadScheme('demo');
    await engine.loadLayer('demo-layer');

    await engine.suggest('', {
        filter: 'sec',
        includeGated: true,
        signal: abort,
    });

    const processed = await engine.process('SECRET', { signal: abort });
    const facets = await engine.suggestForCategories(
        processed.assertions,
        ['classification'],
        { signal: abort },
    );
    void facets;

    await engine.validate('SECRET', { signal: abort });
    await engine.aggregate(['SECRET', 'OFFICIAL'], { signal: abort });
    await engine.aggregateAssertions([processed.assertions], { signal: abort });
    await engine.checkCoverage(['OFFICIAL'], 'SECRET', { signal: abort });
    await engine.render(processed.assertions, 'banner', undefined, {
        preservation: 'full',
        signal: abort,
    });
    await engine.scan('body text', { signal: abort });
    await engine.diff('SECRET', 'OFFICIAL', { signal: abort });
    await engine.filterConcepts('sec');
    await engine.buildSchemeView();
    await engine.listCategoriesFlat();

    return engine.normalize('SECRET', { signal: abort });
}
void pickAMarking;

declare const guide: GuideEngineAdapter;
declare const localGuide: LocalGuideEngineAdapter;
declare const remoteGuide: RemoteGuideEngineAdapter;

expectTypeOf(guide.evaluate('guide', ['rule'])).toEqualTypeOf<
    MaybePromise<EvaluationResult>
>();
expectTypeOf(
    guide.evaluateMany([{ guideId: 'guide', ruleId: 'rule' }]),
).toEqualTypeOf<MaybePromise<EvaluationResult>>();
expectTypeOf(guide.describeRule('rule')).toEqualTypeOf<
    MaybePromise<RuleDescription>
>();
expectTypeOf(guide.filterRules('q')).toEqualTypeOf<
    MaybePromise<FilterResult>
>();
expectTypeOf(
    localGuide.evaluate('guide', ['rule']),
).toEqualTypeOf<EvaluationResult>();
expectTypeOf(remoteGuide.evaluate('guide', ['rule'])).toEqualTypeOf<
    Promise<EvaluationResult>
>();
expectTypeOf(
    localGuide.evaluateMany([{ guideId: 'guide', ruleId: 'rule' }]),
).toEqualTypeOf<EvaluationResult>();
expectTypeOf(
    remoteGuide.evaluateMany([{ guideId: 'guide', ruleId: 'rule' }]),
).toEqualTypeOf<Promise<EvaluationResult>>();
// A selection that spans guides names each rule's guide: two guides may use the
// same rule id.
// @ts-expect-error A bare rule id does not say which guide it means.
void remoteGuide.evaluateMany(['rule']);

// The processor-taking members are in-process wiring, not operations, so they
// sit on the local narrowing only.
expectTypeOf<GuideEngineAdapter>().toHaveProperty('evaluateMany');
expectTypeOf<GuideEngineAdapter>().not.toHaveProperty('evaluateText');
expectTypeOf<LocalGuideEngineAdapter>().toHaveProperty('evaluateMany');
expectTypeOf<LocalGuideEngineAdapter>().toHaveProperty('evaluateText');

// Guide-document consistency is a question about an authored document, and
// only an engine holding that document can answer it. No wire operation can,
// so it is not on the base contract and the remote narrowing does not claim
// it.
expectTypeOf<GuideEngineAdapter>().not.toHaveProperty('validate');
expectTypeOf<RemoteGuideEngineAdapter>().not.toHaveProperty('validate');
expectTypeOf<LocalGuideEngineAdapter>().toHaveProperty('validate');

declare const access: AccessEngineAdapter;
declare const localAccess: LocalAccessEngineAdapter;
declare const remoteAccess: RemoteAccessEngineAdapter;

expectTypeOf(access.check(assertions, {})).toEqualTypeOf<
    MaybePromise<AccessDecision>
>();
expectTypeOf(access.describeAllAccessRules()).toEqualTypeOf<
    MaybePromise<AccessRuleDescription[]>
>();
expectTypeOf(localAccess.check(assertions, {})).toEqualTypeOf<AccessDecision>();
expectTypeOf(remoteAccess.check(assertions, {})).toEqualTypeOf<
    Promise<AccessDecision>
>();
expectTypeOf(remoteAccess.listAccessRuleIds()).toEqualTypeOf<
    Promise<string[]>
>();

declare const context: ContextAdapter;
declare const localContext: LocalContextAdapter;
declare const remoteContext: RemoteContextAdapter;

expectTypeOf(context.scheme.process('X')).toEqualTypeOf<
    MaybePromise<ProcessResult>
>();
expectTypeOf(context.compositionPresence).toEqualTypeOf<
    ContextCompositionPresence | undefined
>();
expectTypeOf(
    localContext.scheme,
).toMatchTypeOf<LocalContextSchemeEngineAdapter>();
expectTypeOf(
    remoteContext.scheme,
).toMatchTypeOf<RemoteContextSchemeEngineAdapter>();
// A Context that holds more than one scheme hands out a view per scheme. The
// selector picks the view; the view's operations stay selector-free and keep
// the mode of the Context they came from.
expectTypeOf(
    context.schemeView('target'),
).toEqualTypeOf<ContextSchemeEngineAdapter>();
expectTypeOf(
    localContext.schemeView('target'),
).toEqualTypeOf<LocalContextSchemeEngineAdapter>();
expectTypeOf(
    remoteContext.schemeView('target'),
).toEqualTypeOf<RemoteContextSchemeEngineAdapter>();
expectTypeOf(localContext.schemeView('target').validate('X')).toEqualTypeOf<
    ReturnType<LocalContextSchemeEngineAdapter['validate']>
>();
expectTypeOf<ContextAdapter['schemeView']>().parameters.toEqualTypeOf<
    [selector: string]
>();
expectTypeOf(context.audit({ text: 'body' })).toEqualTypeOf<
    MaybePromise<ContextOperationResult<DocumentAuditReport>>
>();
expectTypeOf(
    context.translate({ crosswalkId: 'x', marking: 'SECRET' }),
).toEqualTypeOf<
    MaybePromise<ContextOperationResult<CrosswalkTranslationResult>>
>();
expectTypeOf(
    remoteContext.translate({ crosswalkId: 'x', marking: 'SECRET' }),
).toEqualTypeOf<Promise<ContextOperationResult<CrosswalkTranslationResult>>>();

// Crosswalks are described the way schemes are: bare descriptors, no
// resolution envelope, sync locally and a Promise remotely.
expectTypeOf(context.describeCrosswalks()).toEqualTypeOf<
    MaybePromise<ContextCrosswalkDescriptor[]>
>();
expectTypeOf(localContext.describeCrosswalks()).toEqualTypeOf<
    ContextCrosswalkDescriptor[]
>();
expectTypeOf(remoteContext.describeCrosswalks()).toEqualTypeOf<
    Promise<ContextCrosswalkDescriptor[]>
>();
// A crosswalk names its schemes by Context-local selector, the value
// describeSchemes reports and translate's views compare against.
expectTypeOf<ContextCrosswalkDescriptor['source']>().toEqualTypeOf<string>();
expectTypeOf<
    ContextCrosswalkDescriptor['selections'][number]['candidates'][number]['disposition']
>().toEqualTypeOf<'carry' | 'review' | 'omit' | 'forbid'>();

// The grammar is part of the scheme profile a remote Context reads when it
// connects, so both modes answer it synchronously, and from the Context's own
// scheme rather than a selected one.
expectTypeOf(localContext.scheme.getGrammar()).toEqualTypeOf<SchemeGrammar>();
expectTypeOf(remoteContext.scheme.getGrammar()).toEqualTypeOf<SchemeGrammar>();
expectTypeOf<
    RemoteContextSchemeEngineAdapter['getGrammar']
>().parameters.toEqualTypeOf<[]>();

// A remote Context owns its composition. Its marking surface therefore has no
// lifecycle methods and no selector in the operation position.
expectTypeOf<RemoteContextAdapter>().not.toHaveProperty('process');
expectTypeOf<RemoteContextSchemeEngineAdapter>().not.toHaveProperty(
    'loadScheme',
);
expectTypeOf<RemoteContextSchemeEngineAdapter['process']>()
    .parameter(1)
    .toEqualTypeOf<
        | {
              inputFormat?: string;
              outputFormat?: string;
              assertions?: Assertion[];
              context?: ProcessingContext;
              surface?: string;
              parts?: string[];
              outputs?: string[];
              suggestFor?: string[];
              signal?: AbortSignal;
          }
        | undefined
    >();
expectTypeOf<RemoteContextSchemeEngineAdapter['render']>()
    .parameter(2)
    .toEqualTypeOf<RenderOptions | undefined>();
expectTypeOf(
    remoteContext.scheme.render(assertions, 'banner', {
        preservation: 'full',
        signal: abort,
    }),
).toEqualTypeOf<Promise<RenderResult>>();

// A local Context owns its composition just as a remote Context does. Its
// public views are queries, not mutable standalone engine instances.
expectTypeOf<LocalContextSchemeEngineAdapter>().not.toHaveProperty(
    'loadScheme',
);
expectTypeOf<LocalContextSchemeEngineAdapter>().not.toHaveProperty('loadLayer');
expectTypeOf<LocalContextSchemeEngineAdapter>().not.toHaveProperty(
    'unloadScheme',
);
expectTypeOf<LocalContextSchemeEngineAdapter>().not.toHaveProperty(
    'unloadLayer',
);
expectTypeOf(localContext.scheme.process('X')).toEqualTypeOf<ProcessResult>();
expectTypeOf(
    localContext.scheme.aggregateAssertions([assertions]),
).toEqualTypeOf<AggregateResult>();
// A standalone scheme adapter has selector-bearing render arguments and is
// deliberately not interchangeable with the immutable Context query surface.
// @ts-expect-error Standalone render takes a scheme selector before its options.
const boundStandaloneScheme: LocalContextSchemeEngineAdapter = local;
void boundStandaloneScheme;
const boundStandaloneGuide: LocalContextGuideEngineAdapter = localGuide;
void boundStandaloneGuide;
expectTypeOf<LocalContextGuideEngineAdapter>().not.toHaveProperty(
    'evaluateText',
);
declare const contextGuide: LocalContextGuideEngineAdapter;
expectTypeOf(
    contextGuide.evaluate('guide', ['rule']),
).toEqualTypeOf<EvaluationResult>();
expectTypeOf(
    contextGuide.evaluateMany([{ guideId: 'guide', ruleId: 'rule' }]),
).toEqualTypeOf<EvaluationResult>();
// @ts-expect-error A Context view cannot select an unrelated scheme.
localContext.scheme.process('X', 'another-scheme');
// @ts-expect-error Context evaluation never accepts a supplied processor.
contextGuide.evaluate(['rule'], {});

expectTypeOf(
    localContext.scheme.getConceptsInCategory('category'),
).toEqualTypeOf<ConceptView[]>();
expectTypeOf(
    localContext.scheme.getConceptsInCategory('category', { nested: true }),
).toEqualTypeOf<Array<{ concept: ConceptView; depth: number }>>();
// @ts-expect-error Context category queries cannot select another scheme.
localContext.scheme.getConceptsInCategory('category', 'another-scheme');

expectTypeOf(
    localContext.scheme.diff('A', 'B', {
        inputFormat: 'banner',
        signal: abort,
    }),
).toEqualTypeOf<DiffResult>();
// @ts-expect-error A local identity comparison does not render an output.
localContext.scheme.diff('A', 'B', { outputFormat: 'banner' });

// Disposing a bound view would invalidate sibling views; only Context owns it.
expectTypeOf<LocalContextSchemeEngineAdapter>().not.toHaveProperty('destroy');
