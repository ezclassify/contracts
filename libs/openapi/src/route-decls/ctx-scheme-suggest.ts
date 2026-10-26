import type { RouteDecl } from './types.js';
import type {
    ContextSchemeSuggestResult,
    CtxSchemeSuggestRequestBody,
} from '../wire.js';

/**
 * POST /v1/ctx/:ctxId/:version/scheme/suggest: suggest concept completions for
 * a partial marking.
 */
export const decl: RouteDecl<
    CtxSchemeSuggestRequestBody,
    ContextSchemeSuggestResult
> = {
    operationId: 'ctxSchemeSuggest',
    method: 'POST',
    path: '/v1/ctx/:ctxId/:version/scheme/suggest',
    summary: 'Suggest marking completions in a context',
    description:
        'Returns concept suggestions for a partial marking input within the context\'s composed scheme: the options only. Whether the marking stands is what validate and process answer. The :version segment may be omitted to default to "latest".',
    tags: ['context', 'scheme'],
    pathParams: ['ctxId', 'version'],
    errorResponses: [
        {
            status: 400,
            ref: 'BadRequest',
            description:
                'Invalid or missing request fields; a request that carries both `input` and `assertions`, or neither; `inputFormat` sent with `assertions`; or an `inputFormat` or `outputFormat` the scheme does not declare.',
        },
        { status: 404, ref: 'NotFound' },
        { status: 500, ref: 'InternalError' },
    ],
    requestSchema: { ref: 'CtxSchemeSuggestRequestBody' },
    requestExample: { input: '' },
    responseDescription: 'Suggestion result',
    responseSchema: { ref: 'ContextSchemeSuggestResult' },
} as const;
