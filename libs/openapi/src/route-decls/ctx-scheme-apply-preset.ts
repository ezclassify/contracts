import type { RouteDecl } from './types.js';
import type {
    ApplyPresetRequestBody,
    ContextSchemeValidateResult,
} from '../wire.js';

/**
 * POST /v1/ctx/:ctxId/:version/scheme/apply-preset: expand a named label preset
 * against the context's composed scheme.
 */
export const decl: RouteDecl<ApplyPresetRequestBody, ContextSchemeValidateResult> =
    {
        operationId: 'ctxSchemeApplyPreset',
        method: 'POST',
        path: '/v1/ctx/:ctxId/:version/scheme/apply-preset',
        summary: 'Apply a label preset in a context',
        description:
            "Expands the named label preset against the context's composed scheme and returns what validate answers for the marking it stands for, in the standard context operation envelope every other context operation answers with. A preset is a stored marking, so the answer carries no fix paths or corrections. The label-presets resource keeps each preset's marking string server-side, so this is the only way to order one of its items. Returns 404 when the scheme declares no preset by that id. The :version segment may be omitted to default to \"latest\"; the resolved version is returned in the X-EzClassify-Resolved-Version response header.",
        tags: ['context', 'scheme'],
        pathParams: ['ctxId', 'version'],
        errorResponses: [
            {
                status: 400,
                ref: 'BadRequest',
                description:
                    'Invalid or missing request fields, or an `outputFormat` the scheme does not declare.',
            },
            { status: 404, ref: 'NotFound' },
            { status: 500, ref: 'InternalError' },
        ],
        requestSchema: { ref: 'ApplyPresetRequest' },
        requestExample: { presetId: 'default-label' },
        responseDescription: 'Preset expansion result',
        responseSchema: { ref: 'ContextSchemeValidateResult' },
    } as const;
