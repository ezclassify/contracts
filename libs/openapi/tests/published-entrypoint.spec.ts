import { spawnSync } from 'node:child_process';
import { cpSync, mkdirSync, mkdtempSync, rmSync, symlinkSync } from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { beforeAll, describe, expect, it } from 'vitest';

/**
 * The package declares a code subpath, and a consumer imports it by the
 * specifier, not through the file URL the generator uses under tsx. So
 * `import('@ezclassify/openapi/wire')` has to resolve to built JavaScript, or
 * Node refuses it with ERR_MODULE_NOT_FOUND.
 *
 * This builds the package and loads every declared subpath from the path
 * `package.json` advertises, in a plain Node process, because Node's resolver
 * is the strict one and Vite's forgives what Node would refuse. The route
 * declarations are build input for the document and are not published.
 */

const require = createRequire(import.meta.url);
const packageRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const repoRoot = resolve(packageRoot, '../..');
const manifest = require(resolve(packageRoot, 'package.json')) as {
    exports: Record<string, string | { types: string; import: string }>;
    files: string[];
};

/** Subpaths that resolve to code, as opposed to the two document files. */
const codeSubpaths = Object.entries(manifest.exports).filter(
    (entry): entry is [string, { types: string; import: string }] =>
        typeof entry[1] === 'object',
);

/**
 * Import each advertised entry point in a plain Node process and report what
 * came back. Anything the module system refuses is returned as the loader's own
 * message rather than thrown, so a failure reads as the resolution error it
 * is.
 */
function loadInNode(): string {
    const targets = Object.fromEntries(
        codeSubpaths.map(([subpath, target]) => [
            subpath,
            resolve(packageRoot, target.import),
        ]),
    );
    const probe = `
        import { pathToFileURL } from 'node:url';
        const targets = ${JSON.stringify(targets)};
        const seen = {};
        for (const [subpath, file] of Object.entries(targets)) {
            const mod = await import(pathToFileURL(file).href);
            seen[subpath] = Object.keys(mod).sort();
        }
        console.log(JSON.stringify(seen));
    `;
    const run = spawnSync(
        process.execPath,
        ['--input-type=module', '-e', probe],
        { cwd: packageRoot, encoding: 'utf8' },
    );
    return run.status === 0 ? run.stdout.trim() : `${run.stdout}${run.stderr}`;
}

beforeAll(() => {
    const built = spawnSync(
        process.execPath,
        [require.resolve('typescript/bin/tsc'), '-p', 'tsconfig.build.json'],
        { cwd: packageRoot, encoding: 'utf8' },
    );
    if (built.status !== 0) {
        throw new Error(
            `Unable to build @ezclassify/openapi for the entry-point check:\n${built.stdout}${built.stderr}`,
        );
    }
});

describe('the published entry points', () => {
    it('builds every code export during a clean npm pack', () => {
        const scratch = mkdtempSync(join(tmpdir(), 'ezclassify-openapi-pack-'));
        const scratchPackage = join(scratch, 'libs/openapi');
        try {
            mkdirSync(scratchPackage, { recursive: true });
            mkdirSync(join(scratch, 'packages/tsconfig'), { recursive: true });
            for (const entry of [
                'package.json',
                'tsconfig.build.json',
                'openapi.yaml',
                'openapi.json',
            ]) {
                cpSync(join(packageRoot, entry), join(scratchPackage, entry), {
                    recursive: true,
                });
            }
            cpSync(join(packageRoot, 'src'), join(scratchPackage, 'src'), {
                recursive: true,
            });
            cpSync(
                join(repoRoot, 'packages/tsconfig/library.json'),
                join(scratch, 'packages/tsconfig/library.json'),
            );
            symlinkSync(
                join(repoRoot, 'node_modules'),
                join(scratch, 'node_modules'),
            );

            const pack = (args: string[]) => {
                const run = spawnSync(
                    'npm',
                    ['pack', '--dry-run', '--json', ...args],
                    {
                        cwd: scratchPackage,
                        encoding: 'utf8',
                        env: {
                            ...process.env,
                            npm_config_cache: join(scratch, 'npm-cache'),
                        },
                    },
                );
                expect(run.status, `${run.stdout}${run.stderr}`).toBe(0);
                return new Set(
                    (
                        JSON.parse(run.stdout) as {
                            files: { path: string }[];
                        }[]
                    )[0].files.map(({ path }) => path),
                );
            };

            const withoutLifecycle = pack(['--ignore-scripts']);
            for (const [, target] of codeSubpaths) {
                expect(withoutLifecycle.has(target.import.slice(2))).toBe(
                    false,
                );
                expect(withoutLifecycle.has(target.types.slice(2))).toBe(false);
            }

            const published = pack([]);
            for (const [, target] of codeSubpaths) {
                expect(published.has(target.import.slice(2))).toBe(true);
                expect(published.has(target.types.slice(2))).toBe(true);
            }
        } finally {
            rmSync(scratch, { recursive: true, force: true });
        }
    });

    it('declares its code subpaths against the build output, not against src', () => {
        for (const [subpath, target] of codeSubpaths) {
            expect(target.import, subpath).toMatch(/^\.\/dist\//);
            expect(target.types, subpath).toMatch(/^\.\/dist\//);
        }
        expect(manifest.files).toContain('dist');
        expect(manifest.files).not.toContain('src');
    });

    it('loads every declared subpath in Node', () => {
        const loaded = JSON.parse(loadInNode()) as Record<string, string[]>;
        expect(Object.keys(loaded).sort()).toEqual(
            codeSubpaths.map(([subpath]) => subpath).sort(),
        );
    });
});
