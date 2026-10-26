import type { RouteDecl } from './types.js';
import type {
    ContextSchemeScanResult,
    CtxSchemeScanRequestBody,
} from '../wire.js';

/**
 * POST /v1/ctx/:ctxId/:version/scheme/scan: scan free text for markings using
 * the context's scheme.
 */
export const decl: RouteDecl<
    CtxSchemeScanRequestBody,
    ContextSchemeScanResult
> = {
    operationId: 'ctxSchemeScan',
    method: 'POST',
    path: '/v1/ctx/:ctxId/:version/scheme/scan',
    summary: 'Scan text for markings in a context',
    description:
        'Scans the provided text for marking occurrences against the context\'s composed scheme and returns the results in a resolved Context envelope. The :version segment may be omitted to default to "latest".',
    tags: ['context', 'scheme'],
    pathParams: ['ctxId', 'version'],
    errorResponses: [
        {
            status: 400,
            ref: 'BadRequest',
            description:
                'Invalid or missing request fields, or an `inputFormat` or `outputFormat` the scheme does not declare.',
        },
        { status: 404, ref: 'NotFound' },
        { status: 500, ref: 'InternalError' },
    ],
    requestSchema: { ref: 'CtxSchemeScanRequestBody' },
    requestExample: {
        text: 'This document is LEVEL-HIGH and contains sensitive data.',
    },
    responseDescription: 'Scan results',
    responseSchema: { ref: 'ContextSchemeScanResult' },
} as const;
