import type { RouteDecl } from './types.js';
import type { HealthResponseBody } from '../wire.js';

/** GET /v1/health: liveness probe. */
export const decl: RouteDecl<unknown, HealthResponseBody> = {
    operationId: 'getHealth',
    method: 'GET',
    path: '/v1/health',
    summary: 'Health check',
    description:
        'Returns service liveness status and the engine version string.',
    tags: ['infrastructure'],
    anonymous: true,
    errorResponses: [],
    responseDescription: 'Server is healthy',
    responseSchema: { ref: 'HealthResponse' },
    // Every field here is an illustrative literal, so an engine release never
    // rewrites the published spec to change one documentation string. The
    // handler reports the running version; the example only has to look like
    // one.
    responseExample: {
        status: 'ok',
        engineVersion: '1.0.0',
        engineSha: '05159342c80cc5fb2506fc7adf3c511f6b3af4d9',
        gitTag: 'v1.0.0',
        openapiVersion: '1.0.0',
        abiVersion: 'v1',
    },
} as const;
