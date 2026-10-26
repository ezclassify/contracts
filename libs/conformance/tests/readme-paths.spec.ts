import { existsSync, readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

/**
 * This README is the npm front page for a public package, so every path it
 * names has to exist and has to be inside what `package.json` publishes. The
 * second half matters most: a path can be present in the repository and still
 * be absent from the tarball a reader actually installed.
 */

const packageRoot = path.resolve(
    path.dirname(fileURLToPath(import.meta.url)),
    '..',
);
const readme = readFileSync(path.join(packageRoot, 'README.md'), 'utf8');
const published = (
    JSON.parse(
        readFileSync(path.join(packageRoot, 'package.json'), 'utf8'),
    ) as { files: string[] }
).files.map((entry) => entry.replace(/\/$/, ''));

/**
 * Paths the README names.
 *
 * Anything in a code span that carries a slash, minus npm package specifiers,
 * which are the only other slashed thing this document says. Fenced blocks are
 * read for command arguments too, since that is the form the missing runner
 * took.
 */
function citedPaths(): string[] {
    const cited = new Set<string>();
    for (const [, span] of readme.matchAll(/`([^`\n]+)`/g)) {
        if (!span.includes('/') || span.startsWith('@') || /\s/.test(span))
            continue;
        cited.add(span);
    }
    for (const [, block] of readme.matchAll(/```[a-z]*\n([\s\S]*?)```/g)) {
        for (const [, argument] of block.matchAll(/^\w+ +(\S+)/gm)) {
            if (argument.includes('/') && !argument.startsWith('-'))
                cited.add(argument);
        }
    }
    return [...cited];
}

/** Whether a cited path resolves, allowing a `*` in the final segment. */
function resolves(cited: string): boolean {
    const trimmed = cited.replace(/\/$/, '');
    if (!trimmed.includes('*')) {
        return existsSync(path.join(packageRoot, trimmed));
    }
    const parent = path.join(packageRoot, path.posix.dirname(trimmed));
    if (!existsSync(parent)) return false;
    const pattern = new RegExp(
        `^${path.posix
            .basename(trimmed)
            .replace(/[.+^${}()|[\]\\]/g, '\\$&')
            .replace(/\*/g, '.*')}$`,
    );
    return readdirSync(parent).some((entry) => pattern.test(entry));
}

describe('every path the README names', () => {
    it('is cited at all, so the check is not vacuously green', () => {
        expect(citedPaths().length).toBeGreaterThan(5);
    });

    it('exists', () => {
        expect(citedPaths().filter((cited) => !resolves(cited))).toEqual([]);
    });

    it('is inside what the package publishes', () => {
        const outside = citedPaths().filter(
            (cited) => !published.includes(cited.split('/')[0]),
        );
        expect(outside).toEqual([]);
    });
});
