import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import yaml from 'js-yaml';
import { describe, expect, it } from 'vitest';

/**
 * A scheme document may have no description, and a serving runtime leaves the
 * member out of its summary rather than answering with blank prose. The
 * response schema therefore describes the member and does not require it, so a
 * client generated from the spec accepts the summary of such a scheme.
 */

const packageRoot = path.resolve(
    path.dirname(fileURLToPath(import.meta.url)),
    '..',
);

const spec = yaml.load(
    readFileSync(path.join(packageRoot, 'openapi.yaml'), 'utf8'),
) as {
    components: {
        schemas: {
            SchemeSummary: {
                properties: Record<string, unknown>;
                required: string[];
            };
        };
    };
};

describe('scheme summary description', () => {
    const summary = spec.components.schemas.SchemeSummary;

    it('describes the description member', () => {
        expect(summary.properties).toHaveProperty('description');
    });

    it('does not require a scheme to have one', () => {
        expect(summary.required).not.toContain('description');
        expect(summary.required).toEqual(
            expect.arrayContaining(['id', 'version', 'name']),
        );
    });
});
