import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import yaml from 'js-yaml';
// @ts-expect-error -- the validator ships as plain ESM JavaScript, no types.
import { validateDocument } from '../src/index.mjs';

/**
 * A scheme document may carry its own markings: the scheme block holds the
 * whole, and categories, inline concepts, render formats and scheme rules each
 * hold a part. `marking_scheme` names the scheme those markings are written in,
 * by reference or as `self`. No other document family and no other position in
 * a scheme takes a `marking`.
 */

const repoRoot = path.resolve(
    path.dirname(fileURLToPath(import.meta.url)),
    '../../..',
);
const fixtures = path.join(repoRoot, 'libs/conformance/fixtures/v1');
const examples = path.join(repoRoot, 'libs/types/examples');

type Doc = Record<string, any>;

function json(name: string): Doc {
    return JSON.parse(readFileSync(path.join(fixtures, name), 'utf8')) as Doc;
}

function example(name: string): Doc {
    return yaml.load(readFileSync(path.join(examples, name), 'utf8')) as Doc;
}

function marked(): Doc {
    return json('ref-marked-1.json');
}

function errors(document: Doc): string[] {
    const result = validateDocument(document) as {
        ok: boolean;
        errors: { path: string; message: string }[];
    };
    return result.errors.map((entry) => `${entry.path} ${entry.message}`);
}

/** Every position a scheme document declares a marking at. */
const positions: { name: string; at: (doc: Doc) => Doc }[] = [
    { name: 'scheme block (whole)', at: (doc) => doc.scheme },
    { name: 'category', at: (doc) => doc.scheme.data.categories[0] },
    { name: 'inline concept', at: (doc) => doc.scheme.data.concepts.inline[0] },
    { name: 'render format', at: (doc) => doc.scheme.render.formats[0] },
    { name: 'scheme rule', at: (doc) => doc.scheme.rules[0] },
];

describe('scheme document markings', () => {
    it('accepts the marked reference scheme', () => {
        expect(errors(marked())).toEqual([]);
    });

    it.each(positions)(
        'takes a marking on the $name as text and nothing else',
        ({ at }) => {
            const doc = marked();
            expect(typeof at(doc).marking).toBe('string');
            expect(errors(doc)).toEqual([]);
            at(doc).marking = { text: 'L' };
            expect(errors(doc).length).toBeGreaterThan(0);
        },
    );

    it.each([
        {
            name: 'concept group',
            place: (doc: Doc) => {
                doc.scheme.data.concept_groups = [
                    { id: 'g', concept_ids: ['LOW'], marking: 'L' },
                ];
            },
        },
        {
            name: 'scope',
            place: (doc: Doc) => {
                doc.scheme.scopes[0].marking = 'L';
            },
        },
        {
            name: 'render block',
            place: (doc: Doc) => {
                doc.scheme.render.marking = 'L';
            },
        },
        {
            name: 'format field',
            place: (doc: Doc) => {
                doc.scheme.render.formats[0].fields[0].marking = 'L';
            },
        },
        {
            name: 'parse block',
            place: (doc: Doc) => {
                doc.scheme.parse.marking = 'L';
            },
        },
        {
            name: 'data block',
            place: (doc: Doc) => {
                doc.scheme.data.marking = 'L';
            },
        },
        {
            name: 'document root',
            place: (doc: Doc) => {
                doc.marking = 'L';
            },
        },
    ])('refuses a marking on the $name', ({ place }) => {
        const doc = marked();
        expect(errors(doc)).toEqual([]);
        place(doc);
        expect(errors(doc).length).toBeGreaterThan(0);
    });
});

describe('marking_scheme', () => {
    it.each([
        { name: 'self', value: 'self' },
        { name: 'a reference by id', value: { id: 'other-scheme' } },
        {
            name: 'a reference by id and version',
            value: { id: 'other-scheme', version: '2.0.0' },
        },
    ])('accepts $name', ({ value }) => {
        const doc = marked();
        doc.scheme.marking_scheme = value;
        expect(errors(doc)).toEqual([]);
    });

    it.each([
        { name: 'another word', value: 'itself' },
        { name: 'a bare scheme id', value: 'other-scheme' },
        { name: 'a reference without an id', value: { version: '2.0.0' } },
        { name: 'a reference with an empty id', value: { id: '' } },
        {
            name: 'a reference with an undeclared key',
            value: { id: 'other-scheme', layers: [] },
        },
        { name: 'a number', value: 1 },
    ])('refuses $name', ({ value }) => {
        const doc = marked();
        expect(errors(doc)).toEqual([]);
        doc.scheme.marking_scheme = value;
        expect(errors(doc).length).toBeGreaterThan(0);
    });
});

describe('documents that are not schemes take no marking', () => {
    it.each([
        {
            name: 'guide block',
            load: () => json('ref-guide-1.json'),
            place: (doc: Doc) => {
                doc.guide.marking = 'L';
            },
        },
        {
            name: 'guide rule',
            load: () => json('ref-guide-1.json'),
            place: (doc: Doc) => {
                doc.guide.rules.inline[0].marking = 'L';
            },
        },
        {
            name: 'guide marking_scheme',
            load: () => json('ref-guide-1.json'),
            place: (doc: Doc) => {
                doc.guide.marking_scheme = 'self';
            },
        },
        {
            name: 'access block',
            load: () => json('ref-access-rules-1.json'),
            place: (doc: Doc) => {
                doc.access.marking = 'L';
            },
        },
        {
            name: 'access rule',
            load: () => json('ref-access-rules-1.json'),
            place: (doc: Doc) => {
                doc.access.rules.inline[0].marking = 'L';
            },
        },
        {
            name: 'crosswalk block',
            load: () => example('crosswalk-layer.yaml'),
            place: (doc: Doc) => {
                doc.crosswalk.marking = 'L';
            },
        },
        {
            name: 'crosswalk mapping',
            load: () => example('crosswalk-layer.yaml'),
            place: (doc: Doc) => {
                doc.crosswalk.mappings[0].marking = 'L';
            },
        },
        {
            name: 'context block',
            load: () => example('context-with-sources.yaml'),
            place: (doc: Doc) => {
                doc.context.marking = 'L';
            },
        },
    ])('refuses a marking on the $name', ({ load, place }) => {
        const doc = load();
        expect(errors(doc)).toEqual([]);
        place(doc);
        expect(errors(doc).length).toBeGreaterThan(0);
    });
});
