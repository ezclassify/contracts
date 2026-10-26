import type { RouteDecl } from './types.js';
import type {
    ContextGuideViewResult,
    CtxGuideViewRequestBody,
} from '../wire.js';

/**
 * POST /v1/ctx/:ctxId/:version/guide/view: structural view of the context-bound
 * guide.
 */
export const decl: RouteDecl<CtxGuideViewRequestBody, ContextGuideViewResult> =
    {
        operationId: 'ctxGuideView',
        method: 'POST',
        path: '/v1/ctx/:ctxId/:version/guide/view',
        summary: 'Build guide structural view in a context',
        description:
            'Returns a structural view of the context-bound guide (categories, rule index, outcomes) suitable for rendering a picker UI. Pass guideId to disambiguate when the context has multiple guides.',
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
        requestSchema: { ref: 'CtxGuideViewRequestBody' },
        responseDescription: 'Guide view',
        responseSchema: { ref: 'ContextGuideViewResult' },
    } as const;
