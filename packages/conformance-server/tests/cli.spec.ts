import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

/**
 * The `npx` entry, driven the way a consumer drives it.
 *
 * The programmatic API is covered elsewhere; what is only true of the CLI is
 * that it parses flags, prints something a script can wait on, and stops when
 * it is told to.
 */

const bin = path.resolve(
    path.dirname(fileURLToPath(import.meta.url)),
    '..',
    'bin',
    'ezclassify-conformance-server.mjs',
);

function run(
    args: string[],
): Promise<{ code: number | null; stdout: string; stderr: string }> {
    return new Promise((resolve, reject) => {
        const child = spawn(process.execPath, [bin, ...args], {
            stdio: 'pipe',
        });
        let stdout = '';
        let stderr = '';
        child.stdout.on('data', (chunk) => (stdout += chunk));
        child.stderr.on('data', (chunk) => (stderr += chunk));
        child.on('error', reject);
        child.on('close', (code) => resolve({ code, stderr, stdout }));
    });
}

/** Start the server and resolve once it has announced a URL. */
function serve(args: string[]): Promise<{
    child: ChildProcessWithoutNullStreams;
    url: string;
    banner: string;
}> {
    return new Promise((resolve, reject) => {
        const child = spawn(process.execPath, [bin, ...args], {
            stdio: 'pipe',
        });
        let banner = '';
        const timer = setTimeout(() => {
            child.kill('SIGKILL');
            reject(new Error(`the server printed no URL: ${banner}`));
        }, 20_000);
        child.stdout.on('data', (chunk) => {
            banner += chunk;
            const found = /listening on (http:\/\/\S+)/.exec(banner);
            if (found) {
                clearTimeout(timer);
                resolve({ banner, child, url: found[1] });
            }
        });
        child.on('error', (cause) => {
            clearTimeout(timer);
            reject(cause);
        });
    });
}

describe('the CLI', () => {
    it('prints usage naming the test bearer', async () => {
        const { code, stdout } = await run(['--help']);
        expect(code).toBe(0);
        expect(stdout).toContain('ezclassify-conformance-test-bearer');
        expect(stdout).toContain('--corpus');
    });

    it('lists integration profiles without starting a listener', async () => {
        const { code, stdout } = await run(['--list-scenarios']);
        expect(code).toBe(0);
        expect(stdout).toContain('cedar-valley:');
        expect(stdout).toContain('rate-limit:');
    });

    it('rejects unknown scenarios and conflicting selection', async () => {
        expect((await run(['--scenario', 'unknown'])).code).toBe(1);
        expect(
            (await run(['--scenario', 'cedar-valley', '--corpus', '/unused']))
                .stderr,
        ).toContain('scenario and corpus');
    });

    it('runs the selected integration scenario from the command line', async () => {
        const { child, url, banner } = await serve([
            '--port',
            '0',
            '--scenario',
            'cedar-valley',
        ]);
        try {
            expect(banner).toContain('integration scenario cedar-valley');
            expect((await fetch(`${url}/v1/ready`)).status).toBe(200);
        } finally {
            const stopped = new Promise((resolve) =>
                child.on('close', resolve),
            );
            child.kill('SIGTERM');
            await stopped;
        }
    });

    it('rejects an option it does not have', async () => {
        const { code, stderr } = await run(['--nope']);
        expect(code).toBe(2);
        expect(stderr).toContain('unknown option --nope');
    });

    it('rejects a port that is not one', async () => {
        const { code, stderr } = await run(['--port', 'eighty']);
        expect(code).toBe(2);
        expect(stderr).toContain('--port needs a port number');
    });

    it('reports a corpus it cannot load instead of listening anyway', async () => {
        const { code, stderr } = await run([
            '--port',
            '0',
            '--corpus',
            '/nope/absent.json',
        ]);
        expect(code).toBe(1);
        expect(stderr).toContain('Cannot start');
    });

    it('serves on an ephemeral port and shuts down on a signal', async () => {
        const { banner, child, url } = await serve(['--port', '0']);
        try {
            expect(banner).toContain('recorded exchanges');
            expect(banner).toContain('auth none');
            const response = await fetch(`${url}/v1/health`);
            expect(response.status).toBe(200);
            await expect(response.json()).resolves.toMatchObject({
                status: 'ok',
            });
        } finally {
            const stopped = new Promise((resolve) =>
                child.on('close', resolve),
            );
            child.kill('SIGTERM');
            await stopped;
        }
    }, 30_000);

    it('takes the auth mode from the command line', async () => {
        const { banner, child, url } = await serve([
            '--port',
            '0',
            '--auth',
            'simulated',
        ]);
        try {
            expect(banner).toContain('auth simulated');
            const response = await fetch(`${url}/v1/scheme/list`);
            expect(response.status).toBe(404);
            await expect(response.json()).resolves.toEqual({
                error: 'not_found',
            });
        } finally {
            const stopped = new Promise((resolve) =>
                child.on('close', resolve),
            );
            child.kill('SIGTERM');
            await stopped;
        }
    }, 30_000);
});
