/**
 * The scheme layer block's JSDoc lists every element kind a layer can add,
 * override or remove, with the section it lives in and whether `removes` can
 * name it. That table is prose, so this spec holds it to the types it
 * describes: each section must be a list the scheme document declares, and the
 * Removable column must be exactly the keys of `LayerRemovalDoc`.
 */
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';
import { describe, expect, it } from 'vitest';

const typesRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const definitionFile = resolve(typesRoot, 'src/scheme-definition.ts');

const program = ts.createProgram([definitionFile], {
    module: ts.ModuleKind.ESNext,
    moduleResolution: ts.ModuleResolutionKind.Bundler,
    skipLibCheck: true,
});
const checker = program.getTypeChecker();
const sourceFile = program.getSourceFile(definitionFile);
if (!sourceFile) throw new Error(`Missing ${definitionFile}`);

function declaredType(name: string): ts.Type {
    for (const statement of sourceFile!.statements) {
        if (
            (ts.isInterfaceDeclaration(statement) ||
                ts.isTypeAliasDeclaration(statement)) &&
            statement.name.text === name
        ) {
            return checker.getTypeAtLocation(statement.name);
        }
    }
    throw new Error(`scheme-definition.ts declares no ${name}`);
}

interface KindRow {
    kind: string;
    section: string;
    removable: boolean;
}

/** The kind table as the LayerBlockDoc JSDoc states it. */
function documentedKinds(): KindRow[] {
    const text = readFileSync(definitionFile, 'utf8');
    const block = text.slice(0, text.indexOf('export interface LayerBlockDoc'));
    const rows: KindRow[] = [];
    for (const line of block.slice(block.lastIndexOf('/**')).split('\n')) {
        const match = line.match(
            /^\s*\*\s*\|\s*`([a-z_]+)`\s*\|\s*`([a-z_.]+)`\s*\|\s*(yes|no)\s*\|/,
        );
        if (match)
            rows.push({
                kind: match[1],
                section: match[2],
                removable: match[3] === 'yes',
            });
    }
    return rows;
}

/**
 * The type at a dotted path under `SchemeBlock`, or undefined when some step is
 * not declared. A step into an open record (`ui`) is reported as such, because
 * the document contract does not type what lives inside it.
 */
function typeAt(path: string): ts.Type | 'open-record' | undefined {
    let current: ts.Type = declaredType('SchemeBlock');
    for (const step of path.split('.')) {
        const nonNullable = checker.getNonNullableType(current);
        if (checker.isArrayType(nonNullable)) {
            current = checker.getIndexInfoOfType(
                nonNullable,
                ts.IndexKind.Number,
            )!.type;
        }
        const property = checker.getPropertyOfType(
            checker.getNonNullableType(current),
            step,
        );
        if (!property) {
            const index = checker.getIndexInfoOfType(
                checker.getNonNullableType(current),
                ts.IndexKind.String,
            );
            return index ? 'open-record' : undefined;
        }
        current = checker.getTypeOfSymbol(property);
    }
    return checker.getNonNullableType(current);
}

describe('the scheme layer kind table', () => {
    const rows = documentedKinds();

    it('is present and names each kind once', () => {
        expect(rows.length).toBeGreaterThan(0);
        const kinds = rows.map((row) => row.kind);
        expect(new Set(kinds).size).toBe(kinds.length);
    });

    it('points every kind at a list the scheme document declares', () => {
        for (const row of rows) {
            const type = typeAt(row.section);
            expect(type, `${row.kind} at ${row.section}`).toBeDefined();
            if (type === 'open-record' || type === undefined) continue;
            const isList =
                checker.isArrayType(type) ||
                checker.getIndexInfoOfType(type, ts.IndexKind.String) !==
                    undefined;
            expect(
                isList,
                `${row.kind} at ${row.section} is a collection`,
            ).toBe(true);
        }
    });

    it('marks as removable exactly the kinds LayerRemovalDoc can name', () => {
        const removal = declaredType('LayerRemovalDoc');
        const keys = (removal.isUnion() ? removal.types : [removal])
            .flatMap((member) => checker.getPropertiesOfType(member))
            .map((property) => property.getName())
            .sort();
        const removable = rows
            .filter((row) => row.removable)
            .map((row) => row.kind)
            .sort();
        expect(removable).toEqual(keys);
    });
});
