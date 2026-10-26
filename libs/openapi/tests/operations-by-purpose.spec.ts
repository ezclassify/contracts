import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import yaml from 'js-yaml';
import { describe, expect, it } from 'vitest';

/**
 * The marking operations are split by who is asking, and the published document
 * is where a generated client learns the split. Validate is the reader's call,
 * process the author's, suggest returns options only, and explain returns the
 * trace no other operation returns. Each check below has a negative control:
 * the same predicate run against a shape the rule rules out, so a predicate
 * that quietly matches everything cannot pass for a rule.
 */

const PACKAGE_ROOT = path.resolve(
    path.dirname(fileURLToPath(import.meta.url)),
    '..',
);

type Schema = {
    $ref?: string;
    type?: string | string[];
    description?: string;
    items?: Schema;
    properties?: Record<string, Schema>;
    required?: string[];
    additionalProperties?: boolean | Schema;
    anyOf?: Schema[];
    allOf?: Schema[];
    oneOf?: Schema[];
};

const spec = yaml.load(
    fs.readFileSync(path.join(PACKAGE_ROOT, 'openapi.yaml'), 'utf8'),
) as {
    paths: Record<
        string,
        Record<
            string,
            {
                operationId: string;
                requestBody?: {
                    content: Record<string, { schema: { $ref?: string } }>;
                };
                responses: Record<
                    string,
                    {
                        $ref?: string;
                        description?: string;
                        content?: Record<string, { schema: { $ref?: string } }>;
                    }
                >;
            }
        >
    >;
    components: {
        schemas: Record<string, Schema>;
        responses: Record<string, { description?: string }>;
    };
};

const schemas = spec.components.schemas;
const REF = '#/components/schemas/';

function schema(name: string): Schema {
    const found = schemas[name];
    expect(found, `components.schemas.${name}`).toBeDefined();
    return found!;
}

const keys = (name: string): string[] =>
    Object.keys(schema(name).properties ?? {}).sort();

/** Every component a schema reaches, by following `$ref`s transitively. */
function reaches(start: string): Set<string> {
    const seen = new Set<string>();
    const queue = [start];
    while (queue.length > 0) {
        const name = queue.pop()!;
        if (seen.has(name)) continue;
        seen.add(name);
        const visit = (node: unknown): void => {
            if (Array.isArray(node)) return node.forEach(visit);
            if (!node || typeof node !== 'object') return;
            for (const [key, value] of Object.entries(node)) {
                if (key === '$ref' && typeof value === 'string')
                    queue.push(value.replace(REF, ''));
                else visit(value);
            }
        };
        visit(schemas[name]);
    }
    seen.delete(start);
    return seen;
}

const SCHEME = '/v1/ctx/{ctxId}/{version}/scheme';
const requestOf = (route: string): string =>
    spec.paths[`${SCHEME}/${route}`]!.post!.requestBody!.content[
        'application/json'
    ]!.schema.$ref!.replace(REF, '');
const resultOf = (route: string): string => {
    const envelope = spec.paths[`${SCHEME}/${route}`]!.post!.responses[
        '200'
    ]!.content!['application/json']!.schema.$ref!.replace(REF, '');
    return schema(envelope).properties!['result']!.$ref!.replace(REF, '');
};
/** The reasons a route gives for a 400, as the published document words them. */
const refusals = (route: string): string =>
    spec.paths[`${SCHEME}/${route}`]!.post!.responses['400']!.description ?? '';

const READER_FIELDS = [
    'appliedFixes',
    'assertions',
    'assessment',
    'displayColor',
    'errors',
    'inputWasValid',
    'notices',
    'recognition',
    'rendered',
    'valid',
    'warnings',
];
const AUTHOR_EXTRAS = [
    'assertionsBeforeRepair',
    'proposedFixes',
    'renders',
    'suggestionsFor',
];

describe('validate is the reader call', () => {
    it('answers with exactly the fields a reader uses', () => {
        expect(resultOf('validate')).toBe('ValidateResult');
        expect(keys('ValidateResult')).toEqual(READER_FIELDS);
        // Negative control: the author's result is not a reader's result.
        expect(keys('ProcessResult')).not.toEqual(READER_FIELDS);
    });

    it('reports recognition without the correction edit script', () => {
        expect(schema('ValidateResult').properties!['recognition']!.$ref).toBe(
            `${REF}RecognitionResult`,
        );
        expect(keys('RecognitionResult')).toEqual([
            'inputFormat',
            'role',
            'status',
            'surface',
            'unmatched',
        ]);
        // The role of the view the text was read as, from the one role enum.
        expect(schema('RecognitionResult').properties!['role']!.$ref).toBe(
            `${REF}ProcessingRole`,
        );
        // Negative control: the author's recognition carries it.
        expect(keys('RecognitionWithCorrections')).toContain('corrections');
    });

    it('carries no fix path, so no error in it can point at one', () => {
        expect(reaches('ValidateResult').has('Fix')).toBe(false);
        // Negative control: the author's result does carry fix paths.
        expect(reaches('ProcessResult').has('Fix')).toBe(true);
        expect(
            schema('ValidateResult').properties!['errors']!.description,
        ).toMatch(/No entry here points at a fix path/);
        expect(
            schema('ValidationError').properties!['suggestedFix']!.description,
        ).toMatch(/Set only on a result that carries that fix/);
    });

    it('takes text or facts and nothing that changes the settling', () => {
        const body = schema(requestOf('validate'));
        // `surface`, `context` and `parts` say what the marking is judged as;
        // none of them changes how it is settled.
        expect(keys(requestOf('validate'))).toEqual([
            'assertions',
            'context',
            'input',
            'inputFormat',
            'outputFormat',
            'parts',
            'surface',
        ]);
        // Exactly one of the two is the rule, so neither is required by shape.
        expect(body.required ?? []).toEqual([]);
        expect(body.additionalProperties).toBe(false);
    });

    it('lets no request ask the engine to settle less', () => {
        // Whether text was right as written is what `inputWasValid` and the
        // applied changes answer, so no route takes a repair level or a stage
        // to skip.
        const settlesLess = (properties: string[]) =>
            properties.filter((key) =>
                [
                    'normalization',
                    'skipRepair',
                    'skipInference',
                    'fix',
                    'preserveDeprecated',
                ].includes(key),
            );
        for (const route of ['process', 'validate', 'explain'])
            expect(settlesLess(keys(requestOf(route))), route).toEqual([]);
        for (const [name, component] of Object.entries(schemas))
            expect(
                settlesLess(Object.keys(component.properties ?? {})),
                name,
            ).toEqual([]);
        // Negative control: the filter does catch these keys when present.
        expect(
            settlesLess([
                ...keys(requestOf('process')),
                'normalization',
                'preserveDeprecated',
            ]),
        ).toEqual(['normalization', 'preserveDeprecated']);
    });

    it('is what every scan region answers', () => {
        expect(schema('ScanResult').properties!['result']!.$ref).toBe(
            `${REF}ValidateResult`,
        );
    });
});

describe('valid and inputWasValid have one meaning at every door', () => {
    const canonical = (field: 'valid' | 'inputWasValid') =>
        schema('ValidateResult').properties![field]!.description!;

    /** A `valid` that is the definition, or says it means the definition. */
    const agrees = (field: 'valid' | 'inputWasValid', description = '') =>
        description === canonical(field) ||
        description.includes(`ValidateResult.${field}`);

    it('defines both on the reader result, and process inherits them', () => {
        expect(canonical('valid')).toMatch(/Defined here once/);
        expect(canonical('inputWasValid')).toMatch(/Defined here once/);
        for (const field of ['valid', 'inputWasValid'] as const) {
            expect(
                schema('ProcessResult').properties![field]!.description,
            ).toBe(canonical(field));
        }
    });

    it('lets no published result give either field another meaning', () => {
        const strays: string[] = [];
        for (const [name, component] of Object.entries(schemas)) {
            for (const field of ['valid', 'inputWasValid'] as const) {
                const property = component.properties?.[field];
                if (property && !agrees(field, property.description))
                    strays.push(`${name}.${field}`);
            }
        }
        expect(strays).toEqual([]);
        // The predicate rejects descriptions that confuse settled validity
        // with whether the authored input needed repair.
        expect(
            agrees(
                'valid',
                'Whether the authored marking was valid without repair or inference.',
            ),
        ).toBe(false);
    });

    it('lets the audit say right-as-written in its own field', () => {
        expect(schema('MarkingValidation').required).toEqual(
            expect.arrayContaining(['valid', 'inputWasValid']),
        );
    });
});

describe('process is the author call', () => {
    it('answers with the reader result plus the authoring extras', () => {
        expect(resultOf('process')).toBe('ProcessResult');
        expect(keys('ProcessResult')).toEqual(
            [...READER_FIELDS, ...AUTHOR_EXTRAS].sort(),
        );
        expect(schema('ProcessResult').properties!['recognition']!.$ref).toBe(
            `${REF}RecognitionWithCorrections`,
        );
    });

    it('carries no explanation trace', () => {
        expect(reaches('ProcessResult').has('ExplanationTrace')).toBe(false);
        expect(reaches('ValidateResult').has('ExplanationTrace')).toBe(false);
        // Negative control: the predicate finds the trace where it lives.
        expect(
            reaches('ContextSchemeExplainResult').has('ExplanationTrace'),
        ).toBe(true);
    });

    it('names its outputs and its picker categories in closed lists', () => {
        const body = schema(requestOf('process'));
        expect(body.additionalProperties).toBe(false);
        for (const field of ['outputs', 'suggestFor']) {
            expect(body.properties![field]).toMatchObject({
                type: 'array',
                items: { type: 'string' },
            });
            expect(body.required ?? []).not.toContain(field);
        }
        // Text and chosen facts travel together in one request.
        expect(keys(requestOf('process'))).toEqual(
            expect.arrayContaining(['input', 'assertions']),
        );
    });

    it('answers picker options only when asked', () => {
        const result = schema('ProcessResult');
        expect(result.properties!['suggestionsFor']!.$ref).toBe(
            `${REF}SuggestResultsByCategory`,
        );
        expect(result.required).not.toContain('suggestionsFor');
        expect(result.properties!['suggestionsFor']!.description).toMatch(
            /Computed only when asked/,
        );
        // Negative control: `renders` is always there, even when empty.
        expect(result.required).toContain('renders');
        expect(schema('SuggestResultsByCategory').additionalProperties).toEqual(
            { $ref: `${REF}SuggestResult` },
        );
    });
});

describe('explain answers why', () => {
    it('is an operation of its own that returns the trace', () => {
        const op = spec.paths[`${SCHEME}/explain`]!.post!;
        expect(op.operationId).toBe('ctxSchemeExplain');
        expect(resultOf('explain')).toBe('ExplanationTrace');
    });

    it('takes what process takes, less what only adds to a process result', () => {
        const explain = schema(requestOf('explain'));
        expect(explain.additionalProperties).toBe(false);
        expect(keys(requestOf('explain'))).toEqual(
            keys(requestOf('process')).filter(
                (key) => key !== 'outputs' && key !== 'suggestFor',
            ),
        );
        // Negative control: process's own list is not explain's.
        expect(keys(requestOf('process'))).not.toEqual(
            keys(requestOf('explain')),
        );
    });
});

describe('suggest returns options only', () => {
    it('carries suggestions and the builder warnings, and nothing about the marking', () => {
        expect(keys('SuggestResult')).toEqual(['suggestions', 'warnings']);
        // Negative control: the marking's verdict lives elsewhere.
        expect(keys('ValidateResult')).toContain('valid');
    });

    it('takes the marking as text or as facts, one of the two', () => {
        const body = schema(requestOf('suggest'));
        expect(keys(requestOf('suggest'))).toEqual(
            expect.arrayContaining(['assertions', 'input']),
        );
        // Exactly one of the two is the rule, as on validate, so neither is
        // required by shape and the request says so where a client reads it.
        const eitherOptional = (shape: Schema) =>
            ['assertions', 'input'].every(
                (key) => !(shape.required ?? []).includes(key),
            );
        expect(eitherOptional(body)).toBe(true);
        expect(eitherOptional(schema(requestOf('validate')))).toBe(true);
        expect(body.description).toMatch(
            /exactly\s+one of the two; neither or both is a 400/,
        );
        // Negative control: process takes text with facts beside it, so its
        // text is required.
        expect(eitherOptional(schema(requestOf('process')))).toBe(false);
    });

    it('refuses an input format beside facts, as validate does', () => {
        const besideFacts = /`inputFormat` sent with `assertions`/;
        expect(refusals('suggest')).toMatch(besideFacts);
        expect(refusals('validate')).toMatch(besideFacts);
        // Negative control: process reads its text beside the facts, so a
        // format for that text is never refused for them.
        expect(refusals('process')).not.toMatch(besideFacts);
    });

    it('names the several-categories operation as the engine does', () => {
        const op = spec.paths[`${SCHEME}/suggest-for-categories`]!.post!;
        expect(op.operationId).toBe('ctxSchemeSuggestForCategories');
        expect(spec.paths[`${SCHEME}/suggest-batch`]).toBeUndefined();
        const operationIds = Object.values(spec.paths).flatMap((item) =>
            Object.values(item).map((entry) => entry.operationId),
        );
        expect(operationIds.filter((id) => /Batch/.test(id))).toEqual([]);
        // Negative control: the predicate does see operation ids.
        expect(operationIds).toContain('ctxSchemeSuggestForCategories');
    });
});

describe('aggregate drops nothing it is handed', () => {
    it('refuses an input format beside assertion sets, as validate and suggest refuse one beside facts', () => {
        const besideSets = /`inputFormat` sent with `assertionSets`/;
        const refusedWithSets = /Refused with\s+`assertionSets`/;
        const inputFormatOf = (route: string) =>
            schema(requestOf(route)).properties!['inputFormat']!.description ??
            '';
        expect(refusals('aggregate')).toMatch(besideSets);
        expect(inputFormatOf('aggregate')).toMatch(refusedWithSets);
        // Negative control: check-coverage reads only text, so nothing it is
        // handed can stand beside its input format.
        expect(refusals('check-coverage')).not.toMatch(besideSets);
        expect(inputFormatOf('check-coverage')).not.toMatch(refusedWithSets);
    });
});

describe('the document audit hands back each marking without a second read', () => {
    it('gives every audited marking, whole or part, its facts and recognition', () => {
        const validation = schema('MarkingValidation');
        expect(validation.required).toEqual(
            expect.arrayContaining([
                'assertions',
                'recognition',
                'appliedFixes',
            ]),
        );
        expect(validation.properties!['assertions']).toMatchObject({
            type: 'array',
            items: { $ref: `${REF}Assertion` },
        });
        expect(validation.properties!['recognition']!.$ref).toBe(
            `${REF}RecognitionResult`,
        );
        // Both the parts and the whole are answered with it.
        expect(
            schema('DocumentPartAssessment').properties!['validation']!.$ref,
        ).toBe(`${REF}MarkingValidation`);
        expect(
            JSON.stringify(
                schema('DocumentAuditReport').properties!['wholeValidation'],
            ),
        ).toContain(`${REF}MarkingValidation`);
        // Negative control: the whole occurrence stays a bare location.
        expect(keys('DocumentWholeOccurrence')).not.toContain('assertions');
    });
});

describe('a format the scheme does not declare is the caller error', () => {
    const FORMAT_FIELDS = ['format', 'inputFormat', 'outputFormat'];
    /** Every operation, the format fields its request takes and its 400. */
    const operations = Object.values(spec.paths).flatMap((item) =>
        Object.values(item).map((op) => {
            const ref =
                op.requestBody?.content['application/json']?.schema.$ref;
            const fields =
                ref === undefined
                    ? []
                    : keys(ref.replace(REF, '')).filter((key) =>
                          FORMAT_FIELDS.includes(key),
                      );
            return {
                id: op.operationId,
                fields,
                refusals: op.responses['400']?.description ?? '',
            };
        }),
    );

    it('names it among the reasons for a 400 wherever a request names one', () => {
        const naming = operations.filter((op) => op.fields.length > 0);
        expect(naming.map((op) => op.id)).toContain('ctxSchemeRender');
        for (const op of naming) {
            for (const field of op.fields) {
                expect(op.refusals, `${op.id} ${field}`).toContain(
                    `\`${field}\``,
                );
            }
            expect(op.refusals, op.id).toMatch(/the scheme does not declare/);
        }
    });

    it('leaves the shared 400 to requests that name no format', () => {
        const shared =
            spec.components.responses['BadRequest']!.description ?? '';
        expect(shared).not.toMatch(/format/i);
        // Negative control: an operation whose request names no format
        // answers with the shared 400 as it stands.
        const plain = operations.find((op) => op.id === 'ctxAccessCheck')!;
        expect(plain.fields).toEqual([]);
        expect(plain.refusals).toBe('');
    });
});

describe('operations that cannot name outputs answer as a reader', () => {
    it('returns a validate result from apply-preset', () => {
        expect(resultOf('apply-preset')).toBe('ValidateResult');
        // Negative control: process, which can name outputs, does not.
        expect(resultOf('process')).toBe('ProcessResult');
    });

    it('carries the trace on no result but explain', () => {
        expect(keys('AggregateResult')).not.toContain('explanation');
        expect(reaches('AggregateResult').has('ExplanationTrace')).toBe(false);
    });
});
