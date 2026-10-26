import { readFileSync, readdirSync } from 'node:fs';
import { createHash } from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import Ajv from 'ajv';
import Ajv2020 from 'ajv/dist/2020.js';
import addFormats from 'ajv-formats';
import { describe, expect, it } from 'vitest';

/**
 * The conformance corpus is data, not code. Nothing here executes an engine.
 * The reference runner that does is proprietary and lives with the runtime.
 * What this package owes its consumers is that the data it ships is
 * well-formed: every plan matches the plan meta-schema, every semantic fixture
 * matches its sibling schema, and the support matrix points at plans that
 * actually exist. An SDK author vendoring this corpus should never be the one
 * who discovers a malformed vector.
 */

const corpusRoot = path.resolve(
    path.dirname(fileURLToPath(import.meta.url)),
    '..',
);

function readJson(...segments: string[]): unknown {
    return JSON.parse(readFileSync(path.join(corpusRoot, ...segments), 'utf8'));
}

function listJson(dir: string): string[] {
    return readdirSync(path.join(corpusRoot, dir))
        .filter((name) => name.endsWith('.json'))
        .sort();
}

/**
 * Draft-07 and 2020-12 schemas both appear in this corpus, and Ajv needs a
 * different class for each, so the dialect is read off `$schema` rather than
 * assumed.
 */
function compile(schema: unknown) {
    const dialect = String(
        (schema as { $schema?: string } | null)?.$schema ?? '',
    );
    const Ctor = dialect.includes('2020-12') ? Ajv2020 : Ajv;
    const ajv = new Ctor({ strict: false, allErrors: true });
    addFormats(ajv);
    return ajv.compile(schema as object);
}

describe('conformance plans', () => {
    const planFiles = listJson('plans/v1').filter(
        (name) => name !== 'plan-schema.json',
    );

    it('ships the plan corpus', () => {
        expect(planFiles.length).toBeGreaterThan(0);
    });

    it.each(planFiles)('%s matches the plan meta-schema', (name) => {
        const validate = compile(readJson('plans', 'v1', 'plan-schema.json'));
        const valid = validate(readJson('plans', 'v1', name));
        expect(validate.errors ?? []).toEqual([]);
        expect(valid).toBe(true);
    });

    /**
     * A plan hands the engine facts the way a caller does, and an SDK runner
     * builds its request from them. A fact without the `confidence` and
     * `source` an assertion requires is a request no conforming client sends,
     * and an engine is free to read it differently from the facts a real caller
     * hands in.
     */
    describe('facts handed to the engine', () => {
        const assertion = compile(
            readJson(
                '..',
                'schemas',
                'generated',
                'json-schemas',
                'assertion.schema.json',
            ),
        );

        /**
         * Every object in a case's arguments that names a concept and its
         * category.
         */
        function factsIn(value: unknown, found: unknown[] = []): unknown[] {
            if (Array.isArray(value))
                value.forEach((one) => factsIn(one, found));
            else if (value && typeof value === 'object') {
                const record = value as Record<string, unknown>;
                if (
                    typeof record.conceptId === 'string' &&
                    typeof record.categoryId === 'string'
                )
                    found.push(record);
                Object.values(record).forEach((one) => factsIn(one, found));
            }
            return found;
        }

        it.each(planFiles)('%s hands in only complete assertions', (name) => {
            const plan = readJson('plans', 'v1', name) as {
                cases: { name: string; args?: unknown }[];
            };
            const incomplete = plan.cases.flatMap((entry) =>
                factsIn(entry.args)
                    .filter((fact) => !assertion(fact))
                    .map((fact) => `${entry.name}: ${JSON.stringify(fact)}`),
            );
            expect(incomplete).toEqual([]);
        });

        it('refuses a fact without its confidence and source (negative control)', () => {
            expect(assertion({ categoryId: 'level', conceptId: 'HIGH' })).toBe(
                false,
            );
            expect(
                assertion({
                    categoryId: 'level',
                    conceptId: 'HIGH',
                    confidence: 'certain',
                }),
            ).toBe(false);
            expect(
                assertion({
                    categoryId: 'level',
                    conceptId: 'HIGH',
                    confidence: 'certain',
                    source: 'user',
                }),
            ).toBe(true);
        });
    });
});

/**
 * A rank-graded category orders its values by rank and has no other order to
 * fall back on: one that rolls up by `max`, `min` or `least_upper_bound`, and
 * every `hierarchy_root`. An engine refuses to load a scheme that leaves a
 * concept such a category grades unranked, so a reference scheme that does is a
 * fixture no runner can load.
 *
 * The concepts a category grades are the ones that name it in `categories`,
 * narrowed to its `allowed_concepts` when it lists them, less group concepts,
 * whose members carry the ranks. An engine also leaves out a concept that heads
 * another category's list in a format. This check does not work that out, so a
 * reference scheme ranks those concepts too.
 */
describe('reference schemes', () => {
    type Category = {
        id: string;
        rollup?: string;
        hierarchy_root?: boolean;
        allowed_concepts?: string[];
    };
    type Concept = {
        id: string;
        categories?: string[];
        members?: string[];
        rank?: unknown;
    };
    type SchemeFixture = {
        scheme?: {
            type?: string;
            data?: {
                categories?: Category[];
                concepts?: { inline?: Concept[] };
            };
        };
    };
    const schemes = listJson('fixtures/v1').filter((name) => {
        const document = readJson('fixtures', 'v1', name) as SchemeFixture;
        return (
            document.scheme !== undefined && document.scheme.type !== 'layer'
        );
    });

    const rankGradedRollups = new Set(['max', 'min', 'least_upper_bound']);

    /** Whether `category` orders `concept` by its rank. */
    function grades(category: Category, concept: Concept): boolean {
        if (
            !rankGradedRollups.has(category.rollup ?? '') &&
            category.hierarchy_root !== true
        )
            return false;
        if (!(concept.categories ?? []).includes(category.id)) return false;
        if (
            category.allowed_concepts &&
            !category.allowed_concepts.includes(concept.id)
        )
            return false;
        return (concept.members ?? []).length === 0;
    }

    /**
     * The concepts of a standalone scheme that a rank-graded category grades
     * without a rank.
     */
    function unranked(document: SchemeFixture): string[] {
        const data = document.scheme?.data ?? {};
        const categories = data.categories ?? [];
        return (data.concepts?.inline ?? [])
            .filter(
                (concept) =>
                    concept.rank === undefined &&
                    categories.some((category) => grades(category, concept)),
            )
            .map((concept) => concept.id);
    }

    /** A one-category scheme holding the given concepts. */
    function schemeOf(category: Category, concepts: Concept[]): SchemeFixture {
        return {
            scheme: {
                data: {
                    categories: [category],
                    concepts: { inline: concepts },
                },
            },
        };
    }

    it('ships standalone reference schemes', () => {
        expect(schemes.length).toBeGreaterThan(0);
    });

    it.each(schemes)(
        '%s ranks every concept of a rank-graded category',
        (name) => {
            expect(
                unranked(readJson('fixtures', 'v1', name) as SchemeFixture),
            ).toEqual([]);
        },
    );

    it.each([
        { id: 'level', rollup: 'max' },
        { id: 'level', rollup: 'min' },
        { id: 'level', rollup: 'least_upper_bound' },
        { id: 'level', rollup: 'union', hierarchy_root: true },
    ])(
        'finds a concept $rollup leaves unranked (negative control)',
        (category) => {
            expect(
                unranked(
                    schemeOf(category, [
                        { id: 'LOW', categories: ['level'], rank: 0 },
                        { id: 'HIGH', categories: ['level'] },
                    ]),
                ),
            ).toEqual(['HIGH']);
        },
    );

    it('asks no rank of a category that does not grade by it', () => {
        expect(
            unranked(
                schemeOf({ id: 'level', rollup: 'union' }, [
                    { id: 'HIGH', categories: ['level'] },
                ]),
            ),
        ).toEqual([]);
    });

    it('asks no rank of a group concept', () => {
        expect(
            unranked(
                schemeOf({ id: 'level', rollup: 'max' }, [
                    { id: 'LOW', categories: ['level'], rank: 0 },
                    { id: 'GROUP', categories: ['level'], members: ['LOW'] },
                ]),
            ),
        ).toEqual([]);
    });

    it('asks no rank of a concept the category does not allow', () => {
        expect(
            unranked(
                schemeOf(
                    { id: 'level', rollup: 'max', allowed_concepts: ['LOW'] },
                    [
                        { id: 'LOW', categories: ['level'], rank: 0 },
                        { id: 'OTHER', categories: ['level'] },
                    ],
                ),
            ),
        ).toEqual([]);
    });
});

describe('access fixtures', () => {
    const files = listJson('fixtures/v1').filter((name) => {
        const document = readJson('fixtures', 'v1', name);
        return (
            document !== null &&
            typeof document === 'object' &&
            Object.hasOwn(document, 'access')
        );
    });
    const schema = readJson(
        '..',
        'schemas',
        'generated',
        'validation',
        'v1',
        'access.schema.json',
    );

    it('ships access fixtures', () => {
        expect(files.length).toBeGreaterThan(0);
    });

    it.each(files)('%s matches the public access schema', (name) => {
        const validate = compile(schema);
        const valid = validate(readJson('fixtures', 'v1', name));
        expect(validate.errors ?? [], name).toEqual([]);
        expect(valid).toBe(true);
    });

    it('the public access rule schema rejects an unsupported property', () => {
        const document = readJson(
            'fixtures',
            'v1',
            'ref-access-rules-1.json',
        ) as {
            access: { rules: { inline: Array<Record<string, unknown>> } };
        };
        const rule = document.access.rules.inline[0];
        const validate = compile(schema);
        expect(validate(document)).toBe(true);
        rule.unsupported = true;
        expect(validate(document)).toBe(false);
        expect(validate.errors).toContainEqual(
            expect.objectContaining({ keyword: 'additionalProperties' }),
        );
    });
});

describe('reference fixtures', () => {
    // Plans and runners name a fixture by file, so two files holding one
    // document are two names for the same vector, and the copy drifts.
    it('holds each document once', () => {
        const byDigest = new Map<string, string>();
        for (const name of listJson('fixtures/v1')) {
            const digest = createHash('sha256')
                .update(
                    readFileSync(path.join(corpusRoot, 'fixtures', 'v1', name)),
                )
                .digest('hex');
            expect(byDigest.get(digest), name).toBeUndefined();
            byDigest.set(digest, name);
        }
    });
});

describe('support matrix', () => {
    it('references only plans that exist', () => {
        const matrix = readJson('matrix.json') as {
            plans: { name: string; path: string }[];
        };
        const present = new Set(
            listJson('plans/v1').map((name) => `plans/v1/${name}`),
        );
        for (const plan of matrix.plans) {
            expect(present.has(plan.path), `${plan.name} -> ${plan.path}`).toBe(
                true,
            );
        }
    });
});

describe('semantic fixtures', () => {
    const pairs = listJson('semantic/v1/fixtures')
        .filter((name) => !name.endsWith('.schema.json'))
        .map((name) => ({
            fixture: name,
            schema: name.replace(/\.json$/, '.schema.json'),
        }));

    it('ships fixture/schema pairs', () => {
        expect(pairs.length).toBeGreaterThan(0);
    });

    it.each(pairs)('$fixture matches $schema', ({ fixture, schema }) => {
        const validate = compile(readJson('semantic/v1/fixtures', schema));
        const valid = validate(readJson('semantic/v1/fixtures', fixture));
        expect(validate.errors ?? []).toEqual([]);
        expect(valid).toBe(true);
    });

    /**
     * A runner outside this repository learns which fixtures a case runs
     * against from `context.json` alone. A request that names a variant the
     * context does not declare, or a variant whose fixtures disagree with what
     * the recording says it resolved, would leave that runner guessing.
     */
    describe('fixture variants', () => {
        type Fixtures = {
            schemeFixture: string;
            guideFixture: string | null;
            accessFixture: string | null;
        };
        const context = readJson(
            'semantic/v1/fixtures',
            'context.json',
        ) as Fixtures & { variants: Record<string, Partial<Fixtures>> };
        const requests = readJson(
            'semantic/v1/fixtures',
            'requests.json',
        ) as Record<string, { fixtureVariant?: string }>;
        const recordings = (
            readJson('semantic/v1/fixtures', 'recordings.json') as {
                cases: Record<
                    string,
                    {
                        output: {
                            resolution?: {
                                artifacts?: { kind: string; id: string }[];
                            };
                            error?: { code?: string };
                        };
                    }
                >;
            }
        ).cases;
        const requestSchema = readJson(
            'semantic/v1/fixtures',
            'requests.schema.json',
        ) as {
            patternProperties: Record<
                string,
                { properties: { fixtureVariant: { enum: string[] } } }
            >;
        };
        const fixturesFor = (variant?: string): Fixtures => ({
            schemeFixture: context.schemeFixture,
            guideFixture: context.guideFixture,
            accessFixture: context.accessFixture,
            ...(variant ? context.variants[variant] : {}),
        });
        const idOf = (fixture: string, kind: string): string =>
            (
                JSON.parse(
                    readFileSync(
                        path.resolve(
                            corpusRoot,
                            'semantic/v1/fixtures',
                            fixture,
                        ),
                        'utf8',
                    ),
                ) as Record<string, { id: string }>
            )[kind].id;

        it('declares every variant a request may name', () => {
            const allowed = Object.values(requestSchema.patternProperties)
                .map((entry) => entry.properties.fixtureVariant?.enum ?? [])
                .flat();
            expect(allowed.length).toBeGreaterThan(0);
            expect(Object.keys(context.variants).sort()).toEqual(
                [...new Set(allowed)].sort(),
            );
        });

        it('resolves every variant to fixtures that exist', () => {
            for (const variant of Object.keys(context.variants)) {
                const fixtures = fixturesFor(variant);
                expect(idOf(fixtures.schemeFixture, 'scheme'), variant).toMatch(
                    /^ref-/,
                );
                if (fixtures.guideFixture)
                    expect(idOf(fixtures.guideFixture, 'guide')).toMatch(
                        /^ref-/,
                    );
                if (fixtures.accessFixture)
                    expect(idOf(fixtures.accessFixture, 'access')).toMatch(
                        /^ref-/,
                    );
            }
        });

        it('agrees with what each variant case recorded', () => {
            // Only variant cases: a base case may bring its own access policy
            // in the request (cases 10, 11 and 13), which is not a fixture.
            // Every variant case is checked against something its recording
            // says, and every declared variant is exercised by one.
            const exercised = new Set<string>();
            for (const [caseId, request] of Object.entries(requests)) {
                if (!request.fixtureVariant) continue;
                const fixtures = fixturesFor(request.fixtureVariant);
                const output = recordings[caseId]?.output;
                const artifacts = output?.resolution?.artifacts;
                if (!artifacts) {
                    // A case that records no resolution records why. The one
                    // such answer a fixture decides is a context with no
                    // access policy (case 17, no-access).
                    expect(output?.error?.code, caseId).toBe(
                        'NO_ACCESS_POLICY',
                    );
                    expect(fixtures.accessFixture, caseId).toBeNull();
                    exercised.add(request.fixtureVariant);
                    continue;
                }
                const expected = [
                    `scheme:${idOf(fixtures.schemeFixture, 'scheme')}`,
                    ...(fixtures.guideFixture
                        ? [`guide:${idOf(fixtures.guideFixture, 'guide')}`]
                        : []),
                    ...(fixtures.accessFixture
                        ? [`access:${idOf(fixtures.accessFixture, 'access')}`]
                        : []),
                ];
                expect(
                    artifacts
                        .filter((one) =>
                            ['scheme', 'guide', 'access'].includes(one.kind),
                        )
                        .map((one) => `${one.kind}:${one.id}`),
                    caseId,
                ).toEqual(expected);
                exercised.add(request.fixtureVariant);
            }
            expect([...exercised].sort()).toEqual(
                Object.keys(context.variants).sort(),
            );
        });
    });
});

describe('recordings', () => {
    it('parse as JSON and carry entries', () => {
        const files = listJson('recordings/v1');
        expect(files.length).toBeGreaterThan(0);
        for (const name of files) {
            const parsed = readJson('recordings', 'v1', name);
            expect(parsed, name).toBeTypeOf('object');
        }
    });
});

describe('replayer contract vectors', () => {
    const corpus = readJson('replayer-contract', 'v1', 'corpus.json') as {
        cases: Array<{
            id: string;
            expectedStatus: number;
            expectedMissEnvelope?: { bodyHash: string; path: string };
            replayerRecordings: Record<string, unknown>;
            request: { body: unknown; path: string; rawBody?: string };
        }>;
    };
    const cases = new Map(corpus.cases.map((entry) => [entry.id, entry]));
    const sha256 = (value: string) =>
        createHash('sha256').update(value).digest('hex');

    it('sends noncanonical JSON bytes for the object-key-order hit', () => {
        const entry = cases.get('arg-order');
        expect(entry).toBeDefined();
        const request = entry!.request;
        const canonical = '{"input":"MED","schemeId":"ref-scheme-1"}';
        expect(request.rawBody).toBe(
            '{"schemeId":"ref-scheme-1","input":"MED"}',
        );
        expect(JSON.parse(request.rawBody!)).toEqual(request.body);
        expect(request.rawBody).not.toBe(canonical);
        const recordingKey = sha256(`${request.path}|${canonical}`);
        expect(Object.keys(entry!.replayerRecordings)).toEqual([recordingKey]);
        expect(sha256(`${request.path}|${request.rawBody}`)).not.toBe(
            recordingKey,
        );
        expect(entry!.expectedStatus).toBe(200);
    });

    it('pins array order and path case as independent misses', () => {
        const arrayHit = cases.get('array-order-hit');
        const arrayMiss = cases.get('array-order-miss');
        const pathMiss = cases.get('path-case-miss');
        expect(arrayHit).toBeDefined();
        expect(arrayMiss).toBeDefined();
        expect(pathMiss).toBeDefined();

        const arrayKey = sha256(
            '/api/scheme/process|{"inputs":["HIGH","MED"]}',
        );
        expect(arrayHit!.request.body).toEqual({ inputs: ['HIGH', 'MED'] });
        expect(arrayHit!.expectedStatus).toBe(200);
        expect(Object.keys(arrayHit!.replayerRecordings)).toEqual([arrayKey]);
        expect(arrayMiss!.request.body).toEqual({ inputs: ['MED', 'HIGH'] });
        expect(arrayMiss!.expectedStatus).toBe(404);
        expect(Object.keys(arrayMiss!.replayerRecordings)).toEqual([arrayKey]);
        expect(arrayMiss!.expectedMissEnvelope).toEqual(
            expect.objectContaining({
                bodyHash: sha256('{"inputs":["MED","HIGH"]}'),
                path: '/api/scheme/process',
            }),
        );

        const canonicalKey = sha256('/api/scheme/process|{"input":"HIGH"}');
        expect(pathMiss!.request.path).toBe('/api/scheme/PROCESS');
        expect(pathMiss!.request.body).toEqual({ input: 'HIGH' });
        expect(pathMiss!.expectedStatus).toBe(404);
        expect(Object.keys(pathMiss!.replayerRecordings)).toEqual([
            canonicalKey,
        ]);
        expect(pathMiss!.expectedMissEnvelope).toEqual(
            expect.objectContaining({
                bodyHash: sha256('{"input":"HIGH"}'),
                path: '/api/scheme/PROCESS',
            }),
        );
    });
});
