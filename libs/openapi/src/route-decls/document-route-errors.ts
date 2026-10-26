import type { ErrorResponse } from './types.js';

/** Shared errors returned by both Context document operations. */
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

/** Document access errors, including the missing-access-policy condition. */
export const documentAccessRouteErrors = [
    ...documentRouteErrors,
    {
        status: 422,
        ref: 'UnprocessableEntity',
        description: 'Context has no access policy attached.',
    },
] as const satisfies readonly ErrorResponse[];
