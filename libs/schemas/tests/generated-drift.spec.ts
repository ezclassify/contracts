import { describe, expect, it } from 'vitest';
import { execFileSync } from 'child_process';
import fs from 'fs';
import os from 'os';
import path from 'path';
import ts from 'typescript';
import { fileURLToPath } from 'url';

const packageRoot = path.resolve(
    path.dirname(fileURLToPath(import.meta.url)),
    '..',
);
const repoRoot = path.resolve(packageRoot, '../..');

const DOCUMENT_TYPES = [
    {
        type: 'SchemeDefinition',
        path: 'libs/types/src/scheme-definition.ts',
        file: 'scheme.schema.json',
    },
    {
        type: 'GuideDefinition',
        path: 'libs/types/src/guide-definition.ts',
        file: 'guide.schema.json',
    },
    {
        type: 'AccessDefinition',
        path: 'libs/types/src/access-definition.ts',
        file: 'access.schema.json',
    },
    {
        type: 'ContextDefinition',
        path: 'libs/types/src/context-definition.ts',
        file: 'context.schema.json',
    },
    {
        type: 'CrosswalkDefinition',
        path: 'libs/types/src/crosswalk.ts',
        file: 'crosswalk.schema.json',
    },
    {
        type: 'TestSuite',
        path: 'libs/types/src/test-suite.ts',
        file: 'test-suite.schema.json',
    },
] as const;

type TopLevelShape = {
    properties: string[];
    required: string[];
    allowsAdditionalProperties: boolean;
};

function readInterfaceTopLevelShape(
    srcPath: string,
    exportName: string,
): TopLevelShape {
    const filePath = path.join(repoRoot, srcPath);
    const sourceText = fs.readFileSync(filePath, 'utf8');
    const sourceFile = ts.createSourceFile(
        filePath,
        sourceText,
        ts.ScriptTarget.Latest,
        true,
        ts.ScriptKind.TS,
    );

    const declaration = sourceFile.statements.find(
        (statement): statement is ts.InterfaceDeclaration =>
            ts.isInterfaceDeclaration(statement) &&
            statement.modifiers?.some(
                (modifier) => modifier.kind === ts.SyntaxKind.ExportKeyword,
            ) &&
            statement.name.text === exportName,
    );

    if (!declaration) {
        throw new Error(
            `parity test: cannot find exported interface ${exportName} in ${srcPath}`,
        );
    }

    const properties: string[] = [];
    const required: string[] = [];
    let allowsAdditionalProperties = false;

    for (const member of declaration.members) {
        if (
            ts.isPropertySignature(member) &&
            member.name &&
            ts.isIdentifier(member.name)
        ) {
            properties.push(member.name.text);
            if (!member.questionToken) {
                required.push(member.name.text);
            }
            continue;
        }

        if (ts.isIndexSignatureDeclaration(member)) {
            allowsAdditionalProperties = true;
        }
    }

    return {
        properties: properties.sort(),
        required: required.sort(),
        allowsAdditionalProperties,
    };
}

function readSchemaTopLevelShape(
    schema: Record<string, unknown>,
): TopLevelShape {
    const properties =
        schema.properties && typeof schema.properties === 'object'
            ? Object.keys(schema.properties as Record<string, unknown>).sort()
            : [];
    const required = Array.isArray(schema.required)
        ? [...schema.required]
              .filter((value): value is string => typeof value === 'string')
              .sort()
        : [];
    const allowsAdditionalProperties = schema.additionalProperties !== false;

    return { properties, required, allowsAdditionalProperties };
}

function expectTopLevelShapeMatches(
    type: string,
    srcPath: string,
    schema: Record<string, unknown>,
) {
    const interfaceShape = readInterfaceTopLevelShape(srcPath, type);
    const schemaShape = readSchemaTopLevelShape(schema);

    expect(schema.type).toBe('object');
    expect(schemaShape).toEqual(interfaceShape);
}

/**
 * Keep the committed document schemas aligned with the generator output.
 *
 * This runs the repository's own schema build into a temporary root and
 * compares each document schema with the committed one. Any drift is a
 * release-blocking contract mismatch. The root of every schema must also list
 * the same top-level properties as the document type it describes.
 */
describe('@ezclassify/schemas generated document schema drift', () => {
    it('matches the generated document schemas', () => {
        const tempDir = fs.mkdtempSync(
            path.join(os.tmpdir(), 'schemas-documents-'),
        );
        try {
            execFileSync(
                process.execPath,
                [
                    path.join(packageRoot, 'build.mjs'),
                    `--output-root=${tempDir}`,
                ],
                { cwd: repoRoot, stdio: 'pipe' },
            );

            for (const { type, path: srcPath, file } of DOCUMENT_TYPES) {
                const generated = fs.readFileSync(
                    path.join(tempDir, 'validation/v1', file),
                    'utf8',
                );
                const committed = fs.readFileSync(
                    path.join(packageRoot, 'generated/validation/v1', file),
                    'utf8',
                );
                expect(committed).toBe(generated);
                expectTopLevelShapeMatches(
                    type,
                    srcPath,
                    JSON.parse(committed) as Record<string, unknown>,
                );
            }
        } finally {
            fs.rmSync(tempDir, { recursive: true, force: true });
        }
    }, 120000);
});
