import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { afterAll, describe, expect, it } from 'vitest';

import {
    BUNDLED_CORPUS_PATH,
    CorpusError,
    loadCorpus,
    readManifest,
    startConformanceServer,
} from '@ezclassify/conformance-server';

/**
 * The loader refuses corpora it cannot answer from unambiguously.
 *
 * A replay server that quietly picks one of two indistinguishable recordings is
 * worse than one that will not start: the SDK it is testing passes, and nobody
 * finds out which answer it was measured against.
 */

const scratch = mkdtempSync(path.join(tmpdir(), 'ezclassify-conformance-'));

function writeCorpus(name: string, cases: unknown[]): string {
    const file = path.join(scratch, `${name}.json`);
    writeFileSync(file, JSON.stringify({ cases, corpusVersion: 'v1' }));
    return file;
}

const refusal = {
    auth: { credential: 'none', deployment: 'authenticated' },
    id: 'denial.recorded',
    request: {
        headers: {},
        method: 'POST',
        path: '/v1/scheme/process',
        body: { input: 'X' },
    },
    response: {
        body: { error: 'not_found' },
        headers: { 'content-type': 'application/json' },
        status: 404,
        statusDeclaredInContract: false,
    },
};

const operation = {
    auth: { credential: 'none', deployment: 'open' },
    id: 'ping.ok',
    operationId: 'getHealth',
    request: { headers: {}, method: 'GET', path: '/v1/health' },
    response: {
        body: { status: 'ok' },
        headers: { 'content-type': 'application/json' },
        status: 200,
        statusDeclaredInContract: true,
    },
};

describe('loading a corpus', () => {
    it('loads the bundled corpus and drops the recorded refusals', () => {
        const loaded = loadCorpus();
        expect(loaded.file).toBe(BUNDLED_CORPUS_PATH);
        expect(loaded.denial.response.body).toEqual({ error: 'not_found' });
        expect(loaded.servable.length).toBeLessThan(loaded.cases.length);
        // Every refusal, including the one recorded on the open deployment
        // against a context route with no carrier.
        for (const entry of loaded.servable) {
            expect(entry.auth.deployment).toBe('open');
            expect(entry.response.body).not.toEqual(
                loaded.denial.response.body,
            );
        }
    });

    it('publishes the manifest the corpus was recorded against', () => {
        const manifest = readManifest() as Record<
            string,
            { digest?: string }
        > | null;
        expect(manifest?.spec?.digest).toMatch(/^sha256:/);
    });

    it('takes a corpus from a path', () => {
        const file = writeCorpus('minimal', [refusal, operation]);
        const loaded = loadCorpus(file);
        expect(loaded.file).toBe(file);
        expect(loaded.servable.map((entry) => entry.id)).toEqual(['ping.ok']);
    });

    it('refuses two cases a live request could not tell apart', () => {
        const file = writeCorpus('ambiguous', [
            refusal,
            operation,
            { ...operation, id: 'ping.also-ok' },
        ]);
        expect(() => loadCorpus(file)).toThrow(CorpusError);
        expect(() => loadCorpus(file)).toThrow(
            /ping\.ok and ping\.also-ok are the same request/,
        );
    });

    it('refuses a corpus with no recorded refusal to simulate auth with', () => {
        const file = writeCorpus('no-denial', [operation]);
        expect(() => loadCorpus(file)).toThrow(/exactly one recorded refusal/);
    });

    it('refuses a corpus with two cases under one id', () => {
        const file = writeCorpus('duplicate-id', [
            refusal,
            operation,
            {
                ...operation,
                request: { ...operation.request, path: '/v1/ready' },
            },
        ]);
        expect(() => loadCorpus(file)).toThrow(
            /two cases with the id ping\.ok/,
        );
    });

    it('refuses a corpus it cannot read', () => {
        expect(() => loadCorpus(path.join(scratch, 'absent.json'))).toThrow(
            CorpusError,
        );
    });
});

describe('serving a corpus from a path', () => {
    const started: { stop: () => Promise<void> }[] = [];

    afterAll(async () => {
        for (const server of started) await server.stop();
    });

    it('replays the override rather than the bundled corpus', async () => {
        const file = writeCorpus('override', [refusal, operation]);
        const server = await startConformanceServer({
            corpus: file,
            log: null,
            port: 0,
        });
        started.push(server);
        expect(server.corpus.file).toBe(file);
        expect(server.corpus.servable).toBe(1);

        const response = await fetch(`${server.url}/v1/health`);
        await expect(response.json()).resolves.toEqual({ status: 'ok' });
    });
});
