import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import Ajv2020, { type ValidateFunction } from 'ajv/dist/2020.js';
import addFormats from 'ajv-formats';
import { describe, expect, it } from 'vitest';

/**
 * A snapshot id is a promise of byte-for-byte replay. A best-effort source
 * observation cannot make that promise, so a best-effort reference that carried
 * one would claim a reproducibility the source never had, and a consumer
 * reading the reference would have no way to tell the claim from a real one.
 *
 * The published types say this with `snapshotId?: never` on the best-effort
 * branch. Response-reachable schemas are open to fields they do not declare, so
 * the generator restates it as a conditional, which openness leaves alone. This
 * is the test that the restatement is real: TypeScript is not what an SDK in
 * another language validates against.
 *
 * The JSON document, not the YAML: it is the machine-readable copy, and parsing
 * it needs nothing this package does not already depend on.
 */
const specPath = path.resolve(
    path.dirname(fileURLToPath(import.meta.url)),
    '..',
    '..',
    'openapi',
    'openapi.json',
);

const spec = JSON.parse(readFileSync(specPath, 'utf8')) as Record<
    string,
    unknown
>;

/**
 * Compile one component schema out of the assembled document. The whole
 * document is registered so `$ref`s between components resolve the way a
 * generated client's validator resolves them; `strict: false` is for the
 * OpenAPI-only keywords (`nullable`, `discriminator`) Ajv does not know.
 */
function componentValidator(name: string): ValidateFunction {
    const ajv = new Ajv2020({ strict: false, allErrors: true });
    addFormats(ajv);
    ajv.addSchema({ ...spec, $id: 'ezclassify-openapi' });
    return ajv.compile({
        $ref: `ezclassify-openapi#/components/schemas/${name}`,
    });
}

const attribution = {
    name: 'Example source',
    license: 'unspecified',
};

describe('SourceReference', () => {
    const validate = componentValidator('SourceReference');

    it('accepts a best-effort reference without a snapshot id', () => {
        expect(
            validate({
                providerId: 'example-provider',
                reproducibility: 'best-effort',
                locator: 'https://example.test/policy',
                attribution,
            }),
        ).toBe(true);
    });

    it('rejects a best-effort reference carrying a snapshot id', () => {
        expect(
            validate({
                providerId: 'example-provider',
                reproducibility: 'best-effort',
                snapshotId: 'sha256:0000',
                attribution,
            }),
        ).toBe(false);
    });

    it('accepts a reproducible reference carrying a snapshot id', () => {
        expect(
            validate({
                providerId: 'example-provider',
                reproducibility: 'reproducible',
                snapshotId: 'sha256:0000',
                attribution,
            }),
        ).toBe(true);
    });

    /**
     * The openness the conditional had to survive. An unknown field on a
     * response body is accepted so an additive runtime change is not a breaking
     * change for a client generated before it.
     */
    it('still accepts a field it does not declare', () => {
        expect(
            validate({
                providerId: 'example-provider',
                reproducibility: 'best-effort',
                attribution,
                observedAt: '2026-01-01T00:00:00Z',
            }),
        ).toBe(true);
    });
});

describe('RuleSourceReference', () => {
    const validate = componentValidator('RuleSourceReference');

    it('accepts a best-effort join without a snapshot id', () => {
        expect(
            validate({
                providerId: 'example-provider',
                reproducibility: 'best-effort',
            }),
        ).toBe(true);
    });

    it('rejects a best-effort join carrying a snapshot id', () => {
        expect(
            validate({
                providerId: 'example-provider',
                reproducibility: 'best-effort',
                snapshotId: 'sha256:0000',
            }),
        ).toBe(false);
    });

    it('accepts a reproducible join carrying a snapshot id', () => {
        expect(
            validate({
                providerId: 'example-provider',
                reproducibility: 'reproducible',
                snapshotId: 'sha256:0000',
            }),
        ).toBe(true);
    });

    it('still accepts a field it does not declare', () => {
        expect(
            validate({
                providerId: 'example-provider',
                reproducibility: 'best-effort',
                observedAt: '2026-01-01T00:00:00Z',
            }),
        ).toBe(true);
    });
});
