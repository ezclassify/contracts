import { readFileSync } from 'node:fs';

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import {
    canonicalJson,
    loadCorpus,
    matchKey,
    startConformanceServer,
    type ConformanceServer,
    type CorpusCase,
} from '@ezclassify/conformance-server';

/**
 * The whole promise of this package in one file: a client speaking real HTTP
 * gets back exactly what the runtime answered when the corpus was recorded. Not
 * an approximation of it, and not something this package computed.
 */

const corpus = loadCorpus();
const readme = readFileSync(new URL('../README.md', import.meta.url), 'utf8');
const caseById = (id: string): CorpusCase => {
    const found = corpus.servable.find((entry) => entry.id === id);
    if (!found) throw new Error(`the bundled corpus has no case ${id}`);
    return found;
};

/** Replay one recorded case through the server and compare every recorded part. */
async function replay(server: ConformanceServer, recorded: CorpusCase) {
    const { body, method, path } = recorded.request;
    const response = await fetch(`${server.url}${path}`, {
        body: body === undefined ? undefined : JSON.stringify(body),
        headers:
            body === undefined ? {} : { 'content-type': 'application/json' },
        method,
    });
    return {
        body: await response.json(),
        headers: Object.fromEntries(
            Object.keys(recorded.response.headers).map((name) => [
                name,
                response.headers.get(name),
            ]),
        ),
        status: response.status,
    };
}

describe('replaying the bundled corpus', () => {
    let server: ConformanceServer;

    beforeAll(async () => {
        server = await startConformanceServer({ log: null, port: 0 });
    });

    afterAll(async () => {
        await server.stop();
    });

    it('reports what it loaded', () => {
        expect(server.corpus.corpusVersion).toBe('v1');
        expect(server.corpus.servable).toBeGreaterThan(50);
        expect(server.url).toMatch(/^http:\/\/127\.0\.0\.1:\d+$/);
    });

    it('serves the POST exchange documented in the quick start', async () => {
        const documented =
            /curl -s http:\/\/127\.0\.0\.1:4010(\/\S+) \\\n\s+-H 'content-type: application\/json' \\\n\s+-d '([^']+)'/.exec(
                readme,
            );
        expect(documented).not.toBeNull();

        const response = await fetch(`${server.url}${documented![1]}`, {
            body: documented![2],
            headers: { 'content-type': 'application/json' },
            method: 'POST',
        });
        expect(response.status).toBe(200);
        await expect(response.json()).resolves.toEqual(
            caseById('ctx-scheme-process.ok').response.body,
        );
    });

    // One per shape the wire has: a GET with no body, a POST with one, a
    // context operation carrying the resolved-version header, an error status
    // the contract declares, a 405 that is the only place the wire states a
    // method set, and the route-table miss the refusal 404 gets confused with.
    it.each([
        'health.ok',
        'ctx-scheme-process.ok',
        'ctx-scheme-apply-preset.unknown',
        'method-guard.allow-header',
        'route-miss.route-not-found',
    ])('serves %s exactly as recorded', async (id) => {
        const recorded = caseById(id);
        const served = await replay(server, recorded);
        expect(served.status).toBe(recorded.response.status);
        expect(served.body).toEqual(recorded.response.body);
        expect(served.headers).toEqual(recorded.response.headers);
    });

    it('matches a body whose keys arrived in another order', async () => {
        const recorded = caseById('ctx-scheme-process.ok');
        const reversed = Object.fromEntries(
            Object.entries(
                recorded.request.body as Record<string, unknown>,
            ).reverse(),
        );
        const response = await fetch(`${server.url}${recorded.request.path}`, {
            body: JSON.stringify(reversed),
            headers: { 'content-type': 'application/json' },
            method: 'POST',
        });
        expect(response.status).toBe(200);
        await expect(response.json()).resolves.toEqual(recorded.response.body);
    });

    it('keeps own prototype-named JSON fields in canonical request identity', () => {
        const ordinary = JSON.parse('{"input":"MED"}') as Record<
            string,
            unknown
        >;
        const adversarial = JSON.parse(
            '{"input":"MED","__proto__":{"admin":true}}',
        ) as Record<string, unknown>;
        const nested = JSON.parse(
            '{"input":"MED","extra":{"__proto__":"x","constructor":"y","toString":"z"}}',
        ) as Record<string, unknown>;

        expect(Object.hasOwn(adversarial, '__proto__')).toBe(true);
        expect(canonicalJson(adversarial)).toContain('"__proto__"');
        expect(canonicalJson(nested)).toContain('"__proto__"');
        expect(canonicalJson(nested)).toContain('"constructor"');
        expect(canonicalJson(nested)).toContain('"toString"');
        expect(matchKey('POST', '/v1/scheme/process', adversarial)).not.toBe(
            matchKey('POST', '/v1/scheme/process', ordinary),
        );
    });

    it('diagnoses a raw JSON body with an unrecorded own __proto__ field', async () => {
        const recorded = caseById('ctx-scheme-process.ok');
        const ordinary = JSON.stringify(recorded.request.body);
        const adversarial = `${ordinary.slice(0, -1)},"__proto__":{"admin":true}}`;
        const extra = `${ordinary.slice(0, -1)},"extra":true}`;
        expect(Object.hasOwn(JSON.parse(adversarial), '__proto__')).toBe(true);

        const post = (body: string) =>
            fetch(`${server.url}${recorded.request.path}`, {
                body,
                headers: { 'content-type': 'application/json' },
                method: 'POST',
            });
        const hit = await post(ordinary);
        const ordinaryMiss = await post(extra);
        const adversarialMiss = await post(adversarial);

        expect(hit.status).toBe(recorded.response.status);
        expect(ordinaryMiss.status).toBe(501);
        expect(adversarialMiss.status).toBe(501);
        expect(adversarialMiss.headers.get('x-ezclassify-conformance')).toBe(
            'unmatched-request',
        );
    });

    it('matches a query string whose parameters arrived in another order', async () => {
        const recorded = caseById('ctx-scheme-describe-concept.ok');
        const [path, query] = recorded.request.path.split('?');
        const reordered = `${path}?${query.split('&').reverse().join('&')}`;
        expect(reordered).not.toBe(recorded.request.path);

        const response = await fetch(`${server.url}${reordered}`);
        expect(response.status).toBe(200);
        await expect(response.json()).resolves.toEqual(recorded.response.body);
    });

    it('does not treat a missing body as an empty one', async () => {
        // route-miss.ctx-operation-not-found is recorded with `{}`. Sending
        // nothing is a different request, and the corpus does not answer it.
        const recorded = caseById('route-miss.ctx-operation-not-found');
        expect(recorded.request.body).toEqual({});

        const withBody = await fetch(`${server.url}${recorded.request.path}`, {
            body: '{}',
            headers: { 'content-type': 'application/json' },
            method: 'POST',
        });
        expect(withBody.status).toBe(recorded.response.status);

        const withoutBody = await fetch(
            `${server.url}${recorded.request.path}`,
            {
                method: 'POST',
            },
        );
        expect(withoutBody.status).toBe(501);
    });
});
