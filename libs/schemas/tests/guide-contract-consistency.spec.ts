import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import Ajv from 'ajv';
import Ajv2020 from 'ajv/dist/2020';
import type { GuideBlock } from '@ezclassify/types';
import { validateGuideDocument } from '@ezclassify/validator/guide';
import {
    guideMetaSchema,
    guideRuleSchema,
    guideSchema,
} from '../src/guide-schema';

const guide: GuideBlock = {
    id: 'calendar-guide',
    version: '1.0.0',
    name: 'Calendar guide',
    targetSchemes: [{ id: 'calendar' }],
    rules: {
        inline: [{ id: 'dates', name: 'Dates', outcome: { rendered: 'DATE' } }],
    },
};
const generated = JSON.parse(
    readFileSync(
        new URL(
            '../generated/json-schemas-input/guide-definition.schema.json',
            import.meta.url,
        ),
        'utf8',
    ),
);
const validateGenerated = new Ajv({ strict: false }).compile(generated);
const ajv = new Ajv2020({ strict: false });
const validateDocument = ajv.compile(guideSchema);
const validateMetadata = ajv.compile(guideMetaSchema);
const validateRule = ajv.compile(guideRuleSchema);

function metadata<T extends { rules: unknown }>(document: T) {
    const { rules: _rules, ...rest } = document;
    return rest;
}

describe('canonical guide description across validation surfaces', () => {
    it.each([undefined, '', 'Finds calendar dates'])(
        'accepts an optional description %s through types, generated, v1 and shipped validator',
        (description) => {
            const document = {
                ...guide,
                ...(description === undefined ? {} : { description }),
            };
            expect(validateGenerated({ guide: document })).toBe(true);
            expect(validateDocument({ guide: document })).toBe(true);
            expect(validateMetadata(metadata(document))).toBe(true);
            expect(validateGuideDocument({ guide: document }).ok).toBe(true);
        },
    );

    it.each([null, 12, [], {}])(
        'refuses a non-string description %j',
        (description) => {
            const document = { ...guide, description };
            expect(validateGenerated({ guide: document })).toBe(false);
            expect(validateDocument({ guide: document })).toBe(false);
            expect(validateMetadata(metadata(document))).toBe(false);
            expect(validateGuideDocument({ guide: document }).ok).toBe(false);
        },
    );

    it.each(['id', 'version', 'name', 'targetSchemes', 'rules'])(
        'still requires guide.%s without a description',
        (key) => {
            const document: Record<string, unknown> = { ...guide };
            delete document[key];
            expect(validateGenerated({ guide: document })).toBe(false);
            expect(validateDocument({ guide: document })).toBe(false);
            expect(validateGuideDocument({ guide: document }).ok).toBe(false);
        },
    );
});

describe('guideRuleSchema single-rule fragment', () => {
    it.each([
        { id: 'dates', name: 'Dates', outcome: { rendered: 'DATE' } },
        {
            id: 'times',
            name: 'Times',
            keywords: ['clock'],
            outcome: { concepts: [{ id: 'time' }] },
        },
    ])('accepts a canonical inline rule %j', (rule) => {
        expect(validateRule(rule)).toBe(true);
        expect(
            validateDocument({
                guide: { ...guide, rules: { inline: [rule] } },
            }),
        ).toBe(true);
    });

    it.each(
        [
            { nonsense: true },
            { name: 'Dates', outcome: { rendered: 'DATE' } },
            { id: 'dates', outcome: { rendered: 'DATE' } },
            { id: 'dates', name: 'Dates' },
            { id: 'dates', name: 'Dates', outcome: {} },
            { id: 'dates', name: 'Dates', outcome: { rendered: 12 } },
            {
                id: 'dates',
                name: 'Dates',
                outcome: { rendered: 'DATE' },
                keywords: [12],
            },
            {
                id: 'dates',
                name: 'Dates',
                outcome: { rendered: 'DATE' },
                extra: true,
            },
            {
                inline: [
                    {
                        id: 'dates',
                        name: 'Dates',
                        outcome: { rendered: 'DATE' },
                    },
                ],
            },
            [],
            null,
        ].map((rule) => ({ rule })),
    )('refuses a malformed rule or rules block $rule', ({ rule }) => {
        expect(validateRule(rule)).toBe(false);
    });
});

describe('guide match expressions across validation surfaces', () => {
    const withMatch = (match: unknown) => ({
        ...guide,
        rules: {
            inline: [
                {
                    id: 'dates',
                    name: 'Dates',
                    match,
                    outcome: { rendered: 'DATE' },
                },
            ],
        },
    });
    const leaf = { type: 'regex', pattern: '\\d{4}', caseSensitive: true };
    const cue = { type: 'regex', pattern: 'due', runtime: true };

    it.each([
        { name: 'leaf', node: leaf },
        { name: 'any', node: { any: [leaf, cue], label: 'Either' } },
        { name: 'all', node: { all: [leaf, cue], within: { tokens: 3 } } },
        { name: 'not', node: { not: cue, of: leaf, within: { chars: 0 } } },
        {
            name: 'near',
            node: {
                near: {
                    a: leaf,
                    b: cue,
                    within: { tokens: 2 },
                    emit: 'envelope',
                },
            },
        },
        {
            name: 'context',
            node: {
                context: {
                    candidate: leaf,
                    cue,
                    within: { chars: 20 },
                    side: 'before',
                },
            },
        },
        {
            name: 'validate',
            node: {
                validate: {
                    candidate: leaf,
                    with: 'luhn',
                    keep: 'fail',
                    args: { n: 1 },
                },
            },
        },
        {
            name: 'nested',
            node: {
                any: [
                    {
                        context: {
                            candidate: {
                                all: [leaf, cue],
                                within: { tokens: 1 },
                            },
                            cue,
                            within: { tokens: 4 },
                        },
                    },
                ],
            },
        },
    ])(
        'accepts a $name node through generated, v1 and shipped validator',
        ({ node }) => {
            const document = withMatch([node]);
            expect(
                validateGenerated({ guide: document }),
                JSON.stringify(validateGenerated.errors),
            ).toBe(true);
            expect(
                validateDocument({ guide: document }),
                JSON.stringify(validateDocument.errors),
            ).toBe(true);
            expect(validateGuideDocument({ guide: document }).ok).toBe(true);
        },
    );

    it.each([
        { name: 'a bare matcher name', node: 'ipv4' },
        { name: 'an empty any', node: { any: [] } },
        {
            name: 'a window with both bounds',
            node: { all: [leaf], within: { tokens: 1, chars: 1 } },
        },
        {
            name: 'a negative window',
            node: { not: cue, of: leaf, within: { tokens: -1 } },
        },
        {
            name: 'a fractional window',
            node: { not: cue, of: leaf, within: { chars: 1.5 } },
        },
        { name: 'an unbounded all', node: { all: [leaf] } },
        {
            name: 'an unknown near emit',
            node: {
                near: { a: leaf, b: cue, within: { tokens: 1 }, emit: 'both' },
            },
        },
        {
            name: 'a validate without a validator',
            node: { validate: { candidate: leaf, with: '' } },
        },
        { name: 'two combinator keys', node: { any: [leaf], not: cue } },
        { name: 'a leaf with no type', node: { pattern: 'x' } },
    ])(
        'refuses $name through generated, v1 and shipped validator',
        ({ node }) => {
            const document = withMatch([node]);
            expect(validateGenerated({ guide: document })).toBe(false);
            expect(validateDocument({ guide: document })).toBe(false);
            expect(validateGuideDocument({ guide: document }).ok).toBe(false);
        },
    );
});
