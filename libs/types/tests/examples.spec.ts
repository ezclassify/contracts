/**
 * Validates the shipping YAML examples in libs/types/examples/ against the
 * published document schema for their kind. A broken example catches format
 * drift before it reaches a published tarball.
 *
 * The layer examples are the read-aloud test made executable. Each one is a
 * document a reader should be able to say out loud ("this document is a layer
 * of the ACME quickmark guide; it adds ..."), and each is parsed, so the prose
 * in the contract and the shape the types describe cannot drift apart.
 *
 * The schemas are the validation set in
 * `libs/schemas/generated/validation/v1/<kind>.schema.json`, one per document
 * kind, generated from the published `*Definition` types. Every example is a
 * whole document, so it is checked against its kind's document schema.
 */
import { describe, it, expect } from 'vitest';
import Ajv2020 from 'ajv/dist/2020';
import addFormats from 'ajv-formats';
import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';
import * as yaml from 'js-yaml';

const here = path.dirname(fileURLToPath(import.meta.url));
const validationDir = path.resolve(
    here,
    '../../schemas/generated/validation/v1',
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

const examples = [
    { example: 'scheme-with-import.yaml', kind: 'scheme' },
    { example: 'scheme-layer.yaml', kind: 'scheme' },
    { example: 'guide.yaml', kind: 'guide' },
    { example: 'guide-layer.yaml', kind: 'guide' },
    { example: 'access.yaml', kind: 'access' },
    { example: 'access-layer.yaml', kind: 'access' },
    { example: 'crosswalk-layer.yaml', kind: 'crosswalk' },
    { example: 'context.yaml', kind: 'context' },
    { example: 'context-with-layers.yaml', kind: 'context' },
] as const;

describe('libs/types example YAML files', () => {
    it('covers every shipped example', () => {
        expect(
            fs
                .readdirSync(examplesDir)
                .filter((file) => file.endsWith('.yaml'))
                .sort(),
        ).toEqual(examples.map(({ example }) => example).sort());
    });

    for (const { example, kind } of examples) {
        it(`${example} validates against the ${kind} document schema`, () => {
            // draft-07 schema: strip $schema so Ajv2020 doesn't try to resolve it
            const schema = readSchema(
                validationDir,
                `${kind}.schema.json`,
                true,
            );
            const doc = loadExample(example);
            expect(() =>
                assertValid(makeAjv(), schema, doc, example),
            ).not.toThrow();
        });
    }
});
