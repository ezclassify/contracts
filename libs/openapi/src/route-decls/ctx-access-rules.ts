import type { RouteDecl } from './types.js';
import type { CtxAccessRulesResponseBody } from '../wire.js';

/**
 * GET /v1/ctx/:ctxId/:version/access/rules: describe every rule in the
 * context's access policy.
 */
export const decl: RouteDecl<undefined, CtxAccessRulesResponseBody> = {
    operationId: 'ctxAccessRules',
    method: 'GET',
    path: '/v1/ctx/:ctxId/:version/access/rules',
    summary: 'Describe every access rule in a context',
    description:
        'Returns the human-readable predicate, the `userAttributes` paths, and the data categories each rule depends on, for every rule in the context\'s access policy. A caller that only needs the rule ids reads them from the same response. The :version segment may be omitted to default to "latest".',
    tags: ['context', 'access'],
    pathParams: ['ctxId', 'version'],
    errorResponses: [
        { status: 404, ref: 'NotFound' },
        {
            status: 422,
            ref: 'UnprocessableEntity',
            description: 'Context has no access policy attached.',
        },
        { status: 500, ref: 'InternalError' },
    ],
    responseDescription: 'Every access rule in the context',
    responseSchema: { ref: 'CtxAccessRulesResponseBody' },
} as const;
