/**
 * Drift gate: fail if the committed openapi.yaml / openapi.json do not match
 * what emit-openapi would produce from the canonical route-decls + types.
 *
 * Non-destructive: builds the spec in memory and compares; never writes. Run
 * manually: npm run check:openapi
 *
 * Exit 0 = in sync. Exit 1 = drift (prints the fix command).
 *
 * @module
 */
import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildOpenApiSpec, specToYaml } from './emit-openapi.js';

/** Package root: the committed openapi.yaml / openapi.json sit beside src/. */
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

function compare(file: string, expected: string): boolean {
    const p = path.join(ROOT, file);
    const actual = fs.existsSync(p) ? fs.readFileSync(p, 'utf8') : '';
    if (actual === expected) {
        console.log(`  ✓ ${file} in sync`);
        return true;
    }
    console.error(`  ✗ ${file} is STALE (committed differs from generated)`);
    return false;
}

async function main(): Promise<void> {
    const spec = await buildOpenApiSpec();
    const yaml = specToYaml(spec);
    const json = JSON.stringify(spec, null, 2) + '\n';

    console.log('check:openapi, comparing committed spec to route-decls...');
    const okYaml = compare('openapi.yaml', yaml);
    const okJson = compare('openapi.json', json);

    if (okYaml && okJson) {
        console.log(
            'check:openapi: OK (spec matches the canonical route-decls).',
        );
        return;
    }
    console.error(
        '\ncheck:openapi: DRIFT. The OpenAPI spec no longer matches the route\n' +
            'declarations in libs/openapi/src/route-decls/ (or the TS types they\n' +
            'reference).\n' +
            'Regenerate and commit:\n' +
            '    npm run codegen\n' +
            'Then review the diff (added/removed routes or schema changes are real\n' +
            'API-contract changes) and commit the updated openapi.yaml + openapi.json.\n',
    );
    process.exit(1);
}

main().catch((err) => {
    console.error(err);
    process.exit(1);
});
