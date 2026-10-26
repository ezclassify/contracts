import type { RouteDecl } from './types.js';
import type {
    CtxSchemeValidateRequestBody,
    ContextSchemeValidateResult,
} from '../wire.js';

/**
 * POST /v1/ctx/:ctxId/:version/scheme/validate: judge a marking against the
 * context's composed scheme, for someone reading it.
 */
export const decl: RouteDecl<
    CtxSchemeValidateRequestBody,
    ContextSchemeValidateResult
> = {
    operationId: 'ctxSchemeValidate',
    method: 'POST',
    path: '/v1/ctx/:ctxId/:version/scheme/validate',
    summary: 'Validate a marking in a context',
    description:
        'The reader\'s call. Judges a marking, given as text or as the facts it states, against the context\'s composed scheme (base + layers). The marking is settled exactly as process settles it, so `valid` and `inputWasValid` mean what they mean on every route. `surface`, `context` and `parts` say what the marking is judged as, as they do on process. Returns the settled facts, the verdicts, errors and warnings, the changes settling made, the marking written back with what that writing left out, how recognition read it, the notices it requires, and its display color. Fix paths and corrections to the text belong to process. The :version segment may be omitted to default to "latest"; the resolved version is returned in the X-EzClassify-Resolved-Version response header.',
    tags: ['context', 'scheme'],
    pathParams: ['ctxId', 'version'],
    errorResponses: [
        {
            status: 400,
            ref: 'BadRequest',
            description:
                'Invalid or missing request fields; a request that carries both `input` and `assertions`, or neither; `inputFormat` sent with `assertions`; an `inputFormat` or `outputFormat` the scheme does not declare; or `parts` holds more entries than this deployment allows. The deployment sets that cap, so the schema states no maximum.',
        },
        { status: 404, ref: 'NotFound' },
        { status: 500, ref: 'InternalError' },
    ],
    requestSchema: { ref: 'CtxSchemeValidateRequestBody' },
    requestExample: { input: 'EXAMPLE-HIGH' },
    responseDescription: 'Validation result',
    responseSchema: { ref: 'ContextSchemeValidateResult' },
} as const;
