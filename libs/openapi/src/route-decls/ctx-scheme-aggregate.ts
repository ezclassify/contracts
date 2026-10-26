import type { RouteDecl } from './types.js';
import type {
    ContextSchemeAggregateResult,
    CtxSchemeAggregateRequestBody,
} from '../wire.js';

/**
 * POST /v1/ctx/:ctxId/:version/scheme/aggregate: aggregate marking strings
 * using the context's scheme.
 */
export const decl: RouteDecl<
    CtxSchemeAggregateRequestBody,
    ContextSchemeAggregateResult
> = {
    operationId: 'ctxSchemeAggregate',
    method: 'POST',
    path: '/v1/ctx/:ctxId/:version/scheme/aggregate',
    summary: 'Aggregate marking strings in a context',
    description:
        'Combines part markings into a single aggregate marking using the context\'s composed scheme aggregation rules. Supply either `inputs` (marking strings) or `assertionSets` (already-parsed assertion arrays for lossless transport of scope-only assertions and capture values): exactly one, not both. The :version segment may be omitted to default to "latest".',
    tags: ['context', 'scheme'],
    pathParams: ['ctxId', 'version'],
    errorResponses: [
        {
            status: 400,
            ref: 'BadRequest',
            description:
                'Invalid or missing request fields; a request that carries both `inputs` and `assertionSets`, or neither; `inputFormat` sent with `assertionSets`; or an `inputFormat` or `outputFormat` the scheme does not declare.',
        },
        { status: 404, ref: 'NotFound' },
        { status: 500, ref: 'InternalError' },
    ],
    requestSchema: { ref: 'CtxSchemeAggregateRequestBody' },
    requestExample: { inputs: ['LEVEL-A', 'LEVEL-B'] },
    responseDescription: 'Aggregation result',
    responseSchema: { ref: 'ContextSchemeAggregateResult' },
} as const;
