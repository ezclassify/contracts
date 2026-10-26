import type { RouteDecl } from './types.js';
import type {
    ContextGuideScanResult,
    CtxGuideScanRequestBody,
} from '../wire.js';

/**
 * POST /v1/ctx/:ctxId/:version/guide/scan: scan text against the context's
 * guides.
 */
export const decl: RouteDecl<CtxGuideScanRequestBody, ContextGuideScanResult> =
    {
        operationId: 'ctxGuideScan',
        method: 'POST',
        path: '/v1/ctx/:ctxId/:version/guide/scan',
        summary: 'Scan text against context guides',
        description:
            'Scans the provided text against the guides attached to the context and returns per-guide scan results. The optional `guideId` body field restricts the scan to a single guide; otherwise every guide in the context is consulted.',
        tags: ['context', 'guide'],
        pathParams: ['ctxId', 'version'],
        errorResponses: [
            { status: 400, ref: 'BadRequest' },
            { status: 404, ref: 'NotFound' },
            {
                status: 422,
                ref: 'UnprocessableEntity',
                description: 'Context has no guides attached.',
            },
            { status: 500, ref: 'InternalError' },
        ],
        requestSchema: { ref: 'CtxGuideScanRequestBody' },
        requestExample: {
            text: 'This document is LEVEL-HIGH and cites the district handbook.',
        },
        responseDescription: 'Matched guide rules',
        responseSchema: { ref: 'ContextGuideScanResult' },
    } as const;
