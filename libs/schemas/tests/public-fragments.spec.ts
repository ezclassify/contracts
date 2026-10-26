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
        valid: {
            case_sensitive: false,
            strip_whitespace: true,
            recognizers: [],
            normalize: [],
        },
        invalid: { case_sensitive: 'no' },
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
            type: 'alias',
            confidence: 'safe',
            explanation: 'Known spelling.',
        },
        invalid: {
            id: 'r',
            type: 'alias',
            confidence: 'certain',
            explanation: 'Known spelling.',
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
                license: 7,
            }),
        ).toBe(false);
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
            targetSchemes: [{ id: 'demo' }],
        };
        expect(validate(metadata), JSON.stringify(validate.errors)).toBe(true);
        expect(validate({ ...metadata, targetSchemes: undefined })).toBe(false);
        expect(validate({ ...metadata, targetSchemes: [{ id: 7 }] })).toBe(
            false,
        );
        expect(validate({ ...metadata, rules: {} })).toBe(false);
    });
});
