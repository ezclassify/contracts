/**
 * Vocabulary resolution: turning an artifact's term overrides into display
 * nouns.
 *
 * A scheme, guide, or access policy may rename the words a surface shows: the
 * whole/part structural roles, or the reference-surface chrome noun its own
 * reference component wears (a scheme's Handbook, a guide's Guidebook, an
 * access policy's Access Handbook). {@link resolveVocabulary} merges those
 * overrides onto a default term map; {@link roleNoun} is the chokepoint for the
 * whole/part structural roles and {@link referenceSurfaceLabel} is the
 * chokepoint for the reference-surface nouns. Routing every label through here
 * keeps the artifact, not the caller, in charge of the word.
 *
 * The resolution lives in the contract because the artifacts it reads are
 * contract shapes and every surface that renders one has to reach the same word
 * for the same input. An in-process engine, an HTTP client, a UI, and a CLI all
 * call the functions below rather than each carrying a copy that can drift.
 */
import type {
    ReferenceSurfaceLabel,
    ResolvedVocabulary,
    Term,
    Vocabulary,
} from './scheme.js';

/**
 * Resolve one raw term against a fallback pair. A blank or non-string field is
 * treated as absent, so a half-filled override degrades to the fallback rather
 * than rendering an empty word.
 */
function resolveTerm(
    raw: Term | undefined,
    fallback: { singular: string; plural: string },
): { singular: string; plural: string } {
    const singular =
        typeof raw?.singular === 'string' && raw.singular.trim()
            ? raw.singular
            : fallback.singular;
    const plural =
        typeof raw?.plural === 'string' && raw.plural.trim()
            ? raw.plural
            : typeof raw?.singular === 'string' && raw.singular.trim()
              ? `${raw.singular}s`
              : fallback.plural;
    return { singular, plural };
}

/**
 * Merge an author-provided vocabulary with a consumer-defined default map. The
 * returned object has an entry for every key in `defaults`, using the author's
 * values where available (auto-pluralizing by suffixing "s" when only singular
 * is given) and the defaults otherwise. Additional author keys not present in
 * `defaults` are carried through verbatim.
 *
 * @param source - Either a bare {@link Vocabulary} or any artifact that carries
 *   one under a `vocabulary` field. `null`/`undefined` selects the defaults.
 * @param defaults - The caller's own term map: which keys it names and what it
 *   calls them when the artifact says nothing.
 * @returns A map with a fully populated singular/plural pair per key.
 */
export function resolveVocabulary(
    source: { vocabulary?: Vocabulary } | Vocabulary | undefined | null,
    defaults: Record<string, { singular: string; plural: string }>,
): ResolvedVocabulary {
    const raw = vocabularyOf(source);
    // No prototype, so a key the author legitimately named `constructor` or
    // `__proto__` is carried through as an ordinary entry rather than
    // colliding with an inherited name.
    const out: ResolvedVocabulary = Object.create(null);
    for (const [key, fallback] of Object.entries(defaults)) {
        out[key] = resolveTerm(raw?.[key], fallback);
    }
    if (raw) {
        for (const [key, term] of Object.entries(raw)) {
            if (Object.hasOwn(out, key)) continue;
            out[key] = resolveTerm(term, { singular: key, plural: `${key}s` });
        }
    }
    return out;
}

/**
 * The vocabulary a source carries: the source itself when it is one, and its
 * `vocabulary` field when it is an artifact holding one.
 */
function vocabularyOf(
    source: { vocabulary?: Vocabulary } | Vocabulary | undefined | null,
): Vocabulary | undefined {
    if (!source) return undefined;
    return isVocabulary(source) ? source : source.vocabulary;
}

/**
 * Decide whether a source object is the vocabulary itself or an artifact
 * holding one. A term's singular/plural strings distinguish it from a nested
 * vocabulary map. The ambiguous `{ vocabulary: {} }` selects an empty wrapper;
 * a flat empty term is retained when accompanied by other term entries.
 */
function isVocabulary(value: unknown): value is Vocabulary {
    if (!value || typeof value !== 'object') return false;
    const v = value as Record<string, unknown>;
    const nested = v.vocabulary;
    if (!nested || typeof nested !== 'object') return true;
    const isTerm = (term: unknown): boolean => {
        if (!term || typeof term !== 'object') return false;
        const words = term as Record<string, unknown>;
        const labels = ['singular', 'plural'].filter(key => Object.hasOwn(words, key));
        return Object.keys(words).length === 0 ||
            (labels.length > 0 && labels.every(key =>
                words[key] === undefined || typeof words[key] === 'string',
            ));
    };
    return isTerm(nested) &&
        (Object.keys(nested).length > 0 ||
            (Object.keys(v).length > 1 && Object.values(v).every(isTerm)));
}

/**
 * The generic display nouns for the whole and part structural roles. Used
 * wherever a scheme declares no word of its own: the contract names the role,
 * not any one domain's artifacts.
 */
export const GENERIC_ROLE_NOUNS = {
    /** Nouns for the whole role, such as a document or a message. */
    whole: {
        /** Noun for one whole. */
        singular: 'whole',
        /** Noun for more than one whole. */
        plural: 'wholes',
    },
    /** Nouns for the part role, such as a paragraph or a field. */
    part: {
        /** Noun for one part. */
        singular: 'part',
        /** Noun for more than one part. */
        plural: 'parts',
    },
} as const;

/**
 * Resolve the display noun for a structural role ('whole' / 'part') from a
 * scheme's {@link Vocabulary}, falling back to the generic English noun when the
 * scheme declares no vocabulary.
 *
 * This is the single chokepoint every surface (UI, API, CLI) should route
 * through instead of hardcoding a display noun. The scheme owns the word (some
 * schemes declare their own nouns for both roles); callers own only the role
 * and the count.
 *
 * @param vocabulary - The scheme or audit report vocabulary; `null`/`undefined`
 *   selects the generic fallback.
 * @param role - Which structural role to name.
 * @param count - `1` (default) yields the singular, anything else the plural.
 * @returns The display noun for that role at that count.
 */
export function roleNoun(
    vocabulary: Vocabulary | null | undefined,
    role: 'whole' | 'part',
    count = 1,
): string {
    // Resolves the one term asked for. Building the whole map to read a single
    // entry costs with the size of the artifact's vocabulary, and this is
    // called once per rendered label.
    const pair = resolveTerm(
        vocabulary?.[role],
        GENERIC_ROLE_NOUNS[role],
    );
    return count === 1 ? pair.singular : pair.plural;
}

/**
 * The generic display nouns for each artifact's reference-surface chrome noun:
 * the label the reference component wears when the artifact declares no
 * override of its own. Keyed by the contract's generic identifier for that
 * component (`handbook`, `guidebook`, `accessHandbook`), which is the same
 * identifier an author uses as the `vocabulary` override key.
 */
export const GENERIC_REFERENCE_SURFACE_NOUNS = {
    /** Label for a scheme's reference component. */
    handbook: {
        /** Label for one handbook. */
        singular: 'Handbook',
        /** Label for more than one handbook. */
        plural: 'Handbooks',
    },
    /** Label for a guide's reference component. */
    guidebook: {
        /** Label for one guidebook. */
        singular: 'Guidebook',
        /** Label for more than one guidebook. */
        plural: 'Guidebooks',
    },
    /** Label for an access policy's reference component. */
    accessHandbook: {
        /** Label for one access handbook. */
        singular: 'Access Handbook',
        /** Label for more than one access handbook. */
        plural: 'Access Handbooks',
    },
} as const;

/** A reference-surface component this contract knows how to name. */
export type ReferenceSurfaceKey = keyof typeof GENERIC_REFERENCE_SURFACE_NOUNS;

/**
 * Resolve the display label an artifact's reference component wears: a scheme's
 * Handbook, a guide's Guidebook, an access policy's Access Handbook. Same
 * chokepoint pattern as {@link roleNoun}: the artifact owns the word (a scheme
 * may rename its Handbook to "Shelving Guide"), the caller owns only which
 * surface it's naming. Always returns a fully-populated pair: an artifact that
 * declares no override resolves to the generic noun for that surface.
 *
 * @param vocabulary - The artifact's own `vocabulary` map (scheme, guide, or
 *   access policy); `null`/`undefined` selects the generic fallback.
 * @param surface - Which reference component to name.
 * @returns The singular/plural pair that component is displayed under.
 */
export function referenceSurfaceLabel(
    vocabulary: Vocabulary | null | undefined,
    surface: ReferenceSurfaceKey,
): ReferenceSurfaceLabel {
    return resolveTerm(
        vocabulary?.[surface],
        GENERIC_REFERENCE_SURFACE_NOUNS[surface],
    );
}
