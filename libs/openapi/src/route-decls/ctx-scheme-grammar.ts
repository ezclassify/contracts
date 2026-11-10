import type { RouteDecl } from './types.js';
import { schemeSelector } from './scheme-selector.js';
import type { PublicGrammarResponseBody } from '../wire.js';

/** GET /v1/ctx/:ctxId/:version/scheme/grammar: the context's parse grammar. */
export const decl: RouteDecl<undefined, PublicGrammarResponseBody> = {
    operationId: 'ctxSchemeGrammar',
    method: 'GET',
    path: '/v1/ctx/:ctxId/:version/scheme/grammar',
    summary: 'Get the scheme parse grammar in a context',
    description:
        "Returns the parse grammar for the context's composed scheme: whether its vocabulary is matched case-sensitively and whether surrounding whitespace is ignored. There is no separator; each field of a marking writes its own boundaries. The :version segment may be omitted to default to \"latest\"; the resolved version is returned in the X-EzClassify-Resolved-Version response header.",
    tags: ['context', 'scheme'],
    pathParams: ['ctxId', 'version'],
    queryParams: [
        schemeSelector,
    ],
    errorResponses: [
        { status: 404, ref: 'NotFound' },
        { status: 500, ref: 'InternalError' },
    ],
    responseDescription: 'Parse grammar',
    responseSchema: { ref: 'SchemeGrammar' },
} as const;
