import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

import { responseReachableSchemas } from '../scripts/emit-openapi.js';

/**
 * The compatibility rule the published contract is held to: a response is open
 * and a request is closed.
 *
 * A generated client that validates responses strictly rejects any body
 * carrying a field it was not generated against. If a response schema ships
 * with `additionalProperties: false`, every additive change to the runtime
 * becomes a breaking change for every SDK generated from this document, and the
 * SDKs are generated from this document.
 *
 * The generator decides openness from where the assembled document reaches a
 * schema, not from a list of names, and this test is the thing that says the
 * computation holds on the file that actually ships.
 */

const PACKAGE_ROOT = path.resolve(
    path.dirname(fileURLToPath(import.meta.url)),
    '..',
);

const spec = JSON.parse(
    fs.readFileSync(path.join(PACKAGE_ROOT, 'openapi.json'), 'utf8'),
) as Record<string, unknown>;

const schemas = (spec['components'] as Record<string, unknown>)[
    'schemas'
] as Record<string, unknown> satisfies Record<string, unknown>;

/** Every path at or under `node` that still refuses unknown fields. */
function closedPaths(node: unknown, trail: string): string[] {
    if (Array.isArray(node)) {
        return node.flatMap((item, index) =>
            closedPaths(item, `${trail}[${index}]`),
        );
    }
    if (!node || typeof node !== 'object') return [];
    const record = node as Record<string, unknown>;
    const here = record['additionalProperties'] === false ? [trail] : [];
    return [
        ...here,
        ...Object.entries(record).flatMap(([key, value]) =>
            closedPaths(value, `${trail}.${key}`),
        ),
    ];
}

describe('the published contract keeps responses open', () => {
    it('reaches a response schema set worth guarding', () => {
        // A walk that silently reached nothing would make every assertion
        // below pass without testing anything.
        expect(responseReachableSchemas(spec).size).toBeGreaterThan(100);
    });

    it('leaves no response-reachable schema closed, at any depth', () => {
        const closed: string[] = [];
        for (const name of responseReachableSchemas(spec)) {
            closed.push(...closedPaths(schemas[name], name));
        }
        expect(closed).toEqual([]);
    });

    it('opens the 429 body every operation declares', () => {
        // The rate limiter answers ahead of route dispatch, so every
        // operation declares the envelope and a client parses what it sends.
        expect(responseReachableSchemas(spec)).toContain('RateLimitError');
    });

    it('keeps request-only bodies closed', () => {
        const reachable = responseReachableSchemas(spec);
        const requestOnly = Object.keys(schemas).filter(
            (name) => !reachable.has(name),
        );
        expect(requestOnly).toContain('CtxSchemeProcessRequestBody');
        const open = requestOnly.filter(
            (name) =>
                (schemas[name] as Record<string, unknown>)['type'] ===
                    'object' &&
                (schemas[name] as Record<string, unknown>)[
                    'additionalProperties'
                ] !== false,
        );
        expect(open).toEqual([]);
    });
});

describe('the published OpenAPI 3.1 document keeps null in JSON Schema', () => {
    it('describes the nullable document whole with a type union', () => {
        expect(spec['openapi']).toBe('3.1.0');
        expect(
            (
                schemas['DocumentAuditReport'] as {
                    properties: Record<string, unknown>;
                }
            ).properties['whole'],
        ).toMatchObject({ type: ['string', 'null'] });
    });

    it('emits no OpenAPI 3.0-only nullable keywords in any schema', () => {
        const occurrences: string[] = [];
        const visit = (node: unknown, trail: string): void => {
            if (Array.isArray(node)) {
                node.forEach((item, index) =>
                    visit(item, `${trail}[${index}]`),
                );
                return;
            }
            if (!node || typeof node !== 'object') return;
            for (const [key, value] of Object.entries(node)) {
                if (key === 'nullable') occurrences.push(`${trail}.${key}`);
                visit(value, `${trail}.${key}`);
            }
        };
        visit(schemas, 'components.schemas');
        expect(occurrences).toEqual([]);
    });
});
