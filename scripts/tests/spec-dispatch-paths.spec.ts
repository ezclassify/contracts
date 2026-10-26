import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import yaml from 'js-yaml';
import { describe, expect, it } from 'vitest';

/**
 * Guard for `.github/workflows/spec-contract-dispatch.yml`.
 *
 * That workflow is what tells the release pipeline a contract changed here. It
 * is a push-path-filtered trigger, which means it can fail in the one way
 * nothing else in this repository would notice: if a watched path stops
 * matching any tracked file (a directory renamed, a build output relocated, a
 * corpus moved under a new package), the trigger simply never fires again. No
 * job runs, no log line is written, and the mirrors go stale until somebody
 * happens to look.
 *
 * So the check cannot live inside that workflow; a workflow that does not fire
 * cannot audit its own trigger. It lives here, in the suite CI runs on every
 * push and pull request, and it re-derives the expected path set from the
 * source packages' OWN manifests rather than restating the workflow's list. A
 * second hardcoded copy of the same list would agree with the first one
 * forever, including while both were wrong.
 */

const ROOT = path.resolve(
    path.dirname(fileURLToPath(import.meta.url)),
    '../..',
);
const WORKFLOW = path.join(
    ROOT,
    '.github/workflows/spec-contract-dispatch.yml',
);

/** Every path git tracks, in git's forward-slash form. */
function trackedFiles(): string[] {
    return execFileSync('git', ['ls-files', '-z'], { cwd: ROOT })
        .toString()
        .split('\0')
        .filter(Boolean);
}

function readPackage(dir: string): Record<string, any> {
    return JSON.parse(
        fs.readFileSync(path.join(ROOT, dir, 'package.json'), 'utf8'),
    );
}

/** Strip the `./` a package manifest writes on every self-relative path. */
function unprefix(specifier: string): string {
    return specifier.replace(/^\.\//, '');
}

/**
 * The paths a push must be watched at, derived from the three packages the
 * vendoring engine assembles the bundle from.
 *
 * - `@ezclassify/openapi` names the exact file in `exports`.
 * - `@ezclassify/schemas` names the schema directory through its
 *   `./json-schemas/*` export pattern. It resolves under `dist/`, a build
 *   output that is tracked here via .gitignore negation.
 * - `@ezclassify/conformance` publishes the corpus as directories in `files`.
 *   Directory entries only: the file entries beside them (matrix.json, the
 *   notices) are not bundle inputs.
 */
function expectedWatchPaths(): string[] {
    const openapiExport =
        readPackage('libs/openapi').exports?.['./openapi.yaml'];
    expect(
        typeof openapiExport,
        '@ezclassify/openapi no longer exports ./openapi.yaml; the dispatch trigger cannot be derived',
    ).toBe('string');

    const schemasExport =
        readPackage('libs/schemas').exports?.['./json-schemas/*'];
    expect(
        typeof schemasExport,
        '@ezclassify/schemas no longer exports ./json-schemas/*; the dispatch trigger cannot be derived',
    ).toBe('string');
    const schemasDir = unprefix(schemasExport as string).replace(/\/\*$/, '');

    const corpusDirs: string[] = (readPackage('libs/conformance').files ?? [])
        .filter((entry: string) => entry.endsWith('/'))
        .map((entry: string) => entry.slice(0, -1));
    expect(
        corpusDirs.length,
        '@ezclassify/conformance declares no directories in `files`; the corpus location cannot be derived',
    ).toBeGreaterThan(0);

    return [
        `libs/openapi/${unprefix(openapiExport as string)}`,
        `libs/schemas/${schemasDir}/**`,
        ...corpusDirs.map((dir) => `libs/conformance/${dir}/**`),
    ];
}

/** The `on.push.paths` list the workflow actually declares. */
function workflowWatchPaths(): string[] {
    const doc = yaml.load(fs.readFileSync(WORKFLOW, 'utf8')) as Record<
        string,
        any
    >;
    // YAML 1.1 reads a bare `on` key as the boolean true. js-yaml follows it,
    // so accept whichever key survived the parse instead of assuming.
    const on = doc.on ?? doc[true as unknown as string];
    return on?.push?.paths ?? [];
}

/**
 * Files a single workflow path filter matches.
 *
 * Only the two forms this workflow uses are understood: an exact path, and a
 * directory prefix ending in `/**`. Anything else throws rather than silently
 * matching nothing, because "matched nothing" is the exact failure this file
 * exists to catch and a permissive matcher would report it as a pass.
 */
function matchesFor(pattern: string, tracked: string[]): string[] {
    if (pattern.endsWith('/**')) {
        const prefix = `${pattern.slice(0, -2)}`;
        return tracked.filter((file) => file.startsWith(prefix));
    }
    if (!pattern.includes('*')) {
        return tracked.filter((file) => file === pattern);
    }
    throw new Error(
        `spec-contract-dispatch.yml uses path filter form "${pattern}", which this guard cannot ` +
            `evaluate. Teach it the form or use an exact path / a "dir/**" prefix.`,
    );
}

describe('spec-contract-dispatch path filter', () => {
    it('watches exactly the locations the source packages declare', () => {
        expect([...workflowWatchPaths()].sort()).toEqual(
            [...expectedWatchPaths()].sort(),
        );
    });

    it('has no glob that matches nothing', () => {
        const tracked = trackedFiles();
        const empty = workflowWatchPaths().filter(
            (pattern) => matchesFor(pattern, tracked).length === 0,
        );
        expect(
            empty,
            'these dispatch path filters match no tracked file, so a change there would propagate nothing',
        ).toEqual([]);
    });

    it('covers the whole committed spec bundle', () => {
        const tracked = trackedFiles();
        const covered = new Set(
            workflowWatchPaths().flatMap((pattern) =>
                matchesFor(pattern, tracked),
            ),
        );
        // The vendored bundle is the openapi document plus the
        // JSON schemas plus the corpus. Pinning the count keeps this test from
        // passing on a set that shrank to a handful of files.
        expect(covered.size).toBeGreaterThanOrEqual(78);
    });

    it('sends the event name the release pipeline listens for', () => {
        const text = fs.readFileSync(WORKFLOW, 'utf8');
        expect(text).toContain('event_type=contracts-spec-changed');
    });
});
