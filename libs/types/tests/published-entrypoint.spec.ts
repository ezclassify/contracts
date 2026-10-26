import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { beforeAll, describe, expect, it } from 'vitest';

/**
 * Every other vitest spec in this repository reads `@ezclassify/types` from
 * source, because the vitest alias points at `src/index.ts`. That leaves the
 * artifact consumers actually install untested, and it is a real gap. This
 * package is `type: module` on Node, so a single relative specifier emitted
 * without its `.js` extension makes `dist/index.js` unloadable while every
 * source-level check stays green.
 *
 * So this builds the package and loads the result the way npm publishes it: the
 * path `package.json` advertises, imported from a real Node process. Both
 * halves are the point. The build is what makes the check answer for the
 * current source instead of whatever was left in `dist`, and the child process
 * is what makes it answer for Node's resolver instead of Vite's, which forgives
 * exactly the specifier shapes Node rejects.
 */

const require = createRequire(import.meta.url);
const typesRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const manifest = require(resolve(typesRoot, 'package.json')) as {
    exports: Record<string, { import: string }>;
};

const entrypoint = resolve(typesRoot, manifest.exports['.'].import);

/**
 * Load the entry point in a plain Node process and report what it exposes.
 * Anything the module system refuses comes back as a failure string rather than
 * an exception, so the assertion below shows the loader's own message.
 */
function loadInNode(): string {
    const probe = `
        import { pathToFileURL } from 'node:url';
        const mod = await import(pathToFileURL(${JSON.stringify(entrypoint)}).href);
        const guard = mod.isContextAdapter;
        console.log(JSON.stringify({
            guardIsFunction: typeof guard === 'function',
            recognizesContext: guard({ connected: true, scheme: {}, audit: () => ({}) }),
            rejectsBareScheme: guard({ connected: true }),
        }));
    `;
    const run = spawnSync(
        process.execPath,
        ['--input-type=module', '-e', probe],
        {
            cwd: typesRoot,
            encoding: 'utf8',
        },
    );
    return run.status === 0 ? run.stdout.trim() : `${run.stdout}${run.stderr}`;
}

beforeAll(() => {
    const built = spawnSync(
        process.execPath,
        [require.resolve('typescript/bin/tsc'), '-p', 'tsconfig.build.json'],
        { cwd: typesRoot, encoding: 'utf8' },
    );
    if (built.status !== 0) {
        throw new Error(
            `Unable to build @ezclassify/types for the entry-point check:\n${built.stdout}${built.stderr}`,
        );
    }
});

describe('the published entry point', () => {
    it('loads as ESM from the path package.json advertises, and its guard works', () => {
        expect(loadInNode()).toBe(
            JSON.stringify({
                guardIsFunction: true,
                recognizesContext: true,
                rejectsBareScheme: false,
            }),
        );
    });
});
