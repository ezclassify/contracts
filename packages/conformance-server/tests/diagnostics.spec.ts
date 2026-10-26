import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import {
    startConformanceServer,
    type ConformanceServer,
} from '@ezclassify/conformance-server';

/**
 * What the server says when it has nothing to say.
 *
 * A replay server that answers an unrecorded request with a bare 404 costs an
 * SDK author an afternoon of guessing. These are the cases where the answer has
 * to point at the mistake, and they are the reason to prefer this over a
 * hand-written stub.
 */

interface Diagnostic {
    ezclassifyConformanceServer: {
        problem: string;
        boundary: string;
        hint?: string;
        operationId?: string;
        nearest: {
            caseId: string;
            path: string;
            methodDiffers?: string;
            pathDiffers?: string;
            bodyDiff?: {
                missing: string[];
                unexpected: string[];
                different: { field: string }[];
            };
        }[];
        specValidation?: {
            at: string;
            keyword: string;
            field?: string;
            message: string;
            declared?: string[];
            allowed?: unknown[];
        }[];
    };
}

describe('unmatched requests', () => {
    let server: ConformanceServer;

    beforeAll(async () => {
        server = await startConformanceServer({ log: null, port: 0 });
    });

    afterAll(async () => {
        await server.stop();
    });

    const post = (
        path: string,
        body: unknown,
        headers: Record<string, string> = {},
    ) =>
        fetch(`${server.url}${path}`, {
            body: typeof body === 'string' ? body : JSON.stringify(body),
            headers: { 'content-type': 'application/json', ...headers },
            method: 'POST',
        });

    const diagnose = async (response: Response) =>
        ((await response.json()) as Diagnostic).ezclassifyConformanceServer;

    it('answers 501 so nothing can mistake it for a wire status', async () => {
        const response = await post('/v1/ctx/ez-full/1.0.0/scheme/process', {
            input: 'OPEN',
            inputFormat: 'banner',
        });
        expect(response.status).toBe(501);
        expect(response.headers.get('x-ezclassify-conformance')).toBe(
            'unmatched-request',
        );
        const report = await diagnose(response);
        expect(report.boundary).toContain('no engine');
    });

    it('names the nearest recording and the fields that differ', async () => {
        const response = await post('/v1/ctx/ez-full/1.0.0/scheme/process', {
            input: 'OPEN',
            inputFormat: 'banner',
        });
        const report = await diagnose(response);
        expect(report.operationId).toBe('ctxSchemeProcess');
        expect(report.nearest[0].caseId).toBe('ctx-scheme-process.ok');
        expect(report.nearest[0].bodyDiff?.unexpected).toEqual(['inputFormat']);
        expect(report.nearest[0].bodyDiff?.missing).toEqual([]);
    });

    it('ranks a same-path recording above a closer-bodied one elsewhere', async () => {
        const response = await post('/v1/ctx/ez-full/1.0.0/scheme/aggregate', {
            nonsense: true,
        });
        const report = await diagnose(response);
        expect(report.nearest[0].path).toBe(
            '/v1/ctx/ez-full/1.0.0/scheme/aggregate',
        );
    });

    it('says so when the path is served by another method', async () => {
        const response = await fetch(`${server.url}/v1/health`, {
            method: 'POST',
        });
        expect(response.status).toBe(501);
        const report = await diagnose(response);
        expect(report.hint).toContain('GET on this path, not POST');
    });

    it('separates a legal request nobody recorded from a broken one', async () => {
        const response = await post('/v1/ctx/ez-full/1.0.0/scheme/process', {
            input: 'A legal marking nobody recorded',
        });
        const report = await diagnose(response);
        expect(report.operationId).toBe('ctxSchemeProcess');
        expect(report.specValidation).toBeUndefined();
        expect(report.hint).toContain('Nobody recorded it');
    });

    it('says so when the contract has no such path', async () => {
        const response = await fetch(`${server.url}/v1/not/a/contract/path`);
        const report = await diagnose(response);
        expect(report.hint).toContain('no operation on this path');
    });

    it('refuses a body that is not JSON without pretending to match', async () => {
        const response = await post(
            '/v1/ctx/ez-full/1.0.0/scheme/process',
            'not json at all',
        );
        expect(response.status).toBe(501);
        expect(response.headers.get('x-ezclassify-conformance')).toBe(
            'malformed-json',
        );
    });
});

describe('spec validation of an incoming request', () => {
    let server: ConformanceServer;

    beforeAll(async () => {
        server = await startConformanceServer({ log: null, port: 0 });
    });

    afterAll(async () => {
        await server.stop();
    });

    const post = (path: string, body: unknown) =>
        fetch(`${server.url}${path}`, {
            body: JSON.stringify(body),
            headers: { 'content-type': 'application/json' },
            method: 'POST',
        });

    const diagnose = async (response: Response) =>
        ((await response.json()) as Diagnostic).ezclassifyConformanceServer;

    it('names the field the contract actually declares', async () => {
        const response = await post('/v1/ctx/ez-full/1.0.0/scheme/process', {
            inpt: 'OPEN',
        });
        const report = await diagnose(response);
        const finding = report.specValidation?.find(
            (entry) => entry.field === 'inpt',
        );
        expect(finding?.keyword).toBe('additionalProperties');
        expect(finding?.message).toContain('The contract calls it "input"');
        expect(finding?.declared).toContain('input');
    });

    it('suggests nothing when the field resembles nothing', async () => {
        const response = await post('/v1/ctx/ez-full/1.0.0/scheme/process', {
            input: 'OPEN',
            zzzzzzzzzzzz: 1,
        });
        const report = await diagnose(response);
        const finding = report.specValidation?.find(
            (entry) => entry.field === 'zzzzzzzzzzzz',
        );
        expect(finding?.message).toBe('(root) has no field "zzzzzzzzzzzz".');
    });

    it('reports a field of the wrong type', async () => {
        const response = await post('/v1/ctx/ez-full/1.0.0/scheme/process', {
            input: 42,
        });
        const report = await diagnose(response);
        expect(
            report.specValidation?.some((entry) => entry.keyword === 'type'),
        ).toBe(true);
    });

    it('reports a required field that is absent', async () => {
        const response = await post(
            '/v1/ctx/ez-full/1.0.0/scheme/suggest-for-categories',
            {
                categoryIds: ['level'],
            },
        );
        const report = await diagnose(response);
        const finding = report.specValidation?.find(
            (entry) => entry.keyword === 'required',
        );
        expect(finding?.message).toContain('assertions');
    });

    it('reaches a misnamed field nested inside an array', async () => {
        // The assertion schema does not close itself with
        // `additionalProperties: false`, so a misspelled field shows up only as
        // the correct one being absent. The finding still has to name it.
        const response = await post(
            '/v1/ctx/ez-full/1.0.0/scheme/suggest-for-categories',
            {
                assertions: [{ categoryId: 'level', concept_id: 'OPEN' }],
                categoryIds: ['level'],
            },
        );
        const report = await diagnose(response);
        const finding = report.specValidation?.find(
            (entry) => entry.field === 'conceptId',
        );
        expect(finding?.at).toBe('/assertions/0');
        expect(finding?.message).toContain('carries "concept_id"');
    });
});

describe('a request body over the ceiling', () => {
    let server: ConformanceServer;

    beforeAll(async () => {
        server = await startConformanceServer({
            log: null,
            maxBodyBytes: 256,
            port: 0,
        });
    });

    afterAll(async () => {
        await server.stop();
    });

    /**
     * The ceiling is real and it has to stay real, but refusing by dropping the
     * socket makes it look like the server crashed. A client gets `fetch
     * failed` with nothing to read, which is the one failure this package
     * promises never to hand anyone.
     */
    it('is refused with a diagnostic that names the limit', async () => {
        const response = await fetch(
            `${server.url}/v1/ctx/ez-full/1.0.0/scheme/process`,
            {
                body: JSON.stringify({
                    input: 'OPEN '.repeat(400),
                }),
                headers: { 'content-type': 'application/json' },
                method: 'POST',
            },
        );
        expect(response.status).toBe(501);
        expect(response.headers.get('x-ezclassify-conformance')).toBe(
            'request-too-large',
        );
        const report = (
            (await response.json()) as {
                ezclassifyConformanceServer: {
                    problem: string;
                    hint: string;
                    maxBodyBytes: number;
                };
            }
        ).ezclassifyConformanceServer;
        expect(report.problem).toBe('request-too-large');
        expect(report.maxBodyBytes).toBe(256);
        expect(report.hint).toContain('maxBodyBytes');
    });

    it('still answers a request that fits', async () => {
        const response = await fetch(`${server.url}/v1/health`);
        expect(response.status).toBe(200);
    });
});
