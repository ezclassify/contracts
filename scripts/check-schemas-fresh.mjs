#!/usr/bin/env node
/**
 * Verify the generated JSON-schema dist matches the current type sources.
 *
 * Generates into a temporary directory and compares the complete file set and
 * bytes with libs/schemas/generated. The check never writes into the checkout;
 * npm run bundle remains the explicit writer when snapshots need updating.
 *
 * Run by `npm run check:schemas` and by libs/schemas' verify:publish-ready.
 *
 * @module
 */
import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { compareGeneratedSchemas } from './compare-generated-schemas.mjs';

const repoRoot = path.resolve(
    path.dirname(fileURLToPath(import.meta.url)),
    '..',
);
const temporaryRoot = mkdtempSync(path.join(tmpdir(), 'ezc-schemas-check-'));
try {
    execFileSync(
        process.execPath,
        ['libs/schemas/build.mjs', `--output-root=${temporaryRoot}`],
        { cwd: repoRoot, stdio: 'pipe' },
    );
    const drift = compareGeneratedSchemas(
        path.join(repoRoot, 'libs/schemas/generated'),
        temporaryRoot,
    );
    if (drift.length > 0) {
        console.error(
            'check:schemas FAILED: generated schema contracts were stale:',
        );
        for (const file of drift) console.error(`  ${file}`);
        console.error(
            'Run npm run bundle, then review and commit the changes.',
        );
        process.exitCode = 1;
    } else {
        console.log(
            'check:schemas passed: generated schema contracts match the type sources.',
        );
    }
} finally {
    rmSync(temporaryRoot, { recursive: true, force: true });
}
