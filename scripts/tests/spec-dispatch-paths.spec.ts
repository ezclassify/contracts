import { execFileSync, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
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
    it('executes the dispatch job proof and rejects incomplete full qualification', () => {
        const workflow = workflowDocument();
        const shell = workflow.jobs.dispatch.steps.find(
            (step: any) => step.id === 'source',
        ).run;
        const program = shell.match(
            /jq -e --arg sha "\$main_sha" --argjson id "\$run_id" --argjson attempt "\$attempt" '([\s\S]*?)' <<< "\$jobs"/,
        )[1];
        const sha = 'a'.repeat(40);
        const names = [
            'policy / plan',
            'qualification / accept',
            'ci / accept',
            'build-and-test (22)',
            'build-and-test (24)',
        ];
        const listing = () => ({
            total_count: names.length,
            jobs: names.map((name) => ({
                name,
                status: 'completed',
                conclusion: 'success',
                head_sha: sha,
                run_id: 7,
                run_attempt: 1,
            })),
        });
        const accepts = (value: unknown) =>
            spawnSync(
                'jq',
                [
                    '-e',
                    '--arg',
                    'sha',
                    sha,
                    '--argjson',
                    'id',
                    '7',
                    '--argjson',
                    'attempt',
                    '1',
                    program,
                ],
                { input: JSON.stringify(value), encoding: 'utf8' },
            ).status === 0;
        expect(accepts(listing())).toBe(true);
        for (const change of [
            'missing',
            'skipped',
            'failed',
            'attempt',
            'head',
            'truncated',
        ]) {
            const value = listing();
            if (change === 'missing') {
                value.jobs.pop();
                value.total_count--;
            }
            if (change === 'skipped') value.jobs[1].conclusion = 'skipped';
            if (change === 'failed') value.jobs[0].conclusion = 'failure';
            if (change === 'attempt') value.jobs[0].run_attempt = 2;
            if (change === 'head') value.jobs[0].head_sha = 'b'.repeat(40);
            if (change === 'truncated') value.total_count++;
            expect(accepts(value), change).toBe(false);
        }
    });

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

describe('automatic main qualification before spec propagation', () => {
    function qualificationJob() {
        const job = workflowDocument().jobs['qualify-main'];
        expect(
            job,
            'merge CI must automatically start full main qualification',
        ).toBeDefined();
        return job;
    }

    it('starts qualification only for successful official-main push CI', () => {
        const job = qualificationJob();
        expect(job.permissions).toEqual({ contents: 'read', actions: 'write' });
        const accepts = (github: any) =>
            new Function(
                'github',
                `return (${job.if.replace(/^\$\{\{\s*|\s*\}\}$/g, '')})`,
            )(github);
        const event = () => ({
            repository: 'ezclassify/contracts',
            ref: 'refs/heads/main',
            event_name: 'workflow_run',
            event: { workflow_run: { conclusion: 'success', event: 'push' } },
        });
        expect(accepts(event())).toBe(true);
        for (const kind of [
            'failed',
            'pull-request',
            'manual',
            'scheduled',
            'fork',
            'branch',
            'direct',
        ]) {
            const value = event();
            if (kind === 'failed')
                value.event.workflow_run.conclusion = 'failure';
            if (kind === 'pull-request')
                value.event.workflow_run.event = 'pull_request';
            if (kind === 'manual')
                value.event.workflow_run.event = 'workflow_dispatch';
            if (kind === 'scheduled')
                value.event.workflow_run.event = 'schedule';
            if (kind === 'fork') value.repository = 'contributor/contracts';
            if (kind === 'branch') value.ref = 'refs/heads/other';
            if (kind === 'direct') value.event_name = 'workflow_dispatch';
            expect(accepts(value), kind).toBe(false);
        }
        // Existing dispatch still waits for the full run: routine push cannot propagate.
        const dispatch = workflowDocument().jobs.dispatch;
        expect(dispatch.if).toContain(
            "github.event.workflow_run.event == 'workflow_dispatch'",
        );
        expect(
            dispatch.permissions?.actions ??
                workflowDocument().permissions.actions,
        ).toBe('read');
    });

    it.each([
        'current',
        'superseded',
        'failed',
        'foreign',
        'wrong-head',
        'wrong-workflow',
        'wrong-attempt',
        'pull-request',
    ])('executes the qualification launcher against %s CI evidence', (kind) => {
        const shell = qualificationJob().steps[0].run;
        const root = fs.mkdtempSync(
            path.join(os.tmpdir(), 'spec-qualification-'),
        );
        const sha = 'a'.repeat(40);
        const run = {
            id: 7,
            head_sha: sha,
            head_branch: 'main',
            event: 'push',
            status: 'completed',
            conclusion: 'success',
            path: '.github/workflows/ci.yml',
            run_attempt: 1,
            repository: { full_name: 'ezclassify/contracts' },
            head_repository: { full_name: 'ezclassify/contracts' },
        };
        if (kind === 'failed') run.conclusion = 'failure';
        if (kind === 'foreign')
            run.head_repository.full_name = 'contributor/contracts';
        if (kind === 'wrong-head') run.head_sha = 'b'.repeat(40);
        if (kind === 'wrong-workflow') run.path = '.github/workflows/other.yml';
        if (kind === 'wrong-attempt') run.run_attempt = 2;
        if (kind === 'pull-request') run.event = 'pull_request';
        try {
            fs.writeFileSync(
                path.join(root, 'gh'),
                `#!/usr/bin/env node
const fs = require('node:fs');
const args = process.argv.slice(2);
if (args[0] === 'api' && args[1].endsWith('/actions/runs/7')) console.log(process.env.FIXTURE_RUN);
else if (args[0] === 'api' && args[1].endsWith('/git/ref/heads/main')) console.log(process.env.FIXTURE_MAIN);
else if (args[0] === 'workflow') fs.writeFileSync(process.env.DISPATCH_LOG, JSON.stringify(args));
else process.exit(9);
`,
                { mode: 0o755 },
            );
            const log = path.join(root, 'dispatch.json');
            const result = spawnSync(
                'bash',
                ['-e', '-o', 'pipefail', '-c', shell],
                {
                    encoding: 'utf8',
                    timeout: 5000,
                    env: {
                        ...process.env,
                        PATH: `${root}:${process.env.PATH}`,
                        SOURCE_SHA: sha,
                        EVENT_RUN_ID: '7',
                        EVENT_RUN_ATTEMPT: '1',
                        GH_TOKEN: 'fixture',
                        FIXTURE_RUN: JSON.stringify(run),
                        FIXTURE_MAIN: JSON.stringify({
                            object: {
                                sha:
                                    kind === 'superseded'
                                        ? 'b'.repeat(40)
                                        : sha,
                            },
                        }),
                        DISPATCH_LOG: log,
                    },
                },
            );
            expect(result.status, result.stderr).toBe(
                ['current', 'superseded'].includes(kind) ? 0 : 1,
            );
            if (kind === 'current')
                expect(JSON.parse(fs.readFileSync(log, 'utf8'))).toEqual([
                    'workflow',
                    'run',
                    'ci.yml',
                    '--repo',
                    'ezclassify/contracts',
                    '--ref',
                    'main',
                ]);
            else expect(fs.existsSync(log)).toBe(false);
        } finally {
            fs.rmSync(root, { recursive: true, force: true });
        }
    });
});
