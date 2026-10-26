import type { RouteDecl } from './types.js';
import type {
    ContextSchemeProcessResult,
    CtxSchemeProcessRequestBody,
} from '../wire.js';

/**
 * POST /v1/ctx/:ctxId/:version/scheme/process: process a marking using the
 * context's composed scheme, for someone writing it.
 */
export const decl: RouteDecl<
    CtxSchemeProcessRequestBody,
    ContextSchemeProcessResult
> = {
    operationId: 'ctxSchemeProcess',
    method: 'POST',
    path: '/v1/ctx/:ctxId/:version/scheme/process',
    summary: 'Process a marking in a context',
    description:
        'The author\'s call. Reads the input marking text, together with any facts already chosen, against the context\'s composed scheme (base + layers), settles it, and returns everything validate returns plus what an author needs: the corrections to the text, proven fix paths, the outputs named in `outputs` and, when `suggestFor` names categories, the picker options for them. The :version segment may be omitted to default to "latest"; the resolved version is returned in the X-EzClassify-Resolved-Version response header.',
    tags: ['context', 'scheme'],
    pathParams: ['ctxId', 'version'],
    errorResponses: [
        {
            status: 400,
            ref: 'BadRequest',
            description:
                'Invalid or missing request fields; an `inputFormat`, an `outputFormat`, an `outputs` address or a `suggestFor` category the scheme does not declare; or `parts` holds more entries than this deployment allows. The deployment sets that cap, so the schema states no maximum.',
        },
        { status: 404, ref: 'NotFound' },
        { status: 500, ref: 'InternalError' },
    ],
    requestSchema: { ref: 'CtxSchemeProcessRequestBody' },
    requestExample: { input: 'EXAMPLE-HIGH' },
    responseDescription: 'Processing result',
    responseSchema: { ref: 'ContextSchemeProcessResult' },
} as const;
