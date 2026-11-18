import { fileURLToPath } from 'node:url';
import * as path from 'path';
import { defineConfig } from 'vitest/config';

/**
 * `@ezclassify/types` is types plus a small set of pure runtime helpers, so
 * tests resolve it from source rather than from a build. Every other package
 * here is data or plain ESM and needs no alias.
 */
export default defineConfig({
    resolve: {
        alias: {
            '@ezclassify/types': path.resolve(
                import.meta.dirname,
                'libs/types/src/index.ts',
            ),
        },
    },
    test: {
        setupFiles: [
            fileURLToPath(
                new URL(
                    './test-support/fail-on-console-error.mjs',
                    import.meta.url,
                ),
            ),
        ],
        environment: 'node',
        include: [
            'libs/**/tests/**/*.spec.ts',
            'packages/**/tests/**/*.spec.ts',
            'scripts/tests/**/*.spec.ts',
        ],
    },
});
