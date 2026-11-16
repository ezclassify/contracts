import type { QueryParam } from './types.js';

/**
 * The `?scheme=` selector every `/v1/ctx/:ctxId/:version/scheme` route takes.
 *
 * A Context can hold more than one scheme, and each scheme route answers in
 * the one this names. The routes share this one declaration so the selector
 * reads and behaves the same on a read and on an operation. It is emitted
 * inline on each operation rather than as a shared `$ref`, because the
 * servers and catalogs that read the document resolve parameters by their
 * inline name and location.
 */
export const schemeSelector = {
    name: 'scheme',
    description:
        "Context-local key of the scheme the request is answered in, as `GET /v1/ctx/{ctxId}/{version}` lists it. Without it the context's primary scheme answers. Any scheme the context holds may be named, a crosswalk's source or target among them. A key the context does not hold answers 404 with code `scheme_not_found`; it never falls back to the primary. Name it once: a repeated selector answers 400.",
    required: false,
    schema: 'string',
} as const satisfies QueryParam;
