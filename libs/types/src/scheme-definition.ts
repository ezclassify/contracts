/**
 * SchemeDefinition: the canonical shape of an EzClassify scheme YAML/JSON file.
 *
 * This is the _input_ shape consumed by the loader. Property names use
 * snake_case to mirror the YAML exactly, structure preserves the envelope and
 * nested `data` / `parse` / `render` blocks, and field semantics match what the
 * YAML authors write (e.g. `position` is a spec, not a resolved number).
 *
 * Generated `scheme.schema.json` is derived from this interface via
 * `libs/schemas/build.mjs`; do not hand-edit the generated schema.
 *
 * Distinct from the runtime `Scheme` type in `./scheme.ts`, which is the
 * post-loader, resolved/flattened representation.
 */

import type { ExternalSourceSpec, ConceptMappingDoc } from './external-source';
import type { LayerBinding } from './layer';
import type {
    ConceptColor,
    ProcessingRole,
    RepairConfidence,
    RuleConditionTarget,
    RuleContributorQuantifier,
    Vocabulary,
} from './scheme';

/**
 * One element a scheme layer takes away, named by kind and id. Exactly one key.
 *
 * A reference rather than a path: `data.concepts.inline.X` would bake today's
 * storage shape into every saved layer, and the collections are not uniformly
 * addressable anyway. `{ concept: 'X' }` says what it means, survives a storage
 * refactor, and validates as a closed set so a typo fails at load instead of
 * silently removing nothing.
 */
export type LayerRemovalDoc =
    | {
          /** The id of the concept to remove. */
          concept: string;
      }
    | {
          /** The id of the category to remove. */
          category: string;
      }
    | {
          /** The id of the scheme rule to remove. */
          rule: string;
      }
    | {
          /** The id of the recognizer to remove. */
          recognizer: string;
      }
    | {
          /** The id of the repair rule to remove. */
          repair_rule: string;
      }
    | {
          /** The id of the render format to remove. */
          render_format: string;
      }
    | {
          /** The id of the render surface to remove. */
          render_surface: string;
      }
    | {
          /** The view to remove, addressed `surface/view`. */
          render_view: string;
      }
    | {
          /** The id of the rollup pipeline to remove. */
          rollup_pipeline: string;
      }
    | {
          /** The id of the label preset to remove. */
          label_preset: string;
      }
    | {
          /** The id of the external concept source to remove. */
          external_source: string;
      };

/**
 * The scheme family's layer payload. Required when `type: 'layer'`, forbidden
 * otherwise, so layer-ness is never inferred from a combination of fields.
 *
 * Binding and ordering are the cross-family rules: see `LayerBinding`.
 *
 * ## Three operations, the same for every element kind
 *
 * - Add: declare an element whose id the stack below does not hold, in the
 * section it normally lives in.
 * - Override: declare an element whose id the stack below already holds,
 * complete. It replaces the one below in the same position.
 * - Remove: name it in `removes`. It stays gone until a later layer names it
 * in `restores`, which brings back the definition it had below.
 *
 * The element kinds, where each lives, and whether `removes` can name it:
 *
 * | Kind              | Section                  | Removable |
 * | ----------------- | ------------------------ | --------- |
 * | `category`        | `data.categories`        | yes       |
 * | `concept`         | `data.concepts.inline`   | yes       |
 * | `external_source` | `data.concepts.external` | yes       |
 * | `concept_group`   | `data.concept_groups`    | no        |
 * | `scope`           | `scopes`                 | no        |
 * | `named_condition` | `named_conditions`       | no        |
 * | `recognizer`      | `parse.recognizers`      | yes       |
 * | `repair_rule`     | `parse.normalize`        | yes       |
 * | `rollup_pipeline` | `rollup_pipelines`       | yes       |
 * | `render_format`   | `render.formats`         | yes       |
 * | `render_surface`  | `render.surfaces`        | yes       |
 * | `render_view`     | `render.surfaces.views`  | yes       |
 * | `rule`            | `rules`                  | yes       |
 * | `filter`          | `filters`                | no        |
 * | `label_preset`    | `ui.label_presets`       | yes       |
 * | `wizard_step`     | `ui.wizard_questions`    | no        |
 *
 * A named condition is addressed by its key, an external source by its `id`
 * (or `external-<n>`, its one-based position, when it has none), a render
 * surface by its `surface`, a render view as `surface/view` with each id
 * percent-encoded, and every other element by its `id`. Removing an external
 * source takes the concepts it supplied with it. A header value that is not a
 * collection (a name, a license, a parse or render setting, a `ui` setting)
 * is not an element: a layer overrides it by stating it.
 *
 * A render surface and each of its views are separate elements. A layer that
 * states a surface the stack below holds overrides what belongs to the
 * surface itself, its `default`, which it replaces whole, a view id or a map
 * by role, and treats every view it lists as an element of its own: the view
 * is added, or it overrides the view below with the same `surface/view`,
 * complete, `role`, `format`, `cases` and `also_read_in` together, so a case
 * list is replaced and never extended, and a view restated without a role has
 * none. Views of that surface the layer does not list stay where they were.
 *
 * ## What a removal does to what names it
 *
 * The stack behaves as if the removed element never existed, so whatever names
 * it is narrowed, not dropped. A rule loses the removed member of a set (`when`,
 * `target`, `rank`, `exclude`, `from`, a `with` table) and keeps the rest. A
 * condition reads a removed concept as never present and a removed category as
 * empty, and the surrounding `any`, `all` and `none` simplify around that. A
 * concept that loses every category, or every parent, is removed. A rule is
 * dropped only when its trigger can never hold, its target set is empty (an
 * `exclusive` needs two members left), or the category it acts on is gone.
 * Three actions keep a rule whose targets are gone. A `restrict` left with no
 * targets stays and allows nothing in its category. A `require` or
 * `require_any` that can no longer be met is never dropped: the stack takes
 * its trigger away, or the stack is refused. A render format field bound to a removed element goes, along with any group
 * or `joins` entry left with nothing to write. A view whose format is removed
 * goes, as does a case or an `also_read_in` entry whose format is removed,
 * and a surface left with no views goes too. A view takes its forms with it:
 * when it goes, so does each format it names, as its `format`, in a case or
 * in `also_read_in`, that no view left in the stack names. A restated view is
 * not a removal: a format it stops naming that no other view in the stack
 * names is refused at load, as any format no view names is, so the same layer
 * removes that format or names it on a view. A surface that keeps some views
 * but loses a view its default names, removed directly or with its format, is
 * refused at load unless the same layer restates the surface with a default
 * it still declares. A condition the removal leaves undecidable is refused at
 * load with the element named; restate that element in the layer.
 */
export interface LayerBlockDoc extends LayerBinding {
    /** Elements inherited from below that this layer takes away. */
    removes?: LayerRemovalDoc[];
    /**
     * Elements an earlier layer removed that this one brings back, with the
     * definition they had below. Naming an element in both `removes` and
     * `restores` is a load error.
     */
    restores?: LayerRemovalDoc[];
}

/**
 * Position spec for a concept: where it renders among the concepts of its
 * category.
 *
 * - `'first'` / `'last'`: ahead of or behind every other position.
 * - Number: absolute position; lower renders earlier.
 * - `{ after: <id> }`: renders after the named concept.
 * - `{ before: <id> }`: renders before the named concept.
 * - `{ between: [a, b] }`: renders between the two named concepts.
 *
 * `before` mirrors `after`: `A: { before: B }` orders the pair exactly as
 * `B: { after: A }` does. A relative spec names a concept of the same category.
 * A name that resolves to no concept places this one last and reports a
 * warning; relative specs that form a cycle are a load error.
 */
export type PositionSpecDoc =
    | 'first'
    | 'last'
    | number
    | {
          /** The concept this one renders after. */
          after: string;
      }
    | {
          /** The concept this one renders before. */
          before: string;
      }
    | {
          /** The two concepts this one renders between, in either order. */
          between: [string, string];
      };

/**
 * Rank spec for a concept: its severity for rank-based rollup (max, min,
 * least_upper_bound).
 *
 * - `'top'` / `'bottom'`: highest or lowest rank.
 * - Number: absolute rank; higher is more severe.
 * - `{ above: <id> }`: more severe than the named concept.
 * - `{ below: <id> }`: less severe than the named concept.
 * - `{ between: [a, b] }`: between the two named concepts.
 *
 * `below` mirrors `above`: `A: { below: B }` ranks the pair exactly as
 * `B: { above: A }` does. A relative spec names a ranked concept of the same
 * category. A name that resolves to no ranked concept gives this one the top
 * rank, failing closed, and reports a warning; relative specs that form a cycle
 * are a load error.
 */
export type RankSpecDoc =
    | 'top'
    | 'bottom'
    | number
    | {
          /** The concept this one ranks above. */
          above: string;
      }
    | {
          /** The concept this one ranks below. */
          below: string;
      }
    | {
          /** The two concepts this one ranks between, in either order. */
          between: [string, string];
      };

/** Comparison operator for a structured `when:` condition. */
export type ConditionOperator =
    | 'has_content'
    | 'has_no_content'
    | 'has_concept'
    | 'not_has_concept'
    | 'every_has_concept'
    | 'any_lacks_concept'
    | 'count_gt'
    | 'count_gte'
    | 'count_eq'
    | 'count_lt'
    | 'count_unique_gt'
    | 'count_unique_gte'
    | 'count_unique_eq'
    | 'count_unique_lt'
    | 'count_unique_lte'
    | 'min_order'
    | 'min_rank'
    | 'subset_of'
    | 'shares_concept_with';

/**
 * A single condition in a rule's `when:` block.
 *
 * Rule conditions name their category via `category`; structured `when:` blocks
 * elsewhere (categories, render formats, rollup pipelines, filters) use
 * `category_id`. The shorthand `is:` packs an operator+value into one string
 * (e.g. `'has_content'`, `'count_eq 1'`). `has:` is shorthand for `operator:
 * has_concept, value: <id>`.
 */
export interface ConditionDoc {
    /** Category ID to evaluate against (rule conditions). */
    category?: string;
    /** Category ID to evaluate against (structured `when:` blocks). */
    category_id?: string;
    /** Shorthand: equivalent to `operator: has_concept, value: <concept-id>`. */
    has?: string;
    /** Combined operator+value shorthand (e.g. `'has_content'`, `'count_eq 1'`). */
    is?: string;
    /** Explicit operator (used when `is`/`has` is not a fit). */
    operator?: ConditionOperator;
    /**
     * Operand for the operator: a concept id for the concept tests, a category
     * id for `subset_of` and `shares_concept_with`, and a number for the
     * `count_*`, `min_order` and `min_rank` tests.
     */
    value?: string | number;
    /** Processing-context role filter ('whole' or 'part'). */
    role?: ProcessingRole;
    /**
     * Which assertion set to evaluate: 'self' (default), 'context' (whole
     * marking), or 'contributors' (every set that fed an aggregate; the
     * condition holds only when all of them satisfy it).
     */
    target?: RuleConditionTarget;
}

/** A reference to a reusable condition declared in `scheme.named_conditions`. */
export interface NamedConditionRefDoc {
    /** Named-condition ID from this document or from a base/required layer. */
    named_condition: string;
}

/** A nested boolean block in a rule's `when:` tree. */
export interface WhenQuantifierDoc {
    /** Evaluate the complete boolean expression separately for each contributor. */
    target?: 'contributors';
    /**
     * Combine contributor results using any, all (default), or none. Valid only
     * with target: contributors. A missing or empty contributor set never
     * satisfies the block, including when quantifier is all or none.
     */
    quantifier?: RuleContributorQuantifier;
    /**
     * Quantifier: at least one item must hold. Items are conditions or nested
     * quantifiers.
     */
    any?: Array<ConditionDoc | NamedConditionRefDoc | WhenQuantifierDoc>;
    /** Quantifier: every item must hold. */
    all?: Array<ConditionDoc | NamedConditionRefDoc | WhenQuantifierDoc>;
    /** Quantifier: no item may hold. */
    none?: Array<ConditionDoc | NamedConditionRefDoc | WhenQuantifierDoc>;
    /** Category-shorthand: any concept in this category triggers the rule. */
    category?: string;
    /**
     * Restrict the contexts in which this `when` block applies. Recognized
     * context names include `'render'` and `'suggest'`. Omit (or use the array
     * form of `when:`) to apply in every context.
     */
    scope?: string[];
}

/**
 * A rule's `when:` field: the trigger condition.
 *
 * Forms accepted by the loader:
 *
 * - String: concept ID that must be present.
 * - Array of strings: any-of concept IDs.
 * - Array of conditions: implicit all-of (every condition must hold).
 * - Object with `{any|all|none}` quantifiers and/or `{category: X}` shorthand.
 */
export type WhenDoc =
    | string
    | Array<string | ConditionDoc | NamedConditionRefDoc | WhenQuantifierDoc>
    | ConditionDoc
    | NamedConditionRefDoc
    | WhenQuantifierDoc;

/** A scheme-default display-color outcome chosen by a rule condition. */
export interface MarkingColorRuleDoc {
    /**
     * Rule condition, in the same `when` syntax scheme rules use. Omit only on
     * the final entry to create an unconditional/anything-else fallback.
     */
    when?: WhenDoc;
    /** Complete background/text pair to apply when the condition matches. */
    color: ConceptColor;
}

/**
 * Rule actions recognized by the engine.
 *
 * Three of them say which of the targets a marking must or may hold:
 *
 * - `require`: every target must be present. When the rule names `category`,
 * the targets are added there.
 * - `require_any`: at least one target must be present, in `category` when the
 * rule names one and anywhere in the marking otherwise. It only checks; it
 * never adds a value.
 * - `restrict`: `category` may hold only the targets. The rule must name
 * `category`, and an empty category satisfies it. Permissive processing
 * removes the values the targets do not allow.
 *
 * One of them only advises:
 *
 * - `warn`: when the rule's `when` holds, the result carries its `message` as a
 * warning. The marking stays exactly as it was: nothing is added or removed,
 * the rendering does not change, and `valid` is decided by the other rules
 * alone. A `warn` rule needs a `message` and names no `target`, `category`
 * or other operand, because it acts on nothing.
 */
export type RuleActionDoc =
    | 'forbid'
    | 'exclusive'
    | 'require'
    | 'require_any'
    | 'restrict'
    | 'copy'
    | 'move'
    | 'inherit_parents'
    | 'expand_group'
    | 'cardinality'
    | 'supersede'
    | 'intersect'
    | 'union'
    | 'max'
    | 'warn';

/**
 * A rule target that names concepts by where they sit in the hierarchy rather
 * than one by one. Each form is a member of this union: `ChildrenOfSelectorDoc`.
 *
 * A selector is a target of `require_any`, `forbid` and `restrict`, the actions
 * that ask whether one of a set is present, keep a set out, or keep a category
 * to a set. Any other action refuses it at load.
 */
export type RuleTargetSelectorDoc = ChildrenOfSelectorDoc;

/**
 * Every concept whose `parents` list names a concept.
 *
 * `{ children_of: PROGRAM }` stands for every concept whose `parents` list
 * names `PROGRAM`. Only direct children count: a concept whose parent is itself
 * a child of `PROGRAM` is not one. The set is read from the scheme as composed,
 * after every layer has added and removed its concepts, so a layer that adds a
 * child needs no rule of its own, and a scheme with no children of `PROGRAM`
 * has an empty set. The children are the concepts the scheme declares, inline
 * or from a source it holds in full; a scheme whose concepts are only looked up
 * one at a time cannot list them, and refuses a selector at load.
 *
 * Where a rule needs one of its targets (`require_any`), an empty set fails
 * every marking the rule fires on: a concept that requires one of its children
 * is refused while it has none.
 */
export interface ChildrenOfSelectorDoc {
    /**
     * The concept whose direct children are the targets.
     *
     * @minLength 1
     */
    children_of: string;
}

/**
 * A scheme rule: a trigger condition, an action, and action-specific
 * parameters.
 */
export interface SchemeRuleDoc {
    /**
     * Unique rule identifier within the scheme. An id that begins with `_` is
     * refused: the engine keeps that prefix for its own ids, the ones it
     * reports its own errors under as `constraintId` and writes as
     * `sourceRule` on assertions its structure added.
     *
     * @minLength 1
     * @pattern ^[^_]
     */
    id: string;
    /** Human-readable rule name for UI and audit provenance. */
    name?: string;
    /** Trigger condition. See `WhenDoc`. */
    when?: WhenDoc;
    /** What to do when the rule fires. */
    action: RuleActionDoc;
    /**
     * Surfaces the rule applies to, as scheme scope ids. A leading `!` excludes
     * one. Absent means every surface.
     */
    surfaces?: string[];
    /**
     * Evaluation contexts the rule runs in. Absent means every one of them.
     *
     * These are the contexts the engine actually asks about, not a parallel
     * naming of the pipeline:
     *
     * - `pre-merge`: each input set on its own, before rollup, and a standalone
     * `process()` call
     * - `post-merge`: the merged whole, after rollup
     * - `validate`: an explicit `validate()` call
     * - `render`: the render-time visibility check
     * - `suggest`: suggestion generation
     *
     * Inclusion only. A rule that names contexts runs in those and no others;
     * there is no `!` form, because the closed list makes the complement
     * writable and one way to say a thing keeps a scope readable.
     */
    phases?: Array<
        'pre-merge' | 'post-merge' | 'validate' | 'render' | 'suggest'
    >;
    /** Render formats the rule applies to, by format id. Absent means all. */
    formats?: string[];
    /** Human-readable explanation of what this rule does. */
    explanation?: string;
    /**
     * Where in the governing document this rule was read from. Free text, e.g.
     * `32 CFR 2002.20(b)(1)`.
     *
     * Provenance only: nothing parses it, matches on it, or renders it.
     * Distinct from `explanation` (what the rule does) and `message` (what a
     * violation tells the author).
     */
    citation?: string;
    /**
     * Validation error message for the constraint actions (forbid, require,
     * require_any, restrict, exclusive, cardinality), and the warning a `warn`
     * rule gives, which it requires.
     */
    message?: string;
    /**
     * What the action acts on: a concept or category id, a list of them, or a
     * selector such as `{ children_of: PROGRAM }` that names concepts by their
     * place in the hierarchy. See `RuleTargetSelectorDoc`.
     */
    target?: string | string[] | RuleTargetSelectorDoc;
    /**
     * Target category: disambiguates multi-category concepts or specifies the
     * operating category.
     *
     * A `restrict` rule requires it: it is the category the rule restricts to
     * the targets. On a `require_any` rule it says where a target must appear.
     */
    category?: string;
    /** For supersede: what replaces the target. */
    with?: string | Record<string, unknown>;
    /**
     * Source category ID(s). String for copy/move/inherit_parents, array for
     * intersect/union.
     */
    from?: string | string[];
    /** For copy/move: destination category ID. */
    to?: string;
    /** For move: concept ID to exclude from the move. */
    exclude?: string;
    /**
     * For cardinality: minimum concept count.
     *
     * @asType integer
     */
    min?: number;
    /**
     * For cardinality: maximum concept count.
     *
     * @asType integer
     */
    max?: number;
    /**
     * For exclusive: priority among derived concepts during repair or rollup
     * (first = highest priority). Repair preserves author-stated concepts.
     */
    rank?: string[];
}

/**
 * A regulatory or handling notice attached to a concept: the text the marking
 * requires, plus how it is categorized, whether it is mandatory, and an
 * optional condition. Where the text is placed in a document is the host's
 * convention, not part of the scheme.
 */
export interface ConceptNoticeDoc {
    /** Notice category. */
    type: 'warning' | 'handling' | 'admonition' | 'distribution' | 'info';
    /** Whether this notice MUST be displayed (regulatory requirement). */
    required: boolean;
    /** The notice text to display. */
    text: string;
    /** Concept ID: only show this notice when this concept is also present. */
    condition?: string;
    /**
     * The value this notice is registered under in a view's own notice
     * vocabulary, keyed by view name, e.g. `{ ism: 'RD' }`.
     *
     * Only for a view that has such a vocabulary. A view with no entry here
     * carries the notice unregistered, which is what a view says when its
     * vocabulary does not enumerate this notice. The registration sits on the
     * notice rather than on a format because it is a property of the notice: a
     * concept carrying two notices registers each one separately, and a format
     * that writes the notice is not the thing that names it.
     */
    views?: Record<string, string>;
}

/** Applicability metadata: which organizations use this concept. */
export interface ConceptApplicabilityDoc {
    /** Identifiers of the organizations that use this concept. */
    organizations?: string[];
    /** Human-readable note about applicability. */
    note?: string;
}

/**
 * How a free-text value is spelled on the wire and how it is stored.
 *
 * A codec, not a validator: every encoding states both directions, so a value
 * this contract accepts is a value the contract can write back. A bare regex
 * declares what may be read and says nothing about how to print the stored
 * value again, which is why no encoding takes a regex.
 */
export type ValueEncodingDoc =
    | {
          /** Plain text, stored exactly as supplied. */
          type: 'text';
          /**
           * Reject a value longer than this many characters.
           *
           * @asType integer
           */
          max_length?: number;
          /**
           * A validation constraint on the value: it is rejected unless the
           * whole value matches. Anchoring is implicit and total, so a partial
           * match is a rejection.
           *
           * This is not a recognition device and never becomes one. It does not
           * tell the reader where this concept's text starts or ends, it does
           * not compete with any other reading, and nothing is extracted from
           * it: the value is found by the field that binds it and then checked
           * against this.
           *
           * A pattern that describes a shape belongs in `calendar-date` or
           * `composite`, which say how to write the value again as well as how
           * to read it.
           */
          pattern?: string;
      }
    | {
          /**
           * A calendar date: a real year, month and day, with leap years and
           * month lengths enforced. Never a timestamp, never timezone-shifted.
           */
          type: 'calendar-date';
          /** The spelling the value is stored in. */
          canonical: 'YYYY-MM-DD';
          /** Spellings accepted on input. */
          accepts: Array<'YYYYMMDD' | 'YYYY-MM-DD'>;
          /** Per-view output spelling; views not named here use `canonical`. */
          views?: Record<string, 'YYYYMMDD' | 'YYYY-MM-DD'>;
      }
    | {
          /** An ordered set of components stored as one normalized string. */
          type: 'composite';
          /** Joins the components. */
          separator?: string;
          /** The components, in the order they are written. */
          fields: CompositeFieldDoc[];
      };

/**
 * One component of a `composite` encoding.
 *
 * A `concept` component names words inside the value. It identifies them; it
 * does not assert them as top-level facts of the marking.
 */
export interface CompositeFieldDoc {
    /** Component name, used in diagnostics. */
    name: string;
    /** Whether the component is free text or a reference to known concepts. */
    type: 'text' | 'concept';
    /** Whether the component must be present. Default true. */
    required?: boolean;
    /** Written once before the component. */
    prefix?: string;
    /** Written once after the component. */
    suffix?: string;
    /** `type: concept`: the concept ids this component may name. */
    concepts?: string[];
    /** `type: concept`: the view the component is written in. */
    view?: string;
}

/**
 * A hint for finding free text that no field has bound yet.
 *
 * It helps recognition locate the start of an unlabeled run of text. It is not
 * a constraint on the language of a field that is already bound: an event
 * description supplied explicitly is still an event description whatever word
 * it opens with.
 */
export interface TextInputRecognitionDoc {
    /** Words that may open an unbound run of this concept's free text. */
    begins_with_word?: string[];
}

/** Free-text input configuration for a concept that accepts user-typed text. */
export interface TextInputDoc {
    /** Hint text shown in the UI input field. */
    placeholder?: string;
    /** Display label for the text input in forms. */
    label?: string;
    /** Whether a value must be provided (default true). */
    required?: boolean;
    /** How the value is spelled and stored. Absent means plain text. */
    encoding?: ValueEncodingDoc;
    /** Hint for locating this concept's free text when nothing has bound it. */
    recognition?: TextInputRecognitionDoc;
}

/**
 * An alias that only means this concept in a particular position.
 *
 * The plain `aliases` list is unconditional. This one carries the condition the
 * domain actually states, so a two-letter token that means one thing at the
 * head of a marking and another after a category does not have to be guessed at
 * by the engine. `position` is measured in the original recognized region,
 * after any wrapper is stripped and before any reordering.
 */
export interface InputAliasDoc {
    /** The text recognized as this concept. */
    text: string;
    /** Where in the marking region the text must appear. */
    position?: 'leading' | 'non-leading';
    /** The category this text must follow, when that is the domain's rule. */
    after_category?: string;
}

/** A concept: the core unit of a scheme. */
export interface ConceptDoc {
    /** Unique concept identifier within the scheme. */
    id: string;
    /** Human-readable display name. */
    name: string;
    /**
     * Display representations keyed by view name; must include 'default'. A
     * plain string expands to all view keys.
     *
     * A view value may carry one placeholder, `{value}`, which the renderer
     * fills with the assertion's free-text value. Any other placeholder is
     * invalid and causes a compile error. Alternate representations live
     * in typed text-input encodings, which define parsing and rendering
     * per declared view.
     *
     * A value that has to print in more than one shape per view says so in its
     * own `text_input.encoding`, which states both directions. A
     * `calendar-date` stores one canonical spelling and names a per-view
     * spelling; a `composite` names its components.
     */
    views:
        | string
        | {
              /** The representation used when no other view is asked for. */
              default: string;
              [view: string]: string;
          };
    /**
     * Portable scheme-default display color pair (`{ background, text }`, both
     * CSS hex). In category mode it is allowed only on concepts in the category
     * named by `render.color_from`. Hosts may override it.
     */
    color?: ConceptColor;
    /** Alternative strings that parse to this concept (case-insensitive). */
    aliases?: string[];
    /** Aliases that mean this concept only in a stated position. */
    input_aliases?: InputAliasDoc[];
    /** Category IDs this concept belongs to. */
    categories: string[];
    /** Broader concept IDs forming a hierarchy chain. */
    parents?: string[];
    /** Position spec: relative ordering within a category. */
    position?: PositionSpecDoc;
    /** Rank spec: severity ordering for max/min rollup. */
    rank?: RankSpecDoc;
    /**
     * Tier label. Marks this concept as a partial marking that must attach to a
     * parent.
     */
    tier?: string;
    /** For group concepts: the member concept IDs. */
    members?: string[];
    /** Scope IDs this concept is visible in. */
    scopes?: string[];
    /** Whether this concept is deprecated. */
    deprecated?: boolean;
    /** Human-readable deprecation message. */
    deprecated_message?: string;
    /** Concept ID that should be used instead of this deprecated concept. */
    deprecated_replacement?: string;
    /** Locale-specific display labels: locale code → display string. */
    synonyms?: Record<string, string>;
    /** Human-readable definition of this concept from its governing authority. */
    definition?: string;
    /** Usage guidance for when and how to apply this concept. */
    guidance?: string;
    /**
     * Where in the governing document this concept was read from. Free text,
     * e.g. `NARA CUI Registry, General Privacy, retrieved 2026-07-25` or `32
     * CFR 2002.20(b)(1)`.
     *
     * Provenance only: nothing parses it, matches on it, or renders it.
     * Distinct from `definition` (what the concept means) and `guidance` (what
     * the controlling authority says about handling it).
     */
    citation?: string;
    /** Regulatory or handling notices attached to this concept. */
    notices?: ConceptNoticeDoc[];
    /** Applicability metadata. */
    applicability?: ConceptApplicabilityDoc;
    /** Free-text input configuration. */
    text_input?: TextInputDoc;
    /** Concept IDs that this concept supersedes. */
    supersedes?: string[];
    /**
     * A category whose values this concept stands for: the values the whole
     * holds in it.
     *
     * Some schemes let a part leave out a list because it is the same as its
     * whole's, and write a word in its place. The concept is that word. When a
     * part holding it is read against a whole, the part takes the whole's
     * values in the named category, so its rules judge the list the word
     * stands for. The concept stays in the part, and a format that sets
     * `omit_whole_values` writes the part back the way it was read. A part
     * read without a whole, or one that writes values of its own in the
     * category, takes nothing; whether a word with nothing behind it is an
     * error is the scheme's call, made in its own rules. In a rollup the word
     * goes through its own category's rollup like any other concept.
     *
     * Names a category declared in the same scheme.
     */
    stands_for_whole?: string;
    /**
     * Opaque host metadata carried with the concept. The engine neither reads
     * nor interprets it; it travels so a host can hang its own record on a
     * concept without a second file keyed by id.
     */
    metadata?: Record<string, unknown>;
}

/**
 * Category label: either a plain string or a view-keyed map.
 *
 * The map form lets a category carry alternate labels per render format (e.g.
 * `{ default: 'Access Tier', abbr: 'tier' }`).
 */
export type CategoryLabelDoc =
    | string
    | {
          /** The label used when no other view is asked for. */
          default: string;
          [view: string]: string;
      };

/** A category default applied only when its condition holds. */
export interface ConditionalDefaultConceptDoc {
    /** Concept ID to assert when the category is empty. */
    concept: string;
    /**
     * Evaluated against assertions after inference and before any category
     * defaults are added, independently of category declaration order.
     * An unresolved condition does not fill the default.
     */
    when: WhenDoc;
}

/** A category: a dimension of a marking that groups related concepts. */
export interface CategoryDoc {
    /** Unique category identifier. */
    id: string;
    /** Human-readable label for UI display. */
    label: CategoryLabelDoc;
    /** Additional display views keyed by view name. */
    views?: Record<string, string>;
    /**
     * Advisory shape of this category's free-text values, for a host that wants
     * to hint at the expected form in an input box. Provenance and UI only:
     * nothing parses it, matches on it, or validates against it. A value's real
     * shape is its concept's `text_input.encoding`.
     */
    format_hint?: string;
    /** Whether at least one concept must be present for a valid marking. */
    required?: boolean;
    /** When true, only one concept can be selected. */
    single?: boolean;
    /**
     * If set, only these concept IDs are valid (overrides categories[]
     * membership).
     */
    allowed_concepts?: string[];
    /**
     * Rollup operator used when aggregating multiple markings.
     *
     * `pipeline` means the category is resolved by an entry in
     * `scheme.rollup_pipelines[]`.
     */
    rollup:
        | 'max'
        | 'min'
        | 'union'
        | 'intersection'
        | 'symmetric_difference'
        | 'exclusive_or'
        | 'complement'
        | 'first'
        | 'last'
        | 'least_upper_bound'
        | 'pipeline';
    /** Sort order for concepts within this category during rendering. */
    sort?:
        | 'position'
        | 'alphabetical'
        | 'numeric'
        | Array<'position' | 'alphabetical' | 'numeric'>;
    /**
     * Numeric positions keyed by concept ID, used by this category's `position`
     * sort instead of the concept's resolved position. Other concepts retain
     * their own positions. Equal positions use the next sort key, then declared
     * concept order. These values affect only this category and never severity.
     */
    position_overrides?: Record<string, number>;
    /** Default concept when this category is empty; a string is unconditional. */
    default_concept?: string | ConditionalDefaultConceptDoc;
    /**
     * When true, a group concept present together with every one of its
     * members is rendered alone, with the members folded into it. A member
     * named by `group_exclude` does not count toward that check. A group
     * missing any member is rendered as stated, beside whichever members are
     * present.
     */
    collapse_groups?: boolean;
    /** Concept ID excluded from the "all members present" check for collapse. */
    group_exclude?: string;
    /**
     * Suppress this category if its concept set is a subset of another
     * category's set.
     */
    suppress_if_subset_of?: string;
    /**
     * When true, the category grades its concepts by severity `rank`: every
     * concept it grades must declare one or the scheme fails to load, and a
     * coverage comparison counts a whole-marking concept here as covering a
     * part's concept of equal or lower rank. It does not change rendering.
     */
    hierarchy_root?: boolean;
    /** Scope IDs this category is visible in. */
    scopes?: string[];
    /**
     * Position of the category within the rendered output (lower = earlier).
     *
     * Any number, not only a whole one: a fraction is how a category is
     * slotted between two others without renumbering the rest.
     */
    position?: number;
    /**
     * Where in the governing document this category was read from. Free text,
     * e.g. `2016 IC Markings Register, Table 3 row 24`.
     *
     * Provenance only: nothing parses it, matches on it, or renders it.
     */
    citation?: string;
}

/** A rollup-pipeline step: conditional then/else block evaluated in order. */
export interface RollupPipelineStepDoc {
    /** Trigger condition for this step. Omit for unconditional fallback step. */
    when?: WhenDoc;
    /** Then-block: how to combine and remove concepts when this step fires. */
    then?: Record<string, unknown>;
    /** Else-block: applied when `when` does not match. */
    else?: Record<string, unknown>;
}

/** A rollup pipeline: resolves one or more pipeline-rolled categories. */
export interface RollupPipelineDoc {
    /** Unique pipeline identifier. */
    id: string;
    /** Category IDs resolved together by this pipeline. */
    categories: string[];
    /** Pipeline steps. Evaluation order depends on `mode`. */
    steps: RollupPipelineStepDoc[];
    /** `ordered` (default) or `all`; see SchemeDefinition. */
    mode?: 'ordered' | 'all';
    /** Human-readable explanation. */
    explanation?: string;
}

/** Embedded-marking style: pattern wrapping an inner marking in free text. */
export interface EmbeddedMarkingStyleDoc {
    /** Regex with one capture group around the inner marking text. */
    pattern: string;
    /**
     * Output template when re-emitting the wrapper. `{marking}` is replaced.
     * Required: an insertion has to round-trip through this scheme's own
     * `pattern`, so the engine cannot supply a wrapper syntax of its own.
     */
    template: string;
    /** When the host UI should auto-prompt for a marking. */
    auto_insert?: 'every-paragraph' | 'first-line' | 'manual';
}

/**
 * A declaration for input a format's field tree genuinely cannot describe.
 *
 * The ordinary case needs none of these. A format's fields already say what the
 * marking is made of, and recognition reads that same tree, so a phrase group,
 * a typed value, a view, and an alias all recognize themselves. What is left is
 * the rare shape whose spelling carries no vocabulary at all.
 *
 * Deliberately narrow. One pattern, no variants, no priority: a recognizer
 * proposes candidate bindings into the same evidence graph, under the same work
 * budgets, competing on evidence like everything else. It never asserts a
 * concept directly, and it never runs as a second pass after a canonical read
 * has failed, because a fallback that only fires on failure is a way of turning
 * an unrecognized input into a confident one.
 */
export interface RecognizerDoc {
    /** Recognizer identifier, used in diagnostics. */
    id: string;
    /** One bounded pattern from the supported regex subset. */
    pattern: string;
    /** The format whose field tree these captures feed. */
    format: string;
    /** Capture group to field name, within `format`. */
    binds: Array<{
        /**
         * Capture-group index in `pattern`.
         *
         * @asType integer
         */
        group: number;
        /** Name of the field in `format` that receives the captured text. */
        field: string;
    }>;
    /** Human-readable explanation surfaced with the recognition. */
    message?: string;
    /**
     * Whether this pattern reads case as a difference.
     *
     * Absent, the pattern follows `parse.case_sensitive`, which is the policy
     * the vocabulary beside it is compared under: one scheme, one answer to the
     * question of whether a spelling in the wrong case is the same spelling.
     * Present, it overrides that policy for this pattern alone, for the
     * declaration whose shape genuinely is case-bearing when the rest of the
     * scheme's is not. There is no flags string: a pattern carrying its own
     * flag could read case one way while the vocabulary it feeds read it the
     * other, and nothing said which was meant.
     */
    case_sensitive?: boolean;
}

/** A single normalize/repair rule: input rewrite during parse. */
export interface NormalizeRuleDoc {
    /** Rule identifier. */
    id: string;
    /** Repair type. */
    type:
        | 'alias'
        | 'reorder'
        | 'separator'
        | 'dedup'
        | 'case'
        | 'infer_missing';
    /** Confidence level. */
    confidence: RepairConfidence;
    /** Human-readable explanation. */
    explanation: string;
    /** Brief description (used by tooling alongside `explanation`). */
    description?: string;
    /**
     * Detection or match regex, read per type: for `case` it selects the input
     * that needs correcting; for `separator` it matches the text to replace.
     */
    pattern?: string;
    /**
     * The correction to apply, read per type: replacement text for `separator`,
     * and for `case` the grammar's canonical case, `'upper'` (the default) or
     * `'lower'`.
     */
    correction?: string;
}


/**
 * Parse configuration: recognition policy, exceptional recognizers, and the
 * repair rules applied before recognition.
 *
 * No tokenizer settings. Every boundary in a marking belongs to the field that
 * writes it, so there is no global separator to declare here and nothing for a
 * split exception to be an exception to.
 */
export interface ParseConfigDoc {
    /**
     * Whether the vocabulary is matched case-sensitively.
     *
     * Recognition policy, not lexing: every boundary in a marking belongs to
     * the field that writes it, and this says how a spelling found at one of
     * those boundaries is compared against the vocabulary. Default false.
     */
    case_sensitive?: boolean;
    /**
     * Whether surrounding whitespace is ignored when a spelling is compared.
     *
     * Recognition policy, like `case_sensitive`. It does not split anything;
     * it decides whether the space an author left around a value keeps that
     * value from being recognized. Default true.
     */
    strip_whitespace?: boolean;
    /** Declarations for input no field tree can describe. */
    recognizers?: RecognizerDoc[];
    /** Normalize/repair rules applied during parse. */
    normalize?: NormalizeRuleDoc[];
}

/** How a format's text is framed: its encoding, not its layout. */
export type SyntaxDoc =
    | {
          /** Plain text. */
          type: 'text';
          /** How a character the syntax cannot frame is escaped. */
          escape?: 'none' | 'backslash';
      }
    | {
          /** XML attributes on one element. */
          type: 'xml-attributes';
          /** Namespace to write the attributes in, when the format has one. */
          namespace?: {
              /** The namespace prefix the attributes are written with. */
              prefix: string;
              /** The namespace URI the prefix is bound to. */
              uri: string;
          };
      };

/**
 * A boundary-specific separator: what is written between two named adjacent
 * children of a group.
 *
 * This is data about a boundary, not a change to either child's own separator.
 * Naming two children that are not adjacent in `fields` is a compile error, so
 * an author cannot declare an order the field list does not have.
 *
 * A join is written only when both of the children it sits between produced
 * something, which is the same rule every other separator in this contract
 * follows: a separator joins nonempty results. An absent child takes the
 * boundary before it with it rather than leaving a stray literal at the edge.
 */
export interface JoinDoc {
    /** The two adjacent children, by `name` or by category id. */
    between: [string, string];
    /** What is written between them. */
    separator: string;
}

/**
 * How a tiered concept composes inside one field: what attaches a tier level to
 * the one above it, and the view each half of the composed token is written in.
 *
 * The composition rule belongs to the field that writes the category, not to
 * the whole format, because two fields may legitimately write the same tier
 * family differently. A concept that declares the tier view uses it; one that
 * does not keeps the field's view.
 *
 * A composed token has two halves and they are not obliged to agree. The head
 * is the level being composed with; the child is the level this entry governs.
 * A format that spells its concepts out in full may still want the head short
 * inside a composed token, because the composed form is a name in its own right
 * and the spelled-out head reads as a sentence rather than a marking. `view`
 * sets the child's; `head_view` sets the head's; the field's view is what
 * either falls back to. Neither reaches the head written on its own, which is
 * not part of a composed token and keeps the field's view like any other value.
 */
export interface TierCompositionDoc {
    /** The tier label this entry governs. */
    tier: string;
    /**
     * What attaches this tier level to the one it composes with.
     *
     * Not `separator`. Everywhere else in this contract a separator joins
     * siblings: a field's values, a group's children, a format's fields. This
     * is a child-to-parent boundary. Reading "the subprogram tier's
     * separator is a hyphen" aloud does not say which boundary is meant, and a
     * reader who knows the rest of the contract guesses the wrong one. "The
     * subprogram tier is attached by a hyphen" says it.
     */
    attached_by: string;
    /** View for the composed token's child; falls back to the field's view. */
    view?: string;
    /**
     * View for the composed token's head, the level this one composes with.
     *
     * Absent means the field's view, which is the head written the same way it
     * is written standing alone. Naming a view here changes the head only
     * inside a composed token: the same concept written on its own is a value
     * of this field like any other and is unaffected.
     */
    head_view?: string;
}

/**
 * One piece of a conditional affix: text, and when it is written.
 *
 * An entry with no `when` is unconditional and always contributes.
 */
export interface AffixPartDoc {
    /** The text this part writes. */
    text: string;
    /** When this part is written. Absent means always. */
    when?: WhenDoc;
}

/**
 * A prefix or suffix: one string, or an ordered list of conditional parts.
 *
 * The list form is the concatenation rule. Every entry whose condition holds
 * contributes its text, in the order the author wrote them, so independent
 * conditions each add their own piece: a whole marking takes a separator when
 * one category is present and a leading word when another category holds a
 * particular concept, and both when both hold. Nesting can only express the all-or-nothing case,
 * and enumerating the combinations as alternatives costs one option per subset.
 *
 * A part whose condition is false contributes nothing, and an affix whose parts
 * all contribute nothing is an absent affix: it does not frame an otherwise
 * empty result.
 */
export type AffixDoc = string | AffixPartDoc[];

/** Affix written around every value of a field, as opposed to once around all of them. */
export interface EachAffixDoc {
    /** Written before each value. */
    prefix?: string;
    /** Written after each value. */
    suffix?: string;
}

/** The properties every field shape carries. */
export interface FieldCommonDoc {
    /**
     * Human label for the field. Required on groups and alternatives, because
     * a `joins` entry and a diagnostic both have to be able to name them.
     */
    name?: string;
    /**
     * When this field applies. One predicate, read by both sides: the field is
     * written only when it holds, and a reading of the input that would make it
     * false is not a reading of this field.
     */
    when?: WhenDoc;
    /**
     * Whether the field standing empty is a state of this group at all.
     *
     * Every field is optional by default, and on the read side that default is
     * load-bearing in a way it is easy to miss: a group all of whose fields may
     * stand empty reads any one of them on its own. A format that binds two
     * categories beside a level therefore also reads a bare level, and becomes
     * a rival account of text another format already reads whole. The
     * alternative is not a tie-break, because nothing here is settled by
     * declaration order, position or count. It is saying the thing the
     * document could not say: a reading in which this field matched nothing is
     * not a reading of this group.
     *
     * Symmetric, because a representation that cannot be read is not one. Set
     * here, the field is bound in every reading of the group that encloses it,
     * and a state holding nothing for it is a state the group does not write:
     * the group comes out empty, the facts its other fields would have carried
     * are reported omitted, and another field or another format writes them.
     * An omission, not a conflict: the group declined, and declining is what a
     * format that does not represent a state is supposed to do.
     *
     * The same word at a format's top level says it of the whole format, whose
     * fields are one sequence. Inside `alternatives` it belongs to the option
     * it is written in and says nothing about the others, because each option
     * is a whole representation of the field and they do not share a reading.
     *
     * It is a statement about this group's shape, never about the concept the
     * field binds and never about whether a marking is well formed: a category
     * that must be filled for a marking to make sense is `required` on the
     * category, which is a different question with a different answer.
     */
    required?: boolean;
    /** Concept view for this field, overriding the enclosing view. */
    view?: string;
    /** Written once before the field's nonempty result. */
    prefix?: AffixDoc;
    /**
     * Spellings of this field's prefix that are read and never written.
     *
     * A format writes one spelling of a line and documents in the wild carry
     * more than one. A block whose classifier line opens `Classified By: ` also
     * arrives spelled out for a derivative classifier, and a reader that
     * accounts for every character refuses that spelling unless the format
     * names it. Two `alternatives` that can both write one state are a
     * conflict by design and never a winner by order, and a `Recognizer`
     * describes a whole region rather than one line inside a block.
     *
     * This is the tolerant half of the tree, written down. The canonical pass
     * reads `prefix` and nothing else; a spelling named here is admitted only
     * by the tolerant pass, beside the case difference, the declared alias, a
     * concept's spelling in another of its views and the separator
     * substitution it already admits, and every use is reported as an `alias`
     * correction against the characters it read. The render side never reads
     * this, which is what "never written" means. A format that declares none
     * reads only `prefix`.
     *
     * Only meaningful beside `prefix`, and no two fields of one format may
     * claim one spelling, as a prefix or as an alias of one. A line that opens
     * two fields is not a reading a format can settle, and nothing here is
     * settled by declaration order.
     */
    prefix_aliases?: string[];
    /** Written once after the field's nonempty result. */
    suffix?: AffixDoc;
    /**
     * What this field joins: its own values on a category field, its nonempty
     * children on a group.
     */
    separator?: string;
    /**
     * Spellings of this field's separator that are read and never written.
     *
     * The sibling of `prefix_aliases`, one level down: a prefix says where a
     * field opens and a separator says where one of its values ends, and a
     * document in the wild spells the second as freely as the first. A list a
     * format writes with `, ` arrives joined by `; ` or by a bare space, and a
     * reader that accounts for every character reads the whole run as one
     * value rather than quietly guessing a boundary.
     *
     * Not the same as the substitutions the tolerant pass already makes. Those
     * are spacing and de-doubling variants of the declared separator, and they
     * deliberately invent no boundary the declared separator does not already
     * put in the same place. This is the author saying that these other
     * characters are that boundary, in this field, which is a statement only
     * the document can make.
     *
     * Tolerant pass only, never written, and every use is reported as a
     * `separator` correction naming the characters read and the separator the
     * format writes instead: the same correction a spacing substitution
     * carries, because it is the same claim about the same boundary. The render
     * side never reads this.
     *
     * Only meaningful beside `separator`. A spelling named here may not be
     * another field's declared separator or another field's prefix in the same
     * format: a boundary that is also a field's own syntax is not a reading the
     * format can settle, and nothing here is settled by declaration order.
     */
    separator_aliases?: string[];
    /** `xml-attributes` syntax only: the attribute's local name. */
    attribute?: string;
}

/**
 * One concept of a field's category, written together with the fields that
 * belong to it.
 *
 * A category's own order says where each of its concepts is written. Some of
 * them introduce something: a release control is written with the countries it
 * releases to, and the control and the list are one phrase rather than two
 * fields that happen to be adjacent. Written as two fields, the list has to sit
 * somewhere in the format's own sequence, and the rest of the category has to
 * sit beside it, which means the format has decided, once, whether the plain
 * controls come before the list or after. A register that writes one control
 * before the list and another after it has no such answer, and neither choice
 * is right for more than half of them.
 *
 * A phrase is the sentence that says it. The head is a concept of this field's
 * category, so the category's order already places it, and the phrase is
 * written at the head's position among the field's other values. Nothing else
 * moves: the plain controls keep their own places, before or after, because the
 * order decides and no field had to know where a control sits.
 *
 * Read back as one unit, for the same reason. The head and its fields are one
 * value of this field, so a reading that takes the head without its list, or
 * the list without its head, is not a reading of this phrase.
 *
 * The head is excluded from the field's plain values automatically. It is
 * written here, and `exclude_concepts` is for a concept another field writes.
 */
export interface PhraseDoc {
    /**
     * The concept of this field's category that heads the phrase, and whose
     * position in that category's order the phrase is written at.
     */
    head: string;
    /** The fields written with the head. */
    fields: FieldDoc[];
    /**
     * Where the head sits relative to its fields. `first` by default, which is
     * a heading; `last` is the list that names its control afterwards.
     */
    head_position?: 'first' | 'last';
    /** Written once before the phrase. */
    prefix?: AffixDoc;
    /** Written once after the phrase. */
    suffix?: AffixDoc;
    /** What joins the head to its fields, and the fields to each other. */
    separator?: string;
}

/** A field bound to a category, optionally narrowed to particular concepts. */
/** What a category field carries besides the binding itself. */
export interface CategoryFieldCommonDoc extends FieldCommonDoc {
    /**
     * Concepts of this category that are written with fields of their own.
     *
     * Each phrase is emitted at the position its head holds in the category's
     * own order, so one field can write a control before a list-bearing control
     * and another after it without any field knowing where a control sits.
     */
    phrases?: PhraseDoc[];
    /**
     * Concepts bound by another field of this format, excluded here so the two
     * bindings are disjoint. Selection metadata, not parser precedence.
     */
    exclude_concepts?: string[];
    /** Affix written around each value, as opposed to once around all of them. */
    each?: EachAffixDoc;
    /** How a tiered concept composes inside this field. */
    tiers?: TierCompositionDoc[];
    /**
     * Whether this field writes only what its own view spells.
     *
     * A concept's spelling in a view falls back to `default`, which is what
     * lets a scheme name a view on the concepts that differ in it and leave
     * the rest alone. A field standing for a closed set cannot take that
     * fallback: an attribute whose published vocabulary enumerates exactly
     * what it accepts has no spelling for anything else, and writing the
     * `default` one puts a token in it that nothing reads back.
     *
     * Set here, a concept with no spelling in this field's view is left out of
     * this field and reported as omitted; every other field still writes it,
     * and the render stands, because an omission is the answer a closed set
     * gives rather than a fact the output lost. Recognition is unchanged: this
     * engine reads more tolerantly than it writes everywhere, and a field told
     * what it may write has not been told to stop understanding things.
     *
     * It is a statement about the field's vocabulary, never about the concept,
     * and never about which of two readings is right.
     */
    view_only?: boolean;
    /**
     * Concepts of this field's category its view deliberately does not spell.
     *
     * A `view_only` field leaves out a concept its view has no spelling for,
     * and a scheme check warns about each one, because most often the author
     * meant the field to carry it and forgot the spelling. Naming a concept
     * here says the omission is the vocabulary's, not the author's: the check
     * stays quiet about it, and the render still leaves it out and still
     * reports it as omitted.
     *
     * Only with `view_only`. An entry that names no concept this field binds,
     * or one the field's view does spell, is reported: the field writes the
     * same output, but the declaration no longer says what it does.
     */
    unspelled?: string[];
}

/**
 * A field bound to a category, optionally narrowed to particular concepts.
 *
 * Written one of two ways, and a field that does neither has no binding at all:
 * it names the category, or it names a concept that determines one. Naming a
 * concept that belongs to exactly one category makes `category` redundant, and
 * writing it out anyway puts two facts in the document where one decides the
 * other. A concept in several categories is a real choice and the field has to
 * make it, which is why the second form still accepts `category`.
 */
export type CategoryFieldDoc =
    | (CategoryFieldCommonDoc & {
          /** The category this field writes. */
          category: string;
          /** Narrow the binding to one concept: a fixed slot such as a header. */
          concept?: string;
      })
    | (CategoryFieldCommonDoc & {
          /**
           * The category this field writes. Omitted, `concept` determines it,
           * which it can only do when it belongs to exactly one category.
           */
          category?: string;
          /** The single concept this field writes. */
          concept: string;
      });

/** A field made of ordered child fields. */
export interface GroupFieldDoc extends FieldCommonDoc {
    /** The children, in the order they are written. */
    fields: FieldDoc[];
    /** Separators for particular boundaries between adjacent children. */
    joins?: JoinDoc[];
}

/**
 * One semantic field with several possible representations.
 *
 * Not first-match-wins: exactly one binding is active for any given state, and
 * two active at render is a representation conflict, never a silent pick.
 * Inside this field a descendant may stand for an already-implied, value-free
 * ancestor, following the full parent graph; it never hides an explicit,
 * distinct, or contradictory instruction.
 */
export interface AlternativesFieldDoc extends FieldCommonDoc {
    /** The possible representations of this one field. */
    alternatives: FieldDoc[];
}

/**
 * An attribute whose value the format fixes, written when a predicate holds.
 *
 * Every other field carries a fact out of the state and writes it. This one
 * writes the literal the document names, and it is read back as a check that
 * the same predicate holds: finding the attribute says the state satisfies
 * `when`, and an input that carries it while the predicate fails is not a
 * reading of this format. It binds no concept, and that is the point. A
 * structured representation can require a flag attribute that says something
 * about the representation rather than about the marking, and binding a concept
 * to it would make one way of writing a state hold a fact another way of
 * writing the same state does not.
 *
 * `when` is required. A fixed attribute written for every state says nothing
 * about any of them and the read side learns nothing from finding it, which
 * makes it a constant belonging to the format's syntax rather than a field.
 *
 * `xml-attributes` syntax only.
 */
export interface FixedAttributeFieldDoc {
    /** The attribute's local name. */
    attribute: string;
    /** The literal written as the attribute's value. */
    value: string;
    /** When the attribute is written, and what finding it asserts on the way back in. */
    when: WhenDoc;
    /**
     * The surfaces whose output this attribute belongs to, each named once.
     * Required in a format that writes more than one surface, because the
     * attribute binds no category to say. Omitted in a format that writes one
     * surface, it is that surface. It decides only which output writes the
     * attribute: reading it, and what its `when` can see, are unchanged.
     *
     * @minItems 1
     */
    output_surfaces?: string[];
    /** Human label for the field, for `joins` entries and diagnostics. */
    name?: string;
}

/** One field of a format. Exactly one binding shape per field. */
export type FieldDoc =
    | CategoryFieldDoc
    | GroupFieldDoc
    | AlternativesFieldDoc
    | FixedAttributeFieldDoc;

/**
 * Everything a format declares except the surfaces it writes. A format is this
 * plus exactly one of `surface` or `surfaces`; see {@link FormatDoc}.
 */
export interface FormatCommonDoc {
    /**
     * Format identifier. `render.default` and the views of `render.surfaces`
     * refer to it, and callers name it as an input format. In a scheme
     * without `render.surfaces` it is also an output format. In a scheme with
     * them it is a form of one view on each surface it serves, and it names
     * an output only when exactly one view names it; see
     * `RenderConfigDoc.surfaces`.
     */
    id: string;
    /** Layout: `inline` runs the fields together, `block` puts each on its own line. */
    mode: 'inline' | 'block';
    /** Encoding. Absent means plain text. */
    syntax?: SyntaxDoc;
    /** Default concept view for fields that do not name one. */
    view?: string;
    /** Written once before the nonempty whole. */
    prefix?: AffixDoc;
    /** Written once after the nonempty whole. */
    suffix?: AffixDoc;
    /**
     * Joins the nonempty top-level fields. Required once there is more than one
     * field and no `joins` entry covers the boundary.
     */
    separator?: string;
    /**
     * Spellings of this format's own separator that are read and never written.
     *
     * The same word as on a field, said of the boundary between the format's
     * top-level fields. See `FieldCommonDoc.separator_aliases`: tolerant pass
     * only, never written, every use a `separator` correction, and no spelling
     * here may be another field's separator or another field's prefix.
     */
    separator_aliases?: string[];
    /** Skip empty fields. Defaults to true for `block`, false for `inline`. */
    omit_empty?: boolean;
    /**
     * Leave assertions with `source: 'default'` out of the printed output. A
     * print filter only: every condition in this format still sees the real,
     * unfiltered state.
     */
    omit_defaults?: boolean;
    /**
     * Write a part's stand-in in place of the values it took from its whole.
     *
     * A part that holds a stand-in (a concept that declares
     * `stands_for_whole`) and was read against a whole holds the whole's
     * values in the category the stand-in names. This format leaves those
     * values out, so the part is written back with the word it was read
     * with. It applies only to a part read on its own: a rollup is a whole,
     * and is always written with its values. A print filter only, like
     * `omit_defaults`: every condition in this format still sees the values.
     */
    omit_whole_values?: boolean;
    /** The fields, in the order they are written. */
    fields: FieldDoc[];
    /** Separators for particular boundaries between adjacent top-level fields. */
    joins?: JoinDoc[];
}

/**
 * A format: one way this scheme's markings are written.
 *
 * The field list is the canonical output order. It does not demand that input
 * arrive in that order; the same tree recognizes a reordered marking and says
 * what it corrected.
 *
 * A format writes one surface, named in `surface`, or several at once, named in
 * `surfaces`, when its syntax carries more than one part of a marking in one
 * place, such as one XML attribute list. Exactly one of the two is declared. A
 * format writes several surfaces only in a scheme that declares its outputs by
 * surface in `render.surfaces`: without them every format is an output under
 * its own id, and an output writes one surface.
 */
export type FormatDoc = FormatCommonDoc &
    (
        | {
              /**
               * The semantic part of a marking this format writes: a scheme
               * scope id. `surfaces` is absent.
               */
              surface: string;
              /** Absent: this format writes the one surface `surface` names. */
              surfaces?: never;
          }
        | {
              /** Absent: this format writes the surfaces `surfaces` lists. */
              surface?: never;
              /**
               * The scheme scope ids this format writes together, two or more
               * and each once. Declared only in a scheme with
               * `render.surfaces`. `surface` is absent.
               *
               * @minItems 2
               */
              surfaces: string[];
          }
    );

/** A guarded alternative to a view's format. */
export interface OutputCaseDoc {
    /** When this case holds, evaluated against the whole state of the operation. */
    when: WhenDoc;
    /** The format written while this case holds. It must write the view's surface. */
    format: string;
}

/** The format that writes an output, and the guarded cases that swap in another. */
export interface OutputTargetDoc {
    /** The format written when no case holds. It must write the view's surface. */
    format: string;
    /**
     * Conditions under which another format writes this output instead.
     *
     * Cases are alternatives, not a priority list. Every case is evaluated
     * against the whole state of the operation: exactly one holding selects
     * its format, none holding selects `format`, and more than one holding, or
     * one that cannot be decided, refuses the output rather than picking for
     * it.
     */
    cases?: OutputCaseDoc[];
}

/**
 * A named view of one surface: an output a caller can ask for by id, and what
 * text is read as.
 *
 * A view is written in its `format`, or in a case's format while that case
 * holds, and is read in those and in each format `also_read_in` lists. Those
 * are the view's forms, though a request that names the view as its input
 * format reads only the ones the view writes, as `RenderConfigDoc.surfaces`
 * states. Every format of a scheme that declares `render.surfaces` is a form
 * of one view on each surface it serves, so text read in a form on one surface
 * is read as that surface's view, and has the view's role.
 *
 * A view `full` that is a whole, written in `full_line` and still read in the
 * retired `full_line_2019`, is `{ id: full, role: whole, format: full_line,
 * also_read_in: [full_line_2019] }`.
 *
 * A view id names an output, not a concept spelling. Two views can write
 * through formats that spell concepts the same way, and a format's concept
 * `view` needs no output named after it.
 */
export interface OutputViewDoc extends OutputTargetDoc {
    /** View id, unique within its surface. */
    id: string;
    /**
     * The role of the markings this is a view of.
     *
     * Text read as this view is a marking of this role, so a request about it
     * that names no output and no context role is written in its surface's
     * default for this role. Absent, the view has no role, as an attribute
     * list or a block that is neither a whole nor a part has none, and text
     * read as it has none either.
     *
     * Text read in a form has one role, so the views on other surfaces that
     * name one of this view's forms state the role this view states, or no
     * role when this view states none.
     */
    role?: ProcessingRole;
    /**
     * Formats this view is also read in and never written in, such as a
     * spelling the scheme retired but still reads in older documents.
     *
     * Each is a format of the view's surface, listed once, that no other view
     * of that surface names. None is the view's `format` or a case's format,
     * which the view is read in already.
     *
     * They are read when a request names no input format, or names one of
     * them by its own id. A request that names this view reads only the forms
     * this view writes, as `RenderConfigDoc.surfaces` states.
     *
     * @minItems 1
     */
    also_read_in?: string[];
}

/**
 * A surface's default view for each role, where the right default depends on
 * whether the marking is a whole or a part.
 *
 * `{ whole: full, part: short }` writes a whole marking in `full` and a part
 * in `short`. `whole` is required and `part` falls back to it, so
 * `{ whole: block }` and `{ whole: block, part: block }` mean what the view id
 * `block` means. A marking with no role is written as a whole, the same way
 * the engine reads a call that names no role as a call about the whole
 * marking. Each value is one of the surface's own views, and no other key is
 * allowed.
 *
 * Where `part` names a view of its own, that view is a view of part markings
 * and the `whole` view is not, so a marking written in either is read back as
 * that view and written in it again: a part, as a part, and a whole, as a
 * whole or as a marking with no role. The exception is text that a form of a
 * view of another role writes the same way: it reads back with no role, as
 * `RenderConfigDoc.surfaces` decides, and a request that names neither an
 * output nor a role writes it as a whole.
 */
export interface DefaultViewByRoleDoc {
    /**
     * The view a whole marking, or a marking with no role, is written in.
     * Where the surface has views of whole markings, one of them.
     */
    whole: string;
    /**
     * The view a part marking is written in. Where the surface has views of
     * part markings, one of them, and a view of part markings whenever it is
     * not the `whole` view. Absent, the `whole` view.
     */
    part?: string;
}

/**
 * The outputs one surface offers: its named views, in order, and the one it
 * writes when a request does not choose.
 *
 * A surface `sensitivity` whose everyday view is `full`, whose part markings
 * are written `short`, and which also writes `xml` for a caller that asks for
 * it by name declares those three views, `full` a whole and `short` a part,
 * and `default: { whole: full, part: short }`. A surface `retention` with one
 * view, `block`, declares `default: block`. A request for a view a surface
 * does not declare gets that surface's default for the marking's role.
 */
export interface SurfaceOutputDoc {
    /** The scheme scope id these outputs write. */
    surface: string;
    /**
     * The view written when a request names none, or names one this surface
     * does not declare: a view id, or a view per role.
     *
     * A view id means every marking is written in that view, whatever its
     * role. That is all a surface with one view, or one right default for
     * every marking, needs. A `DefaultViewByRoleDoc` names the view for
     * a whole and, when it differs, for a part. Either way each view named is
     * one of `views`, the same way `render.default` is always one of
     * `render.formats`.
     *
     * A surface that has views of a role writes a marking of that role in one
     * of them. A default that would write it in a view of another role, or of
     * none, is refused there: a view id that is not of that role, a map value
     * that is not, or a `whole` that a part falls back to.
     */
    default: string | DefaultViewByRoleDoc;
    /**
     * The views a caller can ask for, in display and result order.
     *
     * @minItems 1
     */
    views: OutputViewDoc[];
}

/**
 * Render configuration: the formats a scheme reads and writes, and, when it
 * declares them by surface, the outputs it offers.
 */
export interface RenderConfigDoc {
    /**
     * Named outputs per surface. When declared, these are the scheme's outputs
     * and `formats` is the library of their forms: every format is a form of
     * one view on each surface it serves, written by that view or only read
     * in for it. A format that a surface it serves has no view for is
     * refused, and so is one named by two views of a surface. The views that
     * name one format on different surfaces state one role between them, or
     * none, because text read in a form has one role. Results are keyed by
     * output address, `surface/view`, one entry per view, surfaces in this
     * order and views in theirs.
     *
     * Text is read as a view of the surface whose categories it carries.
     * Recognition settles the facts first, and views never change what they
     * are. It then decides the view among the views of that surface whose
     * forms read those facts:
     *
     * - The one view with a form that writes the text exactly as given.
     * - Failing that, the one view with a form that read every token in its
     * own spelling.
     * - Failing that, a role: among the views still tied (those with a form
     * that writes the text exactly, else those with a form that read every
     * token in its own spelling, else every view whose forms read the
     * facts), when all are of one role, that role, with the role's default
     * view when it is one of them.
     * - Otherwise no view and no role.
     *
     * Where a view is decided, recognition takes its corrections from a form
     * of that view, so no correction points at another view's spelling. Text
     * a form writes exactly is not corrected, whether or not one view is
     * decided.
     *
     * Text that carries the categories of more than one surface, in one form
     * views of those surfaces share or in parts read in different forms, is
     * read as no one view. Each surface's part of it is decided as a view on
     * its own, as above, and takes its corrections from the view decided for
     * it. The text's role is the one those parts agree on, counting only the
     * parts that have a role: a part read as a view with no role, or with no
     * role decided, leaves the role to the others.
     *
     * What the engine writes for a valid marking, on one surface or several,
     * must read back as right as written: `inputWasValid` is true, nothing is
     * corrected, and the same output writes the same text again.
     *
     * Recognition reports the view in `recognition.inputFormat`, its surface
     * in `recognition.surface` and the role in `recognition.role`, each only
     * when it is decided, and never the form the text happened to be read in.
     *
     * A result writes the surfaces its input was read on: those of the
     * categories it asserted, before or after repair, together with the
     * surface a request's `surface` field names and the surfaces of the view
     * or format a request names as its input format. With none of those it
     * writes the default scope's surface, so the default scope is always one
     * of the surfaces listed here. A fact inferred afterwards adds no surface.
     * Neither does a request's output format: it only chooses how those
     * surfaces are written, so `surface/view` for a surface the result does
     * not write selects nothing there.
     *
     * When a request names no output, each surface the result writes is
     * written in its default for the marking's role: the view its `default`
     * names for that role, or the one view it names for every role. The role
     * is the request's context role when it gives one. Otherwise it is the
     * role recognition decides for the text, the one `recognition.role`
     * reports. Text whose role is not decided has no role, and neither has a
     * marking given as facts with no context role. A marking with no role is
     * written as a whole. An aggregate's rollup is a whole and is written as
     * one; the context role an aggregate request gives describes the parts it
     * reads. This is the one rule for an unnamed output, and every operation
     * follows it but a scan, which keeps a marking it finds in the view it was
     * read as when that view writes the form it was read in, and writes each
     * one in the output its `ScanResult.type` names. Wherever the list below
     * says a surface writes its default, it is this default for the marking's
     * role.
     *
     * Wherever a request takes an output format, it names one of these:
     *
     * - A view id, such as `full`. Every surface the result writes uses that
     * view, and a surface that does not declare it writes its default.
     * - `surface/view`. That surface writes that view, or its default when it
     * declares no view by that id, and every other surface writes its
     * default. A surface this list does not declare is refused, never
     * guessed.
     * - The id of a format that exactly one view names as one of its forms,
     * written or only read. It stands for that view's `surface/view`.
     *
     * A view id wins over a format id spelled the same way, so a bare `x` that
     * is a view of one surface and a form of another surface's view asks every
     * surface for view `x`. A declared surface id, or a format that views on
     * several surfaces name, names no output: every surface writes its default,
     * as it does when the request names no output. An undeclared id is refused;
     * it is never answered as though the request had named none.
     *
     * Wherever a request takes an input format, it names what the text is
     * read as:
     *
     * - A view id. The text is read in the forms the views by that id write,
     * each one's `format` and case formats, on every surface that declares
     * one, and in no other format.
     * - `surface/view`. The text is read in the forms that view writes only.
     * - The id of a format. The text is read in that form alone.
     *
     * A form a view is only read in, one its `also_read_in` lists, is read
     * when the request names no input format, or names that form by its own
     * id. Naming the view does not read it: a view's written forms are how it
     * spells a marking, and a form it is only read in is a spelling the
     * scheme still tolerates, not one the view stands for.
     *
     * A view id wins over a format id spelled the same way here too, and any
     * other id is refused. Whatever the request names, recognition reports
     * the view the text was read as, decided as above among the views it
     * allows.
     *
     * Each id in an address is percent-encoded the way `encodeURIComponent`
     * encodes it, in requests and in result keys alike, so an id may hold a
     * `/`. An address is split on its one literal `/` before its parts are
     * decoded, and one with more than one literal `/` or a malformed escape is
     * refused. Every field that carries an output address (the keys of
     * `renders`, `RenderFormatLayout.id`, `FormatView.id`,
     * `defaultRenderFormat` and the role defaults, `ScanResult.type`,
     * `recognition.inputFormat`, `UnrepresentableOutput.output`) holds the
     * same encoded string.
     *
     * Absent, every format is an output under its own id and `default` picks
     * one. The two are not combined.
     *
     * @minItems 1
     */
    surfaces?: SurfaceOutputDoc[];
    /**
     * Written between the outputs of two surfaces when one rendered string
     * carries both, unless their syntax merges them, as attributes on one XML
     * element do. Required when `surfaces` lists more than one surface, and
     * not declared without `surfaces`.
     */
    surface_separator?: string;
    /**
     * ID of the format used when none is specified. Not declared beside
     * `surfaces`, where each surface names its own default view.
     */
    default?: string;
    /** Render formats. */
    formats?: FormatDoc[];
    /**
     * Display-color source. A category ID takes its color from the resolved
     * concept in that single-valued category. An ordered rule array supports
     * compound defaults; first matching rule wins. The two modes are mutually
     * exclusive.
     */
    color_from?: string | MarkingColorRuleDoc[];
    /**
     * Render-of-invalid policy: how the renderer treats input tokens that match
     * no concept. `preserve_unmatched` (the default) echoes them through to the
     * output; `drop_unmatched` discards them; `refuse` renders nothing for an
     * invalid marking. Consumed by the engine's scheme-mapper (D8).
     */
    of_invalid?: 'preserve_unmatched' | 'drop_unmatched' | 'refuse';
    /**
     * What the `refuse` policy renders in place of the marking. The optional
     * `{tokens}` placeholder is replaced with the comma-joined unmatched
     * tokens. Defaults to `[INVALID MARKING: unrecognized {tokens}]`. Only
     * consulted when `of_invalid` is `refuse`.
     */
    refusal_marker?: string;
}

/** A view filter: view-time concept filter consulted by render and suggest. */
export interface FilterDoc {
    /** Filter identifier. */
    id: string;
    /** Trigger condition. */
    when?: WhenDoc;
    /** Contexts the filter applies in (e.g. ['render', 'suggest']). */
    in?: string[];
    /**
     * Render formats the filter applies in, by format ID. Absent or empty means
     * every format, the same convention as `in`. Use it when a concept is
     * legitimate in the marking but has no encoding in one output format.
     *
     * Only render consults this; `suggest()` is never format-scoped.
     */
    formats?: string[];
    /** Concept or category IDs to remove when the filter fires. */
    remove?: string[];
    /** Concept or category IDs to keep (whitelist) when the filter fires. */
    keep?: string[];
    /** Human-readable explanation. */
    explanation?: string;
}

/**
 * Inline-or-external concepts block: the canonical 1.0 wire shape for a
 * scheme's concept set, per the Context-with-sources schema.
 *
 * When a concept in `inline` and a record from one of this block's `external`
 * sources have the same id, the inline concept is the one used, for reading,
 * writing, suggesting, describing, validating and judging coverage. The
 * source's record for that id is not used, and assertions of the concept carry
 * no `provenance`. This is how an author overrides one record of a source they
 * do not control. Among external sources, the first source that supplies an id
 * is the one used.
 *
 * Those two rules settle a collision inside one scheme document. Across the
 * documents of a layered stack, layer precedence decides first: a colliding id
 * means the later declaration wins (see `LayerBinding`), and a concept an
 * `external` source supplies counts as declared by the document that declares
 * the source. So when a later layer's source supplies a concept that an earlier
 * document in the stack declares `inline`, the later layer's record is the one
 * used. Inline-over-external never reaches back across layers. The same holds
 * the other way round, and between two sources declared in different layers.
 *
 * @public
 */
export interface SchemeConceptsBlock {
    /**
     * Inline concepts: a flat array of `ConceptDoc`, each carrying its own
     * `id`. Matches the `rules.inline` shape on guides and access docs.
     */
    inline?: ConceptDoc[];
    /**
     * Live external sources. An array allows a scheme to draw concepts from
     * multiple upstream endpoints; the loader rejects a bare (non-array) source
     * spec.
     */
    external?: ExternalSourceSpec<ConceptMappingDoc>[];
}

/**
 * The `data` block: categories and concepts.
 *
 * `concepts` is the `SchemeConceptsBlock` with `inline` and `external`
 * peers; the loader rejects any other shape.
 */
export interface SchemeDataDoc {
    /** Categories: dimensions of the marking. */
    categories?: CategoryDoc[];
    /** Concepts: `{ inline, external }` block. */
    concepts?: SchemeConceptsBlock;
    /** Named groupings of concepts, for organizing them in a UI or in docs. */
    concept_groups?: ConceptGroupDoc[];
}

/**
 * A named collection of concepts. It groups concepts for people reading or
 * browsing the scheme; it has no effect on parsing, rules or rendering.
 */
export interface ConceptGroupDoc {
    /** Unique group id within the scheme. */
    id: string;
    /** Display name. Defaults to the id. */
    name?: string;
    /** What the group collects. */
    description?: string;
    /** The concepts in the group, by id. */
    concept_ids: string[];
}

/** The body inside the top-level `scheme:` envelope. */
export interface SchemeBlock {
    /** Unique scheme identifier (e.g. 'tlp-v2', 'cedar-valley-protection'). */
    id: string;
    /** Semantic version (e.g. `3.0.0`, `20161231.0.0`). */
    version: string;
    /** Human-readable scheme name. */
    name: string;
    /** Longer description of what this scheme covers. */
    description?: string;
    /** Official description or definition of this scheme. */
    definition?: string;
    /** Usage notes, restrictions, or guidelines for this scheme. */
    guidance?: string;
    /**
     * License label shown with the scheme, such as `enterprise`.
     * Informational only: it does not grant or restrict use.
     */
    license?: string;
    /**
     * Distribution tier this document belongs to. Names which catalog carries
     * it; it grants nothing and is read by packaging, not by the engine.
     */
    tier?: string;
    /** Whether this scheme as a whole is deprecated. */
    deprecated?: boolean;
    /** Date the scheme was deprecated, as `YYYY-MM-DD`. */
    deprecated_since?: string;
    /** Scheme id that supersedes this one. */
    replaced_by?: string;
    /**
     * What kind of document this is. Absent means `'scheme'`.
     *
     * The single discriminator for layer-ness: `type: 'layer'` requires the
     * `layer` block and `type: 'scheme'` forbids it, both enforced at load.
     *
     * Every layerable family wears this same envelope; see
     * `LayerBinding`.
     */
    type?: 'scheme' | 'layer';
    /**
     * The scheme family's layer payload. Required when `type: 'layer'`,
     * forbidden otherwise.
     */
    layer?: LayerBlockDoc;
    /**
     * When true, this scheme reads a marking in the role its context gives, and
     * a part's rules can read the whole it is part of. Whether or not it is,
     * `process`, `validate` and `explain` compare a part that is valid on its
     * own with a whole that reads and is valid.
     */
    role_aware?: boolean;
    /**
     * Display-term overrides consulted by runtime UI components. Same shape and
     * chokepoint as guide's and access's own top-level `vocabulary` block: an
     * open map from a term key to a `{ singular, plural }` pair (or a bare
     * `singular`, auto-pluralized). Reserved scheme keys are `handbook`, which
     * renames the scheme's reference surface, and `whole` / `part`, which name
     * the structural context roles. For example: `{ handbook: { singular:
     * "Register" }, whole: { singular: "banner" } }`.
     */
    vocabulary?: Vocabulary;
    /**
     * When a marking in each role is required and, for a scheme without
     * `render.surfaces`, the formats each role is read in.
     *
     * A role's `required_when` condition evaluates after discovery against
     * authored whole assertions and authored part contributors. Omitted, a
     * whole is optional and a part required. Named conditions use the same
     * scheme condition registry.
     *
     * A scheme that declares `render.surfaces` lists no formats here: each of
     * its views states its own `role`, and a role is read in the forms of the
     * views that state it. A role takes `{ required_when: ... }` and nothing
     * else, and a list, flat or under `views`, is refused.
     *
     * A scheme without `render.surfaces` lists the format ids each role is
     * read in, in one of two shapes:
     *
     * - Flat: `{ whole: ['full'], part: ['wrapped'] }`.
     * - Nested: `{ whole: { views: [...] }, part: { views: [...] } }`: the same
     * list under `views`, beside an optional `required_when`.
     *
     * Either way the lists are about reading. The view or format a marking in
     * each role is written in, when a request names none, comes from the
     * surface's `default`, or from `render.default`. A role entry that says
     * nothing is refused.
     */
    role_detection?: {
        /** How a whole marking is detected. */
        whole?:
            | string[]
            | {
                  /** The format ids a whole marking is read in. */
                  views?: string[];
                  /** The condition under which a whole marking is required. */
                  required_when?: WhenDoc;
              };
        /** How a part marking is detected. */
        part?:
            | string[]
            | {
                  /** The format ids a part marking is read in. */
                  views?: string[];
                  /** The condition under which a part marking is required. */
                  required_when?: WhenDoc;
              };
    };
    /**
     * How much text a part marking governs in a document audit:
     * `'paragraph'` (default, the mark's own line(s)), `'until-next'` (through
     * to the next part marking, a section style), or `'document'`. Lets schemes
     * that place/scope markings differently audit correctly. Maps to runtime
     * `Scheme.partScope`.
     */
    part_scope?: 'paragraph' | 'until-next' | 'document';
    /**
     * The scope a marking is in when nothing names one: one of `scopes`, by
     * id.
     *
     * Required whenever a scheme declares at least one scope, and the only way
     * to name the default: the scheme names its default scope once, as a
     * surface names its default view. A layer may leave it out and keep the
     * default of the stack it sits on, or state it to name another; a layer
     * that gives the stack its first scopes names one.
     */
    default_scope?: string;
    /** Display label for the scope selector. */
    scope_label?: string;
    /** Scope definitions, in the order a selector offers them. */
    scopes?: Array<{
        /** The scope id. */
        id: string;
        /** The scope's display label. */
        label: string;
    }>;
    /** Categories, concepts, and bulk-concept groups. */
    data: SchemeDataDoc;
    /** Scheme rules: conditions and the actions they trigger. */
    rules?: SchemeRuleDoc[];
    /**
     * Reusable `when` trees referenced with `{ named_condition: <id> }`. A
     * layer may also reference definitions inherited from its base and required
     * layers.
     */
    named_conditions?: Record<string, WhenDoc>;
    /** Rollup pipelines for categories with `rollup: pipeline`. */
    rollup_pipelines?: RollupPipelineDoc[];
    /** Embedded-marking styles for inline parsing/rendering. */
    embedded_marking?: EmbeddedMarkingStyleDoc[];
    /** Parse configuration. */
    parse?: ParseConfigDoc;
    /** Render configuration. */
    render?: RenderConfigDoc;
    /** View filters. */
    filters?: FilterDoc[];
    /**
     * UI metadata: engine knows `label_presets` and `wizard_questions`; other
     * keys opaque. `vocabulary` is a top-level SchemeBlock field, not a `ui`
     * sub-key, so it is schema-validated the same way as guide's and access's.
     */
    ui?: Record<string, unknown>;
}

/**
 * Top-level YAML document shape: `{ scheme: { ... } }`.
 *
 * This interface is the source of truth for `scheme.schema.json`. Edit fields
 * here and rerun `node libs/schemas/build.mjs` to regenerate the schema.
 */
export interface SchemeDefinition {
    /** Root `scheme:` envelope. */
    scheme: SchemeBlock;
}
