/**
 * Wire-format request and response body types for the REST API.
 *
 * These types describe the JSON shapes that travel over HTTP: base64 encoding,
 * field projection, and Context-bound operations. Every name here is
 * a published `components.schemas` entry in openapi.yaml, so the authoring
 * source belongs in the same repository that publishes the spec.
 *
 * They stay a separate module from the definition types in
 * `@ezclassify/types`. Definition types describe artifacts at rest; these
 * describe HTTP bodies. Collapsing the two would let a scheme-definition change
 * silently widen the HTTP surface.
 *
 * Result types the handler returns unchanged (ProcessResult, AggregateResult,
 * and the rest) come from `@ezclassify/types`, which defines them.
 */

import type {
    AccessDecision,
    AccessRequirementsDescription,
    AccessRuleDescription,
    AggregateResult,
    Assertion,
    CollectedNotice,
    ConceptDescription,
    ContextOperationResult,
    ContextSchemeDescriptor,
    CoverageReport,
    CrosswalkTranslationResult,
    DiffResult,
    DocumentResponseProfile,
    EmbeddedMarkingStyle,
    EvaluationResult,
    ExplanationTrace,
    GuideDeterminationInput,
    GuideScanResult,
    GuideStructuralView,
    MarkingColorRule,
    ProcessResult,
    ProcessingContext,
    ReadinessWarning,
    ReferenceSurfaceLabel,
    RenderAssessment,
    RenderPreservation,
    RuleDescription,
    ScanLimits,
    ScanResult,
    Vocabulary,
    SchemeStructuralView,
    SuggestResult,
    SuggestResultsByCategory,
    ValidateResult,
} from '@ezclassify/types';

export type {
    ContextDocumentAccessAssessmentResult,
    ContextDocumentAuditResult,
} from '@ezclassify/types';

/** Response body for Context normalization. */
export interface NormalizeResponseBody {
    /** Canonical normalized form of the marking string. */
    result: string;
}

/** Response body for Context rendering. */
export interface RenderResponseBody {
    /** The rendered marking string. */
    result: string;
    /**
     * What this render did to the state it was given: what was written, what
     * was left out, what collapsed, what this format cannot write. Bound to
     * this render, not to the format in the abstract.
     */
    assessment: RenderAssessment;
}

/** One scope a scheme declares, as the scopes resource lists it. */
export interface SchemeScopeResponseBody {
    /** Scope identifier, referenced by `scopes` on concepts and categories. */
    id: string;
    /** Display label for the scope selector. */
    label: string;
}

/**
 * Context scheme scopes response: the declared scopes in declaration order.
 * Empty when the scheme declares none.
 *
 * An array rather than a map, because the order is the order a selector offers
 * them in and a JSON object does not carry order. Which scope is the default
 * is the summary's `defaultScope`; no entry here marks it.
 */
export type SchemeScopesResponseBody = SchemeScopeResponseBody[];

/** Context scheme apply-preset request. */
export interface ApplyPresetRequestBody {
    /** ID of the label preset to expand. */
    presetId: string;
    /**
     * The format the expanded marking is rendered in. Omitted or empty, the
     * scheme's default format. For a scheme that declares `render.surfaces`,
     * an output as the scheme document's `render.surfaces` defines it.
     */
    outputFormat?: string;
}

/** Context scheme summary response. */
export interface SchemeSummaryResponseBody {
    /** Scheme identifier from the scheme metadata. */
    id: string;
    /** Scheme semantic version. */
    version: string;
    /** Display name from the scheme metadata. */
    name: string;
    /** Free-text description from the scheme metadata. */
    description: string;
    /** Human-readable definition of the scheme, for tooltips and about panels. */
    definition?: string;
    /** Usage guidance for the scheme, shown in reference views. */
    guidance?: string;
    /** Single-category scheme-default color source, when category mode is used. */
    colorFrom?: string;
    /** Ordered rule-driven color outcomes, when rule mode is used. */
    colorRules?: MarkingColorRule[];
    /** Whether the scheme uses role-aware processing. Omitted when unset. */
    roleAware?: boolean;
    /** Scheme-authored display vocabulary. */
    vocabulary?: Vocabulary;
    /**
     * Display label for this scheme's own reference component, the Handbook:
     * the scheme's override or the generic "Handbook" / "Handbooks" when it
     * declares none. Always populated.
     */
    referenceSurfaceLabel: ReferenceSurfaceLabel;
    /**
     * Render format IDs grouped by role. For a scheme without
     * `render.surfaces`, the lists `role_detection` gives, which the scanner
     * reads a marking's role from. For a scheme with them, the scanner takes
     * the role from the view a marking was read as, and these lists are
     * derived from the views for a caller that picks a format per role: each
     * role lists the forms of the views that state it, `format`, case formats
     * and `also_read_in` in that order, surfaces and views in declared order
     * and each format once.
     */
    contextFormats?: {
        /** Format ids a whole marking is read in. */
        whole: string[];
        /** Format ids a part marking is read in. */
        part: string[];
    };
    /**
     * Ways a marking may appear embedded in free text. Omitted when the scheme
     * declares none, which is how a client tells that inline marking is off.
     */
    embeddedMarking?: EmbeddedMarkingStyle[];
    /**
     * Default scope id applied when a marking asserts no scope explicitly.
     * Present exactly when the scheme declares scopes. Pairs with the
     * per-category `scopes` lists on the categories sub-resource so a remote
     * adapter can reconstruct which categories a scope-only assertion set
     * targets: the metadata the assertion-set aggregate path needs to render
     * scoped categories that the whole-marking format would otherwise drop.
     */
    defaultScope?: string;
    /**
     * Display label for the scope selector shown in UIs. Omitted when the
     * scheme declares none. Carried here so `getSchemeMeta` answers the same
     * for a remote adapter as it does for a local one; without it the selector
     * is labeled from the scheme document in one mode and left unlabeled in
     * the other.
     */
    scopeLabel?: string;
    /**
     * Render format applied when a call names none. A remote adapter has no way
     * to derive this from the formats sub-resource: format declaration order is
     * not default order, so a client that guesses the first entry renders in
     * the wrong format whenever the two differ.
     *
     * Omitted when the scheme names no default. A client may then fall back to
     * the first declared format, which is the same rule the engine applies, so
     * both adapters render such a scheme the same way. The field is not a place
     * to encode that absence: `default` is an ordinary format id, and a scheme
     * declaring one would be indistinguishable from a scheme naming nothing.
     *
     * For a scheme that declares `render.surfaces`, this is the `surface/view`
     * address of the view the default scope's surface writes a marking with
     * no role in, which is its default for a whole.
     */
    defaultRenderFormat?: string;
    /**
     * Present only for a scheme that declares `render.surfaces`: the output
     * address a part marking is written in by default. It is the
     * `surface/view` of the default scope's surface's default for a part, from
     * that surface's `default`, and does not depend on `contextFormats`, which
     * lists the formats each role is read in.
     */
    defaultPartRenderFormat?: string;
    /**
     * Present only for a scheme that declares `render.surfaces`: the output
     * address a whole marking is written in by default, the default scope's
     * surface's default for a whole, resolved the same way
     * `defaultPartRenderFormat` is for a part.
     */
    defaultWholeRenderFormat?: string;
}

/**
 * Context scheme grammar response: the scheme's recognition policy.
 *
 * No separator. Every boundary belongs to the field that writes it, so there is
 * no global one to publish; what is left is how a spelling found at a boundary
 * is compared against the vocabulary.
 */
export interface PublicGrammarResponseBody {
    /** Whether the vocabulary is matched case-sensitively. */
    caseSensitive: boolean;
    /** Whether surrounding whitespace is ignored when a spelling is compared. */
    stripWhitespace: boolean;
}

/**
 * JSON-safe serialization of the engine's Set/Map-based FilterResult.
 *
 * The engine returns FilterResult with Set<string> and Map<string, ...> fields;
 * this interface is what the server writes to the wire.
 */
export interface WireFilterResult {
    /** IDs of concepts or rules that matched the query. */
    visibleIds: string[];
    /** Per-category counts. */
    categoryCounts: Record<
        string,
        {
            /** Items in the category that matched the query. @asType integer */
            visible: number;
            /** Items in the category. @asType integer */
            total: number;
        }
    >;
    /** Aggregate counts across all categories. */
    total: {
        /** Items that matched the query. @asType integer */
        visible: number;
        /** Items in every category. @asType integer */
        total: number;
    };
}

/**
 * Replica readiness state reported by GET /v1/ready. `ready` once the replica
 * may receive traffic after RuntimeHost initialization and required-artifact
 * checks. License expiration never takes a mission runtime out of service.
 */
export type ReadyStatus = 'ready' | 'starting';

/** Response body for GET /v1/ready */
export interface ReadyResponseBody {
    /** Replica readiness state; see `ReadyStatus`. */
    status: ReadyStatus;
    /**
     * Degraded conditions an operator should act on, in a stable order. Absent
     * when there are none. A warning never changes `status`: a ready replica
     * that carries one stays ready. Present only for an authenticated caller.
     */
    warnings?: ReadinessWarning[];
}

/** Response body for GET /v1/health */
export interface HealthResponseBody {
    /** Always `"ok"` while the server is running. */
    status: 'ok';
    /** Engine package version exposed to clients. */
    engineVersion: string;
    /**
     * Git commit SHA of the deployed build (from GIT_SHA env var, or empty
     * string).
     */
    engineSha: string;
    /** Git tag of the deployed build (from GIT_TAG env var, or empty string). */
    gitTag: string;
    /**
     * OpenAPI spec version from info.version in openapi.yaml. SDKs compare this
     * against their vendored spec.
     */
    openapiVersion: string;
    /**
     * Version of the wire interface this server speaks, fixed at `v1`. A client
     * can compare it against the version it was built for before making calls.
     */
    abiVersion: 'v1';
}

/** Response body for error responses (4xx / 5xx). */
export interface ErrorResponseBody {
    /** Human-readable error message. Prose for an operator, not a contract: a
     * client that branches on this string breaks the first time the wording is
     * improved. Branch on `code` instead. */
    error: string;
    /**
     * Stable machine-readable classification of the failure, present whenever
     * the server can name one. Set to `INVALID_INPUT` when the failure
     * originated in engine input or the request carried something the
     * operation does not declare, and to `route_not_found` on a 404 that reached routing and
     * matched no route. A request refused before routing carries the constant
     * refusal body instead, which has no `code` at all by design, so the
     * absence of a code on a 404 is itself uninformative.
     */
    code?: string;
    /**
     * What the failure is about, beside `code`: a stable operation-specific
     * detail used to classify it. For a request that names a format, a
     * concept or a category the scheme does not declare, it is the request
     * field and the id it named, written `field: id`, such as
     * `outputFormat: nope` or `conceptId: NOPE`. For a request that carries a
     * query parameter the operation does not declare, it is `query: ` and the
     * parameter's name; for an undeclared body field, `body`, the JSON pointer
     * of the object that holds it, `: ` and the field, such as `body: extra`
     * or `body/context: extra`. Never a scheme's internals.
     */
    detail?: string;
}

/** Response body for 429 Too Many Requests. */
export interface RateLimitErrorBody {
    /** Always "Too Many Requests". */
    error: string;
    /** Seconds until the rate-limit window resets. */
    retryAfter: number;
}

// ── Context-scoped (path-based) request bodies ────────────────────────────
//
// Every body below is the payload only, no `schemeId` / `guideId` /
// `accessId` / `layers` selector. Component identity is derived entirely
// from the URL path under `/v1/ctx/{ctxId}/{version?}/...`.

/** POST /v1/ctx/{ctxId}/{version?}/document/audit */
export interface CtxDocumentAuditRequestBody {
    /** Full document text to scan for markings. */
    text: string;
    /** Optional analyst decisions applied to nominations for this document. */
    guideDeterminations?: GuideDeterminationInput;
    /** Detail projection applied after the complete audit is evaluated. */
    responseProfile?: DocumentResponseProfile;
}

/** POST /v1/ctx/{ctxId}/{version?}/document/assess-access */
export interface CtxDocumentAssessAccessRequestBody {
    /** Full document text to audit before access is assessed. */
    text: string;
    /** User attributes interpreted by the Context's access policy. */
    userAttributes: Record<string, unknown>;
    /** Optional relationship attributes used with the user attributes. */
    context?: Record<string, unknown>;
    /** Optional analyst decisions applied to nominations for this document. */
    guideDeterminations?: GuideDeterminationInput;
    /** Detail projection applied after all access scenarios are evaluated. */
    responseProfile?: DocumentResponseProfile;
}

/**
 * POST /v1/ctx/{ctxId}/{version?}/scheme/process: the author's call.
 *
 * `input` is what was typed and `assertions` the facts already chosen, and a
 * composer sends both on each keystroke. The two are settled together as one
 * marking, so a conflict between them is the scheme's to repair or report, as
 * it would be within one input. Either may be empty: an empty `input` with
 * `assertions` processes the chosen facts alone.
 */
export interface CtxSchemeProcessRequestBody {
    /** The marking text, as typed. */
    input: string;
    /**
     * The format `input` is written in. For a scheme that declares
     * `render.surfaces`, the view it is read as, or one of its forms, as the
     * scheme document's `render.surfaces` defines them. Omitted or empty,
     * recognition works it out and reports what the text was read as on
     * `recognition.inputFormat`.
     */
    inputFormat?: string;
    /**
     * The output the result is rendered in. It selects output only: it never
     * narrows what may be read. For a scheme that declares `render.surfaces`,
     * an output as the scheme document's `render.surfaces` defines it.
     *
     * Omitted or empty, the scheme's default format, or with
     * `render.surfaces`, each written surface's default for the marking's
     * role, by the rule `render.surfaces` states for a request that names no
     * output.
     */
    outputFormat?: string;
    /**
     * The facts already chosen, settled together with what `input` states as
     * one marking.
     */
    assertions?: Assertion[];
    /** Optional ProcessingContext forwarded verbatim to the engine. */
    context?: ProcessingContext;
    /**
     * Validation surface: names which surface of a marking `input` is, using
     * the scheme's scope ids. Omitted, the input is a whole marking and every
     * required category belonging to the marking as a whole must be covered.
     * Given a scope id, the input is that surface's fragment and only the
     * required categories that surface owns are demanded.
     */
    surface?: string;
    /**
     * Part markings the whole must cover. The whole is judged as covering
     * them: a part it does not cover is an error, and so is a part that does
     * not read as a marking. Every rank floor is worked out against the whole
     * and these parts together, so a raise never lands below what a part
     * needs, and every proposed fix is proven with them, as
     * `ProcessResult.proposedFixes` states. Each entry is a marking in one of
     * the scheme's part formats, or any format the scheme reads. Empty or
     * absent, the whole stands alone.
     */
    parts?: string[];
    /**
     * The outputs to write into `renders`, each an output address spelled
     * exactly as a key of `renders` is: `surface/view` for a scheme that
     * declares `render.surfaces`, a format id otherwise. Omitted or empty,
     * `renders` is empty. An address the scheme does not declare is refused.
     */
    outputs?: string[];
    /**
     * Category ids to answer picker options for, against the settled facts,
     * in `suggestionsFor`. Omitted, nothing is suggested and the field is
     * absent from the result. An id the scheme does not declare is refused.
     */
    suggestFor?: string[];
}

/**
 * POST /v1/ctx/{ctxId}/{version?}/scheme/explain: the trace of a process call.
 *
 * Takes what process takes, apart from `outputs` and `suggestFor`, which only
 * add to a process result.
 */
export interface CtxSchemeExplainRequestBody {
    /** The marking text, as typed. */
    input: string;
    /**
     * The format `input` is written in. For a scheme that declares
     * `render.surfaces`, the view it is read as, or one of its forms, as the
     * scheme document's `render.surfaces` defines them. Omitted or empty,
     * recognition works it out.
     */
    inputFormat?: string;
    /**
     * The output the trace's `rendered` is written in. For a scheme that
     * declares `render.surfaces`, an output as the scheme document's
     * `render.surfaces` defines it. Omitted or empty, the scheme's default
     * format, or with `render.surfaces`, each written surface's default for
     * the marking's role, by the rule `render.surfaces` states for a request
     * that names no output.
     */
    outputFormat?: string;
    /**
     * The facts already chosen, settled together with what `input` states as
     * one marking.
     */
    assertions?: Assertion[];
    /** Optional ProcessingContext forwarded verbatim to the engine. */
    context?: ProcessingContext;
    /**
     * Validation surface: names which surface of a marking `input` is, using
     * the scheme's scope ids. Omitted, the input is a whole marking.
     */
    surface?: string;
    /**
     * Part markings the whole must cover. The whole is judged as covering
     * them, as on the process request.
     */
    parts?: string[];
}

/** POST /v1/ctx/{ctxId}/{version?}/scheme/scan */
export interface CtxSchemeScanRequestBody {
    /** Text to scan for embedded markings. */
    text: string;
    /**
     * The format the markings in `text` are written in. For a scheme that
     * declares `render.surfaces`, the view they are read as, or one of its
     * forms, as the scheme document's `render.surfaces` defines them.
     * Omitted or empty, recognition works it out.
     */
    inputFormat?: string;
    /**
     * The output each found marking is rendered back in. For a scheme that
     * declares `render.surfaces`, an output as the scheme document's
     * `render.surfaces` defines it. Omitted or empty, each marking is written
     * as `ScanResult.type` describes.
     */
    outputFormat?: string;
}

/** POST /v1/ctx/{ctxId}/{version?}/scheme/aggregate */
export interface CtxSchemeAggregateRequestBody {
    /**
     * Array of marking strings to aggregate. Mutually exclusive with
     * `assertionSets`: supply exactly one.
     */
    inputs?: string[];
    /**
     * Already-parsed assertion sets to aggregate, one inner array per marking.
     * Skips the string-parse stage; the rest of the aggregate pipeline runs
     * identically to `inputs`. Transports marking state losslessly (scope-only
     * assertions and capture values survive). Mutually exclusive with
     * `inputs`.
     */
    assertionSets?: Assertion[][];
    /**
     * The format the strings in `inputs` are written in. For a scheme that
     * declares `render.surfaces`, the view they are read as, or one of its
     * forms, as the scheme document's `render.surfaces` defines them.
     * Omitted or empty, recognition works it out. Refused with
     * `assertionSets`, which carries no text to read.
     */
    inputFormat?: string;
    /**
     * The format the combined marking is rendered in. Omitted or empty, the
     * scheme's default format. It selects output only. For a scheme that
     * declares `render.surfaces`, an output as the scheme document's
     * `render.surfaces` defines it.
     */
    outputFormat?: string;
    /** Optional ProcessingContext forwarded verbatim to the engine. */
    context?: ProcessingContext;
    /**
     * Validation surface of the rollup, using the scheme's scope ids. Names
     * what the combined marking is, not what any one contributor was. Omitted,
     * the rollup is a whole marking and every required category belonging to
     * the marking as a whole must be covered by the combined result, which is
     * the whole-document case: a portion that omits one is not faulted for it.
     * Given a scope id, the inputs are fragments of that one surface and only
     * the required categories that surface owns are demanded of the rollup.
     */
    surface?: string;
}

/** POST /v1/ctx/{ctxId}/{version?}/scheme/check-coverage */
export interface CtxSchemeCheckCoverageRequestBody {
    /** Child marking strings that must be covered by the parent. */
    children: string[];
    /**
     * Parent marking string checked against the children's rollup. It covers
     * them when it lacks nothing the rollup needs and carries nothing the
     * rollup does not account for.
     */
    parent: string;
    /**
     * The format `children` and `parent` are written in. For a scheme that
     * declares `render.surfaces`, the view they are read as, or one of its
     * forms, as the scheme document's `render.surfaces` defines them.
     * Omitted or empty, recognition works it out.
     */
    inputFormat?: string;
    /**
     * The format `rendered` is written in. Omitted or empty, the scheme's
     * default format. For a scheme that declares `render.surfaces`, an output
     * as the scheme document's `render.surfaces` defines it.
     */
    outputFormat?: string;
}

/**
 * POST /v1/ctx/{ctxId}/{version?}/scheme/validate: the reader's call.
 *
 * The marking arrives as text in `input` or as facts in `assertions`, exactly
 * one of the two; neither or both is a 400. They are two fields because the
 * MCP catalog builder refuses a field that is a string or an array, and the
 * rule is stated here rather than as a root `oneOf`, which would make every
 * generated SDK model this request as a union of two request types.
 *
 * Nothing here changes how the engine settles the marking, so `valid` and
 * `inputWasValid` mean what they mean on every other route. `surface`,
 * `context` and `parts` say what the marking is judged as, as on process.
 */
export interface CtxSchemeValidateRequestBody {
    /** The marking as text. Provide this or `assertions`, never both. */
    input?: string;
    /**
     * The marking as facts as stated: what a document or an author states,
     * before any engine settled them. Never the `assertions` of an earlier
     * result, which are settled already and can read valid where the text they
     * came from did not. Provide this or `input`, never both.
     */
    assertions?: Assertion[];
    /**
     * The format `input` is written in. For a scheme that declares
     * `render.surfaces`, the view it is read as, or one of its forms, as the
     * scheme document's `render.surfaces` defines them. Omitted or empty,
     * recognition works it out and reports what the text was read as on
     * `recognition.inputFormat`. Refused with `assertions`, which carries no
     * text to read.
     */
    inputFormat?: string;
    /**
     * The output the result is rendered in. It selects output only: it never
     * narrows what may be read. For a scheme that declares `render.surfaces`,
     * an output as the scheme document's `render.surfaces` defines it.
     *
     * Omitted or empty, the scheme's default format, or with
     * `render.surfaces`, each written surface's default for the marking's
     * role, by the rule `render.surfaces` states for a request that names no
     * output.
     */
    outputFormat?: string;
    /** Optional ProcessingContext forwarded verbatim to the engine. */
    context?: ProcessingContext;
    /**
     * Validation surface: names which surface of a marking the input is, using
     * the scheme's scope ids. Omitted, the input is a whole marking and every
     * required category belonging to the marking as a whole must be covered.
     * Given a scope id, the input is that surface's fragment and only the
     * required categories that surface owns are demanded.
     */
    surface?: string;
    /**
     * Part markings the whole must cover. The whole is judged as covering
     * them: a part it does not cover is an error, and so is a part that does
     * not read as a marking. Each entry is a marking in one of the scheme's
     * part formats, or any format the scheme reads. Empty or absent, the whole
     * stands alone.
     */
    parts?: string[];
}

/** POST /v1/ctx/{ctxId}/{version?}/scheme/normalize */
export interface CtxSchemeNormalizeRequestBody {
    /** Marking string to normalize. */
    input: string;
    /**
     * The format `input` is written in. For a scheme that declares
     * `render.surfaces`, the view it is read as, or one of its forms, as the
     * scheme document's `render.surfaces` defines them. Omitted or empty,
     * recognition works it out and reports what the text was read as on
     * `recognition.inputFormat`.
     */
    inputFormat?: string;
    /**
     * The format the result is rendered in. Omitted or empty, the scheme's
     * default format. It selects output only: it never narrows what may be
     * read.
     *
     * For a scheme that declares `render.surfaces`, an output as the scheme
     * document's `render.surfaces` defines it.
     */
    outputFormat?: string;
}

/** POST /v1/ctx/{ctxId}/{version?}/scheme/render */
export interface CtxSchemeRenderRequestBody {
    /** Assertions to render into a marking string. */
    assertions: Assertion[];
    /**
     * The format the assertions are rendered in. Omitted or empty, the
     * scheme's default format. For a scheme that declares `render.surfaces`,
     * an output as the scheme document's `render.surfaces` defines it.
     */
    outputFormat?: string;
    /**
     * What this render is being asked for. `projection` (default) renders what
     * the format writes and reports the rest on `assessment`. `full` fails
     * rather than answering when facts were omitted, conflicting, or
     * unrepresentable, so a caller transporting state cannot receive a
     * plausible string instead.
     */
    preservation?: RenderPreservation;
}

/** POST /v1/ctx/{ctxId}/{version?}/scheme/diff */
export interface CtxSchemeDiffRequestBody {
    /** First marking string. */
    a: string;
    /** Second marking string. */
    b: string;
    /**
     * The format `a` and `b` are written in. For a scheme that declares
     * `render.surfaces`, the view they are read as, or one of its forms, as
     * the scheme document's `render.surfaces` defines them. Omitted or
     * empty, recognition works it out.
     *
     * There is no output format: the response is three assertion arrays and no
     * string, so nothing here renders.
     */
    inputFormat?: string;
}

/** POST /v1/ctx/{ctxId}/{version?}/scheme/view */
export interface CtxSchemeViewRequestBody {
    // No body fields: the context binds the scheme and the view takes no
    // selectors.
}

/** POST /v1/ctx/{ctxId}/{version?}/scheme/notices */
export interface CtxSchemeNoticesRequestBody {
    /**
     * Assertions from a prior process() call whose concept notices should be
     * collected.
     */
    assertions: Assertion[];
}

/** POST /v1/ctx/{ctxId}/{version?}/scheme/filter-concepts */
export interface CtxSchemeFilterConceptsRequestBody {
    /** Text query to filter the concept list. */
    query: string;
}

/** POST /v1/ctx/{ctxId}/{version?}/guide/describe-rule */
export interface CtxGuideDescribeRuleRequestBody {
    /** Rule id to describe. */
    ruleId: string;
    /**
     * Guide id when the context has multiple guides. Defaults to the first
     * guide.
     */
    guideId?: string;
}

/** POST /v1/ctx/{ctxId}/{version?}/guide/filter-rules */
export interface CtxGuideFilterRulesRequestBody {
    /** Text query to filter rules. */
    query: string;
    /**
     * Guide id when the context has multiple guides. Defaults to the first
     * guide.
     */
    guideId?: string;
}

/** POST /v1/ctx/{ctxId}/{version?}/guide/view */
export interface CtxGuideViewRequestBody {
    /**
     * Guide id when the context has multiple guides. Defaults to the first
     * guide.
     */
    guideId?: string;
}

/**
 * POST /v1/ctx/{ctxId}/{version?}/scheme/suggest: the options a picker may
 * offer.
 *
 * The marking arrives as text in `input` or as facts in `assertions`, exactly
 * one of the two; neither or both is a 400. Presence decides, as on validate:
 * an empty `input` is text with nothing typed yet, and an empty `assertions`
 * is facts with none chosen. Text typed beside facts already chosen is what
 * process answers, with `suggestFor`.
 */
export interface CtxSchemeSuggestRequestBody {
    /**
     * The marking as text, which may be empty to ask for every option.
     * Provide this or `assertions`, never both.
     */
    input?: string;
    /**
     * The format `input` is written in, when it is a marking string. For a
     * scheme that declares `render.surfaces`, the view it is read as, or one
     * of its forms, as the scheme document's `render.surfaces` defines them.
     * Omitted or empty, recognition works it out. Refused with `assertions`,
     * which carries no text to read.
     */
    inputFormat?: string;
    /**
     * The format suggestion previews are rendered in. For a scheme that
     * declares `render.surfaces`, an output as the scheme document's
     * `render.surfaces` defines it. An empty one is the same as none.
     */
    outputFormat?: string;
    /** Filter string to narrow suggestions. */
    filter?: string;
    /**
     * Suggestion surface, by scheme scope id: restricts suggestions to the
     * concepts and categories that surface owns.
     */
    surface?: string;
    /**
     * The marking as facts already chosen. Provide this or `input`, never
     * both.
     */
    assertions?: Assertion[];
    /**
     * Include concepts the active filter would otherwise hide because their
     * prerequisites are unmet. Each comes back with `gated: true` and the
     * `requires` ids that would unlock it.
     */
    includeGated?: boolean;
}

/** POST /v1/ctx/{ctxId}/{version?}/scheme/suggest-for-categories */
export interface CtxSchemeSuggestForCategoriesRequestBody {
    /**
     * The caller's full committed assertion set. Each category is answered as
     * if its own assertions were not present.
     */
    assertions: Assertion[];
    /** Category ids to produce suggestions for. */
    categoryIds: string[];
    /**
     * The format suggestion previews are rendered in. For a scheme that
     * declares `render.surfaces`, an output as the scheme document's
     * `render.surfaces` defines it. An empty one is the same as none.
     *
     * There is no input format: this takes a committed assertion set, never
     * text.
     */
    outputFormat?: string;
    /**
     * Suggestion surface, by scheme scope id: restricts suggestions to the
     * concepts and categories that surface owns.
     */
    surface?: string;
}

/**
 * POST /v1/ctx/{ctxId}/{version?}/crosswalk/translate. The adapter takes the
 * SOURCE as one field holding either a marking string or its parsed
 * assertions; the wire splits that into the same two fields
 * `CtxAccessCheckRequestBody` uses for its target, because a field that is a
 * string or an array is a shape the MCP catalog builder refuses to describe as
 * a tool input. Exactly one of `marking` and `assertions` is required: neither
 * is a request with no source, both is two sources with no rule for which one
 * the crosswalk reads, and either is a 400.
 */
export interface CtxCrosswalkTranslateRequestBody {
    /** Crosswalk artifact id declared by the context. */
    crosswalkId: string;
    /**
     * SOURCE marking text, parsed against the crosswalk's source scheme before
     * translation. Provide this OR `assertions`, never both.
     */
    marking?: string;
    /**
     * SOURCE as structured assertions, for callers that already hold the
     * parsed form. Provide this OR `marking`, never both.
     */
    assertions?: Assertion[];
}

/**
 * POST /v1/ctx/{ctxId}/{version?}/access/check. Three inputs, matching the
 * engine's `AccessEngine.check(dataAssertions, userAttributes, context)`
 * contract. First, the TARGET being access-checked: either a rendered `marking`
 * string or its structured `assertions` array form (a marking string is parsed
 * to assertions first). Provide either or both; when both are present the
 * assertions derived from `marking` are merged with the `assertions` array.
 * Second, the SUBJECT: `userAttributes`, always an object of the user's
 * attributes. Third, `context`: extra comparison data (e.g. distribution orgs)
 * not encoded in the marking. When decision audit is enabled, deployment
 * configuration identifies required user and resource ids inside `context`.
 */
export interface CtxAccessCheckRequestBody {
    /**
     * TARGET marking string to check access against. Parsed to data assertions
     * before evaluation. Provide this OR `assertions` (the structured
     * alternative); both feed the same first argument of the access check.
     */
    marking?: string;
    /**
     * TARGET as structured assertions: the alternative to the `marking` string
     * for callers that already hold parsed assertions. Merged with any
     * assertions derived from `marking`. This is the single structured target
     * field.
     */
    assertions?: Assertion[];
    /**
     * User/principal attributes evaluated by the access policy. Attribute
     * paths and value interpretation are defined by that access policy. This is
     * the only user-attribute input.
     */
    userAttributes: Record<string, unknown>;
    /**
     * Optional contextual attributes for access evaluation (third check
     * argument).
     */
    context?: Record<string, unknown>;
}

/** POST /v1/ctx/{ctxId}/{version?}/access/describe-rule */
export interface CtxAccessDescribeRuleRequestBody {
    /** Access rule id from the loaded access policy. */
    ruleId: string;
}

/** POST /v1/ctx/{ctxId}/{version?}/access/describe-requirements */
export interface CtxAccessDescribeRequirementsRequestBody {
    /** Marking parsed through the Context's bound scheme. */
    marking?: string;
    /** Structured target assertions merged with any parsed marking. */
    assertions?: Assertion[];
}

/**
 * Response body for GET /v1/ctx/{ctxId}/{version?}/access/rules: every rule in
 * the context's access policy.
 *
 * One route serves both halves of the adapter contract. A caller that wants the
 * descriptions has them; a caller that only wants the rule ids reads them off
 * the same response instead of spending a second round trip on a projection of
 * what it already holds.
 */
export interface CtxAccessRulesResponseBody {
    /** Descriptions for every rule in the access policy, in declared order. */
    rules: AccessRuleDescription[];
}

// Concrete Context operation envelopes. Each alias is a schema root so
// generated clients receive one stable named model per composed route.

/** Context envelope returned by scheme processing. */
export type ContextSchemeProcessResult = ContextOperationResult<ProcessResult>;

/** Context envelope returned by scheme validation. */
export type ContextSchemeValidateResult = ContextOperationResult<ValidateResult>;

/** Context envelope returned by a scheme explanation. */
export type ContextSchemeExplainResult =
    ContextOperationResult<ExplanationTrace>;

/** Context envelope returned by scheme normalization. */
export type ContextSchemeNormalizeResult =
    ContextOperationResult<NormalizeResponseBody>;

/** Context envelope returned by scheme rendering. */
export type ContextSchemeRenderResult =
    ContextOperationResult<RenderResponseBody>;

/** Context envelope returned by scheme diff. */
export type ContextSchemeDiffResult = ContextOperationResult<DiffResult>;

/** Context envelope returned by scheme structural view. */
export type ContextSchemeViewResult =
    ContextOperationResult<SchemeStructuralView>;

/** Context envelope returned by scheme notice collection. */
export type ContextSchemeNoticesResult = ContextOperationResult<
    CollectedNotice[]
>;

/** Context envelope returned by scheme concept filtering. */
export type ContextSchemeFilterConceptsResult =
    ContextOperationResult<WireFilterResult>;

/**
 * What a scan answers on the wire.
 *
 * An object rather than a bare array, because an array alone cannot tell a
 * document that held no marking from a scan that stopped before the end of it.
 * Both come back as zero entries, and the two mean opposite things to whoever
 * decides what happens to the document next.
 */
export interface ScanResponseBody {
    /** The markings the scan found, in document order. */
    results: ScanResult[];
    /** How far the scan got, and what stopped it. */
    limits: ScanLimits;
}

/** Context envelope returned by scheme text scanning. */
export type ContextSchemeScanResult = ContextOperationResult<ScanResponseBody>;

/** Context envelope returned by scheme aggregation. */
export type ContextSchemeAggregateResult =
    ContextOperationResult<AggregateResult>;

/** Context envelope returned by scheme suggestions. */
export type ContextSchemeSuggestResult = ContextOperationResult<SuggestResult>;

/**
 * Context envelope returned by per-category scheme suggestions: the options
 * keyed by category id, the same map a process call returns in
 * `suggestionsFor`.
 */
export type ContextSchemeSuggestForCategoriesResult =
    ContextOperationResult<SuggestResultsByCategory>;

/** Context envelope returned by a directional crosswalk translation. */
export type ContextCrosswalkTranslationResult =
    ContextOperationResult<CrosswalkTranslationResult>;

/** Context envelope returned by scheme coverage checks. */
export type ContextSchemeCoverageResult =
    ContextOperationResult<CoverageReport>;

/** Context envelope returned by concept description. */
export type ContextSchemeConceptDescriptionResult =
    ContextOperationResult<ConceptDescription>;

/** Context envelope returned by trusted-target access checks. */
export type ContextAccessDecisionResult =
    ContextOperationResult<AccessDecision>;

/** Context envelope returned by access-rule description. */
export type ContextAccessRuleDescriptionResult =
    ContextOperationResult<AccessRuleDescription>;

/** Context envelope returned by immutable-policy requirement description. */
export type ContextAccessRequirementsResult =
    ContextOperationResult<AccessRequirementsDescription>;

/** Context envelope returned by guide text scanning. */
export type ContextGuideScanResult = ContextOperationResult<GuideScanResult[]>;

/** Context envelope returned by guide evaluation. */
export type ContextGuideEvaluationResult =
    ContextOperationResult<EvaluationResult>;

/** Context envelope returned by guide-rule description. */
export type ContextGuideRuleDescriptionResult =
    ContextOperationResult<RuleDescription>;

/** Context envelope returned by guide rule filtering. */
export type ContextGuideFilterRulesResult =
    ContextOperationResult<WireFilterResult>;

/** Context envelope returned by guide structural view. */
export type ContextGuideViewResult =
    ContextOperationResult<GuideStructuralView>;

/** POST /v1/ctx/{ctxId}/{version?}/guide/scan */
export interface CtxGuideScanRequestBody {
    /** Text to scan against the context's guides. */
    text: string;
    /** Optional guide id to scope scanning to a single guide. */
    guideId?: string;
}

/** POST /v1/ctx/{ctxId}/{version?}/guide/evaluate */
export interface CtxGuideEvaluateRequestBody {
    /** ID of one guide within the context. Supply this or `allGuides: true`. */
    guideId?: string;
    /** Evaluate and combine every loaded guide through the context's scheme. */
    allGuides?: boolean;
    /** Rule IDs the user selected (checked) in the guide wizard. */
    selectedRuleIds: string[];
}

/** Response body for GET /v1/ctx: the context ids this caller may use. */
export interface CtxListResponseBody {
    /** Context ids the caller may use, sorted alphabetically. */
    contexts: string[];
}

/** Response body for GET /v1/ctx/{ctxId}: versions for a given context id. */
export interface CtxVersionsResponseBody {
    /** Echoed context id. */
    id: string;
    /** Every installed version the caller may use, sorted highest-first. */
    versions: string[];
}

/** Component reference echoed in a `CtxDescribeResponseBody`. */
export interface CtxComponentDescriptor {
    /** Component id from the context declaration. */
    id: string;
    /** Requested version literal (concrete semver or 'latest'). */
    version: string;
    /** Concrete version after `latest` resolution. */
    resolvedVersion: string;
    /** Layers nested beneath this component, in composition order. */
    layers?: CtxComponentDescriptor[];
}

/** Response body for GET /v1/ctx/{ctxId}/{version}: decomposed context. */
export interface CtxDescribeResponseBody {
    /** Context id. */
    id: string;
    /** Concrete context version after `latest` resolution. */
    version: string;
    /** Optional human-readable description copied from the declaration. */
    description?: string;
    /** The composed scheme (base of the layer stack). */
    scheme: CtxComponentDescriptor;
    /**
     * Every scheme this Context holds, primary first, each with the selector
     * that addresses it.
     *
     * The scheme sub-resources under this Context take `?scheme={selector}`,
     * and this is where the valid values come from. `scheme` above answers a
     * different question: it names the component the Context resolved and the
     * layers stacked on it, which is provenance rather than a selector.
     */
    schemes: ContextSchemeDescriptor[];
    /** Guide components in precedence order, or omitted when none. */
    guides?: CtxComponentDescriptor[];
    /**
     * Access policy component, or omitted when the context defines no access
     * doc.
     */
    access?: CtxComponentDescriptor;
    /**
     * Crosswalk components in declaration order, or omitted when the context
     * declares none. A crosswalk the context follows at `latest` reports here
     * the concrete version that answered.
     */
    crosswalks?: CtxComponentDescriptor[];
}
