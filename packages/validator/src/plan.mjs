/**
 * The compile-only half of the format contract.
 *
 * A scheme's formats describe a grammar. Some things about that grammar are
 * decidable from the document alone, with no input to recognize and nothing to
 * render: whether a field that can hold two values says what goes between them,
 * whether a declared boundary exists, whether two fields claim the same
 * concept, whether a hierarchy is a hierarchy. Those are the questions that
 * decide whether the contract can express a scheme at all, so they are answered
 * here, from the document alone.
 *
 * Two things this is not. It does not recognize: nothing takes an input string.
 * It does not render: nothing takes an assertion. It builds the plan tree a
 * recognizer and a renderer would both walk, and reports what is wrong with the
 * shape of it.
 *
 * The node union mirrors the engine's own internal node contract. If the tree a
 * format compiles to cannot be built from the document, the authoring contract
 * is wrong.
 */

/** @typedef {'error' | 'warning'} PlanSeverity */

/**
 * @typedef {object} PlanDiagnostic
 * @property {string} id Stable diagnostic id, used by tests and by authors.
 * @property {PlanSeverity} severity Whether this stops the document or advises
 *   about it. An error means the document does not describe an output. A
 *   warning means it does, and something about it is worth knowing before a
 *   value arrives at run time.
 * @property {string} path Where in the document the problem is.
 * @property {string} message What is wrong and what would fix it.
 */

/** Every diagnostic this walker can report, with the rule each one enforces. */
export const PLAN_DIAGNOSTICS = Object.freeze({
    /** A field can hold more than one value and nothing says what joins them. */
    INDETERMINATE_SEPARATOR: 'plan/indeterminate-separator',
    /** A `joins` entry names two children that are not next to each other. */
    NON_ADJACENT_JOIN: 'plan/non-adjacent-join',
    /** Two fields of one format claim the same concept. */
    OVERLAPPING_BINDINGS: 'plan/overlapping-bindings',
    /** A phrase's head is not a concept the field it sits on writes. */
    PHRASE_HEAD_NOT_BOUND: 'plan/phrase-head-not-bound',
    /** Two phrases of one field name the same head. */
    OVERLAPPING_PHRASES: 'plan/overlapping-phrases',
    /** Two attribute fields write the same attribute and may both be active. */
    DUPLICATE_ATTRIBUTE: 'plan/duplicate-attribute',
    /**
     * One spelling opens two fields of a format, as a prefix or an alias of
     * one.
     */
    PREFIX_ALIAS_COLLISION: 'plan/prefix-alias-collision',
    /**
     * A separator spelling read by one field is a boundary or an opening
     * another field of the same format writes.
     */
    SEPARATOR_ALIAS_COLLISION: 'plan/separator-alias-collision',
    /** A tier composition names a view no concept in that tier declares. */
    UNBOUND_TIER_VIEW: 'plan/unbound-tier-view',
    /** One tiered concept has more than one parent this field could compose. */
    AMBIGUOUS_TIER_HEAD: 'plan/ambiguous-tier-head',
    /** Two boundaries spell the same composition head differently. */
    CONFLICTING_TIER_HEAD_VIEW: 'plan/conflicting-tier-head-view',
    /** A concept is its own ancestor. */
    HIERARCHY_CYCLE: 'plan/hierarchy-cycle',
    /** A value could contain the syntax that frames it, and nothing escapes it. */
    UNFRAMABLE_VALUE: 'plan/unframable-value',
    /** A view carries a placeholder that is not `{value}`. */
    UNKNOWN_PLACEHOLDER: 'plan/unknown-placeholder',
    /** A `when` names a condition the document does not declare. */
    UNRESOLVED_CONDITION: 'plan/unresolved-condition',
    /**
     * A literal in a field is also something else in the same field: free text
     * that could be written as a fixed instruction beside it, or a spelling
     * that is the field's own separator.
     */
    RESERVED_LITERAL_COLLISION: 'plan/reserved-literal-collision',
    /**
     * A field, recognizer binding, or contextual alias names a category,
     * concept, view, format or field that does not exist, or a reference the
     * document requires, such as the default scope, is missing.
     */
    UNRESOLVED_REFERENCE: 'plan/unresolved-reference',
    /**
     * A form a view is only read in reads a spelling two concepts share as one
     * of them, binds no category of the other, and a form the scheme writes
     * reads it as the other. Only inline concepts are compared, and a form that
     * binds the other's category counts as reading it.
     */
    READ_ONLY_FORM_SHARED_SPELLING: 'plan/read-only-form-shared-spelling',
    /**
     * A field declares `unspelled` without `view_only`. Only a `view_only`
     * field leaves a concept out for want of a spelling, so on any other field
     * the declaration describes nothing it does.
     */
    UNSPELLED_WITHOUT_VIEW_ONLY: 'plan/unspelled-without-view-only',
});

/**
 * Severity per diagnostic. Everything is an error unless it is listed here.
 *
 * A warning never fails compilation. Both warnings describe the same kind of
 * thing: a value that _could_ be written in a way this representation cannot
 * read back. Neither is a property of the document; each is a property of one
 * value, and the enforcement is the run-time unrepresentable-value result
 * reported against the value that actually caused it.
 *
 * `unframable-value` as a refusal left an author one way out: declaring an
 * escape mechanism their format does not have, which makes the document state
 * something untrue about the scheme. `reserved-literal-collision` as a refusal
 * is worse, because it has no way out at all. A category that holds both an
 * instruction spelled as a fixed word and an instruction written as free text
 * is ordinary; the free text is a description, and a description that happens
 * to be spelled exactly as one of the fixed words is the rare case the run time
 * refuses. Refusing the category would mean the two facts cannot share a field,
 * which is not a statement about representation but about the domain.
 */
export const PLAN_DIAGNOSTIC_SEVERITY = Object.freeze({
    [PLAN_DIAGNOSTICS.UNFRAMABLE_VALUE]: 'warning',
    [PLAN_DIAGNOSTICS.RESERVED_LITERAL_COLLISION]: 'warning',
});

/** The roles a marking can have, as the contract's `ProcessingRole` lists them. */
const ROLES = Object.freeze(['whole', 'part']);

/**
 * The role a view states, as `{ is }` with `is` undefined for a view with no
 * role, or `undefined` for a value the schema refuses.
 */
function stating(role) {
    return role === undefined || ROLES.includes(role)
        ? { is: role }
        : undefined;
}

/** How a diagnostic names a view by the role it states. */
function roleKind(role) {
    return ROLES.includes(role)
        ? `a view of ${role} markings`
        : 'a view with no role';
}

/** The severity of one diagnostic id. Anything unlisted is an error. */
export function severityOf(id) {
    return PLAN_DIAGNOSTIC_SEVERITY[id] ?? 'error';
}

// ---------------------------------------------------------------------------
// Document index
// ---------------------------------------------------------------------------

function indexDocument(scheme) {
    const categories = new Map();
    for (const category of scheme?.data?.categories ?? []) {
        if (category?.id) categories.set(category.id, category);
    }
    const concepts = new Map();
    const byCategory = new Map();
    for (const concept of scheme?.data?.concepts?.inline ?? []) {
        if (!concept?.id) continue;
        concepts.set(concept.id, concept);
        for (const categoryId of concept.categories ?? []) {
            if (!byCategory.has(categoryId)) byCategory.set(categoryId, []);
            byCategory.get(categoryId).push(concept);
        }
    }
    const required = new Map();
    for (const [categoryId, category] of categories) {
        if (category?.required !== true) continue;
        required.set(
            categoryId,
            new Set((byCategory.get(categoryId) ?? []).map((one) => one.id)),
        );
    }
    return {
        categories,
        concepts,
        byCategory,
        required,
        namedConditions: new Set(Object.keys(scheme?.named_conditions ?? {})),
        scopes: new Set((scheme?.scopes ?? []).map((scope) => scope?.id)),
        formats: new Set(
            (scheme?.render?.formats ?? []).map((format) => format?.id),
        ),
    };
}

/** Views a concept declares. A bare string means every view spells it that way. */
function viewsOf(concept) {
    if (typeof concept?.views === 'string') return null; // every view
    return new Set(Object.keys(concept?.views ?? {}));
}

/** The view a head resolves to at one normalized tier boundary. */
function effectiveHeadView(tiers, boundary, head, fieldView) {
    const headTierView = tiers.find((tier) => tier?.tier === head?.tier)?.view;
    const preferred = boundary?.headView ?? headTierView;
    if (preferred === undefined) return fieldView;
    const declared = viewsOf(head);
    return declared === null || declared.has(preferred) ? preferred : fieldView;
}

/** The literal text a concept writes in a view, when it is a fixed literal. */
function literalIn(concept, view) {
    const views = concept?.views;
    if (typeof views === 'string') return views;
    const text = views?.[view] ?? views?.default;
    return typeof text === 'string' ? text : undefined;
}

/**
 * The spellings a concept is read by in a view: its text there, falling back to
 * `default`, and each of its aliases. Text that carries a value is a shape
 * rather than a spelling, so it is left out.
 */
function spellingsIn(concept, view) {
    const found = [];
    const own = literalIn(concept, view);
    if (own !== undefined && !own.includes('{value}')) found.push(own);
    for (const alias of concept?.aliases ?? []) {
        if (typeof alias === 'string') found.push(alias);
    }
    for (const alias of concept?.input_aliases ?? []) {
        if (typeof alias?.text === 'string') found.push(alias.text);
    }
    return found;
}

/**
 * Resolve the one composition head a field may use for each tiered concept.
 *
 * The inputs are deliberately smaller than an authored field. A runtime can
 * supply concepts resolved from an external source and normalized tier keys,
 * while the document walker supplies the same shapes from inline authoring.
 * Both therefore use one relation for eligibility and effective head views.
 *
 * @param {object} input
 * @param {object[]} input.concepts Concepts eligible for this field.
 * @param {{ tier?: string; view?: string; headView?: string }[]} input.tiers
 *   Normalized tier boundaries in authored order.
 * @param {string} input.fieldView The field's resolved view.
 * @param {string} input.path JSON pointer of the field.
 * @returns {{
 *     headByConcept: Map<string, string>;
 *     ambiguousConcepts: Set<string>;
 *     diagnostics: PlanDiagnostic[];
 * }}
 */
export function resolveTierHeadRelation({ concepts, tiers, fieldView, path }) {
    const eligibleById = new Map(
        concepts.map((concept) => [concept.id, concept]),
    );
    const headByConcept = new Map();
    const ambiguousConcepts = new Set();
    const diagnostics = [];
    for (const [tierAt, tier] of tiers.entries()) {
        const tierPath = `${path}/tiers/${tierAt}`;
        for (const member of concepts) {
            if (member.tier !== tier?.tier) continue;
            const parents = (member.parents ?? [])
                .map((parentId) => eligibleById.get(parentId))
                .filter((parent) => parent !== undefined);
            if (parents.length > 1) {
                ambiguousConcepts.add(member.id);
                diagnostics.push({
                    id: PLAN_DIAGNOSTICS.AMBIGUOUS_TIER_HEAD,
                    severity: severityOf(PLAN_DIAGNOSTICS.AMBIGUOUS_TIER_HEAD),
                    path: tierPath,
                    message: `concept \`${member.id}\` names more than one parent this field writes (${parents
                        .map((parent) => `\`${parent.id}\``)
                        .join(
                            ', ',
                        )}), so declaration order would choose the head of its composed token. Narrow this field so exactly one parent is eligible, or give the concept one eligible composition parent.`,
                });
                continue;
            }
            const [head] = parents;
            if (head) headByConcept.set(member.id, head.id);
        }
    }

    const spellingByHead = new Map();
    for (const [tierAt, tier] of tiers.entries()) {
        const tierPath = `${path}/tiers/${tierAt}`;
        const diagnosticPath =
            typeof tier?.headView === 'string'
                ? `${tierPath}/head_view`
                : tierPath;
        for (const member of concepts) {
            if (member.tier !== tier?.tier) continue;
            const headId = headByConcept.get(member.id);
            if (headId === undefined) continue;
            const head = eligibleById.get(headId);
            if (!head) continue;
            const wanted = effectiveHeadView(tiers, tier, head, fieldView);
            const spelling = literalIn(head, wanted);
            if (spelling === undefined) continue;
            const earlier = spellingByHead.get(head.id);
            if (earlier && earlier.spelling !== spelling) {
                diagnostics.push({
                    id: PLAN_DIAGNOSTICS.CONFLICTING_TIER_HEAD_VIEW,
                    severity: severityOf(
                        PLAN_DIAGNOSTICS.CONFLICTING_TIER_HEAD_VIEW,
                    ),
                    path: diagnosticPath,
                    message: `composition head \`${head.id}\` is spelled \`${earlier.spelling}\` by ${earlier.path} and \`${spelling}\` here. One head has one position in the composed token, so its tier boundaries must resolve to the same spelling.`,
                });
            } else if (!earlier) {
                spellingByHead.set(head.id, {
                    spelling,
                    path: diagnosticPath,
                });
            }
        }
    }
    return { headByConcept, ambiguousConcepts, diagnostics };
}

function carriesValue(concept) {
    if (concept?.text_input) return true;
    const views = concept?.views;
    const spelling = typeof views === 'string' ? views : views?.default;
    return typeof spelling === 'string' && spelling.includes('{value}');
}

// ---------------------------------------------------------------------------
// Field shapes
// ---------------------------------------------------------------------------

function fieldKind(field) {
    if (
        Object.hasOwn(field ?? {}, 'attribute') &&
        Object.hasOwn(field ?? {}, 'value')
    ) {
        return 'fixed';
    }
    if (
        Object.hasOwn(field ?? {}, 'category') ||
        Object.hasOwn(field ?? {}, 'concept')
    ) {
        return 'category';
    }
    if (Object.hasOwn(field ?? {}, 'fields')) return 'group';
    if (Object.hasOwn(field ?? {}, 'alternatives')) return 'alternatives';
    return 'unknown';
}

/**
 * Read a `prefix`/`suffix` value as the ordered parts it writes.
 *
 * A plain string is one unconditional part. A list is the concatenation rule:
 * every entry whose condition holds contributes its text, in the order the
 * author wrote them, so several independent conditions can each add their own
 * piece without the author enumerating every combination as alternatives.
 *
 * Returns `undefined` when nothing is declared, so a caller can still tell an
 * absent affix from an empty one.
 */
function affixParts(value) {
    if (value === undefined) return undefined;
    if (typeof value === 'string') return [{ text: value }];
    if (Array.isArray(value)) {
        return value.map((entry) =>
            typeof entry === 'string' ? { text: entry } : { ...entry },
        );
    }
    return [];
}

/**
 * The one spelling an affix always writes, when it has one.
 *
 * A part behind a predicate is written in some states and not others, so a list
 * holding one is several spellings rather than one and this answers nothing for
 * it. Only used for the openings a format claims.
 *
 * @returns The concatenated text, or `undefined` when it varies with the state.
 */
function spellingOf(parts) {
    if (parts === undefined || parts.length === 0) return undefined;
    if (parts.some((part) => part?.when !== undefined)) return undefined;
    const text = parts.map((part) => part?.text ?? '').join('');
    return text.length > 0 ? text : undefined;
}

function fieldLabel(field, index) {
    return (
        field?.name ??
        field?.concept ??
        field?.category ??
        field?.attribute ??
        `field ${index}`
    );
}

// ---------------------------------------------------------------------------
// Emptiness: the states in which a node writes nothing
// ---------------------------------------------------------------------------

/**
 * Whether a node can come out empty is not a yes-or-no question about the
 * document. It is a question about the state the document is given: a field
 * behind `when: X` writes nothing exactly when X does not hold, and two fields
 * behind X and its negation cannot both be silent, whatever X turns out to be.
 * Answering it with a boolean threw that away, and the thrown-away half is the
 * one that decides whether a format that swaps two fields around can be written
 * at all.
 *
 * So emptiness is carried as the condition under which it happens: a
 * disjunction of conjunctions over predicate literals, in the ordinary way. A
 * literal is a named condition, a concept assertion, or a category's content,
 * each with a polarity; a predicate this walker cannot read becomes a literal
 * of its own keyed by where it was written, which is sound because a formula
 * nobody can evaluate is still the same formula wherever it appears twice by
 * reference and a different one wherever it does not.
 *
 * Three answers come out of it, and the severity follows from which:
 *
 * - No clause survives: the node writes something in every state the scheme
 *   admits, and there is nothing to report;
 * - A clause with no literals: the node is empty regardless of the state, which
 *   is the original empty-match loop and stays an error;
 * - Only clauses carrying literals: the node is empty only in states some
 *   predicate set would have to admit, and this walker cannot decide whether
 *   any such state is reachable. That is a warning, and the run time enforces
 *   what the compile could not prove.
 */

/** A conjunction of literals, as predicate key -> polarity. */
/** A condition is an array of those clauses, read as their disjunction. */

/** The condition that never holds: an empty disjunction. */
const NO_STATE = [];

/** The condition that always holds: a disjunction of one empty conjunction. */
function everyState() {
    return [new Map()];
}

/**
 * A ceiling on how many clauses a condition carries.
 *
 * Conjoining two conditions multiplies their clause counts, so a deeply nested
 * document could in principle grow one without bound. Past the ceiling the
 * condition is widened to `everyState()`, which is the conservative direction:
 * it can turn a provably-fine format into a reported one, never the reverse.
 */
const MAX_CLAUSES = 64;

/** Whether one clause subsumes another: everything it requires, the other does. */
function subsumes(broad, narrow) {
    if (broad.size > narrow.size) return false;
    for (const [key, value] of broad) {
        if (narrow.get(key) !== value) return false;
    }
    return true;
}

/**
 * Drop the clauses that describe no state, and the ones another clause already
 * covers.
 *
 * `impossible` is the scheme's own contribution: a clause denying every concept
 * of a category the scheme requires describes a state the scheme does not
 * admit, which is how "the required categories guarantee one branch" is proved
 * rather than asserted.
 */
function normalize(clauses, impossible) {
    const kept = [];
    for (const clause of clauses) {
        if (impossible(clause)) continue;
        if (kept.some((other) => subsumes(other, clause))) continue;
        for (let at = kept.length - 1; at >= 0; at -= 1) {
            if (subsumes(clause, kept[at])) kept.splice(at, 1);
        }
        kept.push(clause);
    }
    if (kept.length > MAX_CLAUSES) return everyState();
    return kept;
}

/** Conjoin two conditions. A clause pair that disagrees on a literal is dropped. */
function conjoin(a, b, impossible) {
    const out = [];
    for (const left of a) {
        for (const right of b) {
            const merged = new Map(left);
            let agrees = true;
            for (const [key, value] of right) {
                const held = merged.get(key);
                if (held !== undefined && held !== value) {
                    agrees = false;
                    break;
                }
                merged.set(key, value);
            }
            if (agrees) out.push(merged);
        }
    }
    return normalize(out, impossible);
}

/** Disjoin two conditions. */
function disjoin(a, b, impossible) {
    return normalize([...a, ...b], impossible);
}

/** Whether a condition is empty of literals, and so holds whatever the state. */
function holdsUnconditionally(condition) {
    return condition.some((clause) => clause.size === 0);
}

/** A condition, written out for an author. */
function describeStates(condition) {
    const clauses = condition
        .slice(0, 3)
        .map((clause) =>
            [...clause]
                .map(([key, value]) => (value ? key : `not ${key}`))
                .join(' and '),
        );
    const more = condition.length - clauses.length;
    const written = clauses.map((one) => `a state where ${one}`).join(', or ');
    return more > 0 ? `${written}, or ${more} more such states` : written;
}

/**
 * Read one `when` node as a single predicate literal.
 *
 * Deliberately narrow. Every shape here is one the engine's own predicate
 * evaluator settles from the asserted state alone, so two of them written in
 * two places are the same literal and can cancel. A shape that depends on a
 * role, a contributor set, or a context is not read as a literal at all: the
 * caller gives it a key of its own, which is the honest answer, because two
 * such predicates written in two places are not known to be the same one.
 */
function literalOf(node) {
    if (typeof node === 'string')
        return { key: `concept:${node}`, value: true };
    if (!node || typeof node !== 'object' || Array.isArray(node)) {
        return undefined;
    }
    if (node.target !== undefined || node.role !== undefined) return undefined;
    if (node.scope !== undefined || node.quantifier !== undefined) {
        return undefined;
    }
    if (typeof node.has === 'string') {
        return { key: `concept:${node.has}`, value: true };
    }
    const operator =
        node.operator ??
        (typeof node.is === 'string' ? node.is.split(' ')[0] : undefined);
    const category = node.category ?? node.category_id;
    if (operator === 'has_concept' && typeof node.value === 'string') {
        return { key: `concept:${node.value}`, value: true };
    }
    if (operator === 'not_has_concept' && typeof node.value === 'string') {
        return { key: `concept:${node.value}`, value: false };
    }
    if (operator === 'has_content' && typeof category === 'string') {
        return { key: `content:${category}`, value: true };
    }
    if (operator === 'has_no_content' && typeof category === 'string') {
        return { key: `content:${category}`, value: false };
    }
    if (
        operator === undefined &&
        typeof category === 'string' &&
        node.value === undefined
    ) {
        // The category shorthand: any concept in this category triggers it.
        return { key: `content:${category}`, value: true };
    }
    return undefined;
}

/**
 * The condition under which a `when` holds, or the one under which it fails.
 *
 * A quantifier block is taken apart the way it reads, and a named condition is
 * looked up and taken apart in its place. That lookup is the part that matters:
 * a scheme that declares `owner-is-home` and `owner-is-not-home` separately has
 * written a predicate and its negation, and only expanding both shows that the
 * two cannot fail together. Left as two opaque names they are two unrelated
 * predicates, and a format whose two branches are guarded by them looks as
 * though it has a gap between them when it has none.
 *
 * Anything that cannot be taken apart becomes one opaque literal keyed by its
 * position, which makes it a free variable: the walker then knows only that the
 * same block cannot both hold and fail, which is all it is entitled to know. A
 * named condition whose body is opaque, or which is missing or
 * self-referential, is keyed by its name, so two references to it are still the
 * same variable.
 */
function conditionOf(when, path, negated, ctx) {
    const opaque = (key) => [new Map([[key, !negated]])];
    if (
        when &&
        typeof when === 'object' &&
        !Array.isArray(when) &&
        typeof when.named_condition === 'string' &&
        when.target === undefined &&
        when.scope === undefined
    ) {
        const name = when.named_condition;
        const body = ctx.named.get(name);
        if (body === undefined || ctx.open.has(name))
            return opaque(`named:${name}`);
        ctx.open.add(name);
        const out = conditionOf(body, `named:${name}`, negated, ctx);
        ctx.open.delete(name);
        return out;
    }
    const literal = literalOf(when);
    if (literal !== undefined) {
        return [
            new Map([[literal.key, negated ? !literal.value : literal.value]]),
        ];
    }
    if (Array.isArray(when)) {
        // A list of concept ids is an any-of; a list of conditions is an all-of.
        const anyOf = when.every((entry) => typeof entry === 'string');
        return combine(when, path, negated, ctx, anyOf ? 'any' : 'all');
    }
    if (!when || typeof when !== 'object') return opaque(`opaque:${path}`);
    if (when.target !== undefined || when.quantifier !== undefined) {
        return opaque(`opaque:${path}`);
    }
    if (when.scope !== undefined) return opaque(`opaque:${path}`);

    const blocks = [];
    if (Array.isArray(when.all)) blocks.push(['all', when.all]);
    if (Array.isArray(when.any)) blocks.push(['any', when.any]);
    if (Array.isArray(when.none)) blocks.push(['none', when.none]);
    if (typeof when.category === 'string') {
        blocks.push(['all', [{ category: when.category }]]);
    }
    if (blocks.length === 0) return opaque(`opaque:${path}`);

    // The blocks of one object are conjoined; negating the object negates the
    // conjunction, which is the disjunction of the negated blocks.
    let out = negated ? NO_STATE : everyState();
    for (const [kind, items] of blocks) {
        const block = combine(items, `${path}/${kind}`, negated, ctx, kind);
        out = negated
            ? disjoin(out, block, ctx.impossible)
            : conjoin(out, block, ctx.impossible);
    }
    return out;
}

/** One quantifier block, in either polarity. */
function combine(items, path, negated, ctx, kind) {
    // `none` is `all` with the items already negated: every item must fail.
    // Its negation is therefore `any` of the original items.
    const flip = kind === 'none';
    const inner = flip ? 'all' : kind;
    const parts = items.map((item, at) =>
        conditionOf(item, `${path}/${at}`, flip ? !negated : negated, ctx),
    );
    if (parts.length === 0) {
        // An empty quantifier holds vacuously for `all` and never for `any`.
        const holds = inner === 'all';
        return holds !== negated ? everyState() : NO_STATE;
    }
    // Negation turns the quantifier over: not-all is any-not, not-any is
    // all-not, and the parts above were already built in the negated polarity.
    const conjunction = negated ? inner === 'any' : inner === 'all';
    let out = conjunction ? everyState() : NO_STATE;
    for (const part of parts) {
        out = conjunction
            ? conjoin(out, part, ctx.impossible)
            : disjoin(out, part, ctx.impossible);
    }
    return out;
}

// ---------------------------------------------------------------------------
// The walker
// ---------------------------------------------------------------------------

class PlanBuilder {
    /** @param {object} scheme The `scheme:` block of a parsed document. */
    constructor(scheme) {
        this.scheme = scheme;
        this.index = indexDocument(scheme);
        /** @type {PlanDiagnostic[]} */
        this.diagnostics = [];
        /** Node -> the condition under which it writes nothing. */
        this.emptyOf = new WeakMap();
        /** Conditional node -> the predicate it is written behind. */
        this.guardOf = new WeakMap();
        /** Conditional node -> its child's emptiness, guard aside. */
        this.innerEmptyOf = new WeakMap();
        /** Format id -> every category field it binds, at any depth. */
        this.bindingsOf = new Map();
        /** View -> spelling key -> the concepts spelled that way in it. */
        this.spellersByView = new Map();
        this.impossible = (clause) => this.describesNoState(clause);
    }

    /**
     * Whether a conjunction of literals describes a state this scheme rules
     * out.
     *
     * One rule, and it is the scheme's own: a category the scheme requires
     * always holds something, so a clause that denies every concept of it, or
     * denies that it has content at all, describes nothing. That is what proves
     * a pair of branches exhaustive when neither is the other's negation but
     * between them they name everything a required category can hold.
     */
    describesNoState(clause) {
        for (const [categoryId, concepts] of this.index.required) {
            if (clause.get(`content:${categoryId}`) === false) return true;
            if (concepts.size === 0) continue;
            let denied = true;
            for (const conceptId of concepts) {
                if (clause.get(`concept:${conceptId}`) !== false) {
                    denied = false;
                    break;
                }
            }
            if (denied) return true;
        }
        return false;
    }

    /**
     * What `conditionOf` needs to read a predicate: the declared names and the
     * scheme's own constraints.
     */
    conditionContext() {
        return {
            impossible: this.impossible,
            named: new Map(Object.entries(this.scheme?.named_conditions ?? {})),
            open: new Set(),
        };
    }

    /** The condition under which `when` holds. */
    whenHolds(when, path) {
        return conditionOf(when, path, false, this.conditionContext());
    }

    /** The condition under which `when` fails. */
    whenFails(when, path) {
        return conditionOf(when, path, true, this.conditionContext());
    }

    report(id, path, message, severity) {
        this.diagnostics.push({
            id,
            severity: severity ?? severityOf(id),
            path,
            message,
        });
    }

    /** Build the plan for every format and report what is wrong with each. */
    build() {
        const formats = [];
        this.checkHierarchy();
        this.checkDefaultScope();
        const declared = this.scheme?.render?.formats ?? [];
        declared.forEach((format, index) => {
            formats.push(
                this.buildFormat(format, `/scheme/render/formats/${index}`),
            );
        });
        this.checkSurfaceOutputs(formats);
        this.checkRecognizers(formats);
        this.checkInputAliases();
        return { formats, diagnostics: this.diagnostics };
    }

    /**
     * A recognizer names a format and, per capture group, a field inside it.
     * Both are references into the tree this walker just built, so both are
     * resolvable here, and an unresolvable one is a declaration that could
     * never fire: the format it feeds does not exist, or the field it fills is
     * not a field of that format.
     */
    checkRecognizers(formats) {
        const byId = new Map(formats.map((format) => [format.id, format]));
        const declared = this.scheme?.parse?.recognizers ?? [];
        declared.forEach((recognizer, index) => {
            const path = `/scheme/parse/recognizers/${index}`;
            const target = byId.get(recognizer?.format);
            if (!target) {
                this.report(
                    PLAN_DIAGNOSTICS.UNRESOLVED_REFERENCE,
                    `${path}/format`,
                    `recognizer \`${recognizer?.id}\` feeds format \`${recognizer?.format}\`, which this scheme does not declare in \`render.formats\`.`,
                );
                return;
            }
            const names = this.fieldNamesOf(
                this.scheme?.render?.formats?.find(
                    (format) => format?.id === recognizer.format,
                ),
            );
            (recognizer?.binds ?? []).forEach((bind, at) => {
                if (!names.has(bind?.field)) {
                    this.report(
                        PLAN_DIAGNOSTICS.UNRESOLVED_REFERENCE,
                        `${path}/binds/${at}/field`,
                        `recognizer \`${recognizer?.id}\` binds capture group ${bind?.group} to \`${bind?.field}\`, which is not a field of format \`${recognizer.format}\`. A field is named by its \`name\`, by the category it writes, or by the concept it narrows to.`,
                    );
                }
            });
        });
    }

    /**
     * Every name a field of this format answers to, at any depth.
     *
     * The same set `joins` resolves against, including the concept a field
     * narrows to and the category that narrowing determines. A field written as
     * `{concept: X}` alone would otherwise be unreferenceable: it declares no
     * `name`, and the category it binds is derived rather than written.
     */
    fieldNamesOf(format) {
        const names = new Set();
        const walk = (fields) => {
            for (const field of fields ?? []) {
                for (const name of [
                    field?.name,
                    field?.category,
                    field?.concept,
                    field?.attribute,
                    this.boundCategoryOf(field),
                ]) {
                    if (typeof name === 'string') names.add(name);
                }
                walk(field?.fields);
                walk(field?.alternatives);
                // A phrase's fields are fields of this format: they bind
                // categories and read text back, and a recognizer binding one
                // of them is binding something that exists. Leaving them out
                // made a reference the engine resolves look unresolvable.
                for (const phrase of field?.phrases ?? []) {
                    walk(phrase?.fields);
                }
            }
        };
        walk(format?.fields);
        return names;
    }

    /** The category a field binds, derived and without reporting anything. */
    boundCategoryOf(field) {
        if (typeof field?.category === 'string') return field.category;
        const categories =
            this.index.concepts.get(field?.concept)?.categories ?? [];
        return categories.length === 1 ? categories[0] : undefined;
    }

    /**
     * `after_category` states the domain's own rule for a positional alias, so
     * the category it names has to be one this scheme declares. A misspelling
     * makes the alias unreachable rather than unconditional, which is the
     * failure that is hard to see in a passing test run.
     */
    checkInputAliases() {
        const concepts = this.scheme?.data?.concepts?.inline ?? [];
        concepts.forEach((concept, index) => {
            (concept?.input_aliases ?? []).forEach((alias, at) => {
                if (alias?.after_category === undefined) return;
                if (this.index.categories.has(alias.after_category)) return;
                this.report(
                    PLAN_DIAGNOSTICS.UNRESOLVED_REFERENCE,
                    `/scheme/data/concepts/inline/${index}/input_aliases/${at}/after_category`,
                    `concept \`${concept?.id}\` reads \`${alias.text}\` only after \`${alias.after_category}\`, which is not a category of this scheme.`,
                );
            });
        });
    }

    /**
     * Parent closure has to be transitive and has to terminate. A concept that
     * is its own ancestor makes every closure over it non-terminating, so it is
     * refused at compile time rather than bounded at run time by a depth limit
     * that turns a broken scheme into a silently truncated one.
     */
    checkHierarchy() {
        const state = new Map(); // id -> 'open' | 'done'
        const walk = (id, trail) => {
            const seen = state.get(id);
            if (seen === 'done') return;
            if (seen === 'open') {
                const cycle = [...trail.slice(trail.indexOf(id)), id].join(
                    ' -> ',
                );
                this.report(
                    PLAN_DIAGNOSTICS.HIERARCHY_CYCLE,
                    '/scheme/data/concepts/inline',
                    `\`${id}\` is its own ancestor: ${cycle}. A parent chain has to end.`,
                );
                return;
            }
            state.set(id, 'open');
            for (const parent of this.index.concepts.get(id)?.parents ?? []) {
                if (this.index.concepts.has(parent)) {
                    walk(parent, [...trail, id]);
                }
            }
            state.set(id, 'done');
        };
        for (const id of this.index.concepts.keys()) walk(id, []);
    }

    /**
     * Check `render.surfaces` against the formats it writes through and reads.
     *
     * Each entry names a declared scope once. Each view and each case names a
     * format that writes that scope, and so does each entry of a view's
     * `also_read_in`. Those are the view's forms, and every declared format is
     * a form of one view on each surface it serves: a format that a surface it
     * serves has no view for, or that two views of a surface name, would leave
     * text read in it there without one view to be read as. The views that name
     * one format on different surfaces state one role between them, or none,
     * because text read in a form has one role. A view's `also_read_in` lists
     * forms it never writes, each once. Each default, a view id or a view per
     * role, names only its own surface's views, the same way `render.default`
     * is one of `render.formats`, and writes a marking of a role in a view of
     * that role where the surface has one. The default scope is one of the
     * listed surfaces, because a result with nothing else to go on writes that
     * surface. A form a view is only read in reads a spelling two concepts
     * share as both or as neither, where a written form reads it as the other.
     * A view states its own role, so `role_detection` lists no formats beside
     * `render.surfaces`.
     *
     * A layer is held only to what it decides on its own. It restates an
     * inherited surface to add or override views, so the scopes, formats, named
     * conditions, views, separator and roles those views lean on can all sit in
     * the stack below it, which this walker never sees. Those checks belong to
     * the composed document. What the layer alone says, its shape, the view ids
     * inside each surface it restates, the forms the views it lists name, the
     * shape of a default it restates and the roles of the views it lists, is
     * still checked here.
     */
    checkSurfaceOutputs(formats) {
        const render = this.scheme?.render;
        const layer = this.scheme?.type === 'layer';
        const report = (path, message) =>
            this.report(PLAN_DIAGNOSTICS.UNRESOLVED_REFERENCE, path, message);
        if (render?.surfaces === undefined) {
            // A layer can declare a separator for surfaces it inherits.
            if (!layer && render?.surface_separator !== undefined) {
                report(
                    '/scheme/render/surface_separator',
                    '`render.surface_separator` is declared without `render.surfaces`, where every format is an output under its own id and no string carries the outputs of two surfaces. Nothing would ever be written between them; remove it.',
                );
            }
            this.checkRoleDetection(false, layer);
            return;
        }
        if (render.default !== undefined) {
            report(
                '/scheme/render/default',
                '`render.default` is declared beside `render.surfaces`, where each surface names its own default view. A scheme-wide default would be a second answer to the same question; remove it.',
            );
        }
        if (
            !layer &&
            render.surfaces.length > 1 &&
            typeof render.surface_separator !== 'string'
        ) {
            report(
                '/scheme/render/surface_separator',
                '`render.surfaces` lists more than one surface, and nothing says what is written between their outputs when one string carries several. Declare `surface_separator`.',
            );
        }
        const byId = new Map(formats.map((format) => [format.id, format]));
        const listed = new Set();
        // Every format a view names, whether or not it can be a form there.
        const mentioned = new Set();
        // Format id -> the surfaces with a view that names it as a form.
        const named = new Map();
        // Format id -> the first view on any surface to name it, and its role.
        const stated = new Map();
        // Each form a view is only read in, where its `also_read_in` names it.
        const readOnly = [];
        // Every format a view writes in, as its `format` or in a case.
        const writtenForms = new Set();
        render.surfaces.forEach((entry, index) => {
            const path = `/scheme/render/surfaces/${index}`;
            const surface = entry?.surface;
            const declared = this.index.scopes.has(surface);
            if (!declared && !layer) {
                report(
                    `${path}/surface`,
                    `\`render.surfaces\` names surface \`${surface}\`, which the scheme does not declare in \`scopes\`.`,
                );
            }
            if (listed.has(surface)) {
                report(
                    `${path}/surface`,
                    `surface \`${surface}\` is listed in \`render.surfaces\` more than once. Declare all of its views in one entry.`,
                );
            }
            listed.add(surface);
            // Whether the format can be a form of a view of this surface, after
            // reporting why not.
            const writes = (formatId, at, writer, verb = 'names') => {
                // A layer's view may write through a format the stack below
                // declares, which is checked once the stack is composed.
                if (layer) return true;
                const format = byId.get(formatId);
                if (format === undefined) {
                    report(
                        at,
                        `${writer} ${verb} format \`${formatId}\`, which \`render.formats\` does not declare.`,
                    );
                    return false;
                }
                if (
                    declared &&
                    format.surfaces.length > 0 &&
                    !format.surfaces.includes(surface)
                ) {
                    // An empty or malformed list is reported once at the
                    // format, which writes none, so neither is reported again here.
                    report(
                        at,
                        `${writer} ${verb} format \`${formatId}\`, which does not write surface \`${surface}\`.`,
                    );
                    return false;
                }
                // An undeclared surface is reported once, above, and has no
                // forms to hold to anything.
                return declared;
            };
            // Format id -> the declaration on this surface that names it first.
            const formOf = new Map();
            const views = [];
            const roles = new Map();
            (entry?.views ?? []).forEach((view, at) => {
                const viewPath = `${path}/views/${at}`;
                if (views.includes(view?.id)) {
                    report(
                        `${viewPath}/id`,
                        `surface \`${surface}\` declares view \`${view?.id}\` more than once. A view id is unique within its surface.`,
                    );
                }
                views.push(view?.id);
                // A role the schema refuses is left out, so nothing here is
                // judged against it.
                const role = stating(view?.role);
                if (!roles.has(view?.id) && role) roles.set(view?.id, role.is);
                const address = `${surface}/${view?.id}`;
                const writer = `view \`${address}\``;
                // What this view writes in: each format, and which of its
                // declarations writes it.
                const written = new Map();
                const claim = (formatId, at, as) => {
                    if (typeof formatId !== 'string') return;
                    const first = formOf.get(formatId);
                    if (first !== undefined && first.view !== view) {
                        report(
                            at,
                            `format \`${formatId}\` is named by \`${first.address}\` ${first.as} and by \`${address}\` ${as}. A format is a form of one view on each surface it serves, so text read in it is read as one view; only one of them may name it.`,
                        );
                        return;
                    }
                    if (first === undefined) {
                        formOf.set(formatId, { view, address, as });
                    }
                    if (!named.has(formatId)) named.set(formatId, new Set());
                    named.get(formatId).add(surface);
                    if (!role) return;
                    const other = stated.get(formatId);
                    if (other === undefined) {
                        stated.set(formatId, { address, role: role.is });
                    } else if (other.role !== role.is) {
                        report(
                            at,
                            `format \`${formatId}\` is a form of \`${other.address}\`, ${roleKind(other.role)}, and of \`${address}\`, ${roleKind(role.is)}. Text read in a form has one role, so the views that name it on different surfaces state the same role, or none of them does.`,
                        );
                    }
                };
                const writesIn = (formatId, at, subject, as) => {
                    if (typeof formatId !== 'string') return;
                    mentioned.add(formatId);
                    if (!written.has(formatId)) written.set(formatId, as);
                    if (writes(formatId, at, subject)) {
                        writtenForms.add(formatId);
                        claim(formatId, at, as);
                    }
                };
                writesIn(
                    view?.format,
                    `${viewPath}/format`,
                    writer,
                    'as its `format`',
                );
                (view?.cases ?? []).forEach((option, i) => {
                    const casePath = `${viewPath}/cases/${i}`;
                    // A layer's case may name a condition it inherits.
                    if (!layer) {
                        this.checkWhen(
                            option?.when,
                            `${casePath}/when`,
                            'this case could never hold',
                        );
                    }
                    writesIn(
                        option?.format,
                        `${casePath}/format`,
                        `case ${i} of ${writer}`,
                        `in case ${i}`,
                    );
                });
                const readIn = Array.isArray(view?.also_read_in)
                    ? view.also_read_in
                    : [];
                const listedOnce = new Set();
                readIn.forEach((formatId, k) => {
                    const at = `${viewPath}/also_read_in/${k}`;
                    if (listedOnce.has(formatId)) {
                        report(
                            at,
                            `${writer} lists format \`${formatId}\` in \`also_read_in\` more than once.`,
                        );
                        return;
                    }
                    listedOnce.add(formatId);
                    mentioned.add(formatId);
                    if (written.has(formatId)) {
                        report(
                            at,
                            `${writer} is also read in format \`${formatId}\`, which it writes ${written.get(formatId)}. A view is read in what it writes already; \`also_read_in\` lists only the forms it never writes.`,
                        );
                        return;
                    }
                    if (writes(formatId, at, writer, 'is also read in')) {
                        claim(formatId, at, 'in `also_read_in`');
                        readOnly.push({ formatId, at, address });
                    }
                });
            });
            this.checkSurfaceDefault(entry, path, views, roles, layer);
        });
        this.checkRoleDetection(true, layer);
        if (layer) return;
        this.checkFormsNamed(formats, mentioned, named, listed);
        this.checkDefaultScopeListed(listed);
        this.checkReadOnlySpellings(readOnly, writtenForms);
    }

    /**
     * Every declared format is a form of a view on each surface it serves,
     * where a scheme declares its outputs by surface.
     *
     * Text read in a format is read as the view whose form it is. A format no
     * view names would be read as no view at all, and a format that writes two
     * surfaces but is named on one of them would leave text read in it on the
     * other with no view to be read as, so either is refused rather than read
     * into a result that cannot say what it is. Only the surfaces
     * `render.surfaces` lists are held to it, and a format whose list of
     * surfaces is refused on its own account is not reported again.
     *
     * @param {{ surfaces: string[] }[]} formats The built formats, in
     *   declaration order.
     * @param {Set<string>} mentioned Every format id a view names, including
     *   one already refused where it is named.
     * @param {Map<string, Set<unknown>>} named Format id -> the surfaces with a
     *   view that names it as a form.
     * @param {Set<unknown>} listed The surfaces `render.surfaces` lists.
     */
    checkFormsNamed(formats, mentioned, named, listed) {
        const declared = this.scheme?.render?.formats ?? [];
        declared.forEach((format, index) => {
            const id = format?.id;
            if (typeof id !== 'string') return;
            const at = `/scheme/render/formats/${index}`;
            // A format a view names where it cannot be a form is refused
            // there, and not again here as named by none.
            if (!mentioned.has(id)) {
                this.report(
                    PLAN_DIAGNOSTICS.UNRESOLVED_REFERENCE,
                    `${at}/id`,
                    `no view in \`render.surfaces\` names format \`${id}\`. Every format of a scheme that declares its outputs by surface is a form of a view: written as its \`format\` or in a case, or read in through \`also_read_in\`. Name it on the view it belongs to, or remove it.`,
                );
                return;
            }
            // A format that writes one surface is named there, or the view
            // that names it is already refused for naming another surface's.
            if ((formats[index]?.surfaces ?? []).length < 2) return;
            const surfaces = named.get(id) ?? new Set();
            format.surfaces.forEach((surface, k) => {
                if (!listed.has(surface) || surfaces.has(surface)) return;
                this.report(
                    PLAN_DIAGNOSTICS.UNRESOLVED_REFERENCE,
                    `${at}/surfaces/${k}`,
                    `format \`${id}\` writes surface \`${surface}\`, and no view of \`${surface}\` names it. A format is a form of one view on each surface it serves; name it on a view of \`${surface}\`, or take \`${surface}\` out of its \`surfaces\`.`,
                );
            });
        });
    }

    /**
     * A surface default is a view id, or a map from role to view id.
     *
     * A map names `whole`, which also serves a marking with no role, and `part`
     * when a part is written in another view. No other key is a role. Every
     * view a default names is one of the surface's own views. A surface that
     * has views of a role writes that role in one of them, so a view id, a map
     * value, or a `whole` a part falls back to, that is not of that role is
     * refused there. Where a map keeps a view of its own for parts, that view
     * is a view of part markings and the `whole` view is not, so a marking
     * written in either reads back as the same view and is written in it again:
     * a part kept in a view with no role would read back with none and be
     * written as a whole. Written as a view id, or as a map whose `part` is
     * absent or the `whole` view, a default writes every marking in one view
     * and nothing reads back elsewhere.
     *
     * A layer replaces a default whole, so its map is held to the same shape,
     * but a view it names may be one the surface already has below, which only
     * the composed document can see. The roles it is held to are those of the
     * views it lists itself, since each of those overrides the view below
     * complete.
     *
     * @param {Map<unknown, unknown>} roles View id -> the role it declares, for
     *   the views this document lists on the surface.
     */
    checkSurfaceDefault(entry, path, views, roles, layer) {
        const surface = entry?.surface;
        const value = entry?.default;
        const report = (at, message) =>
            this.report(PLAN_DIAGNOSTICS.UNRESOLVED_REFERENCE, at, message);
        const own = views.map((id) => `\`${id}\``).join(', ');
        const names = (view, at, writes) => {
            if (layer || views.includes(view)) return true;
            report(
                at,
                `surface \`${surface}\` ${writes} view \`${view}\`, which it does not declare. A default is one of the surface's own views: ${own || 'it declares none'}.`,
            );
            return false;
        };
        const ofRole = (role) =>
            views
                .filter((id) => roles.get(id) === role)
                .map((id) => `\`${id}\``)
                .join(', ');
        // Whether a marking of `role` written by default in `view`, a view
        // this document lists with another role or none, passes over the views
        // of `role` it also lists.
        const passesOver = (role, view) =>
            ofRole(role) !== '' && roles.has(view) && roles.get(view) !== role;
        if (typeof value === 'string') {
            if (!names(value, `${path}/default`, 'defaults to')) return;
            for (const role of ROLES) {
                if (!passesOver(role, value)) continue;
                report(
                    `${path}/default`,
                    `surface \`${surface}\` writes every marking in view \`${value}\`, ${roleKind(roles.get(value))}, so it writes a ${role} marking there although it has views of ${role} markings: ${ofRole(role)}. A surface writes a marking in a view of its own role where it has one; name a default per role.`,
                );
            }
            return;
        }
        if (
            value === null ||
            typeof value !== 'object' ||
            Array.isArray(value)
        ) {
            report(
                `${path}/default`,
                `surface \`${surface}\` has to name its default as a view id, or as a view per role with \`whole\` and, when a part is written in another view, \`part\`.`,
            );
            return;
        }
        for (const key of Object.keys(value)) {
            if (ROLES.includes(key)) continue;
            report(
                `${path}/default/${key}`,
                `surface \`${surface}\` names a default view for \`${key}\`, which is not a role. A default by role names \`whole\` and, when a part is written in another view, \`part\`.`,
            );
        }
        // One of the surface's views, and one of its role where it has any.
        const holds = (role) => {
            const view = value[role];
            const at = `${path}/default/${role}`;
            const writes = `writes a ${role} marking in`;
            if (!names(view, at, writes)) return false;
            if (!passesOver(role, view)) return true;
            report(
                at,
                `surface \`${surface}\` ${writes} view \`${view}\`, ${roleKind(roles.get(view))}, although it has views of ${role} markings: ${ofRole(role)}. A surface writes a marking in a view of its own role where it has one.`,
            );
            return false;
        };
        if (value.whole === undefined) {
            report(
                `${path}/default`,
                `surface \`${surface}\` names a default by role without \`whole\`. A whole marking, and a marking with no role, are written in that view, and \`part\` falls back to it.`,
            );
        }
        const whole = value.whole !== undefined && holds('whole');
        if (value.part === undefined) {
            if (whole && passesOver('part', value.whole)) {
                report(
                    `${path}/default`,
                    `surface \`${surface}\` names no default for a part, so a part marking falls back to view \`${value.whole}\`, ${roleKind(roles.get(value.whole))}, although it has views of part markings: ${ofRole('part')}. Name \`part\`.`,
                );
            }
            return;
        }
        const part = holds('part');
        if (value.whole === undefined || value.part === value.whole) return;
        // A view kept for part markings reads back as a part, and the whole
        // view does not.
        if (part && roles.has(value.part) && roles.get(value.part) !== 'part') {
            const back =
                roles.get(value.part) === 'whole'
                    ? 'as a whole'
                    : 'with no role, as a whole is';
            report(
                `${path}/default/part`,
                `surface \`${surface}\` writes a part marking in view \`${value.part}\`, ${roleKind(roles.get(value.part))}, and a whole marking in \`${value.whole}\`. A part written in \`${value.part}\` would be read back ${back}, and written again in \`${value.whole}\`; a view a surface keeps for part markings is a view of part markings.`,
            );
        }
        if (whole && roles.get(value.whole) === 'part') {
            report(
                `${path}/default/whole`,
                `surface \`${surface}\` writes a whole marking in view \`${value.whole}\`, a view of part markings, and a part marking in \`${value.part}\`. A whole written in \`${value.whole}\` would be read back as a part, and written again in \`${value.part}\`; name a view for wholes that is not a view of part markings.`,
            );
        }
    }

    /**
     * A scheme that declares scopes names its default with `default_scope`, and
     * the scope it names is one of them.
     *
     * A marking that names no scope is in the default one, and a category that
     * names none belongs to it, so the default decides what a call that says
     * nothing about scope is judged against. The scheme gives it once, the way
     * a surface names its default view, and a flag on a scope is a removed key.
     * With no default named, nothing in the document says which scope a marking
     * that names none is in. A layer may leave the default to the stack below
     * it, or name a scope only that stack declares, so a layer is not asked;
     * the composed stack is.
     */
    checkDefaultScope() {
        if (this.scheme?.type === 'layer') return;
        const named = this.scheme?.default_scope;
        const declared = [...this.index.scopes]
            .map((id) => `\`${id}\``)
            .join(', ');
        if (named === undefined) {
            if (this.index.scopes.size === 0) return;
            this.report(
                PLAN_DIAGNOSTICS.UNRESOLVED_REFERENCE,
                '/scheme/default_scope',
                `the scheme declares scopes (${declared}) and names none of them as its default. A marking that names no scope is in the default one, so name it with \`default_scope\`.`,
            );
            return;
        }
        // Any other type is the schema's to refuse.
        if (typeof named !== 'string' || this.index.scopes.has(named)) return;
        this.report(
            PLAN_DIAGNOSTICS.UNRESOLVED_REFERENCE,
            '/scheme/default_scope',
            this.index.scopes.size === 0
                ? `\`default_scope\` names \`${named}\`, and the scheme declares no scopes. Declare it in \`scopes\`, or remove \`default_scope\`.`
                : `\`default_scope\` names \`${named}\`, which the scheme does not declare in \`scopes\`; it declares ${declared}.`,
        );
    }

    /**
     * The default scope has to be one of the surfaces `render.surfaces` lists.
     *
     * A result whose input says nothing about its surfaces writes the default
     * scope's surface, so a default scope with no outputs would leave that
     * result with nothing to be written in. A default scope that is missing, or
     * that the scheme does not declare, is refused on its own account and not
     * again here.
     */
    checkDefaultScopeListed(listed) {
        const named = this.scheme?.default_scope;
        if (
            typeof named !== 'string' ||
            !this.index.scopes.has(named) ||
            listed.has(named)
        ) {
            return;
        }
        const surfaces = [...listed].map((id) => `\`${id}\``).join(', ');
        const others = surfaces === '' ? '' : `; it lists ${surfaces}`;
        this.report(
            PLAN_DIAGNOSTICS.UNRESOLVED_REFERENCE,
            '/scheme/default_scope',
            `the default scope is \`${named}\`, and \`render.surfaces\` lists no outputs for it${others}. A result with nothing else to go on writes the default scope's surface, so it would have no output to be written in. List \`${named}\` in \`render.surfaces\`, or name a listed surface as \`default_scope\`.`,
        );
    }

    /**
     * A form a view is only read in reads a spelling two concepts share as both
     * of them or as neither, where the scheme's written forms read it as the
     * other.
     *
     * A read-only form is reading tolerance. It is never written, so no round
     * trip holds it to the facts the scheme's written forms give the same text.
     * When it reads a spelling as a concept of a category it binds, a form the
     * scheme writes reads that spelling as another concept, and the other
     * concept belongs to no category the read-only form binds, text that means
     * the other concept is read there as the first: a wrong fact, offered as
     * one more account of text that a written form reads right. A written form
     * is not asked this, because what it writes is read back. A spelling no
     * written form reads as the other concept is not text the scheme gives that
     * meaning, so it is not reported.
     *
     * A spelling is a concept's text in the view a field reads it in, falling
     * back to `default`, or one of its aliases, compared as the scheme compares
     * text. The other concept is spelled the same way in the view the read-only
     * form reads, and in the view of a written form's field that can write it.
     * A spelling that carries a value is a shape, not a spelling, and is left
     * out.
     *
     * Two clashes go unseen here. Only the scheme's inline concepts are
     * compared, so a concept a source feeds is never the other concept. And a
     * form that binds the other concept's category counts as reading it, even
     * where its field leaves that concept out with `exclude_concepts`.
     *
     * @param {{ formatId: string; at: string; address: string }[]} readOnly
     *   Each `also_read_in` entry that names a form of its view, with its path
     *   and the view's address.
     * @param {Set<string>} writtenForms Every format a view writes in.
     */
    checkReadOnlySpellings(readOnly, writtenForms) {
        if (readOnly.length === 0) return;
        const readInWriting = this.writtenReadings(writtenForms);
        const named = (ids) => ids.map((id) => `\`${id}\``).join(', ');
        for (const { formatId, at, address } of readOnly) {
            const bindings = this.bindingsOf.get(formatId) ?? [];
            const bound = new Set(bindings.map((binding) => binding.category));
            const reported = new Set();
            for (const { category, view, concepts } of bindings) {
                const spellers = this.spellersIn(view);
                for (const concept of concepts) {
                    for (const spelling of spellingsIn(concept, view)) {
                        const key = this.spellingKey(spelling);
                        const written = readInWriting.get(key);
                        const unbound = (spellers.get(key) ?? []).filter(
                            (other) =>
                                other.id !== concept.id &&
                                written?.has(other.id) === true &&
                                !(other.categories ?? []).some((id) =>
                                    bound.has(id),
                                ),
                        );
                        const finding = JSON.stringify([key, concept.id]);
                        if (unbound.length === 0 || reported.has(finding)) {
                            continue;
                        }
                        reported.add(finding);
                        const others = unbound.map(
                            (other) =>
                                `\`${other.id}\` in ${named(other.categories ?? [])}`,
                        );
                        const categories = [
                            ...new Set(
                                unbound.flatMap(
                                    (other) => other.categories ?? [],
                                ),
                            ),
                        ];
                        const meant = named(unbound.map((other) => other.id));
                        this.report(
                            PLAN_DIAGNOSTICS.READ_ONLY_FORM_SHARED_SPELLING,
                            at,
                            `format \`${formatId}\`, which \`${address}\` is only read in, reads ${JSON.stringify(spelling)} as \`${concept.id}\` in \`${category}\`, and ${unbound.length === 1 ? 'a form the scheme writes reads it' : 'the forms the scheme writes read it'} as ${others.join(' or ')}. The form binds no field to ${named(categories)}, so text that means ${meant} is read there as \`${concept.id}\`: a wrong fact, and a form that is only read is never written back to show it. Bind ${named(categories)} in this form as well, leave \`${concept.id}\` out of the field that reads it, or stop reading this form.`,
                        );
                    }
                }
            }
        }
    }

    /**
     * Spelling key -> the ids of the concepts the scheme's written forms read
     * that way: each concept a field of a written form can write, by its
     * spellings in that field's view.
     *
     * @param {Set<string>} writtenForms Every format a view writes in.
     */
    writtenReadings(writtenForms) {
        const readings = new Map();
        for (const formatId of writtenForms) {
            const bindings = this.bindingsOf.get(formatId) ?? [];
            for (const { view, concepts } of bindings) {
                for (const concept of concepts) {
                    for (const spelling of spellingsIn(concept, view)) {
                        const key = this.spellingKey(spelling);
                        if (!readings.has(key)) readings.set(key, new Set());
                        readings.get(key).add(concept.id);
                    }
                }
            }
        }
        return readings;
    }

    /**
     * Spelling key -> the concepts spelled that way in `view`, built once per
     * view.
     */
    spellersIn(view) {
        const held = this.spellersByView.get(view);
        if (held) return held;
        const spellers = new Map();
        for (const concept of this.index.concepts.values()) {
            for (const spelling of spellingsIn(concept, view)) {
                const key = this.spellingKey(spelling);
                if (!spellers.has(key)) spellers.set(key, []);
                const list = spellers.get(key);
                if (!list.includes(concept)) list.push(concept);
            }
        }
        this.spellersByView.set(view, spellers);
        return spellers;
    }

    /**
     * One spelling as the scheme compares text: trimmed, and in one case unless
     * the scheme says case carries meaning.
     */
    spellingKey(text) {
        const trimmed = text.trim();
        return this.scheme?.parse?.case_sensitive === true
            ? trimmed
            : trimmed.toUpperCase();
    }

    /**
     * `role_detection` lists formats only where views do not state roles.
     *
     * Beside `render.surfaces` each view states its own role and a role is read
     * in the forms of the views that state it, so a list of formats would be a
     * second answer to the same question. There a role keeps only
     * `required_when`. Without `render.surfaces` the lists are the only answer,
     * so the nested shape has to carry its `views`, except in a layer, which
     * may sit on a stack that declares surfaces, and each format a list names
     * is one `render.formats` declares. A role entry that lists no formats and
     * names no condition says nothing in any document. A condition is checked
     * against the named conditions this document declares. A layer's lists and
     * conditions may lean on the stack below, so neither is checked there.
     *
     * @param {boolean} surfaces Whether this document declares
     *   `render.surfaces`.
     * @param {boolean} layer Whether this document is a layer.
     */
    checkRoleDetection(surfaces, layer) {
        const report = (path, message) =>
            this.report(PLAN_DIAGNOSTICS.UNRESOLVED_REFERENCE, path, message);
        const formats = new Set(
            (this.scheme?.render?.formats ?? []).map((format) => format?.id),
        );
        // A list names formats this document declares; a layer's may name the
        // stack's, so a layer is never asked.
        const declaresFormats = (list, at) => {
            if (!Array.isArray(list)) return;
            list.forEach((id, k) => {
                if (formats.has(id)) return;
                report(
                    `${at}/${k}`,
                    `\`role_detection\` names format \`${id}\`, which \`render.formats\` does not declare.`,
                );
            });
        };
        for (const role of ROLES) {
            const declared = this.scheme?.role_detection?.[role];
            if (declared === undefined || declared === null) continue;
            const path = `/scheme/role_detection/${role}`;
            const lists = `\`role_detection.${role}\` lists formats beside \`render.surfaces\`, where each view states its own \`role\` and a role is read in the forms of the views that state it. Give those views their \`role\`, and keep only \`required_when\` here.`;
            if (Array.isArray(declared)) {
                if (surfaces) report(path, lists);
                else if (!layer) declaresFormats(declared, path);
                continue;
            }
            // Any other shape is the schema's to refuse.
            if (typeof declared !== 'object') continue;
            const views = declared.views !== undefined;
            const when = declared.required_when !== undefined;
            if (surfaces && views) {
                report(`${path}/views`, lists);
            } else if (!views && !when) {
                report(
                    path,
                    `\`role_detection.${role}\` says nothing: it lists no formats and names no \`required_when\`. Remove it.`,
                );
            } else if (!surfaces && !layer && !views) {
                report(
                    path,
                    `\`role_detection.${role}\` names no formats. Without \`render.surfaces\`, the formats a role is read in are listed here under \`views\`. List them, or declare \`render.surfaces\` and give each view its \`role\`.`,
                );
            } else if (!surfaces && !layer) {
                declaresFormats(declared.views, `${path}/views`);
            }
            if (when && !layer) {
                this.checkWhen(
                    declared.required_when,
                    `${path}/required_when`,
                    `a ${role} marking would never be required by it`,
                );
            }
        }
    }

    /**
     * The surfaces a format writes, or `undefined` when its declaration of them
     * is refused.
     *
     * A format names one surface in `surface` or several in `surfaces`, never
     * both and never neither. Several is a shape only `render.surfaces` gives a
     * meaning to: without it every format is an output under its own id, an
     * output writes one surface, and a format writing two would have no single
     * surface for its public description to name.
     */
    formatSurfaces(format, path) {
        const report = (at, message) =>
            this.report(PLAN_DIAGNOSTICS.UNRESOLVED_REFERENCE, at, message);
        const hasOne = format?.surface !== undefined;
        const hasMany = format?.surfaces !== undefined;
        if (hasOne === hasMany) {
            report(
                `${path}/surface`,
                `format \`${format?.id}\` has to name the surface it writes with exactly one of \`surface\` and \`surfaces\`.`,
            );
            return undefined;
        }
        if (hasMany && this.scheme?.render?.surfaces === undefined) {
            report(
                `${path}/surfaces`,
                `format \`${format?.id}\` writes several surfaces, which only a scheme that declares its outputs by surface can use. Without \`render.surfaces\` every format is an output under its own id, and an output writes one surface. Declare \`render.surfaces\`, or give this format one \`surface\`.`,
            );
            return undefined;
        }
        const surfaces = hasMany
            ? Array.isArray(format.surfaces)
                ? format.surfaces
                : []
            : [format.surface];
        if (
            hasMany &&
            (surfaces.length < 2 || new Set(surfaces).size !== surfaces.length)
        ) {
            report(
                `${path}/surfaces`,
                `format \`${format?.id}\` has to list two or more surfaces in \`surfaces\`, each once. A format that writes one surface names it in \`surface\`.`,
            );
            return undefined;
        }
        if (this.index.scopes.size > 0) {
            surfaces.forEach((surface, at) => {
                if (this.index.scopes.has(surface)) return;
                report(
                    hasMany ? `${path}/surfaces/${at}` : `${path}/surface`,
                    `format \`${format?.id}\` names surface \`${surface}\`, which the scheme does not declare in \`scopes\`.`,
                );
            });
        }
        return surfaces;
    }

    buildFormat(format, path) {
        const view = format?.view ?? 'default';
        const surfaces = this.formatSurfaces(format, path);

        const context = {
            // Undefined when the declaration was refused, so nothing that
            // checks a field against the format's surfaces reports again.
            surfaces,
            view,
            syntax: format?.syntax ?? { type: 'text' },
            mode: format?.mode ?? 'inline',
            formatId: format?.id,
            // Bindings claimed anywhere in this format, for the overlap check.
            claims: new Map(),
            // Each category field: its category, its view, the concepts it writes.
            bindings: [],
            // Attribute name -> the fields that write it.
            attributes: new Map(),
            // Opening spelling -> what claims it, for the alias collision check.
            opens: new Map(),
            // Separator spelling -> the paths that write it.
            separators: new Map(),
            // Separator spellings read and never written, with their fields.
            separatorAliases: [],
        };

        const root = this.buildSequence(
            format?.fields ?? [],
            {
                separator: format?.separator,
                separator_aliases: format?.separator_aliases,
                joins: format?.joins,
                prefix: format?.prefix,
                suffix: format?.suffix,
            },
            context,
            path,
            'format',
        );

        this.checkClaims(context, path);
        this.checkAttributes(context, path);
        this.checkPrefixAliases(context, path);
        this.checkSeparatorAliases(context, path);
        if (!this.bindingsOf.has(format?.id)) {
            this.bindingsOf.set(format?.id, context.bindings);
        }

        return {
            id: format?.id,
            // The engine compiles its formats from this plan and reads the
            // authored `surface` here. `surfaces` is the normalized set, one
            // entry for a format that names `surface` and empty when the
            // declaration was refused, which is what `checkSurfaceOutputs`
            // reads instead of both spellings.
            surface: format?.surface,
            surfaces: surfaces ?? [],
            mode: context.mode,
            syntax: context.syntax,
            root,
        };
    }

    /**
     * A sequence node: the format's top-level fields, or a group's children.
     *
     * The separator rule is the same at every level and is checked the same
     * way: once a sequence can put two nonempty things next to each other,
     * something has to say what goes between them. `joins` may say it per
     * boundary; the sequence's own separator says it for all of them. Neither,
     * and the document does not describe an output.
     *
     * A join is written only when both of the fields it sits between produced
     * something, exactly as a sequence separator is. That is the same rule
     * stated once for every boundary in the tree: a separator joins nonempty
     * results, so an absent field takes the boundary before it with it rather
     * than leaving a stray literal at the edge of the output.
     */
    buildSequence(fields, options, context, path, what) {
        const children = fields.map((field, index) =>
            this.buildField(field, context, `${path}/fields/${index}`, index),
        );

        const joins = new Map();
        for (const [index, join] of (options.joins ?? []).entries()) {
            const joinPath = `${path}/joins/${index}`;
            const [left, right] = join?.between ?? [];
            const leftAt = fields.findIndex((field, at) =>
                this.namesField(field, at, left),
            );
            const rightAt = fields.findIndex((field, at) =>
                this.namesField(field, at, right),
            );
            if (leftAt === -1 || rightAt === -1) {
                this.report(
                    PLAN_DIAGNOSTICS.NON_ADJACENT_JOIN,
                    joinPath,
                    `\`joins\` names \`${left}\` and \`${right}\`, and ${
                        leftAt === -1 ? `\`${left}\`` : `\`${right}\``
                    } is not a field of this ${what}.`,
                );
                continue;
            }
            if (rightAt !== leftAt + 1) {
                this.report(
                    PLAN_DIAGNOSTICS.NON_ADJACENT_JOIN,
                    joinPath,
                    `\`joins\` puts a separator between \`${left}\` and \`${right}\`, but they are at positions ${leftAt} and ${rightAt} and nothing sits between two fields that are not adjacent. Reorder the fields or group them.`,
                );
                continue;
            }
            joins.set(leftAt, join.separator);
            this.claimSeparator(context, join.separator, joinPath);
        }
        this.claimSeparator(context, options.separator, path);

        // Attribute syntax joins its own fields. There is no text between two
        // attributes of an element for an author to choose, so the separator
        // rule does not apply to a tree written as attributes.
        const separatorIsOwned = context.syntax?.type === 'xml-attributes';

        if (
            !separatorIsOwned &&
            fields.length > 1 &&
            options.separator === undefined
        ) {
            const uncovered = [];
            for (let at = 0; at < fields.length - 1; at += 1) {
                if (!joins.has(at)) uncovered.push(at);
            }
            if (uncovered.length > 0) {
                this.report(
                    PLAN_DIAGNOSTICS.INDETERMINATE_SEPARATOR,
                    path,
                    `this ${what} writes ${fields.length} fields and nothing says what goes between ${uncovered
                        .map(
                            (at) =>
                                `\`${fieldLabel(fields[at], at)}\` and \`${fieldLabel(
                                    fields[at + 1],
                                    at + 1,
                                )}\``,
                        )
                        .join(
                            ', ',
                        )}. Add \`separator\`, or a \`joins\` entry for each boundary.`,
                );
            }
        }

        // Which children this sequence is not a reading of without. The
        // indices sit on the sequence rather than a flag on each child,
        // because the rule is the sequence's: a required field says something
        // about the group that encloses it, and the child node itself is the
        // same node whether it is read here or somewhere it is optional.
        const required = new Set();
        for (const [at, field] of fields.entries()) {
            if (field?.required === true) required.add(at);
        }

        const node = {
            kind: 'sequence',
            children,
            separator: options.separator,
            ...this.separatorAliases(options, path, context),
            joins,
            required,
            path,
        };
        const wrapped = this.affix(node, options, path, context);
        let condition =
            children.length === 0
                ? everyState()
                : children.reduce(
                      (carried, child) =>
                          conjoin(
                              carried,
                              this.emptyOf.get(child) ?? everyState(),
                              this.impossible,
                          ),
                      everyState(),
                  );

        // A group that can come out empty is ordinary: the group is skipped and
        // its separator with it. A block format that comes out empty is
        // ordinary too, because a caller asks for a block by name.
        //
        // An INLINE format that can come out empty is not. Inline formats are
        // the ones scanned for and detected among, and one that matches the
        // empty string matches at every position of every input: detection has
        // nothing to choose between and scanning has nothing to reject.
        //
        // A conditional affix does not frame anything: a prefix written only
        // when some predicate holds is absent in the state where every field is
        // absent too, which is exactly the state in question. Only an
        // unconditional, nonempty part counts as a literal frame.
        //
        // `required` deliberately does not enter this condition. It adds empty
        // states rather than removing them, since a group whose required child
        // has nothing writes nothing at all, and the states it adds are ones
        // the run time can name exactly: it holds the state and knows which
        // field declined. Folding them in here would turn a group that
        // declines for a stated reason into a format this walker cannot prove
        // never writes the empty string, which says less and warns more.
        const framed = [
            ...(affixParts(options.prefix) ?? []),
            ...(affixParts(options.suffix) ?? []),
        ].some((part) => part?.when === undefined && part?.text);
        if (what === 'format' && framed) condition = NO_STATE;
        this.emptyOf.set(wrapped, condition);
        wrapped.canBeEmpty = condition.length > 0;
        return wrapped;
    }

    /**
     * Wrap a node in its prefix and suffix when it declares either.
     *
     * Both may be a string or an ordered list of conditional parts, so the
     * conditions inside a list are checked here for the same reason a field's
     * own `when` is: a predicate nothing declares is never true, and a part
     * behind one could never be written.
     */
    affix(node, source, path, context) {
        const prefix = affixParts(source?.prefix);
        const suffix = affixParts(source?.suffix);
        for (const [key, parts] of [
            ['prefix', prefix],
            ['suffix', suffix],
        ]) {
            for (const [at, part] of (parts ?? []).entries()) {
                if (part?.when !== undefined) {
                    this.checkWhen(part.when, `${path}/${key}/${at}`);
                }
            }
        }
        this.claimOpening(context, spellingOf(prefix), path, 'prefix');
        const aliases = this.prefixAliases(source, prefix, path, context);
        if (
            prefix === undefined &&
            suffix === undefined &&
            aliases === undefined
        ) {
            return node;
        }
        // An affix writes nothing when its child writes nothing, so it does not
        // frame an otherwise empty result and does not change the condition.
        const wrapped = {
            kind: 'affix',
            prefix,
            suffix,
            ...(aliases === undefined ? {} : { prefixAliases: aliases }),
            node,
            path,
        };
        const held = this.emptyOf.get(node);
        if (held !== undefined) this.emptyOf.set(wrapped, held);
        return wrapped;
    }

    /**
     * The spellings of a field's prefix that are read and never written.
     *
     * Read-only, so nothing about the emitted tree moves: the aliases ride on
     * the affix node for the tolerant pass to try and the renderer never looks
     * at them. What the walker owes them is the two questions an author can get
     * wrong. An alias with no prefix beside it is an alias of nothing, which is
     * the same defect `attribute` without an attribute syntax is. And one
     * spelling that opens two fields of a format is not a reading the format
     * can settle, whether the second field spells it as its prefix or as
     * another alias. Declaration order does not settle it.
     *
     * @returns The declared spellings, or `undefined` when there are none.
     */
    prefixAliases(source, prefix, path, context) {
        const declared = source?.prefix_aliases;
        if (declared === undefined) return undefined;
        const spellings = [...declared].filter(
            (one) => typeof one === 'string' && one.length > 0,
        );
        if (spellings.length === 0) return undefined;
        if (prefix === undefined) {
            this.report(
                PLAN_DIAGNOSTICS.UNRESOLVED_REFERENCE,
                `${path}/prefix_aliases`,
                "`prefix_aliases` names other spellings of this field's `prefix`, and this field has no `prefix` for them to be spellings of.",
            );
            return undefined;
        }
        for (const spelling of spellings) {
            this.claimOpening(context, spelling, path, 'alias');
        }
        return spellings;
    }

    /**
     * Record that something opens a field of this format at this spelling.
     *
     * A conditional prefix has no one spelling (which parts it writes depends
     * on the state), so only the unconditional ones are claimed. Claiming a
     * spelling a field might not write would report a collision with a line
     * that is never there.
     */
    claimOpening(context, spelling, path, as) {
        if (context === undefined || spelling === undefined) return;
        const held = context.opens.get(spelling) ?? [];
        held.push({ path, as });
        context.opens.set(spelling, held);
    }

    /**
     * One spelling that opens two fields of a format, where an alias is one of
     * them.
     *
     * Two fields that declare the same `prefix` are left alone here. That shape
     * is decided by the predicates on the fields and by what each of them
     * binds. An alias is different: it is read and never written, so it has no
     * state of its own to be told apart by, and a spelling that reaches two
     * fields through one is a reading the format cannot settle.
     */
    checkPrefixAliases(context, formatPath) {
        for (const [spelling, claimants] of context.opens) {
            if (claimants.length < 2) continue;
            if (!claimants.some((one) => one.as === 'alias')) continue;
            const paths = claimants.map((one) => `${one.path} (${one.as})`);
            this.report(
                PLAN_DIAGNOSTICS.PREFIX_ALIAS_COLLISION,
                formatPath,
                `\`${spelling}\` opens more than one field of this format: ${paths.join(', ')}. A line that opens two fields is not a reading this format can settle, and nothing here is settled by declaration order.`,
            );
        }
    }

    /**
     * The spellings of a separator that are read and never written.
     *
     * The same shape as `prefixAliases` one level down, and read-only for the
     * same reason: the spellings ride on the node for the tolerant pass and
     * nothing on the emit path looks at them. A spelling equal to the separator
     * this node already writes is dropped rather than reported, because it
     * names the boundary the node writes anyway and a reading that used it read
     * the input as written.
     *
     * @returns `{ separatorAliases }` when there are any, `{}` otherwise, so a
     *   node that declares none is the object it was before the word existed.
     */
    separatorAliases(source, path, context) {
        const declared = source?.separator_aliases;
        if (declared === undefined) return {};
        const separator = source?.separator;
        const spellings = [
            ...new Set(
                [...declared].filter(
                    (one) =>
                        typeof one === 'string' &&
                        one.length > 0 &&
                        one !== separator,
                ),
            ),
        ];
        if (spellings.length === 0) return {};
        if (separator === undefined) {
            this.report(
                PLAN_DIAGNOSTICS.UNRESOLVED_REFERENCE,
                `${path}/separator_aliases`,
                "`separator_aliases` names other spellings of this field's `separator`, and this field has no `separator` for them to be spellings of.",
            );
            return {};
        }
        for (const spelling of spellings) {
            context?.separatorAliases.push({ spelling, path });
        }
        return { separatorAliases: spellings };
    }

    /** Record that something writes this boundary at this spelling. */
    claimSeparator(context, spelling, path) {
        if (context === undefined || typeof spelling !== 'string') return;
        if (spelling.length === 0) return;
        const held = context.separators.get(spelling) ?? [];
        held.push(path);
        context.separators.set(spelling, held);
    }

    /**
     * A boundary one field reads that another field of the format writes.
     *
     * An alias is read and never written, so the characters it names carry no
     * state of their own and nothing about them says which field they belong
     * to. Where those same characters are a boundary another field writes, or
     * the opening of a field, one run of text is two things at once and the
     * format has no way to settle which: the same reason two fields may not
     * share an opening, said about the other half of a field's syntax.
     *
     * A field's own separator is not a claimant against itself:
     * `separatorAliases` drops that spelling before it gets here, and a
     * boundary a field both writes and reads is the ordinary case rather than a
     * collision.
     */
    checkSeparatorAliases(context, formatPath) {
        for (const { spelling, path } of context.separatorAliases) {
            const written = (context.separators.get(spelling) ?? []).filter(
                (one) => one !== path,
            );
            const opens = (context.opens.get(spelling) ?? []).map(
                (one) => `${one.path} (${one.as})`,
            );
            const claimants = [
                ...written.map((one) => `${one} (separator)`),
                ...opens,
            ];
            if (claimants.length === 0) continue;
            this.report(
                PLAN_DIAGNOSTICS.SEPARATOR_ALIAS_COLLISION,
                formatPath,
                `\`${path}\` reads \`${spelling}\` as a separator it does not write, and this format already writes those characters: ${claimants.join(', ')}. One run of text cannot be both, and nothing here is settled by declaration order.`,
            );
        }
    }

    namesField(field, index, name) {
        if (name === undefined) return false;
        return (
            field?.name === name ||
            field?.category === name ||
            field?.concept === name ||
            field?.attribute === name ||
            String(index) === String(name)
        );
    }

    buildField(field, context, path, index) {
        const kind = fieldKind(field);
        const view = field?.view ?? context.view;

        if (field?.when !== undefined) this.checkWhen(field.when, path);

        if (field?.attribute !== undefined) {
            if (context.syntax?.type !== 'xml-attributes') {
                this.report(
                    PLAN_DIAGNOSTICS.UNRESOLVED_REFERENCE,
                    `${path}/attribute`,
                    `\`attribute\` is only meaningful under \`syntax: {type: xml-attributes}\`; this format's syntax is \`${context.syntax?.type ?? 'text'}\`.`,
                );
            }
            if (!context.attributes.has(field.attribute)) {
                context.attributes.set(field.attribute, []);
            }
            context.attributes.get(field.attribute).push({ field, path });
        }

        let node;
        if (kind === 'fixed') {
            node = this.buildFixedAttribute(field, path, context);
        } else if (kind === 'category') {
            node = this.buildBinding(field, view, context, path);
        } else if (kind === 'group') {
            node = this.buildSequence(
                field.fields ?? [],
                {
                    separator: field.separator,
                    separator_aliases: field.separator_aliases,
                    joins: field.joins,
                    prefix: field.prefix,
                    suffix: field.suffix,
                },
                { ...context, view },
                path,
                'group',
            );
            if (field.name === undefined) {
                this.report(
                    PLAN_DIAGNOSTICS.UNRESOLVED_REFERENCE,
                    path,
                    'a group needs a `name`, because a `joins` entry and a diagnostic both have to be able to say which field they mean.',
                );
            }
        } else if (kind === 'alternatives') {
            node = this.buildAlternatives(field, view, context, path);
        } else {
            this.report(
                PLAN_DIAGNOSTICS.UNRESOLVED_REFERENCE,
                path,
                `field ${index} has no binding: give it exactly one of \`category\`, \`fields\`, \`alternatives\`, or \`attribute\` with \`value\`.`,
            );
            node = {
                kind: 'sequence',
                children: [],
                joins: new Map(),
                required: new Set(),
                path,
            };
            this.emptyOf.set(node, everyState());
            node.canBeEmpty = true;
        }

        if (field?.when !== undefined) {
            const inner = this.emptyOf.get(node) ?? everyState();
            const conditional = {
                kind: 'conditional',
                when: field.when,
                node,
                path,
            };
            // Written when the predicate holds, so empty either where it fails
            // or where it holds and the child is empty anyway. Keeping the
            // second term guarded rather than folding it in is what lets two
            // branches behind a predicate and its negation cancel.
            const holds = this.whenHolds(field.when, path);
            const fails = this.whenFails(field.when, path);
            const condition = disjoin(
                fails,
                conjoin(holds, inner, this.impossible),
                this.impossible,
            );
            this.emptyOf.set(conditional, condition);
            this.guardOf.set(conditional, field.when);
            this.innerEmptyOf.set(conditional, inner);
            conditional.canBeEmpty = condition.length > 0;
            node = conditional;
        }
        return node;
    }

    /**
     * An attribute with a fixed value, written when a predicate holds.
     *
     * Every other field carries a fact out of the state and back in. This one
     * carries no fact at all: it writes the text the document names, and it is
     * read back as a check that the same predicate holds. That is the whole of
     * it, and it is deliberately the whole of it, because an attribute whose
     * value is fixed by the format is a statement about the representation
     * rather than about the marking. Binding a concept to it would make the
     * representation assert something, and then two representations of one
     * state would hold different facts.
     *
     * It needs the predicate. Without one there is nothing to read back: the
     * attribute would be a constant the format always writes and the read side
     * could learn nothing from finding it, which is a syntax element rather
     * than a field.
     */
    buildFixedAttribute(field, path, context) {
        // `buildField` has already checked that this format is written as
        // attributes and recorded the name for the duplicate-attribute check.
        if (typeof field.value !== 'string') {
            this.report(
                PLAN_DIAGNOSTICS.UNRESOLVED_REFERENCE,
                `${path}/value`,
                `a fixed attribute writes one literal, so \`value\` has to be a string.`,
            );
        }
        if (field.when === undefined) {
            this.report(
                PLAN_DIAGNOSTICS.UNRESOLVED_CONDITION,
                path,
                `\`${field.attribute}\` is written with a fixed value and no \`when\`, so it would be written for every state and say nothing about any of them. Give it the predicate it stands for, or make it part of the format's syntax.`,
            );
        }
        // A fixed attribute binds no category, so nothing else says which
        // surface's output it belongs to once the format writes several. A
        // format whose surface declaration was refused has no surfaces to
        // check against, and that refusal already stands.
        const surfaces = context.surfaces;
        const named = field.output_surfaces;
        if (surfaces !== undefined && named === undefined) {
            if (surfaces.length > 1) {
                this.report(
                    PLAN_DIAGNOSTICS.UNRESOLVED_REFERENCE,
                    `${path}/output_surfaces`,
                    `\`${field.attribute}\` is a fixed attribute of a format that writes ${surfaces.length} surfaces, and it binds no category to say which of them it belongs to. Name them in \`output_surfaces\`.`,
                );
            }
        } else if (
            surfaces !== undefined &&
            !namesSurfacesOnce(named, surfaces)
        ) {
            this.report(
                PLAN_DIAGNOSTICS.UNRESOLVED_REFERENCE,
                `${path}/output_surfaces`,
                `\`output_surfaces\` on \`${field.attribute}\` has to name one or more of the surfaces this format writes, each once: ${surfaces.join(', ')}.`,
            );
        }
        const node = {
            kind: 'fixed',
            // The engine decides which output writes this attribute from the
            // node alone, so the default for an omitted list is settled here,
            // where omission is defined, rather than re-derived there.
            outputSurfaces: named ?? surfaces ?? [],
            attribute: field.attribute,
            value: typeof field.value === 'string' ? field.value : '',
            path,
        };
        // Present or absent, this node writes something exactly when its
        // predicate holds, and `buildField` wraps it in that predicate. On its
        // own it is a literal, and a literal is never empty.
        this.emptyOf.set(node, node.value.length > 0 ? NO_STATE : everyState());
        node.canBeEmpty = node.value.length === 0;
        return node;
    }

    /**
     * Alternatives are representations of one field, and exactly one is active
     * for any state. Two of them writing the same concept is therefore not the
     * overlap the format-wide check is looking for: it is the same fact written
     * two ways, which is the whole point of the shape. So each option claims
     * into its own map, and the union of what the options claimed is folded
     * back into the format once. A concept claimed inside an alternative still
     * conflicts with one claimed by a field outside it, because those two can
     * both be active.
     */
    buildAlternatives(field, view, context, path) {
        const branches = [];
        const options = (field.alternatives ?? []).map((option, at) => {
            const branch = { ...context, view, claims: new Map() };
            const built = this.buildField(
                option,
                branch,
                `${path}/alternatives/${at}`,
                at,
            );
            branches.push(branch.claims);
            return built;
        });
        // Each branch is checked on its own first: two fields inside ONE
        // alternative are both active together, so that is an ordinary overlap
        // and the branch map is the only place it is visible.
        for (const claims of branches) {
            this.checkClaims({ claims }, path);
        }
        // Then the whole field contributes ONE claim per concept to the format,
        // however many branches write it, because at most one branch is active.
        // Appended rather than skipped: short-circuiting on a key the format had
        // already seen made a conflict with a field outside the alternatives
        // depend on whether that field happened to be walked first.
        const contributed = new Map();
        for (const claims of branches) {
            for (const [key, claimants] of claims) {
                if (!contributed.has(key)) contributed.set(key, claimants[0]);
            }
        }
        for (const [key, claimant] of contributed) {
            context.claims.set(key, [
                ...(context.claims.get(key) ?? []),
                claimant,
            ]);
        }
        this.checkReservedLiteralCollision(field, view, path);
        const node = { kind: 'alternatives', options, path };
        const condition = this.alternativesEmptiness(options, path);
        this.emptyOf.set(node, condition);
        node.canBeEmpty = condition.length > 0;
        // The field's own prefix and suffix frame whichever option is active.
        // They belong to the field, not to the options: `Declassify On: ` is
        // written once whether the line carries an instruction or a code.
        const wrapped = this.affix(node, field, path, context);
        this.emptyOf.set(wrapped, condition);
        wrapped.canBeEmpty = node.canBeEmpty;
        return wrapped;
    }

    /**
     * When an alternation writes nothing.
     *
     * Exactly one option is active, so the alternation is empty when the active
     * one is empty, or when no option is active at all. Those are two different
     * things: an option behind a predicate can be unselected without being
     * empty when selected.
     *
     * Separating them is what makes a swapped field order expressible. Two
     * options behind a predicate and its negation cover every state between
     * them, so there is no state with no option, and each option's own content
     * is a required category, so there is no state with an empty one. The
     * alternation writes something in every state, and the format around it is
     * framed by whichever order applies.
     */
    alternativesEmptiness(options, path) {
        if (options.length === 0) return everyState();
        // No option active. An unguarded option contributes a gap of nothing,
        // which closes it; two complementary guards close it between them.
        let gap = everyState();
        let active = NO_STATE;
        for (const [at, option] of options.entries()) {
            const optionPath = `${path}/alternatives/${at}`;
            const guard = this.guardOf.get(option);
            const inner =
                guard === undefined
                    ? (this.emptyOf.get(option) ?? everyState())
                    : (this.innerEmptyOf.get(option) ?? everyState());
            const holds =
                guard === undefined
                    ? everyState()
                    : this.whenHolds(guard, optionPath);
            const fails =
                guard === undefined
                    ? NO_STATE
                    : this.whenFails(guard, optionPath);
            active = disjoin(
                active,
                conjoin(holds, inner, this.impossible),
                this.impossible,
            );
            gap = conjoin(gap, fails, this.impossible);
        }
        return disjoin(active, gap, this.impossible);
    }

    /**
     * A category binding. This is where the separator rule bites hardest: a
     * category with several eligible concepts writes several values, and an
     * outer separator is a different boundary, so it cannot stand in.
     */
    buildBinding(field, view, context, path) {
        const categoryId = this.categoryOf(field, path);
        const category = this.index.categories.get(categoryId);
        if (categoryId !== undefined && !category) {
            this.report(
                PLAN_DIAGNOSTICS.UNRESOLVED_REFERENCE,
                `${path}/category`,
                `no category \`${categoryId}\` in this scheme.`,
            );
        }
        // Everything below reads the resolved category, including the overlap
        // and exclusivity checks, so a field that omitted it is indistinguishable
        // from one that wrote it out.
        field = { ...field, category: categoryId };

        const eligible = this.eligibleConcepts(field, path);
        if (field.unspelled !== undefined && field.view_only !== true) {
            this.report(
                PLAN_DIAGNOSTICS.UNSPELLED_WITHOUT_VIEW_ONLY,
                `${path}/unspelled`,
                `\`unspelled\` names concepts this field's view leaves out, and only a \`view_only\` field leaves a concept out for want of a spelling. Set \`view_only: true\` or remove \`unspelled\`.`,
            );
        }
        this.claim(field, eligible, context, path);
        context.bindings.push({
            category: categoryId,
            view,
            concepts: eligible,
        });
        this.checkPlaceholders(eligible, view, path);
        this.checkTiers(field, eligible, view, path);
        this.checkFraming(field, eligible, context, path);
        this.checkBindingCollision(eligible, view, path);
        this.checkSeparatorCollision(field, eligible, view, path);

        const multiValued =
            field.concept === undefined &&
            category !== undefined &&
            category.single !== true &&
            eligible.length > 1;
        if (multiValued && field.separator === undefined) {
            this.report(
                PLAN_DIAGNOSTICS.INDETERMINATE_SEPARATOR,
                path,
                `\`${categoryId}\` can hold ${eligible.length} concepts at once and nothing says what goes between two of them. Add \`separator\` to this field, or mark the category \`single: true\`.`,
            );
        }

        const phrases = this.buildPhrases(field, eligible, view, context, path);
        this.claimSeparator(context, field.separator, path);

        const node = {
            kind: 'binding',
            category: categoryId,
            concept: field.concept,
            exclude: new Set(field.exclude_concepts ?? []),
            view,
            separator: field.separator,
            ...this.separatorAliases(field, path, context),
            each: field.each,
            tiers: field.tiers,
            ...(phrases.length > 0 ? { phrases } : {}),
            // Under xml-attributes syntax the attribute name is part of what
            // this field binds: it is the name the value is written under and
            // read back from. Carried here so a runtime emits and recognizes
            // from the plan, rather than resolving `path` back into the
            // document to find out.
            attribute: field.attribute,
            path,
        };
        // A category the scheme requires always holds something, so a field
        // that writes it is empty in no state. Any other category can be
        // absent whatever the state, which is an unconditional emptiness and
        // the one the original check was written for.
        const condition = category?.required === true ? NO_STATE : everyState();
        this.emptyOf.set(node, condition);
        const wrapped = this.affix(node, field, path, context);
        this.emptyOf.set(wrapped, condition);
        wrapped.canBeEmpty = condition.length > 0;
        return wrapped;
    }

    /**
     * The phrases a category field writes, checked against the field itself.
     *
     * A phrase is a value of this field, so its head has to be one of the
     * concepts this field writes. Three ways it can fail to be, and they are
     * different mistakes with different fixes: the head names nothing in the
     * scheme at all; it names a concept this field does not write, because it
     * belongs to another category or this field excluded it; or two phrases of
     * one field name the same head, which is one position with two things
     * written at it and is settled by nothing. Each is refused by name rather
     * than folded into a single "bad phrase", because an author who wrote the
     * wrong category needs to be told something different from one who wrote
     * the same head twice.
     *
     * The head is not excluded from the field's eligible concepts here. It is
     * still a concept this field writes; what the phrase says is where and with
     * what, and the run time writes it at the head's own position either way.
     * `claim` therefore sees it once, from this field, which is what it is.
     */
    buildPhrases(field, eligible, view, context, path) {
        const declared = field?.phrases ?? [];
        if (declared.length === 0) return [];
        const writes = new Set(eligible.map((concept) => concept.id));
        const seen = new Set();
        const built = [];
        for (const [at, phrase] of declared.entries()) {
            const phrasePath = `${path}/phrases/${at}`;
            const head = phrase?.head;
            if (!this.index.concepts.has(head)) {
                this.report(
                    PLAN_DIAGNOSTICS.UNRESOLVED_REFERENCE,
                    `${phrasePath}/head`,
                    `no concept \`${head}\` in this scheme, so nothing heads this phrase.`,
                );
            } else if (!writes.has(head)) {
                this.report(
                    PLAN_DIAGNOSTICS.PHRASE_HEAD_NOT_BOUND,
                    `${phrasePath}/head`,
                    `\`${head}\` is not a concept this field writes, so this field has no position to write the phrase at. A phrase is written where its head sits in \`${field.category}\`'s own order, which means the head has to belong to \`${field.category}\` and not be excluded from this field.`,
                );
            } else if (seen.has(head)) {
                this.report(
                    PLAN_DIAGNOSTICS.OVERLAPPING_PHRASES,
                    `${phrasePath}/head`,
                    `\`${head}\` already heads a phrase on this field. One concept has one position, and two phrases written at it would be settled by declaration order, which decides nothing here.`,
                );
            } else {
                seen.add(head);
            }
            const node = this.buildSequence(
                phrase?.fields ?? [],
                {
                    separator: phrase?.separator,
                },
                { ...context, view },
                phrasePath,
                'phrase',
            );
            // The affixes frame the phrase, head included, so they are carried
            // on the phrase rather than wrapped around the fields. Wrapping
            // the fields would put a prefix between the head and its list,
            // which is what `separator` is for and is not what `prefix` says.
            const prefix = affixParts(phrase?.prefix);
            const suffix = affixParts(phrase?.suffix);
            for (const [key, parts] of [
                ['prefix', prefix],
                ['suffix', suffix],
            ]) {
                for (const [part, at] of (parts ?? []).map((one, index) => [
                    one,
                    index,
                ])) {
                    if (part?.when !== undefined) {
                        this.checkWhen(part.when, `${phrasePath}/${key}/${at}`);
                    }
                }
            }
            built.push({
                head,
                node,
                separator: phrase?.separator,
                headLast: phrase?.head_position === 'last',
                ...(prefix === undefined ? {} : { prefix }),
                ...(suffix === undefined ? {} : { suffix }),
                path: phrasePath,
            });
        }
        return built;
    }

    /**
     * The category a field writes.
     *
     * Usually the field says so. A field narrowed to one concept need not, when
     * that concept belongs to exactly one category: there is then only one
     * answer, and making the author write it out puts two facts in the document
     * where one determines the other. A concept in several categories is a real
     * choice and the field has to make it.
     */
    categoryOf(field, path) {
        if (typeof field?.category === 'string') return field.category;
        const concept = this.index.concepts.get(field?.concept);
        if (!concept) return field?.category;
        const categories = concept.categories ?? [];
        if (categories.length === 1) return categories[0];
        this.report(
            PLAN_DIAGNOSTICS.UNRESOLVED_REFERENCE,
            `${path}/concept`,
            categories.length === 0
                ? `this field writes \`${concept.id}\`, which belongs to no category, so there is nothing for the field to bind. Give the concept a category.`
                : `this field writes \`${concept.id}\`, which belongs to ${categories.length} categories (${categories.join(', ')}), so \`category\` has to say which one this field binds.`,
        );
        return field?.category;
    }

    eligibleConcepts(field, path) {
        const all = this.index.byCategory.get(field.category) ?? [];
        if (field.concept !== undefined) {
            const one = this.index.concepts.get(field.concept);
            if (!one) {
                this.report(
                    PLAN_DIAGNOSTICS.UNRESOLVED_REFERENCE,
                    `${path}/concept`,
                    `no concept \`${field.concept}\` in this scheme.`,
                );
                return [];
            }
            if (
                this.index.categories.has(field.category) &&
                !(one.categories ?? []).includes(field.category)
            ) {
                this.report(
                    PLAN_DIAGNOSTICS.UNRESOLVED_REFERENCE,
                    `${path}/concept`,
                    `concept \`${field.concept}\` does not belong to category \`${field.category}\`, so this field cannot bind it. Choose a category the concept declares or another concept in \`${field.category}\`.`,
                );
                return [];
            }
            return [one];
        }
        const excluded = new Set(field.exclude_concepts ?? []);
        for (const id of excluded) {
            if (!this.index.concepts.has(id)) {
                this.report(
                    PLAN_DIAGNOSTICS.UNRESOLVED_REFERENCE,
                    `${path}/exclude_concepts`,
                    `\`exclude_concepts\` names \`${id}\`, which is not a concept of this scheme.`,
                );
            }
        }
        return all.filter((concept) => !excluded.has(concept.id));
    }

    /**
     * Record what this field claims so the format can be checked for two fields
     * writing the same concept. Selection is what makes a second field legal:
     * naming one concept, or excluding the ones a group already took.
     */
    claim(field, eligible, context, path) {
        for (const concept of eligible) {
            // Both ids may contain ::. Serialize the ordered pair so distinct
            // (category, concept) claims cannot collapse into one map entry.
            const key = JSON.stringify([field.category, concept.id]);
            if (!context.claims.has(key)) context.claims.set(key, []);
            context.claims.get(key).push({ field, path });
        }
    }

    checkClaims(context, formatPath) {
        for (const [key, claimants] of context.claims) {
            if (claimants.length < 2) continue;
            const [category, concept] = JSON.parse(key);
            const where = claimants.map((claim) => claim.path).join(', ');
            this.report(
                PLAN_DIAGNOSTICS.OVERLAPPING_BINDINGS,
                formatPath,
                `${claimants.length} fields write \`${concept}\` from \`${category}\` (${where}), so the same fact would be written more than once and a reader has more than one place to put it. Narrow one with \`concept\`, or exclude the concept from the others with \`exclude_concepts\`.`,
            );
        }
    }

    /**
     * Two fields may share an attribute name only when one of them is always
     * off whenever the other is on. An element cannot carry the same attribute
     * twice, so this is not a style question.
     *
     * A field is active when the thing it writes is present, which gives two
     * sources of proof. An explicit `when` is one. The other is the field's own
     * `concept:` narrowing: a field that writes exactly one concept is active
     * exactly when that concept is asserted.
     *
     * What turns two activation concepts into a proof is a category that holds
     * one of them at a time. Two limits on that, both learned the hard way:
     *
     * - The category has to be the one the field itself writes. A concept belongs
     *   to as many categories as its author put it in, and an unrelated
     *   single-valued membership says nothing about the reading this format
     *   produces. Proving from the concept's whole membership set let two
     *   fields binding a union-valued category compile clean because their
     *   concepts happened to share a category this format never writes.
     * - Neither concept may be an ancestor of the other. `single: true` is a
     *   validity constraint on a marking, not a statement that two values can
     *   never be present: implication closure asserts a parent alongside its
     *   child, and the pair then makes the category invalid rather than
     *   impossible. The proof runs after that closure, so an ancestor pair is
     *   refused rather than silently accepted.
     *
     * The consequence of both is the same and is deliberate: exclusivity is
     * proved only for readings this format could itself write from a valid
     * state. Where nothing settles it the pair is reported, and the design's
     * answer is that exclusivity is then enforced at run time.
     */
    checkAttributes(context, formatPath) {
        for (const [name, writers] of context.attributes) {
            // Writers that are options of one `alternatives` are one writer.
            // The alternation says exactly one of them is active, which is the
            // thing the proof below is trying to establish, so there is nothing
            // left to prove: an element carrying the attribute once is what the
            // field already guarantees.
            const distinct = [];
            const alternations = new Set();
            for (const writer of writers) {
                const at = writer.path.lastIndexOf('/alternatives/');
                if (at < 0) {
                    distinct.push(writer);
                    continue;
                }
                const alternation = writer.path.slice(0, at);
                if (alternations.has(alternation)) continue;
                alternations.add(alternation);
                distinct.push(writer);
            }
            if (distinct.length < 2) continue;
            if (this.provablyExclusive(distinct)) continue;
            this.report(
                PLAN_DIAGNOSTICS.DUPLICATE_ATTRIBUTE,
                formatPath,
                `${distinct.length} fields write the attribute \`${name}\` and nothing here proves at most one of them is ever active. An element cannot carry the same attribute twice. Give them \`when\` predicates that exclude each other, or write one field.`,
            );
        }
    }

    /** Every ancestor of a concept, following the whole parent graph. */
    ancestorsOf(id) {
        const seen = new Set();
        const walk = (current) => {
            for (const parent of this.index.concepts.get(current)?.parents ??
                []) {
                if (seen.has(parent)) continue;
                seen.add(parent);
                walk(parent);
            }
        };
        walk(id);
        return seen;
    }

    provablyExclusive(writers) {
        const keys = writers.map((writer) => {
            const explicit =
                writer.field?.when === undefined
                    ? {}
                    : conditionKey(writer.field.when);
            if (explicit.assertionOf || explicit.negationOf) {
                // The predicate names a concept this field need not bind, so no
                // bound category constrains where the proof may come from.
                return { ...explicit, boundCategory: undefined };
            }
            // A field that writes exactly one concept is active exactly when
            // that concept is asserted, in the category this field writes.
            if (typeof writer.field?.concept === 'string') {
                return {
                    assertionOf: writer.field.concept,
                    boundCategory: writer.field.category,
                };
            }
            return {};
        });
        if (keys.some((key) => !key.assertionOf && !key.negationOf)) {
            return false;
        }

        // Two writers, one asserting a concept and one denying the same one.
        if (writers.length === 2) {
            const [a, b] = keys;
            if (a.negationOf && a.negationOf === b.assertionOf) return true;
            if (b.negationOf && b.negationOf === a.assertionOf) return true;
        }

        const asserted = keys.map((key) => key.assertionOf);
        if (
            !asserted.every(Boolean) ||
            new Set(asserted).size !== asserted.length
        ) {
            return false;
        }

        // Implication closure first. `single: true` says a marking holding two
        // values is invalid, not that two can never be present, and closure
        // puts two there with no malformed input involved. Two ways that
        // happens, and both defeat the proof:
        //
        // - one activation concept is an ancestor of another, so asserting the
        //   narrow one closes to the broad one;
        // - some third concept implies both, so asserting IT closes to both.
        //
        // The predicate is "nothing in this scheme implies more than one of
        // them", which covers the ancestor case as well: a concept implies
        // itself.
        for (const concept of this.index.concepts.values()) {
            const implied = new Set([
                concept.id,
                ...this.ancestorsOf(concept.id),
            ]);
            if (asserted.filter((id) => implied.has(id)).length > 1) {
                return false;
            }
        }

        // A category that holds one concept at a time, and in which every one
        // of these fields is active only on an assertion made there.
        //
        // An assertion is a concept IN a category, and a single-valued category
        // bounds how many assertions it holds, not how many times its concepts
        // appear across the scheme. So the proving category has to be the one
        // each writer actually keys off:
        //
        // - A writer narrowed by `concept:` fires on an assertion in the
        //   category it binds, so that category has to be the proving one.
        // - A writer behind a `when` predicate fires on the concept being
        //   asserted anywhere, so the proving category has to be the concept's
        //   only category. Otherwise it could be asserted in a second category
        //   while the other writer's concept sits in the proving one, and both
        //   fields fire.
        const memberships = asserted.map(
            (id) => this.index.concepts.get(id)?.categories ?? [],
        );
        const shared = memberships[0].filter((categoryId) =>
            memberships.every((list) => list.includes(categoryId)),
        );
        return shared.some((categoryId) => {
            if (this.index.categories.get(categoryId)?.single !== true) {
                return false;
            }
            return keys.every((key, at) =>
                key.boundCategory === undefined
                    ? memberships[at].length === 1
                    : key.boundCategory === categoryId,
            );
        });
    }

    /**
     * A tier entry says how a composed token is written and in which view each
     * of its two halves is. A view no concept declares leaves that half of the
     * composed token with nothing to print, so the walker reports it rather
     * than leaving a silent gap.
     */
    checkTiers(field, eligible, fieldView, path) {
        const tiers = (field.tiers ?? []).map((tier) => ({
            tier: tier?.tier,
            view: tier?.view,
            headView: tier?.head_view,
        }));
        const relation = resolveTierHeadRelation({
            concepts: eligible,
            tiers,
            fieldView,
            path,
        });
        for (const diagnostic of relation.diagnostics) {
            this.report(
                diagnostic.id,
                diagnostic.path,
                diagnostic.message,
                diagnostic.severity,
            );
        }
        const eligibleById = new Map(
            eligible.map((concept) => [concept.id, concept]),
        );
        for (const [at, tier] of (field.tiers ?? []).entries()) {
            const tierPath = `${path}/tiers/${at}`;
            const members = eligible.filter(
                (concept) => concept.tier === tier?.tier,
            );
            if (members.length === 0) {
                // A rule with nothing to apply to is not the same defect as a
                // rule that cannot print what it applies to. A base document
                // legitimately says how a category composes before the layer
                // that populates that tier arrives, and refusing it there
                // would make a scheme uncompilable on its own for describing
                // its own extension point. What it cannot do is go
                // unexamined: composition produces one authored document, that
                // document is what compiles, and the concepts the layer
                // brought are checked there by the rule below.
                this.report(
                    PLAN_DIAGNOSTICS.UNBOUND_TIER_VIEW,
                    tierPath,
                    `no concept this field writes carries \`tier: ${tier?.tier}\`, so the composition rule applies to nothing here. A layer composed onto this document may bring concepts in that tier, and the rule is checked again against the composed document; if nothing ever carries the tier, this entry is dead and can be removed.`,
                    'warning',
                );
                continue;
            }
            const heads = new Map();
            const hasAmbiguousHead = members.some((member) =>
                relation.ambiguousConcepts.has(member.id),
            );
            for (const member of members) {
                const headId = relation.headByConcept.get(member.id);
                const head =
                    headId === undefined ? undefined : eligibleById.get(headId);
                if (!head) continue;
                heads.set(head.id, head);
            }
            const wanted = tier?.view ?? fieldView;
            const declares = members.some((concept) => {
                const views = viewsOf(concept);
                return views === null || views.has(wanted);
            });
            if (!declares) {
                this.report(
                    PLAN_DIAGNOSTICS.UNBOUND_TIER_VIEW,
                    tierPath,
                    `the composed token for tier \`${tier?.tier}\` is written in view \`${wanted}\`, and no concept in that tier declares it. Declare the view on those concepts, or name one they have.`,
                );
            }
            if (typeof tier?.head_view !== 'string') continue;
            // The head is the other half of the composed token: the level each
            // of these members composes with. It is checked against the same
            // rule and separately, because a document can name a view its
            // children have and its heads do not, and one diagnostic covering
            // both would not say which half cannot print.
            if (heads.size === 0) {
                if (hasAmbiguousHead) continue;
                this.report(
                    PLAN_DIAGNOSTICS.UNBOUND_TIER_VIEW,
                    `${tierPath}/head_view`,
                    `\`head_view\` says how the head of a composed token in tier \`${tier?.tier}\` is written, and no concept this field writes is the head of one: nothing in that tier names a parent this field also holds. A layer composed onto this document may bring the heads in, and the rule is checked again against the composed document.`,
                    'warning',
                );
                continue;
            }
            const headDeclares = [...heads.values()].some((concept) => {
                const views = viewsOf(concept);
                return views === null || views.has(tier.head_view);
            });
            if (!headDeclares) {
                this.report(
                    PLAN_DIAGNOSTICS.UNBOUND_TIER_VIEW,
                    `${tierPath}/head_view`,
                    `the head of a composed token in tier \`${tier?.tier}\` is written in view \`${tier.head_view}\`, and no concept it composes with declares it. Declare the view on those concepts, or name one they have.`,
                );
            }
        }
    }

    /**
     * `{value}` is the only placeholder. A view holding `{year}` would print
     * the six characters of `{year}`, which is worse than being told at compile
     * time.
     */
    checkPlaceholders(eligible, view, path) {
        for (const concept of eligible) {
            const spelling = literalIn(concept, view);
            if (typeof spelling !== 'string') continue;
            for (const match of spelling.matchAll(/\{([A-Za-z0-9_]+)\}/g)) {
                if (match[1] === 'value') continue;
                this.report(
                    PLAN_DIAGNOSTICS.UNKNOWN_PLACEHOLDER,
                    path,
                    `concept \`${concept.id}\` writes \`${match[0]}\` in view \`${view}\`, and \`{value}\` is the only placeholder a view has. A value that has to print in more than one shape needs a \`text_input.encoding\`.`,
                );
            }
        }
    }

    /**
     * Free text inside a plain format that declares no escape.
     *
     * Most values are fine, so this is not a general ban on free text: a value
     * that happens to contain an inline separator is a run-time unrepresentable
     * result, reported against the value that actually caused it.
     *
     * A block format is the case worth naming here. Its fields are separated by
     * line breaks, a free-text value can contain a line break, and text that
     * looks like the next field would be written out and read back as the next
     * field.
     *
     * This is a warning, not a refusal. Most values in such a field are fine,
     * and the enforcement is the run-time unrepresentable-value result reported
     * against the value that actually caused it. Refusing the document instead
     * left an author one way out: declaring an escape the represented format
     * does not have, which makes the document state something untrue about the
     * scheme and makes a renderer emit text no consumer of that format
     * accepts.
     */
    checkFraming(field, eligible, context, path) {
        if (context.syntax?.type !== 'text') return;
        if (context.mode !== 'block') return;
        if (context.syntax?.escape && context.syntax.escape !== 'none') return;
        const freeText = eligible.filter(
            (concept) =>
                carriesValue(concept) &&
                (concept?.text_input?.encoding?.type ?? 'text') === 'text',
        );
        if (freeText.length === 0) return;
        this.report(
            PLAN_DIAGNOSTICS.UNFRAMABLE_VALUE,
            path,
            `\`${field.category}\` holds free text (${freeText
                .map((concept) => `\`${concept.id}\``)
                .join(
                    ', ',
                )}) in a block format whose fields are separated by line breaks, and the syntax declares no escape. A value containing a line break followed by text that looks like the next field would be written out and read back as that field. Such a value is an unrepresentable-value result at run time rather than a silent round trip. Declare \`syntax: {type: text, escape: backslash}\` only if the represented format really escapes that way; otherwise this is the accounting for a value that cannot be written here.`,
        );
    }

    /**
     * Free text sitting beside a fixed literal in one field cannot round-trip:
     * the literal's own text, supplied as the free value, reads back as the
     * other concept.
     *
     * Reported where the collision is, which is usually one category holding
     * both kinds of concept, and on an `alternatives` field only when the two
     * kinds come from different options. A warning: see the severity table.
     */
    collisionParts(concepts, view) {
        const literals = [];
        const freeText = [];
        for (const concept of concepts) {
            if (carriesValue(concept)) {
                // An encoded value is not an arbitrary string. A date cannot be
                // spelled as an unrelated fixed instruction, so the two
                // identities stay distinguishable.
                const encoding = concept?.text_input?.encoding?.type;
                if (encoding !== undefined && encoding !== 'text') continue;
                freeText.push(concept);
            } else {
                const text = literalIn(concept, view);
                if (typeof text === 'string') literals.push({ concept, text });
            }
        }
        return { literals, freeText };
    }

    reportCollision(literals, freeText, path) {
        this.report(
            PLAN_DIAGNOSTICS.RESERVED_LITERAL_COLLISION,
            path,
            `this field can be written as free text (${freeText
                .map((concept) => `\`${concept.id}\``)
                .join(', ')}) or as one of the fixed instructions ${literals
                .map(
                    ({ concept, text }) =>
                        `\`${concept.id}\` (${JSON.stringify(text)})`,
                )
                .join(
                    ', ',
                )}. A free value equal to one of those strings reads back as the other concept, so the two identities are not distinguishable in this representation.`,
        );
    }

    /**
     * A concept spelled exactly as the field's own separator.
     *
     * The separator is what says where one value ends and the next begins, so a
     * value whose whole text is the separator is a boundary and a value at the
     * same time. It cannot be written (two of them read as three empty values)
     * and text that is only the separator does not read back as the concept, so
     * this one concept is unwritable and unreadable while everything around it
     * works. It is decidable from the document, so it is said here.
     *
     * Reported under the reserved-literal rule because it is the same kind of
     * collision seen from the other side: a string that is content in one
     * reading of the field and structure in another.
     */
    checkSeparatorCollision(field, eligible, view, path) {
        const separator = field.separator;
        if (typeof separator !== 'string' || separator.length === 0) return;
        const collisions = eligible
            .map((concept) => ({
                concept,
                text: literalIn(concept, field.view ?? view),
            }))
            .filter(({ text }) => text === separator);
        if (collisions.length === 0) return;
        this.report(
            PLAN_DIAGNOSTICS.RESERVED_LITERAL_COLLISION,
            path,
            `${collisions
                .map(({ concept }) => `\`${concept.id}\``)
                .join(
                    ', ',
                )} ${collisions.length === 1 ? 'is spelled' : 'are spelled'} ${JSON.stringify(
                separator,
            )} in view \`${field.view ?? view}\`, which is this field's own separator. The same characters are the boundary between two values of this field, so that concept cannot be written here and text that is only the separator does not read back as it. Give it a different spelling in this view, or give the field a separator no concept in it is spelled as.`,
        );
    }

    checkBindingCollision(eligible, view, path) {
        const { literals, freeText } = this.collisionParts(eligible, view);
        if (literals.length === 0 || freeText.length === 0) return;
        this.reportCollision(literals, freeText, path);
    }

    checkReservedLiteralCollision(field, view, path) {
        const perOption = (field.alternatives ?? []).map((option, at) =>
            fieldKind(option) === 'category'
                ? this.collisionParts(
                      this.eligibleConcepts(
                          option,
                          `${path}/alternatives/${at}`,
                      ),
                      option.view ?? view,
                  )
                : { literals: [], freeText: [] },
        );
        // Within one option this is the binding's own collision and the binding
        // already reported it. What only the alternation can produce is free
        // text in one option and a fixed literal in another.
        const literals = perOption.flatMap((parts, at) =>
            perOption.some(
                (other, otherAt) => otherAt !== at && other.freeText.length > 0,
            )
                ? parts.literals
                : [],
        );
        const freeText = perOption.flatMap((parts, at) =>
            perOption.some(
                (other, otherAt) => otherAt !== at && other.literals.length > 0,
            )
                ? parts.freeText
                : [],
        );
        if (literals.length === 0 || freeText.length === 0) return;
        this.reportCollision(literals, freeText, path);
    }

    /**
     * Each named condition `when` uses is one the scheme declares.
     *
     * @param {string} [never] What a condition that is never true would mean
     *   for the declaration that carries it.
     */
    checkWhen(when, path, never = 'this field could never be written') {
        const walk = (node) => {
            if (Array.isArray(node)) return node.forEach(walk);
            if (!node || typeof node !== 'object') return;
            if (typeof node.named_condition === 'string') {
                if (!this.index.namedConditions.has(node.named_condition)) {
                    this.report(
                        PLAN_DIAGNOSTICS.UNRESOLVED_CONDITION,
                        path,
                        `\`when\` names the condition \`${node.named_condition}\`, which the scheme does not declare in \`named_conditions\`. A predicate nothing defines is never true, so ${never}.`,
                    );
                }
                return;
            }
            for (const value of Object.values(node)) walk(value);
        };
        walk(when);
    }
}

/** Whether `list` names one or more of `surfaces`, each of them once. */
function namesSurfacesOnce(list, surfaces) {
    return (
        Array.isArray(list) &&
        list.length > 0 &&
        new Set(list).size === list.length &&
        list.every((surface) => surfaces.includes(surface))
    );
}

/** Read one `when` node as an assertion or a denial of a single concept. */
function conditionKey(when) {
    if (typeof when === 'string') return { assertionOf: when };
    if (Array.isArray(when) && when.length === 1) return conditionKey(when[0]);
    if (when && typeof when === 'object') {
        if (typeof when.has === 'string') return { assertionOf: when.has };
        if (when.operator === 'has_concept' && typeof when.value === 'string') {
            return { assertionOf: when.value };
        }
        if (
            when.operator === 'not_has_concept' &&
            typeof when.value === 'string'
        ) {
            return { negationOf: when.value };
        }
        if (Array.isArray(when.none) && when.none.length === 1) {
            const inner = conditionKey(when.none[0]);
            if (inner.assertionOf) return { negationOf: inner.assertionOf };
        }
    }
    return {};
}

/**
 * Compile a scheme document's formats into plan trees and report every
 * compile-time problem found.
 *
 * Nothing is recognized and nothing is rendered. The return value is the tree a
 * recognizer and a renderer would share, plus the diagnostics; a caller that
 * only wants the verdict can read `diagnostics`.
 *
 * @param {unknown} document A parsed scheme document, `{ scheme: ... }`.
 * @returns {{ formats: object[]; diagnostics: PlanDiagnostic[] }}
 */
export function compilePlan(document) {
    const scheme = document?.scheme;
    if (!scheme || typeof scheme !== 'object') {
        return { formats: [], diagnostics: [] };
    }
    return new PlanBuilder(scheme).build();
}
