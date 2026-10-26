import type {
    ContextAccessRef,
    ContextCrosswalkRef,
    ContextGuideRef,
    ContextSchemeRef,
} from './context';

/**
 * The body inside the top-level `context:` envelope. References a scheme plus
 * optional guides, a single optional access policy and optional crosswalks by
 * `(id, version)`; resolution to concrete content happens server-side. The
 * crosswalk references make reviewed translations between the referenced
 * scheme and another scheme available to the Context; the resolver loads those
 * scheme dependencies from the crosswalk artifacts.
 *
 * Every reference may carry layers, nested inside the reference they derive
 * from, in the one shape that holds for all four families.
 *
 * Context is pure composition: it names which artifact versions to load and
 * operate on. Artifact-internal concerns (sources, auth, pins, mappings) live
 * on the referenced Scheme/Guide/Access versions, not here.
 *
 * @public
 */
export interface ContextBlock {
    /**
     * Unique context identifier: lowercase letters, digits and hyphens,
     * starting with a letter or digit.
     *
     * @pattern ^[a-z0-9][a-z0-9-]*$
     */
    id: string;
    /**
     * Semantic version of this context.
     *
     * @pattern ^\d+\.\d+(\.\d+)?(-[0-9A-Za-z.-]+)?(\+[0-9A-Za-z.-]+)?$
     */
    version: string;
    /** Longer description of what this context composes and who uses it. */
    description?: string;
    /**
     * Required scheme reference. Layers stack on the base scheme and are nested
     * under it because a layer is a derivative of _that_ scheme; it cannot be
     * paired with a different base.
     */
    scheme: ContextSchemeRef;
    /**
     * Optional guide references; later guides take precedence on rule-id
     * conflicts. Layers stack on a base guide and are nested under it because a
     * layer is a derivative of _that_ guide; it cannot be paired with a
     * different base.
     */
    guides?: readonly ContextGuideRef[];
    /**
     * Optional directional crosswalk artifact references. Layers stack on a
     * base crosswalk and are nested under it because a layer is a derivative of
     * _that_ crosswalk; it cannot be paired with a different base.
     */
    crosswalks?: readonly ContextCrosswalkRef[];
    /**
     * Optional access-policy reference. A Context binds to at most one access
     * policy. Layers stack on the base policy and are nested under it because a
     * layer is a derivative of _that_ policy; it cannot be paired with a
     * different base.
     */
    access?: ContextAccessRef;
}

/**
 * Top-level YAML document for a Context: `{ context: { ... } }`, the same
 * envelope every other family wears. A runtime reads it from disk or from an
 * installed artifact and resolves the references in its body.
 *
 * @public
 */
export interface ContextDefinition {
    /** Root `context:` envelope. All fields live inside it. */
    context: ContextBlock;
}
