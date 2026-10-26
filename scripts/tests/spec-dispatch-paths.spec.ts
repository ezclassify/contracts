import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import yaml from 'js-yaml';
import { describe, expect, it } from 'vitest';

/**
 * Canonical propagation starts only after the unfiltered official main CI. The
 * source package declarations still define the complete input set; no push path
 * filter may suppress the successful-CI dispatch for one of them.
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

function workflowDocument(): Record<string, any> {
    return yaml.load(fs.readFileSync(WORKFLOW, 'utf8')) as Record<string, any>;
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

describe('spec-contract-dispatch CI qualification', () => {
    it('waits for complete main CI without a source-path suppression filter', () => {
        const workflow = workflowDocument();
        expect(workflow.on.workflow_run).toEqual({
            workflows: ['CI'],
            types: ['completed'],
            branches: ['main'],
        });
        expect(workflow.on.push).toBeUndefined();
        expect(workflow.jobs.dispatch.if).toContain(
            "github.repository == 'ezclassify/contracts'",
        );
        expect(workflow.jobs.dispatch.if).toContain(
            "github.event.workflow_run.conclusion == 'success'",
        );
        const ci = yaml.load(
            fs.readFileSync(
                path.join(ROOT, '.github/workflows/ci.yml'),
                'utf8',
            ),
        ) as Record<string, any>;
        expect(ci.name).toBe('CI');
        expect(ci.on.push.branches).toContain('main');
        expect(ci.on.push.paths).toBeUndefined();
        expect(ci.on.push['paths-ignore']).toBeUndefined();
    });

    it('has no glob that matches nothing', () => {
        const tracked = trackedFiles();
        const empty = expectedWatchPaths().filter(
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
            expectedWatchPaths().flatMap((pattern) =>
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
        expect(text).toContain('client_payload[contracts_sha]=$CONTRACTS_SHA');
        expect(text).toContain(
            'client_payload[contracts_ci_run_id]=$CONTRACTS_CI_RUN_ID',
        );
        expect(text).toContain('.conclusion == "success"');
        expect(text).toContain('.head_sha == $sha');
        expect(text).toContain(
            '.head_repository.full_name == "ezclassify/contracts"',
        );
        expect(text).not.toContain('provenance for a human');
    });
});
