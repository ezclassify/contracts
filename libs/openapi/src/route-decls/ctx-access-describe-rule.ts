import type { RouteDecl } from './types.js';
import type {
    ContextAccessRuleDescriptionResult,
    CtxAccessDescribeRuleRequestBody,
} from '../wire.js';

/**
 * POST /v1/ctx/:ctxId/:version/access/describe-rule: describe a single access
 * rule in a context.
 */
export const decl: RouteDecl<
    CtxAccessDescribeRuleRequestBody,
    ContextAccessRuleDescriptionResult
> = {
    operationId: 'ctxAccessDescribeRule',
    method: 'POST',
    path: '/v1/ctx/:ctxId/:version/access/describe-rule',
    summary: 'Describe an access rule in a context',
    description:
        "Returns the human-readable predicate, the `userAttributes` paths the rule reads, and the data categories its `when` block depends on, scoped to the context's access policy.",
    tags: ['context', 'access'],
    pathParams: ['ctxId', 'version'],
    errorResponses: [
        { status: 400, ref: 'BadRequest' },
        { status: 404, ref: 'NotFound' },
        {
            status: 422,
            ref: 'UnprocessableEntity',
            description: 'Context has no access policy attached.',
        },
        { status: 500, ref: 'InternalError' },
    ],
    requestSchema: { ref: 'CtxAccessDescribeRuleRequestBody' },
    requestExample: { ruleId: 'rule-001' },
    responseDescription: 'Resolved Context access rule description',
    responseSchema: { ref: 'ContextAccessRuleDescriptionResult' },
} as const;
