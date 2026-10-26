import type { RouteDecl } from './types.js';
import type { CtxVersionsResponseBody } from '../wire.js';

/** GET /v1/ctx/:ctxId: list available versions for a single context id. */
export const decl: RouteDecl<undefined, CtxVersionsResponseBody> = {
    operationId: 'ctxVersions',
    method: 'GET',
    path: '/v1/ctx/:ctxId',
    summary: 'List available versions for a context id',
    description:
        'Lists every installed version of one context id that the caller may use, highest semver first. On a managed deployment, these are the versions its Context token or API key admits. A standalone runtime takes no Context token: installation is the grant, and it lists every installed version it can serve, leaving out one whose content the license does not cover. Returns 404 when the id is not installed or authorization is denied.',
    tags: ['context'],
    pathParams: ['ctxId'],
    errorResponses: [
        { status: 404, ref: 'NotFound' },
        { status: 500, ref: 'InternalError' },
    ],
    responseDescription: 'Available versions for the context',
    responseSchema: { ref: 'CtxVersionsResponseBody' },
    responseExample: { id: 'corp-default', versions: ['2.0.0'] }, // version-literal:external
} as const;
