/**
 * The publish-date quarantine `deps:relock` ends with.
 *
 * Hermetic: the guard is pointed at a throwaway lockfile whose entries resolve
 * from a local HTTP server standing in for a registry, so no test reaches the
 * network.
 */
import { execFile } from 'node:child_process';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { createServer, type Server } from 'node:http';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

const REPO_ROOT = path.resolve(import.meta.dirname, '..', '..');
const GUARD = path.join(REPO_ROOT, 'scripts', 'check-dependency-age.mjs');
const DAY_MS = 86_400_000;

const publishTimes: Record<string, Record<string, string>> = {};
let server: Server;
let registry: string;

function isoDaysAgo(days: number): string {
    return new Date(Date.now() - days * DAY_MS).toISOString();
}

beforeAll(async () => {
    server = createServer((request, response) => {
        const name = decodeURIComponent((request.url ?? '/').slice(1));
        const times = publishTimes[name];
        if (!times) {
            response.writeHead(404).end('{}');
            return;
        }
        response.writeHead(200, { 'content-type': 'application/json' });
        response.end(JSON.stringify({ name, time: times }));
    });
    await new Promise<void>((done) => server.listen(0, '127.0.0.1', done));
    const address = server.address();
    if (address === null || typeof address === 'string') {
        throw new Error('the fake registry did not bind a port');
    }
    registry = `http://127.0.0.1:${address.port}`;
});

afterAll(async () => {
    await new Promise<void>((done, fail) =>
        server.close((error) => (error ? fail(error) : done())),
    );
});

/** Write a lockfile with the given `packages` map and return its path. */
function lockfile(packages: Record<string, unknown>): string {
    const dir = mkdtempSync(path.join(tmpdir(), 'contracts-dependency-age-'));
    const file = path.join(dir, 'package-lock.json');
    writeFileSync(
        file,
        JSON.stringify({
            name: 'fixture',
            lockfileVersion: 3,
            packages: {
                '': { name: 'fixture', version: '1.0.0' },
                ...packages,
            },
        }),
    );
    return file;
}

/** A registry entry that resolves from the fake registry. */
function fromRegistry(name: string, version: string) {
    return {
        [`node_modules/${name}`]: {
            version,
            resolved: `${registry}/${name}/-/${name}-${version}.tgz`,
        },
    };
}

/**
 * Run the guard. Asynchronous on purpose: the fake registry is served from this
 * process, so a synchronous spawn would block the answer to the guard's fetch.
 */
function run(file: string): Promise<{ status: number; output: string }> {
    return new Promise((settle) => {
        execFile(
            process.execPath,
            [GUARD],
            {
                cwd: REPO_ROOT,
                env: {
                    ...process.env,
                    EZCLASSIFY_DEPENDENCY_AGE_LOCKFILE: file,
                    EZCLASSIFY_DEPENDENCY_AGE_REGISTRY: registry,
                },
                encoding: 'utf8',
            },
            (error, stdout, stderr) => {
                const status =
                    error === null
                        ? 0
                        : ((error as { code?: number }).code ?? 1);
                settle({ status, output: `${stdout}${stderr}` });
            },
        );
    });
}

describe('dependency quarantine', () => {
    it('accepts a package published before the window', async () => {
        publishTimes['settled-lib'] = { '1.2.3': isoDaysAgo(30) };
        const result = await run(
            lockfile(fromRegistry('settled-lib', '1.2.3')),
        );
        expect(result.status).toBe(0);
        expect(result.output).toContain('Dependency quarantine passed');
    });

    it('refuses a package published inside the window', async () => {
        publishTimes['fresh-lib'] = { '9.9.9': isoDaysAgo(1) };
        const result = await run(lockfile(fromRegistry('fresh-lib', '9.9.9')));
        expect(result.status).toBe(1);
        expect(result.output).toContain('fresh-lib@9.9.9');
        expect(result.output).toContain('published less than 7 day(s) ago');
    });

    it('checks entries that carry no resolved URL against the default registry', async () => {
        // `--package-lock-only` omits `resolved` on most entries, so skipping
        // them would drop most of the real tree from the check.
        publishTimes['lock-only-lib'] = { '3.0.0': isoDaysAgo(1) };
        const result = await run(
            lockfile({
                'libs/demo': { name: 'demo', version: '1.0.0' },
                'libs/demo/node_modules/lock-only-lib': { version: '3.0.0' },
            }),
        );
        expect(result.status).toBe(1);
        expect(result.output).toContain('lock-only-lib@3.0.0');
    });

    it('skips workspace links: they are packages this repository contains', async () => {
        publishTimes['settled-lib'] = { '1.2.3': isoDaysAgo(30) };
        const result = await run(
            lockfile({
                'libs/types': { name: '@ezclassify/types', version: '1.0.0' },
                'node_modules/@ezclassify/types': {
                    resolved: 'libs/types',
                    link: true,
                },
                ...fromRegistry('settled-lib', '1.2.3'),
            }),
        );
        expect(result.status).toBe(0);
        expect(result.output).toContain('1 package(s)');
    });

    it('refuses an EzClassify package that would install from a registry, however old', async () => {
        // Nothing here may depend on an EzClassify package built elsewhere, so
        // a registry copy of one is refused even when it is well outside the
        // window.
        publishTimes['@ezclassify/engine'] = { '9.9.9': isoDaysAgo(30) };
        const result = await run(
            lockfile(fromRegistry('@ezclassify/engine', '9.9.9')),
        );
        expect(result.status).toBe(1);
        expect(result.output).toContain('depends on no EzClassify package');
        expect(result.output).toContain('@ezclassify/engine@9.9.9');
    });

    it('fails when the registry reports no publish date for the version', async () => {
        publishTimes['silent-lib'] = { '1.0.0': isoDaysAgo(30) };
        const result = await run(lockfile(fromRegistry('silent-lib', '2.0.0')));
        expect(result.status).toBe(1);
        expect(result.output).toContain('no publish date for silent-lib@2.0.0');
    });

    it('fails on an unreachable registry and still reports real violations', async () => {
        publishTimes['fresh-lib'] = { '9.9.9': isoDaysAgo(1) };
        const result = await run(
            lockfile({
                'node_modules/unreachable-lib': {
                    version: '1.0.0',
                    resolved:
                        'http://127.0.0.1:1/unreachable-lib/-/unreachable-lib-1.0.0.tgz',
                },
                ...fromRegistry('fresh-lib', '9.9.9'),
            }),
        );
        expect(result.status).toBe(1);
        expect(result.output).toContain('Could not reach http://127.0.0.1:1');
        expect(result.output).toContain('fresh-lib@9.9.9');
    });
});
