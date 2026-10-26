/**
 * JSON-schema validation tests for the external-source schema and the published
 * Context schema. Covers the closed-set credential providers, transport union,
 * required fields, and the encapsulation guardrail (Context is pure
 * composition: stray keys are rejected by additionalProperties: false).
 */
import { describe, it, expect } from 'vitest';
import Ajv2020 from 'ajv/dist/2020';
import addFormats from 'ajv-formats';
import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';
import * as yaml from 'js-yaml';

const here = path.dirname(fileURLToPath(import.meta.url));
const schemasDir = path.resolve(here, '../schemas');
const examplesDir = path.resolve(here, '../examples');
const generatedSchemasDir = path.resolve(
    here,
    '../../schemas/generated/json-schemas-input',
);

const externalSourceSchema = JSON.parse(
    fs.readFileSync(
        path.join(schemasDir, 'external-source.schema.json'),
        'utf-8',
    ),
);
/** The published Context schema, generated from `ContextDefinition`. */
const CONTEXT_SCHEMA_ID = 'context-definition.schema.json';
const { $schema: _contextDialect, ...contextSchema } = JSON.parse(
    fs.readFileSync(
        path.join(generatedSchemasDir, 'context-definition.schema.json'),
        'utf-8',
    ),
) as Record<string, unknown>;

function makeAjv(): Ajv2020 {
    const ajv = new Ajv2020({ allErrors: true, strict: false });
    addFormats(ajv);
    ajv.addSchema(externalSourceSchema, externalSourceSchema.$id);
    ajv.addSchema(contextSchema, CONTEXT_SCHEMA_ID);
    return ajv;
}

/** A records digest in the form a source reports and a pin must carry. */
const PINNED_DIGEST = `sha256:${'0123456789abcdef'.repeat(4)}`;

describe('external-source.schema.json', () => {
    const ajv = makeAjv();
    const validate = ajv.getSchema(externalSourceSchema.$id)!;

    describe('snapshotId pins a records digest', () => {
        const base = {
            source: 'https://example.com/api',
            mapping: { record: 'items[*]', concept: { id: 'id' } },
        };

        it('accepts a sha256 digest', () => {
            expect(validate({ ...base, snapshotId: PINNED_DIGEST })).toBe(true);
        });

        it.each([
            ['a release label', '2026-q1'],
            ['a digest without its algorithm', '0123456789abcdef'.repeat(4)],
            ['a digest one hex digit short', PINNED_DIGEST.slice(0, -1)],
            [
                'a digest in uppercase hex',
                `sha256:${'0123456789ABCDEF'.repeat(4)}`,
            ],
            ['another algorithm', `sha512:${'0123456789abcdef'.repeat(4)}`],
        ])('refuses %s', (_name, snapshotId) => {
            expect(validate({ ...base, snapshotId })).toBe(false);
            expect(validate.errors).toContainEqual(
                expect.objectContaining({
                    instancePath: '/snapshotId',
                    keyword: 'pattern',
                }),
            );
        });
    });

    it('accepts a minimal valid external block', () => {
        expect(
            validate({
                source: 'https://example.com/api',
                mapping: { record: 'items[*]', concept: { id: 'id' } },
                snapshotId: PINNED_DIGEST,
            }),
        ).toBe(true);
    });

    it('accepts a full external block with auth, pagination, capabilities, attribution', () => {
        expect(
            validate({
                source: 'https://example.com/api',
                transport: 'http',
                pagination: {
                    style: 'page',
                    pageParam: 'page',
                    start: 1,
                },
                queryParams: { pageSize: 'pageSize' },
                tls: {
                    caBundleRef: { provider: 'env', envVar: 'ACME_CA_BUNDLE' },
                    clientCertAndKeyRef: {
                        provider: 'secret-store',
                        secretId: 'sec_01H',
                    },
                },
                auth: {
                    flow: 'bearer',
                    credentialRef: { provider: 'env', envVar: 'ACME_TOKEN' },
                },
                headers: { 'x-tenant': 'acme' },
                query: { format: 'json' },
                mapping: { record: 'items[*]', concept: { id: 'id' } },
                snapshotId: PINNED_DIGEST,
                capabilities: { resolveAliases: 'exact', search: true },
                attribution: { name: 'ACME', license: 'proprietary' },
                rateLimit: { burst: 10, windowMs: 1000 },
                timeoutMs: 5000,
            }),
        ).toBe(true);
    });

    describe('connection TLS', () => {
        // The three documented instances: mutual TLS with a private CA,
        // a bearer token over a private CA, and mutual TLS with the default
        // roots and an encrypted key.
        const instances = {
            'mutual TLS with a private CA': {
                id: 'agency-offices',
                source: 'https://records.agency.example/api/v2/offices',
                tls: {
                    caBundleRef: {
                        provider: 'file',
                        path: '/var/run/secrets/agency/ca-bundle.pem',
                    },
                    clientCertAndKeyRef: {
                        provider: 'secret-store',
                        secretId: 'sec_01HXY7',
                    },
                },
                mapping: {
                    record: 'offices[*]',
                    concept: { id: 'code', name: 'name' },
                },
            },
            'a bearer token over a private CA': {
                id: 'program-codes',
                source: 'https://codes.internal.example/v1/programs',
                tls: {
                    caBundleRef: {
                        provider: 'env',
                        envVar: 'INTERNAL_CA_BUNDLE',
                    },
                },
                auth: {
                    flow: 'bearer',
                    credentialRef: {
                        provider: 'env',
                        envVar: 'PROGRAM_CODES_TOKEN',
                    },
                },
                mapping: {
                    record: 'items[*]',
                    concept: { id: 'id', name: 'title' },
                },
            },
            'mutual TLS with the default roots': {
                id: 'partner-registry',
                source: 'https://registry.partner.example/api/entries',
                tls: {
                    clientCertAndKeyRef: {
                        provider: 'file',
                        certPath: '/var/run/secrets/partner/client.crt',
                        keyPath: '/var/run/secrets/partner/client.key',
                    },
                    keyPassphraseRef: {
                        provider: 'file',
                        path: '/var/run/secrets/partner/key-passphrase',
                    },
                },
                mapping: {
                    record: 'entries[*]',
                    concept: { id: 'entryId', name: 'label' },
                },
            },
        };
        const base = {
            source: 'https://example.com/api',
            mapping: { record: 'items[*]', concept: { id: 'id' } },
        };
        const pair = { provider: 'secret-store', secretId: 'sec_01H' };

        for (const [name, spec] of Object.entries(instances)) {
            it(`accepts ${name}`, () => {
                expect(validate(spec)).toBe(true);
            });
        }

        it('refuses `flow: mtls`, which left the flow set', () => {
            expect(
                validate({
                    ...base,
                    auth: { flow: 'mtls', clientCertAndKeyRef: pair },
                }),
            ).toBe(false);
            expect(validate.errors).toContainEqual(
                expect.objectContaining({
                    instancePath: '/auth/flow',
                    keyword: 'enum',
                }),
            );
        });

        it('refuses a client certificate under `auth`', () => {
            expect(
                validate({
                    ...base,
                    auth: { flow: 'none', clientCertAndKeyRef: pair },
                }),
            ).toBe(false);
            expect(validate.errors).toContainEqual(
                expect.objectContaining({
                    instancePath: '/auth',
                    keyword: 'additionalProperties',
                    params: { additionalProperty: 'clientCertAndKeyRef' },
                }),
            );
        });

        it('refuses an empty `tls` block', () => {
            expect(validate({ ...base, tls: {} })).toBe(false);
            expect(validate.errors).toContainEqual(
                expect.objectContaining({
                    instancePath: '/tls',
                    keyword: 'minProperties',
                }),
            );
        });

        it('refuses a key passphrase without a client certificate', () => {
            expect(
                validate({
                    ...base,
                    tls: {
                        keyPassphraseRef: {
                            provider: 'env',
                            envVar: 'KEY_PASS',
                        },
                    },
                }),
            ).toBe(false);
            expect(validate.errors).toContainEqual(
                expect.objectContaining({
                    instancePath: '/tls',
                    keyword: 'dependentRequired',
                }),
            );
        });

        it('refuses a field the block does not declare', () => {
            expect(
                validate({
                    ...base,
                    tls: {
                        clientCertAndKeyRef: pair,
                        insecureSkipVerify: true,
                    },
                }),
            ).toBe(false);
            expect(validate.errors).toContainEqual(
                expect.objectContaining({
                    instancePath: '/tls',
                    keyword: 'additionalProperties',
                    params: { additionalProperty: 'insecureSkipVerify' },
                }),
            );
        });

        it('keeps the tls field set aligned with the generated input schemas', () => {
            const generated = JSON.parse(
                fs.readFileSync(
                    path.join(
                        generatedSchemasDir,
                        'scheme-definition.schema.json',
                    ),
                    'utf-8',
                ),
            );
            expect(
                Object.keys(externalSourceSchema.$defs.tls.properties).sort(),
            ).toEqual(
                Object.keys(
                    generated.definitions.ExternalSourceTls.properties,
                ).sort(),
            );
            expect(
                Object.keys(externalSourceSchema.$defs.auth.properties).sort(),
            ).toEqual(
                Object.keys(
                    generated.definitions.ExternalSourceAuth.properties,
                ).sort(),
            );
            expect(
                externalSourceSchema.$defs.auth.properties.flow.enum,
            ).toEqual(
                generated.definitions.ExternalSourceAuth.properties.flow.enum,
            );
        });
    });

    it('accepts an explicitly best-effort live source without `snapshotId`', () => {
        expect(
            validate({
                source: 'https://example.com/api',
                mapping: { record: 'items[*]', concept: { id: 'id' } },
                liveFetch: true,
            }),
        ).toBe(true);
    });

    it('accepts the newer optional external-source fields in the canonical input type', () => {
        const base = {
            source: 'https://example.com/api',
            mapping: { record: 'items[*]', concept: { id: 'id' } },
        };
        for (const optionalField of [
            { queryParams: { search: 'query' } },
            { recordsPath: 'features' },
            { mappingHash: 'a'.repeat(64) },
            { liveFetch: true },
            { snapshotRef: 'sha256:source' },
            { srcref: 'srcref:source' },
            { grantId: 'grantId:source' },
        ]) {
            expect(validate({ ...base, ...optionalField })).toBe(true);
        }
    });

    it('keeps source property names and required fields aligned with generated family input schemas', () => {
        for (const filename of [
            'scheme-definition.schema.json',
            'guide-definition.schema.json',
            'access-policy.schema.json',
        ]) {
            const generated = JSON.parse(
                fs.readFileSync(
                    path.join(generatedSchemasDir, filename),
                    'utf-8',
                ),
            );
            const sourceNames = Object.keys(generated.definitions).filter(
                (name) => name.startsWith('ExternalSourceSpec<'),
            );
            expect(sourceNames).toHaveLength(1);
            const source = generated.definitions[sourceNames[0]];
            expect(Object.keys(externalSourceSchema.properties).sort()).toEqual(
                Object.keys(source.properties).sort(),
            );
            expect([...externalSourceSchema.required].sort()).toEqual(
                [...source.required].sort(),
            );
            expect(
                Object.keys(
                    externalSourceSchema.$defs.queryParams.properties,
                ).sort(),
            ).toEqual(
                Object.keys(
                    generated.definitions.ExternalSourceQueryParams.properties,
                ).sort(),
            );
        }
    });

    it('rejects unknown query parameter names', () => {
        expect(
            validate({
                source: 'https://example.com/api',
                mapping: { record: 'items[*]', concept: { id: 'id' } },
                queryParams: { unsupported: 'query' },
            }),
        ).toBe(false);
        expect(validate.errors).toContainEqual(
            expect.objectContaining({
                instancePath: '/queryParams',
                keyword: 'additionalProperties',
                params: { additionalProperty: 'unsupported' },
            }),
        );
    });

    it('rejects a missing `source`', () => {
        expect(
            validate({
                mapping: { record: 'items[*]', concept: { id: 'id' } },
                snapshotId: PINNED_DIGEST,
            }),
        ).toBe(false);
    });

    it('rejects a missing `mapping`', () => {
        expect(
            validate({
                source: 'https://example.com/api',
                snapshotId: PINNED_DIGEST,
            }),
        ).toBe(false);
    });

    it('rejects unknown credential providers', () => {
        expect(
            validate({
                source: 'https://example.com/api',
                mapping: { record: 'items[*]', concept: { id: 'id' } },
                snapshotId: PINNED_DIGEST,
                auth: {
                    flow: 'bearer',
                    credentialRef: { provider: 'k8s-secret', name: 'foo' },
                },
            }),
        ).toBe(false);
    });

    it('rejects unknown transport values', () => {
        expect(
            validate({
                source: 'redis://example.com',
                transport: 'redis',
                mapping: { concept: { id: 'id' } },
                snapshotId: PINNED_DIGEST,
            }),
        ).toBe(false);
    });

    it('rejects unknown pagination styles', () => {
        expect(
            validate({
                source: 'https://example.com',
                mapping: { concept: { id: 'id' } },
                snapshotId: PINNED_DIGEST,
                pagination: { style: 'offset', offset: 0 },
            }),
        ).toBe(false);
    });

    it('accepts each closed-set credential provider', () => {
        for (const credentialRef of [
            { provider: 'env', envVar: 'X_TOKEN' },
            { provider: 'env', certVar: 'X_CERT', keyVar: 'X_KEY' },
            { provider: 'file', path: '/etc/x/token' },
            {
                provider: 'file',
                certPath: '/etc/x/cert.pem',
                keyPath: '/etc/x/key.pem',
            },
            { provider: 'secret-store', secretId: 'sec_42' },
        ]) {
            expect(
                validate({
                    source: 'https://example.com',
                    mapping: { concept: { id: 'id' } },
                    snapshotId: PINNED_DIGEST,
                    auth: { flow: 'bearer', credentialRef },
                }),
            ).toBe(true);
        }
    });
});

describe('context-definition.schema.json', () => {
    const ajv = makeAjv();
    const validate = ajv.getSchema(CONTEXT_SCHEMA_ID)!;

    const wrap = (inner: Record<string, unknown>): Record<string, unknown> => ({
        context: inner,
    });
    const minimalScheme = { id: 'scm', version: '1.0.0' };

    it('accepts a minimal Context (id + version + scheme)', () => {
        expect(
            validate(
                wrap({ id: 'ctx', version: '0.1.0', scheme: minimalScheme }),
            ),
        ).toBe(true);
    });

    it('accepts a full Context with nested layers, guides, single access', () => {
        expect(
            validate(
                wrap({
                    id: 'ctx',
                    version: '1.0.0',
                    scheme: {
                        id: 'scm',
                        version: '1.0.0',
                        layers: [{ id: 'layer-a', version: '1.0.0' }],
                    },
                    guides: [{ id: 'guide-1', version: '1.0.0' }],
                    access: { id: 'access-1', version: '1.0.0' },
                }),
            ),
        ).toBe(true);
    });

    it('rejects an id that breaks the kebab-case rule', () => {
        expect(
            validate(
                wrap({ id: 'My_Ctx', version: '0.1.0', scheme: minimalScheme }),
            ),
        ).toBe(false);
    });

    it('rejects a non-semver version', () => {
        expect(
            validate(
                wrap({ id: 'ctx', version: 'latest', scheme: minimalScheme }),
            ),
        ).toBe(false);
    });

    it('rejects a missing scheme', () => {
        expect(validate(wrap({ id: 'ctx', version: '0.1.0' }))).toBe(false);
    });

    it('rejects a Context with a stray `sourcePins` key (encapsulation guardrail)', () => {
        expect(
            validate(
                wrap({
                    id: 'ctx',
                    version: '0.1.0',
                    scheme: minimalScheme,
                    sourcePins: { 'scm.concepts.external': '2026-q1' },
                }),
            ),
        ).toBe(false);
    });

    it('rejects a Context with any stray key (additionalProperties: false is not sourcePins-specific)', () => {
        expect(
            validate(
                wrap({
                    id: 'ctx',
                    version: '0.1.0',
                    scheme: minimalScheme,
                    authOverride: { flow: 'none' },
                }),
            ),
        ).toBe(false);
    });

    it('rejects bare-string layers (must be { id, version } refs)', () => {
        expect(
            validate(
                wrap({
                    id: 'ctx',
                    version: '0.1.0',
                    scheme: {
                        id: 'scm',
                        version: '1.0.0',
                        layers: ['layer-a'],
                    },
                }),
            ),
        ).toBe(false);
    });

    it('rejects access as an array (must be a single { id, version } ref)', () => {
        expect(
            validate(
                wrap({
                    id: 'ctx',
                    version: '0.1.0',
                    scheme: minimalScheme,
                    access: [{ id: 'access-1', version: '1.0.0' }],
                }),
            ),
        ).toBe(false);
    });

    it('parses the bundled context-with-sources example without error', () => {
        const text = fs.readFileSync(
            path.join(examplesDir, 'context-with-sources.yaml'),
            'utf-8',
        );
        const doc = yaml.load(text);
        expect(validate(doc)).toBe(true);
    });

    it('parses the scheme-with-sources example into a valid external array', () => {
        const text = fs.readFileSync(
            path.join(examplesDir, 'scheme-with-sources.yaml'),
            'utf-8',
        );
        const doc = yaml.load(text) as {
            scheme: { data: { concepts: { external?: unknown[] } } };
        };
        const external = doc.scheme.data.concepts.external;
        const validateExt = makeAjv().getSchema(externalSourceSchema.$id)!;
        expect(Array.isArray(external)).toBe(true);
        expect((external as unknown[]).length).toBeGreaterThan(0);
        for (const spec of external as unknown[]) {
            expect(validateExt(spec)).toBe(true);
        }
    });
});
