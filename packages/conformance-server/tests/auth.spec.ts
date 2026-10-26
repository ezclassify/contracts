import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import {
    loadCorpus,
    startConformanceServer,
    TEST_AUTHORIZATION_HEADER,
    type ConformanceServer,
} from '@ezclassify/conformance-server';

/**
 * Both auth modes, measured against the corpus rather than against a
 * description of it.
 *
 * The point of simulating authentication at all is that a refused request on
 * this wire is byte-identical to a missing resource. An SDK has to surface that
 * as "possibly unauthenticated" instead of "not found", and it cannot be tested
 * for that without a server that produces the real bytes.
 */

const corpus = loadCorpus();
const recordedProcess = corpus.servable.find(
    (entry) => entry.id === 'ctx-scheme-process.ok',
);
if (!recordedProcess)
    throw new Error('the bundled corpus has no ctx-scheme-process.ok');
const denial = corpus.denial.response;

async function shape(response: Response) {
    return {
        body: await response.json(),
        headers: Object.fromEntries(
            Object.keys(denial.headers).map((name) => [
                name,
                response.headers.get(name),
            ]),
        ),
        status: response.status,
    };
}

describe('auth mode none', () => {
    let server: ConformanceServer;

    beforeAll(async () => {
        server = await startConformanceServer({ log: null, port: 0 });
    });

    afterAll(async () => {
        await server.stop();
    });

    it('serves a secured operation with no credential at all', async () => {
        const response = await fetch(
            `${server.url}${recordedProcess.request.path}`,
            {
                body: JSON.stringify(recordedProcess.request.body),
                headers: { 'content-type': 'application/json' },
                method: 'POST',
            },
        );
        expect(response.status).toBe(200);
        await expect(response.json()).resolves.toEqual(
            recordedProcess.response.body,
        );
    });

    it('ignores a credential it was given anyway', async () => {
        const response = await fetch(
            `${server.url}${recordedProcess.request.path}`,
            {
                body: JSON.stringify(recordedProcess.request.body),
                headers: {
                    'authorization': 'Bearer whatever-this-mode-does-not-look',
                    'content-type': 'application/json',
                },
                method: 'POST',
            },
        );
        expect(response.status).toBe(200);
    });
});

describe('auth mode simulated', () => {
    let server: ConformanceServer;

    beforeAll(async () => {
        server = await startConformanceServer({
            auth: 'simulated',
            log: null,
            port: 0,
        });
    });

    afterAll(async () => {
        await server.stop();
    });

    const process = (headers: Record<string, string> = {}) =>
        fetch(`${server.url}${recordedProcess.request.path}`, {
            body: JSON.stringify(recordedProcess.request.body),
            headers: { 'content-type': 'application/json', ...headers },
            method: 'POST',
        });

    it('refuses a request with no credential using the corpus bytes', async () => {
        expect(await shape(await process())).toEqual({
            body: denial.body,
            headers: denial.headers,
            status: denial.status,
        });
    });

    it('refuses a credential it does not accept with the same bytes', async () => {
        const refused = await shape(
            await process({ authorization: 'Bearer not-the-one' }),
        );
        const absent = await shape(await process());
        expect(refused).toEqual(absent);
    });

    it('refuses an unknown route the same way, so a 404 proves nothing', async () => {
        const missing = await shape(
            await fetch(`${server.url}/v1/no-such-route`),
        );
        expect(missing.body).toEqual(denial.body);
        expect(missing.status).toBe(denial.status);
        // The same path with a credential is a route-table miss, and it says so.
        const routed = await fetch(`${server.url}/v1/no-such-route`, {
            headers: { authorization: TEST_AUTHORIZATION_HEADER },
        });
        await expect(routed.json()).resolves.toMatchObject({
            code: 'route_not_found',
        });
    });

    it('serves the operation once the documented bearer arrives', async () => {
        const response = await process({
            authorization: TEST_AUTHORIZATION_HEADER,
        });
        expect(response.status).toBe(200);
        await expect(response.json()).resolves.toEqual(
            recordedProcess.response.body,
        );
    });

    it('leaves liveness and readiness open, as the contract declares', async () => {
        for (const path of [
            '/v1/health',
            '/v1/ready',
            // The credential gate and the corpus matcher normalize the path the
            // same way, so a trailing slash is the same anonymous request.
            '/v1/health/',
            '/v1/ready/',
        ]) {
            const response = await fetch(`${server.url}${path}`);
            expect(response.status, path).toBe(200);
        }
    });

    it('rejects an auth mode it does not simulate', async () => {
        await expect(
            startConformanceServer({
                auth: 'oauth' as unknown as 'simulated',
                port: 0,
            }),
        ).rejects.toThrow(/unknown auth mode/);
    });
});
