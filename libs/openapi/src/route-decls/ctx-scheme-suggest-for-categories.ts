import type { RouteDecl } from './types.js';
import type {
    ContextSchemeSuggestForCategoriesResult,
    CtxSchemeSuggestForCategoriesRequestBody,
} from '../wire.js';

/**
 * POST /v1/ctx/:ctxId/:version/scheme/suggest-for-categories: suggest
 * completions for several categories of the context's composed scheme. The
 * wire name of the adapter's `suggestForCategories`.
 */
export const decl: RouteDecl<
    CtxSchemeSuggestForCategoriesRequestBody,
    ContextSchemeSuggestForCategoriesResult
> = {
    operationId: 'ctxSchemeSuggestForCategories',
    method: 'POST',
    path: '/v1/ctx/:ctxId/:version/scheme/suggest-for-categories',
    summary: 'Suggest completions for several categories in a context',
    description:
        'Returns the suggestion result for each requested category within the context\'s composed scheme, keyed by category id, each computed as if that category\'s own assertions were not present. The map is the same one a process request that names `suggestFor` returns in `suggestionsFor`. Each result carries the options only; whether the marking stands is what validate and process answer. An unknown category id is refused. The :version segment may be omitted to default to "latest".',
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
    requestSchema: { ref: 'CtxSchemeSuggestForCategoriesRequestBody' },
    requestExample: {
        assertions: [{ categoryId: 'level', conceptId: 'level-high' }],
        categoryIds: ['level', 'audience'],
    },
    responseDescription: 'Suggestion results keyed by category id',
    responseSchema: { ref: 'ContextSchemeSuggestForCategoriesResult' },
} as const;
