import { spawnSync } from 'node:child_process';
import {
    existsSync,
    mkdtempSync,
    readFileSync,
    rmSync,
    writeFileSync,
} from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

/**
 * The published surface of `@ezclassify/types`, frozen.
 *
 * What a consumer can name is what the build writes to `dist/index.d.ts`, not
 * what `src/index.ts` exports: the build strips every declaration tagged
 * internal, so the loaded engine shapes and the in-process seams never reach a
 * published declaration. This compiles the declarations with the package's own
 * build configuration and reads the surface from them, which is also what makes
 * dropping `stripInternal` from that configuration fail here.
 *
 * Two goldens hold the surface. `public-export-symbols` is every name the entry
 * point exports. `public-signatures` is the declaration text of each, comments
 * removed and whitespace collapsed, so a member added to, removed from or
 * retyped in a published shape fails until the golden is regenerated on purpose
 * with `UPDATE_TYPES_EXPORT_CONTRACT=1`.
 */

const require = createRequire(import.meta.url);
const typesRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const fixtures = resolve(typesRoot, 'tests/fixtures');
const manifest = require(resolve(typesRoot, 'package.json')) as {
    exports: Record<string, { types: string; import: string; default: string }>;
};

let scratch = '';

/**
 * Emit declarations with one of the package's tsconfig files into `outDir`.
 *
 * @param project - The tsconfig file, relative to the package root.
 * @param outDir - Where the declarations go.
 */
function emitDeclarations(project: string, outDir: string): void {
    const run = spawnSync(
        process.execPath,
        [
            require.resolve('typescript/bin/tsc'),
            '-p',
            project,
            '--emitDeclarationOnly',
            '--outDir',
            outDir,
        ],
        { cwd: typesRoot, encoding: 'utf8' },
    );
    if (run.status !== 0) {
        throw new Error(
            `Unable to emit ${project} declarations:\n${run.stdout}${run.stderr}`,
        );
    }
}

/** The exports of one emitted entry point, and how to read each one. */
interface EmittedSurface {
    names: string[];
    declarationText(name: string): string;
    isTaggedInternal(name: string): boolean;
}

/**
 * Read the exports of an emitted `index.d.ts`.
 *
 * @param entrypoint - Absolute path of the declaration entry point.
 */
function readSurface(entrypoint: string): EmittedSurface {
    const program = ts.createProgram([entrypoint], {
        module: ts.ModuleKind.ESNext,
        moduleResolution: ts.ModuleResolutionKind.Bundler,
        skipLibCheck: true,
    });
    const checker = program.getTypeChecker();
    const source = program.getSourceFile(entrypoint);
    if (!source) throw new Error(`Missing declaration entry ${entrypoint}`);
    const moduleSymbol = checker.getSymbolAtLocation(source);
    if (!moduleSymbol) throw new Error(`No exports in ${entrypoint}`);
    const byName = new Map(
        checker
            .getExportsOfModule(moduleSymbol)
            .filter((symbol) => symbol.getName() !== 'default')
            .map((symbol) => [symbol.getName(), symbol] as const),
    );
    const declarations = (name: string): ts.Declaration[] => {
        const symbol = byName.get(name);
        if (!symbol) throw new Error(`Missing export ${name}`);
        const target =
            symbol.flags & ts.SymbolFlags.Alias
                ? checker.getAliasedSymbol(symbol)
                : symbol;
        return target.declarations ?? [];
    };
    return {
        names: [...byName.keys()].sort(),
        declarationText: (name) =>
            declarations(name)
                .map((declaration) =>
                    declaration
                        .getText()
                        .replace(/\/\*[\s\S]*?\*\//g, '')
                        .replace(/\/\/.*$/gm, '')
                        .replace(/\s+/g, ' ')
                        .trim(),
                )
                .join(' '),
        isTaggedInternal: (name) =>
            declarations(name).some((declaration) =>
                ts
                    .getJSDocTags(declaration)
                    .some((tag) => tag.tagName.text === 'internal'),
            ),
    };
}

let published: EmittedSurface;
let internal: EmittedSurface;

beforeAll(() => {
    scratch = mkdtempSync(join(tmpdir(), 'ezclassify-types-surface-'));
    emitDeclarations('tsconfig.build.json', join(scratch, 'published'));
    emitDeclarations('tsconfig.internal.json', join(scratch, 'internal'));
    published = readSurface(join(scratch, 'published/index.d.ts'));
    internal = readSurface(join(scratch, 'internal/index.d.ts'));
});

afterAll(() => {
    if (scratch) rmSync(scratch, { recursive: true, force: true });
});

/**
 * Compare `current` with a golden fixture, rewriting the fixture first when
 * `UPDATE_TYPES_EXPORT_CONTRACT=1`.
 *
 * @param file - Fixture file name.
 * @param current - The value read from the emitted declarations.
 */
function expectGolden(file: string, current: unknown): void {
    const path = resolve(fixtures, file);
    if (process.env.UPDATE_TYPES_EXPORT_CONTRACT === '1') {
        writeFileSync(path, `${JSON.stringify(current, null, 4)}\n`);
    }
    expect(existsSync(path)).toBe(true);
    expect(current).toEqual(JSON.parse(readFileSync(path, 'utf8')));
}

describe('@ezclassify/types published contract', () => {
    it('freezes the exact set of names the published declarations export', () => {
        expectGolden('public-export-symbols.golden.json', published.names);
    });

    it('freezes the declared shape of every published export', () => {
        expectGolden(
            'public-signatures.golden.json',
            Object.fromEntries(
                published.names.map((name) => [
                    name,
                    published.declarationText(name),
                ]),
            ),
        );
    });

    it('keeps out of the published declarations exactly what is tagged internal', () => {
        const publishedNames = new Set(published.names);
        const withheld = internal.names.filter(
            (name) => !publishedNames.has(name),
        );
        expect(withheld.length).toBeGreaterThan(0);
        expect(
            withheld.filter((name) => !internal.isTaggedInternal(name)),
        ).toEqual([]);
        expect(
            published.names.every((name) => internal.names.includes(name)),
        ).toBe(true);
    });

    it('serves the internal declarations only from the ./internal entry', () => {
        expect(manifest.exports['.'].types).toBe('./dist/index.d.ts');
        expect(manifest.exports['./internal'].types).toBe(
            './dist/internal/index.d.ts',
        );
    });

    it('runs the ./internal entry on the one compiled module the root ships', () => {
        // Stripping internal declarations changes no JavaScript, so the
        // internal entry adds declarations and nothing else: both entries
        // load the same module, and its build emits no second copy.
        expect(manifest.exports['./internal'].import).toBe('./dist/index.js');
        expect(manifest.exports['./internal'].default).toBe('./dist/index.js');
        const internalBuild = JSON.parse(
            readFileSync(resolve(typesRoot, 'tsconfig.internal.json'), 'utf8'),
        ) as { compilerOptions: { emitDeclarationOnly?: boolean } };
        expect(internalBuild.compilerOptions.emitDeclarationOnly).toBe(true);
    });
});
