import type { RouteDecl } from './types.js';
import type {
    ContextAccessDecisionResult,
    CtxAccessCheckRequestBody,
} from '../wire.js';

/**
 * POST /v1/ctx/:ctxId/:version/access/check: evaluate access decision in a
 * context.
 */
export const decl: RouteDecl<
    CtxAccessCheckRequestBody,
    ContextAccessDecisionResult
> = {
    operationId: 'ctxAccessCheck',
    method: 'POST',
    path: '/v1/ctx/:ctxId/:version/access/check',
    summary: 'Check access decision in a context',
    description:
        'Evaluates the context\'s access policy against a TARGET (a `marking` string or its structured `assertions` form, merged when both are given) and the SUBJECT (`userAttributes`), with optional comparison `context`. When decision audit is enabled, configured JSON Pointer paths select required user and resource identifiers from `context`. The :version segment may be omitted to default to "latest".',
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
    requestSchema: { ref: 'CtxAccessCheckRequestBody' },
    requestExample: {
        marking: 'LEVEL-HIGH',
        userAttributes: { clearance: 'high' },
        context: {
            audit: { userId: 'user-123', resourceId: 'record-12345' },
        },
    },
    responseDescription: 'Resolved Context access decision',
    responseSchema: { ref: 'ContextAccessDecisionResult' },
} as const;
