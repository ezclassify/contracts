import type {
    Concept,
    Category,
    ConceptDescription,
    ProcessingContext,
    Assertion,
    ProcessResult,
    ValidateResult,
    ExplanationTrace,
    RenderResult,
    RenderPreservation,
    AggregateResult,
    SuggestResult,
    SuggestResultsByCategory,
    CoverageReport,
    DiffResult,
    Selectable,
    Vocabulary,
    MarkingColorRule,
    ProcessingRole,
    RecognitionLimit,
    ReferenceSurfaceLabel,
    Suggestion,
} from './scheme';
import type {
    EvaluationResult,
    GuideScanResult,
    GuideScanOptions,
    RuleDescription,
} from './guide';
import type {
    ContextOperationResult,
    DocumentAccessAssessment,
    DocumentAccessAssessmentInput,
    DocumentAssessmentInput,
    DocumentAuditReport,
    GuideContentEvaluation,
    GuideContentExclusion,
    GuideDeterminationInput,
    GuideEvaluationUnitInput,
} from './document';
import type {
    SchemeStructuralView,
    FilterResult,
    FormatView,
    SchemeMetaView,
    CategoryView,
    ConceptView,
    SchemePublicView,
    GuideMetaView,
    GuideStructuralView,
} from './views';
import type {
    AccessDecision,
    AccessRuleDescription,
    AccessRequirementsInput,
    AccessRequirementsDescription,
} from './access';
import type {
    CrosswalkTranslationInput,
    CrosswalkTranslationResult,
} from './crosswalk';
import type { MarkingProcessorAdapter } from './local-engine';
import type { FormatCoverage } from './format-coverage';

/**
 * Controls one render operation.
 *
 * These options belong to the adapter call rather than its wire request DTO:
 * `signal` cancels local client work and is never serialized, while
 * `preservation` is forwarded as the corresponding request value by remote
 * adapters.
 */
export interface RenderOptions {
    /**
     * `'projection'` (default) renders what the format writes and reports what
     * it did not. `'full'` fails when facts are omitted, conflicting, or
     * unrepresentable.
     */
    preservation?: RenderPreservation;
    /** Cancel this operation without adding transport data to the request. */
    signal?: AbortSignal;
}

/**
 * Metadata-only view of a loaded scheme. Operations do not travel through this
 * shape.
 */
export interface SchemeView {
    /** Scheme identifier. */
    id: string;
    /** Human-readable display name. */
    name: string;
    /** Semantic version of the loaded scheme. */
    version: string;
    /** Longer description of what this scheme covers. */
    description?: string;
    /** Whether this scheme fills the adapter's default-scheme slot. */
    isDefault: boolean;
}

/** Metadata-only view of a loaded guide. */
export interface GuideView {
    /** Guide identifier. */
    id: string;
    /** Human-readable display name. */
    name: string;
    /** Semantic version of the loaded guide. */
    version: string;
    /** Longer description of what this guide covers. */
    description?: string;
    /** Id of the scheme the guide's outcomes are written in. */
    schemeId: string;
}

/**
 * Optional progress callback. Invoked as the scanner advances through the input
 * string with `(current, total)` offsets in UTF-16 code units. Implementations
 * may use this to render a determinate progress indicator. The scanner emits a final tick where
 * `current === total` and coalesces intermediate ticks so that no input
 * produces more than ~50 calls.
 *
 * @param current - How far the scan has advanced, in UTF-16 code units.
 * @param total - Length of the scanned text, in UTF-16 code units.
 */
export type ScanProgressCallback = (current: number, total: number) => void;

/** Options accepted by scan operations. */
export interface ScanOptions {
    /**
     * The format the markings in the text are written in. For a scheme that
     * declares `render.surfaces`, the view they are read as, or one of its
     * forms, as the scheme document's `render.surfaces` defines them.
     * Omitted, recognition works it out. `outputFormat` never narrows what is
     * read.
     */
    inputFormat?: string;
    /**
     * The output each found marking is rendered back in. For a scheme that
     * declares `render.surfaces`, an output as the scheme document's
     * `render.surfaces` defines it. Omitted, each marking is written as
     * `ScanResult.type` describes.
     */
    outputFormat?: string;
    /** Optional progress callback invoked as the scanner advances. */
    onProgress?: ScanProgressCallback;
    /**
     * Abort signal for the operation. A remote adapter cancels the in-flight
     * request; an in-process engine may ignore it.
     */
    signal?: AbortSignal;
}

/**
 * A single marking found during a scheme scan of free text.
 *
 * One entry of `ScanOutcome.results` per detected marking occurrence in the
 * document. `start`/`end` are offsets in UTF-16 code units in the input text,
 * suitable for overlaying highlights in a rich-text editor.
 * `result` carries what validate answers for the marking, so its facts and
 * validity are available without a second call. `wrapped` is `true` when the
 * marking was found inside an `embeddedMarkingStyle` wrapper pattern (e.g., a
 * marking in parentheses).
 */
export interface ScanResult {
    /** The matched marking string (as found in the document) */
    marking: string;
    /**
     * Start position in the (possibly stripped) input text
     *
     * @asType integer
     */
    start: number;
    /**
     * End position in the (possibly stripped) input text
     *
     * @asType integer
     */
    end: number;
    /**
     * What validate answers for this marking, read where it was found and in
     * the role `role` names. A scan reads documents; it does not author them,
     * so it carries no fix paths. A caller that wants to correct one region
     * processes that region.
     */
    result: ValidateResult;
    /**
     * The output this marking is written in when the scan names no output
     * format: `result.rendered` is written in it.
     *
     * Without `render.surfaces`, the format id that read it, or when no
     * single format read it, the scheme's default output, the
     * `defaultRenderFormat` its metadata reports. With them, the view it was
     * read as, the address `result.recognition.inputFormat` reports, when the
     * form it was read in is one that view writes: its `format` or a case's
     * format. A marking read in one form that carries more than one surface,
     * such as an attribute list, is read as no one view; when the views that
     * name that form all write it under one view id, it is written in them,
     * and its type is that bare view id, the output format that writes each
     * surface in its view by that id. Any other marking, one read in a form
     * its view is only read in or read as no one view, is written in the
     * default for its `role`, the `defaultWholeRenderFormat` or
     * `defaultPartRenderFormat` its metadata reports, and that default is its
     * type.
     */
    type: string;
    /**
     * Whether the marking was found inside a wrapper pattern (e.g.,
     * parentheses)
     */
    wrapped: boolean;
    /**
     * The marking text inside the wrapper: the capture group of the scheme's
     * `embeddedMarking` pattern. Present only when `wrapped` is true. Consumers
     * that need to re-process the marking must use this rather than stripping
     * delimiters from `marking`, because the wrapper shape is scheme-declared
     * and is not always a pair of parentheses.
     */
    inner?: string;
    /**
     * Scheme-resolved structural role of this marking: `'whole'` (a
     * document-wide marking: a page-top marking, a TLP document tag) or
     * `'part'` (a per-region marking: a paragraph mark, a segment, a tag).
     *
     * A marking found inside a wrapper is a part, because a scheme that
     * declares a wrapper has said that is how a part is written. Otherwise,
     * for a scheme that declares `render.surfaces`, it is the role recognition
     * decides for it, the one `result.recognition.role` reports, and for a
     * scheme without them, the role the scheme's `contextFormats` give the
     * format it was read in. A marking with neither is a whole. Consumers
     * should prefer `role` over `wrapped`, which only reflects wrapper syntax
     * and not the scheme's whole/part intent.
     */
    role: ProcessingRole;
}

/**
 * How far a scan got.
 *
 * `complete` means the whole document was offered to recognition. `truncated`
 * means the region cap was reached with budget to spare. `resource-limit`
 * means the budget was spent or the caller aborted.
 */
export type ScanStatus = 'complete' | 'truncated' | 'resource-limit';

/**
 * How far a scan got, and what stopped it.
 *
 * A scan spends one work budget over a whole document: finding the regions a
 * marking could occupy costs against it, and so does reading each one. A
 * document large enough exhausts it, and a document that offers more regions
 * than the scanner will hold is capped. Either way the answer is a shorter list
 * of markings than the document holds, and a shorter list is indistinguishable
 * from a clean one unless the scanner says so. For a scanner whose answer
 * decides how a document is handled, that is the difference between "this
 * document carries no marking" and "this document was not read to the end", so
 * it is reported rather than inferred.
 *
 * `complete` means the whole document was offered to recognition.
 * `resource-limit` means the budget was spent or the caller aborted, and
 * `limitHit` names which. `truncated` means the region cap was reached with
 * budget to spare. `regionsFound` is how many candidate regions the scan
 * considered, which is the number that makes a zero result legible.
 */
export interface ScanLimits {
    /** Whether the document was read to the end, and if not, why not. */
    status: ScanStatus;
    /** The ceiling that stopped the scan, when one did. */
    limitHit?: RecognitionLimit;
    /**
     * Candidate regions the scan considered.
     *
     * @asType integer
     */
    regionsFound: number;
    /** Whether the per-document region cap was reached. */
    regionsCapped?: boolean;
}

/**
 * What `scan` returns: the markings it found, and how far it got.
 *
 * An empty list is what a clean document and an abandoned one both look like,
 * so the limit report travels beside the markings on every scan instead of
 * behind a second call. A caller whose next step depends on completeness reads
 * `limits`; one that only highlights matches reads `results`.
 */
export interface ScanOutcome {
    /** The markings the scan found, in document order. */
    results: ScanResult[];
    /** How far the scan got, and what stopped it. */
    limits: ScanLimits;
}

/**
 * A value that may be synchronous or asynchronous.
 *
 * Used throughout the adapter interfaces so that the `Local*` narrowings
 * (in-process, synchronous) and the `Remote*` narrowings (HTTP client, async)
 * can share the same method signatures without forcing the local
 * implementation to wrap every return in `Promise.resolve()`.
 */
export type MaybePromise<T> = T | Promise<T>;

/**
 * One scheme's answer within a registry fan-out call (`processAll` /
 * `processMatching`).
 *
 * Each registered scheme produces one entry. Callers use `schemeId` and
 * `schemeName` to correlate entries when displaying results for multiple
 * schemes simultaneously. The fan-out asks each scheme how it reads the
 * marking, so `result` is what validate answers; a caller that goes on to
 * correct the marking in one scheme processes it there.
 *
 * @internal
 */
export interface RegistryProcessResult {
    /** Id of the scheme that answered. */
    schemeId: string;
    /** Display name of the scheme that answered. */
    schemeName: string;
    /** What validate answers for the marking in this scheme. */
    result: ValidateResult;
}

/**
 * Autocomplete suggestions returned by the registry for a specific scheme.
 *
 * Produced by `SchemeRegistry.suggestAcross()`. The `schemeId`/`schemeName`
 * pair identifies which registered scheme the suggestions came from, allowing
 * UIs that show multi-scheme completions to group or label entries.
 *
 * @internal
 */
export interface RegistrySuggestion {
    /** Id of the scheme the suggestions came from. */
    schemeId: string;
    /** Display name of the scheme the suggestions came from. */
    schemeName: string;
    /** The scheme's suggestions for the input. */
    suggestions: Suggestion[];
}

/**
 * Public surface of a guide engine: what consumers use to scan documents for
 * rule hits, evaluate user selections against loaded guides, and inspect guide
 * metadata.
 *
 * Every member here works in both modes. A local guide engine answers in
 * process; a remote one answers over the context guide routes, which name the
 * guide and the selected rules and hold the marking processor server-side. The
 * `Local`/`Remote` narrowings below express sync versus Promise, and the local
 * one additionally carries the in-process composition wiring that has no wire
 * form. See {@link LocalGuideEngineAdapter}.
 */
export interface GuideEngineAdapter {
    /**
     * Scan document text for rule hits across the loaded guides.
     *
     * @param text - Document text to scan.
     * @param guideId - Guide to scan with. Omit it to scan with every loaded
     *   guide.
     * @param options - A progress callback, opt-in confidence, and a
     *   cancellation signal.
     */
    scan(
        text: string,
        guideId?: string,
        options?: GuideScanOptions & { signal?: AbortSignal },
    ): MaybePromise<GuideScanResult[]>;
    /**
     * Evaluate a single guide against the rules a user selected. The guide
     * self-routes via its declared scheme dependency, so the caller names the
     * guide and the selection and nothing else.
     *
     * @param guideId - Id of the guide to evaluate.
     * @param selectedRuleIds - Ids of the rules the user selected.
     */
    evaluate(
        guideId: string,
        selectedRuleIds: string[],
    ): MaybePromise<EvaluationResult>;
    /**
     * Evaluate one selection across every loaded guide, then combine the
     * outcomes through the context's marking processor in guide load order.
     * A later guide owns a rule id that occurs in more than one guide.
     *
     * @param selectedRuleIds - Ids of the rules the user selected.
     */
    evaluateMany(selectedRuleIds: string[]): MaybePromise<EvaluationResult>;
    /**
     * Evaluate every loaded guide (fan-out). Returned in load order. A remote
     * adapter fans out over the guides it already holds metadata for; the
     * composition is settled at load time, so there is nothing to ask the
     * server about first.
     *
     * @param selectedRuleIds - Ids of the rules the user selected.
     */
    evaluateAll(selectedRuleIds: string[]): MaybePromise<EvaluationResult[]>;
    /**
     * Describe one rule: its outcome and activation text, the rules it depends
     * on, and the rules it overrides. Omit `guideId` for the primary guide.
     *
     * @param ruleId - Id of the rule.
     * @param guideId - Guide that holds the rule. Omit it for the primary
     *   guide.
     */
    describeRule(
        ruleId: string,
        guideId?: string,
    ): MaybePromise<RuleDescription>;
    /**
     * Text-search the loaded guide's rules. Omit `guideId` for the primary
     * guide.
     *
     * @param query - Search text.
     * @param guideId - Guide to search. Omit it for the primary guide.
     */
    filterRules(query: string, guideId?: string): MaybePromise<FilterResult>;
    /** Return metadata for every loaded guide, in load order. */
    listGuideMeta(): GuideMetaView[];
    /**
     * Return metadata for a single guide; omit `guideId` for the primary guide.
     *
     * @param guideId - Guide to describe. Omit it for the primary guide.
     */
    getGuideMeta(guideId?: string): GuideMetaView | undefined;
    /**
     * Build render-ready structural views for every loaded guide. Used by
     * Guidebook-style components to display guide rules grouped by category.
     * Fans out per guide the same way {@link evaluateAll} does.
     */
    buildGuideViews(): MaybePromise<GuideStructuralView[]>;
}

/**
 * A {@link GuideEngineAdapter} whose operations complete synchronously.
 *
 * The forms that take a live marking processor are in-process composition
 * wiring rather than operations a UI calls, and they are internal: a processor
 * is a function-bearing object that cannot cross a wire. On the composed path a
 * local Context supplies the processor itself, and the remote server holds both
 * halves already, so nothing a caller does is lost by their absence from the
 * published contract.
 *
 * {@link validate} is here for a different reason: it inspects the guide
 * document, and only an engine that holds the document can answer it. A remote
 * adapter holds guide metadata and rule projections, never the authored source,
 * so there is nothing on its side to derive a consistency verdict from.
 * Checking that an authored guide hangs together is an authoring-time question
 * about a document, not a runtime operation against a loaded composition, which
 * is why it stays off the base contract instead of acquiring a route.
 */
export interface LocalGuideEngineAdapter extends GuideEngineAdapter {
    scan(
        text: string,
        guideId?: string,
        options?: GuideScanOptions & { signal?: AbortSignal },
    ): GuideScanResult[];
    evaluate(guideId: string, selectedRuleIds: string[]): EvaluationResult;
    /**
     * In-process form: evaluate a user selection against the loaded guide using
     * a caller-supplied marking processor.
     *
     * @internal
     * @param selection - Ids of the selected rules, or the selected rules
     *   themselves.
     * @param processor - Marking processor that renders and settles the
     *   outcome.
     */
    evaluate(
        selection: string[] | Selectable[],
        processor: MarkingProcessorAdapter,
    ): EvaluationResult;
    evaluateAll(selectedRuleIds: string[]): EvaluationResult[];
    evaluateMany(selectedRuleIds: string[]): EvaluationResult;
    /**
     * In-process aggregate with an explicitly supplied marking processor.
     *
     * @internal
     * @param selection - Ids of the selected rules, or the selected rules
     *   themselves.
     * @param processor - Marking processor that combines the outcomes.
     */
    evaluateMany(
        selection: string[] | Selectable[],
        processor: MarkingProcessorAdapter,
    ): EvaluationResult;
    /**
     * Evaluate exact document text as nominations, explicit determinations, and
     * separate determined/projected compilations.
     *
     * @internal
     * @param text - Document text to evaluate.
     * @param processor - Marking processor that settles the compilations.
     * @param options - Evaluation units, excluded spans, explicit
     *   determinations and the guide to use.
     */
    evaluateText(
        text: string,
        processor: MarkingProcessorAdapter,
        options?: {
            units?: GuideEvaluationUnitInput[];
            excludedSpans?: GuideContentExclusion[];
            determinations?: GuideDeterminationInput;
            guideId?: string;
        },
    ): GuideContentEvaluation;
    describeRule(ruleId: string, guideId?: string): RuleDescription;
    filterRules(query: string, guideId?: string): FilterResult;
    /**
     * Report whether the loaded guide document is internally consistent: every
     * dependency and override resolves, and no rule contradicts another.
     */
    validate(): {
        /** Whether every loaded guide is internally consistent. */
        valid: boolean;
        /** One message per problem found; empty when `valid` is true. */
        issues: string[];
        /**
         * Id of the first guide found inconsistent; absent when every loaded
         * guide is valid.
         */
        guideId?: string;
    };
    buildGuideViews(): GuideStructuralView[];
}

/** A {@link GuideEngineAdapter} whose operations complete asynchronously. */
export interface RemoteGuideEngineAdapter extends GuideEngineAdapter {
    scan(
        text: string,
        guideId?: string,
        options?: GuideScanOptions & { signal?: AbortSignal },
    ): Promise<GuideScanResult[]>;
    evaluate(
        guideId: string,
        selectedRuleIds: string[],
    ): Promise<EvaluationResult>;
    evaluateAll(selectedRuleIds: string[]): Promise<EvaluationResult[]>;
    evaluateMany(selectedRuleIds: string[]): Promise<EvaluationResult>;
    describeRule(ruleId: string, guideId?: string): Promise<RuleDescription>;
    filterRules(query: string, guideId?: string): Promise<FilterResult>;
    buildGuideViews(): Promise<GuideStructuralView[]>;
}

/**
 * Public surface of an access engine: what consumers use to evaluate access
 * decisions and describe access requirements. The scheme is bound at
 * construction time; callers do not pass it at check time.
 *
 * Every member works in both modes: the local access engine evaluates the
 * policy in process, and the remote one reaches the context access routes. The
 * narrowings below express sync versus Promise and nothing else.
 */
export interface AccessEngineAdapter {
    /** Id of the scheme whose markings the access policy reads. */
    readonly schemeId: string;
    /**
     * Decides whether a subject may access data carrying a marking.
     *
     * @param dataAssertions - The data's marking, as assertions.
     * @param userAttributes - The subject's attributes, as the policy's rules
     *   read them.
     * @param context - Other values the rules' conditions read.
     * @returns The combined decision and each contributing rule's result.
     */
    check(
        dataAssertions: Assertion[],
        userAttributes: Record<string, unknown>,
        context?: Record<string, unknown>,
    ): MaybePromise<AccessDecision>;
    /**
     * Describes one access rule: what it requires and when it applies.
     *
     * @param ruleId - Id of a rule in the loaded policy.
     * @returns The rule's description.
     */
    describeAccessRule(ruleId: string): MaybePromise<AccessRuleDescription>;
    /**
     * Describes what a subject needs in order to access data with a given
     * marking.
     *
     * @param input - The marking to describe requirements for.
     * @returns The requirements, rule by rule.
     */
    describeAccessRequirements(
        input: AccessRequirementsInput,
    ): MaybePromise<AccessRequirementsDescription>;
    /**
     * Ids of every rule in the loaded access policy. A remote adapter derives
     * these from {@link describeAllAccessRules}: one route serves both, so
     * listing ids costs no extra round trip.
     */
    listAccessRuleIds(): MaybePromise<string[]>;
    /**
     * Describes every rule in the loaded access policy, in policy order.
     *
     * @returns One description per rule.
     */
    describeAllAccessRules(): MaybePromise<AccessRuleDescription[]>;
}

/** An {@link AccessEngineAdapter} whose operations complete synchronously. */
export interface LocalAccessEngineAdapter extends AccessEngineAdapter {
    check(
        dataAssertions: Assertion[],
        userAttributes: Record<string, unknown>,
        context?: Record<string, unknown>,
    ): AccessDecision;
    describeAccessRule(ruleId: string): AccessRuleDescription;
    describeAccessRequirements(
        input: AccessRequirementsInput,
    ): AccessRequirementsDescription;
    listAccessRuleIds(): string[];
    describeAllAccessRules(): AccessRuleDescription[];
}

/** An {@link AccessEngineAdapter} whose operations complete asynchronously. */
export interface RemoteAccessEngineAdapter extends AccessEngineAdapter {
    check(
        dataAssertions: Assertion[],
        userAttributes: Record<string, unknown>,
        context?: Record<string, unknown>,
    ): Promise<AccessDecision>;
    describeAccessRule(ruleId: string): Promise<AccessRuleDescription>;
    describeAccessRequirements(
        input: AccessRequirementsInput,
    ): Promise<AccessRequirementsDescription>;
    listAccessRuleIds(): Promise<string[]>;
    describeAllAccessRules(): Promise<AccessRuleDescription[]>;
}

/**
 * The marking surface a UI depends on. A local engine and a remote client both
 * implement it, and a caller cannot tell which one it holds: every method here
 * works in both modes, and the `Local`/`Remote` narrowings differ only in
 * whether they return a value or a Promise.
 *
 * Lifecycle parity: both expose the same load / unload methods, and they take
 * ids. Choosing which artifacts an adapter serves is construction, not
 * operation. A local engine may accept a scheme struct or a JSON document on
 * its own class, and the remote equivalent of "choose your composition" is
 * constructing a client bound to a context. Neither belongs on a contract a UI
 * calls at runtime.
 *
 * A caller can still build a composed stack: `loadScheme(baseId)` followed by
 * one or more `loadLayer(id)` calls. Every subsequent op runs against the
 * current composition. Layers compose in load order; `unloadLayer(id)` removes
 * one by id and rebuilds the composition.
 *
 * Three operations answer about one marking, and they are split by who is
 * asking. {@link validate} is the reader's call: the facts, whether they stand,
 * and what a reader needs to show why. {@link process} is the author's call:
 * the same answer, settled the same way, plus corrections, fix paths, the
 * outputs the author names and, on request, picker options. {@link explain}
 * answers why, step by step. Each returns, in one round trip, everything that
 * is cheap to compute for its purpose.
 *
 * Every `inputFormat` here, and on the narrowings that extend this, names a
 * format id, or for a scheme that declares `render.surfaces`, a view the text
 * is read as or one of its forms, as `RenderConfigDoc.surfaces` defines them.
 * Every `outputFormat`, and the `format` that `render` and `applyPreset` take,
 * names an output: a format id, or for a scheme that declares
 * `render.surfaces`, an output address as `RenderConfigDoc.surfaces` defines
 * it. An empty one of any of these, input or output, names none, exactly as
 * an omitted one does.
 *
 * A format a request names that the scheme does not declare, as an input or
 * an output, is the caller's error at every operation: it is refused with the
 * code `INVALID_INPUT`, a 400 over the wire, and never answered as though the
 * request had named none.
 *
 * Access decisions and guide evaluation are not here. They are the material of
 * {@link AccessEngineAdapter} and {@link GuideEngineAdapter}, and the composed
 * path that reaches all three is {@link ContextAdapter}.
 */
export interface SchemeEngineAdapter {
    /** Whether this adapter has an active connection to its data source. */
    readonly connected: boolean;

    /**
     * Set or replace the base scheme of the current composition stack by id.
     * Clears any previously loaded layers.
     *
     * @param schemeId - Id of the scheme to load as the base.
     */
    loadScheme(schemeId: string): MaybePromise<void>;

    /**
     * Push a layer onto the composition stack by id. Layers compose in load
     * order (first-loaded is applied first). The composed scheme is rebuilt on
     * each stack change.
     *
     * @param layerId - Id of the layer to stack on the current composition.
     */
    loadLayer(layerId: string): MaybePromise<void>;

    /**
     * Remove the base scheme by id, clearing any layers stacked on it.
     *
     * @param schemeId - Id of the base scheme to remove.
     */
    unloadScheme(schemeId: string): MaybePromise<void>;

    /**
     * Remove a specific layer by id. The composition is rebuilt from remaining
     * layers in their original order.
     *
     * @param layerId - Id of the layer to remove.
     */
    unloadLayer(layerId: string): MaybePromise<void>;

    /**
     * Get a loaded scheme synchronously. Omitted id → default-scheme slot.
     * Cached for remote clients. Throws if the requested scheme is not loaded
     * (or the default slot is empty).
     *
     * @param schemeId - Scheme to return. Omit it for the default scheme.
     */
    getScheme(schemeId?: string): SchemePublicView;

    /** List metadata for every loaded scheme. */
    listSchemes?(): SchemeView[];

    /**
     * Return the default-scheme slot value, or null if empty. Read-only: which
     * scheme occupies the slot is settled when the adapter is constructed.
     */
    getDefaultScheme?(): SchemeView | null;

    /** List metadata for every loaded guide. */
    listGuides?(): GuideView[];

    /**
     * Process a marking for someone who is writing it: the author's call.
     *
     * `input` is marking text or facts, and `options.assertions` adds the
     * facts already chosen. Text and chosen facts may come together, which is
     * what a composer sends on each keystroke: what was typed, plus what is
     * already selected elsewhere. The two are settled together as one marking,
     * so a conflict between what the text states and what was chosen is the
     * scheme's to repair or report, exactly as it would be within one input.
     * `recognition` describes the text alone.
     *
     * The result is everything {@link validate} answers, settled the same way,
     * plus the corrections to the text, proven fix paths, the outputs named in
     * `options.outputs` and, when `options.suggestFor` names categories, the
     * picker options for them. See {@link ProcessResult}.
     *
     * `options.surface` names the validation surface the input is. See
     * {@link SchemeEngineAdapter.validate} for what each mode demands.
     *
     * @param input - Marking text, or the facts as assertions.
     * @param schemeId - Scheme to process against.
     * @param options - Formats, chosen facts, context, surface, parts,
     *   requested outputs and picker categories.
     */
    process(
        input: string | Assertion[],
        schemeId: string,
        options?: {
            /**
             * The format `input` is written in. For a scheme that declares
             * `render.surfaces`, the view it is read as, or one of its forms,
             * as the scheme document's `render.surfaces` defines them. Omitted,
             * recognition works it out and reports what the text was read as in
             * `recognition.inputFormat`.
             */
            inputFormat?: string;
            /**
             * The output `rendered` is written in. For a scheme that declares
             * `render.surfaces`, an output as the scheme document's
             * `render.surfaces` defines it. Omitted, the scheme's default
             * format, or with `render.surfaces`, each written surface's
             * default for the marking's role, by the rule `render.surfaces`
             * states for a request that names no output.
             */
            outputFormat?: string;
            /**
             * The facts already chosen. Sent with marking text, they are
             * settled together with what the text states, as one marking.
             */
            assertions?: Assertion[];
            context?: ProcessingContext;
            /**
             * The validation surface `input` is, by scheme scope id. Omitted,
             * the input is a whole marking.
             */
            surface?: string;
            /**
             * Part markings the whole must cover. The whole is judged as
             * covering them: a part it does not cover is an error, and so is
             * a part that does not read as a marking. Every rank floor is
             * worked out against the whole and these parts together, so a
             * raise never lands below what a part needs, and every proposed
             * fix is proven with them, as `ProcessResult.proposedFixes`
             * states. Each entry is a marking in one of the scheme's part
             * formats, or any format the scheme reads. Empty or absent, the
             * whole stands alone.
             */
            parts?: string[];
            /**
             * The outputs to write into `renders`, each an output address
             * spelled exactly as a key of `renders` is. Omitted or empty,
             * `renders` is empty. An address the scheme does not declare is
             * refused.
             */
            outputs?: string[];
            /**
             * Category ids to answer picker options for, returned in
             * `suggestionsFor`. Omitted, nothing is suggested and the field
             * is absent. An id the scheme does not declare is refused.
             */
            suggestFor?: string[];
            signal?: AbortSignal;
        },
    ): MaybePromise<ProcessResult>;
    /**
     * Same as the overload above, against the default scheme.
     *
     * @param input - Marking text, or the facts as assertions.
     * @param options - Formats, chosen facts, context, surface, parts,
     *   requested outputs and picker categories.
     */
    process(
        input: string | Assertion[],
        options?: {
            /**
             * The format `input` is written in. For a scheme that declares
             * `render.surfaces`, the view it is read as, or one of its forms,
             * as the scheme document's `render.surfaces` defines them. Omitted,
             * recognition works it out and reports what the text was read as in
             * `recognition.inputFormat`.
             */
            inputFormat?: string;
            /**
             * The output `rendered` is written in. For a scheme that declares
             * `render.surfaces`, an output as the scheme document's
             * `render.surfaces` defines it. Omitted, the scheme's default
             * format, or with `render.surfaces`, each written surface's
             * default for the marking's role, by the rule `render.surfaces`
             * states for a request that names no output.
             */
            outputFormat?: string;
            /**
             * The facts already chosen. Sent with marking text, they are
             * settled together with what the text states, as one marking.
             */
            assertions?: Assertion[];
            context?: ProcessingContext;
            /**
             * The validation surface `input` is, by scheme scope id. Omitted,
             * the input is a whole marking.
             */
            surface?: string;
            /**
             * Part markings the whole must cover. The whole is judged as
             * covering them: a part it does not cover is an error, and so is
             * a part that does not read as a marking. Every rank floor is
             * worked out against the whole and these parts together, so a
             * raise never lands below what a part needs, and every proposed
             * fix is proven with them, as `ProcessResult.proposedFixes`
             * states. Each entry is a marking in one of the scheme's part
             * formats, or any format the scheme reads. Empty or absent, the
             * whole stands alone.
             */
            parts?: string[];
            /**
             * The outputs to write into `renders`, each an output address
             * spelled exactly as a key of `renders` is. Omitted or empty,
             * `renders` is empty. An address the scheme does not declare is
             * refused.
             */
            outputs?: string[];
            /**
             * Category ids to answer picker options for, returned in
             * `suggestionsFor`. Omitted, nothing is suggested and the field
             * is absent. An id the scheme does not declare is refused.
             */
            suggestFor?: string[];
            signal?: AbortSignal;
        },
    ): MaybePromise<ProcessResult>;

    /**
     * Judge a marking for someone who is reading it: the reader's call.
     *
     * `input` is marking text, or facts as stated: the facts a document or an
     * author states before any engine has settled them. It is never the
     * `assertions` of an earlier result. Those are settled already: what was
     * wrong with the text they came from belonged to the text, and repair has
     * resolved conflicts one way, so validating them can call a marking valid
     * whose text was not.
     *
     * The engine settles the input exactly as process does, then judges it.
     * No option here changes that settling, so `valid` and `inputWasValid`
     * mean what {@link ValidateResult} says they mean everywhere.
     * `options.surface`, `options.context` and `options.parts` say what the
     * marking is judged as, the same way they do for process. The result
     * carries no fix paths and no corrections; an author's editor calls
     * {@link process}.
     *
     * `valid` is always relative to a validation surface, which
     * `options.surface` names:
     *
     * - Omitted, the input is a whole marking. Every required category that
     *   belongs to the marking as a whole must be covered; a category scoped to
     *   an alternate surface is not demanded.
     * - Given a scheme scope id, the input is that surface's fragment. Exactly
     *   the required categories that surface owns must be covered, and nothing
     *   else is demanded.
     *
     * @param input - Marking text, or the facts as assertions.
     * @param schemeId - Scheme to validate against.
     * @param options - Formats, context, surface and the parts the whole must
     *   cover.
     */
    validate(
        input: string | Assertion[],
        schemeId: string,
        options?: {
            /**
             * The format `input` is written in, when it is text. For a scheme
             * that declares `render.surfaces`, the view it is read as, or one
             * of its forms, as the scheme document's `render.surfaces` defines
             * them. Omitted, recognition works it out and reports what the text
             * was read as in `recognition.inputFormat`. Refused when `input` is
             * facts, which carry no text.
             */
            inputFormat?: string;
            /**
             * The output `rendered` is written in. For a scheme that declares
             * `render.surfaces`, an output as the scheme document's
             * `render.surfaces` defines it. Omitted, the scheme's default
             * format, or with `render.surfaces`, each written surface's
             * default for the marking's role, by the rule `render.surfaces`
             * states for a request that names no output.
             */
            outputFormat?: string;
            context?: ProcessingContext;
            /**
             * The validation surface `input` is, by scheme scope id. Omitted,
             * the input is a whole marking.
             */
            surface?: string;
            /**
             * Part markings the whole must cover. The whole is judged as
             * covering them: a part it does not cover is an error, and so is
             * a part that does not read as a marking. Each entry is a marking
             * in one of the scheme's part formats, or any format the scheme
             * reads. Empty or absent, the whole stands alone.
             */
            parts?: string[];
            signal?: AbortSignal;
        },
    ): MaybePromise<ValidateResult>;
    /**
     * Same as the overload above, against the default scheme.
     *
     * @param input - Marking text, or the facts as assertions.
     * @param options - Formats, context, surface and the parts the whole must
     *   cover.
     */
    validate(
        input: string | Assertion[],
        options?: {
            /**
             * The format `input` is written in, when it is text. For a scheme
             * that declares `render.surfaces`, the view it is read as, or one
             * of its forms, as the scheme document's `render.surfaces` defines
             * them. Omitted, recognition works it out and reports what the text
             * was read as in `recognition.inputFormat`. Refused when `input` is
             * facts, which carry no text.
             */
            inputFormat?: string;
            /**
             * The output `rendered` is written in. For a scheme that declares
             * `render.surfaces`, an output as the scheme document's
             * `render.surfaces` defines it. Omitted, the scheme's default
             * format, or with `render.surfaces`, each written surface's
             * default for the marking's role, by the rule `render.surfaces`
             * states for a request that names no output.
             */
            outputFormat?: string;
            context?: ProcessingContext;
            /**
             * The validation surface `input` is, by scheme scope id. Omitted,
             * the input is a whole marking.
             */
            surface?: string;
            /**
             * Part markings the whole must cover. The whole is judged as
             * covering them: a part it does not cover is an error, and so is
             * a part that does not read as a marking. Each entry is a marking
             * in one of the scheme's part formats, or any format the scheme
             * reads. Empty or absent, the whole stands alone.
             */
            parts?: string[];
            signal?: AbortSignal;
        },
    ): MaybePromise<ValidateResult>;

    /**
     * Explain, step by step, how the engine settles a marking.
     *
     * Takes what {@link process} takes, apart from `outputs` and `suggestFor`,
     * which only add to a process result, and returns the trace of that same
     * processing: what was read, repaired, inferred and found wrong, and what
     * was written. A caller asks for it when someone wants to know why, not
     * what. No other operation returns the trace.
     *
     * @param input - Marking text, or the facts as assertions.
     * @param schemeId - Scheme to explain against.
     * @param options - Formats, chosen facts, context, surface and parts.
     */
    explain(
        input: string | Assertion[],
        schemeId: string,
        options?: {
            /**
             * The format `input` is written in. For a scheme that declares
             * `render.surfaces`, the view it is read as, or one of its forms,
             * as the scheme document's `render.surfaces` defines them. Omitted,
             * recognition works it out and reports what the text was read as in
             * `recognition.inputFormat`.
             */
            inputFormat?: string;
            /**
             * The output `rendered` is written in. For a scheme that declares
             * `render.surfaces`, an output as the scheme document's
             * `render.surfaces` defines it. Omitted, the scheme's default
             * format, or with `render.surfaces`, each written surface's
             * default for the marking's role, by the rule `render.surfaces`
             * states for a request that names no output.
             */
            outputFormat?: string;
            /**
             * The facts already chosen. Sent with marking text, they are
             * settled together with what the text states, as one marking.
             */
            assertions?: Assertion[];
            context?: ProcessingContext;
            /**
             * The validation surface `input` is, by scheme scope id. Omitted,
             * the input is a whole marking.
             */
            surface?: string;
            /**
             * Part markings the whole must cover. The whole is judged as
             * covering them: a part it does not cover is an error, and so is
             * a part that does not read as a marking. Each entry is a marking
             * in one of the scheme's part formats, or any format the scheme
             * reads. Empty or absent, the whole stands alone.
             */
            parts?: string[];
            signal?: AbortSignal;
        },
    ): MaybePromise<ExplanationTrace>;
    /**
     * Same as the overload above, against the default scheme.
     *
     * @param input - Marking text, or the facts as assertions.
     * @param options - Formats, chosen facts, context, surface and parts.
     */
    explain(
        input: string | Assertion[],
        options?: {
            /**
             * The format `input` is written in. For a scheme that declares
             * `render.surfaces`, the view it is read as, or one of its forms,
             * as the scheme document's `render.surfaces` defines them. Omitted,
             * recognition works it out and reports what the text was read as in
             * `recognition.inputFormat`.
             */
            inputFormat?: string;
            /**
             * The output `rendered` is written in. For a scheme that declares
             * `render.surfaces`, an output as the scheme document's
             * `render.surfaces` defines it. Omitted, the scheme's default
             * format, or with `render.surfaces`, each written surface's
             * default for the marking's role, by the rule `render.surfaces`
             * states for a request that names no output.
             */
            outputFormat?: string;
            /**
             * The facts already chosen. Sent with marking text, they are
             * settled together with what the text states, as one marking.
             */
            assertions?: Assertion[];
            context?: ProcessingContext;
            /**
             * The validation surface `input` is, by scheme scope id. Omitted,
             * the input is a whole marking.
             */
            surface?: string;
            /**
             * Part markings the whole must cover. The whole is judged as
             * covering them: a part it does not cover is an error, and so is
             * a part that does not read as a marking. Each entry is a marking
             * in one of the scheme's part formats, or any format the scheme
             * reads. Empty or absent, the whole stands alone.
             */
            parts?: string[];
            signal?: AbortSignal;
        },
    ): MaybePromise<ExplanationTrace>;

    /**
     * Render assertions in a given format.
     *
     * For a scheme that declares `render.surfaces`, `format` is an output as
     * the scheme document's `render.surfaces` defines it. A render that writes
     * more than one surface returns a composed result, which
     * {@link RenderResult} describes.
     *
     * `render` is a display _projection_: a format writes the fields it
     * declares, in one concept view, so a fact outside that tree does not
     * appear in the string. What actually happened to this state in this render
     * is in the result's `RenderAssessment` value: what was written, what was
     * left out, what collapsed, and what this format cannot write at all.
     *
     * Read the assessment before treating a rendered string as a transport. For
     * full state, send the assertion array (`process(assertions)` /
     * `aggregateAssertions`) instead.
     *
     * `options.preservation` turns that reading into a request the render
     * itself answers. `'projection'`, the default, is the ordinary human
     * projection: it renders what the format writes and reports the rest.
     * `'full'` asks for a render that loses nothing, and fails rather than
     * returning a string when the assessment carries omitted or conflicting
     * facts, or a value this format cannot write. A caller that meant to
     * transport state gets an error instead of a plausible string, which is the
     * whole point of naming the request.
     *
     * @param assertions - Assertions to render.
     * @param format - Output to write. Omit it for the default output.
     * @param schemeId - Scheme to render with. Omit it for the default scheme.
     * @param options - Preservation mode and a cancellation signal.
     */
    render(
        assertions: Assertion[],
        format?: string,
        schemeId?: string,
        options?: RenderOptions,
    ): MaybePromise<RenderResult>;

    /**
     * Return the canonical form of a marking string.
     *
     * @param input - Marking text.
     * @param schemeId - Scheme to normalize against.
     * @param options - Input and output formats and a cancellation signal.
     */
    normalize(
        input: string,
        schemeId: string,
        options?: {
            inputFormat?: string;
            outputFormat?: string;
            signal?: AbortSignal;
        },
    ): MaybePromise<string>;
    /**
     * Same as the overload above, against the default scheme.
     *
     * @param input - Marking text.
     * @param options - Input and output formats and a cancellation signal.
     */
    normalize(
        input: string,
        options?: {
            inputFormat?: string;
            outputFormat?: string;
            signal?: AbortSignal;
        },
    ): MaybePromise<string>;

    /**
     * Compare two markings and report what changed between them.
     *
     * No `outputFormat`: the result is three assertion arrays and no string, so
     * there is nothing for an output format to select.
     *
     * @param a - The first marking.
     * @param b - The second marking, compared against the first.
     * @param schemeId - Scheme to compare in.
     * @param options - Formats and a cancellation signal.
     */
    diff(
        a: string,
        b: string,
        schemeId: string,
        options?: {
            inputFormat?: string;
            signal?: AbortSignal;
        },
    ): MaybePromise<DiffResult>;
    /**
     * Same as the overload above, against the default scheme.
     *
     * @param a - The first marking.
     * @param b - The second marking, compared against the first.
     * @param options - Formats and a cancellation signal.
     */
    diff(
        a: string,
        b: string,
        options?: {
            inputFormat?: string;
            signal?: AbortSignal;
        },
    ): MaybePromise<DiffResult>;

    /**
     * Report a render format's {@link FormatCoverage}: its emitted categories,
     * its capture-value-lossy categories, and whether it is `total`
     * (lossless).
     *
     * Optional on the base contract, and deliberately not a wire operation.
     * Coverage is a pure function of scheme structure, not server state: it
     * reads the format's `categoryOrder` and `view`, the scheme's category ids,
     * and each concept's `views` / `textInput`. A remote adapter already
     * fetches all four from the categories, formats, and concepts
     * sub-resources, so it can answer this itself rather than spending a round
     * trip on a question it holds the inputs for. The narrower
     * `LocalSchemeEngineAdapter` implements it fully, including layered schemes
     * (coverage is computed against the composed category set).
     *
     * @param formatId - Render-format id to inspect; defaults to the scheme's
     *   `defaultRenderFormat`.
     * @param schemeId - Scheme to inspect; defaults to the loaded default slot.
     */
    getFormatCoverage?(formatId?: string, schemeId?: string): FormatCoverage;

    /**
     * Get autocomplete suggestions: the options a picker may offer, and only
     * those. How the marking reads and whether it stands are what validate and
     * process answer; see {@link SuggestResult}.
     *
     * `input` is the marking as text or as facts, one or the other. Text that
     * is typed beside facts already chosen is what process answers, with the
     * categories to offer options for named in `suggestFor`.
     *
     * `includeGated` asks for the concepts a filter would otherwise hide
     * because their prerequisites are unmet: each comes back marked `gated`
     * with the `requires` ids that would unlock it, so a picker can show the
     * "add X first" row instead of an unexplained absence.
     *
     * @param input - Marking text, or the facts as assertions.
     * @param schemeId - Scheme to suggest from.
     * @param options - Formats, a filter, the surface, whether to include gated
     *   concepts, and a cancellation signal.
     */
    suggest(
        input: string | Assertion[],
        schemeId: string,
        options?: {
            /**
             * The format `input` is written in, when `input` is a string. For a
             * scheme that declares `render.surfaces`, the view it is read as,
             * or one of its forms, as the scheme document's `render.surfaces`
             * defines them. Refused when `input` is facts, which carry no
             * text.
             */
            inputFormat?: string;
            /**
             * The format any rendered preview is written in. For a scheme that
             * declares `render.surfaces`, an output as the scheme document's
             * `render.surfaces` defines it.
             */
            outputFormat?: string;
            filter?: string;
            /** The validation surface, by scheme scope id. */
            surface?: string;
            includeGated?: boolean;
            signal?: AbortSignal;
        },
    ): MaybePromise<SuggestResult>;
    /**
     * Same as the overload above, against the default scheme.
     *
     * @param input - Marking text, or the facts as assertions.
     * @param options - Formats, a filter, the surface, whether to include gated
     *   concepts, and a cancellation signal.
     */
    suggest(
        input: string | Assertion[],
        options?: {
            /**
             * The format `input` is written in, when `input` is a string. For a
             * scheme that declares `render.surfaces`, the view it is read as,
             * or one of its forms, as the scheme document's `render.surfaces`
             * defines them. Refused when `input` is facts, which carry no
             * text.
             */
            inputFormat?: string;
            /**
             * The format any rendered preview is written in. For a scheme that
             * declares `render.surfaces`, an output as the scheme document's
             * `render.surfaces` defines it.
             */
            outputFormat?: string;
            filter?: string;
            /** The validation surface, by scheme scope id. */
            surface?: string;
            includeGated?: boolean;
            signal?: AbortSignal;
        },
    ): MaybePromise<SuggestResult>;

    /**
     * Suggest for several categories at once against one committed assertion
     * set, keyed by category id.
     *
     * Each category is answered as if its own assertions were not yet chosen,
     * so a picker can offer the alternatives to the current selection in that
     * category rather than only what is still addable beside it. The adapter
     * owns that exclusion; the caller sends the full committed set once. A
     * local engine loops in process, a remote one spends a single round trip:
     * either way a form with a dozen fields stops fanning out a dozen calls per
     * edit. An author who is also processing the marking can have the same
     * answer from that process call by naming the categories in `suggestFor`.
     *
     * @param assertions - The committed assertions.
     * @param categoryIds - Ids of the categories to suggest for.
     * @param options - Output format, surface and a cancellation signal.
     */
    suggestForCategories(
        assertions: Assertion[],
        categoryIds: string[],
        options?: {
            // No `inputFormat`: this takes assertions, never text.
            outputFormat?: string;
            surface?: string;
            signal?: AbortSignal;
        },
    ): MaybePromise<SuggestResultsByCategory>;

    /**
     * Aggregate multiple markings.
     *
     * `valid` on the result describes the rollup, so `options.surface` names
     * the rollup's validation surface rather than any one contributor's:
     *
     * - Omitted, the rollup is a whole marking. This is the whole-document
     *   case: parts combine into a whole marking, and the whole-marking
     *   required set is asked of the combined result. A part that omits a
     *   whole-document category is not faulted for it; the rollup is faulted
     *   only when no contributor supplied it.
     * - Given a scheme scope id, the inputs are fragments of that one surface
     *   and the rollup is judged as that surface's fragment: exactly the
     *   required categories the surface owns are demanded.
     *
     * Given a whole in `options.context.partOf`, each input is read as a part
     * of that whole, the whole settled as `ProcessingContext.partOf`
     * describes, so an input that takes a value from the whole, such as a
     * list it stands for, contributes that value to the rollup. This is about
     * reading text: `aggregateAssertions` takes its inputs as facts and reads
     * none.
     *
     * @param inputs - Marking texts to roll up.
     * @param schemeId - Scheme to aggregate in.
     * @param options - Formats, context, surface and a cancellation signal.
     */
    aggregate(
        inputs: string[],
        schemeId: string,
        options?: {
            inputFormat?: string;
            outputFormat?: string;
            context?: ProcessingContext;
            surface?: string;
            signal?: AbortSignal;
        },
    ): MaybePromise<AggregateResult>;
    /**
     * Same as the overload above, against the default scheme.
     *
     * @param inputs - Marking texts to roll up.
     * @param options - Formats, context, surface and a cancellation signal.
     */
    aggregate(
        inputs: string[],
        options?: {
            inputFormat?: string;
            outputFormat?: string;
            context?: ProcessingContext;
            surface?: string;
            signal?: AbortSignal;
        },
    ): MaybePromise<AggregateResult>;

    /**
     * Aggregate already-parsed assertion sets. Sibling to {@link aggregate} for
     * callers that hold the structured form directly and shouldn't have to
     * round-trip through the scheme's parser to combine them.
     *
     * Skips the string-parse stage; the rest of the aggregate pipeline (context
     * inheritance, per-category rollup, post-merge inference, forbid
     * enforcement, render) runs identically to {@link aggregate}. For inputs
     * that parse cleanly through the scheme's default render format, both APIs
     * return equivalent results.
     *
     * Required on every adapter. The remote path carries `assertionSets` over
     * the `/v1/scheme/aggregate` wire body, so marking state travels end to end
     * as the structured assertion array; scope-only assertions and capture
     * values that no rendered string can carry survive. There is no lossy
     * string round-trip fallback.
     *
     * `options.surface` names the rollup's validation surface exactly as it
     * does on {@link SchemeEngineAdapter.aggregate}.
     *
     * @param assertionSets - One assertion set per marking to roll up.
     * @param schemeId - Scheme to aggregate in.
     * @param options - Output format, context, surface and a cancellation
     *   signal.
     */
    aggregateAssertions(
        assertionSets: Assertion[][],
        schemeId: string,
        options?: {
            // No `inputFormat`: this takes assertion sets, never text.
            outputFormat?: string;
            context?: ProcessingContext;
            surface?: string;
            signal?: AbortSignal;
        },
    ): MaybePromise<AggregateResult>;
    /**
     * Same as the overload above, against the default scheme.
     *
     * @param assertionSets - One assertion set per marking to roll up.
     * @param options - Output format, context, surface and a cancellation
     *   signal.
     */
    aggregateAssertions(
        assertionSets: Assertion[][],
        options?: {
            // No `inputFormat`: this takes assertion sets, never text.
            outputFormat?: string;
            context?: ProcessingContext;
            surface?: string;
            signal?: AbortSignal;
        },
    ): MaybePromise<AggregateResult>;

    /**
     * Apply a named label preset by id and return what validate answers for
     * the marking it stands for. The server holds the preset's `marking`
     * string and any expansion or inheritance rules; clients only ever see the
     * preset name.
     *
     * A preset is a stored marking, so there is nothing to correct and no fix
     * path to offer: the answer is the facts, the verdicts, the changes
     * settling made, the rendering and its assessment, the notices and the
     * color, which is what every caller that applies a preset reads.
     *
     * `options.outputFormat` is the output `rendered` is written in. Omitted, the
     * scheme's default output. For a scheme that declares `render.surfaces`,
     * an output as the scheme document's `render.surfaces` defines it.
     *
     * @param presetId - Id of the label preset.
     * @param schemeId - Scheme that declares the preset.
     * @param options - The output the preset's marking is rendered in.
     */
    applyPreset(
        presetId: string,
        schemeId: string,
        options?: { outputFormat?: string },
    ): MaybePromise<ValidateResult>;
    /**
     * Same as the overload above, against the default scheme.
     *
     * @param presetId - Id of the label preset.
     * @param options - The output the preset's marking is rendered in.
     */
    applyPreset(
        presetId: string,
        options?: { outputFormat?: string },
    ): MaybePromise<ValidateResult>;

    /**
     * Collect concept-attached notices for the given assertions. Results that
     * describe a marking, such as process, validate and aggregate, already
     * carry the same list on their `notices` field.
     *
     * @param assertions - Assertions whose concepts' notices to collect.
     * @param schemeId - Scheme to use. Omit it for the default scheme.
     */
    collectNotices(
        assertions: Assertion[],
        schemeId?: string,
    ): MaybePromise<
        Array<{
            /** Id of the concept that carries the notice. */
            conceptId: string;
            /** Display name of that concept. */
            conceptName: string;
            /** Notice category, such as `warning` or `handling`. */
            type: string;
            /** The notice text. */
            text: string;
            /** Whether the notice must be displayed. */
            required: boolean;
        }>
    >;

    /**
     * Scan document text for markings.
     *
     * The outcome names the markings found and how far the scan got, so a
     * caller can tell a clean document from one the scan abandoned.
     *
     * @param text - Document text to scan.
     * @param schemeId - Scheme whose markings to look for.
     * @param options - Input and output formats, a progress callback and a
     *   cancellation signal. Only a local adapter reports progress.
     */
    scan(
        text: string,
        schemeId: string,
        options?: ScanOptions,
    ): MaybePromise<ScanOutcome>;
    /**
     * Same as the overload above, against the default scheme.
     *
     * @param text - Document text to scan.
     * @param options - Input and output formats, a progress callback and a
     *   cancellation signal. Only a local adapter reports progress.
     */
    scan(text: string, options?: ScanOptions): MaybePromise<ScanOutcome>;

    /**
     * Describe a concept's usage: definition, guidance, and rules.
     *
     * A concept or category the scheme does not declare is refused as not
     * found, with the code `NOT_FOUND` (a 404 over the wire), never answered
     * with a description made up for it.
     *
     * @param conceptId - Id of the concept.
     * @param categoryId - Id of the category the concept is described in.
     * @param schemeId - Scheme that declares the concept.
     * @param options - The view to name the concept in: a key of its `views`.
     */
    describeConcept(
        conceptId: string,
        categoryId: string,
        schemeId: string,
        options?: { view?: string },
    ): MaybePromise<ConceptDescription>;
    /**
     * Same as the overload above, against the default scheme.
     *
     * @param conceptId - Id of the concept.
     * @param categoryId - Id of the category the concept is described in.
     * @param options - The view to name the concept in: a key of its `views`.
     */
    describeConcept(
        conceptId: string,
        categoryId: string,
        options?: { view?: string },
    ): MaybePromise<ConceptDescription>;

    /**
     * Text-search the loaded scheme's concepts.
     *
     * @param query - Search text.
     * @param schemeId - Scheme to use. Omit it for the default scheme.
     */
    filterConcepts(
        query: string,
        schemeId?: string,
    ): MaybePromise<FilterResult>;

    /**
     * Build the render-ready Handbook tree for a scheme: categories of resolved
     * concept views in declared order.
     *
     * @param schemeId - Scheme to use. Omit it for the default scheme.
     */
    buildSchemeView(schemeId?: string): MaybePromise<SchemeStructuralView>;

    /**
     * Compact id/label pairs for every category, for tool-use contexts.
     *
     * The flat wire surface serves this directly
     * (`GET /v1/scheme/{id}/list-categories-flat`); the context surface does
     * not, so an adapter bound to a context derives the pairs from the
     * structural view it already fetches. Same answer either way, and no route
     * was added for a projection of data the client holds.
     *
     * @param schemeId - Scheme to use. Omit it for the default scheme.
     */
    listCategoriesFlat(
        schemeId?: string,
    ): MaybePromise<
        Array<{
            /** Category id. */
            id: string;
            /** Category display label. */
            label: string;
        }>
    >;

    /**
     * Return concepts in a category as resolved `ConceptView` objects.
     *
     * When `options.nested` is true, walks the in-category parent chain and
     * returns each concept with its depth (0 = root, 1 = child, ...) so
     * consumers like the Handbook panel can render child concepts indented
     * beneath their parent.
     *
     * Required on every adapter: `implements SchemeEngineAdapter` will fail to
     * compile if either overload is missing.
     *
     * @param categoryId - Id of the category.
     * @param schemeId - Scheme to use. Omit it for the default scheme.
     */
    getConceptsInCategory(categoryId: string, schemeId?: string): ConceptView[];
    /**
     * The nested form: each concept with its depth under its in-category
     * parents.
     *
     * @param categoryId - Id of the category.
     * @param options - `{ nested: true }` selects the nested form.
     * @param schemeId - Scheme to use. Omit it for the default scheme.
     */
    getConceptsInCategory(
        categoryId: string,
        options: { nested: true },
        schemeId?: string,
    ): Array<{
        /** The concept, as a display view. */
        concept: ConceptView;
        /** Nesting depth: 0 for a root, 1 for its child, and so on. */
        depth: number;
    }>;

    /**
     * Return scheme identity and configuration metadata without loading
     * concepts or categories. Operates synchronously on the loaded scheme.
     *
     * @param schemeId - Scheme to inspect; defaults to the loaded default
     *   scheme.
     */
    getSchemeMeta(schemeId?: string): SchemeMetaView;

    /**
     * Return resolved category views for every category in the scheme.
     *
     * @param schemeId - Scheme to inspect; defaults to the loaded default
     *   scheme.
     */
    listCategories(schemeId?: string): CategoryView[];

    /**
     * Coverage diff: return the assertions in `candidates` that are not covered
     * by `parent`. For `hierarchyRoot` categories a parent concept whose rank
     * meets or exceeds a candidate's rank in the same category counts as
     * covering it, so a whole marking at the higher rank covers a part at a
     * lower one. Falls back to strict concept-id inclusion for non-hierarchical
     * categories. Always synchronous: operates on already-loaded assertions and
     * the loaded scheme.
     *
     * @param candidates - Assertions to check.
     * @param parent - Assertions of the marking expected to cover them.
     * @param schemeId - Scheme to use. Omit it for the default scheme.
     */
    uncoveredAssertions(
        candidates: Assertion[],
        parent: Assertion[],
        schemeId?: string,
    ): Assertion[];

    /**
     * Cover check for a list of child markings against one parent marking. The
     * engine aggregates the children into a rollup and compares the rollup to
     * the parent in one call. Returns a `CoverageReport` containing the
     * rendered rollup plus the verdict: whether the parent covers the rollup,
     * what it is missing, and what it carries in excess. UI layers can render
     * all of it directly without a separate aggregate() round-trip. Returns
     * MaybePromise because remote clients must reach the server for parsing /
     * aggregation.
     *
     * @param children - Child markings, as text.
     * @param parent - The parent marking, as text.
     * @param schemeId - Scheme to check coverage in.
     * @param options - Input and output formats and a cancellation signal.
     */
    checkCoverage(
        children: string[],
        parent: string,
        schemeId: string,
        options?: {
            inputFormat?: string;
            outputFormat?: string;
            signal?: AbortSignal;
        },
    ): MaybePromise<CoverageReport>;
    /**
     * Same as the overload above, against the default scheme.
     *
     * @param children - Child markings, as text.
     * @param parent - The parent marking, as text.
     * @param options - Input and output formats and a cancellation signal.
     */
    checkCoverage(
        children: string[],
        parent: string,
        options?: {
            inputFormat?: string;
            outputFormat?: string;
            signal?: AbortSignal;
        },
    ): MaybePromise<CoverageReport>;

    /** Release resources (e.g. heartbeat timers). No-op for local engines. */
    destroy(): void;
}

/**
 * A `SchemeEngineAdapter` implemented by the in-process engine.
 *
 * For schemes backed by finite in-memory concept sets, all methods complete
 * synchronously. For schemes backed by a queryable-only source
 * (SourceCapabilities.queryableOnly: true), the parse pipeline goes async
 * through the source: process, validate, suggest, aggregate, and
 * aggregateAssertions return a resolved Promise at runtime. Callers should use
 * `await engine.process(...)` to handle both cases correctly.
 *
 * The method signatures declare synchronous return types; the implementation
 * returns MaybePromise<T>, so `await` handles both paths.
 */
export interface LocalSchemeEngineAdapter extends SchemeEngineAdapter {
    loadScheme(schemeId: string): void;
    loadLayer(layerId: string): void;
    unloadScheme(schemeId: string): void;
    unloadLayer(layerId: string): void;
    getScheme(schemeId?: string): SchemePublicView;
    validate(
        input: string | Assertion[],
        schemeId: string,
        options?: {
            /**
             * The format `input` is written in, when it is text. For a scheme
             * that declares `render.surfaces`, the view it is read as, or one
             * of its forms, as the scheme document's `render.surfaces` defines
             * them. Omitted, recognition works it out and reports what the text
             * was read as in `recognition.inputFormat`. Refused when `input` is
             * facts, which carry no text.
             */
            inputFormat?: string;
            /**
             * The output `rendered` is written in. For a scheme that declares
             * `render.surfaces`, an output as the scheme document's
             * `render.surfaces` defines it. Omitted, the scheme's default
             * format, or with `render.surfaces`, each written surface's
             * default for the marking's role, by the rule `render.surfaces`
             * states for a request that names no output.
             */
            outputFormat?: string;
            context?: ProcessingContext;
            /**
             * The validation surface `input` is, by scheme scope id. Omitted,
             * the input is a whole marking.
             */
            surface?: string;
            /**
             * Part markings the whole must cover. The whole is judged as
             * covering them: a part it does not cover is an error, and so is
             * a part that does not read as a marking. Each entry is a marking
             * in one of the scheme's part formats, or any format the scheme
             * reads. Empty or absent, the whole stands alone.
             */
            parts?: string[];
            signal?: AbortSignal;
        },
    ): ValidateResult;
    validate(
        input: string | Assertion[],
        options?: {
            /**
             * The format `input` is written in, when it is text. For a scheme
             * that declares `render.surfaces`, the view it is read as, or one
             * of its forms, as the scheme document's `render.surfaces` defines
             * them. Omitted, recognition works it out and reports what the text
             * was read as in `recognition.inputFormat`. Refused when `input` is
             * facts, which carry no text.
             */
            inputFormat?: string;
            /**
             * The output `rendered` is written in. For a scheme that declares
             * `render.surfaces`, an output as the scheme document's
             * `render.surfaces` defines it. Omitted, the scheme's default
             * format, or with `render.surfaces`, each written surface's
             * default for the marking's role, by the rule `render.surfaces`
             * states for a request that names no output.
             */
            outputFormat?: string;
            context?: ProcessingContext;
            /**
             * The validation surface `input` is, by scheme scope id. Omitted,
             * the input is a whole marking.
             */
            surface?: string;
            /**
             * Part markings the whole must cover. The whole is judged as
             * covering them: a part it does not cover is an error, and so is
             * a part that does not read as a marking. Each entry is a marking
             * in one of the scheme's part formats, or any format the scheme
             * reads. Empty or absent, the whole stands alone.
             */
            parts?: string[];
            signal?: AbortSignal;
        },
    ): ValidateResult;
    process(
        input: string | Assertion[],
        schemeId: string,
        options?: {
            /**
             * The format `input` is written in. For a scheme that declares
             * `render.surfaces`, the view it is read as, or one of its forms,
             * as the scheme document's `render.surfaces` defines them. Omitted,
             * recognition works it out and reports what the text was read as in
             * `recognition.inputFormat`.
             */
            inputFormat?: string;
            /**
             * The output `rendered` is written in. For a scheme that declares
             * `render.surfaces`, an output as the scheme document's
             * `render.surfaces` defines it. Omitted, the scheme's default
             * format, or with `render.surfaces`, each written surface's
             * default for the marking's role, by the rule `render.surfaces`
             * states for a request that names no output.
             */
            outputFormat?: string;
            /**
             * The facts already chosen. Sent with marking text, they are
             * settled together with what the text states, as one marking.
             */
            assertions?: Assertion[];
            context?: ProcessingContext;
            /**
             * The validation surface `input` is, by scheme scope id. Omitted,
             * the input is a whole marking.
             */
            surface?: string;
            /**
             * Part markings the whole must cover. The whole is judged as
             * covering them: a part it does not cover is an error, and so is
             * a part that does not read as a marking. Every rank floor is
             * worked out against the whole and these parts together, so a
             * raise never lands below what a part needs, and every proposed
             * fix is proven with them, as `ProcessResult.proposedFixes`
             * states. Each entry is a marking in one of the scheme's part
             * formats, or any format the scheme reads. Empty or absent, the
             * whole stands alone.
             */
            parts?: string[];
            /**
             * The outputs to write into `renders`, each an output address
             * spelled exactly as a key of `renders` is. Omitted or empty,
             * `renders` is empty. An address the scheme does not declare is
             * refused.
             */
            outputs?: string[];
            /**
             * Category ids to answer picker options for, returned in
             * `suggestionsFor`. Omitted, nothing is suggested and the field
             * is absent. An id the scheme does not declare is refused.
             */
            suggestFor?: string[];
            signal?: AbortSignal;
        },
    ): ProcessResult;
    process(
        input: string | Assertion[],
        options?: {
            /**
             * The format `input` is written in. For a scheme that declares
             * `render.surfaces`, the view it is read as, or one of its forms,
             * as the scheme document's `render.surfaces` defines them. Omitted,
             * recognition works it out and reports what the text was read as in
             * `recognition.inputFormat`.
             */
            inputFormat?: string;
            /**
             * The output `rendered` is written in. For a scheme that declares
             * `render.surfaces`, an output as the scheme document's
             * `render.surfaces` defines it. Omitted, the scheme's default
             * format, or with `render.surfaces`, each written surface's
             * default for the marking's role, by the rule `render.surfaces`
             * states for a request that names no output.
             */
            outputFormat?: string;
            /**
             * The facts already chosen. Sent with marking text, they are
             * settled together with what the text states, as one marking.
             */
            assertions?: Assertion[];
            context?: ProcessingContext;
            /**
             * The validation surface `input` is, by scheme scope id. Omitted,
             * the input is a whole marking.
             */
            surface?: string;
            /**
             * Part markings the whole must cover. The whole is judged as
             * covering them: a part it does not cover is an error, and so is
             * a part that does not read as a marking. Every rank floor is
             * worked out against the whole and these parts together, so a
             * raise never lands below what a part needs, and every proposed
             * fix is proven with them, as `ProcessResult.proposedFixes`
             * states. Each entry is a marking in one of the scheme's part
             * formats, or any format the scheme reads. Empty or absent, the
             * whole stands alone.
             */
            parts?: string[];
            /**
             * The outputs to write into `renders`, each an output address
             * spelled exactly as a key of `renders` is. Omitted or empty,
             * `renders` is empty. An address the scheme does not declare is
             * refused.
             */
            outputs?: string[];
            /**
             * Category ids to answer picker options for, returned in
             * `suggestionsFor`. Omitted, nothing is suggested and the field
             * is absent. An id the scheme does not declare is refused.
             */
            suggestFor?: string[];
            signal?: AbortSignal;
        },
    ): ProcessResult;
    explain(
        input: string | Assertion[],
        schemeId: string,
        options?: {
            /**
             * The format `input` is written in. For a scheme that declares
             * `render.surfaces`, the view it is read as, or one of its forms,
             * as the scheme document's `render.surfaces` defines them. Omitted,
             * recognition works it out and reports what the text was read as in
             * `recognition.inputFormat`.
             */
            inputFormat?: string;
            /**
             * The output `rendered` is written in. For a scheme that declares
             * `render.surfaces`, an output as the scheme document's
             * `render.surfaces` defines it. Omitted, the scheme's default
             * format, or with `render.surfaces`, each written surface's
             * default for the marking's role, by the rule `render.surfaces`
             * states for a request that names no output.
             */
            outputFormat?: string;
            /**
             * The facts already chosen. Sent with marking text, they are
             * settled together with what the text states, as one marking.
             */
            assertions?: Assertion[];
            context?: ProcessingContext;
            /**
             * The validation surface `input` is, by scheme scope id. Omitted,
             * the input is a whole marking.
             */
            surface?: string;
            /**
             * Part markings the whole must cover. The whole is judged as
             * covering them: a part it does not cover is an error, and so is
             * a part that does not read as a marking. Each entry is a marking
             * in one of the scheme's part formats, or any format the scheme
             * reads. Empty or absent, the whole stands alone.
             */
            parts?: string[];
            signal?: AbortSignal;
        },
    ): ExplanationTrace;
    explain(
        input: string | Assertion[],
        options?: {
            /**
             * The format `input` is written in. For a scheme that declares
             * `render.surfaces`, the view it is read as, or one of its forms,
             * as the scheme document's `render.surfaces` defines them. Omitted,
             * recognition works it out and reports what the text was read as in
             * `recognition.inputFormat`.
             */
            inputFormat?: string;
            /**
             * The output `rendered` is written in. For a scheme that declares
             * `render.surfaces`, an output as the scheme document's
             * `render.surfaces` defines it. Omitted, the scheme's default
             * format, or with `render.surfaces`, each written surface's
             * default for the marking's role, by the rule `render.surfaces`
             * states for a request that names no output.
             */
            outputFormat?: string;
            /**
             * The facts already chosen. Sent with marking text, they are
             * settled together with what the text states, as one marking.
             */
            assertions?: Assertion[];
            context?: ProcessingContext;
            /**
             * The validation surface `input` is, by scheme scope id. Omitted,
             * the input is a whole marking.
             */
            surface?: string;
            /**
             * Part markings the whole must cover. The whole is judged as
             * covering them: a part it does not cover is an error, and so is
             * a part that does not read as a marking. Each entry is a marking
             * in one of the scheme's part formats, or any format the scheme
             * reads. Empty or absent, the whole stands alone.
             */
            parts?: string[];
            signal?: AbortSignal;
        },
    ): ExplanationTrace;
    render(
        assertions: Assertion[],
        format?: string,
        schemeId?: string,
        options?: RenderOptions,
    ): RenderResult;
    getFormatCoverage(formatId?: string, schemeId?: string): FormatCoverage;
    suggest(
        input: string | Assertion[],
        schemeId: string,
        options?: {
            /**
             * The format `input` is written in, when `input` is a string. For a
             * scheme that declares `render.surfaces`, the view it is read as,
             * or one of its forms, as the scheme document's `render.surfaces`
             * defines them. Refused when `input` is facts, which carry no
             * text.
             */
            inputFormat?: string;
            /**
             * The format any rendered preview is written in. For a scheme that
             * declares `render.surfaces`, an output as the scheme document's
             * `render.surfaces` defines it.
             */
            outputFormat?: string;
            filter?: string;
            /** The validation surface, by scheme scope id. */
            surface?: string;
            includeGated?: boolean;
            signal?: AbortSignal;
        },
    ): SuggestResult;
    suggest(
        input: string | Assertion[],
        options?: {
            /**
             * The format `input` is written in, when `input` is a string. For a
             * scheme that declares `render.surfaces`, the view it is read as,
             * or one of its forms, as the scheme document's `render.surfaces`
             * defines them. Refused when `input` is facts, which carry no
             * text.
             */
            inputFormat?: string;
            /**
             * The format any rendered preview is written in. For a scheme that
             * declares `render.surfaces`, an output as the scheme document's
             * `render.surfaces` defines it.
             */
            outputFormat?: string;
            filter?: string;
            /** The validation surface, by scheme scope id. */
            surface?: string;
            includeGated?: boolean;
            signal?: AbortSignal;
        },
    ): SuggestResult;
    suggestForCategories(
        assertions: Assertion[],
        categoryIds: string[],
        options?: {
            outputFormat?: string;
            surface?: string;
            signal?: AbortSignal;
        },
    ): SuggestResultsByCategory;
    aggregate(
        inputs: string[],
        schemeId: string,
        options?: {
            inputFormat?: string;
            outputFormat?: string;
            context?: ProcessingContext;
            surface?: string;
            signal?: AbortSignal;
        },
    ): AggregateResult;
    aggregate(
        inputs: string[],
        options?: {
            inputFormat?: string;
            outputFormat?: string;
            context?: ProcessingContext;
            surface?: string;
            signal?: AbortSignal;
        },
    ): AggregateResult;
    aggregateAssertions(
        assertionSets: Assertion[][],
        schemeId: string,
        options?: {
            /** Refused: assertion sets carry no text to read. */
            inputFormat?: string;
            outputFormat?: string;
            context?: ProcessingContext;
            surface?: string;
            signal?: AbortSignal;
        },
    ): AggregateResult;
    aggregateAssertions(
        assertionSets: Assertion[][],
        options?: {
            /** Refused: assertion sets carry no text to read. */
            inputFormat?: string;
            outputFormat?: string;
            context?: ProcessingContext;
            surface?: string;
            signal?: AbortSignal;
        },
    ): AggregateResult;
    applyPreset(
        presetId: string,
        schemeId: string,
        options?: { outputFormat?: string },
    ): ValidateResult;
    applyPreset(presetId: string, options?: { outputFormat?: string }): ValidateResult;
    collectNotices(
        assertions: Assertion[],
        schemeId?: string,
    ): Array<{
        /** Id of the concept that carries the notice. */
        conceptId: string;
        /** Display name of that concept. */
        conceptName: string;
        /** Notice category, such as `warning` or `handling`. */
        type: string;
        /** The notice text. */
        text: string;
        /** Whether the notice must be displayed. */
        required: boolean;
    }>;
    scan(text: string, schemeId: string, options?: ScanOptions): ScanOutcome;
    scan(text: string, options?: ScanOptions): ScanOutcome;
    describeConcept(
        conceptId: string,
        categoryId: string,
        schemeId: string,
        options?: { view?: string },
    ): ConceptDescription;
    describeConcept(
        conceptId: string,
        categoryId: string,
        options?: { view?: string },
    ): ConceptDescription;
    getConceptsInCategory(categoryId: string, schemeId?: string): ConceptView[];
    /**
     * The nested form: each concept with its depth under its in-category
     * parents.
     *
     * @param categoryId - Id of the category.
     * @param options - `{ nested: true }` selects the nested form.
     * @param schemeId - Scheme to use. Omit it for the default scheme.
     */
    getConceptsInCategory(
        categoryId: string,
        options: { nested: true },
        schemeId?: string,
    ): Array<{
        /** The concept, as a display view. */
        concept: ConceptView;
        /** Nesting depth: 0 for a root, 1 for its child, and so on. */
        depth: number;
    }>;
    getSchemeMeta(schemeId?: string): SchemeMetaView;
    listCategories(schemeId?: string): CategoryView[];
    checkCoverage(
        children: string[],
        parent: string,
        schemeId: string,
        options?: {
            inputFormat?: string;
            outputFormat?: string;
            signal?: AbortSignal;
        },
    ): CoverageReport;
    checkCoverage(
        children: string[],
        parent: string,
        options?: {
            inputFormat?: string;
            outputFormat?: string;
            signal?: AbortSignal;
        },
    ): CoverageReport;
    normalize(
        input: string,
        schemeId: string,
        options?: {
            inputFormat?: string;
            outputFormat?: string;
            signal?: AbortSignal;
        },
    ): string;
    normalize(
        input: string,
        options?: {
            inputFormat?: string;
            outputFormat?: string;
            signal?: AbortSignal;
        },
    ): string;
    diff(
        a: string,
        b: string,
        schemeId: string,
        options?: {
            inputFormat?: string;
            outputFormat?: string;
            signal?: AbortSignal;
        },
    ): DiffResult;
    diff(
        a: string,
        b: string,
        options?: {
            inputFormat?: string;
            outputFormat?: string;
            signal?: AbortSignal;
        },
    ): DiffResult;
    listCategoriesFlat(schemeId?: string): Array<{
        /** Category id. */
        id: string;
        /** Category display label. */
        label: string;
    }>;
    buildSchemeView(schemeId?: string): SchemeStructuralView;
    filterConcepts(query: string, schemeId?: string): FilterResult;
    /**
     * Populated by the caller when a guide engine is available alongside this
     * scheme engine. Guidebook-style components call this fallback when no
     * explicit guide views are supplied.
     */
    buildGuideViews?: () => GuideStructuralView[];
}

/**
 * A `SchemeEngineAdapter` whose operations complete asynchronously.
 *
 * Implemented by the HTTP client. All methods that return `MaybePromise<T>` in
 * the base interface are narrowed to `Promise<T>`, making the async nature
 * explicit at the call site. Use this type when writing code that must work
 * against a remote server (e.g. browser integrations, server-side proxy
 * layers).
 */
export interface RemoteSchemeEngineAdapter extends SchemeEngineAdapter {
    loadScheme(schemeId: string): Promise<void>;
    loadLayer(layerId: string): Promise<void>;
    unloadScheme(schemeId: string): Promise<void>;
    unloadLayer(layerId: string): Promise<void>;
    process(
        input: string | Assertion[],
        schemeId: string,
        options?: {
            /**
             * The format `input` is written in. For a scheme that declares
             * `render.surfaces`, the view it is read as, or one of its forms,
             * as the scheme document's `render.surfaces` defines them. Omitted,
             * recognition works it out and reports what the text was read as in
             * `recognition.inputFormat`.
             */
            inputFormat?: string;
            /**
             * The output `rendered` is written in. For a scheme that declares
             * `render.surfaces`, an output as the scheme document's
             * `render.surfaces` defines it. Omitted, the scheme's default
             * format, or with `render.surfaces`, each written surface's
             * default for the marking's role, by the rule `render.surfaces`
             * states for a request that names no output.
             */
            outputFormat?: string;
            /**
             * The facts already chosen. Sent with marking text, they are
             * settled together with what the text states, as one marking.
             */
            assertions?: Assertion[];
            context?: ProcessingContext;
            /**
             * The validation surface `input` is, by scheme scope id. Omitted,
             * the input is a whole marking.
             */
            surface?: string;
            /**
             * Part markings the whole must cover. The whole is judged as
             * covering them: a part it does not cover is an error, and so is
             * a part that does not read as a marking. Every rank floor is
             * worked out against the whole and these parts together, so a
             * raise never lands below what a part needs, and every proposed
             * fix is proven with them, as `ProcessResult.proposedFixes`
             * states. Each entry is a marking in one of the scheme's part
             * formats, or any format the scheme reads. Empty or absent, the
             * whole stands alone.
             */
            parts?: string[];
            /**
             * The outputs to write into `renders`, each an output address
             * spelled exactly as a key of `renders` is. Omitted or empty,
             * `renders` is empty. An address the scheme does not declare is
             * refused.
             */
            outputs?: string[];
            /**
             * Category ids to answer picker options for, returned in
             * `suggestionsFor`. Omitted, nothing is suggested and the field
             * is absent. An id the scheme does not declare is refused.
             */
            suggestFor?: string[];
            signal?: AbortSignal;
        },
    ): Promise<ProcessResult>;
    process(
        input: string | Assertion[],
        options?: {
            /**
             * The format `input` is written in. For a scheme that declares
             * `render.surfaces`, the view it is read as, or one of its forms,
             * as the scheme document's `render.surfaces` defines them. Omitted,
             * recognition works it out and reports what the text was read as in
             * `recognition.inputFormat`.
             */
            inputFormat?: string;
            /**
             * The output `rendered` is written in. For a scheme that declares
             * `render.surfaces`, an output as the scheme document's
             * `render.surfaces` defines it. Omitted, the scheme's default
             * format, or with `render.surfaces`, each written surface's
             * default for the marking's role, by the rule `render.surfaces`
             * states for a request that names no output.
             */
            outputFormat?: string;
            /**
             * The facts already chosen. Sent with marking text, they are
             * settled together with what the text states, as one marking.
             */
            assertions?: Assertion[];
            context?: ProcessingContext;
            /**
             * The validation surface `input` is, by scheme scope id. Omitted,
             * the input is a whole marking.
             */
            surface?: string;
            /**
             * Part markings the whole must cover. The whole is judged as
             * covering them: a part it does not cover is an error, and so is
             * a part that does not read as a marking. Every rank floor is
             * worked out against the whole and these parts together, so a
             * raise never lands below what a part needs, and every proposed
             * fix is proven with them, as `ProcessResult.proposedFixes`
             * states. Each entry is a marking in one of the scheme's part
             * formats, or any format the scheme reads. Empty or absent, the
             * whole stands alone.
             */
            parts?: string[];
            /**
             * The outputs to write into `renders`, each an output address
             * spelled exactly as a key of `renders` is. Omitted or empty,
             * `renders` is empty. An address the scheme does not declare is
             * refused.
             */
            outputs?: string[];
            /**
             * Category ids to answer picker options for, returned in
             * `suggestionsFor`. Omitted, nothing is suggested and the field
             * is absent. An id the scheme does not declare is refused.
             */
            suggestFor?: string[];
            signal?: AbortSignal;
        },
    ): Promise<ProcessResult>;
    explain(
        input: string | Assertion[],
        schemeId: string,
        options?: {
            /**
             * The format `input` is written in. For a scheme that declares
             * `render.surfaces`, the view it is read as, or one of its forms,
             * as the scheme document's `render.surfaces` defines them. Omitted,
             * recognition works it out and reports what the text was read as in
             * `recognition.inputFormat`.
             */
            inputFormat?: string;
            /**
             * The output `rendered` is written in. For a scheme that declares
             * `render.surfaces`, an output as the scheme document's
             * `render.surfaces` defines it. Omitted, the scheme's default
             * format, or with `render.surfaces`, each written surface's
             * default for the marking's role, by the rule `render.surfaces`
             * states for a request that names no output.
             */
            outputFormat?: string;
            /**
             * The facts already chosen. Sent with marking text, they are
             * settled together with what the text states, as one marking.
             */
            assertions?: Assertion[];
            context?: ProcessingContext;
            /**
             * The validation surface `input` is, by scheme scope id. Omitted,
             * the input is a whole marking.
             */
            surface?: string;
            /**
             * Part markings the whole must cover. The whole is judged as
             * covering them: a part it does not cover is an error, and so is
             * a part that does not read as a marking. Each entry is a marking
             * in one of the scheme's part formats, or any format the scheme
             * reads. Empty or absent, the whole stands alone.
             */
            parts?: string[];
            signal?: AbortSignal;
        },
    ): Promise<ExplanationTrace>;
    explain(
        input: string | Assertion[],
        options?: {
            /**
             * The format `input` is written in. For a scheme that declares
             * `render.surfaces`, the view it is read as, or one of its forms,
             * as the scheme document's `render.surfaces` defines them. Omitted,
             * recognition works it out and reports what the text was read as in
             * `recognition.inputFormat`.
             */
            inputFormat?: string;
            /**
             * The output `rendered` is written in. For a scheme that declares
             * `render.surfaces`, an output as the scheme document's
             * `render.surfaces` defines it. Omitted, the scheme's default
             * format, or with `render.surfaces`, each written surface's
             * default for the marking's role, by the rule `render.surfaces`
             * states for a request that names no output.
             */
            outputFormat?: string;
            /**
             * The facts already chosen. Sent with marking text, they are
             * settled together with what the text states, as one marking.
             */
            assertions?: Assertion[];
            context?: ProcessingContext;
            /**
             * The validation surface `input` is, by scheme scope id. Omitted,
             * the input is a whole marking.
             */
            surface?: string;
            /**
             * Part markings the whole must cover. The whole is judged as
             * covering them: a part it does not cover is an error, and so is
             * a part that does not read as a marking. Each entry is a marking
             * in one of the scheme's part formats, or any format the scheme
             * reads. Empty or absent, the whole stands alone.
             */
            parts?: string[];
            signal?: AbortSignal;
        },
    ): Promise<ExplanationTrace>;
    render(
        assertions: Assertion[],
        format?: string,
        schemeId?: string,
        options?: RenderOptions,
    ): Promise<RenderResult>;
    validate(
        input: string | Assertion[],
        schemeId: string,
        options?: {
            /**
             * The format `input` is written in, when it is text. For a scheme
             * that declares `render.surfaces`, the view it is read as, or one
             * of its forms, as the scheme document's `render.surfaces` defines
             * them. Omitted, recognition works it out and reports what the text
             * was read as in `recognition.inputFormat`. Refused when `input` is
             * facts, which carry no text.
             */
            inputFormat?: string;
            /**
             * The output `rendered` is written in. For a scheme that declares
             * `render.surfaces`, an output as the scheme document's
             * `render.surfaces` defines it. Omitted, the scheme's default
             * format, or with `render.surfaces`, each written surface's
             * default for the marking's role, by the rule `render.surfaces`
             * states for a request that names no output.
             */
            outputFormat?: string;
            context?: ProcessingContext;
            /**
             * The validation surface `input` is, by scheme scope id. Omitted,
             * the input is a whole marking.
             */
            surface?: string;
            /**
             * Part markings the whole must cover. The whole is judged as
             * covering them: a part it does not cover is an error, and so is
             * a part that does not read as a marking. Each entry is a marking
             * in one of the scheme's part formats, or any format the scheme
             * reads. Empty or absent, the whole stands alone.
             */
            parts?: string[];
            signal?: AbortSignal;
        },
    ): Promise<ValidateResult>;
    validate(
        input: string | Assertion[],
        options?: {
            /**
             * The format `input` is written in, when it is text. For a scheme
             * that declares `render.surfaces`, the view it is read as, or one
             * of its forms, as the scheme document's `render.surfaces` defines
             * them. Omitted, recognition works it out and reports what the text
             * was read as in `recognition.inputFormat`. Refused when `input` is
             * facts, which carry no text.
             */
            inputFormat?: string;
            /**
             * The output `rendered` is written in. For a scheme that declares
             * `render.surfaces`, an output as the scheme document's
             * `render.surfaces` defines it. Omitted, the scheme's default
             * format, or with `render.surfaces`, each written surface's
             * default for the marking's role, by the rule `render.surfaces`
             * states for a request that names no output.
             */
            outputFormat?: string;
            context?: ProcessingContext;
            /**
             * The validation surface `input` is, by scheme scope id. Omitted,
             * the input is a whole marking.
             */
            surface?: string;
            /**
             * Part markings the whole must cover. The whole is judged as
             * covering them: a part it does not cover is an error, and so is
             * a part that does not read as a marking. Each entry is a marking
             * in one of the scheme's part formats, or any format the scheme
             * reads. Empty or absent, the whole stands alone.
             */
            parts?: string[];
            signal?: AbortSignal;
        },
    ): Promise<ValidateResult>;
    suggest(
        input: string | Assertion[],
        schemeId: string,
        options?: {
            /**
             * The format `input` is written in, when `input` is a string. For a
             * scheme that declares `render.surfaces`, the view it is read as,
             * or one of its forms, as the scheme document's `render.surfaces`
             * defines them. Refused when `input` is facts, which carry no
             * text.
             */
            inputFormat?: string;
            /**
             * The format any rendered preview is written in. For a scheme that
             * declares `render.surfaces`, an output as the scheme document's
             * `render.surfaces` defines it.
             */
            outputFormat?: string;
            filter?: string;
            /** The validation surface, by scheme scope id. */
            surface?: string;
            includeGated?: boolean;
            signal?: AbortSignal;
        },
    ): Promise<SuggestResult>;
    suggest(
        input: string | Assertion[],
        options?: {
            /**
             * The format `input` is written in, when `input` is a string. For a
             * scheme that declares `render.surfaces`, the view it is read as,
             * or one of its forms, as the scheme document's `render.surfaces`
             * defines them. Refused when `input` is facts, which carry no
             * text.
             */
            inputFormat?: string;
            /**
             * The format any rendered preview is written in. For a scheme that
             * declares `render.surfaces`, an output as the scheme document's
             * `render.surfaces` defines it.
             */
            outputFormat?: string;
            filter?: string;
            /** The validation surface, by scheme scope id. */
            surface?: string;
            includeGated?: boolean;
            signal?: AbortSignal;
        },
    ): Promise<SuggestResult>;
    suggestForCategories(
        assertions: Assertion[],
        categoryIds: string[],
        options?: {
            outputFormat?: string;
            surface?: string;
            signal?: AbortSignal;
        },
    ): Promise<SuggestResultsByCategory>;
    aggregate(
        inputs: string[],
        schemeId: string,
        options?: {
            inputFormat?: string;
            outputFormat?: string;
            context?: ProcessingContext;
            surface?: string;
            signal?: AbortSignal;
        },
    ): Promise<AggregateResult>;
    aggregate(
        inputs: string[],
        options?: {
            inputFormat?: string;
            outputFormat?: string;
            context?: ProcessingContext;
            surface?: string;
            signal?: AbortSignal;
        },
    ): Promise<AggregateResult>;
    aggregateAssertions(
        assertionSets: Assertion[][],
        schemeId: string,
        options?: {
            /** Refused: assertion sets carry no text to read. */
            inputFormat?: string;
            outputFormat?: string;
            context?: ProcessingContext;
            surface?: string;
            signal?: AbortSignal;
        },
    ): Promise<AggregateResult>;
    aggregateAssertions(
        assertionSets: Assertion[][],
        options?: {
            /** Refused: assertion sets carry no text to read. */
            inputFormat?: string;
            outputFormat?: string;
            context?: ProcessingContext;
            surface?: string;
            signal?: AbortSignal;
        },
    ): Promise<AggregateResult>;
    applyPreset(
        presetId: string,
        schemeId: string,
        options?: { outputFormat?: string },
    ): Promise<ValidateResult>;
    applyPreset(
        presetId: string,
        options?: { outputFormat?: string },
    ): Promise<ValidateResult>;
    collectNotices(
        assertions: Assertion[],
        schemeId?: string,
    ): Promise<
        Array<{
            /** Id of the concept that carries the notice. */
            conceptId: string;
            /** Display name of that concept. */
            conceptName: string;
            /** Notice category, such as `warning` or `handling`. */
            type: string;
            /** The notice text. */
            text: string;
            /** Whether the notice must be displayed. */
            required: boolean;
        }>
    >;
    scan(
        text: string,
        schemeId: string,
        options?: ScanOptions,
    ): Promise<ScanOutcome>;
    scan(text: string, options?: ScanOptions): Promise<ScanOutcome>;
    describeConcept(
        conceptId: string,
        categoryId: string,
        schemeId: string,
        options?: { view?: string },
    ): Promise<ConceptDescription>;
    describeConcept(
        conceptId: string,
        categoryId: string,
        options?: { view?: string },
    ): Promise<ConceptDescription>;
    checkCoverage(
        children: string[],
        parent: string,
        schemeId: string,
        options?: {
            inputFormat?: string;
            outputFormat?: string;
            signal?: AbortSignal;
        },
    ): Promise<CoverageReport>;
    checkCoverage(
        children: string[],
        parent: string,
        options?: {
            inputFormat?: string;
            outputFormat?: string;
            signal?: AbortSignal;
        },
    ): Promise<CoverageReport>;
    normalize(
        input: string,
        schemeId: string,
        options?: {
            inputFormat?: string;
            outputFormat?: string;
            signal?: AbortSignal;
        },
    ): Promise<string>;
    normalize(
        input: string,
        options?: {
            inputFormat?: string;
            outputFormat?: string;
            signal?: AbortSignal;
        },
    ): Promise<string>;
    diff(
        a: string,
        b: string,
        schemeId: string,
        options?: {
            inputFormat?: string;
            outputFormat?: string;
            signal?: AbortSignal;
        },
    ): Promise<DiffResult>;
    diff(
        a: string,
        b: string,
        options?: {
            inputFormat?: string;
            outputFormat?: string;
            signal?: AbortSignal;
        },
    ): Promise<DiffResult>;
    filterConcepts(query: string, schemeId?: string): Promise<FilterResult>;
    buildSchemeView(schemeId?: string): Promise<SchemeStructuralView>;
    listCategoriesFlat(
        schemeId?: string,
    ): Promise<
        Array<{
            /** Category id. */
            id: string;
            /** Category display label. */
            label: string;
        }>
    >;
}

/**
 * What one scheme is to the Context that holds it.
 *
 * A scheme can be more than one of these at once. The common crosswalk carries
 * the Context's own marking scheme as its source, so that scheme is `primary`
 * and `crosswalk-source` together. `additional` is for a scheme a composition
 * loaded without naming it as either, and it is the only entry that says
 * nothing beyond "this Context holds it".
 */
export type ContextSchemeRole =
    | 'primary'
    | 'crosswalk-source'
    | 'crosswalk-target'
    | 'additional';

/**
 * One scheme a Context holds, and the selector that addresses it.
 *
 * Read it as a sentence: this Context holds a scheme you select with
 * `selector`, it is `id` at `version`, and it plays these `roles`.
 *
 * `selector` is the whole point. A Context keys its schemes locally, and an
 * operation that addresses one takes that key, so a caller that cannot
 * enumerate the keys cannot reach anything but the primary. On the REST
 * surface the same value is what `?scheme=` takes.
 */
export interface ContextSchemeDescriptor {
    /** Context-local key that selects this scheme. */
    selector: string;
    /** Scheme id, from the scheme document itself. */
    id: string;
    /** Scheme version, from the scheme document itself. */
    version: string;
    /** What this scheme is to the Context. Never empty. */
    roles: ContextSchemeRole[];
}

/**
 * Synchronous presence facts for optional artifact families in a resolved
 * Context composition.
 *
 * Remote adapters populate this from the Context description they cache while
 * connecting, so presentation code can distinguish an absent artifact from a
 * present artifact whose inventory happens to be empty without probing an
 * artifact route. The property is optional for adapters built against an older
 * contract; callers may fall back to the optional family surfaces in that case.
 */
export interface ContextCompositionPresence {
    /** Whether the composition declares one or more guides. */
    readonly guides: boolean;
    /** Whether the composition declares an access policy, even with zero rules. */
    readonly access: boolean;
}

/**
 * The marking surface exposed by a resolved Context.
 *
 * Local Contexts may expose the full in-process adapter because their
 * composition is already loaded. Remote Contexts expose only operations that
 * run against the Context chosen at client construction; they do not expose
 * scheme-addressed lifecycle or operation overloads.
 */
export type ContextSchemeEngineAdapter =
    | LocalSchemeEngineAdapter
    | RemoteContextSchemeEngineAdapter;

/**
 * The composed surface: one resolved bundle of a scheme, its guides, and its
 * access policy, plus the operations that need more than one of them at once.
 *
 * A Context is the unit a UI is handed when the deployment has composed
 * artifacts for it. `scheme`, `guide`, and `access` expose the per-family
 * contracts, so a component that only marks text takes `ContextAdapter.scheme`
 * and never learns it came from a Context. The operations on this interface are
 * the ones no single family can answer alone: auditing a document needs the
 * scheme and the guides, an access assessment needs the audit and the policy,
 * and a crosswalk translation needs both ends of the mapping.
 *
 * Both modes, as everywhere else: a local Context implements it in process and
 * a client bound to a remote context implements it over the `/v1/ctx` routes.
 * Every operation returns the same envelope, so a caller can always report
 * which concrete artifact versions answered it.
 */
export interface ContextAdapter {
    /** Whether this adapter has an active connection to its data source. */
    readonly connected: boolean;
    /**
     * Every scheme this composition holds, primary first.
     *
     * A Context can hold more than one scheme: the primary one it marks with,
     * plus the source and target of any crosswalk it declares. Operations that
     * address a scheme take a selector naming one of them, and `?scheme=` on
     * the REST surface is that selector spelled for a query string. Without
     * this a caller has no way to learn which selectors the composition
     * answers to, so it can only ever reach the primary.
     */
    describeSchemes(): MaybePromise<ContextSchemeDescriptor[]>;
    /**
     * Scheme-shaped view of this composition. Implementations may return
     * themselves.
     */
    readonly scheme: ContextSchemeEngineAdapter;
    /** Guide surface, absent when the composition declares no guide. */
    readonly guide?: GuideEngineAdapter;
    /** Access surface, absent when the composition declares no access policy. */
    readonly access?: AccessEngineAdapter;
    /**
     * Presence of optional artifact families in the resolved composition.
     *
     * Unlike testing `guide` or `access`, this remains accurate for remote
     * adapters that expose operation objects unconditionally. Unlike listing
     * rules, it preserves the distinction between no access policy and a valid
     * policy with an empty rule inventory.
     */
    readonly compositionPresence?: ContextCompositionPresence;
    /**
     * Audit a document through the resolved composition.
     *
     * @param input - The document and how to assess it.
     */
    audit(
        input: DocumentAssessmentInput,
    ): MaybePromise<ContextOperationResult<DocumentAuditReport>>;
    /**
     * Assess document access through the resolved composition.
     *
     * @param input - The document, the subject and how to assess access.
     */
    assessDocumentAccess(
        input: DocumentAccessAssessmentInput,
    ): MaybePromise<ContextOperationResult<DocumentAccessAssessment>>;
    /**
     * Evaluate a trusted target through the resolved composition. The distinct
     * name keeps this envelope-returning operation separate from the bare
     * decision {@link AccessEngineAdapter.check} returns.
     *
     * @param target - Marking text, or the marking as assertions.
     * @param userAttributes - The subject's attributes, as the policy's rules
     *   read them.
     * @param context - Other values the rules' conditions read.
     */
    checkContextAccess(
        target: string | Assertion[],
        userAttributes: Record<string, unknown>,
        context?: Record<string, unknown>,
    ): MaybePromise<ContextOperationResult<AccessDecision>>;
    /**
     * Describe immutable access requirements for a trusted target.
     *
     * @param input - The marking to describe requirements for.
     */
    accessRequirements(
        input: AccessRequirementsInput,
    ): MaybePromise<ContextOperationResult<AccessRequirementsDescription>>;
    /**
     * Apply a directional crosswalk declared by this composition.
     *
     * @param input - The marking and the crosswalk to apply.
     */
    translate(
        input: CrosswalkTranslationInput,
    ): MaybePromise<ContextOperationResult<CrosswalkTranslationResult>>;
    /** Release resources held by the composition. */
    destroy(): void;
}

/** A {@link ContextAdapter} whose operations complete synchronously. */
export interface LocalContextAdapter extends ContextAdapter {
    readonly scheme: LocalSchemeEngineAdapter;
    readonly guide?: LocalGuideEngineAdapter;
    readonly access?: LocalAccessEngineAdapter;
    describeSchemes(): ContextSchemeDescriptor[];
    audit(
        input: DocumentAssessmentInput,
    ): ContextOperationResult<DocumentAuditReport>;
    assessDocumentAccess(
        input: DocumentAccessAssessmentInput,
    ): ContextOperationResult<DocumentAccessAssessment>;
    checkContextAccess(
        target: string | Assertion[],
        userAttributes: Record<string, unknown>,
        context?: Record<string, unknown>,
    ): ContextOperationResult<AccessDecision>;
    accessRequirements(
        input: AccessRequirementsInput,
    ): ContextOperationResult<AccessRequirementsDescription>;
    translate(
        input: CrosswalkTranslationInput,
    ): ContextOperationResult<CrosswalkTranslationResult>;
}

/**
 * Context-bound remote marking operations.
 *
 * Unlike {@link RemoteSchemeEngineAdapter}, this surface never accepts a
 * scheme selector or composition lifecycle call. The Context selected when
 * the remote client was constructed owns that composition; allowing an
 * operation to address a different scheme would describe a request the
 * Context REST contract cannot serve.
 */
export interface RemoteContextSchemeEngineAdapter
    extends Omit<
        RemoteSchemeEngineAdapter,
        | 'loadScheme'
        | 'loadLayer'
        | 'unloadScheme'
        | 'unloadLayer'
        | 'getScheme'
        | 'listSchemes'
        | 'getDefaultScheme'
        | 'listGuides'
        | 'process'
        | 'validate'
        | 'explain'
        | 'render'
        | 'normalize'
        | 'diff'
        | 'getFormatCoverage'
        | 'suggest'
        | 'aggregate'
        | 'aggregateAssertions'
        | 'applyPreset'
        | 'collectNotices'
        | 'scan'
        | 'describeConcept'
        | 'filterConcepts'
        | 'buildSchemeView'
        | 'listCategoriesFlat'
        | 'getConceptsInCategory'
        | 'getSchemeMeta'
        | 'listCategories'
        | 'uncoveredAssertions'
        | 'checkCoverage'
    > {
    /**
     * Returns the Context's scheme. See {@link SchemeEngineAdapter.getScheme}.
     */
    getScheme(): SchemePublicView;
    /**
     * Processes a marking for its author. See {@link
     * SchemeEngineAdapter.process}.
     *
     * @param input - Marking text, or the facts as assertions.
     * @param options - Formats, chosen facts, context, surface, parts,
     *   requested outputs and picker categories.
     */
    process(
        input: string | Assertion[],
        options?: {
            /**
             * The format `input` is written in. For a scheme that declares
             * `render.surfaces`, the view it is read as, or one of its forms,
             * as the scheme document's `render.surfaces` defines them. Omitted,
             * recognition works it out and reports what the text was read as in
             * `recognition.inputFormat`.
             */
            inputFormat?: string;
            /**
             * The output `rendered` is written in. For a scheme that declares
             * `render.surfaces`, an output as the scheme document's
             * `render.surfaces` defines it. Omitted, the scheme's default
             * format, or with `render.surfaces`, each written surface's
             * default for the marking's role, by the rule `render.surfaces`
             * states for a request that names no output.
             */
            outputFormat?: string;
            /**
             * The facts already chosen. Sent with marking text, they are
             * settled together with what the text states, as one marking.
             */
            assertions?: Assertion[];
            context?: ProcessingContext;
            /**
             * The validation surface `input` is, by scheme scope id. Omitted,
             * the input is a whole marking.
             */
            surface?: string;
            /**
             * Part markings the whole must cover. The whole is judged as
             * covering them: a part it does not cover is an error, and so is
             * a part that does not read as a marking. Every rank floor is
             * worked out against the whole and these parts together, so a
             * raise never lands below what a part needs, and every proposed
             * fix is proven with them, as `ProcessResult.proposedFixes`
             * states. Each entry is a marking in one of the scheme's part
             * formats, or any format the scheme reads. Empty or absent, the
             * whole stands alone.
             */
            parts?: string[];
            /**
             * The outputs to write into `renders`, each an output address
             * spelled exactly as a key of `renders` is. Omitted or empty,
             * `renders` is empty. An address the scheme does not declare is
             * refused.
             */
            outputs?: string[];
            /**
             * Category ids to answer picker options for, returned in
             * `suggestionsFor`. Omitted, nothing is suggested and the field
             * is absent. An id the scheme does not declare is refused.
             */
            suggestFor?: string[];
            signal?: AbortSignal;
        },
    ): Promise<ProcessResult>;
    /**
     * Validates a marking for a reader. See {@link
     * SchemeEngineAdapter.validate}.
     *
     * @param input - Marking text, or the facts as assertions.
     * @param options - Formats, context, surface and the parts the whole must
     *   cover.
     */
    validate(
        input: string | Assertion[],
        options?: {
            /**
             * The format `input` is written in, when it is text. For a scheme
             * that declares `render.surfaces`, the view it is read as, or one
             * of its forms, as the scheme document's `render.surfaces` defines
             * them. Omitted, recognition works it out and reports what the text
             * was read as in `recognition.inputFormat`. Refused when `input` is
             * facts, which carry no text.
             */
            inputFormat?: string;
            /**
             * The output `rendered` is written in. For a scheme that declares
             * `render.surfaces`, an output as the scheme document's
             * `render.surfaces` defines it. Omitted, the scheme's default
             * format, or with `render.surfaces`, each written surface's
             * default for the marking's role, by the rule `render.surfaces`
             * states for a request that names no output.
             */
            outputFormat?: string;
            context?: ProcessingContext;
            /**
             * The validation surface `input` is, by scheme scope id. Omitted,
             * the input is a whole marking.
             */
            surface?: string;
            /**
             * Part markings the whole must cover. The whole is judged as
             * covering them: a part it does not cover is an error, and so is
             * a part that does not read as a marking. Each entry is a marking
             * in one of the scheme's part formats, or any format the scheme
             * reads. Empty or absent, the whole stands alone.
             */
            parts?: string[];
            signal?: AbortSignal;
        },
    ): Promise<ValidateResult>;
    /**
     * Explains a marking step by step. See {@link SchemeEngineAdapter.explain}.
     *
     * @param input - Marking text, or the facts as assertions.
     * @param options - Formats, chosen facts, context, surface and parts.
     */
    explain(
        input: string | Assertion[],
        options?: {
            /**
             * The format `input` is written in. For a scheme that declares
             * `render.surfaces`, the view it is read as, or one of its forms,
             * as the scheme document's `render.surfaces` defines them. Omitted,
             * recognition works it out and reports what the text was read as in
             * `recognition.inputFormat`.
             */
            inputFormat?: string;
            /**
             * The output `rendered` is written in. For a scheme that declares
             * `render.surfaces`, an output as the scheme document's
             * `render.surfaces` defines it. Omitted, the scheme's default
             * format, or with `render.surfaces`, each written surface's
             * default for the marking's role, by the rule `render.surfaces`
             * states for a request that names no output.
             */
            outputFormat?: string;
            /**
             * The facts already chosen. Sent with marking text, they are
             * settled together with what the text states, as one marking.
             */
            assertions?: Assertion[];
            context?: ProcessingContext;
            /**
             * The validation surface `input` is, by scheme scope id. Omitted,
             * the input is a whole marking.
             */
            surface?: string;
            /**
             * Part markings the whole must cover. The whole is judged as
             * covering them: a part it does not cover is an error, and so is
             * a part that does not read as a marking. Each entry is a marking
             * in one of the scheme's part formats, or any format the scheme
             * reads. Empty or absent, the whole stands alone.
             */
            parts?: string[];
            signal?: AbortSignal;
        },
    ): Promise<ExplanationTrace>;
    /**
     * Renders assertions in a format. See {@link SchemeEngineAdapter.render}.
     *
     * @param assertions - Assertions to render.
     * @param format - Output to write. Omit it for the default output.
     * @param options - Preservation mode and a cancellation signal.
     */
    render(
        assertions: Assertion[],
        format?: string,
        options?: RenderOptions,
    ): Promise<RenderResult>;
    /**
     * Rewrites a marking in its canonical form. See {@link
     * SchemeEngineAdapter.normalize}.
     *
     * @param input - Marking text.
     * @param options - Input and output formats and a cancellation signal.
     */
    normalize(
        input: string,
        options?: {
            inputFormat?: string;
            outputFormat?: string;
            signal?: AbortSignal;
        },
    ): Promise<string>;
    /**
     * Reports what changed between two markings. See {@link
     * SchemeEngineAdapter.diff}.
     *
     * @param a - The first marking.
     * @param b - The second marking, compared against the first.
     * @param options - Formats and a cancellation signal.
     */
    diff(
        a: string,
        b: string,
        options?: {
            inputFormat?: string;
            outputFormat?: string;
            signal?: AbortSignal;
        },
    ): Promise<DiffResult>;
    /**
     * Reports what a render format writes. See {@link
     * SchemeEngineAdapter.getFormatCoverage}.
     *
     * @param formatId - Format to report on. Omit it for the default format.
     */
    getFormatCoverage?(formatId?: string): FormatCoverage;
    /**
     * Suggests concepts for a marking. See {@link SchemeEngineAdapter.suggest}.
     *
     * @param input - Marking text, or the facts as assertions.
     * @param options - Formats, a filter, the surface, whether to include gated
     *   concepts, and a cancellation signal.
     */
    suggest(
        input: string | Assertion[],
        options?: {
            /**
             * The format `input` is written in, when `input` is a string. For a
             * scheme that declares `render.surfaces`, the view it is read as,
             * or one of its forms, as the scheme document's `render.surfaces`
             * defines them. Refused when `input` is facts, which carry no
             * text.
             */
            inputFormat?: string;
            /**
             * The format any rendered preview is written in. For a scheme that
             * declares `render.surfaces`, an output as the scheme document's
             * `render.surfaces` defines it.
             */
            outputFormat?: string;
            filter?: string;
            /** The validation surface, by scheme scope id. */
            surface?: string;
            includeGated?: boolean;
            signal?: AbortSignal;
        },
    ): Promise<SuggestResult>;
    /**
     * Rolls markings up into one. See {@link SchemeEngineAdapter.aggregate}.
     *
     * @param inputs - Marking texts to roll up.
     * @param options - Formats, context, surface and a cancellation signal.
     */
    aggregate(
        inputs: string[],
        options?: {
            inputFormat?: string;
            outputFormat?: string;
            context?: ProcessingContext;
            surface?: string;
            signal?: AbortSignal;
        },
    ): Promise<AggregateResult>;
    /**
     * Rolls assertion sets up into one marking. See {@link
     * SchemeEngineAdapter.aggregateAssertions}.
     *
     * @param assertionSets - One assertion set per marking to roll up.
     * @param options - Output format, context, surface and a cancellation
     *   signal.
     */
    aggregateAssertions(
        assertionSets: Assertion[][],
        options?: {
            /** Refused: assertion sets carry no text to read. */
            inputFormat?: string;
            outputFormat?: string;
            context?: ProcessingContext;
            surface?: string;
            signal?: AbortSignal;
        },
    ): Promise<AggregateResult>;
    /**
     * Validates the marking a label preset stands for. See {@link
     * SchemeEngineAdapter.applyPreset}.
     *
     * @param presetId - Id of the label preset.
     * @param options - The output the preset's marking is rendered in.
     */
    applyPreset(
        presetId: string,
        options?: { outputFormat?: string },
    ): Promise<ValidateResult>;
    /**
     * Collects the notices the assertions' concepts carry. See {@link
     * SchemeEngineAdapter.collectNotices}.
     *
     * @param assertions - Assertions whose concepts' notices to collect.
     */
    collectNotices(
        assertions: Assertion[],
    ): Promise<
        Array<{
            /** Id of the concept that carries the notice. */
            conceptId: string;
            /** Display name of that concept. */
            conceptName: string;
            /** Notice category, such as `warning` or `handling`. */
            type: string;
            /** The notice text. */
            text: string;
            /** Whether the notice must be displayed. */
            required: boolean;
        }>
    >;
    /**
     * Scans document text for markings. See {@link SchemeEngineAdapter.scan}.
     *
     * @param text - Document text to scan.
     * @param options - Input and output formats and a cancellation signal. A
     *   remote adapter does not report progress.
     */
    scan(text: string, options?: ScanOptions): Promise<ScanOutcome>;
    /**
     * Describes a concept's usage. See {@link
     * SchemeEngineAdapter.describeConcept}.
     *
     * @param conceptId - Id of the concept.
     * @param categoryId - Id of the category the concept is described in.
     * @param options - The view to describe the concept in.
     */
    describeConcept(
        conceptId: string,
        categoryId: string,
        options?: { view?: string },
    ): Promise<ConceptDescription>;
    /**
     * Text-searches the scheme's concepts. See {@link
     * SchemeEngineAdapter.filterConcepts}.
     *
     * @param query - Search text.
     */
    filterConcepts(query: string): Promise<FilterResult>;
    /**
     * Builds the Handbook tree. See {@link
     * SchemeEngineAdapter.buildSchemeView}.
     */
    buildSchemeView(): Promise<SchemeStructuralView>;
    /**
     * Lists category id and label pairs. See {@link
     * SchemeEngineAdapter.listCategoriesFlat}.
     */
    listCategoriesFlat(): Promise<
        Array<{
            /** Category id. */
            id: string;
            /** Category display label. */
            label: string;
        }>
    >;
    /**
     * Returns a category's concepts. See {@link
     * SchemeEngineAdapter.getConceptsInCategory}.
     *
     * @param categoryId - Id of the category.
     */
    getConceptsInCategory(categoryId: string): ConceptView[];
    /**
     * The nested form: each concept with its depth under its in-category
     * parents.
     *
     * @param categoryId - Id of the category.
     * @param options - `{ nested: true }` selects the nested form.
     */
    getConceptsInCategory(
        categoryId: string,
        options: { nested: true },
    ): Array<{
        /** The concept, as a display view. */
        concept: ConceptView;
        /** Nesting depth: 0 for a root, 1 for its child, and so on. */
        depth: number;
    }>;
    /**
     * Returns the scheme's metadata. See {@link
     * SchemeEngineAdapter.getSchemeMeta}.
     */
    getSchemeMeta(): SchemeMetaView;
    /**
     * Returns every category view. See {@link
     * SchemeEngineAdapter.listCategories}.
     */
    listCategories(): CategoryView[];
    /**
     * Returns the candidates the parent does not cover. See {@link
     * SchemeEngineAdapter.uncoveredAssertions}.
     *
     * @param candidates - Assertions to check.
     * @param parent - Assertions of the marking expected to cover them.
     */
    uncoveredAssertions(
        candidates: Assertion[],
        parent: Assertion[],
    ): Assertion[];
    /**
     * Checks child markings against a parent. See {@link
     * SchemeEngineAdapter.checkCoverage}.
     *
     * @param children - Child markings, as text.
     * @param parent - The parent marking, as text.
     * @param options - Input and output formats and a cancellation signal.
     */
    checkCoverage(
        children: string[],
        parent: string,
        options?: {
            inputFormat?: string;
            outputFormat?: string;
            signal?: AbortSignal;
        },
    ): Promise<CoverageReport>;
}

/** A {@link ContextAdapter} whose operations complete asynchronously. */
export interface RemoteContextAdapter extends ContextAdapter {
    readonly scheme: RemoteContextSchemeEngineAdapter;
    readonly guide?: RemoteGuideEngineAdapter;
    readonly access?: RemoteAccessEngineAdapter;
    describeSchemes(): Promise<ContextSchemeDescriptor[]>;
    audit(
        input: DocumentAssessmentInput,
    ): Promise<ContextOperationResult<DocumentAuditReport>>;
    assessDocumentAccess(
        input: DocumentAccessAssessmentInput,
    ): Promise<ContextOperationResult<DocumentAccessAssessment>>;
    checkContextAccess(
        target: string | Assertion[],
        userAttributes: Record<string, unknown>,
        context?: Record<string, unknown>,
    ): Promise<ContextOperationResult<AccessDecision>>;
    accessRequirements(
        input: AccessRequirementsInput,
    ): Promise<ContextOperationResult<AccessRequirementsDescription>>;
    translate(
        input: CrosswalkTranslationInput,
    ): Promise<ContextOperationResult<CrosswalkTranslationResult>>;
}

/**
 * Narrow the engine a host injected to a {@link ContextAdapter}.
 *
 * A UI is handed `SchemeEngineAdapter | ContextAdapter` and has to know which
 * one it got before reaching for `audit` or `access`. The test is structural on
 * purpose: any object carrying the composed surface qualifies, whether it came
 * from the in-process engine, the HTTP client, or a host's own implementation.
 * There is no brand to set and nothing to register.
 *
 * @param adapter - The injected engine.
 * @returns True when the engine exposes the composed Context surface.
 */
export function isContextAdapter(
    adapter: SchemeEngineAdapter | ContextAdapter,
): adapter is ContextAdapter {
    return (
        'scheme' in adapter &&
        typeof (adapter as ContextAdapter).audit === 'function'
    );
}
