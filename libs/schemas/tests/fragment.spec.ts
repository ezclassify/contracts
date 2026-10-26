import { describe, expect, it } from 'vitest';
import { schemaReader } from '../src/fragment';

const bundled = {
    properties: { thing: { $ref: '#/definitions/Thing' } },
    definitions: {
        Thing: {
            type: 'object',
            required: ['id'],
            properties: {
                id: { type: 'string' },
                parts: { type: 'array', items: { $ref: '#/definitions/Part' } },
                bare: { type: 'array' },
                stray: { $ref: '#/definitions/Missing' },
            },
        },
        Part: { type: 'object', properties: { name: { type: 'string' } } },
    },
};

describe('schemaReader', () => {
    const reader = schemaReader(bundled, 'definitions', 'test.schema.json');
    const thing = reader.properties(bundled, 'the root').thing;
    const props = reader.properties(thing, 'thing');

    it('follows a local $ref to the definition it names', () => {
        expect(reader.resolve(thing, 'thing')).toBe(bundled.definitions.Thing);
        expect(reader.required(thing, 'thing')).toEqual(['id']);
        expect(reader.items(props.parts, 'thing.parts')).toBe(
            bundled.definitions.Part,
        );
    });

    it('refuses to load when a fragment node is missing', () => {
        expect(() => reader.resolve(props.absent, 'thing.absent')).toThrow(
            'test.schema.json: thing.absent is missing',
        );
        expect(() => reader.items(props.bare, 'thing.bare')).toThrow(
            'thing.bare[] is missing',
        );
        expect(() => reader.properties(props.id, 'thing.id')).toThrow(
            'thing.id declares no properties',
        );
        expect(() => reader.required(props.parts, 'thing.parts')).toThrow(
            'thing.parts declares no required list',
        );
    });

    it('refuses to load when a $ref names no definition', () => {
        expect(() => reader.resolve(props.stray, 'thing.stray')).toThrow(
            'has no definition named "Missing"',
        );
        expect(() =>
            reader.resolve({ $ref: '#/$defs/Thing' }, 'thing.other'),
        ).toThrow('$ref outside #/definitions/');
    });

    it('refuses a schema without the named definitions object', () => {
        expect(() =>
            schemaReader(bundled, '$defs', 'test.schema.json'),
        ).toThrow('test.schema.json: has no `$defs` object');
    });
});
