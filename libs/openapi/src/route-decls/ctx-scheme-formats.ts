import type { RouteDecl } from './types.js';
import type { FormatView } from '@ezclassify/types';

/** GET /v1/ctx/:ctxId/:version/scheme/formats: the context's render formats. */
export const decl: RouteDecl<undefined, FormatView[]> = {
    operationId: 'ctxSchemeFormats',
    method: 'GET',
    path: '/v1/ctx/:ctxId/:version/scheme/formats',
    summary: 'Get the scheme render formats in a context',
    description:
        "Lists the formats the context's composed scheme writes as format views: each format's id, the surface it writes, its resolved layout, and how its text is framed, the same shape a local engine's scheme view carries. Not the field trees, which stay server-side. The :version segment may be omitted to default to \"latest\"; the resolved version is returned in the X-EzClassify-Resolved-Version response header.",
    tags: ['context', 'scheme'],
    pathParams: ['ctxId', 'version'],
    queryParams: [
        {
            name: 'scheme',
            description:
                "Context-local key, or unambiguous artifact id, of the scheme to read. Defaults to the context's primary scheme; a crosswalk's source or target scheme is named here. A key the context does not hold answers 404.",
            required: false,
            schema: 'string',
        },
    ],
    errorResponses: [
        { status: 404, ref: 'NotFound' },
        { status: 500, ref: 'InternalError' },
    ],
    responseDescription: 'Render format list',
    responseSchema: { arrayOf: 'FormatView' },
} as const;
