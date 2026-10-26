import { afterEach, describe, expect, it, vi } from 'vitest';
import { createRequire } from 'node:module';
import Ajv2020 from 'ajv/dist/2020.js';
import addFormats from 'ajv-formats';
import {
    listIntegrationScenarios,
    readScenarioCases,
    startConformanceServer,
    type ConformanceServer,
    type CorpusCase,
    type ExchangeObservation,
} from '@ezclassify/conformance-server';

const spec = createRequire(import.meta.url)('@ezclassify/openapi/openapi.json');
const schemaUri = 'https://scenario-tests.ezclassify.com/openapi.json';
const ajv = new Ajv2020({ strict: false, allErrors: true });
addFormats(ajv);
ajv.addSchema({ ...spec, $id: schemaUri });
const validator = (pointer: string) =>
    ajv.compile({ $ref: `${schemaUri}#${pointer}` });

const running: ConformanceServer[] = [];
afterEach(async () => {
    await Promise.all(running.splice(0).map((server) => server.stop()));
});
async function start(options = {}) {
    const server = await startConformanceServer({
        log: null,
        scenario: 'cedar-valley',
        ...options,
    });
    running.push(server);
    return server;
}
function send(
    server: ConformanceServer,
    entry: CorpusCase,
    headers = {},
    signal?: AbortSignal,
) {
    return fetch(`${server.url}${entry.request.path}`, {
        method: entry.request.method,
        headers: { 'content-type': 'application/json', ...headers },
        body:
            entry.request.body === undefined
                ? undefined
                : JSON.stringify(entry.request.body),
        signal,
    });
}
const processCases = () =>
    readScenarioCases().filter(
        (entry) =>
            entry.operationId === 'ctxSchemeProcess' &&
            entry.response.status === 200,
    );

describe('integration scenarios', () => {
    it('validates every recorded response against the public wire schemas', () => {
        const cases = readScenarioCases();
        for (const entry of cases) {
            const template = entry.request.pathTemplate!;
            expect(template, entry.id).toBeDefined();
            const escaped = template
                .replaceAll('~', '~0')
                .replaceAll('/', '~1');
            let responsePointer = `/paths/${escaped}/${entry.request.method.toLowerCase()}/responses/${entry.response.status}`;
            const declared =
                spec.paths[template][entry.request.method.toLowerCase()]
                    .responses[entry.response.status];
            if (declared?.$ref) responsePointer = declared.$ref.slice(1);
            const pointer = `${responsePointer}/content/application~1json/schema`;
            const validate = validator(pointer);
            expect(
                validate(entry.response.body),
                `${entry.id}: ${JSON.stringify(validate.errors)}`,
            ).toBe(true);
        }
    });
    it.each(['context-not-found', 'version-not-found'])(
        'replays a real connect refusal for %s',
        async (scenario) => {
            const server = await start({ scenario });
            const entry = readScenarioCases().find(
                (entry) =>
                    entry.operationId === 'ctxDescribe' &&
                    entry.response.status === 200,
            )!;
            const response = await send(server, entry);
            const refusal = readScenarioCases().find(
                (entry) => entry.id === `cedar-valley.${scenario}`,
            )!;
            expect(response.status).toBe(404);
            expect(response.headers.get('x-ezclassify-simulation')).toBeNull();
            for (const [name, value] of Object.entries(
                refusal.response.headers,
            )) {
                expect(response.headers.get(name)).toBe(value);
            }
            const body = await response.json();
            expect(body).toEqual(refusal.response.body);
            expect(body).not.toEqual({ error: 'not_found' });
            expect((await fetch(`${server.url}/v1/ready`)).status).toBe(200);
        },
    );
    it("serves a marking's assertions in print order", async () => {
        // The text is typed in print order and the district share is a fact
        // the marking does not print. The replay lists the share where its
        // field would print it, between the last school and the service.
        const entry = processCases().find(
            (one) => one.id === 'process.complex',
        )!;
        expect(entry).toBeDefined();
        const server = await start();
        const response = await send(server, entry);
        expect(response.status).toBe(200);
        const { result } = (await response.json()) as {
            result: { rendered: string; assertions: { conceptId: string }[] };
        };
        expect(result.rendered).not.toContain('CEDAR VALLEY DISTRICT');
        expect(result.assertions.map((one) => one.conceptId)).toEqual([
            'CONFIDENTIAL',
            'FINANCIAL_INFORMATION',
            'STUDENT_INFORMATION',
            'OAKWOOD',
            'PINECREST',
            'CEDAR_VALLEY_DISTRICT',
            'STUDENT_TRANSPORTATION_SERVICES',
            'DO_NOT_FORWARD',
            'REDACT_BEFORE_RELEASE',
        ]);
    });
    it('rejects invalid selections before listening', async () => {
        await expect(start({ scenario: 'unknown' })).rejects.toThrow(
            'unknown integration scenario',
        );
        await expect(start({ corpus: '/unused' })).rejects.toThrow(
            'scenario and corpus',
        );
        await expect(start({ corsOrigin: '*' })).rejects.toThrow('corsOrigin');
        await expect(start({ observeBodies: true })).rejects.toThrow(
            'observeBodies',
        );
    });
    it('replays every integration recording without simulation', async () => {
        const server = await start();
        for (const entry of readScenarioCases()) {
            const response = await send(server, entry);
            expect(response.status, entry.id).toBe(entry.response.status);
            expect(await response.json(), entry.id).toEqual(
                entry.response.body,
            );
            expect(response.headers.get('x-ezclassify-simulation')).toBeNull();
        }
    });
    it('keeps bootstrap healthy and unsupported requests diagnostic in every fault profile', async () => {
        for (const { name } of listIntegrationScenarios()) {
            const server = await start({ scenario: name });
            expect((await fetch(`${server.url}/v1/ready`)).status, name).toBe(
                200,
            );
            const response = await fetch(`${server.url}/unrecorded`);
            expect(response.status, name).toBe(501);
            expect(response.headers.get('x-ezclassify-simulation')).toBeNull();
        }
    });
    it.each([
        ['transient-error', 500],
        ['rate-limit', 429],
    ])(
        'isolates %s failures by request, reset, and server',
        async (scenario, status) => {
            const [first, second] = processCases();
            expect(second).toBeDefined();
            const server = await start({ scenario });
            const independent = await start({ scenario });
            const failed = await send(server, first);
            expect(failed.status).toBe(status);
            expect(failed.headers.get('x-ezclassify-simulation')).toBe(
                scenario,
            );
            if (status === 429)
                expect(failed.headers.get('retry-after')).toBe('1');
            const validate = validator(
                status === 429
                    ? '/components/schemas/RateLimitError'
                    : '/components/schemas/ErrorResponse',
            );
            expect(validate(await failed.json())).toBe(true);
            expect((await send(server, second)).status).toBe(status);
            expect((await send(server, first)).status).toBe(200);
            expect((await send(independent, first)).status).toBe(status);
            server.resetScenario();
            expect((await send(server, first)).status).toBe(status);
        },
    );
    it('serves persistent failure, malformed JSON, malformed envelope and a disconnected socket', async () => {
        const entry = processCases()[0];
        const unavailable = await start({ scenario: 'unavailable' });
        const unavailableResponse = await send(unavailable, entry);
        expect(unavailableResponse.status).toBe(503);
        expect(
            validator('/components/schemas/ErrorResponse')(
                await unavailableResponse.json(),
            ),
        ).toBe(true);
        expect((await send(unavailable, entry)).status).toBe(503);
        const malformed = await start({ scenario: 'malformed-json' });
        const response = await send(malformed, entry);
        expect(response.status).toBe(200);
        await expect(response.json()).rejects.toThrow();
        const envelope = await start({ scenario: 'malformed-envelope' });
        expect(await (await send(envelope, entry)).json()).toEqual({
            ezclassifySimulation: 'malformed-envelope',
        });
        const disconnected = await start({ scenario: 'disconnected' });
        await expect(send(disconnected, entry)).rejects.toThrow();
    });
    it('delays matching responses and cancels promptly on abort and stop', async () => {
        const server = await start({ scenario: 'slow-response' });
        const entry = processCases()[0];
        const begun = Date.now();
        await expect(
            send(server, entry, {}, AbortSignal.timeout(40)),
        ).rejects.toThrow();
        const pending = send(server, entry).catch(() => undefined);
        await new Promise((resolve) => setTimeout(resolve, 40));
        await server.stop();
        running.splice(running.indexOf(server), 1);
        await pending;
        expect(Date.now() - begun).toBeLessThan(1000);
    });
    it('permits only the selected browser origin and client headers', async () => {
        const server = await start({ corsOrigin: 'http://localhost:5173' });
        const preflight = await fetch(`${server.url}/v1/ctx`, {
            method: 'OPTIONS',
            headers: {
                'origin': 'http://localhost:5173',
                'access-control-request-method': 'GET',
                'access-control-request-headers':
                    'authorization,x-ezclassify-context-token,content-type',
            },
        });
        expect(preflight.status).toBe(204);
        expect(preflight.headers.get('access-control-allow-origin')).toBe(
            'http://localhost:5173',
        );
        expect(preflight.headers.get('access-control-allow-headers')).toMatch(
            /context/i,
        );
        expect(
            preflight.headers.get('access-control-expose-headers'),
        ).toContain('X-EzClassify-Resolved-Version');
        const other = await fetch(`${server.url}/v1/ready`, {
            headers: { origin: 'http://other.test' },
        });
        expect(other.headers.get('access-control-allow-origin')).toBeNull();
    });
    it('observes outcomes with no headers or bodies by default and isolates callback failures', async () => {
        const observations: ExchangeObservation[] = [];
        const server = await start({
            observe: (entry: ExchangeObservation) => {
                observations.push(entry);
                throw new Error('observer failed');
            },
        });
        const entry = processCases()[0];
        const response = await send(server, entry, {
            'authorization': 'Bearer private',
            'x-ezclassify-context-token': 'private-token',
        });
        expect(await response.json()).toEqual(entry.response.body);
        expect(observations).toHaveLength(1);
        expect(observations[0].caseId).toBe(entry.id);
        expect(observations[0].request).toEqual({
            method: entry.request.method,
            path: entry.request.path.split('?')[0],
        });
        expect(JSON.stringify(observations)).not.toMatch(
            /private|authorization|headers/,
        );
    });
    it('observes auth refusals and unsupported diagnostics after the response closes', async () => {
        const observations: ExchangeObservation[] = [];
        const server = await start({
            auth: 'simulated',
            observeBodies: true,
            observe: (value: ExchangeObservation) => {
                observations.push(value);
            },
        });
        const refused = await fetch(`${server.url}/v1/ctx/unrecorded/1.0.0`, {
            method: 'POST',
            body: JSON.stringify({ secret: 'do not buffer' }),
        });
        const refusalBody = await refused.json();
        await vi.waitFor(() => expect(observations).toHaveLength(1));
        expect(observations[0].response).toMatchObject({
            status: 404,
            disconnected: false,
            body: refusalBody,
        });
        expect(observations[0].request).not.toHaveProperty('body');
        const unsupported = await fetch(
            `${server.url}/unrecorded?token=private`,
            {
                headers: {
                    authorization: 'Bearer ezclassify-conformance-test-bearer',
                },
            },
        );
        const diagnostic = await unsupported.json();
        await vi.waitFor(() => expect(observations).toHaveLength(2));
        expect(observations[1].response).toMatchObject({
            status: 501,
            disconnected: false,
            body: diagnostic,
        });
        expect(observations[1].request.path).toBe('/unrecorded');
    });
    it('delivers a successful delayed recording before observing its completion', async () => {
        const observations: ExchangeObservation[] = [];
        const server = await start({
            scenario: 'slow-response',
            observe: (value: ExchangeObservation) => {
                observations.push(value);
            },
        });
        const entry = processCases()[0];
        const begun = Date.now();
        const pending = send(server, entry);
        await new Promise((resolve) => setTimeout(resolve, 80));
        expect(observations).toHaveLength(0);
        const response = await pending;
        expect(await response.json()).toEqual(entry.response.body);
        expect(Date.now() - begun).toBeGreaterThanOrEqual(1450);
        await vi.waitFor(() => expect(observations).toHaveLength(1));
        expect(observations[0].response).toMatchObject({
            status: 200,
            disconnected: false,
            simulated: 'slow-response',
        });
        expect(observations[0].durationMs).toBeGreaterThanOrEqual(1450);
    });
    it('cannot mutate later responses through observed body references', async () => {
        const entry = processCases()[0];
        let count = 0;
        const server = await start({
            observeBodies: true,
            observe: (value: ExchangeObservation) => {
                (value.request.body as Record<string, unknown>).input =
                    'changed';
                (value.response.body as Record<string, unknown>).changed = true;
                count += 1;
            },
        });
        expect(await (await send(server, entry)).json()).toEqual(
            entry.response.body,
        );
        await vi.waitFor(() => expect(count).toBe(1));
        expect(await (await send(server, entry)).json()).toEqual(
            entry.response.body,
        );
        expect((entry.request.body as Record<string, unknown>).input).not.toBe(
            'changed',
        );
    });
    it('includes detached bodies only when explicitly selected', async () => {
        let observation: ExchangeObservation | undefined;
        const server = await start({
            observeBodies: true,
            observe: (value: ExchangeObservation) => {
                observation = value;
            },
        });
        const entry = processCases()[0];
        await send(server, entry);
        expect(observation?.request.body).toEqual(entry.request.body);
        expect(observation?.response.body).toEqual(entry.response.body);
    });
});
