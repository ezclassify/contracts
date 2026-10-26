import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

/**
 * The wire corpus is recorded off the real runtime and copied in here. This
 * repository does not produce it and cannot regenerate it, so what it owes
 * consumers is that the bytes it ships are well-formed and carry nothing they
 * should not.
 *
 * The credential check is the one that matters. The corpus is vendored into
 * every SDK repository; a bearer or a signed context carrier that slipped into
 * a recording would be published to all of them, and no replay could reproduce
 * it anyway.
 */

const here = path.dirname(fileURLToPath(import.meta.url));
const wireRoot = path.resolve(here, '..', 'wire', 'v1');

/**
 * The contract the manifest's `spec.digest` is taken over.
 *
 * The YAML, not the JSON. `manifest.spec` names `@ezclassify/openapi`, and that
 * package publishes both files; the digest is over `openapi.yaml`, which is the
 * artifact of record. `openapi.json` is a mechanical restatement of it and
 * hashes to something else, so a check written against the wrong one of the two
 * would never agree with the manifest.
 */
const specPath = path.resolve(here, '..', '..', 'openapi', 'openapi.yaml');

const corpusText = readFileSync(path.join(wireRoot, 'corpus.json'), 'utf8');
const corpus = JSON.parse(corpusText) as {
    corpusVersion: string;
    cases: {
        id: string;
        operationId?: string;
        auth: { deployment: string; credential: string };
        request: {
            method: string;
            path: string;
            headers: Record<string, string>;
        };
        response: { status: number; headers: Record<string, string> };
    }[];
};
const manifest = JSON.parse(
    readFileSync(path.join(wireRoot, 'manifest.json'), 'utf8'),
) as {
    coverage: { cases: number; operationsCovered: number };
    generation: Record<string, unknown>;
    spec: { digest: string; infoVersion: string };
};

describe('wire corpus', () => {
    it('ships cases', () => {
        expect(corpus.corpusVersion).toBe('v1');
        expect(corpus.cases.length).toBeGreaterThan(0);
    });

    it('names every case exactly once', () => {
        const ids = corpus.cases.map((entry) => entry.id);
        expect(new Set(ids).size).toBe(ids.length);
    });

    it('records no credential header', () => {
        // The recording keeps `accept` and `content-type` and nothing else, so
        // a credential cannot arrive as a header without breaking this.
        const carried = corpus.cases
            .flatMap((entry) =>
                Object.keys(entry.request.headers).map(
                    (name) => `${entry.id}: ${name}`,
                ),
            )
            .filter((line) => !/: (accept|content-type)$/.test(line));
        expect(carried).toEqual([]);
    });

    it('records no credential value', () => {
        const offenders: string[] = [];
        const walk = (node: unknown, at: string): void => {
            if (typeof node === 'string') {
                if (/^bearer\s/i.test(node)) offenders.push(`${at}: ${node}`);
                return;
            }
            if (Array.isArray(node)) {
                node.forEach((entry, index) => walk(entry, `${at}[${index}]`));
                return;
            }
            if (node !== null && typeof node === 'object') {
                for (const [key, value] of Object.entries(node))
                    walk(value, `${at}.${key}`);
            }
        };
        walk(corpus, '');
        expect(offenders).toEqual([]);
    });

    it('records a status and a media type for every case', () => {
        for (const entry of corpus.cases) {
            expect(Number.isInteger(entry.response.status), entry.id).toBe(
                true,
            );
            expect(entry.response.headers['content-type'], entry.id).toBe(
                'application/json',
            );
        }
    });

    it('agrees with the manifest it was recorded with', () => {
        expect(manifest.coverage.cases).toBe(corpus.cases.length);
        expect(manifest.spec.digest).toMatch(/^sha256:[0-9a-f]{64}$/);
        const covered = new Set(
            corpus.cases.map((entry) => entry.operationId).filter(Boolean),
        );
        expect(covered.size).toBe(manifest.coverage.operationsCovered);
    });

    /**
     * The pin, and the only thing that enforces it. Nothing regenerates the
     * corpus from this side, so a contract edit that lands here leaves the
     * recordings describing a wire that no longer exists, and the replay server
     * makes that worse: it validates incoming requests against the current
     * contract while answering them out of the older recording. Refreshing the
     * corpus is a separate recording step, so it needs a gate that goes red
     * when someone changes the contract and forgets.
     */
    it('was recorded against the contract this repository ships', () => {
        const digest = createHash('sha256')
            .update(readFileSync(specPath))
            .digest('hex');
        expect(manifest.spec.digest).toBe(`sha256:${digest}`);
    });

    /**
     * The manifest travels further than the repository that records it: this
     * package is Apache-2.0 and is vendored into every SDK mirror. A field
     * naming the private runtime repository, or the command that runs inside
     * it, publishes internal layout to readers who can neither read nor run
     * either. The recorder emits the neutral form; this is the public side of
     * the same line.
     */
    it('names no private repository or internal command', () => {
        expect(Object.keys(manifest.generation).sort()).toEqual([
            'contractVersion',
            'generator',
            'generatorDigest',
        ]);
        const serialized = JSON.stringify(manifest.generation);
        expect(serialized).not.toMatch(/ezclassify\/runtime/);
        expect(serialized).not.toMatch(/rest-api/);
        expect(serialized).not.toMatch(/npm run/);
    });

    it('carries the constant refusal the wire answers an unauthenticated request with', () => {
        const refusals = corpus.cases.filter(
            (entry) =>
                entry.auth.deployment === 'authenticated' &&
                entry.auth.credential === 'none' &&
                entry.response.status === 404,
        );
        expect(refusals).toHaveLength(1);
    });
});
