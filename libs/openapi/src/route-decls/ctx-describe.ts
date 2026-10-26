import type { RouteDecl } from './types.js';
import type { CtxDescribeResponseBody } from '../wire.js';

/** GET /v1/ctx/:ctxId/:version: decompose a context into its component list. */
export const decl: RouteDecl<undefined, CtxDescribeResponseBody> = {
    operationId: 'ctxDescribe',
    method: 'GET',
    path: '/v1/ctx/:ctxId/:version',
    summary: 'Describe a resolved context',
    description:
        'Returns the component breakdown for the resolved context: scheme, ordered layers, ordered guides, optional access policy, and ordered crosswalks, each with the version it declares and the concrete version that answered. The :version segment may be a concrete semver or the literal "latest"; the resolved version is reported in the X-EzClassify-Resolved-Version response header and echoed in the response body.',
    tags: ['context'],
    pathParams: ['ctxId', 'version'],
    errorResponses: [
        { status: 400, ref: 'BadRequest' },
        { status: 404, ref: 'NotFound' },
        { status: 500, ref: 'InternalError' },
    ],
    responseDescription: 'Resolved context decomposition',
    responseSchema: { ref: 'CtxDescribeResponseBody' },
    responseExample: {
        id: 'corp-default',
        version: '2.0.0', // version-literal:external
        description: 'Default corporate marking context',
        scheme: {
            id: 'base-scheme',
            version: '1.0.0',
            resolvedVersion: '1.0.0',
            layers: [
                { id: 'corp-ext', version: 'latest', resolvedVersion: '1.2.0' },
            ],
        }, // version-literal:external
        guides: [
            { id: 'corp-guide', version: 'latest', resolvedVersion: '3.0.0' },
        ], // version-literal:external
        access: {
            id: 'corp-access',
            version: 'latest',
            resolvedVersion: '1.0.0',
        }, // version-literal:external
    },
} as const;
