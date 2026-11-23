import { load } from 'js-yaml';
import { test } from 'vitest';
import assert from 'node:assert/strict';
import {
    mkdtempSync,
    mkdirSync,
    writeFileSync,
    readFileSync,
    rmSync,
    readdirSync,
    symlinkSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';
import {
    createMirrorRecord,
    developmentVersion,
} from '../development-mirror.mjs';

test('records the complete native npm file set with immutable preparation identity; rejects additions and links', () => {
    const parent = mkdtempSync(join(tmpdir(), 'ez-contracts-mirror-'));
    const root = join(parent, 'source');
    mkdirSync(root);
    try {
        mkdirSync(join(root, 'scripts'));
        mkdirSync(join(root, 'libs/types'), { recursive: true });
        mkdirSync(join(root, 'package'));
        mkdirSync(join(parent, 'packed'));
        writeFileSync(
            join(root, 'scripts/mirror-packages.json'),
            JSON.stringify({ packages: ['@ezclassify/types'] }),
        );
        writeFileSync(
            join(root, 'libs/types/package.json'),
            JSON.stringify({ version: '1.1.0-dev.0' }),
        );
        writeFileSync(
            join(root, 'package/package.json'),
            JSON.stringify({
                name: '@ezclassify/types',
                version: '1.1.0-dev.1',
            }),
        );
        const git = (...args: string[]) =>
            execFileSync('git', args, { cwd: root, encoding: 'utf8' }).trim();
        git('init', '-q');
        git('add', '.');
        git(
            '-c',
            'user.name=Test',
            '-c',
            'user.email=test@example.com',
            '-c',
            'commit.gpgsign=false',
            'commit',
            '-qm',
            'source',
        );
        const producer = {
            repository: 'ezclassify/contracts',
            sourceSha: git('rev-parse', 'HEAD'),
            runId: 1234567,
            runAttempt: 2,
        };
        assert.equal(
            developmentVersion(root, producer.sourceSha),
            '1.1.0-dev.1',
        );
        execFileSync(
            'npm',
            [
                'pack',
                '--ignore-scripts',
                '--pack-destination',
                join(parent, 'packed'),
            ],
            {
                cwd: join(root, 'package'),
                stdio: 'pipe',
                env: { ...process.env, NPM_CONFIG_CACHE: join(root, 'cache') },
            },
        );
        const result = createMirrorRecord(
            root,
            join(parent, 'packed'),
            producer,
        );
        assert.deepEqual(result.producer, producer);
        assert.throws(
            () => createMirrorRecord(root, root, producer),
            /outside source/,
        );
        assert.equal(result.packages.length, 1);
        assert.match(result.packages[0].integrity, /^sha512-/);
        assert.throws(
            () =>
                createMirrorRecord(root, join(parent, 'packed'), {
                    ...producer,
                    repository: 'guydog28/contracts',
                }),
            /producer/,
        );
        assert.equal(
            createMirrorRecord(root, join(parent, 'packed'), {
                ...producer,
                runAttempt: 3,
            }).version,
            result.version,
        );
        assert.throws(
            () => developmentVersion(root, 'a'.repeat(40)),
            /complete selected source history/,
        );
        writeFileSync(join(parent, 'packed/extra.tgz'), 'outside');
        assert.throws(
            () => createMirrorRecord(root, join(parent, 'packed'), producer),
            /manifest/,
        );
        rmSync(join(parent, 'packed/extra.tgz'));
        const packed = join(
            parent,
            'packed',
            readdirSync(join(parent, 'packed'))[0],
        );
        rmSync(packed);
        symlinkSync(join(root, 'package/package.json'), packed);
        assert.throws(
            () => createMirrorRecord(root, join(parent, 'packed'), producer),
            /tarball/,
        );
    } finally {
        rmSync(parent, { recursive: true, force: true });
    }
});

test('read-only native preparation and a source-free handoff keep write credentials out of builds', () => {
    const workflow = load(
        readFileSync(
            new URL(
                '../../.github/workflows/publish-mirror.yml',
                import.meta.url,
            ),
            'utf8',
        ),
    ) as {
        on: Record<string, unknown>;
        permissions: Record<string, string>;
        jobs: Record<
            string,
            {
                environment?: string;
                if?: string;
                steps: {
                    uses?: string;
                    id?: string;
                    with: Record<string, string | number>;
                }[];
            }
        >;
    };
    assert.deepEqual(Object.keys(workflow.on).sort(), [
        'push',
        'repository_dispatch',
        'workflow_dispatch',
    ]);
    assert.deepEqual(workflow.on.push, { branches: ['main'] });
    assert.equal(workflow.permissions.contents, 'read');
    assert.equal(workflow.permissions.packages, 'read');
    assert.ok(workflow.jobs.prepare);
    assert.deepEqual(workflow.on.repository_dispatch, {
        types: ['contracts-mirror-refresh'],
    });
    assert.match(
        workflow.jobs.prepare.if ?? '',
        /github\.actor == 'ezclassify-spec-bot\[bot\]'/,
    );
    assert.match(
        workflow.jobs.prepare.if ?? '',
        /github\.event\.client_payload\.source_sha == github\.sha/,
    );
    const artifact = workflow.jobs.prepare.steps.find((step) =>
        step.uses?.startsWith('actions/upload-artifact'),
    );
    assert.equal(artifact?.with['retention-days'], 90);
    assert.equal(
        JSON.stringify(workflow.jobs.prepare).includes('secrets.'),
        false,
    );
    assert.equal(
        workflow.jobs.handoff.steps.some((step) =>
            step.uses?.startsWith('actions/checkout'),
        ),
        false,
    );
    const token = workflow.jobs.handoff.steps.find(
        (step) => step.id === 'conductor',
    );
    assert.deepEqual(workflow.jobs.handoff.environment, {
        name: 'development-signal',
        deployment: false,
    });
    assert.equal(
        token?.with.repositories,
        '${{ secrets.EZ_DEVELOPMENT_SIGNAL_DESTINATION }}',
    );
    assert.equal(
        token?.with['private-key'],
        '${{ secrets.EZ_DEVELOPMENT_SIGNAL_APP_PRIVATE_KEY }}',
    );
    assert.equal(token?.with['permission-contents'], 'write');
});
