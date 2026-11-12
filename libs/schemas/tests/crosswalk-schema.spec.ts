import { describe, it, expect } from 'vitest';
import Ajv2020 from 'ajv/dist/2020';
import { crosswalkSchema } from '../src/crosswalk-schema';

const validate = new Ajv2020({ strict: false }).compile(crosswalkSchema);

const crosswalk = {
    id: 'cvss-3-to-4',
    version: '1.0.0',
    name: 'CVSS 3.1 to 4.0',
    source_scheme: { id: 'cvss', version: '3.1.0' },
    target_scheme: { id: 'cvss', version: '4.0.0' },
    mappings: [
        {
            id: 'high',
            source: { category: 'severity', concept: 'HIGH' },
            targets: [
                {
                    category: 'severity',
                    concept: 'HIGH',
                },
            ],
            disposition: 'carry',
            reason: 'The score band is unchanged.',
        },
    ],
};

describe('crosswalkSchema: authored keys are snake_case', () => {
    it('accepts a crosswalk whose assertions name category and concept', () => {
        expect(validate({ crosswalk }), JSON.stringify(validate.errors)).toBe(
            true,
        );
    });

    it.each([
        ['sourceScheme', { sourceScheme: crosswalk.source_scheme }],
        ['targetScheme', { targetScheme: crosswalk.target_scheme }],
    ])('refuses the camelCase key %s', (_key, extra) => {
        const { source_scheme: _drop, ...rest } = crosswalk;
        expect(validate({ crosswalk: { ...rest, ...extra } })).toBe(false);
    });

    it('refuses an assertion that names categoryId and conceptId', () => {
        const mapping = {
            ...crosswalk.mappings[0],
            source: { categoryId: 'severity', conceptId: 'HIGH' },
        };
        expect(
            validate({ crosswalk: { ...crosswalk, mappings: [mapping] } }),
        ).toBe(false);
    });
});
