import type { ErrorResponse } from './types.js';

/** Errors returned by the Context document audit operation. */
export const documentRouteErrors = [
    { status: 400, ref: 'BadRequest' },
    { status: 404, ref: 'NotFound' },
    {
        status: 409,
        ref: 'Conflict',
        description:
            'A supplied finding determination or manual selection is stale.',
    },
    { status: 500, ref: 'InternalError' },
] as const satisfies readonly ErrorResponse[];
