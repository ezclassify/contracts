import { describe, expect, it } from 'vitest';
import Ajv from 'ajv';
import { readFileSync } from 'node:fs';
import type { TestSuite } from '../src/test-suite.js';

const root = new URL(
    '../../schemas/generated/json-schemas-input/test-suite.schema.json',
    import.meta.url,
);
const schema = JSON.parse(readFileSync(root, 'utf8'));
const validate = new Ajv({ strict: false }).compile(schema);
const suite: TestSuite = {
    apiVersion: 'schemes.ezclassify.com/v1',
    id: 'baseline',
    version: '1.0.0',
    composition: {
        scheme: { id: 'sample', version: '1.0.0' },
        guides: [
            {
                id: 'topics',
                version: '1.0.0',
                layers: [{ id: 'agency-topics', version: '2.0.0' }],
            },
        ],
        access: {
            id: 'readers',
            version: '1.0.0',
            layers: [{ id: 'agency-readers', version: '1.0.0' }],
        },
    },
    cases: [
        {
            id: 'one',
            operation: 'process',
            input: { marking: '' },
            assertions: [
                { path: ['valid'], matcher: 'equals', value: false },
                {
                    path: ['errors'],
                    matcher: 'contains',
                    value: { constraintId: 'required' },
                },
            ],
        },
    ],
};

describe('portable test-suite contract', () => {
    it('carries ordinary result assertions and operation-native options', () => {
        const value: TestSuite = structuredClone(suite);
        value.cases[0].options = {
            inputFormat: 'banner',
            parts: ['(L)'],
        };
        value.cases[0].assertions = [
            { path: ['rendered'], matcher: 'exists' },
            { path: ['rendered'], matcher: 'equals', value: '' },
            { path: ['rendered'], matcher: 'notEquals', value: 'SECRET' },
            { path: ['errors'], matcher: 'excludes', value: { code: 'other' } },
            { path: ['recognition', 'status'], matcher: 'absent' },
        ];
        expect(validate(value), JSON.stringify(validate.errors)).toBe(true);
    });
    it('refuses an option that asks the engine to settle less', () => {
        const withOptions = (options: object): unknown => ({
            ...suite,
            cases: [{ ...suite.cases[0], options }],
        });
        for (const options of [
            { normalization: 'strict' },
            { skipInference: true },
            { skipRepair: true },
            { fix: false },
            { preserveDeprecated: true },
        ]) {
            expect(
                validate(withOptions(options)),
                JSON.stringify(options),
            ).toBe(false);
        }
        // Negative control: an option that says what the marking is judged
        // as, not how it is settled.
        expect(
            validate(withOptions({ parts: ['(L)'] })),
            JSON.stringify(validate.errors),
        ).toBe(true);
    });
    it('requires assertions and comparison values, and refuses values for presence checks', () => {
        const values = [
            [],
            [{ path: ['rendered'], matcher: 'equals' }],
            [{ path: ['rendered'], matcher: 'exists', value: '' }],
        ];
        for (const assertions of values) {
            expect(
                validate({
                    ...suite,
                    cases: [{ ...suite.cases[0], assertions }],
                }),
            ).toBe(false);
            expect(
                validate({
                    ...suite,
                    overrides: {
                        one: { reason: 'Changed expectation', assertions },
                    },
                }),
            ).toBe(false);
        }
    });
    it('does not admit executable code or a nested assertion language', () => {
        for (const assertion of [
            { path: ['rendered'], matcher: 'some', checks: [] },
            {
                path: ['rendered'],
                matcher: 'equals',
                value: '',
                project: ['value'],
            },
        ]) {
            expect(
                validate({
                    ...suite,
                    cases: [{ ...suite.cases[0], assertions: [assertion] }],
                }),
            ).toBe(false);
        }
    });
    it('keeps the report composition a named object for SDK generators', () => {
        const reportSchema = JSON.parse(
            readFileSync(
                new URL(
                    '../../schemas/generated/json-schemas-test/test-suite-run.schema.json',
                    import.meta.url,
                ),
                'utf8',
            ),
        );
        expect(reportSchema.definitions.TestComposition.type).toBe('object');
        expect(
            Object.keys(
                reportSchema.definitions.TestComposition.properties,
            ).sort(),
        ).toEqual(['access', 'crosswalks', 'guides', 'scheme']);
    });
    it('generates the inline Context-shaped composition without losing policy layers', () => {
        expect(validate(suite), JSON.stringify(validate.errors)).toBe(true);
    });
    it('admits the purpose-split operations with their own inputs and options', () => {
        const cases: TestSuite['cases'] = [
            {
                id: 'reader',
                operation: 'validate',
                input: { marking: 'LEVEL-HIGH' },
                options: { outputFormat: 'short' },
                assertions: [
                    { path: ['valid'], matcher: 'equals', value: true },
                    { path: ['inputWasValid'], matcher: 'equals', value: true },
                    { path: ['rendered'], matcher: 'equals', value: 'H' },
                ],
            },
            {
                id: 'reader-facts',
                operation: 'validate',
                input: {
                    assertions: [
                        {
                            conceptId: 'level-high',
                            categoryId: 'level',
                            confidence: 'certain',
                            source: 'stated',
                        },
                    ],
                },
                assertions: [
                    { path: ['valid'], matcher: 'equals', value: true },
                ],
            },
            {
                id: 'author',
                operation: 'process',
                input: { marking: 'level-high' },
                options: {
                    outputs: ['level/short'],
                    suggestFor: ['audience'],
                },
                assertions: [
                    {
                        path: ['renders', 'level/short', 'rendered'],
                        matcher: 'equals',
                        value: 'H',
                    },
                    { path: ['suggestionsFor', 'audience'], matcher: 'exists' },
                ],
            },
            {
                id: 'why',
                operation: 'explain',
                input: { marking: 'LEVEL-HIGH' },
                assertions: [{ path: ['inferences'], matcher: 'exists' }],
            },
            {
                id: 'pickers',
                operation: 'suggestForCategories',
                input: { assertions: [], categoryIds: ['level', 'audience'] },
                assertions: [{ path: ['level'], matcher: 'exists' }],
            },
        ];
        expect(
            validate({ ...suite, cases }),
            JSON.stringify(validate.errors),
        ).toBe(true);
        // Negative control: an operation the contract does not define is
        // refused.
        expect(
            validate({
                ...suite,
                cases: [{ ...cases[4], operation: 'notAnOperation' }],
            }),
        ).toBe(false);
    });
    it('keeps the native result for every operation a suite can name', () => {
        const results = JSON.parse(
            readFileSync(
                new URL(
                    '../../schemas/generated/json-schemas-test/test-operation-results.schema.json',
                    import.meta.url,
                ),
                'utf8',
            ),
        );
        const operations = schema.definitions.TestOperation.enum as string[];
        expect(Object.keys(results.properties).sort()).toEqual(
            [...operations].sort(),
        );
        expect(results.properties.validate.$ref).toBe(
            '#/definitions/ValidateResult',
        );
        expect(results.properties.explain.$ref).toBe(
            '#/definitions/ExplanationTrace',
        );
        // The fields shipped suites assert most stay on the process result.
        const processed = results.definitions.ProcessResult;
        expect(processed.required).toEqual(
            expect.arrayContaining(['rendered', 'valid', 'inputWasValid']),
        );
        // Expectations are authored input, so the contract they are checked
        // against stays closed while the published result schemas are open:
        // an expectation cannot name a field no result has.
        expect(results.definitions.ValidateResult.additionalProperties).toBe(
            false,
        );
        const published = JSON.parse(
            readFileSync(
                new URL(
                    '../../schemas/generated/json-schemas/validate-result.schema.json',
                    import.meta.url,
                ),
                'utf8',
            ),
        );
        expect(
            published.definitions?.ValidateResult?.additionalProperties ??
                published.additionalProperties,
        ).toBeUndefined();
    });
    it('refuses unknown suite fields and invalid operation names', () => {
        expect(validate({ ...suite, executable: '/tmp/run' })).toBe(false);
        expect(
            validate({
                ...suite,
                cases: [{ ...suite.cases[0], operation: 'execute' }],
            }),
        ).toBe(false);
    });
    it('keeps overrides separate from case inputs', () => {
        expect(
            validate({
                apiVersion: suite.apiVersion,
                id: 'child',
                version: '1.0.0',
                extends: { id: suite.id, version: suite.version },
                overrides: {
                    one: {
                        reason: 'This policy retires the concept.',
                        assertions: [
                            {
                                path: ['valid'],
                                matcher: 'equals',
                                value: false,
                            },
                        ],
                    },
                },
                cases: [],
            }),
        ).toBe(true);
        expect(
            validate({
                apiVersion: suite.apiVersion,
                id: 'child',
                version: '1.0.0',
                extends: { id: suite.id, version: suite.version },
                overrides: {
                    one: {
                        reason: 'Changed',
                        input: { marking: 'rewritten' },
                        assertions: [
                            { path: ['valid'], matcher: 'equals', value: true },
                        ],
                    },
                },
                cases: [],
            }),
        ).toBe(false);
    });
});
