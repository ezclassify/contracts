import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import yaml from 'js-yaml';
import { describe, expect, it } from 'vitest';

/**
 * A Context can hold more than one scheme, and every scheme route answers in
 * the one `?scheme=` names. A host marking in a crosswalk's target scheme reads
 * that scheme's concepts and processes, validates and aggregates in it, so a
 * route without the selector is a route that can only ever answer in the
 * primary, and its caller gets the primary's answer to a question about the
 * other scheme.
 */

const packageRoot = path.resolve(
    path.dirname(fileURLToPath(import.meta.url)),
    '..',
);

interface Parameter {
    name?: string;
    in?: string;
    required?: boolean;
    description?: string;
    schema?: { type?: string };
    $ref?: string;
}

const spec = yaml.load(
    readFileSync(path.join(packageRoot, 'openapi.yaml'), 'utf8'),
) as {
    paths: Record<
        string,
        Record<string, { operationId: string; parameters?: Parameter[] }>
    >;
};

const SCHEME_ROUTE = /^\/v1\/ctx\/\{ctxId\}\/\{version\}\/scheme(\/|$)/;

/** Every operation under a Context's scheme routes, with its selector. */
const schemeOperations = Object.entries(spec.paths)
    .filter(([route]) => SCHEME_ROUTE.test(route))
    .flatMap(([route, item]) =>
        Object.entries(item).map(([method, operation]) => ({
            route,
            method,
            operationId: operation.operationId,
            selector: (operation.parameters ?? []).filter(
                (one) => one.in === 'query' && one.name === 'scheme',
            ),
        })),
    );

describe('The ?scheme= selector', () => {
    it('is taken by every scheme route, reads and operations alike', () => {
        const operationIds = schemeOperations.map((one) => one.operationId);
        // The operations a host marks with, not only the reads.
        expect(operationIds).toEqual(
            expect.arrayContaining([
                'ctxSchemeSummary',
                'ctxSchemeConcepts',
                'ctxSchemeProcess',
                'ctxSchemeValidate',
                'ctxSchemeAggregate',
                'ctxSchemeApplyPreset',
                'ctxSchemeDescribeConcept',
            ]),
        );
        const missing = schemeOperations
            .filter((one) => one.selector.length !== 1)
            .map((one) => `${one.method.toUpperCase()} ${one.route}`);
        expect(missing).toEqual([]);
    });

    it('is optional, a string, and inline on each operation', () => {
        for (const { operationId, selector } of schemeOperations) {
            const [parameter] = selector;
            expect(parameter?.$ref, operationId).toBeUndefined();
            expect(parameter?.required, operationId).toBe(false);
            expect(parameter?.schema, operationId).toEqual({ type: 'string' });
        }
    });

    it('means the same thing on every route', () => {
        const descriptions = new Set(
            schemeOperations.map(({ selector }) => selector[0]?.description),
        );
        expect(descriptions.size).toBe(1);
        const [description] = [...descriptions];
        expect(description).toMatch(/primary scheme answers/);
        // Marking integrity fails closed: an unknown selector is refused, not
        // quietly answered in the primary.
        expect(description).toMatch(/answers 404; it never falls back/);
    });

    it('is not offered outside the scheme routes', () => {
        const elsewhere = Object.entries(spec.paths)
            .filter(([route]) => !SCHEME_ROUTE.test(route))
            .flatMap(([route, item]) =>
                Object.entries(item)
                    .filter(([, operation]) =>
                        (operation.parameters ?? []).some(
                            (one) =>
                                one.in === 'query' && one.name === 'scheme',
                        ),
                    )
                    .map(([method]) => `${method.toUpperCase()} ${route}`),
            );
        expect(elsewhere).toEqual([]);
    });
});
