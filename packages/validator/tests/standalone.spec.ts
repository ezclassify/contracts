import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { describe, expect, it } from 'vitest';
// @ts-expect-error -- the validator ships as plain ESM JavaScript, no types.
import { validateAccessDocument } from '../src/access.mjs';
// @ts-expect-error -- the validator ships as plain ESM JavaScript, no types.
import { validateGuideDocument } from '../src/guide.mjs';
// @ts-expect-error -- the validator ships as plain ESM JavaScript, no types.
import { validateSchemeDocument, validateSchemeShape } from '../src/scheme.mjs';

const packageRoot = path.resolve(
    path.dirname(fileURLToPath(import.meta.url)),
    '..',
);

function authoredScheme() {
    return {
        scheme: {
            id: 'raw-validation',
            version: '1.0.0',
            name: 'Raw validation',
            data: {
                categories: [{ id: 'level', label: 'Level', rollup: 'max' }],
                concepts: {
                    inline: [
                        {
                            id: 'LOW',
                            name: 'Low',
                            categories: ['level'],
                            views: { default: 'LOW' },
                        },
                    ],
                },
            },
            rules: [],
            parse: {},
            render: {
                default: 'banner',
                formats: [
                    {
                        id: 'banner',
                        surface: 'banner',
                        mode: 'inline',
                        fields: [{ category: 'level' }],
                    },
                ],
            },
        },
    };
}

describe('standalone raw-document validators', () => {
    it('are fresh outputs of the canonical schemas', () => {
        expect(() =>
            execFileSync(
                process.execPath,
                [
                    path.join(packageRoot, 'scripts/generate-standalone.mjs'),
                    '--check',
                ],
                { stdio: 'pipe' },
            ),
        ).not.toThrow();
    });

    it('contain no Node import or runtime code generation', () => {
        for (const kind of [
            'scheme',
            'guide',
            'access',
            'context',
            'crosswalk',
        ]) {
            const source = readFileSync(
                path.join(packageRoot, `src/generated/${kind}.validator.mjs`),
                'utf8',
            );
            expect(source).not.toMatch(
                /\brequire\(|\bimport\(|\bnew Function\b|\beval\(|node:/,
            );
        }
    });

    it('imports and validates when eval and Function are blocked', () => {
        const moduleUrl = pathToFileURL(
            path.join(packageRoot, 'src/scheme.mjs'),
        ).href;
        const program = `
            globalThis.eval = () => { throw new Error('eval blocked'); };
            globalThis.Function = function () { throw new Error('Function blocked'); };
            const { validateSchemeDocument } = await import(${JSON.stringify(moduleUrl)});
            const result = validateSchemeDocument({ scheme: {} });
            if (result.ok || result.errors.length === 0) process.exit(1);
        `;
        expect(() =>
            execFileSync(
                process.execPath,
                ['--input-type=module', '--eval', program],
                { stdio: 'pipe' },
            ),
        ).not.toThrow();
    });

    it('rejects unknown envelope fields while preserving nested host metadata', () => {
        const document = authoredScheme();
        Object.assign(document.scheme, {
            ui: { host_panel: { enabled: true } },
        });
        Object.assign(document.scheme.data.concepts.inline[0], {
            metadata: { host_record: { key: 'LOW' } },
        });
        expect(validateSchemeDocument(document).ok).toBe(true);
        expect(validateSchemeShape(document).ok).toBe(true);

        const unknownEnvelope = { ...document, unexpected_field: true };
        const result = validateSchemeDocument(unknownEnvelope);
        expect(result.ok).toBe(false);
        expect(validateSchemeShape(unknownEnvelope).ok).toBe(false);
        expect(result.errors).toContainEqual(
            expect.objectContaining({
                keyword: 'additionalProperties',
                path: '',
                params: { additionalProperty: 'unexpected_field' },
            }),
        );
    });

    it('rejects unknown deep keys before a mapper can discard them', () => {
        const document = authoredScheme();
        document.scheme.render.formats[0].fields[0].unknown_binding = true;
        const result = validateSchemeDocument(document);
        expect(result.ok).toBe(false);
        expect(result.errors).toContainEqual(
            expect.objectContaining({
                keyword: 'additionalProperties',
                path: '/scheme/render/formats/0/fields/0',
                params: { additionalProperty: 'unknown_binding' },
            }),
        );
    });

    it('enforces deep codec discriminants and nested conditions', () => {
        const codecDocument = authoredScheme();
        codecDocument.scheme.data.concepts.inline[0].text_input = {
            encoding: {
                type: 'calendar-date',
                canonical: 'YYYYMMDD',
                accepts: ['YYYY-MM-DD'],
            },
        };
        const codecResult = validateSchemeDocument(codecDocument);
        expect(codecResult.ok).toBe(false);
        expect(
            codecResult.errors.some((error: { path: string }) =>
                error.path.includes('/text_input/encoding'),
            ),
        ).toBe(true);

        const conditionDocument = authoredScheme();
        conditionDocument.scheme.render.formats[0].fields[0].when = {
            all: [{ unknown_condition: 'LOW' }],
        };
        const conditionResult = validateSchemeDocument(conditionDocument);
        expect(conditionResult.ok).toBe(false);
        expect(
            conditionResult.errors.some((error: { path: string }) =>
                error.path.includes('/when/all/0'),
            ),
        ).toBe(true);
    });

    it('exports independently usable guide and access validators', () => {
        expect(validateGuideDocument({ guide: {} }).ok).toBe(false);
        expect(validateAccessDocument({ access: {} }).ok).toBe(false);
    });

    it('defers cross-layer plan references until composition', () => {
        const layer = authoredScheme() as {
            scheme: Record<string, unknown> & {
                data: { categories: unknown[] };
            };
        };
        layer.scheme.type = 'layer';
        layer.scheme.layer = { base: 'base-scheme' };
        layer.scheme.data.categories = [];
        expect(validateSchemeShape(layer).ok).toBe(true);
        expect(validateSchemeDocument(layer).ok).toBe(false);
    });
});
