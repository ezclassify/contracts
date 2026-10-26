import type { Vocabulary } from './scheme';
import type { GuideCategory, GuideDependency, GuideRule } from './guide';
import type { ExternalSourceSpec, RuleMappingDoc } from './external-source';
import type { LayerBinding } from './layer';

/**
 * One element a guide layer takes away, named by kind and id. Exactly one key.
 *
 * The same reference-not-a-path reasoning as the scheme family: a rule or a
 * category is addressed by its id, which survives a storage change and
 * validates as a closed set.
 */
export type GuideLayerRemoval =
    | {
          /** The id of the guide rule to remove. */
          rule: string;
      }
    | {
          /** The id of the guide category to remove. */
          category: string;
      };

/**
 * The guide family's layer payload. Required when `type: 'layer'`, forbidden
 * otherwise.
 *
 * Layering a guide is for _tailoring_ one that arrived from above. Adding
 * guidance needs no layer at all, because a Context holds a list of guides and
 * an organization can simply add its own. What an organization cannot do is
 * edit a guide it received read-only, so a layer is how it narrows a rule that
 * does not fit its mission or drops one that does not apply. The layer's own
 * `rules` and `categories` are the additions and overrides, written as an
 * ordinary guide document; what it takes away is listed here.
 *
 * Binding and merge rules are the cross-family ones: see `LayerBinding`.
 * A guide layer may add, override, and remove; later wins on a colliding id.
 * Guidance is advisory content, so an override changes what an author is told,
 * never what the engine permits.
 */
export interface GuideLayer extends LayerBinding {
    /** Rules and categories inherited from below that this layer takes away. */
    removes?: GuideLayerRemoval[];
    /**
     * Rules and categories an earlier layer removed that this one brings back,
     * with the definition they had below. Naming an element in both `removes`
     * and `restores` is a load error.
     */
    restores?: GuideLayerRemoval[];
}

/**
 * Inline-or-external guide-rule block. The canonical 1.0 wire format for
 * `GuideBlock.rules`.
 *
 * @public
 */
export interface GuideRulesBlock {
    /**
     * Inline rules, authored as an array of `GuideRule` entries with `id`
     * carried as a field on each entry, matches the scheme inline shape
     * (`data.concepts.inline: [...]`) so authoring stays uniform across scheme
     * and guide YAML. Uniqueness of `id` within the array is enforced by the
     * loader's validator; the engine builds a `Map<string, GuideRule>` index at
     * load time to keep id lookups O(1).
     */
    inline?: GuideRule[];
    /**
     * Live external rule sources. An array allows a guide to draw rules from
     * multiple upstream endpoints, composed via `ChainedGuideRuleSource`
     * at load time.
     */
    external?: ExternalSourceSpec<RuleMappingDoc>[];
}

/**
 * The body inside the top-level `guide:` envelope: what a marking guide
 * declares. The runtime `Guide` is the engine's resolved in-memory shape after
 * loading and is not part of the published contract.
 *
 * @public
 */
export interface GuideBlock {
    /** Unique guide identifier. */
    id: string;
    /** Semantic version of this guide. */
    version: string;
    /** Human-readable guide name. */
    name: string;
    /** Longer description of what this guide covers. */
    description?: string;
    /**
     * Display words this guide advertises for UI consumers. A presentation
     * hint only.
     */
    vocabulary?: Vocabulary;
    /**
     * What kind of document this is. Absent means `'guide'`. `type: 'layer'`
     * requires the `layer` block and `type: 'guide'` forbids it, both enforced
     * at load. Every layerable family wears this same envelope; see
     * `LayerBinding`.
     */
    type?: 'guide' | 'layer';
    /**
     * The guide family's layer payload. Required when `type: 'layer'`,
     * forbidden otherwise.
     */
    layer?: GuideLayer;
    /** Target scheme dependencies: at least one required. */
    targetSchemes: GuideDependency[];
    /** Sections for organizing rules in the UI. */
    categories?: GuideCategory[];
    /** Guide rules: inline array and/or external sources. */
    rules: GuideRulesBlock;
}

/**
 * Top-level YAML document for a marking guide: `{ guide: { ... } }`. This is
 * the published 1.0 format every customer authors against.
 *
 * Read it aloud and it says what it is: this document is a guide. A scheme
 * file is `{ scheme: ... }`, an access file is `{ access: ... }`, a crosswalk
 * file is `{ crosswalk: ... }`, a context file is `{ context: ... }`; a guide
 * file is `{ guide: ... }`. The envelope is also what makes a document
 * self-describing on disk: a tool handed a file with no other context reads
 * the envelope key to learn the kind.
 *
 * @public
 */
export interface GuideDefinition {
    /** Root `guide:` envelope. All fields live inside it. */
    guide: GuideBlock;
}
