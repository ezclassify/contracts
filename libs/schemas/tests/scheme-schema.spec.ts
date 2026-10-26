import { describe, it, expect, beforeAll } from 'vitest';
import Ajv from 'ajv';
import type { ValidateFunction } from 'ajv';
import {
    schemeSchema,
    conceptSchema,
    categorySchema,
    recognizerSchema,
    renderFormatSchema,
    schemeMetaSchema,
    grammarSchema,
    schemeRuleSchema,
    rollupPipelineSchema,
    repairRuleSchema,
    schemaDefs,
} from '../src/scheme-schema';

describe('scheme-schema extractItemSchema', () => {
    it('conceptSchema includes properties from $ref-resolved item', () => {
        // The generated scheme schema uses { "$ref": "#/definitions/..." } inside
        // array items, not inline properties. extractItemSchema must resolve the ref
        // before spreading so consumers see the actual properties/required shape.
        expect(conceptSchema).toHaveProperty('properties');
        const props = conceptSchema.properties as Record<string, unknown>;
        // Core fields every concept must have
        expect(props).toHaveProperty('id');
        expect(props).toHaveProperty('name');
        expect(props).toHaveProperty('views');
    });

    it('categorySchema includes properties from $ref-resolved item', () => {
        expect(categorySchema).toHaveProperty('properties');
        const props = categorySchema.properties as Record<string, unknown>;
        expect(props).toHaveProperty('id');
        expect(props).toHaveProperty('label');
    });

    it('recognizerSchema includes properties from $ref-resolved item', () => {
        expect(recognizerSchema).toHaveProperty('properties');
        const props = recognizerSchema.properties as Record<string, unknown>;
        expect(props).toHaveProperty('id');
        expect(props).toHaveProperty('pattern');
        expect(props).toHaveProperty('format');
        expect(props).toHaveProperty('binds');
    });

    it('renderFormatSchema preserves exclusive scalar and multiple surface layouts', () => {
        const branches = renderFormatSchema.anyOf as Array<{
            properties: Record<string, unknown>;
            required: string[];
        }>;
        expect(branches).toHaveLength(2);
        for (const branch of branches)
            expect(branch.properties).toHaveProperty('id');
        expect(branches[0].required).toContain('surface');
        expect(branches[1].required).toContain('surfaces');
    });

    it('all extracted schemas carry $defs for downstream validators', () => {
        expect(conceptSchema).toHaveProperty('$defs');
        expect(categorySchema).toHaveProperty('$defs');
        expect(recognizerSchema).toHaveProperty('$defs');
        expect(renderFormatSchema).toHaveProperty('$defs');
    });
});

// ---------------------------------------------------------------------------
// Scheme document validation (via AJV, draft-07: uses 'definitions' key)
// ---------------------------------------------------------------------------

const MINIMAL_VALID_SCHEME = {
    scheme: {
        id: 'test-scheme',
        version: '1.0.0',
        name: 'Test Scheme',
        data: {
            categories: [
                {
                    id: 'level',
                    label: 'Level',
                    rollup: 'max',
                    required: true,
                    single: true,
                },
            ],
            concepts: {
                inline: [
                    {
                        id: 'LOW',
                        name: 'Low',
                        categories: ['level'],
                        views: { default: 'LOW' },
                    },
                    {
                        id: 'HIGH',
                        name: 'High',
                        categories: ['level'],
                        views: { default: 'HIGH' },
                    },
                ],
            },
        },
    },
};

describe('schemeSchema: accept paths', () => {
    let validate: ValidateFunction;

    beforeAll(() => {
        const ajv = new (
            Ajv as unknown as new (o: { strict: boolean }) => {
                compile(s: unknown): ValidateFunction;
            }
        )({ strict: false });
        validate = ajv.compile(schemeSchema);
    });

    it('accepts a minimal valid scheme document', () => {
        expect(validate(MINIMAL_VALID_SCHEME)).toBe(true);
    });

    it('accepts conditional and named marking requirements on nested roles', () => {
        const doc = structuredClone(MINIMAL_VALID_SCHEME);
        Object.assign(doc.scheme, {
            named_conditions: { has_high: { category: 'level', has: 'HIGH' } },
            role_detection: {
                whole: {
                    views: ['banner'],
                    required_when: { named_condition: 'has_high' },
                },
                part: {
                    views: ['portion'],
                    required_when: {
                        target: 'contributors',
                        quantifier: 'any',
                        all: [],
                    },
                },
            },
        });
        expect(validate(doc), JSON.stringify(validate.errors)).toBe(true);
        const invalid = structuredClone(doc);
        Object.assign(invalid.scheme, {
            role_detection: {
                part: { views: ['portion'], required_when: true },
            },
        });
        expect(validate(invalid)).toBe(false);
    });

    it('accepts conditional category defaults and refuses malformed conditions', () => {
        const doc = structuredClone(MINIMAL_VALID_SCHEME);
        Object.assign(doc.scheme.data.categories[0], { default_concept: { concept: 'LOW', when: { category: 'level', has: 'HIGH' } } });
        expect(validate(doc), JSON.stringify(validate.errors)).toBe(true);
        Object.assign(doc.scheme.data.categories[0], { default_concept: { concept: 'LOW', when: true } });
        expect(validate(doc)).toBe(false);
    });

    it('accepts a scheme with optional parse block', () => {
        const doc = {
            scheme: {
                ...MINIMAL_VALID_SCHEME.scheme,
                parse: {
                    case_sensitive: false,
                    strip_whitespace: true,
                    recognizers: [],
                    normalize: [],
                },
            },
        };
        expect(validate(doc)).toBe(true);
    });

    it('accepts a notice that declares the value a view registers it under', () => {
        const doc = structuredClone(MINIMAL_VALID_SCHEME);
        const concept = doc.scheme.data.concepts.inline[0] as Record<
            string,
            unknown
        >;
        concept.notices = [
            {
                type: 'warning',
                required: true,
                text: 'Handle with care.',
                views: { strict: 'CARE' },
            },
        ];
        expect(validate(doc), JSON.stringify(validate.errors)).toBe(true);
    });

    it('accepts a notice that declares no registration at all', () => {
        const doc = structuredClone(MINIMAL_VALID_SCHEME);
        const concept = doc.scheme.data.concepts.inline[0] as Record<
            string,
            unknown
        >;
        concept.notices = [
            { type: 'warning', required: true, text: 'Handle with care.' },
        ];
        expect(validate(doc), JSON.stringify(validate.errors)).toBe(true);
    });

    it('accepts the display-color wire contract used by authored schemes', () => {
        const doc = structuredClone(MINIMAL_VALID_SCHEME);
        const concept = doc.scheme.data.concepts.inline[0] as Record<
            string,
            unknown
        >;
        concept.color = { background: '#c8102e', text: '#fff' };
        (doc.scheme as Record<string, unknown>).render = {
            default: 'default',
            formats: [],
            color_from: 'level',
        };
        expect(validate(doc)).toBe(true);
    });

    it('accepts a stand-in concept and a format that writes it in place of the whole values', () => {
        const doc = structuredClone(MINIMAL_VALID_SCHEME);
        doc.scheme.data.categories.push({
            id: 'reach',
            label: 'Reach',
            rollup: 'intersection',
            required: false,
            single: false,
        });
        (doc.scheme.data.concepts.inline as Record<string, unknown>[]).push({
            id: 'SAME',
            name: 'Same as the whole',
            categories: ['level'],
            views: { default: 'SAME' },
            stands_for_whole: 'reach',
        });
        (doc.scheme as Record<string, unknown>).render = {
            default: 'part',
            formats: [
                {
                    id: 'part',
                    surface: 'classification',
                    mode: 'inline',
                    omit_whole_values: true,
                    fields: [{ category: 'level' }],
                },
            ],
        };
        expect(validate(doc), JSON.stringify(validate.errors)).toBe(true);
    });
});

describe('schemeSchema: reject paths', () => {
    let validate: ValidateFunction;

    beforeAll(() => {
        const ajv = new (
            Ajv as unknown as new (o: { strict: boolean }) => {
                compile(s: unknown): ValidateFunction;
            }
        )({ strict: false });
        validate = ajv.compile(schemeSchema);
    });

    it('rejects a document missing the top-level scheme wrapper', () => {
        const doc = {
            id: 'x',
            version: '1.0.0',
            name: 'X',
            mode: 'additive',
            data: {},
        };
        expect(validate(doc)).toBe(false);
    });

    it('rejects unsupported properties on the document envelope', () => {
        expect(validate(MINIMAL_VALID_SCHEME)).toBe(true);
        expect(
            validate({ ...MINIMAL_VALID_SCHEME, unexpected_field: true }),
        ).toBe(false);
        expect(validate.errors).toContainEqual(
            expect.objectContaining({
                keyword: 'additionalProperties',
                instancePath: '',
                params: { additionalProperty: 'unexpected_field' },
            }),
        );
    });

    it('rejects a document missing scheme.id', () => {
        const { id: _id, ...rest } = MINIMAL_VALID_SCHEME.scheme;
        expect(validate({ scheme: rest })).toBe(false);
    });

    it('rejects a document missing scheme.version', () => {
        const { version: _v, ...rest } = MINIMAL_VALID_SCHEME.scheme;
        expect(validate({ scheme: rest })).toBe(false);
    });

    it('rejects a document missing scheme.name', () => {
        const { name: _n, ...rest } = MINIMAL_VALID_SCHEME.scheme;
        expect(validate({ scheme: rest })).toBe(false);
    });

    it('rejects an unsupported property on the closed scheme body', () => {
        expect(validate(MINIMAL_VALID_SCHEME)).toBe(true);
        expect(
            validate({
                scheme: { ...MINIMAL_VALID_SCHEME.scheme, unsupported: true },
            }),
        ).toBe(false);
    });

    it('rejects a document missing scheme.data', () => {
        const { data: _d, ...rest } = MINIMAL_VALID_SCHEME.scheme;
        expect(validate({ scheme: rest })).toBe(false);
    });

    it('rejects a non-string scheme.id', () => {
        expect(
            validate({ scheme: { ...MINIMAL_VALID_SCHEME.scheme, id: 42 } }),
        ).toBe(false);
    });

    it('rejects an incomplete display-color pair', () => {
        const doc = structuredClone(MINIMAL_VALID_SCHEME);
        const concept = doc.scheme.data.concepts.inline[0] as Record<
            string,
            unknown
        >;
        concept.color = { background: '#c8102e' };
        expect(validate(doc)).toBe(false);
    });

    it('rejects omit_whole_values on a field: it belongs to the format', () => {
        const doc = structuredClone(MINIMAL_VALID_SCHEME);
        (doc.scheme as Record<string, unknown>).render = {
            default: 'part',
            formats: [
                {
                    id: 'part',
                    surface: 'classification',
                    mode: 'inline',
                    fields: [{ category: 'level', omit_whole_values: true }],
                },
            ],
        };
        expect(validate(doc)).toBe(false);
    });

    it('rejects a stand-in that names more than one category', () => {
        const doc = structuredClone(MINIMAL_VALID_SCHEME);
        const concept = doc.scheme.data.concepts.inline[0] as Record<
            string,
            unknown
        >;
        concept.stands_for_whole = ['level'];
        expect(validate(doc)).toBe(false);
    });

    it('rejects a notice registration whose value is not a string', () => {
        const doc = structuredClone(MINIMAL_VALID_SCHEME);
        const concept = doc.scheme.data.concepts.inline[0] as Record<
            string,
            unknown
        >;
        concept.notices = [
            {
                type: 'warning',
                required: true,
                text: 'Handle with care.',
                views: { strict: ['CARE'] },
            },
        ];
        expect(validate(doc)).toBe(false);
    });
});

// ---------------------------------------------------------------------------
// Exported sub-schema structure
// ---------------------------------------------------------------------------

describe('scheme-schema exports: additional sub-schemas', () => {
    it('schemeMetaSchema carries a $ref or properties (resolve-ready for downstream validators)', () => {
        // schemeMetaSchema wraps rootProps.scheme, which is a $ref node in this schema.
        // It always carries $defs for $ref resolution; may have $ref or properties directly.
        const hasRef =
            '$ref' in schemeMetaSchema || 'properties' in schemeMetaSchema;
        expect(hasRef).toBe(true);
        expect(schemeMetaSchema).toHaveProperty('$defs');
    });

    it('grammarSchema is the parse configuration schema, carrying $defs', () => {
        expect(grammarSchema).toHaveProperty('properties.recognizers');
        expect(grammarSchema).toHaveProperty('properties.normalize');
        expect(grammarSchema).toHaveProperty('$defs');
    });

    it('schemeRuleSchema is the scheme rule item schema', () => {
        expect(typeof schemeRuleSchema).toBe('object');
        expect(schemeRuleSchema.required).toEqual(['id', 'action']);
    });

    it('schemaDefs is a non-empty map of type definitions', () => {
        const defs = schemaDefs as Record<string, unknown>;
        expect(Object.keys(defs).length).toBeGreaterThan(0);
    });

    it('rollupPipelineSchema is an object with $defs', () => {
        expect(typeof rollupPipelineSchema).toBe('object');
        expect(rollupPipelineSchema).not.toBeNull();
        expect(rollupPipelineSchema).toHaveProperty('$defs');
    });

    it('repairRuleSchema is an object with $defs', () => {
        expect(typeof repairRuleSchema).toBe('object');
        expect(repairRuleSchema).not.toBeNull();
        expect(repairRuleSchema).toHaveProperty('$defs');
    });
});

describe('contributor condition block schema', () => {
    const validate = new Ajv({ strict: false }).compile(schemeSchema);
    const documentWith = (block: unknown) => ({
        scheme: {
            ...MINIMAL_VALID_SCHEME.scheme,
            named_conditions: { correlated: block },
        },
    });
    const predicate = {
        all: [
            { category_id: 'level', operator: 'min_rank', value: 1 },
            {
                category_id: 'handling',
                operator: 'not_has_concept',
                value: 'SHARE',
            },
        ],
    };

    it.each(['any', 'all', 'none'])(
        'accepts %s contributor blocks nested in boolean expressions',
        (quantifier) => {
            expect(
                validate(
                    documentWith({
                        any: [
                            {
                                target: 'contributors',
                                quantifier,
                                ...predicate,
                            },
                        ],
                    }),
                ),
            ).toBe(true);
        },
    );

    it('accepts the default all-contributors quantifier', () => {
        expect(
            validate(documentWith({ target: 'contributors', ...predicate })),
        ).toBe(true);
    });

    it.each([
        { target: 'contributors', quantifier: 'some' },
        { target: 'context', quantifier: 'any' },
        { target: 'self', quantifier: 'any' },
    ])('rejects unsupported contributor block settings: %j', (settings) => {
        expect(validate(documentWith({ ...settings, ...predicate }))).toBe(
            false,
        );
    });
});

describe('category-specific concept positions', () => {
    const validate = new Ajv({ strict: false }).compile(categorySchema);
    const category = { id: 'labels', label: 'Labels', rollup: 'union' };

    it('accepts numeric positions, including zero and fractions', () => {
        expect(validate({
            ...category,
            position_overrides: { first: -1, shared: 0, between: 0.5 },
        })).toBe(true);
    });

    it.each(['first', null, [], { first: 'last' }])(
        'refuses a nonnumeric position map: %j',
        (position_overrides) => {
            expect(validate({ ...category, position_overrides })).toBe(false);
        },
    );
});

describe('concept position and rank specs', () => {
    const validate = new Ajv({ strict: false }).compile(schemeSchema);
    const withLow = (fields: Record<string, unknown>) => {
        const doc = structuredClone(MINIMAL_VALID_SCHEME);
        Object.assign(doc.scheme.data.concepts.inline[0], fields);
        return doc;
    };

    it.each([
        { position: 'first' },
        { position: 3 },
        { position: { after: 'HIGH' } },
        { position: { before: 'HIGH' } },
        { position: { between: ['HIGH', 'HIGH'] } },
        { rank: 'top' },
        { rank: { above: 'HIGH' } },
        { rank: { below: 'HIGH' } },
    ])('accepts %j', (fields) => {
        expect(validate(withLow(fields)), JSON.stringify(validate.errors)).toBe(
            true,
        );
    });

    it.each([
        { position: { beside: 'HIGH' } },
        { position: { before: 'HIGH', after: 'HIGH' } },
        { position: { between: ['HIGH'] } },
        { rank: { before: 'HIGH' } },
    ])('refuses %j', (fields) => {
        expect(validate(withLow(fields))).toBe(false);
    });
});
