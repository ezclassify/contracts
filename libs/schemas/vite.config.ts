import { readFileSync, writeFileSync } from 'node:fs';
import { defineConfig, type Plugin } from 'vite';
import dts from 'vite-plugin-dts';

const pkg = JSON.parse(
    readFileSync(new URL('./package.json', import.meta.url), 'utf-8'),
) as {
    name: string;
    version: string;
};

/**
 * Write a minimal package.json to dist/lib so published consumers can resolve
 * entry points.
 */
function distPackageJson(): Plugin {
    return {
        name: 'dist-package-json',
        closeBundle() {
            writeFileSync(
                'dist/lib/package.json',
                JSON.stringify(
                    {
                        name: pkg.name,
                        version: pkg.version,
                        type: 'module',
                        main: './index.cjs',
                        module: './index.mjs',
                        types: './index.d.ts',
                        exports: {
                            '.': {
                                types: './index.d.ts',
                                import: './index.mjs',
                                require: './index.cjs',
                            },
                        },
                    },
                    null,
                    2,
                ) + '\n',
            );
        },
    };
}

export default defineConfig({
    build: {
        lib: {
            entry: {
                'index': 'src/index.ts',
                'scheme-schema': 'src/scheme-schema.ts',
                'guide-schema': 'src/guide-schema.ts',
                'access-schema': 'src/access-schema.ts',
                'context-schema': 'src/context-schema.ts',
                'crosswalk-schema': 'src/crosswalk-schema.ts',
                'test-suite-schema': 'src/test-suite-schema.ts',
                // Internal: the public declarations import its types, so it
                // ships beside them as a module, but no `exports` subpath names it.
                'fragment': 'src/fragment.ts',
            },
            formats: ['es', 'cjs'],
            fileName: (format, entryName) =>
                format === 'es' ? `${entryName}.mjs` : `${entryName}.cjs`,
        },
        outDir: 'dist/lib',
        emptyOutDir: true,
        rollupOptions: {
            // First-party packages stay external so a published tarball
            // depends on them rather than carrying a copy of their code.
            // Nothing here imports one today; the promise is what the
            // publication boundary is checked against.
            external: (id) =>
                ['crypto', 'fs', 'path', 'url'].includes(id) ||
                id.startsWith('node:') ||
                id.startsWith('@ezclassify/'),
        },
        // Published artifacts omit *.map files, so do not leave consumers with
        // dangling sourceMappingURL comments that point outside the tarball.
        sourcemap: false,
        target: ['es2022', 'node22'],
    },
    plugins: [dts({ tsconfigPath: './tsconfig.lib.json' }), distPackageJson()],
});
