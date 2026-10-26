/**
 * Barrel re-export of every route declaration.
 *
 * `scripts/emit-openapi.ts` walks this array to build the OpenAPI `paths`
 * object, so the order here is the order routes appear in the generated spec.
 * It matches the order a runtime registers the routes in, to keep the two easy
 * to diff.
 */

import type { RouteDecl } from './types.js';
import { decl as health } from './health.js';
import { decl as ready } from './ready.js';
import { decl as ctxList } from './ctx-list.js';
import { decl as ctxVersions } from './ctx-versions.js';
import { decl as ctxDescribe } from './ctx-describe.js';
import { decl as ctxDocumentAudit } from './ctx-document-audit.js';
import { decl as ctxDocumentAssessAccess } from './ctx-document-assess-access.js';
import { decl as ctxSchemeSummary } from './ctx-scheme-summary.js';
import { decl as ctxSchemeConcepts } from './ctx-scheme-concepts.js';
import { decl as ctxSchemeCategories } from './ctx-scheme-categories.js';
import { decl as ctxSchemeFormats } from './ctx-scheme-formats.js';
import { decl as ctxSchemeGrammar } from './ctx-scheme-grammar.js';
import { decl as ctxSchemeScopes } from './ctx-scheme-scopes.js';
import { decl as ctxSchemeLabelPresets } from './ctx-scheme-label-presets.js';
import { decl as ctxSchemeApplyPreset } from './ctx-scheme-apply-preset.js';
import { decl as ctxSchemeProcess } from './ctx-scheme-process.js';
import { decl as ctxSchemeValidate } from './ctx-scheme-validate.js';
import { decl as ctxSchemeExplain } from './ctx-scheme-explain.js';
import { decl as ctxSchemeNormalize } from './ctx-scheme-normalize.js';
import { decl as ctxSchemeRender } from './ctx-scheme-render.js';
import { decl as ctxSchemeDiff } from './ctx-scheme-diff.js';
import { decl as ctxSchemeView } from './ctx-scheme-view.js';
import { decl as ctxSchemeNotices } from './ctx-scheme-notices.js';
import { decl as ctxSchemeFilterConcepts } from './ctx-scheme-filter-concepts.js';
import { decl as ctxSchemeScan } from './ctx-scheme-scan.js';
import { decl as ctxSchemeAggregate } from './ctx-scheme-aggregate.js';
import { decl as ctxSchemeSuggest } from './ctx-scheme-suggest.js';
import { decl as ctxSchemeSuggestForCategories } from './ctx-scheme-suggest-for-categories.js';
import { decl as ctxSchemeCheckCoverage } from './ctx-scheme-check-coverage.js';
import { decl as ctxSchemeDescribeConcept } from './ctx-scheme-describe-concept.js';
import { decl as ctxAccessCheck } from './ctx-access-check.js';
import { decl as ctxAccessDescribeRule } from './ctx-access-describe-rule.js';
import { decl as ctxAccessDescribeRequirements } from './ctx-access-describe-requirements.js';
import { decl as ctxAccessRules } from './ctx-access-rules.js';
import { decl as ctxGuideScan } from './ctx-guide-scan.js';
import { decl as ctxGuideEvaluate } from './ctx-guide-evaluate.js';
import { decl as ctxGuideDescribeRule } from './ctx-guide-describe-rule.js';
import { decl as ctxGuideFilterRules } from './ctx-guide-filter-rules.js';
import { decl as ctxGuideView } from './ctx-guide-view.js';
import { decl as ctxCrosswalkTranslate } from './ctx-crosswalk-translate.js';

/** All route declarations, in the order a runtime registers them. */
export const routeDecls: ReadonlyArray<RouteDecl> = [
    health,
    ready,
    ctxList,
    ctxVersions,
    ctxDescribe,
    ctxDocumentAudit,
    ctxDocumentAssessAccess,
    ctxSchemeSummary,
    ctxSchemeConcepts,
    ctxSchemeCategories,
    ctxSchemeFormats,
    ctxSchemeGrammar,
    ctxSchemeScopes,
    ctxSchemeLabelPresets,
    ctxSchemeApplyPreset,
    ctxSchemeProcess,
    ctxSchemeValidate,
    ctxSchemeExplain,
    ctxSchemeNormalize,
    ctxSchemeRender,
    ctxSchemeDiff,
    ctxSchemeView,
    ctxSchemeNotices,
    ctxSchemeFilterConcepts,
    ctxSchemeScan,
    ctxSchemeAggregate,
    ctxSchemeSuggest,
    ctxSchemeSuggestForCategories,
    ctxSchemeCheckCoverage,
    ctxSchemeDescribeConcept,
    ctxAccessCheck,
    ctxAccessDescribeRule,
    ctxAccessDescribeRequirements,
    ctxAccessRules,
    ctxGuideScan,
    ctxGuideEvaluate,
    ctxGuideDescribeRule,
    ctxGuideFilterRules,
    ctxGuideView,
    ctxCrosswalkTranslate,
];

export type {
    RouteDecl,
    HttpMethod,
    ErrorRef,
    ErrorResponse,
    QueryParam,
    BodySchema,
} from './types.js';
