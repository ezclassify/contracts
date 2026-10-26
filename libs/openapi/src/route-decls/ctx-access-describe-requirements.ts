import type { RouteDecl } from './types.js';
import type {
    ContextAccessRequirementsResult,
    CtxAccessDescribeRequirementsRequestBody,
} from '../wire.js';

/**
 * POST /v1/ctx/:ctxId/:version/access/describe-requirements: describe access
 * requirements for a marking in a context.
 */
export const decl: RouteDecl<
    CtxAccessDescribeRequirementsRequestBody,
    ContextAccessRequirementsResult
> = {
    operationId: 'ctxAccessDescribeRequirements',
    method: 'POST',
    path: '/v1/ctx/:ctxId/:version/access/describe-requirements',
    summary: 'Describe access requirements for a target in a context',
    description:
        'Describes requirements imposed by immutable policy for a trusted target supplied as `marking`, structured `assertions`, or both. Both target forms are normalized through the same Context scheme path used by access check. These are policy requirements for the supplied target, not remediation instructions and not advice to change immutable `userAttributes`. Document access assessment (POST /v1/ctx/{ctxId}/{version}/document/assess-access) answers document receivability and content or context remediation questions.',
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
    requestSchema: { ref: 'CtxAccessDescribeRequirementsRequestBody' },
    requestExample: { marking: 'LEVEL-HIGH' },
    responseDescription: 'Resolved Context access requirements',
    responseSchema: { ref: 'ContextAccessRequirementsResult' },
} as const;
