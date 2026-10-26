import type { RouteDecl } from './types.js';
import type {
    ContextDocumentAccessAssessmentResult,
    CtxDocumentAssessAccessRequestBody,
} from '../wire.js';
import { documentAccessRouteErrors } from './document-route-errors.js';

/**
 * POST /v1/ctx/:ctxId/:version/document/assess-access: assess authored,
 * authoritative, and projected document targets against Context policy.
 */
export const decl: RouteDecl<
    CtxDocumentAssessAccessRequestBody,
    ContextDocumentAccessAssessmentResult
> = {
    operationId: 'ctxDocumentAssessAccess',
    method: 'POST',
    path: '/v1/ctx/:ctxId/:version/document/assess-access',
    summary: 'Assess document access in a context',
    description:
        'Answers whether the supplied userAttributes satisfy a document under the Context policy. It audits the document once and evaluates authored, authoritative, and projected access scenarios against immutable userAttributes and Context policy. Lexical matches are nominations, never automatic decisions; accepted findings bind to the returned finding ID and document digest, and revised text requires new decisions. Authoritative includes authored facts plus explicit analyst decisions. Projected assumes unresolved nominations and remains advisory. contentRequirements identify supported content that must cease to apply after content change and re-evaluation; they are not instructions to lower a marking. contextRequirements are conditional future relationships between userAttributes and authoritative context, not mutations performed by EzClassify. A denial remains denied until revised text or authoritative external state is re-evaluated. The standard profile is the default; summary suits only an initial large-document overview, standard is needed before decisions or remediation, and full only when matched text or complete breakdowns are necessary. responseProjection counts and omittedFields state what the profile left out; omitted detail is not absent evidence.',
    tags: ['context', 'document', 'access'],
    pathParams: ['ctxId', 'version'],
    errorResponses: documentAccessRouteErrors,
    requestSchema: { ref: 'CtxDocumentAssessAccessRequestBody' },
    requestExample: {
        text: 'Document body text here.',
        userAttributes: { clearance: 'high' },
        context: { distribution: ['team-a'] },
        guideDeterminations: {
            findings: [],
            manualSelections: [],
        },
        responseProfile: 'standard',
    },
    responseDescription: 'Resolved Context document access assessment',
    responseSchema: { ref: 'ContextDocumentAccessAssessmentResult' },
} as const;
