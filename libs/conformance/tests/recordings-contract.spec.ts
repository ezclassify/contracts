import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import Ajv from 'ajv';
import Ajv2020 from 'ajv/dist/2020.js';
import addFormats from 'ajv-formats';
import { describe, expect, it } from 'vitest';

/**
 * Recorded expected outputs are checked against the result contract they were
 * recorded for.
 *
 * An SDK author compares an implementation with these recordings field by
 * field, so a recording that carries a field the contract removed, or lacks one
 * it now requires, teaches every SDK the wrong shape. The published result
 * schemas are open, because a response may gain fields. A recording is not a
 * response a client has to tolerate; it is the reference answer, so the check
 * closes every object first and a removed field is as much a failure as a
 * missing one.
 *
 * The recordings are produced by the reference engine, which lives with the
 * runtime, and never edited here. When the contract moves ahead of them, each
 * recording file that no longer matches is named in `AWAITING_RERECORD` with
 * the reason, and the test holds that list exact: a failure anywhere else is an
 * error, and a listed file that matches again must come off the list.
 */

const corpusRoot = path.resolve(
    path.dirname(fileURLToPath(import.meta.url)),
    '..',
);

function readJson(...segments: string[]): unknown {
    return JSON.parse(readFileSync(path.join(corpusRoot, ...segments), 'utf8'));
}

type Json = { [key: string]: unknown };

/** A copy of `schema` with every object that names its properties closed. */
function closed(schema: unknown): unknown {
    if (Array.isArray(schema)) return schema.map(closed);
    if (!schema || typeof schema !== 'object') return schema;
    const copy: Json = Object.fromEntries(
        Object.entries(schema as Json).map(([key, value]) => [
            key,
            closed(value),
        ]),
    );
    if (copy.properties && copy.additionalProperties === undefined)
        copy.additionalProperties = false;
    return copy;
}

/** Engine-slice methods and the published result schema each one answers. */
const RESULT_SCHEMA: Record<string, string | null> = {
    process: 'process-result.schema.json',
    validate: 'validate-result.schema.json',
    suggest: 'suggest-result.schema.json',
    aggregate: 'aggregate-result.schema.json',
    aggregateAssertions: 'aggregate-result.schema.json',
    diff: 'diff-result.schema.json',
    // These recordings hold a summary the reference runner projects from the
    // answer (a count, a first entry, a bare string), not the answer itself,
    // so there is no result schema to hold them to.
    render: null,
    normalize: null,
    scan: null,
    checkAccess: null,
    evaluateGuide: null,
    evaluateMany: null,
    guideScan: null,
    registryProcessAll: null,
    registrySuggestAcross: null,
};

/** Semantic operations and the published envelope each one answers. */
const ENVELOPE: Record<string, string | null> = {
    auditDocument: 'ContextDocumentAuditResult',
    assessDocumentAccess: 'ContextDocumentAccessAssessmentResult',
    documentAccessRequirements: 'ContextAccessRequirementsResult',
    // The CLI case records the CLI's own JSON, which is not a wire envelope.
    cliDocument: null,
};

/**
 * Recording files made before the contract they are checked against, by file
 * name (`semantic` is the document-assessment recordings). Each entry comes off
 * this list when the runtime records that file again.
 */
const AWAITING_RERECORD: Record<string, string> = {};

const engineSchemas = new Map<string, ReturnType<Ajv['compile']>>();
function engineValidator(file: string) {
    let validate = engineSchemas.get(file);
    if (!validate) {
        const ajv = new Ajv({ strict: false, allErrors: true });
        addFormats(ajv);
        validate = ajv.compile(
            closed(
                readJson('..', 'schemas', 'generated', 'json-schemas', file),
            ) as object,
        );
        engineSchemas.set(file, validate);
    }
    return validate;
}

const spec = readJson('..', 'openapi', 'openapi.json') as {
    components: { schemas: Json };
};
const specUri = 'https://recordings-contract.ezclassify.com/openapi.json';
const specAjv = new Ajv2020({ strict: false, allErrors: true });
addFormats(specAjv);
specAjv.addSchema({
    ...spec,
    components: { schemas: closed(spec.components.schemas) },
    $id: specUri,
});

/** Every recording that does not match its contract, by `file#key`. */
function offContract(): Record<string, string> {
    const found: Record<string, string> = {};
    const files = readdirSync(path.join(corpusRoot, 'recordings', 'v1'))
        .filter((name) => name.endsWith('.json'))
        .sort();
    for (const file of files) {
        const recording = readJson('recordings', 'v1', file) as {
            responses: Record<string, { method: string; response: unknown }>;
        };
        for (const [key, entry] of Object.entries(recording.responses)) {
            const schema = RESULT_SCHEMA[entry.method];
            if (schema === undefined)
                found[`${file}#${key}`] = `unclassified method ${entry.method}`;
            if (!schema) continue;
            const validate = engineValidator(schema);
            if (!validate(entry.response))
                found[`${file}#${key}`] = specErrors(validate.errors);
        }
    }
    const contract = readJson(
        'semantic',
        'v1',
        'document-assessment.contract.json',
    ) as { cases: { requestId: string; operation: string }[] };
    const recordings = (
        readJson('semantic', 'v1', 'fixtures', 'recordings.json') as {
            cases: Record<string, { output: Json }>;
        }
    ).cases;
    for (const { requestId, operation } of contract.cases) {
        const envelope = ENVELOPE[operation];
        const where = `semantic#${requestId}`;
        if (envelope === undefined) {
            found[where] = `unclassified operation ${operation}`;
            continue;
        }
        const output = recordings[requestId]?.output;
        if (!envelope || !output || 'error' in output) continue;
        const validate = specAjv.compile({
            $ref: `${specUri}#/components/schemas/${envelope}`,
        });
        if (!validate(output)) found[where] = specErrors(validate.errors);
    }
    return found;
}

function specErrors(errors: Ajv['errors']): string {
    return [
        ...new Set(
            (errors ?? []).map((error) =>
                [
                    error.keyword,
                    error.params?.missingProperty ??
                        error.params?.additionalProperty ??
                        error.instancePath,
                ].join(' '),
            ),
        ),
    ]
        .sort()
        .join(', ');
}

describe('recordings hold to the result contract', () => {
    const found = offContract();

    it('classifies every recorded method and semantic operation', () => {
        expect(
            Object.values(found).filter((reason) =>
                reason.startsWith('unclassified'),
            ),
        ).toEqual([]);
    });

    it('matches, apart from the recordings awaiting a re-record', () => {
        const files = new Set(
            Object.keys(found).map((where) => where.split('#')[0]),
        );
        expect([...files].sort()).toEqual(
            Object.keys(AWAITING_RERECORD).sort(),
        );
    });

    it('closes a schema so a removed field counts (negative control)', () => {
        const validate = engineValidator('suggest-result.schema.json');
        expect(validate({ suggestions: [], warnings: [] })).toBe(true);
        expect(
            validate({ suggestions: [], warnings: [], currentValid: true }),
        ).toBe(false);
    });
});
