import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import yaml from 'js-yaml';
import { describe, expect, it } from 'vitest';

const packageRoot = path.resolve(
    path.dirname(fileURLToPath(import.meta.url)),
    '..',
);
const spec = yaml.load(
    readFileSync(path.join(packageRoot, 'openapi.yaml'), 'utf8'),
) as {
    paths: Record<
        string,
        Record<
            string,
            {
                summary: string;
                description: string;
                responses: Record<string, { $ref?: string }>;
            }
        >
    >;
    components: {
        schemas: Record<
            string,
            { properties?: Record<string, { description?: string }> }
        >;
    };
};

describe('Context discovery descriptions', () => {
    it('describes the version list for token callers and for a standalone runtime', () => {
        const description = spec.paths['/v1/ctx/{ctxId}']?.get?.description;
        expect(description).toMatch(
            /^Lists every installed version of one context id that the caller may use, highest semver first\./,
        );
        // A managed deployment: every version the credential admits.
        expect(description).toMatch(
            /the versions its Context token or API key admits/,
        );
        expect(description).not.toMatch(/one version it resolves to/);
        // A standalone runtime: no token, installation is the grant, less
        // what the license does not cover.
        expect(description).toMatch(
            /standalone runtime takes no Context token/,
        );
        expect(description).toMatch(
            /every installed version it can serve, leaving out one whose content the license does not cover/,
        );
        expect(description).toMatch(
            /404 when the id is not installed or authorization is denied/,
        );
    });

    it('describes the listed versions as installed ones the caller may use', () => {
        const body = spec.components.schemas['CtxVersionsResponseBody'];
        expect(body?.properties?.['versions']?.description).toBe(
            'Every installed version the caller may use, sorted highest-first.',
        );
    });

    it('describes the collection for token callers and for a standalone runtime', () => {
        const list = spec.paths['/v1/ctx']?.get;
        expect(list?.summary).toBe('List the context ids the caller may use');
        // A managed deployment: the credential decides what appears.
        expect(list?.description).toMatch(
            /a Context token lists the one context it names/,
        );
        expect(list?.description).toMatch(
            /API-key caller without a token lists the contexts the deployment approves for its organization/,
        );
        // A standalone runtime: installation is the grant, less what it
        // cannot serve now.
        expect(list?.description).toMatch(
            /standalone runtime takes no Context token/,
        );
        expect(list?.description).toMatch(
            /every installed context it can serve now/,
        );
        expect(list?.description).toMatch(/license does not cover/);
        // The 404 belongs to the managed path only.
        expect(list?.description).toMatch(
            /On a managed deployment, returns 404 when authorization is denied/,
        );
        expect(list?.responses['404']?.$ref).toBe(
            '#/components/responses/NotFound',
        );
    });

    it('describes the listed contexts as ones the caller may use', () => {
        const body = spec.components.schemas['CtxListResponseBody'];
        expect(body?.properties?.['contexts']?.description).toBe(
            'Context ids the caller may use, sorted alphabetically.',
        );
    });
});
