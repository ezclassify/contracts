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
import { createMirrorRecord } from '../development-mirror.mjs';

const producer = {
    repository: 'ezclassify/contracts',
    sourceSha: 'a'.repeat(40),
    runId: 1234567,
    runAttempt: 2,
};
test('records the complete native npm file set with immutable preparation identity; rejects additions and links', () => {
    const root = mkdtempSync(join(tmpdir(), 'ez-contracts-mirror-'));
    try {
        mkdirSync(join(root, 'scripts'));
        mkdirSync(join(root, 'package'));
        mkdirSync(join(root, 'packed'));
        writeFileSync(
            join(root, 'scripts/mirror-packages.json'),
            JSON.stringify({ packages: ['@ezclassify/types'] }),
        );
        writeFileSync(
            join(root, 'package/package.json'),
            JSON.stringify({
                name: '@ezclassify/types',
                version: '1.0.0-mirror.1234567.2',
            }),
        );
        execFileSync(
            'npm',
            [
                'pack',
                '--ignore-scripts',
                '--pack-destination',
                join(root, 'packed'),
            ],
            {
                cwd: join(root, 'package'),
                stdio: 'pipe',
                env: { ...process.env, NPM_CONFIG_CACHE: join(root, 'cache') },
            },
        );
        const result = createMirrorRecord(root, join(root, 'packed'), producer);
        assert.deepEqual(result.producer, producer);
        assert.equal(result.packages.length, 1);
        assert.match(result.packages[0].integrity, /^sha512-/);
        assert.throws(
            () =>
                createMirrorRecord(root, join(root, 'packed'), {
                    ...producer,
                    repository: 'guydog28/contracts',
                }),
            /producer/,
        );
        assert.throws(
            () =>
                createMirrorRecord(root, join(root, 'packed'), {
                    ...producer,
                    runAttempt: 3,
                }),
            /Unexpected/,
        );
        writeFileSync(join(root, 'packed/extra.tgz'), 'outside');
        assert.throws(
            () => createMirrorRecord(root, join(root, 'packed'), producer),
            /manifest/,
        );
        rmSync(join(root, 'packed/extra.tgz'));
        const packed = join(
            root,
            'packed',
            readdirSync(join(root, 'packed'))[0],
        );
        rmSync(packed);
        symlinkSync(join(root, 'package/package.json'), packed);
        assert.throws(
            () => createMirrorRecord(root, join(root, 'packed'), producer),
            /tarball/,
        );
    } finally {
        rmSync(root, { recursive: true, force: true });
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
        permissions: Record<string, string>;
        jobs: Record<
            string,
            {
                steps: {
                    uses?: string;
                    id?: string;
                    with: Record<string, string>;
                }[];
            }
        >;
    };
    assert.equal(workflow.permissions.contents, 'read');
    assert.equal(workflow.permissions.packages, 'read');
    assert.ok(workflow.jobs.prepare);
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
    assert.equal(token?.with.repositories, 'release-train');
    assert.equal(token?.with['permission-contents'], 'write');
});
