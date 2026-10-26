import type { RouteDecl } from './types.js';
import type {
    CtxSchemeFilterConceptsRequestBody,
    ContextSchemeFilterConceptsResult,
} from '../wire.js';

/**
 * POST /v1/ctx/:ctxId/:version/scheme/filter-concepts: text-search the
 * context's composed scheme by query string.
 */
export const decl: RouteDecl<
    CtxSchemeFilterConceptsRequestBody,
    ContextSchemeFilterConceptsResult
> = {
    operationId: 'ctxSchemeFilterConcepts',
    method: 'POST',
    path: '/v1/ctx/:ctxId/:version/scheme/filter-concepts',
    summary: 'Filter scheme concepts in a context',
    description:
        'Filters the context\'s composed scheme concept list by a text query. The :version segment may be omitted to default to "latest"; the resolved version is returned in the X-EzClassify-Resolved-Version response header.',
    tags: ['context', 'scheme'],
    pathParams: ['ctxId', 'version'],
    errorResponses: [
        { status: 400, ref: 'BadRequest' },
        { status: 404, ref: 'NotFound' },
        { status: 500, ref: 'InternalError' },
    ],
    requestSchema: { ref: 'CtxSchemeFilterConceptsRequestBody' },
    responseDescription: 'Filtered concepts',
    responseSchema: { ref: 'ContextSchemeFilterConceptsResult' },
} as const;
