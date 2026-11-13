/**
 * Derive the published document schema from the generated document types: the
 * type-derived shape plus the document validator's constraints and stable
 * definition names.
 */

const GUIDE_NAMES = {
    CharacterWindowDoc: 'character_window',
    ConceptRefDoc: 'concept_ref',
    GuideCategoryDoc: 'guide_category',
    GuideLayer: 'guide_layer',
    GuideLayerRemoval: 'guide_layer_removal',
    GuideMatchAllDoc: 'guide_match_all',
    GuideMatchAnyDoc: 'guide_match_any',
    GuideMatchContextDoc: 'guide_match_context',
    GuideMatchLeafDoc: 'guide_match_leaf',
    GuideMatchNearDoc: 'guide_match_near',
    GuideMatchNodeDoc: 'guide_match_node',
    GuideMatchNotDoc: 'guide_match_not',
    GuideMatchValidateDoc: 'guide_match_validate',
    GuideRuleDoc: 'guide_rule',
    GuideRuleOutcomeDoc: 'guide_rule_outcome',
    GuideWhenDoc: 'guide_when',
    GuideWhenHasDoc: 'guide_when_has',
    GuideWhenNodeDoc: 'guide_when_node',
    GuideWhenOperator: 'guide_when_operator',
    GuideWhenTestDoc: 'guide_when_test',
    MarkingSchemeRefDoc: 'marking_scheme_ref',
    MatchContextSide: 'match_context_side',
    MatchNearEmit: 'match_near_emit',
    MatchValidationKeep: 'match_validation_keep',
    MatchWindowDoc: 'match_window',
    SchemeDependencyDoc: 'scheme_dependency',
    TermDoc: 'term',
    TokenWindowDoc: 'token_window',
    VocabularyDoc: 'vocabulary',
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
    schema.properties.guide = guide;

    for (const key of ['id', 'version', 'name'])
        nonempty(guide.properties[key]);
    for (const [name, fields] of [
        ['GuideCategoryDoc', ['id', 'label']],
        ['GuideRuleDoc', ['id', 'name']],
        ['ConceptRefDoc', ['id']],
        ['TermDoc', ['singular', 'plural']],
        ['GuideLayer', ['base']],
    ]) {
        for (const field of fields) nonempty(defs[name].properties[field]);
    }
    nonempty(defs.GuideLayer.properties.requires.items);
    defs.GuideRuleOutcomeDoc.anyOf = [
        { required: ['rendered'] },
        { required: ['concepts'] },
    ];
    for (const list of ['any', 'all', 'none'])
        defs.GuideWhenDoc.properties[list].minItems = 1;
    defs.GuideWhenDoc.minProperties = 1;

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
    defs.VocabularyDoc = inline(defs.VocabularyDoc, defs);
    defs.VocabularyDoc.minProperties = 1;

    schema.$id = 'https://ezclassify.com/schemas/v1/guide.schema.json';
    schema.title = 'EzClassify Guide Schema';
    return publish(
        schema,
        GUIDE_NAMES,
        '$defs',
        new Set(['GuideBlock', 'Record<string,TermDoc>']),
    );
}

function accessView(schema) {
    const defs = schema.definitions;
    const block = schema.properties.access;
    defs.AccessBlock = block;
    schema.properties.access = {
        $ref: '#/definitions/AccessBlock',
        description: block.description,
    };
    nonempty(defs.AccessLayer.properties.base);
    nonempty(defs.AccessLayer.properties.requires.items);
    defs.VocabularyDoc = inline(defs.VocabularyDoc, defs);
    defs.VocabularyDoc.minProperties = 1;
    return publish(
        schema,
        { TermDoc: 'term', VocabularyDoc: 'vocabulary' },
        'definitions',
        new Set(['Record<string,TermDoc>']),
    );
}

/**
 * The scheme view adds what the generated types cannot say: a rollup
 * intersection names exactly one of `category` and `categories`.
 */
function schemeView(schema) {
    schema.definitions.RollupIntersectDoc.oneOf = [
        { required: ['category'] },
        { required: ['categories'] },
    ];
    return schema;
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
 * Build the published validation schema for one document kind.
 *
 * @param {'scheme' | 'guide' | 'access' | 'crosswalk' | 'context' | 'test-suite'} kind
 *   Document family.
 * @param {Record<string, unknown>} generated Type-derived schema.
 * @returns {Record<string, unknown>} Detached published validation view.
 */
export function validationSchema(kind, generated) {
    const schema = structuredClone(generated);
    switch (kind) {
        case 'scheme':
            return schemeView(schema);
        case 'context':
        case 'test-suite':
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
