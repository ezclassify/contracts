import type { RouteDecl } from './types.js';
import { schemeSelector } from './scheme-selector.js';
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
        'Rolls markings up into the one whole marking that covers them, using the context\'s composed scheme rollup rules. With no `context` the inputs are read as wholes, as in an aggregate such as the documents in a folder; `context` names the role the inputs are read in, and `{ role: \'part\', partOf }` reads each as a part of that whole, as in a whole\'s parts rollup. Supply either `inputs` (marking strings) or `assertionSets` (already-parsed assertion arrays for lossless transport of scope-only assertions and capture values): exactly one, not both. The :version segment may be omitted to default to "latest".',
    tags: ['context', 'scheme'],
    pathParams: ['ctxId', 'version'],
    queryParams: [schemeSelector],
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
