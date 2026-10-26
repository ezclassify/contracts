/**
 * Derive the published document-validation view from generated input types. The
 * input-schema exports retain their type-derived shape. This view adds the
 * document validator's constraints and stable definition names.
 */

const GUIDE_NAMES = {
    'AttributionDoc': 'attribution',
    'CharacterWindow': 'character_window',
    'ConceptRef': 'concept_ref',
    'ExternalSourceAuth': 'external_source_auth',
    'ExternalSourceCapabilities': 'external_source_capabilities',
    'ExternalSourcePagination': 'external_source_pagination',
    'ExternalSourceQueryParams': 'external_source_query_params',
    'ExternalSourceSpec<RuleMappingDoc>': 'external_source',
    'ExternalSourceTls': 'external_source_tls',
    'ExternalSourceTransport': 'external_source_transport',
    'GuideCategory': 'guide_category',
    'GuideDependency': 'guide_dependency',
    'GuideLayer': 'guide_layer',
    'GuideLayerRemoval': 'guide_layer_removal',
    'GuideMatchSpec': 'guide_match_spec',
    'GuideRule': 'guide_rule',
    'GuideRuleOutcome': 'guide_rule_outcome',
    'MatchAllNode': 'match_all_node',
    'MatchAnyNode': 'match_any_node',
    'MatchContextExpression': 'match_context_expression',
    'MatchContextNode': 'match_context_node',
    'MatchContextSide': 'match_context_side',
    'MatchNearEmit': 'match_near_emit',
    'MatchNearExpression': 'match_near_expression',
    'MatchNearNode': 'match_near_node',
    'MatchNode': 'match_node',
    'MatchNotNode': 'match_not_node',
    'MatchValidateNode': 'match_validate_node',
    'MatchValidationExpression': 'match_validation_expression',
    'MatchValidationKeep': 'match_validation_keep',
    'Record<string,string>': 'string_map',
    'RuleMappingDoc': 'rule_mapping',
    'RuleWhen': 'rule_when',
    'RuleWhenNode': 'when_node',
    'SecretRefDoc': 'secret_ref',
    'Term': 'term',
    'TokenWindow': 'token_window',
    'Vocabulary': 'vocabulary',
    'Win': 'match_window',
};

/** Resolve one generated definition without discarding a use-site annotation. */
function inline(node, definitions) {
    if (!node.$ref) return structuredClone(node);
    const prefix = '#/definitions/';
    if (!node.$ref.startsWith(prefix)) {
        throw new Error(`Unexpected input-schema reference: ${node.$ref}`);
    }
    const name = decodeURIComponent(node.$ref.slice(prefix.length));
    if (!definitions[name])
        throw new Error(`Missing generated definition: ${name}`);
    const { $ref, ...annotations } = node;
    return { ...inline(definitions[name], definitions), ...annotations };
}

/** Preserve local reference targets while selecting a JSON Schema dialect. */
function publicationTree(value, names, key) {
    if (value === null || typeof value !== 'object') return value;
    return Object.fromEntries(
        Object.entries(value).map(([member, child]) => {
            if (member === '$ref') {
                const prefix = '#/definitions/';
                if (!child.startsWith(prefix))
                    throw new Error(`Unexpected schema reference: ${child}`);
                const name = decodeURIComponent(child.slice(prefix.length));
                return [
                    member,
                    `#/${key}/${encodeURIComponent(names[name] ?? name)}`,
                ];
            }
            if (
                [
                    'properties',
                    'patternProperties',
                    '$defs',
                    'definitions',
                    'dependentSchemas',
                    'dependencies',
                ].includes(member)
            ) {
                return [
                    member,
                    Object.fromEntries(
                        Object.entries(child).map(([name, schema]) => [
                            name,
                            Array.isArray(schema)
                                ? schema
                                : publicationTree(schema, names, key),
                        ]),
                    ),
                ];
            }
            if (['allOf', 'anyOf', 'oneOf', 'prefixItems'].includes(member)) {
                return [
                    member,
                    child.map((schema) => publicationTree(schema, names, key)),
                ];
            }
            if (
                [
                    'items',
                    'additionalItems',
                    'additionalProperties',
                    'contains',
                    'propertyNames',
                    'not',
                    'if',
                    'then',
                    'else',
                    'unevaluatedItems',
                    'unevaluatedProperties',
                    'contentSchema',
                ].includes(member)
            ) {
                return [
                    member,
                    Array.isArray(child)
                        ? child.map((schema) =>
                              publicationTree(schema, names, key),
                          )
                        : publicationTree(child, names, key),
                ];
            }
            // Values under const/enum/default/examples are instance data, even
            // when an object inside them happens to contain a "$ref" property.
            return [member, child];
        }),
    );
}

/** Apply a nonempty-string constraint without duplicating its type shape. */
function nonempty(node) {
    if (node?.type !== 'string')
        throw new Error('Nonempty constraint requires a generated string');
    node.minLength = 1;
}

function guideView(schema) {
    const defs = schema.definitions;
    const guide = inline(schema.properties.guide, defs);
    guide.properties.rules = inline(guide.properties.rules, defs);
    schema.properties.guide = guide;

    for (const key of ['id', 'version', 'name'])
        nonempty(guide.properties[key]);
    guide.properties.targetSchemes.minItems = 1;
    for (const [name, fields] of [
        ['GuideDependency', ['id']],
        ['GuideCategory', ['id', 'label']],
        ['GuideRule', ['id', 'name']],
        ['ConceptRef', ['id']],
        ['Term', ['singular', 'plural']],
        ['GuideLayer', ['base']],
    ]) {
        for (const field of fields) nonempty(defs[name].properties[field]);
    }
    nonempty(defs.GuideLayer.properties.requires.items);
    defs.GuideRuleOutcome.anyOf = [
        { required: ['rendered'] },
        { required: ['concepts'] },
    ];

    // A guide's trigger view exposes leaf tests and boolean nesting. Context
    // and contributor selectors remain part of the shared type-derived view.
    const condition = structuredClone(defs.RuleCondition);
    delete condition.properties.role;
    delete condition.properties.target;
    delete condition.properties.value.type;
    const quantifier = structuredClone(defs.RuleWhenQuantifier);
    delete quantifier.properties.target;
    delete quantifier.properties.quantifier;
    defs.RuleWhenNode.oneOf = [condition, quantifier];
    delete defs.RuleWhenNode.anyOf;
    defs.RuleWhen.oneOf = defs.RuleWhen.anyOf.map((branch) => {
        if (!branch.$ref) return branch;
        if (branch.$ref !== '#/definitions/RuleWhenQuantifier') {
            throw new Error(
                `Unexpected guide condition branch: ${branch.$ref}`,
            );
        }
        return structuredClone(quantifier);
    });
    delete defs.RuleWhen.anyOf;

    const removal = defs.GuideLayerRemoval;
    removal.properties = Object.assign(
        {},
        ...removal.anyOf.map((branch) => branch.properties),
    );
    for (const node of Object.values(removal.properties)) nonempty(node);
    delete removal.anyOf;
    Object.assign(removal, {
        type: 'object',
        additionalProperties: false,
        minProperties: 1,
        maxProperties: 1,
    });
    defs.Vocabulary = inline(defs.Vocabulary, defs);

    schema.$id = 'https://ezclassify.com/schemas/v1/guide.schema.json';
    schema.title = 'EzClassify Guide Schema';
    return publish(
        schema,
        GUIDE_NAMES,
        '$defs',
        new Set([
            'GuideBlock',
            'GuideRulesBlock',
            'RuleCondition',
            'RuleWhenQuantifier',
            'ProcessingRole',
            'RuleConditionTarget',
            'RuleContributorQuantifier',
            'Record<string,Term>',
        ]),
    );
}

function accessView(schema) {
    const defs = schema.definitions;
    const envelope = schema.properties.access;
    envelope.properties.rules = inline(envelope.properties.rules, defs);
    envelope.properties.targetScheme = inline(
        envelope.properties.targetScheme,
        defs,
    );
    defs.AccessPolicyEnvelope = envelope;
    schema.properties.access = {
        $ref: '#/definitions/AccessPolicyEnvelope',
        description: envelope.description,
    };
    nonempty(defs.AccessLayer.properties.base);
    nonempty(defs.AccessLayer.properties.requires.items);
    defs.Vocabulary = inline(defs.Vocabulary, defs);
    return publish(
        schema,
        { Term: 'term', Vocabulary: 'vocabulary' },
        'definitions',
        new Set([
            'AccessRulesBlock',
            'AccessPolicyTargetScheme',
            'Record<string,Term>',
        ]),
    );
}

function publish(schema, names, key, omitted = new Set()) {
    const definitions = schema.definitions;
    delete schema.definitions;
    schema[key] = Object.fromEntries(
        Object.entries(definitions)
            .filter(([name]) => !omitted.has(name))
            .map(([name, node]) => [names[name] ?? name, node]),
    );
    schema.$schema =
        key === '$defs'
            ? 'https://json-schema.org/draft/2020-12/schema'
            : 'http://json-schema.org/draft-07/schema#';
    return publicationTree(schema, names, key);
}

/**
 * Build a static validation schema without changing the raw input-schema
 * export.
 *
 * @param {'scheme' | 'guide' | 'access' | 'crosswalk'} kind Document family.
 * @param {Record<string, unknown>} generated Type-derived schema.
 * @returns {Record<string, unknown>} Detached published validation view.
 */
export function validationSchema(kind, generated) {
    const schema = structuredClone(generated);
    switch (kind) {
        case 'scheme':
            return schema;
        case 'guide':
            return guideView(schema);
        case 'access':
            return accessView(schema);
        case 'crosswalk':
            schema.$id =
                'https://ezclassify.com/schemas/v1/crosswalk.schema.json';
            schema.title = 'EzClassify Crosswalk Schema';
            return publish(schema, {}, '$defs');
        default:
            throw new Error(`Unknown validation-schema family: ${kind}`);
    }
}
