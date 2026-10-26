import type { RouteDecl } from './types.js';
import type {
    CtxSchemeRenderRequestBody,
    ContextSchemeRenderResult,
} from '../wire.js';

/**
 * POST /v1/ctx/:ctxId/:version/scheme/render: render assertions to a marking
 * string using the context's composed scheme.
 */
export const decl: RouteDecl<
    CtxSchemeRenderRequestBody,
    ContextSchemeRenderResult
> = {
    operationId: 'ctxSchemeRender',
    method: 'POST',
    path: '/v1/ctx/:ctxId/:version/scheme/render',
    summary: 'Render assertions in a context',
    description:
        'Renders assertions to a marking string using the context\'s composed scheme. The :version segment may be omitted to default to "latest"; the resolved version is returned in the X-EzClassify-Resolved-Version response header.',
    tags: ['context', 'scheme'],
    pathParams: ['ctxId', 'version'],
    errorResponses: [
        {
            status: 400,
            ref: 'BadRequest',
            description:
                'Invalid or missing request fields, or an `outputFormat` the scheme does not declare.',
        },
        { status: 404, ref: 'NotFound' },
        { status: 500, ref: 'InternalError' },
    ],
    requestSchema: { ref: 'CtxSchemeRenderRequestBody' },
    responseDescription: 'Rendered marking',
    responseSchema: { ref: 'ContextSchemeRenderResult' },
} as const;
