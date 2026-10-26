import { describe, expect, it } from 'vitest';
import { validationSchema } from '../validation-schema.mjs';

// Schema instance data can contain a property named $ref. Publishing a
// different dialect must rewrite references only where a schema is expected.
describe('validation schema generation', () => {
    it('preserves literal reference properties and the raw input export', () => {
        const literal = { $ref: '#/definitions/Literal' };
        const input = {
            $schema: 'http://json-schema.org/draft-07/schema#',
            properties: {
                value: { $ref: '#/definitions/Value' },
                literal: { const: literal, default: literal, examples: [literal] },
            },
            definitions: { Value: { type: 'string', enum: [literal] } },
        };
        const before = structuredClone(input);
        const output = validationSchema('crosswalk', input);
        expect(output.properties.value.$ref).toBe('#/$defs/Value');
        expect(output.properties.literal).toEqual(input.properties.literal);
        expect(output.$defs.Value.enum).toEqual([literal]);
        expect(input).toEqual(before);
    });
});
