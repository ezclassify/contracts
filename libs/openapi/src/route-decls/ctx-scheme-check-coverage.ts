import type { RouteDecl } from './types.js';
import type {
    ContextSchemeCoverageResult,
    CtxSchemeCheckCoverageRequestBody,
} from '../wire.js';

/**
 * POST /v1/ctx/:ctxId/:version/scheme/check-coverage: verify children markings
 * cover a parent within a context.
 */
export const decl: RouteDecl<
    CtxSchemeCheckCoverageRequestBody,
    ContextSchemeCoverageResult
> = {
    operationId: 'ctxSchemeCheckCoverage',
    method: 'POST',
    path: '/v1/ctx/:ctxId/:version/scheme/check-coverage',
    summary: 'Check marking coverage in a context',
    description:
        'Aggregates the child markings using the context\'s composed scheme and checks whether the result is covered by the parent marking. The :version segment may be omitted to default to "latest".',
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
    requestSchema: { ref: 'CtxSchemeCheckCoverageRequestBody' },
    requestExample: {
        children: ['LEVEL-LOW', 'LEVEL-MEDIUM'],
        parent: 'LEVEL-HIGH',
    },
    responseDescription: 'Coverage result',
    responseSchema: { ref: 'ContextSchemeCoverageResult' },
} as const;
