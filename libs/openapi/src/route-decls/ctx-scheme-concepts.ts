import type { RouteDecl } from './types.js';
import { schemeSelector } from './scheme-selector.js';
import type { ConceptView } from '@ezclassify/types';

/** GET /v1/ctx/:ctxId/:version/scheme/concepts: the context's concept list. */
export const decl: RouteDecl<undefined, ConceptView[]> = {
    operationId: 'ctxSchemeConcepts',
    method: 'GET',
    path: '/v1/ctx/:ctxId/:version/scheme/concepts',
    summary: 'Get the scheme concepts in a context',
    description:
        "Returns every concept of the context's composed scheme as a concept view: id, name, views, categories, parents, position, rank, and display metadata, the same shape a local engine's scheme view carries. The :version segment may be omitted to default to \"latest\"; the resolved version is returned in the X-EzClassify-Resolved-Version response header.",
    tags: ['context', 'scheme'],
    pathParams: ['ctxId', 'version'],
    queryParams: [
        schemeSelector,
    ],
    errorResponses: [
        { status: 404, ref: 'NotFound' },
        { status: 500, ref: 'InternalError' },
    ],
    responseDescription: 'Concept list',
    responseSchema: { arrayOf: 'ConceptView' },
} as const;
