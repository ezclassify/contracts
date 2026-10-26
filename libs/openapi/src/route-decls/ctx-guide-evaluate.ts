import type { RouteDecl } from './types.js';
import type {
    ContextGuideEvaluationResult,
    CtxGuideEvaluateRequestBody,
} from '../wire.js';

/**
 * POST /v1/ctx/:ctxId/:version/guide/evaluate: evaluate one guide or aggregate
 * all guides attached to the context against selected rules.
 */
export const decl: RouteDecl<
    CtxGuideEvaluateRequestBody,
    ContextGuideEvaluationResult
> = {
    operationId: 'ctxGuideEvaluate',
    method: 'POST',
    path: '/v1/ctx/:ctxId/:version/guide/evaluate',
    summary: 'Evaluate selected guide rules in a context',
    description:
        "Supply exactly one of guideId or allGuides: true. A named guide is evaluated alone. allGuides combines every loaded guide in load order through the context's composed scheme, with the later guide owning duplicate rule IDs. Returns the engine's structured evaluation result.",
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
    requestSchema: { ref: 'CtxGuideEvaluateRequestBody' },
    requestExample: {
        guideId: 'my-guide',
        selectedRuleIds: ['rule-001', 'rule-003'],
    },
    responseDescription: 'Guide evaluation result',
    responseSchema: { ref: 'ContextGuideEvaluationResult' },
} as const;
