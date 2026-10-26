import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import yaml from 'js-yaml';
import { describe, expect, it } from 'vitest';
import {
    auditPublicSpec,
    namedPositions,
    readFrozenSurface,
    REACHABLE_BY_VALUE,
    specSurface,
    JSON_FILE,
    SURFACE_FILE,
    YAML_FILE,
} from '../check-public-spec.mjs';

const ROOT = path.resolve(
    path.dirname(fileURLToPath(import.meta.url)),
    '../..',
);

/**
 * The shipped spec, reparsed per test so a planted violation cannot leak from
 * one case into the next.
 */
function loadSpec(): Record<string, any> {
    return yaml.load(fs.readFileSync(YAML_FILE, 'utf8')) as Record<string, any>;
}

function auditOf(spec: Record<string, any>): string[] {
    return auditPublicSpec(spec, {
        frozenSurface: readFrozenSurface(SURFACE_FILE),
        jsonText: `${JSON.stringify(spec, null, 2)}\n`,
    });
}

describe('public spec guard', () => {
    it('passes on the tree as committed', () => {
        const failures = auditPublicSpec(loadSpec(), {
            frozenSurface: readFrozenSurface(SURFACE_FILE),
            jsonText: fs.readFileSync(JSON_FILE, 'utf8'),
        });
        expect(failures).toEqual([]);
    });

    it('keeps the frozen surface file in step with the spec', () => {
        expect(specSurface(loadSpec())).toEqual(
            readFrozenSurface(SURFACE_FILE),
        );
    });

    it('rejects a licensing endpoint', () => {
        const spec = loadSpec();
        spec.paths['/v1/license/status'] = {
            get: {
                operationId: 'getLicenseStatus',
                responses: { '200': { description: 'ok' } },
            },
        };
        const failures = auditOf(spec);
        expect(failures.some((f) => f.startsWith('reserved path'))).toBe(true);
        expect(failures.some((f) => f.startsWith('surface freeze'))).toBe(true);
    });

    it('rejects a debug endpoint', () => {
        const spec = loadSpec();
        spec.paths['/v1/debug/scheme-sources'] = {
            get: {
                operationId: 'debugSchemeSources',
                responses: { '200': { description: 'ok' } },
            },
        };
        expect(auditOf(spec).some((f) => f.startsWith('reserved path'))).toBe(
            true,
        );
    });

    it('rejects an ordinary-looking endpoint that nobody froze', () => {
        const spec = loadSpec();
        spec.paths['/v1/scheme/summarize'] = {
            post: {
                operationId: 'schemeSummarize',
                responses: { '200': { description: 'ok' } },
            },
        };
        expect(auditOf(spec)).toContain(
            'surface freeze: operation not in the frozen public surface: POST /v1/scheme/summarize schemeSummarize',
        );
    });

    it('rejects entitlement vocabulary in a component name', () => {
        const spec = loadSpec();
        spec.components.schemas.StudioGrant = { type: 'object' };
        expect(auditOf(spec)).toContain(
            'entitlement vocabulary: component StudioGrant at $.components.schemas.StudioGrant',
        );
    });

    it('rejects entitlement vocabulary hidden in a property name', () => {
        const spec = loadSpec();
        const target = Object.keys(spec.components.schemas)[0];
        spec.components.schemas[target] = {
            type: 'object',
            properties: { clockFloorPersistence: { type: 'string' } },
        };
        expect(
            auditOf(spec).some(
                (f) =>
                    f ===
                    'entitlement vocabulary: property clockFloorPersistence at ' +
                        `$.components.schemas.${target}.properties.clockFloorPersistence`,
            ),
        ).toBe(true);
    });

    it('leaves legitimate content-licensing and access vocabulary alone', () => {
        const spec = loadSpec();
        const target = Object.keys(spec.components.schemas)[0];
        spec.components.schemas[target] = {
            type: 'object',
            properties: {
                license: { type: 'string' },
                licenseUrl: { type: 'string' },
                granted: { type: 'boolean' },
            },
        };
        expect(
            auditOf(spec).filter((f) => f.startsWith('entitlement vocabulary')),
        ).toEqual([]);
    });

    // A name check that only looked at component keys, operation ids and
    // `components.schemas` property names would miss every position below.
    describe('the default base URL', () => {
        /**
         * Most OpenAPI generators and API explorers take the first `servers`
         * entry as the base URL a consumer starts with. The document shipped
         * with exactly one entry, a plaintext `.test` host, so the only
         * transport it documented for a credential-bearing API was plaintext.
         */
        it('accepts the committed document', () => {
            expect(auditOf(loadSpec())).toEqual([]);
        });

        it('refuses a plaintext first entry', () => {
            const spec = loadSpec();
            spec['servers'] = [
                { url: 'http://api.ezclassify.test' },
                { url: 'https://{host}' },
            ];
            expect(auditOf(spec).join('\n')).toContain('default server');
        });

        it('refuses a document with no servers entry at all', () => {
            const spec = loadSpec();
            delete spec['servers'];
            expect(auditOf(spec).join('\n')).toContain('default server');
        });

        it('keeps the plaintext development entry available, second', () => {
            const servers = loadSpec()['servers'] as { url: string }[];
            expect(servers[0].url.startsWith('https://')).toBe(true);
            expect(servers.map((entry) => entry.url)).toContain(
                'http://api.ezclassify.test',
            );
        });
    });

    describe('prose in descriptions', () => {
        /**
         * Descriptions are lifted from TSDoc comments. A `{@link X}` there is
         * editor markup, and it reached the published document and every SDK
         * generated from it verbatim.
         */
        it('refuses a TSDoc inline tag in a schema description', () => {
            const spec = loadSpec();
            const [name, schema] = Object.entries(
                spec['components']['schemas'] as Record<string, any>,
            )[0];
            schema.description = 'See {@link Other.field} for the details.';
            const failures = auditOf(spec).filter((f) =>
                f.startsWith('source markup'),
            );
            expect(failures).toEqual([
                `source markup: $.components.schemas.${name}.description carries the TSDoc inline tag {@link Other.field}`,
            ]);
        });

        it('refuses one in an operation summary', () => {
            const spec = loadSpec();
            const [route, item] = Object.entries(
                spec['paths'] as Record<string, any>,
            )[0];
            const method = Object.keys(item).find((key) =>
                ['get', 'post', 'put', 'delete', 'patch'].includes(key),
            )!;
            item[method].summary = 'Reads a {@linkcode Thing}';
            expect(auditOf(spec).join('\n')).toContain(
                `$.paths.${route}.${method}.summary carries the TSDoc inline tag {@linkcode Thing}`,
            );
        });

        it('leaves sample data alone', () => {
            const spec = loadSpec();
            const schema = Object.values(
                spec['components']['schemas'] as Record<string, any>,
            )[0];
            schema.example = { description: 'a {@link literal} in data' };
            expect(
                auditOf(spec).filter((f) => f.startsWith('source markup')),
            ).toEqual([]);
        });
    });

    describe('field descriptions', () => {
        /**
         * Every SDK generator turns these descriptions into its doc comments,
         * so a missing one is an undocumented type or field in every language.
         */
        it('refuses a property with no description of its own', () => {
            const spec = loadSpec();
            const schemas = spec['components']['schemas'] as Record<
                string,
                any
            >;
            delete schemas['AccessDecision'].properties.granted.description;
            expect(
                auditOf(spec).filter((f) => f.startsWith('undescribed field')),
            ).toEqual([
                'undescribed field: $.components.schemas.AccessDecision.properties.granted has no description',
            ]);
        });

        it('refuses a nested property and a schema with none', () => {
            const spec = loadSpec();
            const schemas = spec['components']['schemas'] as Record<
                string,
                any
            >;
            delete schemas['FilterResult'].properties.total.properties.visible
                .description;
            delete schemas['ScanLimits'].description;
            expect(
                auditOf(spec).filter((f) => f.startsWith('undescribed field')),
            ).toEqual([
                'undescribed field: $.components.schemas.FilterResult.properties.total.properties.visible has no description',
                'undescribed field: $.components.schemas.ScanLimits has no description',
            ]);
        });

        it('refuses one in a schema written inline in an operation', () => {
            const spec = loadSpec();
            const [route, item] = Object.entries(
                spec['paths'] as Record<string, any>,
            ).find(([, value]) => value.post)!;
            item.post.requestBody.content['application/json'].schema = {
                type: 'object',
                properties: { inline: { type: 'string' } },
            };
            expect(
                auditOf(spec).filter((f) => f.startsWith('undescribed field')),
            ).toEqual([
                `undescribed field: $.paths.${route}.post.requestBody.content.application/json.schema.properties.inline has no description`,
            ]);
        });

        it('asks nothing of the property a conditional selects on', () => {
            const spec = loadSpec();
            const reference = (
                spec['components']['schemas'] as Record<string, any>
            )['SourceReference'];
            expect(reference.if.properties.reproducibility.description).toBe(
                undefined,
            );
            expect(
                auditOf(spec).filter((f) => f.startsWith('undescribed field')),
            ).toEqual([]);
        });
    });

    describe('entitlement vocabulary escape routes', () => {
        function firstOperation(
            spec: Record<string, any>,
        ): Record<string, any> {
            for (const item of Object.values(spec.paths) as any[]) {
                for (const [method, operation] of Object.entries(item) as any) {
                    if (method === 'parameters') continue;
                    return operation;
                }
            }
            throw new Error('the spec has no operations');
        }

        it('catches a property planted in an INLINE operation schema', () => {
            const spec = loadSpec();
            const operation = firstOperation(spec);
            operation.requestBody = {
                required: true,
                content: {
                    'application/json': {
                        schema: {
                            type: 'object',
                            properties: { entitlements: { type: 'array' } },
                        },
                    },
                },
            };
            const failures = auditOf(spec).filter((f) =>
                f.startsWith('entitlement vocabulary'),
            );
            expect(failures).toHaveLength(1);
            expect(failures[0]).toContain('property entitlements at $.paths.');
            expect(failures[0]).toContain(
                'requestBody.content.application/json.schema.properties.entitlements',
            );
        });

        it('catches a property planted in a non-schemas component kind', () => {
            const spec = loadSpec();
            const target = Object.keys(spec.components.responses)[0];
            spec.components.responses[target].content = {
                'application/json': {
                    schema: {
                        type: 'object',
                        properties: {
                            entitlementsRemaining: { type: 'integer' },
                        },
                    },
                },
            };
            expect(
                auditOf(spec).some(
                    (f) =>
                        f.startsWith('entitlement vocabulary') &&
                        f.includes('property entitlementsRemaining') &&
                        f.includes(`$.components.responses.${target}`),
                ),
            ).toBe(true);
        });

        it('catches an entitlement query parameter', () => {
            const spec = loadSpec();
            firstOperation(spec).parameters = [
                {
                    name: 'entitlement',
                    in: 'query',
                    schema: { type: 'string' },
                },
            ];
            expect(
                auditOf(spec).some(
                    (f) =>
                        f ===
                        'entitlement vocabulary: parameter entitlement at ' +
                            '$.paths./v1/health.get.parameters[0].name',
                ),
            ).toBe(true);
        });

        it('catches an entitlement response header', () => {
            const spec = loadSpec();
            firstOperation(spec).responses['200'].headers = {
                'X-EzClassify-Entitlement-Seats': {
                    schema: { type: 'integer' },
                },
            };
            expect(
                auditOf(spec).some(
                    (f) =>
                        f.startsWith('entitlement vocabulary') &&
                        f.includes('header X-EzClassify-Entitlement-Seats'),
                ),
            ).toBe(true);
        });

        it('catches an entitlement path segment', () => {
            const spec = loadSpec();
            spec.paths['/v1/scheme/{id}/entitlements'] = {
                get: {
                    operationId: 'schemeExtras',
                    responses: { '200': { description: 'ok' } },
                },
            };
            expect(auditOf(spec)).toContain(
                'entitlement vocabulary: path segment entitlements at ' +
                    '$.paths./v1/scheme/{id}/entitlements[4]',
            );
        });

        it('catches an entitlement tag', () => {
            const spec = loadSpec();
            firstOperation(spec).tags = ['entitlement'];
            expect(
                auditOf(spec).some(
                    (f) =>
                        f.startsWith('entitlement vocabulary') &&
                        f.includes('tag entitlement'),
                ),
            ).toBe(true);
        });

        it('catches entitlement vocabulary on a discriminator', () => {
            const spec = loadSpec();
            const target = Object.keys(spec.components.schemas)[0];
            spec.components.schemas[target].discriminator = {
                propertyName: 'entitlementKind',
                mapping: { subscription: '#/components/schemas/NoSuchSchema' },
            };
            const failures = auditOf(spec);
            expect(
                failures.some((f) =>
                    f.includes(
                        'discriminator property entitlementKind at ' +
                            `$.components.schemas.${target}.discriminator.propertyName`,
                    ),
                ),
            ).toBe(true);
            expect(
                failures.some((f) =>
                    f.includes('discriminator mapping subscription'),
                ),
            ).toBe(true);
            // The mapping value is a reference under a key that is not `$ref`.
            expect(failures).toContain(
                'dangling reference: #/components/schemas/NoSuchSchema',
            );
        });
    });

    // Six more positions declare names. They ride the same traversal as the
    // positions above rather than adding loops.
    describe('entitlement vocabulary escape routes in name-declaring positions', () => {
        function firstOperation(
            spec: Record<string, any>,
        ): Record<string, any> {
            for (const item of Object.values(spec.paths) as any[]) {
                for (const [method, operation] of Object.entries(item) as any) {
                    if (method === 'parameters') continue;
                    return operation;
                }
            }
            throw new Error('the spec has no operations');
        }

        function vocabularyFailures(spec: Record<string, any>): string[] {
            return auditOf(spec).filter((f) =>
                f.startsWith('entitlement vocabulary'),
            );
        }

        it('catches a name declared only in a required[] list', () => {
            const spec = loadSpec();
            const target = Object.keys(spec.components.schemas)[0];
            spec.components.schemas[target] = {
                type: 'object',
                required: ['entitlementId'],
            };
            expect(vocabularyFailures(spec)).toContain(
                'entitlement vocabulary: required property entitlementId at ' +
                    `$.components.schemas.${target}.required[0]`,
            );
        });

        it('catches an inline response link name', () => {
            const spec = loadSpec();
            firstOperation(spec).responses['200'].links = {
                entitlementForThisTenant: { operationId: 'getHealth' },
            };
            expect(
                vocabularyFailures(spec).some(
                    (f) =>
                        f.includes('link entitlementForThisTenant') &&
                        f.includes('.responses.200.links.'),
                ),
            ).toBe(true);
        });

        it('catches an OAuth2 scope declared on a security scheme', () => {
            const spec = loadSpec();
            spec.components.securitySchemes = {
                oauth2: {
                    type: 'oauth2',
                    flows: {
                        clientCredentials: {
                            tokenUrl: 'https://example.test/token',
                            scopes: { 'entitlement:read': 'Read entitlements' },
                        },
                    },
                },
            };
            spec.security = [{ oauth2: [] }];
            expect(vocabularyFailures(spec)).toContain(
                'entitlement vocabulary: oauth scope entitlement:read at ' +
                    '$.components.securitySchemes.oauth2.flows.clientCredentials.scopes.entitlement:read',
            );
        });

        it('catches an OAuth2 scope requested by an operation', () => {
            const spec = loadSpec();
            spec.components.securitySchemes = {
                oauth2: {
                    type: 'oauth2',
                    flows: {
                        clientCredentials: {
                            tokenUrl: 'https://example.test/token',
                            scopes: { 'scheme:read': 'Read schemes' },
                        },
                    },
                },
            };
            firstOperation(spec).security = [{ oauth2: ['entitlement:read'] }];
            expect(
                vocabularyFailures(spec).some(
                    (f) =>
                        f.includes('oauth scope entitlement:read') &&
                        f.includes('$.paths./v1/health.get.security[0]'),
                ),
            ).toBe(true);
        });

        it('catches an operation callback name', () => {
            const spec = loadSpec();
            firstOperation(spec).callbacks = {
                entitlementRevoked: {
                    '{$request.body#/callbackUrl}': {
                        post: { responses: { '204': { description: 'ok' } } },
                    },
                },
            };
            expect(
                vocabularyFailures(spec).some(
                    (f) =>
                        f.includes('callback entitlementRevoked') &&
                        f.includes('$.paths./v1/health.get.callbacks.'),
                ),
            ).toBe(true);
        });

        it('catches a multipart encoding property name', () => {
            const spec = loadSpec();
            firstOperation(spec).requestBody = {
                content: {
                    'multipart/form-data': {
                        schema: { type: 'object' },
                        encoding: {
                            entitlementBlob: { contentType: 'text/plain' },
                        },
                    },
                },
            };
            expect(
                vocabularyFailures(spec).some(
                    (f) =>
                        f.includes('encoding property entitlementBlob') &&
                        f.includes('multipart/form-data.encoding.'),
                ),
            ).toBe(true);
        });

        it('catches the wire name of an apiKey security scheme', () => {
            const spec = loadSpec();
            spec.components.securitySchemes = {
                tenantKey: {
                    type: 'apiKey',
                    in: 'header',
                    name: 'X-EzClassify-Entitlement',
                },
            };
            spec.security = [{ tenantKey: [] }];
            expect(vocabularyFailures(spec)).toContain(
                'entitlement vocabulary: api key name X-EzClassify-Entitlement at ' +
                    '$.components.securitySchemes.tenantKey.name',
            );
        });

        it('catches a webhook name', () => {
            const spec = loadSpec();
            spec.webhooks = {
                entitlementChanged: {
                    post: { responses: { '204': { description: 'ok' } } },
                },
            };
            expect(vocabularyFailures(spec)).toContain(
                'entitlement vocabulary: webhook entitlementChanged at ' +
                    '$.webhooks.entitlementChanged',
            );
        });

        it('catches a server variable name', () => {
            const spec = loadSpec();
            spec.servers = [
                {
                    url: 'https://{entitlementTier}.example.test',
                    variables: {
                        entitlementTier: { default: 'basic' },
                    },
                },
            ];
            expect(vocabularyFailures(spec)).toContain(
                'entitlement vocabulary: server variable entitlementTier at ' +
                    '$.servers[0].variables.entitlementTier',
            );
        });

        it('catches a parameter named only by a link parameters key', () => {
            const spec = loadSpec();
            firstOperation(spec).responses['200'].links = {
                next: {
                    operationId: 'getHealth',
                    parameters: { entitlementId: '$response.body#/id' },
                },
            };
            expect(
                vocabularyFailures(spec).some(
                    (f) =>
                        f.includes('parameter entitlementId') &&
                        f.includes('.links.next.parameters.entitlementId'),
                ),
            ).toBe(true);
        });

        it('catches a name declared by dependentRequired', () => {
            const spec = loadSpec();
            const target = Object.keys(spec.components.schemas)[0];
            spec.components.schemas[target] = {
                type: 'object',
                dependentRequired: { tier: ['entitlementId'] },
            };
            expect(vocabularyFailures(spec)).toContain(
                'entitlement vocabulary: required property entitlementId at ' +
                    `$.components.schemas.${target}.dependentRequired.tier[0]`,
            );
        });

        // The widened walk has to know which map keys the author chose. A
        // schema with a property called `required` is not a required list, and
        // reading it as one would report that property's own `type` and
        // `items` keys as names the contract declares.
        it('does not read a property called required as a required list', () => {
            const spec = loadSpec();
            const target = Object.keys(spec.components.schemas)[0];
            spec.components.schemas[target] = {
                type: 'object',
                properties: {
                    required: { type: 'array', items: { type: 'string' } },
                    encoding: { type: 'string' },
                    links: { type: 'object' },
                },
            };
            const names = namedPositions(spec)
                .filter((position) =>
                    position.jsonPath.startsWith(
                        `$.components.schemas.${target}.`,
                    ),
                )
                .map((position) => position.name)
                .sort();
            expect(names).toEqual(['encoding', 'links', 'required']);
        });

        // Example payloads are scheme documents, and a scheme document has its
        // own `properties` and `required` keys. They describe the example, not
        // this contract.
        it('does not mine example payloads for names', () => {
            const spec = loadSpec();
            firstOperation(spec).responses['200'].content[
                'application/json'
            ].example = {
                properties: { entitlements: { type: 'array' } },
                required: ['entitlementId'],
            };
            expect(vocabularyFailures(spec)).toEqual([]);
        });
    });

    it('walks positions under paths, not just under components', () => {
        const positions = namedPositions(loadSpec());
        const underPaths = positions.filter((position) =>
            position.jsonPath.startsWith('$.paths.'),
        );
        // The committed spec has no inline object schemas. Every inline schema
        // is an array wrapping a `$ref`, so the proof that the walk descends
        // into operations is its real headers, parameters and tags. The planted
        // inline property above is what proves the property walk itself.
        for (const kind of ['header', 'parameter', 'tag', 'operationId']) {
            expect(
                underPaths.filter((position) => position.kind === kind).length,
            ).toBeGreaterThan(0);
        }
    });

    it('does not report a security scheme as unreachable', () => {
        // The committed document requires bearerAuth for every operation, so
        // this passes on the real file rather than on a planted one.
        expect(
            auditOf(loadSpec()).filter((f) =>
                f.startsWith('unreachable component'),
            ),
        ).toEqual([]);
    });

    it('still reports a security scheme nothing requires', () => {
        const spec = loadSpec();
        spec.components.securitySchemes = {
            ...spec.components.securitySchemes,
            legacyApiKey: {
                type: 'apiKey',
                in: 'header',
                name: 'X-Legacy-Token',
            },
        };
        expect(auditOf(spec)).toContain(
            'unreachable component: components.securitySchemes.legacyApiKey is not reachable from any operation',
        );
    });

    it('honors the by-value escape hatch for check 4', () => {
        const spec = loadSpec();
        spec.components.schemas.EmittedByValue = { type: 'object' };
        expect(
            auditPublicSpec(spec, {
                frozenSurface: readFrozenSurface(SURFACE_FILE),
                jsonText: `${JSON.stringify(spec, null, 2)}\n`,
                reachableByValue: new Map([
                    ...REACHABLE_BY_VALUE,
                    ['#/components/schemas/EmittedByValue', 'test'],
                ]),
            }).filter((f) => f.startsWith('unreachable component')),
        ).toEqual([]);
    });

    // A reachability check that reads "nothing $refs this" as "this is dead"
    // would delete two live components. These tests pin both halves: the
    // components ship, and they ship because the escape hatch declares them,
    // not by accident.
    describe('components the server emits by value', () => {
        const RESTORED: [string, string][] = [
            ['schemas', 'DocumentInputErrorDetail'],
            ['schemas', 'Reproducibility'],
        ];

        it('ships both in openapi.yaml and openapi.json', () => {
            const fromYaml = loadSpec();
            const fromJson = JSON.parse(fs.readFileSync(JSON_FILE, 'utf8'));
            for (const [kind, name] of RESTORED) {
                expect(
                    fromYaml.components[kind][name],
                    `${kind}.${name} is missing from openapi.yaml`,
                ).toBeDefined();
                expect(
                    fromJson.components[kind][name],
                    `${kind}.${name} is missing from openapi.json`,
                ).toEqual(fromYaml.components[kind][name]);
            }
        });

        it('describes the 429 every operation declares', () => {
            const response = loadSpec().components.responses.TooManyRequests;
            expect(Object.keys(response.headers).sort()).toEqual([
                'Retry-After',
                'X-RateLimit-Limit',
                'X-RateLimit-Remaining',
                'X-RateLimit-Reset',
            ]);
            expect(response.content['application/json'].schema.$ref).toBe(
                '#/components/schemas/RateLimitError',
            );
        });

        it('still publishes the two wire enums as closed sets', () => {
            const schemas = loadSpec().components.schemas;
            expect(schemas.Reproducibility.enum).toEqual([
                'reproducible',
                'best-effort',
            ]);
            expect(schemas.DocumentInputErrorDetail.enum).toContain(
                'empty-document',
            );
        });

        it('carries a reason for every entry, and every pointer resolves', () => {
            const spec = loadSpec();
            for (const [pointer, reason] of REACHABLE_BY_VALUE) {
                expect(
                    reason.length,
                    `${pointer} has no reason`,
                ).toBeGreaterThan(40);
                const match = /^#\/components\/([^/]+)\/(.+)$/.exec(pointer);
                expect(match, `${pointer} is not a component pointer`).not.toBe(
                    null,
                );
                expect(
                    spec.components[match![1]][match![2]],
                    `${pointer} points at nothing`,
                ).toBeDefined();
            }
        });

        // Take the hatch away and the guard fails on exactly these two:
        // without the declaration, live contract reads as dead.
        it('would report both as dead without the declaration', () => {
            const failures = auditPublicSpec(loadSpec(), {
                frozenSurface: readFrozenSurface(SURFACE_FILE),
                reachableByValue: new Map(),
            }).filter((f) => f.startsWith('unreachable component'));
            expect(failures.sort()).toEqual([
                'unreachable component: components.schemas.DocumentInputErrorDetail is not reachable from any operation',
                'unreachable component: components.schemas.Reproducibility is not reachable from any operation',
            ]);
        });

        it('fails loudly if an entry outlives the component it names', () => {
            const spec = loadSpec();
            delete spec.components.schemas.Reproducibility;
            expect(auditOf(spec)).toContain(
                'dangling reference: #/components/schemas/Reproducibility',
            );
        });
    });

    it('rejects a schema left behind with nothing referring to it', () => {
        const spec = loadSpec();
        spec.components.schemas.LeftoverResponse = { type: 'object' };
        expect(auditOf(spec)).toContain(
            'unreachable component: components.schemas.LeftoverResponse is not reachable from any operation',
        );
    });

    it('rejects a reference with no target', () => {
        const spec = loadSpec();
        spec.paths['/v1/health'].get.responses['200'].content[
            'application/json'
        ].schema = {
            $ref: '#/components/schemas/NoSuchSchema',
        };
        expect(auditOf(spec)).toContain(
            'dangling reference: #/components/schemas/NoSuchSchema',
        );
    });

    it('rejects openapi.json drifting from openapi.yaml', () => {
        const spec = loadSpec();
        const failures = auditPublicSpec(spec, {
            frozenSurface: readFrozenSurface(SURFACE_FILE),
            jsonText: '{"openapi":"3.1.0"}\n',
        });
        expect(failures.some((f) => f.startsWith('yaml/json agreement'))).toBe(
            true,
        );
    });

    it('is wired into CI', () => {
        const workflow = fs.readFileSync(
            path.join(ROOT, '.github/workflows/ci.yml'),
            'utf8',
        );
        expect(workflow).toContain('check:spec');
    });
});
