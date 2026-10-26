/**
 * The cross-family layer contract.
 *
 * A layer is not a scheme feature. It is the one way a composable artifact is
 * completed by someone who cannot edit it: an organization that receives a
 * scheme, a crosswalk, a guide, or an access policy from above holds it
 * read-only, and authors a layer to say what its own situation adds. Four
 * families are layerable, and they all use the same envelope, so what an author
 * learns once holds everywhere.
 *
 * This file states the rules once. The per-family payloads
 * ({@link LayerBlockDoc}, {@link CrosswalkLayer}, {@link GuideLayer},
 * {@link AccessLayer}) carry the fields that only their own family can have,
 * and point back here for how composition works.
 */

/**
 * What every layer block carries, whatever family it belongs to.
 *
 * ## The envelope
 *
 * A layer document declares `type: layer` and carries exactly one `layer:`
 * block beside the artifact's own id. The discriminator is a single field, so
 * layer-ness is never inferred from a combination of others. What the block
 * holds is family-specific: a scheme layer names the concepts and categories it
 * takes away, a crosswalk layer names mappings and selections, a guide layer
 * names rules, an access layer names nothing at all because it is only allowed
 * to add.
 *
 * ## Binding
 *
 * A layer binds to its base by nesting under that base's reference in the
 * Context, not by a field alongside it. A layer is semantically a derivative of
 * _that_ artifact; it cannot be paired with a different base, so nesting it
 * keeps the coupling explicit and unmistakable. `base` here names the same
 * artifact in `id@version` form, and a load that finds the two disagreeing
 * fails rather than guessing.
 *
 * ## Composition
 *
 * Ordering and authoring work the same way everywhere. Removal and override do
 * not: the access family departs from both, and the departure is stated on the
 * rule it departs from rather than left for a reader to find further down.
 *
 * - Declaration order is composition order. Layers apply left to right after
 *   the base, and `requires` makes an ordering constraint that must hold at
 *   load time rather than a hint an author is trusted to honor.
 * - What a layer adds or replaces is written in the ordinary sections of an
 *   ordinary, complete, valid document of that family. There is no separate
 *   "additions" grammar to learn.
 * - In the scheme, crosswalk, and guide families, what a layer takes away is
 *   listed in the block as a typed reference, such as `{ concept: 'X' }` or
 *   `{ mapping: 'Y' }`. A reference rather than a path into today's storage
 *   shape, and a closed set, so a typo fails at load instead of silently
 *   removing nothing. An access layer has no removal vocabulary at all.
 * - In those same three families, a colliding id means the later declaration
 *   wins. The composed result shows only the winner: the resolved definition is
 *   the later one, and an assertion of a concept that a later layer's external
 *   source supplies carries that source's `provenance`. No record names the
 *   element the layer replaced, so an override is reviewed where it is
 *   written: in the layer that restates the id, against its base. In the
 *   access family a collision is a composition error the loader refuses; there
 *   is no last-wins rule to apply.
 *
 * ## Where the families differ
 *
 * Scheme, crosswalk, and guide layers may add, override, and remove. An access
 * layer may only add: it maps concepts the base left unmapped and alters
 * nothing the base decided. A rule id that collides with the base is a
 * composition error, not an override, and there is no removal vocabulary to
 * express. A child organization may complete what its parent could not know; it
 * may not change what its parent decided. Authority fails closed.
 */
export interface LayerBinding {
    /** The artifact or layer this one stacks on, as `id@version`. */
    base: string;
    /**
     * Layers that must be present AND composed before this one. A layer that
     * builds on what another layer introduced, or restores what another layer
     * removed, only means anything on top of that layer, so the ordering is a
     * load-time constraint rather than a hint.
     */
    requires?: string[];
}
