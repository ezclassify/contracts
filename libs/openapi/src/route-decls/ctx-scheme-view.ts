import type { RouteDecl } from './types.js';
import type {
    ContextSchemeViewResult,
    CtxSchemeViewRequestBody,
} from '../wire.js';

/**
 * POST /v1/ctx/:ctxId/:version/scheme/view: structural view of the context's
 * composed scheme.
 */
export const decl: RouteDecl<
    CtxSchemeViewRequestBody,
    ContextSchemeViewResult
> = {
    operationId: 'ctxSchemeView',
    method: 'POST',
    path: '/v1/ctx/:ctxId/:version/scheme/view',
    summary: 'Build scheme structural view in a context',
    description:
        'Returns a categorized structural view of the context\'s composed scheme (base + layers), suitable for rendering a picker UI. The :version segment may be omitted to default to "latest"; the resolved version is returned in the X-EzClassify-Resolved-Version response header.',
    tags: ['context', 'scheme'],
    pathParams: ['ctxId', 'version'],
    errorResponses: [
        { status: 400, ref: 'BadRequest' },
        { status: 404, ref: 'NotFound' },
        { status: 500, ref: 'InternalError' },
    ],
    requestSchema: { ref: 'CtxSchemeViewRequestBody' },
    responseDescription: 'Scheme view',
    responseSchema: { ref: 'ContextSchemeViewResult' },
} as const;
