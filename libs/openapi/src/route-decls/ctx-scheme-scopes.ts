import type { RouteDecl } from './types.js';
import { schemeSelector } from './scheme-selector.js';
import type { SchemeScopesResponseBody } from '../wire.js';

/** GET /v1/ctx/:ctxId/:version/scheme/scopes: the context's scope definitions. */
export const decl: RouteDecl<undefined, SchemeScopesResponseBody> = {
    operationId: 'ctxSchemeScopes',
    method: 'GET',
    path: '/v1/ctx/:ctxId/:version/scheme/scopes',
    summary: 'Get the scheme scopes in a context',
    description:
        "Returns the scope definitions for the context's composed scheme in declaration order. Empty when it declares none. The :version segment may be omitted to default to \"latest\"; the resolved version is returned in the X-EzClassify-Resolved-Version response header.",
    tags: ['context', 'scheme'],
    pathParams: ['ctxId', 'version'],
    queryParams: [
        schemeSelector,
    ],
    errorResponses: [
        { status: 404, ref: 'NotFound' },
        { status: 500, ref: 'InternalError' },
    ],
    responseDescription: 'Scope definitions, empty when none are declared',
    responseSchema: { ref: 'SchemeScopesResponse' },
} as const;
