/**
 * Contract for the two display derivations.
 *
 * `describeOutcome` decides what a guide rule's effect reads as, and
 * `buildCategoryMap` decides how a flat marking indexes by category. Both are
 * applied by more than one surface to the same published shapes, so their
 * fallbacks and ordering are pinned here rather than left to whoever renders
 * first.
 */
import { describe, expect, it } from 'vitest';
import { buildCategoryMap, describeOutcome } from '../src';
import type { Assertion } from '../src';

describe('describeOutcome', () => {
    it('prefers the pre-rendered marking', () => {
        expect(describeOutcome({ rendered: 'PUBLIC//REVIEW' })).toBe(
            'PUBLIC//REVIEW',
        );
    });

    it('lists concept ids in order when there is no rendered form', () => {
        expect(
            describeOutcome({ concepts: [{ id: 'alpha' }, { id: 'beta' }] }),
        ).toBe('alpha, beta');
    });

    it('prefers the rendered form even when concepts are also present', () => {
        expect(
            describeOutcome({
                rendered: 'PUBLIC',
                concepts: [{ id: 'alpha' }],
            }),
        ).toBe('PUBLIC');
    });

    it('renders an empty outcome as the empty string', () => {
        expect(describeOutcome({})).toBe('');
        expect(describeOutcome({ concepts: [] })).toBe('');
        expect(describeOutcome({ rendered: '' })).toBe('');
    });
});

function assertion(categoryId: string, conceptId: string): Assertion {
    return {
        categoryId,
        conceptId,
        confidence: 'certain',
        source: 'test',
    };
}

describe('buildCategoryMap', () => {
    it('groups entries under their category id', () => {
        const level = assertion('level', 'public');
        const audience = assertion('audience', 'partners');
        const map = buildCategoryMap([level, audience]);
        expect([...map.keys()]).toEqual(['level', 'audience']);
        expect(map.get('level')).toEqual([level]);
        expect(map.get('audience')).toEqual([audience]);
    });

    it('keeps input order within a category', () => {
        const first = assertion('audience', 'partners');
        const second = assertion('audience', 'vendors');
        expect(buildCategoryMap([first, second]).get('audience')).toEqual([
            first,
            second,
        ]);
    });

    it('omits categories with no entries rather than mapping them to []', () => {
        const map = buildCategoryMap([assertion('level', 'public')]);
        expect(map.has('audience')).toBe(false);
        expect(map.get('audience')).toBeUndefined();
    });

    it('returns an empty map for an empty list', () => {
        expect(buildCategoryMap([]).size).toBe(0);
    });

    it('does not modify the input array', () => {
        const items = [assertion('level', 'public')];
        const snapshot = [...items];
        buildCategoryMap(items);
        expect(items).toEqual(snapshot);
    });
});
