import type { RouteDecl } from './types.js';
import type {
    CtxSchemeNormalizeRequestBody,
    ContextSchemeNormalizeResult,
} from '../wire.js';

/**
 * POST /v1/ctx/:ctxId/:version/scheme/normalize: canonical normalized form of a
 * marking using the context's composed scheme.
 */
export const decl: RouteDecl<
    CtxSchemeNormalizeRequestBody,
    ContextSchemeNormalizeResult
> = {
    operationId: 'ctxSchemeNormalize',
    method: 'POST',
    path: '/v1/ctx/:ctxId/:version/scheme/normalize',
    summary: 'Normalize a marking in a context',
    description:
        'Returns the canonical normalized form of a marking against the context\'s composed scheme. The :version segment may be omitted to default to "latest"; the resolved version is returned in the X-EzClassify-Resolved-Version response header.',
    tags: ['context', 'scheme'],
    pathParams: ['ctxId', 'version'],
    errorResponses: [
        {
            status: 400,
            ref: 'BadRequest',
            description:
                'Invalid or missing request fields, or an `inputFormat` or `outputFormat` the scheme does not declare.',
        },
        { status: 404, ref: 'NotFound' },
        { status: 500, ref: 'InternalError' },
    ],
    requestSchema: { ref: 'CtxSchemeNormalizeRequestBody' },
    requestExample: { input: 'EXAMPLE-HIGH' },
    responseDescription: 'Normalized marking',
    responseSchema: { ref: 'ContextSchemeNormalizeResult' },
} as const;
