import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';
import { describe, expect, it } from 'vitest';

const sourceRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../src');

/** One source file, parsed with parent links so its JSDoc can be read. */
function parse(file: string): ts.SourceFile {
    return ts.createSourceFile(
        file,
        readFileSync(resolve(sourceRoot, file), 'utf8'),
        ts.ScriptTarget.Latest,
        true,
    );
}

function interfaceIn(file: string, name: string): ts.InterfaceDeclaration {
    const source = parse(file);
    let found: ts.InterfaceDeclaration | undefined;
    source.forEachChild((node) => {
        if (ts.isInterfaceDeclaration(node) && node.name.text === name)
            found = node;
    });
    if (!found) throw new Error(`Missing interface ${name} in ${file}`);
    return found;
}

const memberNames = (declaration: ts.InterfaceDeclaration): string[] =>
    declaration.members
        .map((entry) => (entry.name as ts.Identifier | undefined)?.text ?? '')
        .sort();

describe('local scanner boundary', () => {
    it('lets the scanner read regions, not author them', () => {
        expect(
            memberNames(interfaceIn('local-engine.ts', 'ScanProcessor')),
        ).toContain('validate');
        expect(
            memberNames(interfaceIn('local-engine.ts', 'ScanProcessor')),
        ).not.toContain('process');
    });
});
