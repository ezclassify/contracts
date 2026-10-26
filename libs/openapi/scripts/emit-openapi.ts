#!/usr/bin/env tsx
/**
 * Builds openapi.yaml and openapi.json inside this package from the per-route
 * TypeScript declaration files in libs/openapi/src/route-decls/.
 *
 * The canonical source of truth for the spec is the TypeScript route
 * declarations. Each declaration carries the route registry (path, method,
 * operationId, summary, description, tags, error responses, query/path
 * parameters) together with its request and success-response body shapes
 * (schema reference into `components.schemas`, optional example, response
 * description). The emit script assembles these into the OpenAPI `paths` block;
 * nothing in the path entries is hand-edited.
 *
 * Component schemas (`components.schemas`) are generated from the TypeScript
 * types listed in scripts/codegen-roots.ts via ts-json-schema-generator. The
 * `generateSchemas()` export from scripts/codegen-schemas.mjs runs once per
 * emit and the result is dropped into `components.schemas` directly; no
 * component schema is hand-edited.
 *
 * The only hand-authored component content is the slim http-overlay file at
 * scripts/openapi-http-overlay.yaml, which carries `components.parameters`
 * (shared path/query parameters reused across routes) and
 * `components.responses` (shared HTTP error envelopes that wrap a generated
 * body schema with a description, example, and response headers). These are
 * HTTP-level concerns with no TypeScript counterpart and stay hand-edited.
 *
 * Nothing here reads a server. Whether the implemented routes match this
 * contract is a question about a server, and it is answered where the server
 * lives: the runtime's REST server asserts both directions against the spec
 * this script writes. A generator that also graded the implementation would be
 * checking a repository against a file that same repository produced.
 *
 * Usage: npm run codegen
 *
 * @module
 */

import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath, pathToFileURL } from 'url';
import { createRequire } from 'module';
import yaml from 'js-yaml';

import type {
    RouteDecl,
    ErrorRef,
    QueryParam,
    BodySchema,
} from '../src/route-decls/types.js';
// @ts-expect-error: codegen-schemas.mjs is a plain JS module without ts types.
import { generateSchemas } from './codegen-schemas.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * Libs/openapi: holds the declaration sources and, once this script has run,
 * the published openapi.yaml / openapi.json. The document lives in the package
 * that publishes it rather than at the repository root, which is private and
 * ships nowhere.
 */
const PACKAGE_ROOT = path.resolve(__dirname, '..');
const SCRIPTS = __dirname;
/** Repository root: holds the canonical version manifest. */
const REPO_ROOT = path.resolve(PACKAGE_ROOT, '..', '..');

// `info.version` is the version of the contract, so it comes from the
// repository's canonical manifest, the one a release bumps, and is restated
// here on every codegen run rather than being edited in the file.
const _require = createRequire(import.meta.url);
const _pkg = _require(path.join(REPO_ROOT, 'package.json')) as {
    version: string;
};
const API_VERSION: string = _pkg.version;

/**
 * Every name a route may put in `errorResponses`, and the component it emits.
 * Exported so a test can hold it against the overlay: a name here with no
 * component there is a `$ref` at nothing, and the route author who picks it
 * finds out from a spec audit rather than from the compiler.
 */
export const ERROR_REF_TARGETS: Record<ErrorRef, string> = {
    BadRequest: '#/components/responses/BadRequest',
    Conflict: '#/components/responses/Conflict',
    NotFound: '#/components/responses/NotFound',
    UnprocessableEntity: '#/components/responses/UnprocessableEntity',
    InternalError: '#/components/responses/InternalError',
    NotReady: '#/components/responses/NotReady',
};

/** The 429 envelope every operation declares; see {@link buildOperation}. */
export const TOO_MANY_REQUESTS = '#/components/responses/TooManyRequests';

async function loadRouteDecls(): Promise<readonly RouteDecl[]> {
    const indexUrl = pathToFileURL(
        path.join(PACKAGE_ROOT, 'src', 'route-decls', 'index.ts'),
    ).href;
    const mod = (await import(indexUrl)) as {
        routeDecls: readonly RouteDecl[];
    };
    if (!Array.isArray(mod.routeDecls)) {
        throw new Error(
            'route-decls/index.ts: routeDecls export is not an array',
        );
    }
    return mod.routeDecls;
}

function expressPathToOpenApi(p: string): string {
    return p.replace(/:([a-zA-Z]+)/g, '{$1}');
}

function bodySchemaToOpenApi(bs: BodySchema): Record<string, unknown> {
    if ('ref' in bs) return { $ref: `#/components/schemas/${bs.ref}` };
    if ('arrayOf' in bs)
        return {
            type: 'array',
            items: { $ref: `#/components/schemas/${bs.arrayOf}` },
        };
    if ('primitive' in bs) {
        const out: Record<string, unknown> = { type: bs.primitive };
        if (bs.description) out['description'] = bs.description;
        return out;
    }
    const exhaustive: never = bs;
    return exhaustive;
}

function buildRequestBody(
    decl: RouteDecl,
): Record<string, unknown> | undefined {
    if (!decl.requestSchema) return undefined;
    const content: Record<string, unknown> = {
        'application/json': {
            schema: bodySchemaToOpenApi(decl.requestSchema),
        },
    };
    if (decl.requestExample !== undefined) {
        (content['application/json'] as Record<string, unknown>)['example'] =
            decl.requestExample;
    }
    return { required: true, content };
}

function buildSuccessResponse(decl: RouteDecl): Record<string, unknown> {
    const description = decl.responseDescription ?? decl.summary;
    const out: Record<string, unknown> = { description };
    if (decl.path.includes(':version')) {
        out['headers'] = {
            'X-EzClassify-Resolved-Version': {
                $ref: '#/components/headers/ResolvedVersion',
            },
        };
    }
    if (decl.responseSchema) {
        const content: Record<string, unknown> = {
            'application/json': {
                schema: bodySchemaToOpenApi(decl.responseSchema),
            },
        };
        if (decl.responseExample !== undefined) {
            (content['application/json'] as Record<string, unknown>)[
                'example'
            ] = decl.responseExample;
        }
        out['content'] = content;
    }
    return out;
}

/**
 * Build the OpenAPI operation object for a single route declaration.
 *
 * Every field is sourced from the route declaration: operationId, summary,
 * description, tags, parameters, error responses, request and success response
 * bodies (schema, example, description).
 */
function buildOperation(decl: RouteDecl): Record<string, unknown> {
    const op: Record<string, unknown> = {
        operationId: decl.operationId,
        summary: decl.summary,
        description: decl.description,
    };
    if (decl.tags && decl.tags.length > 0) {
        op['tags'] = [...decl.tags];
    }
    // An empty requirement array overrides the document-level default, which
    // is the only way OpenAPI has of saying "this operation takes no
    // credential". Omitting the key would inherit the default instead.
    if (decl.anonymous) op['security'] = [];

    const parameters: unknown[] = [];
    if (decl.pathParams) {
        for (const name of decl.pathParams) {
            const description = pathParamDescription(decl, name);
            parameters.push({
                name,
                in: 'path',
                required: true,
                ...(description ? { description } : {}),
                schema: { type: 'string' },
            });
        }
    }
    if (decl.queryParams) {
        for (const q of decl.queryParams) {
            parameters.push(buildInlineQueryParam(q));
        }
    }
    if (parameters.length > 0) op['parameters'] = parameters;

    const requestBody = buildRequestBody(decl);
    if (requestBody) op['requestBody'] = requestBody;

    const responses: Record<string, unknown> = {
        '200': buildSuccessResponse(decl),
    };
    for (const err of decl.errorResponses) {
        // OpenAPI 3.1 lets a Reference Object carry its own description, which
        // replaces the shared envelope's for this one operation. Without it a
        // route's own wording (why this route answers 404 or 422, or what makes
        // its 400 different) never reached the published document.
        responses[String(err.status)] = err.description
            ? { $ref: ERROR_REF_TARGETS[err.ref], description: err.description }
            : { $ref: ERROR_REF_TARGETS[err.ref] };
    }
    // Requests are closed: the server refuses a query parameter an operation
    // does not declare, on every route, before it reads anything else. So
    // every operation can answer 400, and one whose own declarations name no
    // other 400 gets the shared envelope here rather than from each route.
    responses['400'] ??= { $ref: ERROR_REF_TARGETS.BadRequest };
    // The rate limiter runs ahead of route dispatch, the probes included, so
    // every operation can answer 429. Declaring it here, once, is what puts
    // it on every operation without a route being able to leave it out.
    responses['429'] = { $ref: TOO_MANY_REQUESTS };
    op['responses'] = Object.fromEntries(
        Object.entries(responses).sort(([a], [b]) => Number(a) - Number(b)),
    );

    return op;
}

/**
 * Description of a path parameter whose meaning the URL grammar fixes.
 *
 * OpenAPI requires every path parameter, but the server lets an operation URL
 * leave out its `{version}` segment and reads that as `latest`. Listing each
 * shorter URL as a second operation would double every client SDK's surface for
 * what is one call, so the parameter states the shorthand instead. The describe
 * route is the exception: with its version segment gone, its URL is the version
 * listing, a different operation.
 */
function pathParamDescription(
    decl: RouteDecl,
    name: string,
): string | undefined {
    if (name !== 'version') return undefined;
    const resolves =
        'A concrete semver version, or `latest`. The version served is reported in the X-EzClassify-Resolved-Version response header.';
    return decl.path.endsWith('/:version')
        ? `${resolves} Without this segment the URL lists the context's versions instead.`
        : `${resolves} The segment may also be left out of the URL, which the server reads as \`latest\`.`;
}

function buildInlineQueryParam(q: QueryParam): Record<string, unknown> {
    return {
        name: q.name,
        in: 'query',
        required: q.required,
        description: q.description,
        schema: { type: q.schema },
    };
}

function methodKey(m: RouteDecl['method']): string {
    return m.toLowerCase();
}

/**
 * Collects every `$ref` string anywhere inside a node.
 *
 * Used by the response-openness pass below, which has to follow references out
 * of a response object into `components.responses`, `components.headers` and
 * `components.schemas` before it knows which schemas a client can actually
 * receive.
 */
function refsIn(node: unknown, out: Set<string> = new Set()): Set<string> {
    if (Array.isArray(node)) {
        for (const item of node) refsIn(item, out);
        return out;
    }
    if (!node || typeof node !== 'object') return out;
    for (const [key, value] of Object.entries(
        node as Record<string, unknown>,
    )) {
        if (key === '$ref' && typeof value === 'string') out.add(value);
        else refsIn(value, out);
    }
    return out;
}

/**
 * Names every schema a client can be handed in a response body.
 *
 * Walks out of every operation's `responses` block, through the shared
 * envelopes in `components.responses`, and transitively through every schema
 * those reach. The answer is computed from the assembled document rather than
 * listed by hand, so a new response type is covered the day it is declared and
 * a schema that stops being a response body stops being counted.
 */
export function responseReachableSchemas(
    spec: Record<string, unknown>,
): Set<string> {
    const components = (spec['components'] ?? {}) as Record<
        string,
        Record<string, unknown>
    >;
    const pending: string[] = [];
    const paths = (spec['paths'] ?? {}) as Record<
        string,
        Record<string, Record<string, unknown>>
    >;
    for (const operations of Object.values(paths)) {
        for (const operation of Object.values(operations)) {
            const responses = operation?.['responses'];
            if (responses) pending.push(...refsIn(responses));
        }
    }
    const seen = new Set<string>();
    const schemas = new Set<string>();
    while (pending.length > 0) {
        const ref = pending.pop() as string;
        if (seen.has(ref)) continue;
        seen.add(ref);
        const match = /^#\/components\/([^/]+)\/(.+)$/.exec(ref);
        if (!match) continue;
        const [, kind, name] = match;
        const target = components[kind]?.[name];
        if (target === undefined) continue;
        if (kind === 'schemas') schemas.add(name);
        pending.push(...refsIn(target));
    }
    return schemas;
}

/**
 * Opens every response-reachable schema to fields it does not declare yet.
 *
 * The compatibility rule this implements: responses are open and requests are
 * closed. A client generated from this document must accept a response that
 * carries a field added after the client was generated, otherwise every
 * additive change to the runtime is a breaking change for every SDK. Requests
 * keep `additionalProperties: false`, because the server rejects a request
 * field it does not understand rather than ignoring it.
 *
 * A schema used in both directions is opened: a response a client cannot parse
 * is the worse failure, and the server's own request validation is what refuses
 * an unknown request field.
 *
 * Mutates `spec` in place and returns the names it opened.
 */
export function openResponseSchemas(spec: Record<string, unknown>): string[] {
    const components = (spec['components'] ?? {}) as Record<string, unknown>;
    const schemas = (components['schemas'] ?? {}) as Record<string, unknown>;
    const opened: string[] = [];
    for (const name of responseReachableSchemas(spec)) {
        const schema = schemas[name];
        if (!schema || typeof schema !== 'object') continue;
        if (stripClosedObjects(schema)) opened.push(name);
    }
    return opened.sort();
}

/**
 * Removes `additionalProperties: false` from a node and everything under it.
 *
 * Nested inline objects are part of the same response body, so leaving one
 * closed would reintroduce the problem one level down. Returns true when
 * anything was removed.
 */
function stripClosedObjects(node: unknown): boolean {
    if (Array.isArray(node)) {
        let changed = false;
        for (const item of node) changed = stripClosedObjects(item) || changed;
        return changed;
    }
    if (!node || typeof node !== 'object') return false;
    const record = node as Record<string, unknown>;
    let changed = false;
    if (record['additionalProperties'] === false) {
        delete record['additionalProperties'];
        changed = true;
    }
    for (const value of Object.values(record)) {
        changed = stripClosedObjects(value) || changed;
    }
    return changed;
}

/**
 * Build the OpenAPI spec object from route declarations, generated component
 * schemas, and the HTTP overlay file. The in-memory object is the single source
 * of truth: both the YAML and JSON serializers consume it.
 */
export async function buildOpenApiSpec(): Promise<Record<string, unknown>> {
    const routeDecls = await loadRouteDecls();

    const overlayRaw = fs.readFileSync(
        path.join(SCRIPTS, 'openapi-http-overlay.yaml'),
        'utf8',
    );
    const overlayParsed = yaml.load(overlayRaw) as {
        components: Record<string, unknown>;
    };
    if (!overlayParsed?.components)
        throw new Error(
            'openapi-http-overlay.yaml: could not parse components',
        );

    const generatedSchemas = generateSchemas() as Record<string, unknown>;

    const components: Record<string, unknown> = {
        schemas: generatedSchemas,
        ...overlayParsed.components,
    };

    const declByKey = new Map<string, RouteDecl>();
    for (const d of routeDecls) {
        const key = `${d.method} ${expressPathToOpenApi(d.path)}`;
        if (declByKey.has(key))
            throw new Error(`route-decls: duplicate ${key}`);
        declByKey.set(key, d);
    }

    const paths: Record<string, Record<string, unknown>> = {};
    for (const decl of routeDecls) {
        const oapiPath = expressPathToOpenApi(decl.path);
        if (!paths[oapiPath]) paths[oapiPath] = {};
        paths[oapiPath][methodKey(decl.method)] = buildOperation(decl);
    }

    const spec: Record<string, unknown> = {
        openapi: '3.1.0',
        info: {
            title: 'EzClassify REST API',
            version: API_VERSION,
            description:
                'Context-bound API for processing, validating, aggregating, and scanning\n' +
                'markings, checking access, and translating between schemes. A Context\n' +
                'composes versioned schemes, layers, guides, access policies, and crosswalks.\n' +
                '\n' +
                'A deployment that requires authentication answers an unauthenticated\n' +
                'request with the same not-found shape a missing resource gets. A 404 is\n' +
                'therefore not proof that a route or a resource is absent, and no operation\n' +
                'declares a 401 or a 403 because the server never sends one.\n' +
                '\n' +
                'The two kinds of 404 body are deliberately different. A refused request\n' +
                'gets the constant body {"error": "not_found"} with no code and no detail,\n' +
                'because telling a refusal apart from an absence is exactly what that\n' +
                'shape exists to prevent; it is a security property and it will not gain\n' +
                'fields. A request that did reach routing and matched no route gets the\n' +
                'ordinary error body carrying code "route_not_found". Clients classify on\n' +
                'the code: the message is prose and will change, and the constant refusal\n' +
                'body offers no code to classify on.\n' +
                '\n' +
                'Requests are closed. A query parameter an operation does not declare, or\n' +
                'a body field its request schema does not declare, is refused with a 400\n' +
                'carrying code "INVALID_INPUT" and a detail naming it, never ignored.\n',
            contact: {
                name: 'EzClassify Support',
                email: 'support@ezclassify.com',
                url: 'https://ezclassify.com',
            },
            license: {
                name: 'EzClassify Runtime License',
                url: 'https://ezclassify.com/legal/runtime-license',
            },
        },
        // There is no canonical host: every deployment is the customer's own,
        // self-hosted or otherwise. So the first entry, the one generators and
        // API explorers adopt as the default base URL, is a templated https
        // origin the consumer fills in. The plaintext development host stays,
        // clearly second, because it is still what a local checkout answers on.
        servers: [
            {
                url: 'https://{host}',
                description:
                    'An EzClassify runtime deployment. Set host to the deployment you were given.',
                variables: {
                    host: {
                        default: 'api.ezclassify.example',
                        description:
                            'Hostname of the runtime deployment serving this contract.',
                    },
                },
            },
            {
                url: 'http://api.ezclassify.test',
                description: 'Local development',
            },
        ],
        // Every data-path operation requires both independent credentials
        // unless it declares itself anonymous: bearer identifies the caller;
        // the Context token authorizes a deployed Context/version. OpenAPI
        // spells AND by placing both schemes in the same requirement object.
        // Stating it once here keeps new routes closed by default.
        security: [{ bearerAuth: [], contextToken: [] }],
        paths,
        components,
    };

    openResponseSchemas(spec);
    return spec;
}

// This header ships verbatim in every vendored copy of the spec (the SDK repos
// vendor this file under vendor/spec/), so it must make sense outside this
// repository: name the public canonical source, not internal build scripts.
// The route declarations and this generator live in this repository, so the
// header names it as the canonical source.
const YAML_HEADER = [
    '# EzClassify REST API contract (OpenAPI 3.1). Generated file, do not edit directly.',
    '# Canonical source: the ezclassify/contracts repository. Routes are declared in',
    '# libs/openapi/src/route-decls/ and component schemas are generated from the wire',
    '# and definition types this repository publishes.',
    '# Regenerate:  npm run codegen',
    '# Every other copy of this file is a downstream mirror, and edits made to a',
    '# mirror are overwritten by the next sync from the generator.',
    '',
].join('\n');

const COMPONENTS_HEADER = [
    '# Generated by scripts/emit-openapi.ts from the same in-memory document',
    '# openapi.yaml and openapi.json are written from. Reviewable artifact only:',
    '# nothing reads it back. Do not hand-edit.',
    '',
].join('\n');

export function specToYaml(spec: Record<string, unknown>): string {
    const body = yaml.dump(spec, {
        lineWidth: 120,
        noRefs: true,
        quotingType: '"',
        forceQuotes: false,
    });
    return YAML_HEADER + body;
}

/**
 * Assembles the OpenAPI spec as a YAML string. Retained as an export so tools
 * that diff the canonical YAML output (e.g. CI freshness checks) can reproduce
 * the file contents without writing to disk.
 */
export async function buildOpenApiContent(): Promise<string> {
    return specToYaml(await buildOpenApiSpec());
}

async function main(): Promise<void> {
    const spec = await buildOpenApiSpec();

    const yamlContent = specToYaml(spec);
    const yamlPath = path.join(PACKAGE_ROOT, 'openapi.yaml');
    fs.writeFileSync(yamlPath, yamlContent, 'utf8');
    console.log(
        `emit-openapi: wrote ${yamlPath} (${yamlContent.split('\n').length} lines)`,
    );

    // Machine consumers (MCP catalog, codegen tools) read JSON; humans read
    // YAML in PR diffs. Both files come from the same in-memory object so
    // they cannot drift within a single codegen run.
    const jsonContent = JSON.stringify(spec, null, 2) + '\n';
    const jsonPath = path.join(PACKAGE_ROOT, 'openapi.json');
    fs.writeFileSync(jsonPath, jsonContent, 'utf8');
    console.log(
        `emit-openapi: wrote ${jsonPath} (${jsonContent.split('\n').length} lines)`,
    );

    // The reviewable dump of components.schemas. It is written from the same
    // in-memory document the spec files came from, so what a reviewer reads
    // here is what shipped, response openness included.
    const componentsPath = path.join(SCRIPTS, 'components.generated.yaml');
    const componentsContent =
        COMPONENTS_HEADER +
        yaml.dump(
            {
                components: {
                    schemas: (spec['components'] as Record<string, unknown>)[
                        'schemas'
                    ],
                },
            },
            {
                lineWidth: 120,
                noRefs: true,
                quotingType: '"',
                forceQuotes: false,
            },
        );
    fs.writeFileSync(componentsPath, componentsContent, 'utf8');
    console.log(`emit-openapi: wrote ${componentsPath}`);
}

if (
    process.argv[1] &&
    pathToFileURL(process.argv[1]).href === import.meta.url
) {
    main().catch((err) => {
        console.error(err);
        process.exit(1);
    });
}
