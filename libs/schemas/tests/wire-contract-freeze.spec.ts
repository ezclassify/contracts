import { describe, expect, it } from 'vitest';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

/**
 * # Input-schema freeze gate
 *
 * The generated input JSON-schemas
 * (`generated/json-schemas-input/*.schema.json`) are 1.0-locked public
 * contracts: every SDK, integrator, and Studio consumes them. The
 * schemas-freshness check proves generated snapshots match the current
 * TypeScript source; it does NOT stop the source itself from changing shape.
 * This gate does: it diffs a normalized projection against a reviewed,
 * checked-in golden, so any shape change: a new field, a renamed field, a
 * loosened enum: fails CI until someone deliberately regenerates the golden in
 * the same commit.
 *
 * The projection strips documentation fields so prose edits never trip the gate
 * (same philosophy as the engine's comment-stripped source-interface freeze):
 * `description` / `summary` / `example` / `examples` are documentation, not
 * contract. Everything else (properties, required-ness, enums, formats) is
 * frozen byte-for-byte in canonical key order.
 *
 * To accept a reviewed contract change: UPDATE_WIRE_CONTRACT=1 npx vitest run
 * tests/wire-contract-freeze.spec.ts (run from libs/schemas) then commit the
 * regenerated golden alongside the type change.
 *
 * The runtime holds a companion gate over the REST wire spec.
 */

const packageRoot = path.resolve(
    path.dirname(fileURLToPath(import.meta.url)),
    '..',
);
const generatedDir = path.join(packageRoot, 'generated');
const fixturesDir = path.join(packageRoot, 'tests', 'fixtures');

const DOC_KEYS = new Set(['description', 'summary', 'example', 'examples']);

/**
 * Strip documentation keys recursively and sort object keys so the projection
 * is stable regardless of generator emit order. Arrays keep their order:
 * `required` lists and enum member order are contract.
 */
function project(value: unknown): unknown {
    if (Array.isArray(value)) return value.map(project);
    if (value !== null && typeof value === 'object') {
        const out: Record<string, unknown> = {};
        for (const key of Object.keys(value as object).sort()) {
            if (DOC_KEYS.has(key)) continue;
            out[key] = project((value as Record<string, unknown>)[key]);
        }
        return out;
    }
    return value;
}

function loadInputSchemasProjection(): Record<string, unknown> {
    const inputDir = path.join(generatedDir, 'json-schemas-input');
    const out: Record<string, unknown> = {};
    for (const file of fs.readdirSync(inputDir).sort()) {
        if (!file.endsWith('.schema.json')) continue;
        out[file] = project(
            JSON.parse(fs.readFileSync(path.join(inputDir, file), 'utf8')),
        );
    }
    return out;
}

function goldenPath(name: string): string {
    return path.join(fixturesDir, name);
}

function checkAgainstGolden(name: string, current: unknown): void {
    const file = goldenPath(name);
    if (process.env.UPDATE_WIRE_CONTRACT === '1') {
        fs.mkdirSync(fixturesDir, { recursive: true });
        fs.writeFileSync(file, JSON.stringify(current, null, 4) + '\n');
    }
    const golden = JSON.parse(fs.readFileSync(file, 'utf8'));
    expect(
        current,
        `The 1.0-locked wire contract in '${name}' changed shape. Review the ` +
            'change deliberately, then regenerate the golden with ' +
            'UPDATE_WIRE_CONTRACT=1 and commit both together.',
    ).toEqual(golden);
}

describe('input JSON-schema freeze (scheme / guide / access / crosswalk / context)', () => {
    it('the full input-schema set matches the reviewed golden', () => {
        const current = loadInputSchemasProjection();
        // The set itself is contract: a definition schema appearing or
        // vanishing is as breaking as a field change.
        expect(Object.keys(current)).toEqual([
            'access-policy.schema.json',
            'context-definition.schema.json',
            'crosswalk-definition.schema.json',
            'guide-definition.schema.json',
            'scheme-definition.schema.json',
            'test-suite.schema.json',
        ]);
        checkAgainstGolden('input-schemas-contract.golden.json', current);
    });
});
