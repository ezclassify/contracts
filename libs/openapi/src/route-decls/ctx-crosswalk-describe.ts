import type { RouteDecl } from './types.js';
import type { CtxCrosswalkDescribeResponseBody } from '../wire.js';

/**
 * GET /v1/ctx/:ctxId/:version/crosswalk/describe: describe every crosswalk the
 * context holds.
 */
export const decl: RouteDecl<undefined, CtxCrosswalkDescribeResponseBody> = {
    operationId: 'ctxCrosswalkDescribe',
    method: 'GET',
    path: '/v1/ctx/:ctxId/:version/crosswalk/describe',
    summary: 'Describe every crosswalk in a context',
    description:
        'Returns every crosswalk the context holds, in declaration order: its id and the concrete version that answers, its name, guidance and citation, the source and target schemes as the selectors the context description lists under `schemes`, and the mappings and selections a translation applies, each with its disposition and reason. A context that declares no crosswalk answers with an empty list. The :version segment may be omitted to default to "latest".',
    tags: ['context', 'crosswalk'],
    pathParams: ['ctxId', 'version'],
    errorResponses: [
        { status: 404, ref: 'NotFound' },
        { status: 500, ref: 'InternalError' },
    ],
    responseDescription: 'Every crosswalk in the context',
    responseSchema: { ref: 'CtxCrosswalkDescribeResponseBody' },
} as const;
