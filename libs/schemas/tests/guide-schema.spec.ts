/**
 * Validation tests for the guide document schema.
 *
 * Root shape: { guide: { id, version, name, description, target_schemes: [...],
 * rules: [...] } } Required: guide.id, version, name,
 * target_schemes (minItems: 1), rules Strict: additionalProperties: false
 * throughout; description is optional
 */
import { describe, it, expect, beforeAll } from 'vitest';
import Ajv2020 from 'ajv/dist/2020';
import type { ValidateFunction } from 'ajv';
import {
    guideSchema,
    guideMetaSchema,
    guideRuleSchema,
    guideCategorySchema,
    guideDependencySchema,
    guideSchemaDefs,
} from '../src/guide-schema';

// ---------------------------------------------------------------------------
// Document validation (via AJV, draft-2020-12)
// ---------------------------------------------------------------------------

describe('guideSchema: accept paths', () => {
    let validate: ValidateFunction;

    beforeAll(() => {
        const ajv = new (Ajv2020 as unknown as new (o: { strict: boolean }) => {
            compile(s: unknown): ValidateFunction;
        })({ strict: false });
        validate = ajv.compile(guideSchema);
    });

    it('accepts a minimal valid guide document', () => {
        const doc = {
            guide: {
                id: 'my-guide',
                version: '1.0.0',
                name: 'My Guide',
                description: 'A test guide',
                target_schemes: [{ id: 'demo' }],
                rules: [],
            },
        };
        expect(validate(doc)).toBe(true);
    });

    it('accepts a document without the optional guide.description', () => {
        const doc = {
            guide: {
                id: 'x',
                version: '1.0.0',
                name: 'X',
                target_schemes: [{ id: 'demo' }],
                rules: [],
            },
        };
        expect(validate(doc)).toBe(true);
    });

    it('accepts a guide layer, which binds to a base and names typed removals', () => {
        // Restoring only means something on top of a layer that removed the
        // thing, so this one declares the layer it has to follow. These
        // fixtures get read as examples; a restore of a category nothing
        // removed would be modeling a document that cannot happen.
        const doc = {
            guide: {
                id: 'division-quickmark',
                version: '1.0.0',
                name: 'Division Quickmark Tailoring',
                description: 'Division reading of the shared quickmark rules',
                type: 'layer',
                layer: {
                    base: 'quickmark@1.0.0',
                    requires: ['agency-quickmark@1.0.0'],
                    removes: [{ rule: 'handles-source-code' }],
                    restores: [{ category: 'handling' }],
                },
                target_schemes: [{ id: 'demo' }],
                rules: [],
            },
        };
        expect(validate(doc)).toBe(true);
    });

    it('accepts a guide document with canonical rules', () => {
        const doc = {
            guide: {
                id: 'allergen-guide',
                version: '2.0.0',
                name: 'Allergen Guide',
                description: 'Identifies allergens in text',
                target_schemes: [{ id: 'pantry', version: '>=1.0.0' }],
                rules: [
                        {
                            id: 'r1',
                            name: 'Nut allergy',
                            outcome: { rendered: 'NUT' },
                        },
                        {
                            id: 'r2',
                            name: 'Dairy allergy',
                            outcome: { rendered: 'DAIRY' },
                        },
                    ],
            },
        };
        expect(validate(doc)).toBe(true);
    });

    it('refuses a removal that names two kinds at once', () => {
        // Exactly one key. A removal that claims to be both a rule and a
        // category has no single referent, and guessing at one is how a layer
        // silently removes the wrong thing.
        const doc = {
            guide: {
                id: 'division-quickmark',
                version: '1.0.0',
                name: 'Division Quickmark Tailoring',
                description: 'Division reading of the shared quickmark rules',
                type: 'layer',
                layer: {
                    base: 'quickmark@1.0.0',
                    removes: [{ rule: 'handles-pii', category: 'handling' }],
                },
                target_schemes: [{ id: 'demo' }],
                rules: [],
            },
        };
        expect(validate(doc)).toBe(false);
    });
});

describe('guideSchema: reject paths', () => {
    let validate: ValidateFunction;

    beforeAll(() => {
        const ajv = new (Ajv2020 as unknown as new (o: { strict: boolean }) => {
            compile(s: unknown): ValidateFunction;
        })({ strict: false });
        validate = ajv.compile(guideSchema);
    });

    it('rejects a document missing guide.name', () => {
        const doc = {
            guide: {
                id: 'x',
                version: '1.0.0',
                description: 'Desc',
                target_schemes: [{ id: 'demo' }],
                rules: [],
            },
        };
        expect(validate(doc)).toBe(false);
    });

    it('rejects a document missing guide.target_schemes', () => {
        const doc = {
            guide: {
                id: 'x',
                version: '1.0.0',
                name: 'X',
                description: 'Desc',
                rules: [],
            },
        };
        expect(validate(doc)).toBe(false);
    });

    it('rejects a document with empty target_schemes (minItems: 1)', () => {
        const doc = {
            guide: {
                id: 'x',
                version: '1.0.0',
                name: 'X',
                description: 'Desc',
                target_schemes: [],
                rules: [],
            },
        };
        expect(validate(doc)).toBe(false);
    });

    it('rejects a document with an unknown key (additionalProperties: false)', () => {
        const doc = {
            guide: {
                id: 'x',
                version: '1.0.0',
                name: 'X',
                description: 'Desc',
                target_schemes: [{ id: 'demo' }],
                rules: [],
                unknown_field: 'bad',
            },
        };
        expect(validate(doc)).toBe(false);
    });

    it.each([
        [
            'a string when condition',
            {
                rules: [
                    {
                        id: 'r',
                        name: 'R',
                        outcome: { rendered: 'R' },
                        when: 'has_content',
                    },
                ],
            },
        ],
        [
            'an empty when block',
            {
                rules: [
                    {
                        id: 'r',
                        name: 'R',
                        outcome: { rendered: 'R' },
                        when: {},
                    },
                ],
            },
        ],
        [
            'an empty when list',
            {
                rules: [
                    {
                        id: 'r',
                        name: 'R',
                        outcome: { rendered: 'R' },
                        when: { any: [] },
                    },
                ],
            },
        ],
    ])('rejects %s', (_label, change) => {
        const doc = {
            guide: {
                id: 'x',
                version: '1.0.0',
                name: 'X',
                target_schemes: [{ id: 'demo' }],
                rules: [],
                ...change,
            },
        };
        expect(validate(doc)).toBe(false);
    });

    it('accepts a computed rule whose when block nests conditions', () => {
        const doc = {
            guide: {
                id: 'x',
                version: '1.0.0',
                name: 'X',
                target_schemes: [{ id: 'demo' }],
                rules: [
                    {
                        id: 'combined',
                        name: 'Combined',
                        outcome: { rendered: 'C' },
                        when: {
                            all: [
                                { has: 'a' },
                                {
                                    any: [
                                        { has: 'b' },
                                        { operator: 'count_gte', value: 2 },
                                    ],
                                },
                            ],
                        },
                    },
                ],
            },
        };
        expect(validate(doc), JSON.stringify(validate.errors)).toBe(true);
    });

    it('rejects a document missing the top-level guide wrapper', () => {
        const doc = {
            id: 'x',
            version: '1.0.0',
            name: 'X',
            description: 'Desc',
            target_schemes: [{ id: 'demo' }],
            rules: [],
        };
        expect(validate(doc)).toBe(false);
    });
});

// ---------------------------------------------------------------------------
// Exported sub-schema structure
// ---------------------------------------------------------------------------

describe('guide-schema exports: sub-schema structure', () => {
    it('guideMetaSchema has id, version, name, description, target_schemes in its properties', () => {
        const props = guideMetaSchema.properties as Record<string, unknown>;
        expect(props).toHaveProperty('id');
        expect(props).toHaveProperty('version');
        expect(props).toHaveProperty('name');
        expect(props).toHaveProperty('description');
        expect(props).toHaveProperty('target_schemes');
    });

    it('guideRuleSchema exposes id, name, and outcome', () => {
        expect(guideRuleSchema).toHaveProperty('properties');
        const props = guideRuleSchema.properties as Record<string, unknown>;
        expect(props).toHaveProperty('id');
        expect(props).toHaveProperty('name');
        expect(props).toHaveProperty('outcome');
    });

    it('guideCategorySchema has id and label properties', () => {
        expect(guideCategorySchema).toHaveProperty('properties');
        const props = guideCategorySchema.properties as Record<string, unknown>;
        expect(props).toHaveProperty('id');
        expect(props).toHaveProperty('label');
    });

    it('guideDependencySchema is defined and has properties', () => {
        expect(guideDependencySchema).toHaveProperty('properties');
    });

    it('guideSchemaDefs carries guide_rule, guide_category, and scheme_dependency definitions', () => {
        const defs = guideSchemaDefs as Record<string, unknown>;
        expect(defs).toHaveProperty('guide_rule');
        expect(defs).toHaveProperty('guide_category');
        expect(defs).toHaveProperty('scheme_dependency');
    });
});
