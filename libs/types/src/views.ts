/**
 * Render-ready structural view types for scheme Handbook and guide Guidebook
 * components.
 *
 * These shapes are produced by engine.buildSchemeView /
 * engine.buildGuideView(s) and returned by a remote client for remote
 * rendering. Components walk the tree to render categories and items without
 * needing to know the full scheme definition.
 */

import type {
    ConceptColor,
    ConditionalDefaultConcept,
    ConceptNotice,
    EachAffix,
    MarkingColorRule,
    ProcessingRole,
    ReferenceSurfaceLabel,
    Rollup,
    SortType,
    TierComposition,
    ValueEncoding,
    Vocabulary,
    When,
} from './scheme';
import type { SyntaxDoc } from './scheme-definition';

/**
 * Filter result shared by filterConcepts (Handbook) and filterGuideRules
 * (Guidebook). Components toggle a hidden CSS class on rows whose id is not in
 * visibleIds, update category headings from categoryCounts, and show a "no
 * results" notice when total.visible === 0.
 */
export interface FilterResult {
    /** Ids of the items that matched the query. */
    visibleIds: Set<string>;
    /**
     * Per-category counts keyed by category id. Guide's compound bucket is
     * keyed `_compound`.
     */
    categoryCounts: Map<
        string,
        {
            /** Items in the category that matched the query. */
            visible: number;
            /** Items in the category. */
            total: number;
        }
    >;
    /** Global visible / total. Drives the "no results" indicator. */
    total: {
        /** Items that matched the query. */
        visible: number;
        /** Items in every category. */
        total: number;
    };
}

/**
 * One section of a structural view: a labeled bucket of Handbook concepts or
 * Guidebook rules.
 */
export interface StructuralViewCategory {
    /** The category id. */
    id: string;
    /** The category's display label. */
    label: string;
    /**
     * Typed items within this category: ConceptView for schemes, GuideRuleView
     * for guides.
     */
    items: unknown[];
}

/**
 * Render-ready tree produced by buildSchemeView / buildGuideView(s). Same shape
 * for both, only the item type changes. Components render categories in
 * declared order, items inside, with an uncategorized fallback bucket.
 * `SchemeStructuralView` and `GuideStructuralView` are this shape for each
 * kind, declared on their own so each documents what it holds.
 */
export interface StructuralView<Item> {
    /** The id of the scheme or guide. */
    id: string;
    /** The scheme's or guide's display name. */
    name: string;
    /** The scheme's or guide's description. Empty when it declares none. */
    description: string;
    /** Categories in their declared scheme / guide order. */
    categories: Array<{
        /** The category id. */
        id: string;
        /** The category's display label. */
        label: string;
        /** The category's items, in declared order. */
        items: Item[];
    }>;
    /** Items that declare no category (rare; falls through to a shared bucket). */
    uncategorized: Item[];
    /** Optional raw display-term overrides from the scheme/guide. */
    vocabulary?: Vocabulary;
}

/**
 * Names for the shapes a format's layout is written in.
 *
 * Each of these is a schema a generated SDK gets as its own declared type. Left
 * inline, they arrive as anonymous nested objects and closed enums that every
 * SDK has to invent a name for, differently, so the same wire field ends up
 * with a different type in each language.
 */

/** Whether a heading is written before or after the values it heads. */
export type FormatHeaderPosition = 'prefix' | 'suffix';

/** How a format runs the fields it writes together. */
export type RenderFormatMode = 'inline' | 'block';

/** What is written between two values of one category, keyed by category id. */
export type CategorySeparatorMap = Record<string, string>;

/** What is written immediately before a category, keyed by category id. */
export type CategoryLeadingSeparatorMap = Record<string, string>;

/** The concept view a category is written in, keyed by category id. */
export type CategoryViewMap = Record<string, string>;

/** How a category's tiered concepts compose, keyed by category id. */
export type CategoryTierMap = Record<string, TierComposition[]>;

/** What is written around every single value of a category, keyed by category id. */
export type CategoryEachAffixMap = Record<string, EachAffix>;

/**
 * A concept that heads the values of another category, resolved to the list it
 * heads.
 *
 * A format writes some categories as a named heading followed by the values it
 * introduces. The pairing lives in the authored field tree, which stays
 * server-side, so it is resolved here: which concept is the heading, which
 * category that concept belongs to, and which category's values it heads. A UI
 * that groups values under their heading needs all three; nothing about the
 * grammar that produced them comes with it.
 */
export interface FormatHeaderAssociation {
    /** The concept written as the heading. */
    concept: string;
    /** The category the heading concept is asserted in. */
    headerCategory: string;
    /** The category whose values the heading introduces. */
    category: string;
    /** Whether the heading is written before or after the values it heads. */
    position: FormatHeaderPosition;
}

/**
 * How one format lays a marking out, for a surface that has to place the parts
 * itself rather than ask the server for a string.
 *
 * Everything here is resolved: the field tree is authoring content and stays
 * server-side, so what a UI gets is the order the categories come out in, the
 * text written at each boundary, the text written around every single value,
 * and the headings paired with the lists they head. A conditional affix is
 * deliberately absent, because whether it is written depends on the state and
 * that is a server question.
 */
export interface RenderFormatLayout {
    /**
     * The output this entry describes, named by callers choosing an output
     * format. For a scheme without `render.surfaces` it is a format id, which
     * callers also name as an input format.
     *
     * For a scheme with them it is an output address, `surface/view`, and the
     * layout described is the one that view's base format writes; a view with
     * cases describes its base format. A view entry's `categoryOrder` and
     * per-category maps cover only the categories its surface owns, so two
     * views over one multi-surface format describe different category sets.
     * A caller may also name the address as an input format, and
     * `RenderConfigDoc.surfaces` says which forms that reads. Recognition
     * reports the view it read the text as in `recognition.inputFormat`, the
     * same address. These entries describe views; a view's forms are not
     * entries of their own, and `contextFormats` lists them by role.
     */
    id: string;
    /**
     * The semantic part of a marking this entry writes, a scheme scope id: the
     * format's surface, or for a scheme with `render.surfaces`, the surface
     * this output writes.
     */
    surface: string;
    /**
     * The view part of `id`, for a scheme that declares `render.surfaces`. It
     * holds the plain view id, not the percent-encoded form `id` carries. Not
     * a concept spelling view; that is `view`. Absent for a scheme whose
     * formats are its outputs.
     */
    outputView?: string;
    /**
     * For a scheme that declares `render.surfaces`, the roles this view is its
     * surface's default for: the roles a marking is written in this view for
     * when a request names none. A surface whose `default` is one view id
     * lists both roles on that view. A surface with a default per role lists
     * `whole` on the whole's view and `part` on the part's, both on one view
     * when they are the same. Empty on the surface's other views, so a picker
     * filling a part field finds the part default on any surface. Absent for a
     * scheme whose formats are its outputs, which has one default,
     * `defaultRenderFormat`.
     */
    defaultFor?: ProcessingRole[];
    /**
     * For a scheme that declares `render.surfaces`, the role of the markings
     * this view is a view of, as the view declares it. Text read as this view
     * is a marking of this role. Absent for a view with no role, and for a
     * scheme whose formats are its outputs.
     */
    role?: ProcessingRole;
    /** Layout: `inline` runs the fields together, `block` puts each on its own line. */
    mode: RenderFormatMode;
    /** Default concept view for fields that do not name one. */
    view?: string;
    /** Written once before the nonempty whole, when it is written unconditionally. */
    prefix?: string;
    /** Written once after the nonempty whole, when it is written unconditionally. */
    suffix?: string;
    /** What this format writes between two adjacent categories by default. */
    separator?: string;
    /** The categories this format writes, in the order it writes them. */
    categoryOrder: string[];
    /**
     * What is written between two values of one category, keyed by category id.
     * A category absent from the map writes its values with no separator.
     */
    categorySeparators?: CategorySeparatorMap;
    /**
     * What is written immediately before a category, keyed by category id, with
     * the format's per-boundary joins already applied. The first category in
     * `categoryOrder` has nothing before it and is absent.
     *
     * The joins are resolved rather than published raw: a join names the two
     * fields it sits between, and a field is a tree node a UI does not have.
     */
    separatorBefore?: CategoryLeadingSeparatorMap;
    /**
     * The concept view a category is written in, keyed by category id, where
     * it differs from the format's own `view`.
     *
     * A field may write in a view of its own, which is how one format writes a
     * control in its short spelling beside a level in its spelled-out one. A
     * category absent from the map is written in the format's view.
     */
    categoryViews?: CategoryViewMap;
    /**
     * How a category's tiered concepts compose into one token, keyed by
     * category id, outermost tier first.
     *
     * A concept of a lower tier does not stand beside the one it belongs to;
     * it attaches to it, and what goes between them is the attachment rather
     * than the category's own separator. A category absent from the map writes
     * its values as plain values.
     *
     * The resolved `TierComposition` the scheme model already carries, not a
     * second shape saying the same thing: what a surface needs here is what a
     * field was authored with, and one representation is what keeps the two
     * answers from drifting.
     */
    categoryTiers?: CategoryTierMap;
    /**
     * What is written around every single value of a category, keyed by
     * category id, as opposed to once around all of them.
     *
     * A category whose values each carry a marker of their own is written by a
     * field that declares `each`, and the marker belongs to the value rather
     * than to the list: a surface placing three values with a separator between
     * them writes the affix three times and the separator twice. A category
     * absent from the map writes its values bare.
     *
     * Unconditional by construction. Unlike the format's own `prefix` and
     * `suffix`, which are parts that may each sit behind a condition and are
     * published only where they do not, `each` is two plain strings with
     * nowhere for a condition to be written, so nothing here is left out.
     */
    categoryEach?: CategoryEachAffixMap;
    /** Headings this format writes, paired with the lists they head. */
    headers?: FormatHeaderAssociation[];
}


/**
 * Lightweight metadata view of a loaded scheme: id, version, name, and
 * structural options only. Does not include concepts, categories, or rules.
 *
 * Returned by `SchemeEngineAdapter.getSchemeMeta()`. Prefer this over the full
 * scheme accessor when only identity or configuration metadata is needed.
 */
export interface SchemeMetaView {
    /** Scheme identifier (e.g. `'cedar-valley-protection'`). */
    id: string;
    /** Semantic version string (e.g. `20161231.0.0`). */
    version: string;
    /** Human-readable display name. */
    name: string;
    /** Longer description of what this scheme covers. */
    description?: string;
    /**
     * Human-readable definition of the scheme (shown in tooltips / about
     * panels).
     */
    definition?: string;
    /** Usage guidance for the scheme (detailed, shown in reference views). */
    guidance?: string;
    /**
     * ID of the category that drives the marking's display color (from
     * `render.color_from`). Undefined when the scheme does not use category
     * color mode. A host pairs this with the resolved marking's assertion in
     * that category to look up the concept's `color`.
     */
    colorFrom?: string;
    /**
     * Ordered scheme-default compound color rules. First matching rule wins;
     * consuming hosts retain final presentation precedence.
     */
    colorRules?: MarkingColorRule[];
    /**
     * License label shown with the scheme, such as `enterprise`.
     * Informational only: it does not grant or restrict use.
     */
    license?: string;
    /** Document kind. Absent means `'scheme'`. */
    type?: 'scheme' | 'layer';
    /**
     * Default scope ID applied when none is selected. Present exactly when the
     * scheme declares at least one scope.
     */
    defaultScope?: string;
    /** Display label for the scope selector shown in UIs. */
    scopeLabel?: string;
    /**
     * When true, this scheme reads a marking in the role its context gives, and
     * a part's rules can read the whole it is part of. Whether or not it is,
     * `process`, `validate` and `explain` compare a part that is valid on its
     * own with a whole that reads and is valid.
     */
    roleAware?: boolean;
    /** Scheme-authored display vocabulary. */
    vocabulary?: Vocabulary;
    /**
     * Display label for this scheme's own reference component, the Handbook:
     * the scheme's override from `vocabulary.handbook` (e.g. "Rule Book" for a
     * scheme whose authors call it that) or the generic "Handbook" /
     * "Handbooks" when the scheme declares none. Always populated; resolved via
     * the same chokepoint pattern as `vocabulary`/`roleNoun`.
     */
    referenceSurfaceLabel: ReferenceSurfaceLabel;
    /**
     * Available scopes: id and display label, in declared order. Which one is
     * the default is `defaultScope`.
     */
    scopes?: Array<{
        /** Scope id. */
        id: string;
        /** Display label for the scope. */
        label: string;
    }>;
    /**
     * The formats this scheme writes, each with the layout it writes. For a
     * scheme that declares `render.surfaces`, one entry per view in result
     * order, and the formats that are the views' forms are not listed on
     * their own.
     */
    formats?: RenderFormatLayout[];
    /**
     * ID of the default render format applied when no format is specified. For
     * a scheme that declares `render.surfaces`, the `surface/view` address of
     * the view the default scope's surface writes a marking with no role in,
     * which is its default for a whole.
     */
    defaultRenderFormat?: string;
    /**
     * Resolved default render-format ID for part markings (the `part` role).
     * Taken from `contextFormats.part[0]`, falling back to
     * `defaultRenderFormat`.
     *
     * For a scheme that declares `render.surfaces`, the `surface/view` address
     * of the default scope's surface's default for a part, from that
     * surface's `default`. It does not depend on `contextFormats`, which lists
     * the formats each role is read in and says nothing about output.
     */
    defaultPartRenderFormat?: string;
    /**
     * Resolved default render-format ID for whole-document markings (the
     * `whole` role). Derived from `contextFormats.whole[0]`; falls back to
     * `defaultRenderFormat`.
     *
     * For a scheme that declares `render.surfaces`, the `surface/view` address
     * of the default scope's surface's default for a whole, from that
     * surface's `default`, the same way `defaultPartRenderFormat` is resolved
     * for a part.
     */
    defaultWholeRenderFormat?: string;
    /** Named label presets: shorthand marking strings with display labels. */
    labelPresets?: Array<{
        /** Preset id, which `applyPreset` takes. */
        id: string;
        /** Display label for the preset. */
        label: string;
        /** Longer explanation of when to use the preset. */
        description?: string;
    }>;
}

/** How a format's text is framed: plain text or XML attributes on one element. */
export type FormatSyntaxType = SyntaxDoc['type'];

/**
 * A format's encoding: which framing it uses, and nothing about the settings
 * that framing takes, which are authoring content.
 */
export interface FormatSyntax {
    /** The framing this format writes its text in. */
    type: FormatSyntaxType;
}

/**
 * A format as the server describes it: what it writes and how it lays a
 * marking out, not how it is built.
 *
 * A format's field tree is authoring content. It stays server-side, because the
 * operations that need it (recognition, rendering, repair) are server
 * operations, and a client that held the tree would be holding a second
 * implementation of them. What a client legitimately needs is enough to name a
 * format in a request, to label it in a picker, and to place a marking's parts
 * itself: the resolved layout `RenderFormatLayout` describes, plus how the text
 * is framed.
 *
 * The same shape whether a local engine or a remote client answers.
 */
export interface FormatView extends RenderFormatLayout {
    /** Encoding. Absent means plain text. */
    syntax?: FormatSyntax;
}

/**
 * A named shortcut marking, name only: the marking it stands for stays
 * server-side and is expanded by `applyPreset`.
 */
export interface LabelPresetView {
    /** Preset id, which `applyPreset` takes. */
    id: string;
    /** Display label for the preset. */
    label: string;
    /** Longer explanation of when to use the preset. */
    description?: string;
    /**
     * Id of the scope the preset belongs to. A preset without one belongs to
     * the scheme's `defaultScope`.
     */
    scope?: string;
}

/** Concept positions used by one category when position sorting is selected. */
export type CategoryPositionOverrides = Record<string, number>;

/**
 * Public DTO for the resolved scheme: concepts, categories, and render formats.
 *
 * Contains the full rendered scheme needed for client-side operations
 * (parsing, rendering, autocomplete) without exposing internal rule evaluation
 * structures. External consumers should type against this interface rather than
 * the internal `Scheme` runtime type.
 */
export interface SchemePublicView {
    /** Scheme identifier. */
    id: string;
    /** Semantic version of the loaded scheme. */
    version: string;
    /** Human-readable display name. */
    name: string;
    /** Longer description of what this scheme covers. */
    description?: string;
    /** Human-readable definition shown in scheme reference surfaces. */
    definition?: string;
    /** Detailed usage guidance shown in scheme reference surfaces. */
    guidance?: string;
    /** Category whose selected concept supplies the marking color. */
    colorFrom?: string;
    /** Ordered compound color rules; first matching rule wins. */
    colorRules?: MarkingColorRule[];
    /** See {@link SchemeMetaView.license}. */
    license?: string;
    /** Document kind. Absent means `'scheme'`. */
    type?: 'scheme' | 'layer';
    /** See {@link SchemeMetaView.defaultScope}. */
    defaultScope?: string;
    /** Display label for the scope selector. */
    scopeLabel?: string;
    /** See {@link SchemeMetaView.roleAware}. */
    roleAware?: boolean;
    /** Scheme-authored display vocabulary. */
    vocabulary?: Vocabulary;
    /**
     * Display label for this scheme's own reference component, the Handbook.
     * See {@link SchemeMetaView.referenceSurfaceLabel}.
     */
    referenceSurfaceLabel: ReferenceSurfaceLabel;
    /** See {@link SchemeMetaView.scopes}. */
    scopes?: Array<{
        /** Scope id. */
        id: string;
        /** Display label for the scope. */
        label: string;
    }>;
    /**
     * The format id a render that names no format will use: the scheme's
     * declared default where it has one, and its first declared format
     * otherwise. Both adapters resolve it the same way, so a caller sees the
     * same id locally and over the wire.
     *
     * Omitted only when the scheme declares no render formats, because then
     * there is no id to give. It is never filled with a placeholder: `default`
     * is an ordinary format id, so a placeholder drawn from that space would
     * name a format the caller could send back and have refused.
     *
     * For a scheme that declares `render.surfaces`, this is the `surface/view`
     * address of the view the default scope's surface writes a marking with
     * no role in, which is its default for a whole.
     */
    defaultRenderFormat?: string;
    /**
     * Present only for a scheme that declares `render.surfaces`: the output
     * address a part marking is written in by default, resolved as
     * {@link SchemeMetaView.defaultPartRenderFormat} describes.
     */
    defaultPartRenderFormat?: string;
    /**
     * Present only for a scheme that declares `render.surfaces`: the output
     * address a whole marking is written in by default, resolved as
     * {@link SchemeMetaView.defaultWholeRenderFormat} describes.
     */
    defaultWholeRenderFormat?: string;
    /** Every concept in the scheme, as display views. */
    concepts: ConceptView[];
    /** Every category in the scheme, in declared order. */
    categories: CategoryView[];
    /**
     * The formats this scheme writes, described rather than reproduced. For a
     * scheme that declares `render.surfaces`, one entry per output, in result
     * order. Each entry's `id` is what a caller names as an output format, and
     * also as an input format; see {@link RenderFormatLayout.id}.
     */
    formats: FormatView[];
    /**
     * Named shortcut markings, name only: expansion stays server-side (see
     * `SchemeEngineAdapter.applyPreset`). `scope` references a `scopes[].id` so
     * pickers can group presets per scope and offer the presets mode only to
     * fields whose scope has any. Empty when the scheme declares none.
     */
    labelPresets: LabelPresetView[];
    /**
     * Ways a marking can appear inside free text, which a scanner matches and
     * an editor uses to insert a new marking.
     */
    embeddedMarking?: Array<{
        /**
         * Regular expression source, without flags, whose first capture group
         * is the marking text.
         */
        pattern: string;
        /**
         * Text written when a marking is inserted, with `{marking}` replaced by
         * the rendered marking.
         */
        template: string;
    }>;
    /**
     * The format ids each role is read in. For a scheme without
     * `render.surfaces`, the lists `role_detection` gives. For a scheme with
     * them, derived from the views: each role lists the forms of the views
     * that state it, `format`, case formats and `also_read_in` in that order,
     * surfaces and views in declared order and each format once.
     */
    contextFormats?: {
        /** Format ids a whole marking is read in. */
        whole: string[];
        /** Format ids a part marking is read in. */
        part: string[];
    };
    /**
     * How much text a part marking governs in a document audit: 'paragraph'
     * (default), 'until-next', or 'document'.
     */
    partScope?: 'paragraph' | 'until-next' | 'document';
    /**
     * When a document audit requires each role's marking, from
     * `role_detection.<role>.required_when`. A role without a condition keeps
     * the default: a whole marking is optional and part markings are required.
     */
    markingRequirements?: {
        /** Condition under which the document needs a whole marking. */
        whole?: When;
        /** Condition under which body text needs a part marking. */
        part?: When;
    };
}

/**
 * Resolved view of a scheme category, suitable for display and selection UIs.
 *
 * Returned by `SchemeEngineAdapter.listCategories()`. Field names mirror the
 * YAML `CategoryDoc` shape so consumers reading the source YAML and calling the
 * API see identical names.
 */
export interface CategoryView {
    /** Unique category identifier. */
    id: string;
    /** Resolved human-readable label (always a plain string). */
    label: string;
    /** Whether at least one concept is required for a valid marking. */
    required?: boolean;
    /** Whether only one concept can be selected in this category. */
    single?: boolean;
    /** Rollup operator used when aggregating multiple markings. */
    rollup: Rollup;
    /** Sort order for concepts within this category. */
    sort?: SortType | SortType[];
    /** Concept positions used only by this category's position sort. */
    positionOverrides?: CategoryPositionOverrides;
    /** Scope IDs this category is visible in. */
    scopes?: string[];
    /**
     * Declared rendering position (lower = earlier). Not resolved from array
     * order.
     */
    position?: number;
    /**
     * When true, the category grades its concepts by severity `rank`, and a
     * coverage comparison counts a whole-marking concept here as covering a
     * part's concept of equal or lower rank. It does not change rendering.
     */
    hierarchyRoot?: boolean;
    /**
     * Concept ID to assert automatically when no selection exists in this
     * category. With `single: true`, this provides a default level. Mirrors
     * the scheme's `default_concept` for the category.
     */
    defaultConcept?: string | ConditionalDefaultConcept;
}

/**
 * Resolved view of a concept, suitable for display and adapter consumers.
 *
 * Returned by `SchemeEngineAdapter.getConceptsInCategory()`. Field names mirror
 * the YAML `ConceptDoc` shape. `position` and `rank` are concrete numbers
 * (already resolved from relative specs by the loader).
 *
 * `rulesReferencing` is populated by `buildSchemeView` (Handbook) and omitted
 * by `getConceptsInCategory`; treat it as absent unless explicitly set.
 */
export interface ConceptView {
    /** Unique concept identifier. */
    id: string;
    /** Human-readable display name. */
    name: string;
    /**
     * Display representations keyed by view name; includes at least
     * `'default'`.
     */
    views: Record<string, string>;
    /**
     * Portable scheme-default display color pair, present only on concepts in
     * the scheme's category-based `color_from` mode. Absent otherwise.
     */
    color?: ConceptColor;
    /** Alternative strings that parse to this concept. */
    aliases: string[];
    /** Category IDs this concept belongs to. */
    categories: string[];
    /** Broader concept IDs forming the hierarchy chain. */
    parents: string[];
    /** Resolved rendering position within a category (lower = earlier). */
    position: number;
    /**
     * Resolved severity rank for max/min rollup aggregation (higher = more
     * severe).
     */
    rank?: number;
    /** Tier label: marks this concept as a partial marking. */
    tier?: string;
    /** For group concepts: the member concept IDs. */
    members?: string[];
    /** Scope IDs this concept is visible in. */
    scopes?: string[];
    /** Whether this concept is deprecated. */
    deprecated?: boolean;
    /** Human-readable deprecation message. */
    deprecatedMessage?: string;
    /** Concept ID that should be used instead of this deprecated concept. */
    deprecatedReplacement?: string;
    /** Definition text from the concept's documentation block. */
    definition?: string;
    /**
     * Where this concept came from: the provenance text the scheme records
     * against it.
     *
     * Inert. Nothing in the engine reads it and no decision turns on it; it is
     * what a reference surface shows when a reader asks why a concept is
     * spelled the way it is. Published here because this projection is the only
     * one a remote client can reach, and a scheme that makes the field
     * mandatory had nowhere to put it.
     */
    citation?: string;
    /** Usage guidance from the concept's documentation block. */
    guidance?: string;
    /** Regulatory or policy notices shown with this concept. */
    notices?: ConceptNotice[];
    /**
     * Human-readable summary of rules that reference this concept. Set by
     * `buildSchemeView`; absent from `getConceptsInCategory`.
     */
    rulesReferencing?: string[];
    /** Text-input configuration for free-text concepts. */
    textInput?: {
        /** Hint text shown in the empty input. */
        placeholder?: string;
        /** Label shown with the input. */
        label?: string;
        /** Whether a value must be provided. Defaults to true. */
        required?: boolean;
        /** How the value is spelled and stored. Absent means plain text. */
        encoding?: ValueEncoding;
    };
}

/**
 * Item row rendered by the Guidebook / GuideChecklist (one per rule in a
 * guide).
 */
export interface GuideRuleView {
    /** The rule id. */
    id: string;
    /** The rule's display name. */
    name: string;
    /** The rule's description, when it declares one. */
    description?: string;
    /**
     * The rule's outcome for display: its rendered marking, or its concept ids
     * listed in order when it has none. Empty when the outcome carries neither.
     */
    outcomeText: string;
    /** The rule's `when` condition in words. Set only on a computed rule. */
    whenText?: string;
    /** True when the rule has a `when` condition and is activated by it. */
    isComputed: boolean;
    /** The keywords a text scan matches for this rule. */
    keywords: string[];
    /**
     * Labels like "IPv4 address", "CIDR block", already resolved via
     * getMatcher.
     */
    matcherLabels: string[];
    /** Rule ids this compound rule references. */
    dependsOn: string[];
    /**
     * Resolved display names for each id in `dependsOn`, index-aligned, so a
     * "depends on" line reads the rule's name rather than its raw id.
     * `dependsOn` stays as the machine keys.
     */
    dependsOnNames: string[];
    /** Rule ids this compound rule overrides when it fires. */
    overrides: string[];
    /**
     * Resolved display names for each id in `overrides`, index-aligned, so the
     * Guidebook "Overrides:" line reads rule names rather than raw ids,
     * matching the sibling "When:" line which already resolves display.
     * `overrides` stays as the machine keys.
     */
    overrideNames: string[];
    /** Optional rationale text from the rule definition. */
    rationale?: string;
}

/**
 * Lightweight metadata view of a loaded guide: id, version, name, description,
 * and rule count only. Does not include the guide's rule list or outcomes.
 *
 * Returned by `GuideEngineAdapter.listGuideMeta()` and
 * `GuideEngineAdapter.getGuideMeta()`.
 */
export interface GuideMetaView {
    /** Guide identifier. */
    id: string;
    /** Semantic version string. */
    version: string;
    /** Human-readable display name. */
    name: string;
    /** Long description of what the guide covers. */
    description?: string;
    /** Total number of rules in the guide (including computed rules). */
    ruleCount: number;
    /**
     * Display label for this guide's own reference component, the Guidebook:
     * the guide's override from `vocabulary.guidebook` (e.g. "SGCs") or the
     * generic "Guidebook" / "Guidebooks" when the guide declares none. Always
     * populated; resolved via the same chokepoint pattern as a scheme's
     * `referenceSurfaceLabel`.
     */
    referenceSurfaceLabel: ReferenceSurfaceLabel;
}

/**
 * Render-ready Handbook tree for a scheme: its concepts grouped under the
 * scheme's categories.
 */
export interface SchemeStructuralView {
    /** The scheme id. */
    id: string;
    /** The scheme's display name. */
    name: string;
    /** The scheme's description. Empty when the scheme declares none. */
    description: string;
    /**
     * The scheme's categories in declared order, each with the concepts that
     * belong to it. A category with no concepts is left out.
     */
    categories: Array<{
        /** The category id. */
        id: string;
        /** The category's display label. */
        label: string;
        /** The category's concepts, in declared order. */
        items: ConceptView[];
    }>;
    /**
     * Concepts that belong to none of the scheme's loaded categories. Usually
     * empty.
     */
    uncategorized: ConceptView[];
    /** Display-term overrides the scheme declares, unresolved. */
    vocabulary?: Vocabulary;
}

/**
 * Render-ready Guidebook tree for a guide: its rules grouped under the guide's
 * categories, with every compound rule in one `_compound` category at the end.
 */
export interface GuideStructuralView {
    /** The guide id. */
    id: string;
    /** The guide's display name. */
    name: string;
    /** The guide's description. Empty when the guide declares none. */
    description: string;
    /**
     * The guide's categories in declared order, each with its checkable rules,
     * followed by the `_compound` category that holds every rule with a `when`
     * condition. A category with no rules is left out.
     */
    categories: Array<{
        /** The category id, or `_compound` for the compound rules. */
        id: string;
        /** The category's display label. */
        label: string;
        /** The category's rules, in declared order. */
        items: GuideRuleView[];
    }>;
    /**
     * Checkable rules that name no category, or a category the guide does not
     * declare.
     */
    uncategorized: GuideRuleView[];
    /** Display-term overrides the guide declares, unresolved. */
    vocabulary?: Vocabulary;
}
