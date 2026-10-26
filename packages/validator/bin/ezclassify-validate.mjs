#!/usr/bin/env node
/**
 * `ezclassify-validate`: schema-only validation for EzClassify documents.
 *
 * Exit codes: 0 when every document validated, 1 when any failed, 2 on a usage
 * error. Nothing here evaluates a scheme; see the package docs for what that
 * distinction means.
 *
 * @module
 */
import process from 'node:process';
import { SCHEMAS, validateTargets } from '../src/index.mjs';

const USAGE = `ezclassify-validate: validate EzClassify documents against their published JSON Schemas

Usage:
  ezclassify-validate <file-or-directory>... [options]

Options:
  --kind <${Object.keys(SCHEMAS).join('|')}>   validate every target as this kind
  --quiet                             print failures only
  -h, --help                          show this help

Directories are walked recursively. Files with no recognized document envelope
are skipped when walking a directory and reported when named directly.
Malformed YAML or JSON files in a walked directory fail validation.

This checks document shape only. It does not load a scheme, resolve layers, or
evaluate rules. That requires an EzClassify runtime.`;

function parseArgs(argv) {
    const targets = [];
    let kind;
    let quiet = false;
    for (let index = 0; index < argv.length; index += 1) {
        const arg = argv[index];
        if (arg === '-h' || arg === '--help') return { help: true };
        if (arg === '--quiet') {
            quiet = true;
        } else if (arg === '--kind') {
            kind = argv[(index += 1)];
            if (!kind || !Object.hasOwn(SCHEMAS, kind)) {
                return {
                    error: `--kind must be one of ${Object.keys(SCHEMAS).join(', ')}`,
                };
            }
        } else if (arg.startsWith('-')) {
            return { error: `unknown option '${arg}'` };
        } else {
            targets.push(arg);
        }
    }
    if (targets.length === 0) return { error: 'no files or directories given' };
    return { targets, kind, quiet };
}

const args = parseArgs(process.argv.slice(2));

if (args.help) {
    process.stdout.write(`${USAGE}\n`);
    process.exit(0);
}
if (args.error) {
    process.stderr.write(`ezclassify-validate: ${args.error}\n\n${USAGE}\n`);
    process.exit(2);
}

let results;
try {
    results = validateTargets(args.targets, { kind: args.kind });
} catch (error) {
    process.stderr.write(`ezclassify-validate: ${error.message}\n`);
    process.exit(2);
}

function writeEntries(label, entries) {
    for (const entry of entries ?? []) {
        process.stdout.write(
            `        ${label}${entry.path || '/'}: ${entry.message}\n`,
        );
    }
}

let failed = 0;
for (const result of results) {
    if (result.ok) {
        if (!args.quiet) {
            process.stdout.write(`ok    ${result.file} (${result.kind})\n`);
        }
        // A warning is printed even under --quiet, because the point of the
        // flag is to hide documents that had nothing to say.
        writeEntries('warning ', result.warnings);
        continue;
    }
    failed += 1;
    process.stdout.write(
        `FAIL  ${result.file}${result.kind ? ` (${result.kind})` : ''}\n`,
    );
    writeEntries('', result.errors);
    writeEntries('warning ', result.warnings);
}

if (results.length === 0) {
    process.stderr.write('ezclassify-validate: no documents found\n');
    process.exit(1);
}

process.stdout.write(
    `\n${results.length - failed}/${results.length} document${
        results.length === 1 ? '' : 's'
    } valid\n`,
);
process.exit(failed > 0 ? 1 : 0);
