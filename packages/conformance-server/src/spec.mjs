/**
 * The published contract, read for three things this server needs.
 *
 * Which operation a live path addresses, whether that operation is
 * authenticated, and whether the body a client sent is legal. All three are
 * read off `@ezclassify/openapi` rather than written down here: this package
 * ships no opinion about the wire, and a contract change has to reach it
 * without an edit.
 */

import { createRequire } from 'node:module';

import Ajv2020 from 'ajv/dist/2020.js';
import addFormats from 'ajv-formats';

const require = createRequire(import.meta.url);

/** Base URI the whole contract is registered under, so `#/...` refs resolve. */
const SPEC_URI = 'https://contracts.ezclassify.com/openapi.json';

/** JSON-pointer escaping (RFC 6901). */
function pointer(...segments) {
    return segments
        .map(
            (segment) =>
                `/${String(segment).replace(/~/g, '~0').replace(/\//g, '~1')}`,
        )
        .join('');
}

/** Split a path into segments, dropping the empty one before the leading slash. */
function segmentsOf(path) {
    return path.split('/').slice(1);
}

/**
 * The contract, indexed for lookup by live path.
 *
 * Path matching is segment-wise with `{name}` matching exactly one segment,
 * which is what OpenAPI means by a template. Concrete paths are preferred over
 * templated ones at the same length, so `/v1/scheme/list` resolves to the list
 * operation rather than to `/v1/scheme/{id}`.
 */
export class SpecIndex {
    constructor() {
        this.spec = require('@ezclassify/openapi/openapi.json');
        // `validateSchema: false` and `strict: false` because an OpenAPI
        // document is not a JSON Schema document: it carries `paths`,
        // `operationId`, `servers` and a dozen other keywords the meta-schema
        // would reject. Neither weakens validation of the instances.
        const Ctor = Ajv2020.default ?? Ajv2020;
        this.ajv = new Ctor({
            allErrors: true,
            strict: false,
            validateSchema: false,
        });
        (addFormats.default ?? addFormats)(this.ajv);
        this.ajv.addSchema(this.spec, SPEC_URI);
        this.compiled = new Map();

        /** Whether the contract secures an operation by default. */
        this.securedByDefault = (this.spec.security ?? []).length > 0;

        this.routes = [];
        for (const [template, item] of Object.entries(this.spec.paths ?? {})) {
            const segments = segmentsOf(template);
            for (const [method, operation] of Object.entries(item ?? {})) {
                if (typeof operation !== 'object' || operation === null)
                    continue;
                if (typeof operation.operationId !== 'string') continue;
                this.routes.push({
                    method: method.toUpperCase(),
                    operationId: operation.operationId,
                    // An operation-level `security: []` opts out of the default.
                    secured: Array.isArray(operation.security)
                        ? operation.security.length > 0
                        : this.securedByDefault,
                    segments,
                    template,
                    variables: segments.filter((s) => s.startsWith('{')).length,
                });
            }
        }
    }

    /** Version the contract declares for itself. */
    get infoVersion() {
        return this.spec.info?.version ?? 'unknown';
    }

    /**
     * Resolve a live path to the operations the contract declares on it.
     *
     * @param {string} path - Live request path, without the query string
     * @returns {{
     *     matches: object[];
     *     byMethod: (method: string) => object | undefined;
     * }}
     */
    resolvePath(path) {
        const live = segmentsOf(path);
        const matches = this.routes
            .filter(
                (route) =>
                    route.segments.length === live.length &&
                    route.segments.every(
                        (segment, at) =>
                            segment.startsWith('{') || segment === live[at],
                    ),
            )
            // Fewest template variables first: a concrete path beats a template.
            .sort((left, right) => left.variables - right.variables);
        return {
            byMethod: (method) =>
                matches.find((route) => route.method === method.toUpperCase()),
            matches,
        };
    }

    /**
     * Whether a live request has to present a credential.
     *
     * A path the contract does not serve counts as secured. On a deployment
     * that runs authentication the credential check happens before dispatch, so
     * an unauthenticated request to a route that does not exist is refused for
     * being unauthenticated, not for the route being absent, which is the whole
     * point of the constant refusal shape.
     *
     * @param {string} method - HTTP method
     * @param {string} path - Live request path, without the query string
     * @returns {boolean} True when a credential is required
     */
    requiresCredential(method, path) {
        const route = this.resolvePath(path).byMethod(method);
        return route ? route.secured : this.securedByDefault;
    }

    /**
     * JSON pointer at an operation's request body schema, or null when it
     * declares none.
     */
    requestSchemaPointer(route) {
        const operation =
            this.spec.paths?.[route.template]?.[route.method.toLowerCase()];
        if (!operation?.requestBody) return null;
        return pointer(
            'paths',
            route.template,
            route.method.toLowerCase(),
            'requestBody',
            'content',
            'application/json',
            'schema',
        );
    }

    /** Resolve a JSON pointer against the contract. */
    resolvePointer(jsonPointer) {
        let current = this.spec;
        for (const raw of jsonPointer.split('/').slice(1)) {
            const segment = raw.replace(/~1/g, '/').replace(/~0/g, '~');
            if (current === null || typeof current !== 'object')
                return undefined;
            current = current[segment];
        }
        return current;
    }

    /** Compile (once) a validator for a pointer into the contract. */
    validator(jsonPointer) {
        const cached = this.compiled.get(jsonPointer);
        if (cached) return cached;
        const compiled = this.ajv.compile({
            $ref: `${SPEC_URI}#${jsonPointer}`,
        });
        this.compiled.set(jsonPointer, compiled);
        return compiled;
    }

    /**
     * Validate a request body against the operation it was sent to.
     *
     * @param {object} route - A route from {@link resolvePath}
     * @param {unknown} body - Parsed request body, or undefined
     * @returns {{ ok: boolean; errors: object[] } | null} Null when the
     *   contract declares no body schema for the operation
     */
    validateRequest(route, body) {
        const jsonPointer = this.requestSchemaPointer(route);
        if (jsonPointer === null) {
            return body === undefined
                ? { errors: [], ok: true }
                : {
                      errors: [
                          {
                              instancePath: '',
                              keyword: 'requestBody',
                              message: `${route.method} ${route.template} declares no request body`,
                          },
                      ],
                      ok: false,
                  };
        }
        if (body === undefined) {
            return {
                errors: [
                    {
                        instancePath: '',
                        keyword: 'requestBody',
                        message: `${route.method} ${route.template} requires a request body`,
                    },
                ],
                ok: false,
            };
        }
        const validate = this.validator(jsonPointer);
        if (validate(body)) return { errors: [], ok: true };
        return { errors: validate.errors ?? [], ok: false };
    }

    /**
     * Property names the contract declares at an instance path.
     *
     * Used to answer "did you mean" on an unknown field. The walk follows
     * `$ref`, unions the branches of `allOf`/`anyOf`/`oneOf`, and steps into
     * `items` for an array index, which covers every shape this contract uses.
     * It returns a set rather than a single schema on purpose: a union member
     * that does not apply still names a field the caller might have meant.
     *
     * @param {object} route - A route from {@link resolvePath}
     * @param {string} instancePath - Ajv instance path, for example
     *   `/assertions/0`
     * @returns {string[]} Declared property names, sorted
     */
    propertiesAt(route, instancePath) {
        const jsonPointer = this.requestSchemaPointer(route);
        if (jsonPointer === null) return [];
        const steps = instancePath
            .split('/')
            .slice(1)
            .map((raw) => raw.replace(/~1/g, '/').replace(/~0/g, '~'));

        /** Expand one schema node into every schema it could be. */
        const expand = (node, seen) => {
            if (node === null || typeof node !== 'object') return [];
            if (typeof node.$ref === 'string') {
                if (seen.has(node.$ref)) return [];
                seen.add(node.$ref);
                const target = node.$ref.startsWith('#')
                    ? this.resolvePointer(node.$ref.slice(1))
                    : undefined;
                return expand(target, seen);
            }
            const out = [node];
            for (const key of ['allOf', 'anyOf', 'oneOf']) {
                for (const branch of node[key] ?? [])
                    out.push(...expand(branch, seen));
            }
            return out;
        };

        let current = expand(this.resolvePointer(jsonPointer), new Set());
        for (const step of steps) {
            const next = [];
            for (const node of current) {
                const child = /^\d+$/.test(step)
                    ? node.items
                    : node.properties?.[step];
                next.push(...expand(child, new Set()));
            }
            current = next;
            if (current.length === 0) return [];
        }
        const names = new Set();
        for (const node of current) {
            for (const name of Object.keys(node.properties ?? {}))
                names.add(name);
        }
        return [...names].sort();
    }
}
