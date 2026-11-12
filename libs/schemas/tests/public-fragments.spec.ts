import { describe, expect, it } from 'vitest';
import Ajv from 'ajv';
import Ajv2020 from 'ajv/dist/2020';
import {
    categorySchema,
    conceptSchema,
    grammarSchema,
    recognizerSchema,
    renderFormatSchema,
    schemeMetaSchema,
    schemeRuleSchema,
    guideMetaSchema,
    guideRuleSchema,
    accessMetaSchema,
    accessRuleSchema,
    crosswalkMappingSchema,
} from '../src/index';
import { repairRuleSchema, rollupPipelineSchema } from '../src/scheme-schema';

const schemeFragments = [
    {
        name: 'concept',
        schema: conceptSchema,
        valid: {
            id: 'LOW',
            name: 'Low',
            views: { default: 'LOW' },
            categories: ['level'],
        },
        invalid: { id: 'LOW', name: 'Low', categories: ['level'] },
    },
    {
        name: 'category',
        schema: categorySchema,
        valid: { id: 'level', label: 'Level', rollup: 'max' },
        invalid: { id: 'level', label: 'Level', rollup: 'invented' },
    },
    {
        name: 'recognizer',
        schema: recognizerSchema,
        valid: { id: 'r', pattern: 'x', format: 'default', binds: [] },
        invalid: {
            id: 'r',
            pattern: 'x',
            format: 'default',
            binds: [{ group: '1', field: 'level' }],
        },
    },
    {
        name: 'render format',
        schema: renderFormatSchema,
        valid: { id: 'default', surface: 'whole', mode: 'inline', fields: [] },
        invalid: { id: 'default', surface: 'whole', mode: 'grid', fields: [] },
    },
    {
        name: 'scheme metadata',
        schema: schemeMetaSchema,
        valid: { id: 'demo', version: '1.0.0', name: 'Demo' },
        invalid: { id: 'demo', version: '1.0.0' },
    },
    {
        name: 'grammar',
        schema: grammarSchema,
        valid: { recognizers: [], normalize: [] },
        invalid: { recognizers: 'none' },
    },
    {
        name: 'scheme rule',
        schema: schemeRuleSchema,
        valid: { id: 'r', action: 'forbid', target: 'x' },
        invalid: { id: 'r', action: 'invented' },
    },
    {
        name: 'rollup pipeline',
        schema: rollupPipelineSchema,
        valid: { id: 'r', categories: ['level'], steps: [] },
        invalid: { id: 'r', categories: 3, steps: [] },
    },
    {
        name: 'repair rule',
        schema: repairRuleSchema,
        valid: {
            id: 'r',
            type: 'dedup',
            explanation: 'A token is written once.',
        },
        invalid: {
            id: 'r',
            type: 'separator',
            explanation: 'A token is written once.',
        },
    },
] as const;

describe('public scheme fragments', () => {
    it.each(schemeFragments)(
        '$name compiles and validates in isolation',
        ({ schema, valid, invalid }) => {
            const validate = new Ajv({ strict: false }).compile(schema);
            expect(validate(valid), JSON.stringify(validate.errors)).toBe(true);
            expect(validate(invalid)).toBe(false);
        },
    );

    it('scheme metadata excludes complete document sections', () => {
        const validate = new Ajv({ strict: false }).compile(schemeMetaSchema);
        expect(validate({ id: 'demo', version: '1.0.0', name: 'Demo' })).toBe(
            true,
        );
        expect(
            validate({ id: 'demo', version: '1.0.0', name: 'Demo', data: {} }),
        ).toBe(false);
        expect(
            validate({ id: 'demo', version: '1.0.0', name: 'Demo', parse: {} }),
        ).toBe(false);
        expect(
            validate({
                id: 'demo',
                version: '1.0.0',
                name: 'Demo',
                description: 7,
            }),
        ).toBe(false);
    });

    it('scheme metadata carries the whole marking and the scheme it is written in', () => {
        const validate = new Ajv({ strict: false }).compile(schemeMetaSchema);
        const meta = { id: 'demo', version: '1.0.0', name: 'Demo' };
        for (const marking_scheme of ['self', { id: 'other', version: '2.0.0' }])
            expect(
                validate({ ...meta, marking_scheme, marking: 'HIGH' }),
                JSON.stringify(validate.errors),
            ).toBe(true);
        expect(validate({ ...meta, marking: 7 })).toBe(false);
        expect(validate({ ...meta, marking_scheme: 'other' })).toBe(false);
    });
});

describe('public guide metadata fragment', () => {
    it('compiles, accepts metadata with target dependencies, and rejects missing dependencies', () => {
        const validate = new Ajv2020({ strict: false }).compile(
            guideMetaSchema,
        );
        const metadata = {
            id: 'guide',
            version: '1.0.0',
            name: 'Guide',
            description: 'Example',
            target_schemes: [{ id: 'demo' }],
        };
        expect(validate(metadata), JSON.stringify(validate.errors)).toBe(true);
        expect(validate({ ...metadata, target_schemes: undefined })).toBe(false);
        expect(validate({ ...metadata, target_schemes: [{ id: 7 }] })).toBe(
            false,
        );
        expect(validate({ ...metadata, rules: {} })).toBe(false);
    });

    it('carries the whole marking and refuses self as its marking scheme', () => {
        const validate = new Ajv2020({ strict: false }).compile(
            guideMetaSchema,
        );
        const metadata = {
            id: 'guide',
            version: '1.0.0',
            name: 'Guide',
            target_schemes: [{ id: 'demo' }],
        };
        expect(
            validate({
                ...metadata,
                marking: 'HIGH',
                marking_scheme: { id: 'other', version: '2.0.0' },
            }),
            JSON.stringify(validate.errors),
        ).toBe(true);
        expect(validate({ ...metadata, marking: 7 })).toBe(false);
        expect(validate({ ...metadata, marking_scheme: 'self' })).toBe(false);
    });
});

describe('public access metadata fragment', () => {
    it('carries the whole marking and refuses self as its marking scheme', () => {
        const validate = new Ajv({ strict: false }).compile(accessMetaSchema);
        const metadata = { id: 'policy', target_scheme: { id: 'demo' } };
        expect(
            validate({
                ...metadata,
                marking: 'HIGH',
                marking_scheme: { id: 'other' },
            }),
            JSON.stringify(validate.errors),
        ).toBe(true);
        expect(validate({ ...metadata, marking: 7 })).toBe(false);
        expect(validate({ ...metadata, marking_scheme: 'self' })).toBe(false);
    });
});

describe('public part-marking fragments', () => {
    const parts = [
        {
            name: 'guide rule',
            compile: () =>
                new Ajv2020({ strict: false }).compile(guideRuleSchema),
            valid: { id: 'r', name: 'R', outcome: { rendered: 'HIGH' } },
        },
        {
            name: 'access rule',
            compile: () =>
                new Ajv({ strict: false }).compile(accessRuleSchema),
            valid: { id: 'r', name: 'R' },
        },
        {
            name: 'crosswalk mapping',
            compile: () =>
                new Ajv2020({ strict: false }).compile(crosswalkMappingSchema),
            valid: {
                id: 'm',
                source: { category: 'level', concept: 'LOW' },
                disposition: 'omit',
                reason: 'Dropped.',
            },
        },
    ];

    it.each(parts)('$name takes a text marking', ({ compile, valid }) => {
        const validate = compile();
        expect(validate(valid), JSON.stringify(validate.errors)).toBe(true);
        expect(validate({ ...valid, marking: 'LOW' })).toBe(true);
        expect(validate({ ...valid, marking: 7 })).toBe(false);
    });
});
