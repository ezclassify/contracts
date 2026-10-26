import type { SourceProviderMap } from './broker-source';
import type { ContextBlock } from './context-definition';
import type { CrosswalkDefinition } from './crosswalk';

/**
 * A reference to a versioned component (scheme, layer, guide, access policy, or
 * crosswalk). The `version` may be a concrete semver string or the literal
 * `'latest'`, in which case the highest published semver is resolved at request
 * time.
 *
 * @public
 */
export interface ComponentRef {
    /**
     * The id of the component.
     *
     * @minLength 1
     */
    id: string;
    /**
     * A concrete semver version, or `latest` for the highest published one.
     *
     * @pattern ^(latest|\d+\.\d+(\.\d+)?(-[0-9A-Za-z.-]+)?(\+[0-9A-Za-z.-]+)?)$
     */
    version: string;
}

/**
 * The scheme reference in a Context. A scheme ref carries the
 * scheme's `id` + `version` and optionally a list of layer refs that stack on
 * top of the base. Layers belong inside the scheme block because a layer is
 * semantically a derivative of _that_ scheme; it cannot be paired with a
 * different base, so nesting it under the scheme keeps that coupling explicit.
 *
 * @public
 */
export interface ContextSchemeRef extends ComponentRef {
    /** Optional layer references applied left-to-right after the base scheme. */
    layers?: ComponentRef[];
}

/**
 * A guide reference in a Context. A guide ref carries the guide's
 * `id` + `version` and optionally a list of layer refs that stack on top of the
 * base. Layers belong inside the guide entry because a layer is semantically a
 * derivative of _that_ guide; it cannot be paired with a different base, so
 * nesting it under the guide keeps that coupling explicit.
 *
 * Adding guidance needs no layer, since a Context holds a list of guides.
 * Layering is for tailoring a guide the composing organization received
 * read-only.
 *
 * @public
 */
export interface ContextGuideRef extends ComponentRef {
    /** Optional layer references applied left-to-right after the base guide. */
    layers?: ComponentRef[];
}

/**
 * A crosswalk reference in a Context. A crosswalk ref carries the
 * crosswalk's `id` + `version` and optionally a list of layer refs that stack
 * on top of the base. Layers belong inside the crosswalk entry because a layer
 * is semantically a derivative of _that_ crosswalk; it cannot be paired with a
 * different base, so nesting it under the crosswalk keeps that coupling
 * explicit.
 *
 * @public
 */
export interface ContextCrosswalkRef extends ComponentRef {
    /**
     * Optional layer references applied left-to-right after the base
     * crosswalk.
     */
    layers?: ComponentRef[];
}

/**
 * The access-policy reference in a Context. An access ref carries
 * the policy's `id` + `version` and optionally a list of layer refs that stack
 * on top of the base. Layers belong inside the access entry because a layer is
 * semantically a derivative of _that_ policy; it cannot be paired with a
 * different base, so nesting it under the policy keeps that coupling explicit.
 *
 * An access layer only ever adds. See `AccessLayer` for why overriding or
 * removing an inherited mapping is a composition error rather than a merge.
 *
 * @public
 */
export interface ContextAccessRef extends ComponentRef {
    /**
     * Optional layer references applied left-to-right after the base access
     * policy.
     */
    layers?: ComponentRef[];
}

/**
 * A lookup reference for a Context. When `version` is omitted it is interpreted
 * as `'latest'` and resolved against the published version map for the given
 * `id`.
 *
 * @internal
 */
export interface ContextRef {
    /** Context id to look up. */
    id: string;
    /** Version to look up. Omit it to use the highest published version. */
    version?: string;
}

/**
 * A {@link ContextBlock} after every component reference has been
 * resolved to a concrete version and the component content has been loaded. The `requested` field
 * preserves the original declaration so callers can distinguish pinned versions
 * from `'latest'` aliases that were resolved.
 *
 * @internal
 */
export interface ResolvedContext {
    /** Context id. */
    id: string;
    /** Context version. */
    version: string;
    /** Human-readable summary copied from the spec. */
    description?: string;
    /** The spec exactly as declared, before any alias was resolved. */
    requested: ContextBlock;
    /** The resolved scheme. */
    scheme: ResolvedComponent;
    /** The resolved guides, in declaration order. */
    guides?: ResolvedComponent[];
    /** The resolved access policy. */
    access?: ResolvedComponent;
    /** The resolved crosswalks. */
    crosswalks?: ResolvedComponent[];
}

/**
 * One component of a {@link ResolvedContext} after its reference resolved to a
 * concrete version, with the layers stacked on it resolved the same way.
 *
 * @internal
 */
export interface ResolvedComponent {
    /** The reference as declared, which may name an alias such as `latest`. */
    ref: ComponentRef;
    /** Concrete version the reference resolved to. */
    resolvedVersion: string;
    /** Layers declared under this component, in composition order. */
    layers?: ResolvedComponentLayer[];
}

/**
 * One resolved layer inside a {@link ResolvedComponent}. A layer resolves to a
 * concrete version like anything else, and carries no layers of its own: it
 * stacks on the component it is nested under, and nowhere else.
 *
 * @internal
 */
export interface ResolvedComponentLayer {
    /** The layer reference as declared. */
    ref: ComponentRef;
    /** Concrete version the layer reference resolved to. */
    resolvedVersion: string;
}

/**
 * One already-resolved scheme and its ordered layers in a runtime Context.
 *
 * The base and its ordered layers travel together so resolution cannot attach
 * a stack to a different artifact.
 *
 * @internal
 */
export interface ContextSchemeComponent {
    /** Context-local routing key. */
    key: string;
    /** Parsed scheme document. */
    scheme: unknown;
    /** Ordered layer documents applied to this scheme. */
    layers?: unknown[];
}

/**
 * A resolved guide and the ordered guide layers nested under its reference.
 *
 * @internal
 */
export interface ContextGuideComponent {
    /** Parsed base guide document. */
    guide: unknown;
    /** Ordered parsed guide-layer documents. */
    layers?: unknown[];
}

/**
 * A resolved access policy and its ordered, addition-only access layers.
 *
 * @internal
 */
export interface ContextAccessComponent {
    /** Parsed base access document. */
    access: unknown;
    /** Ordered parsed access-layer documents. */
    layers?: unknown[];
}

/**
 * Optional identity carried alongside a runtime {@link Context} instance: the
 * spec id, version, and description that produced it. The runtime class does
 * not require any of these fields, but a resolver attaches them so callers can
 * echo the `(id, version)` of the bundle they are operating against.
 *
 * @public
 */
export interface ContextMetadata {
    /** Id of the Context spec. */
    id?: string;
    /** Caller-requested version or alias, such as `latest`. */
    requestedVersion?: string;
    /** Concrete immutable version selected by the resolver. */
    resolvedVersion?: string;
    /** Human-readable summary copied from the spec. */
    description?: string;
}

/**
 * Arguments accepted by {@link Context.fromComponents}. Each field receives
 * already-resolved component JSON (the kind of payload a resolver inlines into
 * a single response, or that a filesystem helper has read off disk and
 * parsed). The class does not load files itself; callers are responsible
 * for resolving `ComponentRef`s to concrete documents.
 *
 * Resolved guide and access stacks use `guideComponents` and `accessComponent`.
 * Unlayered inputs use the base-only forms; specifying both forms for one
 * family is an error.
 * Scheme layers use `layers` or each keyed scheme's nested `layers`. Guide
 * layers and access layers remain grouped with their own base documents.
 * Crosswalk layers are not accepted yet; resolvers must refuse them explicitly.
 *
 * @internal
 */
export interface ContextFromComponentsArgs {
    /**
     * Base scheme document for the simple form. Mutually exclusive with
     * `schemes`.
     */
    scheme?: unknown;
    /**
     * Ordered scheme layer documents, stacking on `scheme`. When provided, the
     * resulting `scheme` engine is built via the same left-to-right composition
     * used by `composeLayers`; the engine applies them in the order given.
     */
    layers?: unknown[];
    /** Keyed resolved schemes for a multi-scheme Context. */
    schemes?: ContextSchemeComponent[];
    /**
     * Context-local scheme key exposed through `ctx.scheme` in the advanced
     * form.
     */
    primaryScheme?: string;
    /**
     * Ordered guide documents. Loaded into a single `GuideEngine` cascade,
     * later guides take precedence on rule-id conflicts.
     */
    guides?: unknown[];
    /** Resolved guide stacks. Mutually exclusive with `guides`. */
    guideComponents?: ContextGuideComponent[];
    /** Access-policy document. Optional. */
    access?: unknown;
    /** Resolved access stack. Mutually exclusive with `access`. */
    accessComponent?: ContextAccessComponent;
    /** Resolved directional crosswalk documents. */
    crosswalks?: CrosswalkDefinition[];
    /** Optional metadata identifying the spec that produced this context. */
    metadata?: ContextMetadata;
    /** Optional broker sources keyed by source reference. */
    sourceProviders?: SourceProviderMap;
}

/**
 * Map of contextId → versionString → ContextBlock. Outer key is the
 * kebab-case context id; inner key is the literal version string declared in
 * the file. A given (id, version) pair is unique within a deployment.
 *
 * @internal
 */
export type ContextMap = Map<string, Map<string, ContextBlock>>;

/**
 * A handle returned by `loadContextsFile`. The caller reads the current
 * {@link ContextMap} via `getContexts()`. With `watch` enabled the loader swaps
 * in a new map whenever the file changes and notifies `onChange()` listeners;
 * `stop()` ends watching.
 *
 * @internal
 */
export interface ContextsFileHandle {
    /** Returns the most recently loaded map. */
    getContexts: () => ContextMap;
    /**
     * Returns the spec with the highest semver version for a Context id, or
     * `undefined` when the id is not in the file.
     *
     * @param id - Context id.
     */
    resolveLatest: (id: string) => ContextBlock | undefined;
    /**
     * Registers a listener called with the new map after the watched file
     * changes and parses. Returns a function that removes the listener.
     *
     * @param listener - Called with the new map.
     */
    onChange: (listener: (contexts: ContextMap) => void) => () => void;
    /**
     * Registers a listener called when a changed file fails to read or parse.
     * The previous map stays current. Returns a function that removes the
     * listener.
     *
     * @param listener - Called with the error.
     */
    onError: (listener: (error: Error) => void) => () => void;
    /** Stops watching and removes every listener. */
    stop: () => void;
}

/**
 * Options for {@link loadContextsFile}.
 *
 * @internal
 */
export interface LoadContextsFileOptions {
    /**
     * Enable hot-reload by polling the file on a fixed interval. Defaults to
     * `false`.
     */
    watch?: boolean;
    /** Polling interval in milliseconds. Defaults to 1000. */
    watchIntervalMs?: number;
}

/**
 * Options for the client-side context helper.
 *
 * @internal
 */
export interface LoadContextOptions {
    /**
     * Root directory for component files. Component files are resolved using
     * the path convention `{componentRoot}/{type}/{id}/v{version}/{type}.json`.
     * Defaults to `'./schemes'`.
     */
    componentRoot?: string;
}
