import type { RouteDecl } from './types.js';
import type { ContextSchemeConceptDescriptionResult } from '../wire.js';

/**
 * GET /v1/ctx/:ctxId/:version/scheme/describe-concept: describe a concept by
 * id+category in a context.
 */
export const decl: RouteDecl<undefined, ContextSchemeConceptDescriptionResult> =
    {
        operationId: 'ctxSchemeDescribeConcept',
        method: 'GET',
        path: '/v1/ctx/:ctxId/:version/scheme/describe-concept',
        summary: 'Describe a concept in a context',
        description:
            'Returns structured description and metadata for the specified concept within a category, scoped to the context\'s composed scheme. The :version segment may be omitted to default to "latest".',
        tags: ['context', 'scheme'],
        pathParams: ['ctxId', 'version'],
        queryParams: [
            {
                name: 'conceptId',
                description: 'Concept identifier to describe.',
                required: true,
                schema: 'string',
            },
            {
                name: 'categoryId',
                description: 'Category identifier the concept belongs to.',
                required: true,
                schema: 'string',
            },
            {
                name: 'view',
                description:
                    "The view to name the concept in: a key of the concept's `views`. Omitted, its default view.",
                required: false,
                schema: 'string',
            },
        ],
        errorResponses: [
            { status: 400, ref: 'BadRequest' },
            {
                status: 404,
                ref: 'NotFound',
                description:
                    'The context is not found, or the concept or category is not one its scheme declares. An unknown concept or category carries `code: NOT_FOUND` and a `detail` naming the query parameter and the id; a request refused before routing carries the constant codeless refusal body, so a caller can tell an unknown concept from a context it may not reach.',
            },
            { status: 500, ref: 'InternalError' },
        ],
        responseDescription: 'Concept description',
        responseSchema: { ref: 'ContextSchemeConceptDescriptionResult' },
    } as const;
