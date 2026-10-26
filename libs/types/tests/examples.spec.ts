/**
 * Validates the shipping YAML examples in libs/types/examples/ against their
 * canonical JSON schemas. A broken example catches format drift before it
 * reaches a published tarball.
 *
 * The layer examples are the read-aloud test made executable. Each one is a
 * document a reader should be able to say out loud ("this document is a layer
 * of the ACME quickmark guide; it adds ..."), and each is parsed, so the prose
 * in the contract and the shape the types describe cannot drift apart.
 *
 * Which schema does the parsing is worth being exact about, because the two are
 * not the same artifact. The four family layer examples go against the
 * generated input contracts in `libs/schemas/generated/json-schemas-input`,
 * which are derived from the published types and are what the language
 * generators consume, the Context examples included: the generated Context
 * schema is the one published. Guide and access layers get their v1 coverage
 * next door in `libs/schemas/tests`.
 *
 * Every example here is a whole document, so each one is validated against its
 * family's document schema rather than its body schema. Every family's
 * `*Definition` is the enveloped document.
 *
 * Schema sources:
 *
 * - Context →
 *   libs/schemas/generated/json-schemas-input/context-definition.schema.json
 * - Scheme →
 *   libs/schemas/generated/json-schemas-input/scheme-definition.schema.json
 * - Guide →
 *   libs/schemas/generated/json-schemas-input/guide-definition.schema.json
 * - Access → libs/schemas/generated/json-schemas-input/access-policy.schema.json
 * - Crosswalk →
 *   libs/schemas/generated/json-schemas-input/crosswalk-definition.schema.json
 */
import { describe, it, expect } from 'vitest';
import Ajv2020 from 'ajv/dist/2020';
import addFormats from 'ajv-formats';
import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';
import * as yaml from 'js-yaml';

const here = path.dirname(fileURLToPath(import.meta.url));
const distSchemasDir = path.resolve(
    here,
    '../../schemas/generated/json-schemas-input',
);
const examplesDir = path.resolve(here, '../examples');

function readSchema(
    dir: string,
    filename: string,
    stripSchemaKey = false,
): Record<string, unknown> {
    const parsed = JSON.parse(
        fs.readFileSync(path.join(dir, filename), 'utf-8'),
    ) as Record<string, unknown>;
    if (stripSchemaKey) {
        // Ajv2020 can't resolve a draft-07 $schema URI; remove it so the schema
        // is treated as a plain object (Ajv will validate using its own defaults).
        const { $schema: _, ...rest } = parsed;
        return rest;
    }
    return parsed;
}

function loadExample(filename: string): unknown {
    return yaml.load(
        fs.readFileSync(path.join(examplesDir, filename), 'utf-8'),
    );
}

function makeAjv(): Ajv2020 {
    const ajv = new Ajv2020({ allErrors: true, strict: false });
    addFormats(ajv);
    return ajv;
}

function assertValid(
    ajv: Ajv2020,
    schema: Record<string, unknown>,
    doc: unknown,
    label: string,
): void {
    const validate = ajv.compile(schema);
    const valid = validate(doc);
    if (!valid) {
        throw new Error(
            `${label} failed validation:\n${ajv.errorsText(validate.errors)}`,
        );
    }
}

describe('libs/types example YAML files', () => {
    it('scheme-with-sources.yaml validates against scheme-definition schema', () => {
        // draft-07 dist schema: strip $schema so Ajv2020 doesn't try to resolve it
        const schema = readSchema(
            distSchemasDir,
            'scheme-definition.schema.json',
            true,
        );
        const doc = loadExample('scheme-with-sources.yaml');
        expect(() =>
            assertValid(makeAjv(), schema, doc, 'scheme-with-sources.yaml'),
        ).not.toThrow();
    });

    it('guide-with-sources.yaml validates against guide-definition schema', () => {
        const schema = readSchema(
            distSchemasDir,
            'guide-definition.schema.json',
            true,
        );
        const doc = loadExample('guide-with-sources.yaml');
        expect(() =>
            assertValid(makeAjv(), schema, doc, 'guide-with-sources.yaml'),
        ).not.toThrow();
    });

    it('access-with-sources.yaml validates against access-policy schema', () => {
        const schema = readSchema(
            distSchemasDir,
            'access-policy.schema.json',
            true,
        );
        const doc = loadExample('access-with-sources.yaml');
        expect(() =>
            assertValid(makeAjv(), schema, doc, 'access-with-sources.yaml'),
        ).not.toThrow();
    });

    it('context-with-sources.yaml validates against context-definition schema', () => {
        const schema = readSchema(
            distSchemasDir,
            'context-definition.schema.json',
            true,
        );
        const doc = loadExample('context-with-sources.yaml');
        expect(() =>
            assertValid(makeAjv(), schema, doc, 'context-with-sources.yaml'),
        ).not.toThrow();
    });
});

describe('libs/types layer example YAML files', () => {
    const cases = [
        {
            example: 'scheme-layer.yaml',
            schema: 'scheme-definition.schema.json',
        },
        {
            example: 'crosswalk-layer.yaml',
            schema: 'crosswalk-definition.schema.json',
        },
        { example: 'guide-layer.yaml', schema: 'guide-definition.schema.json' },
        {
            example: 'access-layer.yaml',
            schema: 'access-policy.schema.json',
        },
    ] as const;

    for (const { example, schema: schemaFile } of cases) {
        it(`${example} validates against ${schemaFile}`, () => {
            const schema = readSchema(distSchemasDir, schemaFile, true);
            const doc = loadExample(example);
            expect(() =>
                assertValid(makeAjv(), schema, doc, example),
            ).not.toThrow();
        });
    }

    it('context-with-layers.yaml validates against context-definition schema', () => {
        const schema = readSchema(
            distSchemasDir,
            'context-definition.schema.json',
            true,
        );
        const doc = loadExample('context-with-layers.yaml');
        expect(() =>
            assertValid(makeAjv(), schema, doc, 'context-with-layers.yaml'),
        ).not.toThrow();
    });
});
