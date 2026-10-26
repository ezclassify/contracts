import type { RouteDecl } from './types.js';
import type { LabelPresetView } from '@ezclassify/types';

/** GET /v1/ctx/:ctxId/:version/scheme/label-presets: the context's label presets. */
export const decl: RouteDecl<undefined, LabelPresetView[]> = {
    operationId: 'ctxSchemeLabelPresets',
    method: 'GET',
    path: '/v1/ctx/:ctxId/:version/scheme/label-presets',
    summary: 'List the label presets in a context',
    description:
        "Returns the label presets of the context's primary scheme, the scheme apply-preset expands them in, as preset views: id, label, description, and scope. Empty when the scheme declares none. The marking string and tag list stay server-side; expand a preset with POST /v1/ctx/{ctxId}/{version}/scheme/apply-preset. The :version segment may be omitted to default to \"latest\"; the resolved version is returned in the X-EzClassify-Resolved-Version response header.",
    tags: ['context', 'scheme'],
    pathParams: ['ctxId', 'version'],
    errorResponses: [
        { status: 404, ref: 'NotFound' },
        { status: 500, ref: 'InternalError' },
    ],
    responseDescription: 'Label preset list',
    responseSchema: { arrayOf: 'LabelPresetView' },
} as const;
