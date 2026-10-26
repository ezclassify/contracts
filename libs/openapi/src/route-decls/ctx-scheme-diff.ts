import type { RouteDecl } from './types.js';
import type {
    ContextSchemeDiffResult,
    CtxSchemeDiffRequestBody,
} from '../wire.js';

/**
 * POST /v1/ctx/:ctxId/:version/scheme/diff: diff two markings using the
 * context's composed scheme.
 */
export const decl: RouteDecl<
    CtxSchemeDiffRequestBody,
    ContextSchemeDiffResult
> = {
    operationId: 'ctxSchemeDiff',
    method: 'POST',
    path: '/v1/ctx/:ctxId/:version/scheme/diff',
    summary: 'Diff two markings in a context',
    description:
        'Returns the structural diff between two marking strings as evaluated against the context\'s composed scheme. The :version segment may be omitted to default to "latest"; the resolved version is returned in the X-EzClassify-Resolved-Version response header.',
    tags: ['context', 'scheme'],
    pathParams: ['ctxId', 'version'],
    errorResponses: [
        {
            status: 400,
            ref: 'BadRequest',
            description:
                'Invalid or missing request fields, or an `inputFormat` the scheme does not declare.',
        },
        { status: 404, ref: 'NotFound' },
        { status: 500, ref: 'InternalError' },
    ],
    requestSchema: { ref: 'CtxSchemeDiffRequestBody' },
    responseDescription: 'Diff result',
    responseSchema: { ref: 'ContextSchemeDiffResult' },
} as const;
