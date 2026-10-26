import type { RouteDecl } from './types.js';
import type {
    ContextSchemeNoticesResult,
    CtxSchemeNoticesRequestBody,
} from '../wire.js';

/**
 * POST /v1/ctx/:ctxId/:version/scheme/notices: collect concept notices for the
 * given assertions using the context's composed scheme.
 */
export const decl: RouteDecl<
    CtxSchemeNoticesRequestBody,
    ContextSchemeNoticesResult
> = {
    operationId: 'ctxSchemeNotices',
    method: 'POST',
    path: '/v1/ctx/:ctxId/:version/scheme/notices',
    summary: 'Collect notices for assertions in a context',
    description:
        'Collects non-blocking notices attached to the supplied assertions\' concepts under the context\'s composed scheme. The :version segment may be omitted to default to "latest"; the resolved version is returned in the X-EzClassify-Resolved-Version response header. Operations that answer with a processed marking, such as process, validate and aggregate, already carry the same list on the result\'s notices field.',
    tags: ['context', 'scheme'],
    pathParams: ['ctxId', 'version'],
    errorResponses: [
        { status: 400, ref: 'BadRequest' },
        { status: 404, ref: 'NotFound' },
        { status: 500, ref: 'InternalError' },
    ],
    requestSchema: { ref: 'CtxSchemeNoticesRequestBody' },
    responseDescription: 'Array of collected notices',
    responseSchema: { ref: 'ContextSchemeNoticesResult' },
} as const;
