import { execFileSync } from 'node:child_process';
import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const REPO_ROOT = path.resolve(import.meta.dirname, '..', '..');
const PACKAGES = [
    { name: '@ezclassify/types', root: 'libs/types' },
    { name: '@ezclassify/schemas', root: 'libs/schemas' },
] as const;
const SCANNABLE = /\.(?:[cm]?js|d\.(?:ts|mts|cts))$/;

/** The file list npm would publish for a workspace, as posix paths. */
function packedFiles(name: string): Set<string> {
    const packed = JSON.parse(
        execFileSync('npm', ['pack', '--dry-run', '--json', '-w', name], {
            cwd: REPO_ROOT,
            encoding: 'utf8',
        }),
    ) as { files: { path: string }[] }[];
    return new Set(packed[0].files.map(({ path }) => path));
}

describe('published JavaScript and declarations', () => {
    it.each(PACKAGES)(
        '$name has no external source-map reference without a packed map',
        ({ name, root }) => {
            const files = packedFiles(name);
            const missing: string[] = [];

            for (const file of files) {
                if (!SCANNABLE.test(file)) continue;
                const contents = readFileSync(
                    path.join(REPO_ROOT, root, file),
                    'utf8',
                );
                for (const match of contents.matchAll(
                    /[#@]\s*sourceMappingURL=([^\s'"*]+)/g,
                )) {
                    if (match[1].startsWith('data:')) continue;
                    const target = path.posix.normalize(
                        path.posix.join(path.posix.dirname(file), match[1]),
                    );
                    if (!files.has(target))
                        missing.push(`${file} -> ${target}`);
                }
            }

            expect(missing).toEqual([]);
        },
    );
});

/**
 * The directories an export entry serves declarations from while its runtime
 * module lives elsewhere, as `./internal` does: it describes the module the
 * root entry already ships. A declaration there has the entry's packed runtime
 * target behind it, and the export map lets no import reach the directory any
 * other way.
 */
function declarationOnlyRoots(root: string, files: Set<string>): string[] {
    const manifest = JSON.parse(
        readFileSync(path.join(REPO_ROOT, root, 'package.json'), 'utf8'),
    ) as {
        exports?: Record<string, string | { types?: string; import?: string }>;
    };
    const roots: string[] = [];
    for (const entry of Object.values(manifest.exports ?? {})) {
        if (typeof entry !== 'object' || !entry.types || !entry.import)
            continue;
        const types = path.posix.normalize(entry.types);
        const runtime = path.posix.normalize(entry.import);
        if (
            path.posix.dirname(types) !== path.posix.dirname(runtime) &&
            files.has(runtime)
        )
            roots.push(`${path.posix.dirname(types)}/`);
    }
    return roots;
}

/**
 * A declaration file with no runtime module behind it is a trap: a consumer
 * types against it, the import type-checks, and the import fails at run time. A
 * schema family missing from the build entry map would ship exactly that,
 * because the dts plugin still emits its declaration into a directory `files`
 * publishes whole.
 */
describe('declarations shipped with a runtime module behind them', () => {
    it.each(PACKAGES)('$name ships no orphan declaration', ({ name, root }) => {
        const files = packedFiles(name);
        const served = declarationOnlyRoots(root, files);
        const orphans: string[] = [];
        for (const file of files) {
            const stem = /^(.*)\.d\.(ts|mts|cts)$/.exec(file)?.[1];
            if (stem === undefined) continue;
            if (served.some((dir) => file.startsWith(dir))) continue;
            const hasRuntime = ['.js', '.mjs', '.cjs'].some((extension) =>
                files.has(`${stem}${extension}`),
            );
            if (!hasRuntime) orphans.push(file);
        }
        expect(orphans).toEqual([]);
    });
});

/**
 * Every schema family is reachable on its own subpath, so a consumer that wants
 * one schema does not pull the whole bundle. Crosswalk was the family that got
 * left out of this list twice: once in the build, once in `exports`.
 */
describe('the schema families each have a subpath', () => {
    it('exports one subpath per src/*-schema.ts module', () => {
        const manifest = JSON.parse(
            readFileSync(
                path.join(REPO_ROOT, 'libs/schemas/package.json'),
                'utf8',
            ),
        ) as { exports: Record<string, unknown> };
        const families = readdirSync(path.join(REPO_ROOT, 'libs/schemas/src'))
            .filter((entry) => entry.endsWith('-schema.ts'))
            .map((entry) => `./${entry.replace(/\.ts$/, '')}`)
            .sort();
        const declared = Object.keys(manifest.exports)
            .filter((subpath) => subpath.endsWith('-schema'))
            .sort();
        expect(declared).toEqual(families);
    });
});
