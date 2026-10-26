#!/usr/bin/env node
/**
 * Produces the language-neutral spec bundle for @ezclassify/schemas.
 *
 * Run from the repository root: node libs/schemas/build.mjs
 *
 * Outputs:
 *
 * - Libs/schemas/generated/json-schemas/<type>.schema.json: one per engine result
 *   type a REST client receives; the REST SDKs generate their result types from
 *   this set
 * - Libs/schemas/generated/json-schemas-test/<type>.schema.json: the scheme test
 *   runner's output contract (a saved suite run and the operation results its
 *   expectations are checked against)
 * - Libs/schemas/generated/json-schemas-input/*.schema.json: the authoring input
 *   contracts (scheme/guide/access/crosswalk/context/test suite)
 * - Libs/schemas/generated/validation/v1/*.schema.json: published document
 *   validation views, derived with schema-only constraints and stable names
 *
 * Responses are open and requests are closed. The output schemas describe what
 * an engine answers, and an answer may gain fields, so they are generated open:
 * a consumer that validates a response with one keeps working the day a field
 * is added. `TestOperationResults` is the exception. It is the contract a
 * suite's expectations are checked against, which makes it authored input, and
 * it stays closed so an expectation cannot name a field no result has. The
 * input schemas are closed throughout.
 *
 * Do NOT hand-edit generated/: edit the source types in @ezclassify/types or
 * the schema-only refinements in validation-schema.mjs and re-run.
 *
 * @module
 */
import { execSync } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';
import { createGeneratedJsonWriter } from './generated-json-writer.mjs';
import { validationSchema } from './validation-schema.mjs';

const engineRoot = path.resolve(
    path.dirname(fileURLToPath(import.meta.url)),
    '../..',
);
const args = process.argv.slice(2);
if (
    args.length > 1 ||
    (args[0] && !args[0].startsWith('--output-root=')) ||
    args[0] === '--output-root='
) {
    throw new Error('Usage: node libs/schemas/build.mjs [--output-root=<dir>]');
}
const generatedRoot = args[0]
    ? path.resolve(args[0].slice('--output-root='.length))
    : path.join(engineRoot, 'libs/schemas/generated');
const outDir = path.join(generatedRoot, 'json-schemas');
fs.mkdirSync(outDir, { recursive: true });
const testOutDir = path.join(generatedRoot, 'json-schemas-test');
fs.mkdirSync(testOutDir, { recursive: true });
const writeGeneratedJson = await createGeneratedJsonWriter(
    path.join(
        engineRoot,
        'libs/schemas/generated/json-schemas/process-result.schema.json',
    ),
);

/**
 * @type {{
 *     type: string;
 *     path: string;
 *     closed?: boolean;
 *     test?: boolean;
 * }[]}
 */
const types = [
    {
        type: 'TestOperationResults',
        path: 'libs/types/src/test-suite.ts',
        closed: true,
        test: true,
    },
    { type: 'TestSuiteRun', path: 'libs/types/src/test-suite.ts', test: true },
    // libs/types/src/scheme.ts
    { type: 'ValidateResult', path: 'libs/types/src/scheme.ts' },
    { type: 'ProcessResult', path: 'libs/types/src/scheme.ts' },
    { type: 'AggregateResult', path: 'libs/types/src/scheme.ts' },
    { type: 'DiffResult', path: 'libs/types/src/scheme.ts' },
    { type: 'Assertion', path: 'libs/types/src/scheme.ts' },
    { type: 'ValidationError', path: 'libs/types/src/scheme.ts' },
    { type: 'Fix', path: 'libs/types/src/scheme.ts' },
    { type: 'Change', path: 'libs/types/src/scheme.ts' },
    { type: 'Warning', path: 'libs/types/src/scheme.ts' },
    { type: 'Suggestion', path: 'libs/types/src/scheme.ts' },
    { type: 'SuggestResult', path: 'libs/types/src/scheme.ts' },
    { type: 'TraceEntry', path: 'libs/types/src/scheme.ts' },
    { type: 'ExplanationTrace', path: 'libs/types/src/scheme.ts' },
    // libs/types/src/engine.ts
    { type: 'ScanResult', path: 'libs/types/src/engine.ts' },
    { type: 'ScanLimits', path: 'libs/types/src/engine.ts' },
    // libs/types/src/access.ts
    { type: 'AccessRuleResult', path: 'libs/types/src/access.ts' },
    { type: 'AccessDecision', path: 'libs/types/src/access.ts' },
    { type: 'CategoryAccessResult', path: 'libs/types/src/access.ts' },
    // libs/types/src/guide.ts
    { type: 'GuideBreakdownEntry', path: 'libs/types/src/guide.ts' },
    { type: 'EvaluationResult', path: 'libs/types/src/guide.ts' },
    { type: 'GuideScanSpan', path: 'libs/types/src/guide.ts' },
    { type: 'GuideScanResult', path: 'libs/types/src/guide.ts' },
    // libs/types/src/crosswalk.ts
    {
        type: 'CrosswalkTranslationResult',
        path: 'libs/types/src/crosswalk.ts',
    },
];

/** Convert PascalCase type name to kebab-case filename. */
function toKebab(name) {
    return name
        .replace(/([A-Z])/g, (m, c, i) =>
            i === 0 ? c.toLowerCase() : '-' + c.toLowerCase(),
        )
        .replace(/--+/g, '-');
}

let ok = 0;
let fail = 0;

for (const { type, path: srcPath, closed, test } of types) {
    const outFile = path.join(
        test ? testOutDir : outDir,
        `${toKebab(type)}.schema.json`,
    );

    const cmd = [
        'npx ts-json-schema-generator',
        `--path "${srcPath}"`,
        `--type "${type}"`,
        '--tsconfig tsconfig.base.json',
        '--no-top-ref',
        '--expose all',
        ...(closed ? [] : ['--additional-properties']),
    ].join(' ');

    try {
        const json = execSync(cmd, {
            cwd: engineRoot,
            encoding: 'utf8',
            stdio: ['pipe', 'pipe', 'pipe'],
        });
        await writeGeneratedJson(outFile, json);
        console.log(`✓ ${type} → ${path.relative(engineRoot, outFile)}`);
        ok++;
    } catch (err) {
        const msg = err.stderr ?? err.message ?? String(err);
        console.error(`✗ ${type}: ${msg.trim().split('\n')[0]}`);
        fail++;
    }
}

// Generate the *input-contract* schemas: what customers and Studio builders
// author against. TS types are the source of truth; the generated files are
// committed to generated/ so consumers can import them and the drift gate can diff.
const inputOutDir = path.join(generatedRoot, 'json-schemas-input');
fs.mkdirSync(inputOutDir, { recursive: true });
const validationOutDir = path.join(generatedRoot, 'validation/v1');
fs.mkdirSync(validationOutDir, { recursive: true });

const inputTypes = [
    {
        type: 'TestSuite',
        path: 'libs/types/src/test-suite.ts',
        file: 'test-suite.schema.json',
    },
    {
        type: 'SchemeDefinition',
        path: 'libs/types/src/scheme-definition.ts',
        file: 'scheme-definition.schema.json',
        validation: 'scheme',
    },
    {
        type: 'GuideDefinition',
        path: 'libs/types/src/guide-definition.ts',
        file: 'guide-definition.schema.json',
        validation: 'guide',
    },
    {
        type: 'AccessDefinition',
        path: 'libs/types/src/access-definition.ts',
        file: 'access-policy.schema.json',
        validation: 'access',
    },
    {
        type: 'ContextDefinition',
        path: 'libs/types/src/context-definition.ts',
        file: 'context-definition.schema.json',
    },
    {
        type: 'CrosswalkDefinition',
        path: 'libs/types/src/crosswalk.ts',
        file: 'crosswalk-definition.schema.json',
        validation: 'crosswalk',
    },
];

for (const { type, path: srcPath, file, validation } of inputTypes) {
    const outFile = path.join(inputOutDir, file);
    const cmd = [
        'npx ts-json-schema-generator',
        `--path "${srcPath}"`,
        `--type "${type}"`,
        '--tsconfig tsconfig.base.json',
        '--no-top-ref',
        '--expose all',
    ].join(' ');

    try {
        const json = execSync(cmd, {
            cwd: engineRoot,
            encoding: 'utf8',
            stdio: ['pipe', 'pipe', 'pipe'],
        });
        await writeGeneratedJson(outFile, json);
        if (validation) {
            const published = path.join(
                validationOutDir,
                `${validation}.schema.json`,
            );
            await writeGeneratedJson(
                published,
                JSON.stringify(validationSchema(validation, JSON.parse(json))),
            );
            console.log(
                `✓ ${type} validation view → ${path.relative(engineRoot, published)}`,
            );
        }
        console.log(`✓ ${type} → ${path.relative(engineRoot, outFile)}`);
        ok++;
    } catch (err) {
        const msg = err.stderr ?? err.message ?? String(err);
        console.error(`✗ ${type}: ${msg.trim().split('\n')[0]}`);
        fail++;
    }
}

console.log(`\nDone: ${ok} schemas generated, ${fail} failed`);
if (fail > 0) process.exit(1);
