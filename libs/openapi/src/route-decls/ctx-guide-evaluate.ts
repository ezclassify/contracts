import type { RouteDecl } from './types.js';
import type {
    ContextGuideEvaluationResult,
    CtxGuideEvaluateRequestBody,
} from '../wire.js';

/**
 * POST /v1/ctx/:ctxId/:version/guide/evaluate: evaluate one guide's selected
 * rules, or roll up a selection that spans the context's guides.
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
        "Send `guideId` with `selectedRuleIds` to evaluate that one guide, or `selections` to roll up rules selected from several guides. Each selection names its guide, so two guides that use the same rule ID hold two rules. Each guide evaluates its own selected rules, with its own dependencies and overrides, and the outcomes are rolled up per target scheme. No guide overrides or depends on another. Returns the engine's structured evaluation result.",
    tags: ['context', 'guide'],
    pathParams: ['ctxId', 'version'],
    errorResponses: [
        {
            status: 400,
            ref: 'BadRequest',
            description:
                'Invalid or missing request fields, or a request that is not exactly one of the two forms: `guideId` with `selectedRuleIds`, or `selections`.',
        },
        {
            status: 404,
            ref: 'NotFound',
            description:
                'Context or version not found, or the Context has no guide with a `guideId` the request names.',
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
