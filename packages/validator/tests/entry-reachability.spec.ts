/**
 * Every published entry point must be reachable from both module systems.
 *
 * The validator ships as plain ESM, but consumers bundle CommonJS builds that
 * reach these entries through `require`. A subpath whose conditional map names
 * only `import` resolves for one module system and throws
 * ERR_PACKAGE_PATH_NOT_EXPORTED for the other, which is invisible inside this
 * repository and only surfaces when a downstream package is packed and
 * consumed. This walks the declared map instead of naming entries, so a new
 * subpath is covered the moment it is added.
 */
import { existsSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import ts from 'typescript';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { describe, expect, it } from 'vitest';
import packageManifest from '../package.json' with { type: 'json' };

const packageRoot = path.resolve(
    path.dirname(fileURLToPath(import.meta.url)),
    '..',
);

const requireFromPackage = createRequire(
    pathToFileURL(path.join(packageRoot, 'package.json')),
);

/** Resolve a declared export entry to the file it serves a given condition. */
function targetFor(entry: unknown, condition: string): string | undefined {
    if (typeof entry === 'string') return entry;
    if (entry === null || typeof entry !== 'object') return undefined;
    const map = entry as Record<string, unknown>;
    const matched = map[condition] ?? map.default;
    return typeof matched === 'string' ? matched : undefined;
}

const exportEntries = Object.entries(
    packageManifest.exports as Record<string, unknown>,
);

describe('published entry points', () => {
    it('declares at least the entries the package is known to serve', () => {
        expect(exportEntries.length).toBeGreaterThan(1);
    });

    for (const [subpath, entry] of exportEntries) {
        it(`serves "${subpath}" to both module systems`, () => {
            const importTarget = targetFor(entry, 'import');
            const requireTarget = targetFor(entry, 'require');

            expect(importTarget).toBeDefined();
            expect(requireTarget).toBeDefined();
            expect(requireTarget).toBe(importTarget);
        });

        it(`resolves "${subpath}" through require`, () => {
            const specifier = path.posix.join(
                packageManifest.name,
                subpath === '.' ? '' : subpath.slice(2),
            );
            expect(() => requireFromPackage.resolve(specifier)).not.toThrow();
        });
    }
});

/** The value names a declaration file exports, as TypeScript reads it. */
function declaredExports(file: string): string[] {
    const program = ts.createProgram([file], { noEmit: true });
    const checker = program.getTypeChecker();
    const source = program.getSourceFile(file);
    const module = source && checker.getSymbolAtLocation(source);
    if (!module) return [];
    return checker
        .getExportsOfModule(module)
        .filter((symbol) => {
            const target =
                symbol.flags & ts.SymbolFlags.Alias
                    ? checker.getAliasedSymbol(symbol)
                    : symbol;
            return (target.flags & ts.SymbolFlags.Value) !== 0;
        })
        .map((symbol) => symbol.getName())
        .sort();
}

describe('published type declarations', () => {
    for (const [subpath, entry] of exportEntries) {
        it(`declares exactly what "${subpath}" exports`, async () => {
            const types = targetFor(entry, 'types');
            const target = targetFor(entry, 'import');
            expect(types, subpath).toBeDefined();
            const declarations = path.join(packageRoot, types as string);
            expect(existsSync(declarations)).toBe(true);
            const module = (await import(
                pathToFileURL(path.join(packageRoot, target as string)).href
            )) as Record<string, unknown>;
            expect(declaredExports(declarations)).toEqual(
                Object.keys(module).sort(),
            );
        });
    }
});
