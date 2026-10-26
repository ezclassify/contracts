#!/usr/bin/env node
/**
 * Guards that `package-lock.json` installs anywhere.
 *
 * A lockfile resolved through a developer's local registry records that
 * registry in every `resolved` URL, and an install anywhere else then reaches
 * for a host that is not there. `npm run deps:relock` runs this right after it
 * writes the lockfile, so a machine-local origin is refused before anyone
 * installs from it.
 *
 * Usage: node scripts/check-lockfile-portable.mjs [--lockfile=PATH]
 *
 * @module
 */
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const MACHINE_LOCAL_RESOLVED = /(^|\/\/)(localhost|127\.0\.0\.1)(:|\/)|:4873\b/;

function resolveLockfilePath() {
    const flag = process.argv
        .slice(2)
        .find((argument) => argument.startsWith('--lockfile='));
    return resolve(
        flag
            ? flag.slice('--lockfile='.length)
            : resolve(repositoryRoot, 'package-lock.json'),
    );
}

function main() {
    const lockfilePath = resolveLockfilePath();
    const lockfile = JSON.parse(readFileSync(lockfilePath, 'utf8'));
    const problems = [];
    for (const [path, entry] of Object.entries(lockfile.packages ?? {})) {
        if (
            typeof entry.resolved === 'string' &&
            MACHINE_LOCAL_RESOLVED.test(entry.resolved)
        ) {
            problems.push(`${path} -> ${entry.resolved}`);
        }
    }

    if (problems.length > 0) {
        console.error(
            `${lockfilePath} resolves from a machine-local registry; run \`npm run deps:relock\` against a public registry:`,
        );
        for (const problem of problems) console.error(`  ${problem}`);
        process.exitCode = 1;
        return;
    }

    console.log(`${lockfilePath} is portable: no machine-local URLs.`);
}

main();
