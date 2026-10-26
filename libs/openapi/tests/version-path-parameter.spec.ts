import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import yaml from 'js-yaml';
import { describe, expect, it } from 'vitest';

const packageRoot = path.resolve(
    path.dirname(fileURLToPath(import.meta.url)),
    '..',
);

interface Parameter {
    name: string;
    in: string;
    required?: boolean;
    description?: string;
}

const spec = yaml.load(
    readFileSync(path.join(packageRoot, 'openapi.yaml'), 'utf8'),
) as {
    paths: Record<
        string,
        Record<string, { operationId: string; parameters?: Parameter[] }>
    >;
};

/** Every operation whose path carries the `{version}` segment. */
const versioned = Object.entries(spec.paths)
    .filter(([route]) => route.includes('/{version}'))
    .flatMap(([route, item]) =>
        Object.values(item).map((operation) => ({
            route,
            operationId: operation.operationId,
            version: operation.parameters?.find(
                (one) => one.in === 'path' && one.name === 'version',
            ),
        })),
    );

describe('The {version} path parameter', () => {
    it('is declared on every versioned operation', () => {
        expect(versioned.length).toBeGreaterThan(0);
        for (const { operationId, version } of versioned) {
            expect(version, operationId).toBeDefined();
            // OpenAPI makes every path parameter required.
            expect(version?.required, operationId).toBe(true);
            expect(version?.description, operationId).toMatch(
                /^A concrete semver version, or `latest`\./,
            );
        }
    });

    it('says an operation route may leave the segment out and get latest', () => {
        const operations = versioned.filter(
            ({ route }) => !route.endsWith('/{version}'),
        );
        expect(operations.length).toBeGreaterThan(0);
        for (const { operationId, version } of operations) {
            expect(version?.description, operationId).toMatch(
                /may also be left out of the URL, which the server reads as `latest`/,
            );
        }
    });

    it('says the describe route without the segment is the version listing', () => {
        const describeRoute = versioned.find(
            ({ route }) => route === '/v1/ctx/{ctxId}/{version}',
        );
        expect(describeRoute?.version?.description).toMatch(
            /Without this segment the URL lists the context's versions instead\./,
        );
        expect(describeRoute?.version?.description).not.toMatch(/left out/);
        expect(spec.paths['/v1/ctx/{ctxId}']?.['get']?.operationId).toBe(
            'ctxVersions',
        );
    });
});
