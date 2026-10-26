import type { RouteDecl } from './types.js';
import type {
    ContextDocumentAuditResult,
    CtxDocumentAuditRequestBody,
} from '../wire.js';
import { documentRouteErrors } from './document-route-errors.js';

/**
 * POST /v1/ctx/:ctxId/:version/document/audit: audit a document against the
 * context's stack.
 */
export const decl: RouteDecl<
    CtxDocumentAuditRequestBody,
    ContextDocumentAuditResult
> = {
    operationId: 'ctxDocumentAudit',
    method: 'POST',
    path: '/v1/ctx/:ctxId/:version/document/audit',
    summary: 'Audit a document for marking coverage in a context',
    description:
        'Audits authored document markings and evaluates guide nominations without treating lexical matches as authoritative facts. Never accept a nomination without an explicit analyst decision bound to its finding ID and document digest; revised text requires new decisions. Determined results include only accepted findings and manual selections, while projected results assume unresolved nominations and remain advisory. This operation answers authored correctness and guide review; document access assessment (POST /v1/ctx/{ctxId}/{version}/document/assess-access) answers whether supplied userAttributes satisfy the document policy. The standard response profile is the default; summary suits only an initial large-document overview, standard is needed before analyst decisions or remediation, and full only when matched text or complete breakdowns are necessary. responseProjection counts and omittedFields state what the profile left out; omitted detail is not absent evidence.',
    tags: ['context', 'document'],
    pathParams: ['ctxId', 'version'],
    errorResponses: documentRouteErrors,
    requestSchema: { ref: 'CtxDocumentAuditRequestBody' },
    requestExample: {
        text: 'Document body text here.',
        guideDeterminations: {
            findings: [],
            manualSelections: [],
        },
        responseProfile: 'standard',
    },
    responseDescription: 'Resolved Context document audit result',
    responseSchema: { ref: 'ContextDocumentAuditResult' },
} as const;
