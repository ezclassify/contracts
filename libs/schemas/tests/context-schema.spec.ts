/**
 * Validation tests for the context document schema.
 *
 * Root shape: { context: { id, version, scheme: { id, version }, ... } }
 * Required: context.id, context.version, context.scheme (with id + version) id
 * pattern: ^[a-z0-9][a-z0-9-]*$ Strict: additionalProperties: false throughout
 */
import { describe, it, expect, beforeAll } from 'vitest';
import Ajv from 'ajv';
import type { ValidateFunction } from 'ajv';
import {
    contextSchema,
    contextComponentRefSchema,
    contextSchemeRefSchema,
    contextGuideRefSchema,
    contextCrosswalkRefSchema,
    contextAccessRefSchema,
    contextBlockSchema,
    contextSchemaDefs,
} from '../src/context-schema';

// ---------------------------------------------------------------------------
// Document validation (via AJV, draft-07, the generated schema's dialect)
// ---------------------------------------------------------------------------

describe('contextSchema: accept paths', () => {
    let validate: ValidateFunction;

    beforeAll(() => {
        const ajv = new (Ajv as unknown as new (o: { strict: boolean }) => {
            compile(s: unknown): ValidateFunction;
        })({ strict: false });
        validate = ajv.compile(contextSchema);
    });

    it('accepts a minimal valid context document', () => {
        const doc = {
            context: {
                id: 'my-ctx',
                version: '1.0.0',
                scheme: { id: 'demo', version: '1.0.0' },
            },
        };
        expect(validate(doc)).toBe(true);
    });

    it('accepts layers nested under every layerable reference', () => {
        // One document exercising all four families, because "uniformly" is
        // the claim: the guide, crosswalk, and access entries take layers the
        // same way the scheme entry always has.
        const doc = {
            context: {
                id: 'eastern-division',
                version: '1.0.0',
                scheme: {
                    id: 'acme-primary',
                    version: '1.0.0',
                    layers: [{ id: 'division-concepts', version: '1.0.0' }],
                },
                guides: [
                    {
                        id: 'quickmark',
                        version: '1.0.0',
                        layers: [
                            { id: 'division-quickmark', version: '1.0.0' },
                        ],
                    },
                ],
                crosswalks: [
                    {
                        id: 'acme-to-partner',
                        version: '2.1.0',
                        layers: [{ id: 'division-coverage', version: '1.0.0' }],
                    },
                ],
                access: {
                    id: 'acme-rbac',
                    version: '1.0.0',
                    layers: [{ id: 'division-access', version: '1.0.0' }],
                },
            },
        };
        expect(validate(doc)).toBe(true);
    });

    it('accepts a context document with optional guides list', () => {
        const doc = {
            context: {
                id: 'full-ctx',
                version: '2.0.0',
                scheme: { id: 'cedar-valley-protection', version: '1.0.0' },
                guides: [
                    { id: 'guide-a', version: '1.0.0' },
                    { id: 'guide-b', version: '2.0.0' },
                ],
            },
        };
        expect(validate(doc)).toBe(true);
    });
});

describe('contextSchema: reject paths', () => {
    let validate: ValidateFunction;

    beforeAll(() => {
        const ajv = new (Ajv as unknown as new (o: { strict: boolean }) => {
            compile(s: unknown): ValidateFunction;
        })({ strict: false });
        validate = ajv.compile(contextSchema);
    });

    it('rejects a document missing context.scheme', () => {
        const doc = { context: { id: 'x', version: '1.0.0' } };
        expect(validate(doc)).toBe(false);
    });

    it('rejects a document missing context.version', () => {
        const doc = {
            context: {
                id: 'x',
                scheme: { id: 'demo', version: '1.0.0' },
            },
        };
        expect(validate(doc)).toBe(false);
    });

    it('rejects a document with an invalid id (uppercase letter)', () => {
        // id pattern: ^[a-z0-9][a-z0-9-]*$: uppercase must fail
        const doc = {
            context: {
                id: 'My-Ctx',
                version: '1.0.0',
                scheme: { id: 'demo', version: '1.0.0' },
            },
        };
        expect(validate(doc)).toBe(false);
    });

    it('rejects a document with an unknown key (additionalProperties: false)', () => {
        const doc = {
            context: {
                id: 'x',
                version: '1.0.0',
                scheme: { id: 'demo', version: '1.0.0' },
                extra_field: 'not-allowed',
            },
        };
        expect(validate(doc)).toBe(false);
    });

    it('rejects a document missing the top-level context wrapper', () => {
        const doc = {
            id: 'x',
            version: '1.0.0',
            scheme: { id: 'demo', version: '1.0.0' },
        };
        expect(validate(doc)).toBe(false);
    });

    it('rejects a scheme ref missing scheme.version', () => {
        const doc = {
            context: {
                id: 'x',
                version: '1.0.0',
                scheme: { id: 'demo' },
            },
        };
        expect(validate(doc)).toBe(false);
    });

    it('rejects layers declared as a top-level sibling instead of nested', () => {
        // Binding is the nesting. A Context-level layers list would have no
        // base to derive from, which is exactly the ambiguity the shape rules
        // out.
        const doc = {
            context: {
                id: 'x',
                version: '1.0.0',
                scheme: { id: 'demo', version: '1.0.0' },
                layers: [{ id: 'division-concepts', version: '1.0.0' }],
            },
        };
        expect(validate(doc)).toBe(false);
    });

    it('rejects a layer reference missing its version', () => {
        const doc = {
            context: {
                id: 'x',
                version: '1.0.0',
                scheme: { id: 'demo', version: '1.0.0' },
                guides: [
                    {
                        id: 'quickmark',
                        version: '1.0.0',
                        layers: [{ id: 'division-quickmark' }],
                    },
                ],
            },
        };
        expect(validate(doc)).toBe(false);
    });
});

// ---------------------------------------------------------------------------
// Exported sub-schema structure
// ---------------------------------------------------------------------------

describe('context-schema exports: sub-schema structure', () => {
    it('contextComponentRefSchema has id and version properties', () => {
        const props = contextComponentRefSchema.properties as Record<
            string,
            unknown
        >;
        expect(props).toHaveProperty('id');
        expect(props).toHaveProperty('version');
    });

    it('every per-family ref sub-schema carries id, version, and layers', () => {
        const refs = {
            scheme: contextSchemeRefSchema,
            guide: contextGuideRefSchema,
            crosswalk: contextCrosswalkRefSchema,
            access: contextAccessRefSchema,
        };
        for (const [family, ref] of Object.entries(refs)) {
            const props = ref.properties as Record<string, unknown>;
            expect(Object.keys(props).sort(), family).toEqual([
                'id',
                'layers',
                'version',
            ]);
            expect(ref.required, family).toEqual(['id', 'version']);
        }
    });

    it('contextBlockSchema has id, version, and scheme properties', () => {
        const props = contextBlockSchema.properties as Record<
            string,
            unknown
        >;
        expect(props).toHaveProperty('id');
        expect(props).toHaveProperty('version');
        expect(props).toHaveProperty('scheme');
    });

    it('contextSchemaDefs carries the block and every per-family ref', () => {
        const defs = contextSchemaDefs as Record<string, unknown>;
        expect(defs).toHaveProperty('ContextBlock');
        expect(defs).toHaveProperty('ComponentRef');
        expect(defs).toHaveProperty('ContextSchemeRef');
        expect(defs).toHaveProperty('ContextGuideRef');
        expect(defs).toHaveProperty('ContextCrosswalkRef');
        expect(defs).toHaveProperty('ContextAccessRef');
    });
});
