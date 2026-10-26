import type { RouteDecl } from './types.js';
import type {
    ContextGuideRuleDescriptionResult,
    CtxGuideDescribeRuleRequestBody,
} from '../wire.js';

/**
 * POST /v1/ctx/:ctxId/:version/guide/describe-rule: describe a guide rule bound
 * to the context.
 */
export const decl: RouteDecl<
    CtxGuideDescribeRuleRequestBody,
    ContextGuideRuleDescriptionResult
> = {
    operationId: 'ctxGuideDescribeRule',
    method: 'POST',
    path: '/v1/ctx/:ctxId/:version/guide/describe-rule',
    summary: 'Describe a guide rule in a context',
    description:
        'Returns structured metadata for a guide rule (outcome text, when conditions, dependencies, overrides) looking up the rule by id in the guide(s) bound to the context. Pass guideId when the context has multiple guides; otherwise the first guide is used.',
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
    requestSchema: { ref: 'CtxGuideDescribeRuleRequestBody' },
    requestExample: { ruleId: 'rule-001' },
    responseDescription: 'Rule description',
    responseSchema: { ref: 'ContextGuideRuleDescriptionResult' },
} as const;
