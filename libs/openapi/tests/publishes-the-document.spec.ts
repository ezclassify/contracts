import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import yaml from 'js-yaml';
import { describe, expect, it } from 'vitest';

/**
 * The point of this package is that a consumer can get the OpenAPI document
 * without knowing where it sits in our tree. Two separate mechanisms have to
 * hold for that, and each can be broken on its own by an edit that looks
 * harmless: `files` decides what lands in the tarball, and `exports` decides
 * what a resolver will hand back. The repository root is a private workspace
 * that publishes nothing, so this is the check that the document stays in the
 * package where it can actually reach anyone.
 */

const PACKAGE_ROOT = path.resolve(
    path.dirname(fileURLToPath(import.meta.url)),
    '..',
);

const manifest = JSON.parse(
    fs.readFileSync(path.join(PACKAGE_ROOT, 'package.json'), 'utf8'),
) as {
    name: string;
    private?: boolean;
    files?: string[];
    exports: Record<string, string>;
};

const DOCUMENTS = ['openapi.yaml', 'openapi.json'] as const;

describe('@ezclassify/openapi publishes the document it is named after', () => {
    it('publishes concept citation as optional provenance on the context resource', () => {
        const document = JSON.parse(
            fs.readFileSync(path.join(PACKAGE_ROOT, 'openapi.json'), 'utf8'),
        );
        const concept = document.components.schemas.ConceptView;
        expect(concept.properties.citation).toMatchObject({ type: 'string' });
        expect(concept.required).not.toContain('citation');
    });

    it('publishes evaluated marking requirements as a required named audit result', () => {
        const document = JSON.parse(
            fs.readFileSync(path.join(PACKAGE_ROOT, 'openapi.json'), 'utf8'),
        );
        const schemas = document.components.schemas;
        expect(schemas.DocumentAuditReport.required).toContain(
            'markingRequirements',
        );
        expect(
            schemas.DocumentAuditReport.properties.markingRequirements.$ref,
        ).toBe('#/components/schemas/DocumentMarkingRequirements');
        expect(schemas.DocumentMarkingRequirements.required).toEqual([
            'whole',
            'part',
        ]);
        expect(schemas.DocumentMarkingRequirements.properties.whole.type).toBe(
            'boolean',
        );
        expect(schemas.DocumentMarkingRequirements.properties.part.type).toBe(
            'boolean',
        );
    });

    it('is publishable at all', () => {
        // `private: true` would make every other assertion here moot: npm
        // refuses to publish the package no matter what it contains.
        expect(manifest.private).toBeUndefined();
        expect(manifest.name).toBe('@ezclassify/openapi');
    });

    it.each(DOCUMENTS)('emits %s into the package, not above it', (file) => {
        expect(fs.existsSync(path.join(PACKAGE_ROOT, file))).toBe(true);
    });

    it.each(DOCUMENTS)('exports ./%s by name', (file) => {
        expect(manifest.exports[`./${file}`]).toBe(`./${file}`);

        // Assert against the resolver rather than the manifest string: an
        // export that points at a missing file is a manifest that reads right
        // and resolves to nothing.
        const require = createRequire(import.meta.url);
        expect(require.resolve(`@ezclassify/openapi/${file}`)).toBe(
            path.join(PACKAGE_ROOT, file),
        );
    });

    it('ships both documents in the tarball', () => {
        // `files` is easy to get subtly wrong and the mistake is invisible
        // until a consumer installs the package, so ask npm what it would
        // actually pack instead of re-reading the field we just set.
        // The real prepack cleans dist before rebuilding it. Keep that
        // lifecycle isolated from parallel tests loading the live package.
        const scratch = fs.mkdtempSync(
            path.join(tmpdir(), 'ezclassify-openapi-document-pack-'),
        );
        const scratchPackage = path.join(scratch, 'libs/openapi');
        const repoRoot = path.resolve(PACKAGE_ROOT, '..', '..');
        try {
            fs.mkdirSync(scratchPackage, { recursive: true });
            fs.mkdirSync(path.join(scratch, 'packages/tsconfig'), {
                recursive: true,
            });
            for (const entry of [
                'package.json',
                'tsconfig.build.json',
                ...DOCUMENTS,
                'src',
            ]) {
                fs.cpSync(
                    path.join(PACKAGE_ROOT, entry),
                    path.join(scratchPackage, entry),
                    { recursive: true },
                );
            }
            fs.cpSync(
                path.join(repoRoot, 'packages/tsconfig/library.json'),
                path.join(scratch, 'packages/tsconfig/library.json'),
            );
            fs.symlinkSync(
                path.join(repoRoot, 'node_modules'),
                path.join(scratch, 'node_modules'),
            );

            const packed = JSON.parse(
                execFileSync('npm', ['pack', '--dry-run', '--json'], {
                    cwd: scratchPackage,
                    encoding: 'utf8',
                    env: {
                        ...process.env,
                        npm_config_cache: path.join(scratch, 'npm-cache'),
                    },
                }),
            ) as { files: { path: string }[] }[];

            const paths = packed[0].files.map((f) => f.path);
            for (const file of DOCUMENTS) expect(paths).toContain(file);
        } finally {
            fs.rmSync(scratch, { recursive: true, force: true });
        }
    });

    it('ships a document that parses and describes the REST surface', () => {
        // A tarball entry proves a file is present, not that it is the spec.
        const doc = yaml.load(
            fs.readFileSync(path.join(PACKAGE_ROOT, 'openapi.yaml'), 'utf8'),
        ) as { openapi: string; paths: Record<string, unknown> };

        expect(doc.openapi).toMatch(/^3\./);
        expect(Object.keys(doc.paths).length).toBeGreaterThan(0);
    });
});
