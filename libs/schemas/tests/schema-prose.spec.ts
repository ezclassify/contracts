import { describe, expect, it } from 'vitest';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

/**
 * Schema descriptions are lifted from the TSDoc comments in
 * `@ezclassify/types`. An inline tag such as `{@link X}` is editor markup: in a
 * published schema it reaches YAML editors, generated SDK docs and anyone
 * reading the file as literal braces. Comments on wire types name other types
 * in backticks instead.
 */

const packageRoot = path.resolve(
    path.dirname(fileURLToPath(import.meta.url)),
    '..',
);

const SCHEMA_DIRS = [
    'generated/json-schemas',
    'generated/json-schemas-input',
    'generated/validation/v1',
];

const INLINE_TAG = /\{@[A-Za-z]+[^}]*\}/;

/** Every `description` string in a parsed schema, with its JSON path. */
function descriptions(
    node: unknown,
    trail: string,
    out: Array<[string, string]> = [],
): Array<[string, string]> {
    if (node === null || typeof node !== 'object') return out;
    for (const [key, value] of Object.entries(node)) {
        const at = `${trail}/${key}`;
        if (key === 'description' && typeof value === 'string') {
            out.push([at, value]);
        } else {
            descriptions(value, at, out);
        }
    }
    return out;
}

/**
 * Keys whose subschemas select or exclude a value rather than declare one, and
 * keys that hold sample data. A conditional's `if` names a property only to
 * test it and a `not` only to forbid it; its `then` and `else` can declare
 * fields and are walked.
 */
const NOT_DECLARATIONS = new Set(['if', 'not', 'default', 'const', 'examples']);

/**
 * A bare map: an object schema whose only shape is the value type of its
 * entries. TypeScript's `Record<string,string>` becomes one, named after the
 * instantiation, and has no doc comment to lift; what a map means is said by
 * the property that holds it, and that property is checked.
 */
function isBareMap(definition: Record<string, unknown>): boolean {
    return (
        definition.type === 'object' &&
        definition.properties === undefined &&
        typeof definition.additionalProperties === 'object'
    );
}

/**
 * Every field a schema file leaves undescribed: its root, each definition other
 * than a bare map, and every property at any depth that has no
 * `description` of its own. Editors and SDK generators read the property's
 * text, so leaning on the referenced type's description still leaves the field
 * undocumented.
 */
function undescribed(schema: Record<string, unknown>, file: string): string[] {
    const out: string[] = [];
    const walk = (node: unknown, at: string): void => {
        if (node === null || typeof node !== 'object') return;
        if (Array.isArray(node)) {
            node.forEach((item, index) => walk(item, `${at}[${index}]`));
            return;
        }
        for (const [key, value] of Object.entries(node)) {
            if (NOT_DECLARATIONS.has(key)) continue;
            if (key === 'definitions' || key === '$defs') continue;
            if (key !== 'properties' || value === null || typeof value !== 'object') {
                walk(value, `${at}/${key}`);
                continue;
            }
            for (const [name, property] of Object.entries(value)) {
                const where = `${at}/properties/${name}`;
                const text = (property as { description?: unknown }).description;
                if (typeof text !== 'string' || !text.trim()) out.push(where);
                walk(property, where);
            }
        }
    };
    if (typeof schema.description !== 'string' || !schema.description.trim())
        out.push(file);
    walk(schema, file);
    const defs = (schema.definitions ?? schema.$defs ?? {}) as Record<
        string,
        Record<string, unknown>
    >;
    for (const [name, definition] of Object.entries(defs)) {
        const at = `${file}#/${name}`;
        const text = definition.description;
        if (!isBareMap(definition) && (typeof text !== 'string' || !text.trim()))
            out.push(at);
        walk(definition, at);
    }
    return out;
}

function readSchemas(dir: string): Array<[string, Record<string, unknown>]> {
    const root = path.join(packageRoot, dir);
    return fs
        .readdirSync(root)
        .filter((name) => name.endsWith('.schema.json'))
        .map((name) => [
            name,
            JSON.parse(fs.readFileSync(path.join(root, name), 'utf8')),
        ]);
}

describe('schema field descriptions', () => {
    for (const dir of SCHEMA_DIRS) {
        it(`${dir} describes every field`, () => {
            const schemas = readSchemas(dir);
            expect(schemas.length).toBeGreaterThan(0);
            expect(
                schemas.flatMap(([name, schema]) => undescribed(schema, name)),
            ).toEqual([]);
        });
    }

    it('names a property, a definition and a root that go undescribed', () => {
        const schema = {
            properties: {
                kept: { description: 'Kept.', type: 'string' },
                bare: { $ref: '#/definitions/Described' },
            },
            definitions: {
                Described: { description: 'Has one.', type: 'object' },
                Bare: {
                    type: 'object',
                    properties: {
                        nested: { type: 'object', properties: { leaf: {} } },
                    },
                },
                'Record<string,string>': {
                    type: 'object',
                    additionalProperties: { type: 'string' },
                },
            },
            if: { properties: { selector: { const: 'x' } } },
        };
        expect(undescribed(schema, 'planted.schema.json')).toEqual([
            'planted.schema.json',
            'planted.schema.json/properties/bare',
            'planted.schema.json#/Bare',
            'planted.schema.json#/Bare/properties/nested',
            'planted.schema.json#/Bare/properties/nested/properties/leaf',
        ]);
    });
});

describe('schema prose', () => {
    for (const dir of SCHEMA_DIRS) {
        it(`${dir} carries no TSDoc inline tags`, () => {
            const root = path.join(packageRoot, dir);
            const files = fs
                .readdirSync(root)
                .filter((name) => name.endsWith('.schema.json'));
            expect(files.length).toBeGreaterThan(0);
            const tagged = files.flatMap((name) =>
                descriptions(
                    JSON.parse(fs.readFileSync(path.join(root, name), 'utf8')),
                    name,
                )
                    .filter(([, text]) => INLINE_TAG.test(text))
                    .map(([at, text]) => `${at}: ${INLINE_TAG.exec(text)?.[0]}`),
            );
            expect(tagged).toEqual([]);
        });
    }
});
