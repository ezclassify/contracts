import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import yaml from 'js-yaml';
import { describe, expect, it } from 'vitest';
import { ERROR_REF_TARGETS } from '../scripts/emit-openapi.js';

/**
 * The adapter contract in `@ezclassify/types` promises that every operation on
 * a base interface works whether the engine is in process or behind HTTP. For
 * the remote half that is a claim about this document, and a claim about a
 * document is only worth what a check makes it worth.
 *
 * `gated` shows why. `Suggestion.gated` is "only populated when the caller
 * passes includeGated: true", and every suggest request body refuses unknown
 * properties, so the flag has to be on the request bodies or the explanatory
 * rows a picker shows cannot be asked for over the wire at all. Each file can
 * read fine on its own; only a comparison catches the gap.
 */

const PACKAGE_ROOT = path.resolve(
    path.dirname(fileURLToPath(import.meta.url)),
    '..',
);

type Schema = {
    type?: string;
    enum?: unknown[];
    anyOf?: Record<string, unknown>[];
    properties?: Record<string, Record<string, unknown>>;
    required?: string[];
    additionalProperties?: boolean;
};

const spec = yaml.load(
    fs.readFileSync(path.join(PACKAGE_ROOT, 'openapi.yaml'), 'utf8'),
) as {
    info: { description: string };
    security?: Array<Record<string, string[]>>;
    paths: Record<string, Record<string, Record<string, unknown>>>;
    components: {
        schemas: Record<string, Schema>;
        responses?: Record<string, Record<string, unknown>>;
        securitySchemes?: Record<string, Record<string, unknown>>;
    };
};

const ANONYMOUS_ROUTES = ['/v1/health', '/v1/ready'];

const schema = (name: string): Schema => {
    const found = spec.components.schemas[name];
    expect(found, `components.schemas.${name}`).toBeDefined();
    return found;
};

const operation = (route: string, method: string) => {
    const found = spec.paths[route]?.[method];
    expect(found, `${method.toUpperCase()} ${route}`).toBeDefined();
    return found as {
        operationId: string;
        security?: unknown;
        requestBody?: {
            content: Record<string, { schema: { $ref?: string } }>;
        };
        responses: Record<
            string,
            { content?: Record<string, { schema: { $ref?: string } }> }
        >;
    };
};

const requestRef = (route: string, method: string): string | undefined =>
    operation(route, method).requestBody?.content['application/json']?.schema
        .$ref;

const responseRef = (route: string, method: string): string | undefined =>
    operation(route, method).responses['200']?.content?.['application/json']
        ?.schema.$ref;

describe('the wire serves what the adapter contract promises', () => {
    it('lets a caller ask for gated suggestions', () => {
        for (const name of ['CtxSchemeSuggestRequestBody']) {
            const body = schema(name);
            expect(body.properties?.['includeGated']).toMatchObject({
                type: 'boolean',
            });
            // The flag is only reachable because these bodies are closed: an
            // unknown property is refused, so smuggling it through is not an
            // option a client has.
            expect(body.additionalProperties).toBe(false);
        }

        expect(schema('Suggestion').properties?.['gated']).toBeDefined();
    });

    it.each([
        [
            '/v1/ctx/{ctxId}/{version}/scheme/suggest-for-categories',
            'CtxSchemeSuggestForCategoriesRequestBody',
        ],
    ])('collapses the per-category suggest fan-out at %s', (route, body) => {
        expect(requestRef(route, 'post')).toBe(`#/components/schemas/${body}`);

        const request = schema(body);
        expect(request.required).toEqual(
            expect.arrayContaining(['assertions', 'categoryIds']),
        );
        // No `inputFormat`: this operation takes a committed assertion set and
        // never reads text, so there is nothing for an input format to select.
        expect(request.properties?.['inputFormat']).toBeUndefined();
        expect(request.properties?.['outputFormat']).toBeDefined();
        expect(request.properties?.['surface']).toBeDefined();
        expect(request.additionalProperties).toBe(false);
    });

    it('answers suggestForCategories with the map process answers in suggestionsFor', () => {
        // One shape for one answer: the route, the adapter and a process call
        // that names `suggestFor` all key the results by category id.
        expect(schema('SuggestResultsByCategory')).toMatchObject({
            type: 'object',
            additionalProperties: {
                $ref: '#/components/schemas/SuggestResult',
            },
        });
        expect(
            responseRef(
                '/v1/ctx/{ctxId}/{version}/scheme/suggest-for-categories',
                'post',
            ),
        ).toBe('#/components/schemas/ContextSchemeSuggestForCategoriesResult');
        expect(
            schema('ContextSchemeSuggestForCategoriesResult').properties?.[
                'result'
            ],
        ).toMatchObject({
            $ref: '#/components/schemas/SuggestResultsByCategory',
        });
        expect(
            schema('ProcessResult').properties?.['suggestionsFor'],
        ).toMatchObject({
            $ref: '#/components/schemas/SuggestResultsByCategory',
        });
        // Negative control: the ordered-array form is gone from the document.
        expect(spec.components.schemas['SuggestForCategoriesResponse']).toBe(
            undefined,
        );
    });

    it('translates a marking through a context crosswalk', () => {
        const route = '/v1/ctx/{ctxId}/{version}/crosswalk/translate';
        expect(requestRef(route, 'post')).toBe(
            '#/components/schemas/CtxCrosswalkTranslateRequestBody',
        );

        // The source arrives in the two fields the access check on this same
        // surface already uses: a `marking` string or its `assertions` form.
        // Only the crosswalk id is required by shape; which of the two the
        // caller sends is a constraint the description carries, because a
        // caller that sends neither, or both, is a 400.
        const request = schema('CtxCrosswalkTranslateRequestBody');
        expect(request.required).toEqual(['crosswalkId']);
        expect(request.properties?.['marking']).toMatchObject({
            type: 'string',
        });
        expect(request.properties?.['assertions']).toMatchObject({
            type: 'array',
            items: { $ref: '#/components/schemas/Assertion' },
        });
        expect(request.additionalProperties).toBe(false);

        expect(responseRef(route, 'post')).toBe(
            '#/components/schemas/ContextCrosswalkTranslationResult',
        );
        expect(
            schema('ContextCrosswalkTranslationResult').properties?.['result'],
        ).toMatchObject({
            $ref: '#/components/schemas/CrosswalkTranslationResult',
        });
    });

    /**
     * The MCP catalog builder turns an operation's request body into a tool
     * input schema, and it refuses a union of a scalar and an array in one
     * field: the tool call it would have to describe has no single answer for
     * what the field holds. A body that carries one is not a documentation
     * problem, it is an operation no MCP tool can be built on.
     */
    it('gives no request body a field that is a scalar or an array', () => {
        const isScalarArrayUnion = (branches: Record<string, unknown>[]) =>
            branches.some((branch) => branch['type'] === 'array') &&
            branches.some(
                (branch) =>
                    typeof branch['type'] === 'string' &&
                    branch['type'] !== 'array' &&
                    branch['type'] !== 'null',
            );

        const offenders: string[] = [];
        for (const [route, item] of Object.entries(spec.paths)) {
            for (const [method, op] of Object.entries(item)) {
                const operation = op as {
                    requestBody?: {
                        content: Record<string, { schema: { $ref?: string } }>;
                    };
                };
                const ref =
                    operation.requestBody?.content['application/json']?.schema
                        .$ref;
                if (!ref) continue;
                const body = schema(ref.replace('#/components/schemas/', ''));
                for (const [field, property] of Object.entries(
                    body.properties ?? {},
                )) {
                    const branches = property['anyOf'] ?? property['oneOf'];
                    if (!Array.isArray(branches)) continue;
                    if (isScalarArrayUnion(branches))
                        offenders.push(
                            `${method.toUpperCase()} ${route} ${field}`,
                        );
                }
            }
        }
        expect(offenders).toEqual([]);
    });

    /**
     * SDK generation refuses an anonymous nested enum or object: the generator
     * has no name to give the type, so it invents one per language and the five
     * SDKs disagree about what the same wire shape is called. Every crosswalk
     * schema a generator has to reach is therefore a component.
     */
    it('names every crosswalk schema a generator has to address', () => {
        expect(schema('CrosswalkForbidMatch').anyOf).toEqual([
            { $ref: '#/components/schemas/CrosswalkMappingForbidMatch' },
            { $ref: '#/components/schemas/CrosswalkSelectionForbidMatch' },
        ]);
        expect(
            schema('CrosswalkMappingForbidMatch').properties?.['kind'],
        ).toMatchObject({ const: 'mapping' });
        expect(
            schema('CrosswalkSelectionForbidMatch').properties?.['kind'],
        ).toMatchObject({ const: 'selection-candidate' });

        expect(
            schema('CrosswalkCompletedTranslationResult').properties?.[
                'status'
            ],
        ).toMatchObject({
            $ref: '#/components/schemas/CrosswalkCompletedTranslationStatus',
        });
        expect(schema('CrosswalkCompletedTranslationStatus').enum).toEqual([
            'complete',
            'partial',
            'invalid-source',
        ]);

        // The forbidden branch pins the one status it can carry, which is what
        // lets a caller discriminate the union on `status` alone.
        expect(
            schema('CrosswalkForbiddenTranslationResult').properties?.[
                'status'
            ],
        ).toMatchObject({ const: 'forbidden' });
    });

    it('describes every access rule in one call', () => {
        const route = '/v1/ctx/{ctxId}/{version}/access/rules';
        expect(operation(route, 'get').operationId).toBe('ctxAccessRules');
        expect(responseRef(route, 'get')).toBe(
            '#/components/schemas/CtxAccessRulesResponseBody',
        );
        expect(
            schema('CtxAccessRulesResponseBody').properties?.['rules'],
        ).toEqual({
            type: 'array',
            items: { $ref: '#/components/schemas/AccessRuleDescription' },
            description: expect.any(String),
        });
    });

    it('requires the access-check subject the REST handler refuses to omit', () => {
        const route = '/v1/ctx/{ctxId}/{version}/access/check';
        expect(requestRef(route, 'post')).toBe(
            '#/components/schemas/CtxAccessCheckRequestBody',
        );
        const request = schema('CtxAccessCheckRequestBody');
        expect(request.required ?? []).toContain('userAttributes');
        expect(request.properties?.['userAttributes']).toMatchObject({
            type: 'object',
        });
        expect(request.additionalProperties).toBe(false);
    });
});

describe('every operation can be rate limited', () => {
    it('declares the 429 envelope, with Retry-After, on every operation', () => {
        const operations = Object.entries(spec.paths).flatMap(([path, item]) =>
            Object.entries(item as Record<string, { responses?: unknown }>)
                .filter(([method]) => ['get', 'post'].includes(method))
                .map(([method, operation]) => ({ path, method, operation })),
        );
        expect(operations.length).toBeGreaterThan(30);
        for (const { path, method, operation } of operations) {
            expect(
                (operation.responses as Record<string, unknown>)['429'],
                `${method.toUpperCase()} ${path}`,
            ).toEqual({ $ref: '#/components/responses/TooManyRequests' });
        }
        const envelope = spec.components.responses?.['TooManyRequests'] as {
            headers: Record<string, unknown>;
        };
        expect(Object.keys(envelope.headers)).toContain('Retry-After');
    });
});

/**
 * A generator reads this document and writes a client. Without the bearer
 * scheme declared here it writes an unauthenticated one for a runtime that
 * requires a credential, and the resulting 404s look like a missing route.
 */
describe('the document says how a caller authenticates', () => {
    it('declares the bearer scheme', () => {
        expect(spec.components.securitySchemes?.['bearerAuth']).toMatchObject({
            type: 'http',
            scheme: 'bearer',
            bearerFormat: 'JWT',
        });
    });

    it('declares the independent Context authorization header', () => {
        expect(spec.components.securitySchemes?.['contextToken']).toMatchObject(
            {
                type: 'apiKey',
                in: 'header',
                name: 'x-ezclassify-context-token',
            },
        );
    });

    it('requires it by default, so a new route is authenticated by omission', () => {
        expect(spec.security).toEqual([{ bearerAuth: [], contextToken: [] }]);

        for (const [route, item] of Object.entries(spec.paths)) {
            if (ANONYMOUS_ROUTES.includes(route)) continue;
            for (const [method, op] of Object.entries(item)) {
                expect(
                    (op as { security?: unknown }).security,
                    `${method.toUpperCase()} ${route} must not opt out of auth`,
                ).toBeUndefined();
            }
        }
    });

    it.each(ANONYMOUS_ROUTES)(
        'exempts %s, which an orchestrator calls before a token exists',
        (route) => {
            expect(operation(route, 'get').security).toEqual([]);
        },
    );

    it('gives a route author no name for an error the server never sends', () => {
        expect(Object.keys(ERROR_REF_TARGETS)).not.toContain('Unauthorized');
        expect(Object.keys(ERROR_REF_TARGETS)).not.toContain('Forbidden');

        // Wider than the 401 case: every selectable error name has to land on
        // a response component that exists, or the route that picks it emits a
        // $ref at nothing.
        for (const target of Object.values(ERROR_REF_TARGETS)) {
            const name = target.replace('#/components/responses/', '');
            expect(
                spec.components.responses?.[name],
                `components.responses.${name}`,
            ).toBeDefined();
        }
    });

    it('warns that a 404 may mean unauthenticated', () => {
        expect(spec.info.description).toMatch(/not proof/);

        // No 401 or 403 anywhere: the constant not-found shape is the whole
        // denial channel, and a status code the server never sends would be a
        // lie a generated client acts on.
        for (const item of Object.values(spec.paths)) {
            for (const op of Object.values(item)) {
                const responses = (op as { responses: Record<string, unknown> })
                    .responses;
                expect(Object.keys(responses)).not.toContain('401');
                expect(Object.keys(responses)).not.toContain('403');
            }
        }
    });
});

/**
 * Five SDKs read this document, and a 404 is the one status they all have to
 * interpret rather than propagate. Without a code to branch on, each of them
 * ends up matching the message, and a reworded error string then breaks five
 * clients at once. So the routed catch-all names itself and the document says
 * so. The refusal deliberately does not: its constant shape is the security
 * property, and the check below is here to keep a future "helpful" code from
 * being added to it.
 */
describe('a 404 says which kind of 404 it is', () => {
    const notFound = spec.components.responses?.['NotFound'] as {
        description: string;
        content: {
            'application/json': {
                examples: Record<string, { value: Record<string, unknown> }>;
            };
        };
    };
    const examples = () =>
        Object.values(notFound.content['application/json'].examples).map(
            (entry) => entry.value,
        );

    it('carries a code a client can match on when no route matched', () => {
        expect(notFound.description).toMatch(/route_not_found/);
        expect(examples()).toContainEqual({
            error: 'Not found: /v1/unknown',
            code: 'route_not_found',
        });
    });

    it('names the code on the error body every 404 shares', () => {
        expect(
            schema('ErrorResponse').properties?.['code']?.description,
        ).toMatch(/route_not_found/);
    });

    it('leaves the refusal constant and codeless', () => {
        const refusal = examples().find(
            (value) => value['error'] === 'not_found',
        );
        expect(refusal).toEqual({ error: 'not_found' });
    });

    it('states the contrast where the unauthenticated warning lives', () => {
        expect(spec.info.description).toMatch(/route_not_found/);
        expect(spec.info.description).toMatch(/security property/);
    });
});
