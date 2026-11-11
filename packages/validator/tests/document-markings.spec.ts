import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
// @ts-expect-error -- the validator ships as plain ESM JavaScript, no types.
import { validateDocument } from '../src/index.mjs';

/**
 * Guides, access policies and crosswalks are marked the way a scheme is: the
 * root block holds the whole and `marking_scheme`, and each rule or mapping
 * holds a part. A document that is not a scheme cannot read its own markings,
 * so its `marking_scheme` is always a reference and never `self`.
 */

const fixtures = path.join(
    path.dirname(fileURLToPath(import.meta.url)),
    '../../../libs/conformance/fixtures/v1',
);

type Doc = Record<string, any>;

function fixture(name: string): Doc {
    return JSON.parse(
        readFileSync(path.join(fixtures, `${name}.json`), 'utf8'),
    ) as Doc;
}

function errors(document: Doc): string[] {
    const result = validateDocument(document) as {
        errors: { path: string; message: string }[];
    };
    return result.errors.map((entry) => `${entry.path} ${entry.message}`);
}

const families = [
    { family: 'guide', name: 'ref-marked-guide-1', root: 'guide' },
    { family: 'access', name: 'ref-marked-access-1', root: 'access' },
    { family: 'crosswalk', name: 'ref-marked-crosswalk-1', root: 'crosswalk' },
];

const positions: { name: string; file: string; at: (doc: Doc) => Doc }[] = [
    {
        name: 'guide block (whole)',
        file: 'ref-marked-guide-1',
        at: (doc) => doc.guide,
    },
    {
        name: 'guide rule',
        file: 'ref-marked-guide-1',
        at: (doc) => doc.guide.rules.inline[0],
    },
    {
        name: 'access block (whole)',
        file: 'ref-marked-access-1',
        at: (doc) => doc.access,
    },
    {
        name: 'access rule',
        file: 'ref-marked-access-1',
        at: (doc) => doc.access.rules.inline[0],
    },
    {
        name: 'crosswalk block (whole)',
        file: 'ref-marked-crosswalk-1',
        at: (doc) => doc.crosswalk,
    },
    {
        name: 'crosswalk mapping',
        file: 'ref-marked-crosswalk-1',
        at: (doc) => doc.crosswalk.mappings[0],
    },
    {
        name: 'mapping a selection candidate holds',
        file: 'ref-marked-crosswalk-1',
        at: (doc) => doc.crosswalk.selections[0].candidates[1].mappings[0],
    },
];

describe('guide, access and crosswalk markings', () => {
    it.each(families)('accepts the marked $family', ({ name }) => {
        expect(errors(fixture(name))).toEqual([]);
    });

    it.each(positions)(
        'takes a marking on the $name as text and nothing else',
        ({ file, at }) => {
            const doc = fixture(file);
            expect(typeof at(doc).marking).toBe('string');
            at(doc).marking = { text: 'L' };
            expect(errors(doc).length).toBeGreaterThan(0);
        },
    );

    it.each([
        {
            name: 'guide layer block',
            file: 'ref-marked-guide-1',
            layer: (doc: Doc) => {
                doc.guide.type = 'layer';
                doc.guide.layer = { base: 'ref-guide-1' };
            },
        },
        {
            name: 'access layer block',
            file: 'ref-marked-access-1',
            layer: (doc: Doc) => {
                doc.access.type = 'layer';
                doc.access.layer = { base: 'ref-access-rules-1' };
            },
        },
        {
            name: 'crosswalk layer block',
            file: 'ref-marked-crosswalk-1',
            layer: (doc: Doc) => {
                doc.crosswalk.type = 'layer';
                doc.crosswalk.layer = { base: 'ref-crosswalk-1' };
            },
        },
    ])('accepts the markings on a $name', ({ file, layer }) => {
        const doc = fixture(file);
        layer(doc);
        expect(errors(doc)).toEqual([]);
    });

    it.each([
        {
            name: 'guide category',
            file: 'ref-marked-guide-1',
            place: (doc: Doc) => {
                doc.guide.categories = [{ id: 'c', label: 'C', marking: 'L' }];
            },
        },
        {
            name: 'guide rule outcome',
            file: 'ref-marked-guide-1',
            place: (doc: Doc) => {
                doc.guide.rules.inline[0].outcome.marking = 'L';
            },
        },
        {
            name: 'guide rule, as a marking_scheme',
            file: 'ref-marked-guide-1',
            place: (doc: Doc) => {
                doc.guide.rules.inline[0].marking_scheme = { id: 'other' };
            },
        },
        {
            name: 'access target scheme',
            file: 'ref-marked-access-1',
            place: (doc: Doc) => {
                doc.access.targetScheme.marking = 'L';
            },
        },
        {
            name: 'access rule, as a marking_scheme',
            file: 'ref-marked-access-1',
            place: (doc: Doc) => {
                doc.access.rules.inline[0].marking_scheme = { id: 'other' };
            },
        },
        {
            name: 'crosswalk selection',
            file: 'ref-marked-crosswalk-1',
            place: (doc: Doc) => {
                doc.crosswalk.selections[0].marking = 'L';
            },
        },
        {
            name: 'crosswalk selection candidate',
            file: 'ref-marked-crosswalk-1',
            place: (doc: Doc) => {
                doc.crosswalk.selections[0].candidates[0].marking = 'L';
            },
        },
        {
            name: 'crosswalk mapping target',
            file: 'ref-marked-crosswalk-1',
            place: (doc: Doc) => {
                doc.crosswalk.mappings[0].targets[0].marking = 'L';
            },
        },
        {
            name: 'document root',
            file: 'ref-marked-crosswalk-1',
            place: (doc: Doc) => {
                doc.marking = 'L';
            },
        },
    ])('refuses a marking on the $name', ({ file, place }) => {
        const doc = fixture(file);
        expect(errors(doc)).toEqual([]);
        place(doc);
        expect(errors(doc).length).toBeGreaterThan(0);
    });
});

describe.each(families)('$family marking_scheme', ({ name, root }) => {
    it.each([
        { label: 'a reference by id', value: { id: 'other-scheme' } },
        {
            label: 'a reference by id and version',
            value: { id: 'other-scheme', version: '2.0.0' },
        },
    ])('accepts $label', ({ value }) => {
        const doc = fixture(name);
        doc[root].marking_scheme = value;
        expect(errors(doc)).toEqual([]);
    });

    it.each([
        { label: 'self', value: 'self' },
        { label: 'a bare scheme id', value: 'other-scheme' },
        { label: 'a reference without an id', value: { version: '2.0.0' } },
        { label: 'a reference with an empty id', value: { id: '' } },
        {
            label: 'a reference with an undeclared key',
            value: { id: 'other-scheme', layers: [] },
        },
        { label: 'a number', value: 1 },
    ])('refuses $label', ({ value }) => {
        const doc = fixture(name);
        expect(errors(doc)).toEqual([]);
        doc[root].marking_scheme = value;
        expect(errors(doc).length).toBeGreaterThan(0);
    });
});
