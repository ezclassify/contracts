import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

/**
 * Some packages here are built and publish their `dist`; the rest are
 * hand-authored ESM and publish exactly what is in the repository. For that
 * second group, a file that is present in a working tree but not committed is
 * invisible: every local check passes, and then a clean checkout has no such
 * file and the published tarball has no such file either.
 *
 * `@ezclassify/conformance-server`, for one, advertises `src/index.d.ts` as its
 * `types` entry, and the blanket ignore rule for stray in-place `tsc` output
 * would swallow it without the negation in `.gitignore`. The package would then
 * ship a types pointer into thin air and every TypeScript consumer would get an
 * implicit-any import.
 *
 * So this walks what each unbuilt package says it publishes and asserts git is
 * carrying it. `git ls-files` is the authority here because it answers the
 * question that matters, which is what a fresh clone gets, rather than what
 * happens to be on this disk.
 */

const repoRoot = path.resolve(
    path.dirname(fileURLToPath(import.meta.url)),
    '..',
    '..',
);

interface Manifest {
    name?: string;
    files?: string[];
    main?: string;
    types?: string;
    bin?: string | Record<string, string>;
    exports?: unknown;
    scripts?: Record<string, string>;
}

const tracked = new Set(
    execFileSync('git', ['ls-files', '-z'], {
        cwd: repoRoot,
        encoding: 'utf8',
        maxBuffer: 32 * 1024 * 1024,
    })
        .split('\0')
        .filter(Boolean),
);

/** Workspace package directories, resolved from the root manifest's globs. */
function workspaceDirs(): string[] {
    const root = JSON.parse(
        readFileSync(path.join(repoRoot, 'package.json'), 'utf8'),
    ) as { workspaces: string[] };
    return root.workspaces
        .flatMap((pattern) => {
            const parent = pattern.replace(/\/\*$/, '');
            return readdirSync(path.join(repoRoot, parent), {
                withFileTypes: true,
            })
                .filter((entry) => entry.isDirectory())
                .map((entry) => `${parent}/${entry.name}`);
        })
        .filter((dir) => existsSync(path.join(repoRoot, dir, 'package.json')));
}

/** Every string that appears as a target in an `exports` map, at any depth. */
function exportTargets(node: unknown, into: string[] = []): string[] {
    if (typeof node === 'string') {
        into.push(node);
    } else if (node !== null && typeof node === 'object') {
        for (const value of Object.values(node)) exportTargets(value, into);
    }
    return into;
}

/** Repo-relative paths of every file under one `files` entry. */
function filesUnder(dir: string, entry: string): string[] {
    const relative = path.posix.join(dir, entry.replace(/\/$/, ''));
    const absolute = path.join(repoRoot, relative);
    if (!existsSync(absolute)) return [relative];
    if (!statSync(absolute).isDirectory()) return [relative];
    return readdirSync(absolute, { recursive: true, withFileTypes: true })
        .filter((found) => found.isFile())
        .map((found) =>
            path.posix.join(
                relative,
                path.relative(
                    absolute,
                    path.join(found.parentPath, found.name),
                ),
            ),
        );
}

const unbuilt = workspaceDirs()
    .map((dir) => ({
        dir,
        manifest: JSON.parse(
            readFileSync(path.join(repoRoot, dir, 'package.json'), 'utf8'),
        ) as Manifest,
    }))
    .filter(({ manifest }) => manifest.scripts?.build === undefined);

describe.each(unbuilt)('what $manifest.name publishes', ({ dir, manifest }) => {
    it('is committed, so a clone and a tarball both have it', () => {
        const published = (manifest.files ?? [])
            .filter((entry) => !entry.startsWith('!'))
            .flatMap((entry) => filesUnder(dir, entry));
        expect(published.length).toBeGreaterThan(0);
        expect(published.filter((file) => !tracked.has(file))).toEqual([]);
    });

    it('resolves every entry point the manifest advertises', () => {
        const bin = manifest.bin;
        const entries = [
            manifest.main,
            manifest.types,
            ...(typeof bin === 'string' ? [bin] : Object.values(bin ?? {})),
            ...exportTargets(manifest.exports),
        ]
            .filter((entry): entry is string => typeof entry === 'string')
            .filter((entry) => !entry.includes('*'))
            .map((entry) => path.posix.join(dir, entry.replace(/^\.\//, '')));
        const missing = [...new Set(entries)].filter(
            (file) => !tracked.has(file),
        );
        expect(missing).toEqual([]);
    });
});
