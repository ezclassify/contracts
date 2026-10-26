/**
 * Core type for per-route OpenAPI declaration files.
 *
 * Each route in the REST API has a sibling declaration file that exports a
 * `RouteDecl<Req, Res>` constant. The `Req` and `Res` type parameters carry
 * TypeScript types that a schema generator (ts-json-schema-generator) can
 * extract to produce the `requestBody` and `responses` blocks for the route's
 * OpenAPI `paths` entry.
 *
 * Route declarations are consumed by `scripts/emit-openapi.ts`, which generates
 * `openapi.yaml`/`openapi.json`, and by tooling (the MCP catalog among others)
 * that needs the method, path, and summary without reading a runtime's own
 * route table.
 *
 * The declarations are the source of truth: the OpenAPI spec is generated from
 * them and must not be hand-edited. Changing a `summary`/`description` here
 * changes the generated spec, so keep the wire contract (operationId, method,
 * path, schemas, status codes) stable when you are only touching prose.
 */

/** HTTP method tokens used in route declarations. */
export type HttpMethod = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';

/**
 * Named references to the shared error response envelopes defined in
 * `scripts/openapi-http-overlay.yaml`. Each string maps to a `$ref` in the
 * emitted spec.
 *
 * There is no `TooManyRequests` member. The emitter declares the 429 envelope
 * on every operation itself, because the rate limiter answers ahead of every
 * route, so no route declares it and none can leave it out.
 *
 * There is no `Unauthorized` member. The server answers an unauthenticated
 * request with the constant not-found shape, so no route has a 401 to declare
 * and the overlay declares no such component. Leaving the name selectable would
 * let a route emit a `$ref` at a component that does not exist.
 */
export type ErrorRef =
    | 'BadRequest'
    | 'Conflict'
    | 'NotFound'
    | 'UnprocessableEntity'
    | 'InternalError'
    | 'NotReady';

/** A single error response entry declared by a route. */
export interface ErrorResponse {
    /** HTTP status code. */
    readonly status: number;
    /** Reference to a named error envelope in the HTTP overlay. */
    readonly ref: ErrorRef;
    /**
     * Human-readable description override (optional; defaults to the schema
     * description).
     */
    readonly description?: string;
}

/** A query parameter declared by a route. */
export interface QueryParam {
    /** Parameter name as it appears in the query string. */
    readonly name: string;
    /** Description published for the parameter. */
    readonly description: string;
    /** Whether a request must send the parameter. */
    readonly required: boolean;
    /** JSON Schema type of the parameter's value. */
    readonly schema: 'string' | 'boolean' | 'integer';
}

/**
 * Description of a request or success-response body's JSON schema.
 *
 * Operations reference a named `components.schemas` entry by name (`{ ref:
 * 'ProcessRequest' }`), return arrays of a named entry (`{ arrayOf:
 * 'ScanResult' }`), or return raw primitives (`{ primitive: 'string' }`).
 * Object-shaped request and result contracts must be named so every SDK
 * generator has a stable model address.
 *
 * `emit-openapi.ts` resolves each variant into the OpenAPI `schema` object that
 * lives under `requestBody.content.application/json.schema` or
 * `responses.<code>.content.application/json.schema`.
 */
export type BodySchema =
    | {
          /** Name of the `components.schemas` entry the body is. */
          readonly ref: string;
      }
    | {
          /** Name of the `components.schemas` entry each array item is. */
          readonly arrayOf: string;
      }
    | {
          /** JSON Schema type of a body that is a single value. */
          readonly primitive: 'string' | 'integer' | 'number' | 'boolean';
          /** Description published for the value. */
          readonly description?: string;
      };

/**
 * Per-route OpenAPI declaration.
 *
 * `Req` is the TypeScript type of the JSON request body (omit for GET routes
 * with no body). `Res` is the TypeScript type of the 2xx success response body.
 * A schema generator extracts JSON Schema from these type parameters when
 * building the OpenAPI spec.
 */
export interface RouteDecl<Req = unknown, Res = unknown> {
    /** OpenAPI operationId: must be globally unique. */
    readonly operationId: string;
    /** HTTP verb. */
    readonly method: HttpMethod;
    /**
     * Express-style path with `:param` tokens for path parameters (e.g.
     * `/v1/ctx/:ctxId/:version/scheme/process`). The emit script converts `:param` to `{param}`
     * for OpenAPI output.
     */
    readonly path: string;
    /** Short one-line summary shown in API explorers. */
    readonly summary: string;
    /** Full description for the OpenAPI operation object. */
    readonly description: string;
    /** OpenAPI tags grouping this operation (e.g. `['scheme']`). */
    readonly tags: readonly string[];
    /** Path parameter names (without the leading `:`). */
    readonly pathParams?: readonly string[];
    /** Query parameters accepted by this route. */
    readonly queryParams?: readonly QueryParam[];
    /**
     * Error responses this route may return. The 429 every operation answers
     * is added by the emitter, and so is a plain 400 when the route declares
     * none, because every operation refuses a query parameter it does not
     * declare. Declare a 400 here only to describe what else makes this
     * route's requests invalid.
     */
    readonly errorResponses: readonly ErrorResponse[];
    /**
     * Whether this route answers without a credential. The document declares
     * bearer auth as the default requirement for every operation; setting this
     * emits `security: []` on the operation, which is how OpenAPI spells "this
     * one is exempt".
     *
     * Reserved for the probes an orchestrator calls before any token exists. A
     * data-path route never sets it.
     */
    readonly anonymous?: boolean;
    /**
     * Schema of the JSON request body, if the route accepts one. Resolves to
     * the operation's `requestBody.content.application/json.schema` block.
     * Omitted for routes that take no body (most GETs).
     */
    readonly requestSchema?: BodySchema;
    /**
     * Optional `application/json` example value for the request body. Forwarded
     * verbatim to OpenAPI as `requestBody.content.application/json.example`.
     */
    readonly requestExample?: unknown;
    /**
     * Description of the success (2xx) response. Used as the `description`
     * field of the response object.
     */
    readonly responseDescription?: string;
    /**
     * Schema of the JSON success response body. Omitted when the response has
     * no body (rare).
     */
    readonly responseSchema?: BodySchema;
    /** Optional `application/json` example value for the success response body. */
    readonly responseExample?: unknown;
    /**
     * Phantom property, never set at runtime. Carries the request body type so
     * schema generators can extract it.
     */
    readonly _req?: Req;
    /**
     * Phantom property, never set at runtime. Carries the response body type so
     * schema generators can extract it.
     */
    readonly _res?: Res;
}
