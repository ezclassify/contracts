import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import yaml from 'js-yaml';
import { describe, expect, it } from 'vitest';
import { routeDecls as decls } from '../src/route-decls/index.js';

/**
 * A route can say why it answers an error, and that wording belongs in the
 * published document rather than the bare shared envelope, so a caller reading
 * the spec learns not only that process can answer 400 but that an oversized
 * `parts` list is one of the reasons.
 */

const PACKAGE_ROOT = path.resolve(
    path.dirname(fileURLToPath(import.meta.url)),
    '..',
);

type Response = { $ref?: string; description?: string };
const spec = yaml.load(
    fs.readFileSync(path.join(PACKAGE_ROOT, 'openapi.yaml'), 'utf8'),
) as {
    paths: Record<
        string,
        Record<string, { responses: Record<string, Response> }>
    >;
};

function specPath(routePath: string): string {
    return routePath.replace(/:([A-Za-z]+)/g, '{$1}');
}

describe('route error descriptions', () => {
    it('carries every route-level error description into the document, and only those', () => {
        let described = 0;
        for (const decl of decls) {
            const op =
                spec.paths[specPath(decl.path)]?.[decl.method.toLowerCase()];
            expect(op, `${decl.method} ${decl.path}`).toBeDefined();
            for (const err of decl.errorResponses) {
                const response = op!.responses[String(err.status)];
                expect(response.$ref).toMatch(/^#\/components\/responses\//);
                expect(response.description).toBe(err.description);
                if (err.description) described += 1;
            }
        }
        expect(described).toBeGreaterThan(0);
    });

    it('says the parts cap on process, validate and explain is set by the deployment, with no schema maximum', () => {
        // `parts` changes what the whole is judged against, so the reader's
        // call takes it as well as the author's, and all three share one cap.
        const routes = ['process', 'validate', 'explain'];
        for (const route of routes) {
            const op =
                spec.paths[`/v1/ctx/{ctxId}/{version}/scheme/${route}`].post;
            expect(op.responses['400'].description).toMatch(
                /`parts` holds more entries than this deployment allows/,
            );
        }
        const bodies = (
            yaml.load(
                fs.readFileSync(
                    path.join(PACKAGE_ROOT, 'openapi.yaml'),
                    'utf8',
                ),
            ) as {
                components: {
                    schemas: Record<
                        string,
                        { properties: Record<string, { maxItems?: number }> }
                    >;
                };
            }
        ).components.schemas;
        for (const body of [
            'CtxSchemeProcessRequestBody',
            'CtxSchemeValidateRequestBody',
            'CtxSchemeExplainRequestBody',
        ]) {
            expect(bodies[body].properties.parts).toBeDefined();
            expect(bodies[body].properties.parts.maxItems).toBeUndefined();
        }
        // Negative control: a route without `parts` says nothing about a cap.
        expect(
            spec.paths['/v1/ctx/{ctxId}/{version}/scheme/normalize'].post
                .responses['400'].description ?? '',
        ).not.toMatch(/`parts`/);
    });
});
