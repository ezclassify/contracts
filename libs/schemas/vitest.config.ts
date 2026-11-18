import { fileURLToPath } from 'node:url';
import { defineConfig, mergeConfig } from 'vitest/config';
import buildConfig from './vite.config';

export default mergeConfig(
    buildConfig,
    defineConfig({
        test: {
            setupFiles: [
                fileURLToPath(
                    new URL(
                        '../../test-support/fail-on-console-error.mjs',
                        import.meta.url,
                    ),
                ),
            ],
        },
    }),
);
