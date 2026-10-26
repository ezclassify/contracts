import { describe, it, expect } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';

const generatedRoot = path.resolve(
    path.dirname(fileURLToPath(import.meta.url)),
    '../generated',
);
const schemasRoot = path.join(generatedRoot, 'json-schemas');
/**
 * Expected result schema file names: one per engine result type a REST client
 * receives. The SDKs generate their result types from exactly this set.
 */
const EXPECTED_SCHEMAS = [
    'validate-result.schema.json',
    'process-result.schema.json',
    'aggregate-result.schema.json',
    'diff-result.schema.json',
    'assertion.schema.json',
    'validation-error.schema.json',
    'fix.schema.json',
    'change.schema.json',
    'warning.schema.json',
    'suggestion.schema.json',
    'suggest-result.schema.json',
    'trace-entry.schema.json',
    'explanation-trace.schema.json',
    'scan-limits.schema.json',
    'scan-result.schema.json',
    'access-rule-result.schema.json',
    'access-decision.schema.json',
    'category-access-result.schema.json',
    'guide-breakdown-entry.schema.json',
    'evaluation-result.schema.json',
    'guide-scan-span.schema.json',
    'guide-scan-result.schema.json',
    'crosswalk-translation-result.schema.json',
];

describe('@ezclassify/schemas generated spec bundle', () => {
    it('generated/json-schemas/ directory exists', () => {
        expect(fs.existsSync(schemasRoot)).toBe(true);
    });

    for (const filename of EXPECTED_SCHEMAS) {
        it(`generated/json-schemas/${filename} is valid JSON with $schema field`, () => {
            const filePath = path.join(schemasRoot, filename);
            expect(
                fs.existsSync(filePath),
                `${filename} missing from generated/json-schemas/`,
            ).toBe(true);

            const raw = fs.readFileSync(filePath, 'utf8');
            let parsed: unknown;
            expect(() => {
                parsed = JSON.parse(raw);
            }, `${filename} is not valid JSON`).not.toThrow();

            const schema = parsed as Record<string, unknown>;
            expect(
                typeof schema.$schema,
                `${filename} missing $schema field`,
            ).toBe('string');
        });
    }

    it('no unexpected files in generated/json-schemas/', () => {
        const actual = fs.readdirSync(schemasRoot).sort();
        const expected = EXPECTED_SCHEMAS.slice().sort();
        expect(actual).toEqual(expected);
    });

    it('keeps the scheme test runner output in its own set', () => {
        expect(
            fs.readdirSync(path.join(generatedRoot, 'json-schemas-test')).sort(),
        ).toEqual([
            'test-operation-results.schema.json',
            'test-suite-run.schema.json',
        ]);
    });
});
