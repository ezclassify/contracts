import type { RouteDecl } from './types.js';
import { schemeSelector } from './scheme-selector.js';
import type { SchemeSummaryResponseBody } from '../wire.js';

/** GET /v1/ctx/:ctxId/:version/scheme: the context's composed scheme summary. */
export const decl: RouteDecl<undefined, SchemeSummaryResponseBody> = {
    operationId: 'ctxSchemeSummary',
    method: 'GET',
    path: '/v1/ctx/:ctxId/:version/scheme',
    summary: 'Get the scheme summary in a context',
    description:
        "Returns high-level metadata for the context's composed scheme (base plus its declared layers): id, version, name, description, presentation configuration, default render format, and scope label. The scheme identity and layers come from the Context. The :version segment may be omitted to default to \"latest\"; the resolved version is returned in the X-EzClassify-Resolved-Version response header.",
    tags: ['context', 'scheme'],
    pathParams: ['ctxId', 'version'],
    queryParams: [
        schemeSelector,
    ],
    errorResponses: [
        { status: 404, ref: 'NotFound' },
        { status: 500, ref: 'InternalError' },
    ],
    responseDescription: 'Scheme summary',
    responseSchema: { ref: 'SchemeSummary' },
} as const;
