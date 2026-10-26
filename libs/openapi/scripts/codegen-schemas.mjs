#!/usr/bin/env node
/**
 * Generates JSON Schemas for every TypeScript type used as a request or
 * response body in the REST API. emit-openapi.ts merges the result into the
 * assembled OpenAPI document and writes the reviewable dump of it beside this
 * file as components.generated.yaml.
 *
 * Inputs:
 *
 * - `libs/openapi/scripts/codegen-roots.ts` (barrel of root types)
 * - `libs/openapi/scripts/tsconfig.codegen.json` (program for
 *   ts-json-schema-generator)
 *
 * Output shape: a `components.schemas` block with $refs rewritten to
 * `#/components/schemas/<name>` (OpenAPI form, not JSON-Schema's
 * `#/definitions/<name>`) and TS interface names renamed to the spec-canonical
 * names via RENAME_MAP. Every schema here is emitted closed.
 *
 * Whether a schema stays closed is not decided here. Requests are closed and
 * responses are open, and which of the two a schema is depends on where the
 * assembled document reaches it from, not on its name. emit-openapi.ts owns
 * that pass, because it is the only place that has the paths block.
 *
 * Usage: import { generateSchemas } from './codegen-schemas.mjs'
 *
 * @module
 */

import { createGenerator } from 'ts-json-schema-generator';
import * as path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/**
 * Map TS type name → OpenAPI spec schema name. The TS interfaces keep their
 * natural form (with `Body` suffix, `Public` prefix, etc.) and this map gives
 * each the leaner spec name at emit time.
 */
const RENAME_MAP = {
    NormalizeResponseBody: 'NormalizeResponse',
    RenderResponseBody: 'RenderResponse',
    SchemeScopeResponseBody: 'SchemeScope',
    SchemeScopesResponseBody: 'SchemeScopesResponse',
    ApplyPresetRequestBody: 'ApplyPresetRequest',
    HealthResponseBody: 'HealthResponse',
    ReadyResponseBody: 'ReadyResponse',
    SchemeSummaryResponseBody: 'SchemeSummary',
    PublicGrammarResponseBody: 'SchemeGrammar',
    WireFilterResult: 'FilterResult',
    CoverageReport: 'CheckCoverageResult',
    CollectedNotice: 'Notice',
    SchemeStructuralView: 'SchemeViewResponse',
    GuideStructuralView: 'GuideViewResponse',
    ErrorResponseBody: 'ErrorResponse',
    RateLimitErrorBody: 'RateLimitError',
};

const ROOT_TYPES = [
    // Wire-types shared by Context routes
    'SchemeScopeResponseBody',
    'SchemeScopesResponseBody',
    'ApplyPresetRequestBody',
    // Wire-types: response bodies
    'NormalizeResponseBody',
    'RenderResponseBody',
    'SchemeSummaryResponseBody',
    'PublicGrammarResponseBody',
    'WireFilterResult',
    'HealthResponseBody',
    'ReadyResponseBody',
    'ReadyStatus',
    'ReadinessWarning',
    // Engine types: response bodies
    'ValidateResult',
    'ProcessResult',
    'ExplanationTrace',
    'AggregateResult',
    'SuggestResult',
    'SuggestResultsByCategory',
    'AccessDecision',
    'AccessRuleDescription',
    'AccessRequirementsDescription',
    'ConceptDescription',
    'ScanResult',
    'GuideScanResult',
    'EvaluationResult',
    'CoverageReport',
    'DiffResult',
    'CollectedNotice',
    'DocumentAuditReport',
    'DocumentInputErrorDetail',
    'Reproducibility',
    'AccessScenarioBasis',
    'AccessScenarioStatus',
    'ArtifactKind',
    'AssertionConfidence',
    'BestEffortRuleSourceReference',
    'BestEffortSourceReference',
    'CharacterWindow',
    'CalendarDateSpelling',
    'CalendarDateValueEncoding',
    'CalendarDateViewSpellings',
    'CompositeEncodingFieldType',
    'CompositeValueEncoding',
    'RenderResultsByFormat',
    'TextValueEncoding',
    'RecognitionResult',
    'RecognitionWithCorrections',
    'RecognitionStatus',
    'RenderAssessment',
    'DocumentOverallVerdict',
    'DocumentPartAssessment',
    'DocumentWholeOccurrence',
    'FixAction',
    'FixConceptReference',
    'GuideFactKind',
    'GuideFindingDecision',
    'GuideRule',
    'MatchContextExpression',
    'MatchContextSide',
    'MatchNearEmit',
    'MatchNearExpression',
    'MatchValidationExpression',
    'MatchValidationKeep',
    'ProcessingRole',
    'RepairConfidence',
    'ReproducibleRuleSourceReference',
    'ReproducibleSourceReference',
    'RuleConditionTarget',
    'RuleContributorQuantifier',
    'RuleWhenQuantifier',
    'TokenWindow',
    'TraceInference',
    'TraceRepair',
    'TraceValidationIssue',
    'ValidationSeverity',
    'WarningKind',
    'SchemeStructuralView',
    'GuideStructuralView',
    'ConceptView',
    'CategoryView',
    'FormatView',
    'LabelPresetView',
    'GuideRuleView',
    'RuleDescription',
    'ErrorResponseBody',
    'RateLimitErrorBody',
    // Context-scoped (path-based) bodies and responses
    'CtxDocumentAuditRequestBody',
    'CtxDocumentAssessAccessRequestBody',
    'CtxSchemeProcessRequestBody',
    'CtxSchemeValidateRequestBody',
    'CtxSchemeExplainRequestBody',
    'CtxSchemeNormalizeRequestBody',
    'CtxSchemeRenderRequestBody',
    'CtxSchemeDiffRequestBody',
    'CtxSchemeViewRequestBody',
    'CtxSchemeNoticesRequestBody',
    'CtxSchemeFilterConceptsRequestBody',
    'CtxSchemeScanRequestBody',
    'CtxSchemeAggregateRequestBody',
    'CtxSchemeSuggestRequestBody',
    'CtxSchemeSuggestForCategoriesRequestBody',
    'CtxSchemeCheckCoverageRequestBody',
    'CtxAccessCheckRequestBody',
    'CtxAccessDescribeRuleRequestBody',
    'CtxAccessDescribeRequirementsRequestBody',
    'CtxAccessRulesResponseBody',
    'CtxCrosswalkTranslateRequestBody',
    'CtxGuideScanRequestBody',
    'CtxGuideEvaluateRequestBody',
    'CtxGuideDescribeRuleRequestBody',
    'CtxGuideFilterRulesRequestBody',
    'CtxGuideViewRequestBody',
    'CtxListResponseBody',
    'CtxVersionsResponseBody',
    'CtxComponentDescriptor',
    'ContextSchemeDescriptor',
    'ContextSchemeRole',
    'CtxDescribeResponseBody',
    'ContextDocumentAuditResult',
    'ContextDocumentAccessAssessmentResult',
    'ContextSchemeProcessResult',
    'ContextSchemeValidateResult',
    'ContextSchemeExplainResult',
    'ContextSchemeNormalizeResult',
    'ContextSchemeRenderResult',
    'ContextSchemeDiffResult',
    'ContextSchemeViewResult',
    'ContextSchemeNoticesResult',
    'ContextSchemeFilterConceptsResult',
    'ContextSchemeScanResult',
    'ContextSchemeAggregateResult',
    'ContextSchemeSuggestResult',
    'ContextSchemeSuggestForCategoriesResult',
    'ContextSchemeCoverageResult',
    'ContextSchemeConceptDescriptionResult',
    'ContextAccessDecisionResult',
    'ContextAccessRuleDescriptionResult',
    'ContextAccessRequirementsResult',
    'ContextGuideScanResult',
    'ContextGuideEvaluationResult',
    'ContextGuideRuleDescriptionResult',
    'ContextGuideFilterRulesResult',
    'ContextGuideViewResult',
    'ContextCrosswalkTranslationResult',
];

function rewriteRefs(node) {
    if (Array.isArray(node)) {
        for (const v of node) rewriteRefs(v);
        return;
    }
    if (node && typeof node === 'object') {
        if (
            typeof node.$ref === 'string' &&
            node.$ref.startsWith('#/definitions/')
        ) {
            const oldName = node.$ref.slice('#/definitions/'.length);
            const newName = RENAME_MAP[oldName] ?? oldName;
            node.$ref = `#/components/schemas/${newName}`;
        }
        for (const v of Object.values(node)) rewriteRefs(v);
    }
}

/**
 * Build the components.schemas object from TS types: runs
 * ts-json-schema-generator once, applies the rename map, and rewrites $refs to
 * the OpenAPI form. Returns the plain JS object that emit-openapi.ts merges
 * into the OpenAPI document and then opens the response side of.
 */
export function generateSchemas() {
    const generator = createGenerator({
        path: path.resolve(__dirname, 'codegen-roots.ts'),
        tsconfig: path.resolve(__dirname, 'tsconfig.codegen.json'),
        expose: 'export',
        topRef: true,
        jsDoc: 'extended',
        additionalProperties: false,
        skipTypeCheck: true,
        sortProps: true,
        functions: 'hide',
    });

    const merged = {};
    for (const t of ROOT_TYPES) {
        const s = generator.createSchema(t);
        if (s.definitions) {
            for (const [k, v] of Object.entries(s.definitions)) {
                merged[k] = v;
            }
        }
    }

    rewriteRefs(merged);
    collapseGenericAliases(merged);
    promoteNamedContractRefs(merged);
    constrainBestEffortSourceIdentity(merged);

    const renamed = {};
    for (const [k, v] of Object.entries(merged)) {
        const finalName = RENAME_MAP[k] ?? k;
        renamed[finalName] = v;
    }

    const sortedKeys = Object.keys(renamed).sort();
    const sorted = {};
    for (const k of sortedKeys) sorted[k] = renamed[k];
    return sorted;
}

/**
 * Restates, as a schema rule, that a best-effort source observation carries no
 * snapshot identity.
 *
 * The TypeScript union says it with `snapshotId?: never` on the best-effort
 * branch. Every schema a response can reach is open (no `additionalProperties:
 * false`), so an open best-effort branch would accept a `snapshotId` it must
 * never be given. A snapshot id promises byte-for-byte replay; a best-effort
 * observation cannot make that promise, and a reference that carried one would
 * claim reproducibility the source never had.
 *
 * A conditional says it in a form openness cannot remove. `if` selects on the
 * discriminating property and `then` forbids the field, both of which survive a
 * pass that only strips `additionalProperties: false`. It lives on the union
 * rather than on the best-effort branch because the union is the only place
 * both modes are in view, and the branches are reachable from a response only
 * through it.
 */
function constrainBestEffortSourceIdentity(schemas) {
    for (const name of ['SourceReference', 'RuleSourceReference']) {
        const schema = schemas[name];
        if (!Array.isArray(schema?.anyOf)) {
            throw new Error(`Missing reviewed union ${name}`);
        }
        schema.if = {
            properties: { reproducibility: { const: 'best-effort' } },
            required: ['reproducibility'],
        };
        schema.then = { not: { required: ['snapshotId'] } };
    }
}

function namedRef(node, name) {
    const ref = { $ref: `#/components/schemas/${name}` };
    if (node?.description) ref.description = node.description;
    return ref;
}

/**
 * Ts-json-schema-generator preserves named object references in many positions
 * but expands aliases, union branches, and some array members structurally.
 * Promote the reviewed public document/access seams back to their canonical
 * component names without changing any JSON property, requirement, or value.
 */
function promoteNamedContractRefs(schemas) {
    const propertyRefs = [
        ['ArtifactReference', 'kind', 'ArtifactKind'],
        ['Assertion', 'confidence', 'AssertionConfidence'],
        ['DocumentAuditReport', 'overallVerdict', 'DocumentOverallVerdict'],
        ['EffectiveDocumentTarget', 'basis', 'AccessScenarioBasis'],
        ['AccessScenarioAssessment', 'basis', 'AccessScenarioBasis'],
        ['AccessScenarioAssessment', 'status', 'AccessScenarioStatus'],
        ['Change', 'action', 'FixAction'],
        ['GuideFactReference', 'kind', 'GuideFactKind'],
        ['GuideFindingDetermination', 'decision', 'GuideFindingDecision'],
        ['MatchContextNode', 'context', 'MatchContextExpression'],
        ['MatchNearNode', 'near', 'MatchNearExpression'],
        ['MatchValidateNode', 'validate', 'MatchValidationExpression'],
        ['ProcessingContext', 'role', 'ProcessingRole'],
        ['RuleCondition', 'role', 'ProcessingRole'],
        ['RuleCondition', 'target', 'RuleConditionTarget'],
        ['RuleWhenQuantifier', 'quantifier', 'RuleContributorQuantifier'],
        ['ScanResult', 'role', 'ProcessingRole'],
        ['ValidationError', 'severity', 'ValidationSeverity'],
        ['Warning', 'kind', 'WarningKind'],
        ['ValidateResult', 'recognition', 'RecognitionResult'],
        ['ValidateResult', 'assessment', 'RenderAssessment'],
        ['ProcessResult', 'recognition', 'RecognitionWithCorrections'],
        ['ProcessResult', 'assessment', 'RenderAssessment'],
        ['ProcessResult', 'suggestionsFor', 'SuggestResultsByCategory'],
        ['RecognitionResult', 'status', 'RecognitionStatus'],
        ['RecognitionWithCorrections', 'status', 'RecognitionStatus'],
        ['MarkingValidation', 'recognition', 'RecognitionResult'],
        ['RenderResponseBody', 'assessment', 'RenderAssessment'],
        ['MatchContextExpression', 'side', 'MatchContextSide'],
        ['MatchNearExpression', 'emit', 'MatchNearEmit'],
        ['MatchValidationExpression', 'keep', 'MatchValidationKeep'],
        ['TraceRepair', 'confidence', 'RepairConfidence'],
        ['CompositeEncodingField', 'type', 'CompositeEncodingFieldType'],
        ['CalendarDateValueEncoding', 'views', 'CalendarDateViewSpellings'],
        ['ProcessResult', 'renders', 'RenderResultsByFormat'],
    ];
    for (const [schemaName, propertyName, targetName] of propertyRefs) {
        const properties = schemas[schemaName]?.properties;
        if (!schemas[targetName])
            throw new Error(`Missing named contract ${targetName}`);
        if (!properties?.[propertyName]) {
            throw new Error(
                `Missing reviewed contract ${schemaName}.${propertyName}`,
            );
        }
        properties[propertyName] = namedRef(
            properties[propertyName],
            targetName,
        );
    }

    const arrayItemRefs = [
        ['DocumentAuditReport', 'wholes', 'DocumentWholeOccurrence'],
        ['DocumentAuditReport', 'parts', 'DocumentPartAssessment'],
        ['EvaluationResult', 'selectedRules', 'GuideRule'],
        ['EvaluationResult', 'activeComputedRules', 'GuideRule'],
        ['ExplanationTrace', 'repairs', 'TraceRepair'],
        ['ExplanationTrace', 'validationErrors', 'TraceValidationIssue'],
        ['ExplanationTrace', 'inferences', 'TraceInference'],
        ['CalendarDateValueEncoding', 'accepts', 'CalendarDateSpelling'],
    ];
    for (const [schemaName, propertyName, targetName] of arrayItemRefs) {
        const property = schemas[schemaName]?.properties?.[propertyName];
        if (!schemas[targetName])
            throw new Error(`Missing named contract ${targetName}`);
        if (!property?.items) {
            throw new Error(
                `Missing reviewed contract ${schemaName}.${propertyName}[]`,
            );
        }
        property.items = namedRef(property.items, targetName);
    }

    // A named map alias is expanded structurally like any other alias, so the
    // value shape it was declared with comes back inline. Promoting it keeps a
    // map's value a named schema in every SDK instead of an anonymous one.
    const dictionaryValueRefs = [
        ['CalendarDateViewSpellings', 'CalendarDateSpelling'],
        ['SuggestResultsByCategory', 'SuggestResult'],
    ];
    for (const [schemaName, targetName] of dictionaryValueRefs) {
        const schema = schemas[schemaName];
        if (!schemas[targetName])
            throw new Error(`Missing named contract ${targetName}`);
        if (!schema?.additionalProperties) {
            throw new Error(`Missing reviewed dictionary ${schemaName}`);
        }
        schema.additionalProperties = namedRef(
            schema.additionalProperties,
            targetName,
        );
    }

    const unionBranchRefs = [
        [
            'SourceReference',
            ['ReproducibleSourceReference', 'BestEffortSourceReference'],
        ],
        [
            'RuleSourceReference',
            [
                'ReproducibleRuleSourceReference',
                'BestEffortRuleSourceReference',
            ],
        ],
        ['Win', ['TokenWindow', 'CharacterWindow']],
        [
            'ValueEncoding',
            [
                'TextValueEncoding',
                'CalendarDateValueEncoding',
                'CompositeValueEncoding',
            ],
        ],
    ];
    for (const [schemaName, targets] of unionBranchRefs) {
        if (!Array.isArray(schemas[schemaName]?.anyOf)) {
            throw new Error(`Missing reviewed union ${schemaName}`);
        }
        for (const targetName of targets) {
            if (!schemas[targetName])
                throw new Error(`Missing named contract ${targetName}`);
        }
        schemas[schemaName].anyOf = targets.map((targetName, index) =>
            namedRef(schemas[schemaName].anyOf[index], targetName),
        );
    }
    if (!schemas.RuleWhenQuantifier)
        throw new Error('Missing named contract RuleWhenQuantifier');
    if (!Array.isArray(schemas.RuleWhen?.anyOf) || !schemas.RuleWhen.anyOf[2]) {
        throw new Error('Missing reviewed union RuleWhen');
    }
    schemas.RuleWhen.anyOf[2] = namedRef(
        schemas.RuleWhen.anyOf[2],
        'RuleWhenQuantifier',
    );
    if (
        !Array.isArray(schemas.RuleWhenNode?.anyOf) ||
        !schemas.RuleWhenNode.anyOf[1]
    ) {
        throw new Error('Missing reviewed union RuleWhenNode');
    }
    schemas.RuleWhenNode.anyOf[1] = namedRef(
        schemas.RuleWhenNode.anyOf[1],
        'RuleWhenQuantifier',
    );
}

/**
 * Inlines TS generic-instantiation schemas like
 * `ContextOperationResult<AccessDecision>` into their alias wrappers.
 * ts-json-schema-generator emits both the alias (`ContextAccessDecisionResult`
 * ⇒ `{$ref: '#/.../ContextOperationResult<AccessDecision>'}`) and the
 * underlying generic shape under the bracketed name. The bracketed names are
 * valid JSON Schema but break Go's oapi-codegen (which URL-encodes them into
 * invalid Go identifiers like `ContextOperationResult3CAccessDecision3E`). For
 * every schema whose name contains `<` or `>`, we walk the dict and inline its
 * body into every $ref-only alias that targets it, then drop the bracketed
 * entry.
 */
function collapseGenericAliases(merged) {
    const bracketed = Object.keys(merged).filter(
        (k) =>
            k.includes('<') ||
            k.includes('>') ||
            k.includes('%3C') ||
            k.includes('%3E'),
    );
    if (bracketed.length === 0) return;

    for (const targetName of bracketed) {
        const targetSchema = merged[targetName];
        const targetRefs = new Set([
            `#/components/schemas/${targetName}`,
            `#/components/schemas/${encodeURIComponent(targetName)}`,
            `#/components/schemas/${decodeURIComponent(targetName)}`,
        ]);
        for (const [aliasName, aliasSchema] of Object.entries(merged)) {
            if (aliasName === targetName) continue;
            if (!aliasSchema || typeof aliasSchema !== 'object') continue;
            if (
                typeof aliasSchema.$ref !== 'string' ||
                !targetRefs.has(aliasSchema.$ref)
            )
                continue;
            const description = aliasSchema.description;
            const inlined = JSON.parse(JSON.stringify(targetSchema));
            if (description) inlined.description = description;
            merged[aliasName] = inlined;
        }
        delete merged[targetName];
    }
}
