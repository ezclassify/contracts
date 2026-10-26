import type { RouteDecl } from './types.js';
import type {
    CtxGuideFilterRulesRequestBody,
    ContextGuideFilterRulesResult,
} from '../wire.js';

/**
 * POST /v1/ctx/:ctxId/:version/guide/filter-rules: text-search guide rules
 * bound to the context.
 */
export const decl: RouteDecl<
    CtxGuideFilterRulesRequestBody,
    ContextGuideFilterRulesResult
> = {
    operationId: 'ctxGuideFilterRules',
    method: 'POST',
    path: '/v1/ctx/:ctxId/:version/guide/filter-rules',
    summary: 'Filter guide rules in a context',
    description:
        'Returns the subset of rules in the context-bound guide that match a free-text query. Pass guideId to disambiguate when the context has multiple guides.',
    tags: ['context', 'guide'],
    pathParams: ['ctxId', 'version'],
    errorResponses: [
        { status: 400, ref: 'BadRequest' },
        {
            status: 404,
            ref: 'NotFound',
            description:
                'Context or version not found, or the Context has no guide with that `guideId`.',
        },
        {
            status: 422,
            ref: 'UnprocessableEntity',
            description: 'Context has no guides attached.',
        },
        { status: 500, ref: 'InternalError' },
    ],
    requestSchema: { ref: 'CtxGuideFilterRulesRequestBody' },
    responseDescription: 'Filtered rules',
    responseSchema: { ref: 'ContextGuideFilterRulesResult' },
} as const;
