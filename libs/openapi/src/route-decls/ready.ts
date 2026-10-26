import type { RouteDecl } from './types.js';
import type { ReadyResponseBody } from '../wire.js';

/** GET /v1/ready: readiness probe. */
export const decl: RouteDecl<unknown, ReadyResponseBody> = {
    operationId: 'getReady',
    method: 'GET',
    path: '/v1/ready',
    summary: 'Readiness check',
    description:
        'Reports whether the shared runtime host admitted the configured license and all explicitly required local artifacts are available. Expiration never makes a replica unready.',
    tags: ['infrastructure'],
    anonymous: true,
    errorResponses: [
        {
            status: 503,
            ref: 'NotReady',
            description:
                'Runtime host is starting or required local artifacts are unavailable',
        },
    ],
    responseDescription: 'Replica is ready to receive traffic',
    responseSchema: { ref: 'ReadyResponse' },
    responseExample: { status: 'ready' },
} as const;
