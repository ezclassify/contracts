import type { RouteDecl } from './types.js';
import type {
    ContextCrosswalkTranslationResult,
    CtxCrosswalkTranslateRequestBody,
} from '../wire.js';

/**
 * POST /v1/ctx/:ctxId/:version/crosswalk/translate: apply a directional
 * crosswalk declared by the context.
 */
export const decl: RouteDecl<
    CtxCrosswalkTranslateRequestBody,
    ContextCrosswalkTranslationResult
> = {
    operationId: 'ctxCrosswalkTranslate',
    method: 'POST',
    path: '/v1/ctx/:ctxId/:version/crosswalk/translate',
    summary: 'Translate a marking through a crosswalk in a context',
    description:
        'Applies the named directional crosswalk to a SOURCE and returns the treatment of every source assertion: what was carried, what needs review, and what no mapping covers. A prohibition stops the translation before target processing and the response says which one. The source is either a rendered `marking` string or its structured `assertions` form: send exactly one of the two, because a request with neither has no source and a request with both has two. The :version segment may be omitted to default to "latest".',
    tags: ['context', 'crosswalk'],
    pathParams: ['ctxId', 'version'],
    errorResponses: [
        { status: 400, ref: 'BadRequest' },
        {
            status: 404,
            ref: 'NotFound',
            description:
                'Context or version not found, or the Context has no crosswalk with that `crosswalkId`.',
        },
        {
            status: 422,
            ref: 'UnprocessableEntity',
            description: 'Context has no crosswalks attached.',
        },
        { status: 500, ref: 'InternalError' },
    ],
    requestSchema: { ref: 'CtxCrosswalkTranslateRequestBody' },
    requestExample: {
        crosswalkId: 'state-to-district',
        marking: 'LEVEL-HIGH',
    },
    responseDescription: 'Resolved Context crosswalk translation',
    responseSchema: { ref: 'ContextCrosswalkTranslationResult' },
} as const;
