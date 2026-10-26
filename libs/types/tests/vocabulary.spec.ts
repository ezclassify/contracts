/**
 * Contract for the vocabulary resolvers.
 *
 * `roleNoun` is the single chokepoint for naming the whole/part structural
 * roles, `referenceSurfaceLabel` is the chokepoint for naming each artifact's
 * own reference component (Handbook / Guidebook / Access Handbook), and
 * `resolveVocabulary` merges an author's term overrides onto a consumer's
 * default term map. All three feed display text in the UI, CLI, clients, and
 * audit reports, so their fallback and pluralization rules are the contract,
 * not an implementation detail of whoever renders first.
 */
import { describe, expect, it } from 'vitest';
import {
    GENERIC_REFERENCE_SURFACE_NOUNS,
    GENERIC_ROLE_NOUNS,
    referenceSurfaceLabel,
    resolveVocabulary,
    roleNoun,
} from '../src';

describe('the generic nouns', () => {
    // These are the words a surface shows when an artifact declares none of
    // its own, so they are contract values, not defaults an implementation may
    // retune. Changing one changes what every unconfigured deployment renders.
    it('names the structural roles', () => {
        expect(GENERIC_ROLE_NOUNS).toEqual({
            whole: { singular: 'whole', plural: 'wholes' },
            part: { singular: 'part', plural: 'parts' },
        });
    });

    it('names each reference surface', () => {
        expect(GENERIC_REFERENCE_SURFACE_NOUNS).toEqual({
            handbook: { singular: 'Handbook', plural: 'Handbooks' },
            guidebook: { singular: 'Guidebook', plural: 'Guidebooks' },
            accessHandbook: {
                singular: 'Access Handbook',
                plural: 'Access Handbooks',
            },
        });
    });
});

describe('roleNoun', () => {
    const bannerLabels = {
        whole: { singular: 'banner', plural: 'banners' },
        part: { singular: 'portion', plural: 'portions' },
    };

    it('returns the scheme word, singular by default', () => {
        expect(roleNoun(bannerLabels, 'whole')).toBe('banner');
        expect(roleNoun(bannerLabels, 'part')).toBe('portion');
    });

    it('returns the plural for count !== 1', () => {
        expect(roleNoun(bannerLabels, 'whole', 2)).toBe('banners');
        expect(roleNoun(bannerLabels, 'part', 0)).toBe('portions');
    });

    it('falls back to the generic noun when no vocabulary is declared', () => {
        expect(roleNoun(null, 'whole')).toBe(GENERIC_ROLE_NOUNS.whole.singular);
        expect(roleNoun(undefined, 'part', 3)).toBe(
            GENERIC_ROLE_NOUNS.part.plural,
        );
        expect(roleNoun(null, 'whole', 2)).toBe(
            GENERIC_ROLE_NOUNS.whole.plural,
        );
    });

    it('reads role nouns beside other terms in the one vocabulary map', () => {
        const vocabulary = {
            handbook: {
                singular: 'Register and Manual',
                plural: 'Registers and Manuals',
            },
            whole: { singular: 'banner', plural: 'banners' },
            part: { singular: 'portion', plural: 'portions' },
        };
        expect(roleNoun(vocabulary, 'whole')).toBe('banner');
        expect(roleNoun(vocabulary, 'part', 2)).toBe('portions');
    });
});

// The consumer-supplied default map used across the resolveVocabulary cases.
const defaults = {
    concept: { singular: 'concept', plural: 'concepts' },
    rule: { singular: 'rule', plural: 'rules' },
};

describe('resolveVocabulary: null / undefined source', () => {
    it('returns the defaults map unchanged when source is null', () => {
        expect(resolveVocabulary(null, defaults)).toEqual(defaults);
    });

    it('returns the defaults map unchanged when source is undefined', () => {
        expect(resolveVocabulary(undefined, defaults)).toEqual(defaults);
    });
});

describe('resolveVocabulary: flat Vocabulary source', () => {
    it('uses author-provided singular and plural when both are given', () => {
        const result = resolveVocabulary(
            { concept: { singular: 'tag', plural: 'tags' } },
            defaults,
        );
        expect(result.concept).toEqual({ singular: 'tag', plural: 'tags' });
        // 'rule' was not overridden, so it falls back to the default term.
        expect(result.rule).toEqual({ singular: 'rule', plural: 'rules' });
    });

    it('auto-pluralizes by appending s when only singular is given', () => {
        const result = resolveVocabulary(
            { concept: { singular: 'label' } },
            defaults,
        );
        expect(result.concept).toEqual({ singular: 'label', plural: 'labels' });
    });

    it('prefers a provided plural over the derived one', () => {
        const result = resolveVocabulary(
            { concept: { singular: 'ox', plural: 'oxen' } },
            defaults,
        );
        expect(result.concept.plural).toBe('oxen');
    });

    it('falls back to defaults when a term is blank or whitespace-only', () => {
        // A blank term is treated as absent, not as a valid override that
        // renders an empty word.
        expect(
            resolveVocabulary(
                { concept: { singular: '', plural: '' } },
                defaults,
            ).concept,
        ).toEqual({ singular: 'concept', plural: 'concepts' });
        expect(
            resolveVocabulary({ concept: { singular: '   ' } }, defaults)
                .concept,
        ).toEqual({ singular: 'concept', plural: 'concepts' });
    });

    it('falls back to defaults when a term carries neither field', () => {
        expect(resolveVocabulary({ concept: {} }, defaults).concept).toEqual({
            singular: 'concept',
            plural: 'concepts',
        });
    });

    it('carries extra author keys through that are not in defaults', () => {
        const result = resolveVocabulary(
            {
                concept: { singular: 'tag', plural: 'tags' },
                category: { singular: 'group', plural: 'groups' },
            },
            defaults,
        );
        expect(result.category).toEqual({
            singular: 'group',
            plural: 'groups',
        });
    });

    it('auto-pluralizes extra keys that have only a singular form', () => {
        const result = resolveVocabulary(
            { widget: { singular: 'widget' } },
            defaults,
        );
        expect(result.widget).toEqual({
            singular: 'widget',
            plural: 'widgets',
        });
    });

    it('replaces a defaults entry in place rather than adding a second key', () => {
        const result = resolveVocabulary(
            { concept: { singular: 'marker', plural: 'markers' } },
            defaults,
        );
        expect(result.concept).toEqual({
            singular: 'marker',
            plural: 'markers',
        });
        expect(Object.keys(result)).toEqual(['concept', 'rule']);
    });

    it('carries through a key that shares a name with an inherited property', () => {
        // An author is free to name a term `constructor`. Testing the
        // accumulator with `in` would report that name as already present and
        // drop the author's word without saying so.
        const result = resolveVocabulary(
            {
                constructor: { singular: 'builder', plural: 'builders' },
                toString: { singular: 'rendering' },
            } as unknown as Record<string, { singular: string }>,
            defaults,
        );
        expect(result.constructor).toEqual({
            singular: 'builder',
            plural: 'builders',
        });
        expect(result.toString).toEqual({
            singular: 'rendering',
            plural: 'renderings',
        });
    });
});

describe('term keys that overlap artifact fields', () => {
    const vocabulary = {
        vocabulary: { singular: 'lexicon', plural: 'lexicons' },
        whole: { singular: 'message', plural: 'messages' },
        handbook: { singular: 'Field Guide', plural: 'Field Guides' },
    };

    it('preserves a flat term named vocabulary and its neighboring terms', () => {
        expect(resolveVocabulary(vocabulary, defaults)).toEqual({
            ...defaults,
            ...vocabulary,
        });
    });

    it('reads role nouns directly from a flat vocabulary', () => {
        expect(roleNoun(vocabulary, 'whole')).toBe('message');
    });

    it('reads reference labels directly from a flat vocabulary', () => {
        expect(referenceSurfaceLabel(vocabulary, 'handbook')).toEqual(
            vocabulary.handbook,
        );
    });

    it.each(['vocabulary', 'whole'] as const)(
        'preserves flat terms with extra response fields on %s',
        (key) => {
            const terms = {
                ...vocabulary,
                [key]: {
                    ...vocabulary[key],
                    description: 'Additional server metadata',
                },
            };
            expect(resolveVocabulary(terms, {})).toEqual(vocabulary);
        },
    );

    it('unwraps a vocabulary whose term keys are singular and plural', () => {
        expect(
            resolveVocabulary(
                {
                    vocabulary: {
                        singular: { singular: 'one' },
                        plural: { singular: 'many' },
                    },
                },
                {},
            ),
        ).toEqual({
            singular: { singular: 'one', plural: 'ones' },
            plural: { singular: 'many', plural: 'manys' },
        });
    });

    it('uses defaults for an artifact with an empty vocabulary', () => {
        expect(resolveVocabulary({ vocabulary: {} }, defaults)).toEqual(
            defaults,
        );
    });
});

describe('resolveVocabulary: wrapped { vocabulary: ... } source', () => {
    it('unwraps an artifact that carries its vocabulary under a field', () => {
        const result = resolveVocabulary(
            { vocabulary: { concept: { singular: 'item', plural: 'items' } } },
            defaults,
        );
        expect(result.concept).toEqual({ singular: 'item', plural: 'items' });
        expect(result.rule).toEqual({ singular: 'rule', plural: 'rules' });
    });

    it('retains an empty flat term beside another term', () => {
        expect(
            resolveVocabulary(
                { vocabulary: {}, concept: { singular: 'node' } },
                defaults,
            ),
        ).toEqual({
            concept: { singular: 'node', plural: 'nodes' },
            rule: defaults.rule,
            vocabulary: { singular: 'vocabulary', plural: 'vocabularys' },
        });
    });
});

describe('referenceSurfaceLabel', () => {
    it('falls back to the generic noun for each surface when nothing is declared', () => {
        expect(referenceSurfaceLabel(undefined, 'handbook')).toEqual(
            GENERIC_REFERENCE_SURFACE_NOUNS.handbook,
        );
        expect(referenceSurfaceLabel(null, 'guidebook')).toEqual(
            GENERIC_REFERENCE_SURFACE_NOUNS.guidebook,
        );
        expect(referenceSurfaceLabel(undefined, 'accessHandbook')).toEqual(
            GENERIC_REFERENCE_SURFACE_NOUNS.accessHandbook,
        );
    });

    it("resolves the artifact's own override for the requested surface", () => {
        const vocabulary = {
            handbook: { singular: 'Field Guide', plural: 'Field Guides' },
        };
        expect(referenceSurfaceLabel(vocabulary, 'handbook')).toEqual({
            singular: 'Field Guide',
            plural: 'Field Guides',
        });
    });

    it('auto-pluralizes a singular-only override', () => {
        expect(
            referenceSurfaceLabel(
                { guidebook: { singular: 'Cheat Sheet' } },
                'guidebook',
            ),
        ).toEqual({ singular: 'Cheat Sheet', plural: 'Cheat Sheets' });
    });

    it("ignores an override declared under a different surface's key", () => {
        // A scheme's vocabulary might carry a 'guidebook' key too (a scheme
        // that ships a companion guide reference, say), but naming 'handbook'
        // must never resolve to it.
        expect(
            referenceSurfaceLabel(
                { guidebook: { singular: 'Cheat Sheet' } },
                'handbook',
            ),
        ).toEqual(GENERIC_REFERENCE_SURFACE_NOUNS.handbook);
    });
});
