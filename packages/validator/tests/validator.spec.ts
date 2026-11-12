import { mkdtempSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
import { describe, expect, it } from 'vitest';
import yaml from 'js-yaml';
// @ts-expect-error -- the validator ships as plain ESM JavaScript, no types.
import {
    RULE_DIAGNOSTICS,
    detectKind,
    validateFile,
    validateTargets,
    // @ts-expect-error -- the validator ships as plain ESM JavaScript, no types.
} from '../src/index.mjs';
import { validateSchemeDocument } from '../src/scheme.mjs';

const repoRoot = path.resolve(
    path.dirname(fileURLToPath(import.meta.url)),
    '../../..',
);
const bin = path.join(
    repoRoot,
    'packages/validator/bin/ezclassify-validate.mjs',
);
const referenceScheme = path.join(
    repoRoot,
    'libs/conformance/fixtures/v1/ref-scheme-1.json',
);
const referenceAccess = path.join(
    repoRoot,
    'libs/conformance/fixtures/v1/ref-access-rules-1.json',
);
const referenceGuide = path.join(
    repoRoot,
    'libs/conformance/fixtures/v1/ref-guide-1.json',
);
const examplesDir = path.join(repoRoot, 'libs/types/examples');
const exampleAccess = path.join(examplesDir, 'access.yaml');
const exampleContext = path.join(examplesDir, 'context.yaml');
const exampleCrosswalk = path.join(examplesDir, 'crosswalk-layer.yaml');

function scratchFile(name: string, contents: string): string {
    const dir = mkdtempSync(path.join(tmpdir(), 'ezclassify-validator-'));
    const file = path.join(dir, name);
    writeFileSync(file, contents, 'utf8');
    return file;
}

function runBin(args: string[]): { status: number; output: string } {
    try {
        const output = execFileSync(process.execPath, [bin, ...args], {
            encoding: 'utf8',
        });
        return { status: 0, output };
    } catch (error) {
        const failure = error as { status: number; stdout: string };
        return { status: failure.status, output: failure.stdout ?? '' };
    }
}

describe('document kind detection', () => {
    it('reads the kind off the envelope key', () => {
        expect(detectKind({ scheme: {} })).toBe('scheme');
        expect(detectKind({ guide: {} })).toBe('guide');
        expect(detectKind({ access: {} })).toBe('access');
        expect(detectKind({ context: {} })).toBe('context');
        expect(detectKind({ crosswalk: {} })).toBe('crosswalk');
    });

    it('returns undefined for anything else', () => {
        expect(detectKind({ nonsense: {} })).toBeUndefined();
        expect(detectKind(null)).toBeUndefined();
    });

    it('does not treat an inherited name as a kind', () => {
        // Detection reads own properties. A document whose only key is a name
        // that also exists on Object.prototype is not one of ours, and the
        // lookup behind such a name would not be a schema.
        expect(detectKind({ toString: {} })).toBeUndefined();
        expect(detectKind({ constructor: {} })).toBeUndefined();
    });
});

describe('validateFile', () => {
    it('accepts the reference access fixture', () => {
        const result = validateFile(referenceAccess);
        expect(result.errors).toEqual([]);
        expect(result.ok).toBe(true);
        expect(result.kind).toBe('access');
    });

    it('accepts a YAML access policy', () => {
        const result = validateFile(exampleAccess);
        expect(result.errors).toEqual([]);
        expect(result.ok).toBe(true);
    });

    it('accepts a YAML context document', () => {
        const result = validateFile(exampleContext);
        expect(result.errors).toEqual([]);
        expect(result.ok).toBe(true);
        expect(result.kind).toBe('context');
    });

    it('accepts a YAML crosswalk document', () => {
        // Crosswalk now has a hand-authored v1 schema like its four siblings,
        // wired in as SCHEMAS.crosswalk. It requires the `crosswalk:` envelope,
        // which is what makes the kind detectable in the first place.
        const result = validateFile(exampleCrosswalk);
        expect(result.errors).toEqual([]);
        expect(result.ok).toBe(true);
        expect(result.kind).toBe('crosswalk');
    });

    it('rejects a scheme missing required fields, and says which', () => {
        const file = scratchFile(
            'broken.yaml',
            'scheme:\n  id: missing-almost-everything\n',
        );
        const result = validateFile(file);
        expect(result.ok).toBe(false);
        expect(result.kind).toBe('scheme');
        expect(result.errors.length).toBeGreaterThan(0);
        expect(JSON.stringify(result.errors)).toContain('version');
    });

    it('reports a parse failure instead of throwing', () => {
        const file = scratchFile('bad.json', '{ not json');
        const result = validateFile(file);
        expect(result.ok).toBe(false);
        expect(result.errors[0].message).toContain('could not parse');
    });

    it('reports a validator that cannot be built instead of throwing', () => {
        // An explicit kind with no schema behind it is this file's problem, not
        // the run's, so the caller gets a result rather than an exception.
        const result = validateFile(referenceAccess, 'toString');
        expect(result.ok).toBe(false);
        expect(result.kind).toBeUndefined();
        expect(result.errors[0].message).toContain('could not validate');
    });

    it('reports a document with no recognized envelope', () => {
        const file = scratchFile('unknown.yaml', 'something: else\n');
        const result = validateFile(file);
        expect(result.ok).toBe(false);
        expect(result.errors[0].message).toContain(
            'not an EzClassify document',
        );
    });
});

describe('the guide envelope', () => {
    /**
     * `GuideDefinition` is the `guide:` envelope the other document families
     * have, and every guide document carries it.
     *
     * The assertions below are positive on purpose: kind detection reads the
     * envelope key, so a guide that loses its wrapper becomes an undetectable
     * document, and these turn red rather than silently skipping.
     */
    it('detects and accepts the reference guide fixture', () => {
        const result = validateFile(referenceGuide);
        expect(result.kind).toBe('guide');
        expect(result.errors).toEqual([]);
        expect(result.ok).toBe(true);
    });
});

describe('the reference scheme fixture', () => {
    /**
     * Category `rollup` fields already carry the fixture's max/union behavior.
     * The obsolete duplicate `rollup_pipelines` entries used an unsupported
     * shape, so the canonical fixture now validates without changing its
     * effective aggregation semantics.
     */
    it('accepts the reference scheme fixture', () => {
        const result = validateFile(referenceScheme);
        expect(result.kind).toBe('scheme');
        expect(result.errors).toEqual([]);
        expect(result.ok).toBe(true);
    });

    const conceptImport = (snapshotId?: string) => ({
        id: 'upstream-concepts',
        attribution: { name: 'Upstream concepts', license: 'CC0-1.0' },
        records: [{ id: 'ALPHA', label: 'Alpha', view: 'A' }],
        ...(snapshotId === undefined ? {} : { snapshot_id: snapshotId }),
        mapping: {
            concept: {
                id: 'id',
                name: 'label',
                categories: ["'level'"],
                views: { default: 'view' },
            },
        },
    });

    // The sha256 of the records' RFC 8785 canonical JSON. The validator checks
    // the pin's form; the engine checks that the records hash to it.
    const recordsDigest =
        'sha256:24106ef26981a8b0f28444f9fd63b41e79836211c50828d2f2ca7aa26fed0498';

    it.each([undefined, recordsDigest])(
        'accepts a concept import with snapshot %s',
        (snapshotId) => {
            const document = JSON.parse(readFileSync(referenceScheme, 'utf8'));
            document.scheme.data.concept_imports = [conceptImport(snapshotId)];
            const file = scratchFile(
                'concept-import.json',
                JSON.stringify(document),
            );
            const result = validateFile(file);
            expect(result.errors).toEqual([]);
            expect(result.ok).toBe(true);
        },
    );

    it('refuses a concept import whose snapshot pin is a label', () => {
        const document = JSON.parse(readFileSync(referenceScheme, 'utf8'));
        document.scheme.data.concept_imports = [
            conceptImport('upstream-concepts-v1'),
        ];
        const result = validateFile(
            scratchFile('labeled-pin.yaml', yaml.dump(document)),
        );
        expect(result.ok).toBe(false);
        expect(result.errors).toContainEqual(
            expect.objectContaining({
                keyword: 'pattern',
                path: '/scheme/data/concept_imports/0/snapshot_id',
            }),
        );
    });

    it('refuses a concept import that names a remote source', () => {
        const document = JSON.parse(readFileSync(referenceScheme, 'utf8'));
        document.scheme.data.concept_imports = [
            { ...conceptImport(), source: 'https://upstream.example.com' },
        ];
        const result = validateFile(
            scratchFile('remote-import.yaml', yaml.dump(document)),
        );
        expect(result.ok).toBe(false);
        expect(result.errors).toContainEqual(
            expect.objectContaining({
                keyword: 'additionalProperties',
                path: '/scheme/data/concept_imports/0',
            }),
        );
    });
});

describe('rollup pipeline steps', () => {
    function schemeFileWithSteps(steps: unknown[]): string {
        const document = JSON.parse(readFileSync(referenceScheme, 'utf8'));
        document.scheme.rollup_pipelines = [
            { id: 'controls', categories: ['controls'], steps },
        ];
        return scratchFile('scheme-with-pipeline.yaml', yaml.dump(document));
    }

    it('accepts each action a step can take', () => {
        const file = schemeFileWithSteps([
            {
                then: {
                    intersect: [
                        {
                            categories: ['controls', 'level'],
                            empty_fallback: 'CTRL-A',
                            fallback_if_only: ['LOW'],
                        },
                        { category: 'controls', empty_fallback: 'CTRL-A' },
                    ],
                    clear_categories: ['controls'],
                },
            },
            {
                then: {
                    move: {
                        from: 'controls',
                        to: 'level',
                        exclude: ['CTRL-A'],
                        keep_intersection: true,
                    },
                    add: [{ concept: 'CTRL-A', category: 'controls' }],
                },
            },
            { then: { keep: ['CTRL-A'], remove: ['LOW'] } },
            { then: { union: true } },
        ]);
        const result = validateFile(file);
        expect(result.errors).toEqual([]);
        expect(result.ok).toBe(true);
    });

    it.each([
        ['neither category nor categories', { empty_fallback: 'CTRL-A' }],
        [
            'both category and categories',
            { category: 'controls', categories: ['controls'] },
        ],
    ])('refuses an intersection that names %s', (_label, intersect) => {
        const result = validateFile(
            schemeFileWithSteps([{ then: { intersect } }]),
        );
        expect(result.ok).toBe(false);
        expect(result.errors).toContainEqual(
            expect.objectContaining({ keyword: 'oneOf' }),
        );
    });

    it('refuses an action a step cannot take', () => {
        const result = validateFile(
            schemeFileWithSteps([{ then: { shuffle: true } }]),
        );
        expect(result.ok).toBe(false);
    });
});

describe('the rule actions that say what a category may hold', () => {
    /**
     * The reference scheme with these rules, written as an authored YAML file
     * and validated the way an author runs the validator.
     */
    function schemeFileWithRules(rules: unknown[]): string {
        const document = JSON.parse(readFileSync(referenceScheme, 'utf8'));
        document.scheme.rules = rules;
        return scratchFile('scheme-with-rules.yaml', yaml.dump(document));
    }

    const restrictControls = {
        id: 'high-limits-controls',
        when: 'HIGH',
        action: 'restrict',
        category: 'controls',
        target: ['CTRL-A'],
    };
    const requireAnyLevel = {
        id: 'controls-need-a-level',
        when: 'CTRL-A',
        action: 'require_any',
        target: ['MED', 'HIGH'],
    };

    it('accepts a restrict rule that names the category it restricts', () => {
        const result = validateFile(schemeFileWithRules([restrictControls]));
        expect(result.errors).toEqual([]);
        expect(result.ok).toBe(true);
    });

    it('accepts require_any with and without a category', () => {
        const result = validateFile(
            schemeFileWithRules([
                requireAnyLevel,
                {
                    ...requireAnyLevel,
                    id: 'controls-need-a-level-in-level',
                    category: 'level',
                },
            ]),
        );
        expect(result.errors).toEqual([]);
        expect(result.ok).toBe(true);
    });

    it('refuses a restrict rule with no category and names require_any', () => {
        const { category: _dropped, ...withoutCategory } = restrictControls;
        const result = validateFile(
            schemeFileWithRules([requireAnyLevel, withoutCategory]),
        );
        expect(result.ok).toBe(false);
        expect(result.errors).toEqual([
            {
                id: RULE_DIAGNOSTICS.RESTRICT_WITHOUT_CATEGORY,
                path: '/scheme/rules/1',
                message:
                    'rule `high-limits-controls` uses `restrict` without a `category`. A `restrict` rule limits one category to its targets, so it must name that category. To require at least one of the targets instead, use `action: require_any`.',
            },
        ]);
    });

    it('refuses a restrict rule whose category is empty', () => {
        const result = validateFile(
            schemeFileWithRules([{ ...restrictControls, category: '' }]),
        );
        expect(result.ok).toBe(false);
        expect(result.errors.map((error: { id?: string }) => error.id)).toEqual(
            [RULE_DIAGNOSTICS.RESTRICT_WITHOUT_CATEGORY],
        );
    });

    it('reports the missing category through the bin', () => {
        const { category: _dropped, ...withoutCategory } = restrictControls;
        const { status, output } = runBin([
            schemeFileWithRules([withoutCategory]),
        ]);
        expect(status).toBe(1);
        expect(output).toContain('action: require_any');
    });
});

describe('values and keys the scheme contract does not declare', () => {
    /**
     * Every value a scheme can author changes what the engine does, so the
     * contract lists them exhaustively and refuses anything else. A rollup
     * operator, rule action or field the engine would accept and then ignore
     * would let an author ship a marking rule that silently does nothing.
     */
    function referenceDocument(): any {
        return JSON.parse(readFileSync(referenceScheme, 'utf8'));
    }

    it('accepts the reference scheme the cases below each change once', () => {
        expect(validateSchemeDocument(referenceDocument())).toMatchObject({
            ok: true,
            errors: [],
        });
    });

    it('refuses a rollup operator the contract does not list', () => {
        const document = referenceDocument();
        document.scheme.data.categories[0].rollup = 'unlisted_operator';
        const result = validateSchemeDocument(document);
        expect(result.ok).toBe(false);
        expect(result.errors).toEqual([
            expect.objectContaining({
                keyword: 'enum',
                path: '/scheme/data/categories/0/rollup',
            }),
        ]);
    });

    it('refuses a rule action the contract does not list', () => {
        const document = referenceDocument();
        document.scheme.rules = [
            {
                id: 'r1',
                when: 'HIGH',
                action: 'unlisted_action',
                category: 'controls',
            },
        ];
        const result = validateSchemeDocument(document);
        expect(result.ok).toBe(false);
        expect(result.errors).toEqual([
            expect.objectContaining({
                keyword: 'enum',
                path: '/scheme/rules/0/action',
            }),
        ]);
    });

    it('refuses a rule key the contract does not declare', () => {
        const document = referenceDocument();
        document.scheme.rules = [
            {
                id: 'r1',
                when: 'HIGH',
                action: 'copy',
                from: 'level',
                to: 'controls',
                unlisted_key: 'x',
            },
        ];
        const result = validateSchemeDocument(document);
        expect(result.ok).toBe(false);
        expect(result.errors).toEqual([
            expect.objectContaining({
                keyword: 'additionalProperties',
                path: '/scheme/rules/0',
                params: { additionalProperty: 'unlisted_key' },
            }),
        ]);
    });

    it('refuses a data block key the contract does not declare', () => {
        const document = referenceDocument();
        document.scheme.data.unlisted_key = [];
        const result = validateSchemeDocument(document);
        expect(result.ok).toBe(false);
        expect(result.errors).toEqual([
            expect.objectContaining({
                keyword: 'additionalProperties',
                path: '/scheme/data',
                params: { additionalProperty: 'unlisted_key' },
            }),
        ]);
    });

    it('refuses a concept key the contract does not declare', () => {
        const document = referenceDocument();
        document.scheme.data.concepts[0].unlisted_key = 'x';
        const result = validateSchemeDocument(document);
        expect(result.ok).toBe(false);
        expect(result.errors).toEqual([
            expect.objectContaining({
                keyword: 'additionalProperties',
                path: '/scheme/data/concepts/0',
                params: { additionalProperty: 'unlisted_key' },
            }),
        ]);
    });
});

describe('rule ids the engine keeps for itself', () => {
    function schemeFileWithRules(rules: unknown[]): string {
        const document = JSON.parse(readFileSync(referenceScheme, 'utf8'));
        document.scheme.rules = rules;
        return scratchFile(
            'scheme-with-reserved-rule.yaml',
            yaml.dump(document),
        );
    }

    const controlsNeedALevel = {
        id: 'controls-need-a-level',
        when: 'CTRL-A',
        action: 'require_any',
        target: ['MED', 'HIGH'],
    };

    it('accepts an id that starts with a letter or digit, underscores inside and all', () => {
        const result = validateFile(
            schemeFileWithRules([
                controlsNeedALevel,
                { ...controlsNeedALevel, id: 'controls_need_a_level_2' },
                { ...controlsNeedALevel, id: '2nd-controls-rule' },
            ]),
        );
        expect(result.errors).toEqual([]);
        expect(result.ok).toBe(true);
    });

    it('refuses an id that begins with an underscore and says why', () => {
        const result = validateFile(
            schemeFileWithRules([
                controlsNeedALevel,
                { ...controlsNeedALevel, id: '_controls-need-a-level' },
            ]),
        );
        expect(result.ok).toBe(false);
        // The schema refuses the shape; the diagnostic says why and what to do.
        expect(result.errors).toEqual([
            {
                keyword: 'pattern',
                message: 'must match pattern "^[^_]"',
                params: { pattern: '^[^_]' },
                path: '/scheme/rules/1/id',
            },
            {
                id: RULE_DIAGNOSTICS.RESERVED_ID,
                path: '/scheme/rules/1',
                message:
                    "rule `_controls-need-a-level` has an id that begins with `_`, which is reserved for the engine's own ids, the ones it reports its own errors under as `constraintId` and writes as `sourceRule` on assertions its structure added. Rename the rule so its id does not begin with `_`.",
            },
        ]);
    });

    it('reports the reserved id through the bin', () => {
        const { status, output } = runBin([
            schemeFileWithRules([{ ...controlsNeedALevel, id: '_reserved' }]),
        ]);
        expect(status).toBe(1);
        expect(output).toContain("reserved for the engine's own ids");
    });
});

describe('every file in libs/types/examples validates against the shipped validator', () => {
    // The example directory is what a community author is pointed at first, so
    // a document that fails our own shipped validator can never ship. There is
    // no allowlist: every example passes, and this asserts it plainly.
    const files = readdirSync(examplesDir).filter((name: string) =>
        /\.(ya?ml|json)$/.test(name),
    );

    it('the example directory is not empty', () => {
        expect(files.length).toBeGreaterThan(0);
    });

    for (const name of files) {
        it(name, () => {
            const result = validateFile(path.join(examplesDir, name));
            expect(result.errors).toEqual([]);
            expect(result.ok).toBe(true);
        });
    }
});

describe('validateTargets', () => {
    it('skips unrelated files when walking a directory', () => {
        const file = scratchFile('scheme.yaml', 'scheme:\n  id: x\n');
        const dir = path.dirname(file);
        writeFileSync(path.join(dir, 'notes.yaml'), 'hello: world\n', 'utf8');
        const results = validateTargets([dir]);
        expect(results).toHaveLength(1);
        expect(results[0].file).toBe(file);
    });

    it('reports malformed candidate files during a directory walk', () => {
        const good = scratchFile(
            'good.json',
            readFileSync(referenceAccess, 'utf8'),
        );
        const dir = path.dirname(good);
        const bad = path.join(dir, 'bad.yaml');
        writeFileSync(bad, 'scheme: [\n', 'utf8');
        writeFileSync(path.join(dir, 'notes.yaml'), 'hello: world\n', 'utf8');

        const results = validateTargets([dir]);
        expect(results.map((result: { file: string }) => result.file)).toEqual([
            bad,
            good,
        ]);
        expect(results[0].ok).toBe(false);
        expect(results[0].errors[0].message).toContain('could not parse');
        expect(results[1].ok).toBe(true);
        expect(validateTargets([bad])[0].ok).toBe(false);
    });

    it('reports an unreadable target and still answers for the others', () => {
        // One mistyped path used to end the whole run. Every target named on
        // the command line now gets its own result.
        const missing = path.join(
            path.dirname(scratchFile('anchor.yaml', 'scheme:\n  id: x\n')),
            'missing.yaml',
        );
        const results = validateTargets([referenceAccess, missing]);
        expect(results).toHaveLength(2);
        expect(results[0].ok).toBe(true);
        expect(results[0].file).toBe(referenceAccess);
        expect(results[1].ok).toBe(false);
        expect(results[1].file).toBe(missing);
        expect(results[1].kind).toBeUndefined();
        expect(results[1].errors[0].message).toContain('could not read');
    });
});

describe('ezclassify-validate bin', () => {
    it('exits 1 when a directory contains a malformed candidate', () => {
        const good = scratchFile(
            'good.json',
            readFileSync(referenceAccess, 'utf8'),
        );
        const dir = path.dirname(good);
        const bad = path.join(dir, 'bad.yaml');
        writeFileSync(bad, 'scheme: [\n', 'utf8');
        writeFileSync(path.join(dir, 'notes.yaml'), 'hello: world\n', 'utf8');

        const walked = runBin([dir]);
        expect(walked.status).toBe(1);
        expect(walked.output).toContain(`FAIL  ${bad}`);
        expect(walked.output).toContain('1/2 documents valid');
        expect(runBin([bad]).status).toBe(1);
        expect(runBin([dir, '--kind', 'access']).status).toBe(1);
    });

    it('exits 0 and reports the kind on a valid document', () => {
        const { status, output } = runBin([referenceAccess]);
        expect(output).toContain('(access)');
        expect(output).toContain('1/1 document valid');
        expect(status).toBe(0);
    });

    it('exits 1 and prints the failing pointer on an invalid document', () => {
        const file = scratchFile('broken.yaml', 'scheme:\n  id: nope\n');
        const { status, output } = runBin([file]);
        expect(output).toContain('FAIL');
        expect(status).toBe(1);
    });

    it('exits 2 on a usage error', () => {
        expect(runBin([]).status).toBe(2);
        expect(runBin([referenceAccess, '--kind', 'nope']).status).toBe(2);
    });

    it('rejects a --kind that is only an inherited name', () => {
        // The option is checked against the schema table's own keys, so a name
        // carried by Object.prototype is a usage error like any other.
        expect(runBin([referenceAccess, '--kind', 'toString']).status).toBe(2);
    });

    it('exits 1, not 2, when one of several targets cannot be read', () => {
        // A bad path is a validation failure, not a usage error, and the good
        // target still gets reported.
        const missing = path.join(
            path.dirname(scratchFile('anchor.yaml', 'scheme:\n  id: x\n')),
            'missing.yaml',
        );
        const { status, output } = runBin([referenceAccess, missing]);
        expect(output).toContain('(access)');
        expect(output).toContain('could not read');
        expect(output).toContain('1/2 documents valid');
        expect(status).toBe(1);
    });
});

describe('the count operators', () => {
    const operators = [
        'count_gt',
        'count_gte',
        'count_eq',
        'count_lt',
        'count_lte',
    ];

    function schemeWithCount(operator: string): string {
        const document = JSON.parse(readFileSync(referenceScheme, 'utf8'));
        document.scheme.rules = [
            {
                id: 'counted',
                when: { category: 'controls', operator, value: 1 },
                action: 'restrict',
                category: 'controls',
                target: ['CTRL-A'],
            },
        ];
        return scratchFile('scheme-count.yaml', yaml.dump(document));
    }

    function guideWithCount(operator: string): string {
        const document = JSON.parse(readFileSync(referenceGuide, 'utf8'));
        document.guide.rules[0].when = { all: [{ operator, value: 1 }] };
        return scratchFile('guide-count.yaml', yaml.dump(document));
    }

    it.each(operators)('a scheme condition accepts %s', (operator) => {
        const result = validateFile(schemeWithCount(operator));
        expect(result.errors).toEqual([]);
        expect(result.ok).toBe(true);
    });

    it.each(operators)('a guide when accepts %s', (operator) => {
        const result = validateFile(guideWithCount(operator));
        expect(result.errors).toEqual([]);
        expect(result.ok).toBe(true);
    });

    it('a scheme condition refuses an operator outside the five', () => {
        expect(validateFile(schemeWithCount('count_ne')).ok).toBe(false);
    });

    it('a guide when refuses an operator outside the five', () => {
        expect(validateFile(guideWithCount('count_ne')).ok).toBe(false);
    });
});
