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

const INPUT_TYPES = [
    {
        type: 'SchemeDefinition',
        path: 'libs/types/src/scheme-definition.ts',
        file: 'scheme-definition.schema.json',
    },
    {
        type: 'GuideDefinition',
        path: 'libs/types/src/guide-definition.ts',
        file: 'guide-definition.schema.json',
    },
    {
        type: 'AccessDefinition',
        path: 'libs/types/src/access-definition.ts',
        file: 'access-policy.schema.json',
    },
    {
        type: 'ContextDefinition',
        path: 'libs/types/src/context-definition.ts',
        file: 'context-definition.schema.json',
    },
    {
        type: 'CrosswalkDefinition',
        path: 'libs/types/src/crosswalk.ts',
        file: 'crosswalk-definition.schema.json',
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
 * Keep the committed input-schema dist aligned with the generator output.
 *
 * This runs the local schema build and then asks git whether the generated
 * input bundle differs from what is committed. Any drift is a release-blocking
 * contract mismatch.
 */
describe('@ezclassify/schemas generated input drift', () => {
    it('matches the generated input schemas', () => {
        const tempDir = fs.mkdtempSync(
            path.join(os.tmpdir(), 'schemas-input-'),
        );
        try {
            for (const { type, path: srcPath, file } of INPUT_TYPES) {
                const outFile = path.join(tempDir, file);
                const json = execFileSync(
                    'npx',
                    [
                        'ts-json-schema-generator',
                        '--path',
                        srcPath,
                        '--type',
                        type,
                        '--tsconfig',
                        'tsconfig.base.json',
                        '--no-top-ref',
                        '--expose',
                        'all',
                    ],
                    {
                        cwd: repoRoot,
                        encoding: 'utf8',
                        stdio: ['pipe', 'pipe', 'pipe'],
                    },
                );
                const schema = JSON.parse(json) as Record<string, unknown>;
                expectTopLevelShapeMatches(type, srcPath, schema);
                fs.writeFileSync(outFile, json, 'utf8');
            }

            execFileSync(
                process.execPath,
                [
                    path.join(
                        repoRoot,
                        'node_modules/prettier/bin/prettier.cjs',
                    ),
                    '--write',
                    '--log-level',
                    'silent',
                    '--config',
                    path.join(repoRoot, '.prettierrc.json'),
                    // Prettier applies the repository's .gitignore to every
                    // path it is given, and that file ignores `tmp`. On Linux
                    // the temporary directory sits under /tmp, so without
                    // this the files were skipped silently and compared
                    // unformatted. The named file does not exist, so nothing
                    // is ignored.
                    '--ignore-path',
                    path.join(tempDir, '.prettierignore'),
                    tempDir,
                ],
                { cwd: repoRoot, stdio: 'pipe' },
            );

            for (const { file } of INPUT_TYPES) {
                const committed = fs.readFileSync(
                    path.join(packageRoot, 'generated/json-schemas-input', file),
                    'utf8',
                );
                const generated = fs.readFileSync(
                    path.join(tempDir, file),
                    'utf8',
                );
                expect(committed).toBe(generated);
            }
        } finally {
            fs.rmSync(tempDir, { recursive: true, force: true });
        }
    }, 60000);
});
