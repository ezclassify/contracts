import type { RouteDecl } from './types.js';
import type {
    ContextSchemeExplainResult,
    CtxSchemeExplainRequestBody,
} from '../wire.js';

/**
 * POST /v1/ctx/:ctxId/:version/scheme/explain: the step-by-step trace of how
 * the context's composed scheme settles a marking.
 */
export const decl: RouteDecl<
    CtxSchemeExplainRequestBody,
    ContextSchemeExplainResult
> = {
    operationId: 'ctxSchemeExplain',
    method: 'POST',
    path: '/v1/ctx/:ctxId/:version/scheme/explain',
    summary: 'Explain how a marking is processed in a context',
    description:
        'Processes the input exactly as the process operation does and returns the trace of that processing instead of its result: what was read, what was repaired, what the scheme\'s rules inferred, what was found wrong, and what was written. Use it to answer why a marking came out the way it did. The :version segment may be omitted to default to "latest"; the resolved version is returned in the X-EzClassify-Resolved-Version response header.',
    tags: ['context', 'scheme'],
    pathParams: ['ctxId', 'version'],
    errorResponses: [
        {
            status: 400,
            ref: 'BadRequest',
            description:
                'Invalid or missing request fields; an `inputFormat` or `outputFormat` the scheme does not declare; or `parts` holds more entries than this deployment allows. The deployment sets that cap, so the schema states no maximum.',
        },
        { status: 404, ref: 'NotFound' },
        { status: 500, ref: 'InternalError' },
    ],
    requestSchema: { ref: 'CtxSchemeExplainRequestBody' },
    requestExample: { input: 'EXAMPLE-HIGH' },
    responseDescription: 'Explanation trace',
    responseSchema: { ref: 'ContextSchemeExplainResult' },
} as const;
