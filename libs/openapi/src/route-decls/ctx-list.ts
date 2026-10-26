import type { RouteDecl } from './types.js';
import type { CtxListResponseBody } from '../wire.js';

/** GET /v1/ctx: list the context ids this caller may use. */
export const decl: RouteDecl<undefined, CtxListResponseBody> = {
    operationId: 'ctxList',
    method: 'GET',
    path: '/v1/ctx',
    summary: 'List the context ids the caller may use',
    description:
        "Lists the installed context ids the caller may use. On a managed deployment, a Context token lists the one context it names, and an API-key caller without a token lists the contexts the deployment approves for its organization, when the deployment accepts API keys. A standalone runtime takes no Context token: installation is the grant, and it lists every installed context it can serve now, leaving out one whose latest version does not resolve or whose content the license does not cover. The list is unpaginated. On a managed deployment, returns 404 when authorization is denied.",
    tags: ['context'],
    errorResponses: [
        { status: 404, ref: 'NotFound' },
        { status: 500, ref: 'InternalError' },
    ],
    responseDescription: 'List of context ids',
    responseSchema: { ref: 'CtxListResponseBody' },
    responseExample: { contexts: ['corp-default', 'corp-restricted'] },
} as const;
