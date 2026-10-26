import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parse as parseYaml } from 'yaml';

// @ts-expect-error: the validator is plain ESM JavaScript with no types.
import { validateDocument } from '../src/index.mjs';
// @ts-expect-error: the validator is plain ESM JavaScript with no types.
import { compilePlan } from '../src/plan.mjs';

/**
 * A scheme names its default scope once, with `default_scope`.
 *
 * Each case starts from F01, the plainest valid document in the set, which
 * declares one scope and names it, and changes one thing. Each refusal is
 * pinned to its path and message, so a document refused for an unrelated reason
 * does not pass for the rule under test.
 */

const here = path.dirname(fileURLToPath(import.meta.url));
const F01 = path.join(
    here,
    'fixtures',
    'format-contract',
    'falsification',
    'F01-canonical-inline.yaml',
);

interface Diagnostic {
    id: string;
    severity: 'error' | 'warning';
    path: string;
    message: string;
}

/** Parsed YAML that each case reshapes freely. */
type Doc = any;

function plain(): Doc {
    return parseYaml(fs.readFileSync(F01, 'utf8'));
}

function errors(document: Doc): Diagnostic[] {
    return (compilePlan(document).diagnostics as Diagnostic[]).filter(
        (entry) => entry.severity === 'error',
    );
}

/** The one diagnostic a default-scope refusal reports. */
function refusal(message: string): Diagnostic[] {
    return [
        {
            id: 'plan/unresolved-reference',
            severity: 'error',
            path: '/scheme/default_scope',
            message,
        },
    ];
}

describe('the default scope of a scheme', () => {
    it('is accepted when `default_scope` names a declared scope', () => {
        const document = plain();
        expect(document.scheme.default_scope).toBe('banner');
        expect(errors(document)).toEqual([]);
        expect(validateDocument(document).ok).toBe(true);
    });

    it('is required whenever the scheme declares scopes', () => {
        const document = plain();
        delete document.scheme.default_scope;
        expect(errors(document)).toEqual(
            refusal(
                'the scheme declares scopes (`banner`) and names none of them as its default. A marking that names no scope is in the default one, so name it with `default_scope`.',
            ),
        );
        expect(validateDocument(document).ok).toBe(false);

        // Declaring no scopes asks for no default.
        delete document.scheme.scopes;
        expect(errors(document)).toEqual([]);
    });

    it('is refused when it names a scope the scheme does not declare', () => {
        const document = plain();
        document.scheme.default_scope = 'portion';
        expect(errors(document)).toEqual(
            refusal(
                '`default_scope` names `portion`, which the scheme does not declare in `scopes`; it declares `banner`.',
            ),
        );
    });

    it('is refused when it names a scope and the scheme declares none', () => {
        const document = plain();
        delete document.scheme.scopes;
        expect(errors(document)).toEqual(
            refusal(
                '`default_scope` names `banner`, and the scheme declares no scopes. Declare it in `scopes`, or remove `default_scope`.',
            ),
        );
    });

    it('is left to the stack below a layer', () => {
        // A layer that adds a scope keeps the default of the stack it sits on,
        // and may name one only that stack declares.
        const document = plain();
        document.scheme.type = 'layer';
        document.scheme.layer = { base: 'p1-base@1.0.0' };
        delete document.scheme.default_scope;
        expect(
            errors(document).filter((entry) =>
                entry.path.startsWith('/scheme/default_scope'),
            ),
        ).toEqual([]);

        document.scheme.default_scope = 'portion';
        expect(
            errors(document).filter((entry) =>
                entry.path.startsWith('/scheme/default_scope'),
            ),
        ).toEqual([]);
    });

    it('rejects unknown fields on a scope', () => {
        const document = plain();
        expect(validateDocument(document).ok).toBe(true);
        document.scheme.scopes[0].unexpected_field = true;
        const result = validateDocument(document);
        expect(result.ok).toBe(false);
        expect(
            result.errors.some(
                (error: { id?: string; params?: Record<string, unknown> }) =>
                    error.id === undefined &&
                    error.params?.additionalProperty === 'unexpected_field',
            ),
        ).toBe(true);
    });
});
