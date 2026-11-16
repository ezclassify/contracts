import type { RouteDecl } from './types.js';
import { schemeSelector } from './scheme-selector.js';
import type { CategoryView } from '@ezclassify/types';

/** GET /v1/ctx/:ctxId/:version/scheme/categories: the context's category list. */
export const decl: RouteDecl<undefined, CategoryView[]> = {
    operationId: 'ctxSchemeCategories',
    method: 'GET',
    path: '/v1/ctx/:ctxId/:version/scheme/categories',
    summary: 'Get the scheme categories in a context',
    description:
        "Returns every category of the context's composed scheme as a category view, in declared order: label, scopes, default concept, rollup, and concept sort order, the same shape a local engine's scheme view carries. The :version segment may be omitted to default to \"latest\"; the resolved version is returned in the X-EzClassify-Resolved-Version response header.",
    tags: ['context', 'scheme'],
    pathParams: ['ctxId', 'version'],
    queryParams: [
        schemeSelector,
    ],
    errorResponses: [
        { status: 404, ref: 'NotFound' },
        { status: 500, ref: 'InternalError' },
    ],
    responseDescription: 'Category list',
    responseSchema: { arrayOf: 'CategoryView' },
} as const;
