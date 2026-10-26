/**
 * Validation tests for the access policy schema.
 *
 * Root shape: { access: { id, targetScheme: { id }, rules: {...} } } Required:
 * access.id, access.targetScheme.id, access.rules Strict: additionalProperties:
 * false on the access envelope
 */
import { describe, it, expect, beforeAll } from 'vitest';
import Ajv from 'ajv';
import type { ValidateFunction } from 'ajv';
import {
    accessSchema,
    accessMetaSchema,
    accessRuleSchema,
    accessSchemaDefs,
} from '../src/access-schema';

// ---------------------------------------------------------------------------
// Document validation (via AJV, draft-07)
// ---------------------------------------------------------------------------

describe('accessSchema: accept paths', () => {
    let validate: ValidateFunction;

    beforeAll(() => {
        // strict: false suppresses the union-type warning on AccessRuleWhenData.value
        const ajv = new (Ajv as unknown as new (o: { strict: boolean }) => {
            compile(s: unknown): ValidateFunction;
        })({ strict: false });
        validate = ajv.compile(accessSchema);
    });

    it('accepts a minimal valid access policy', () => {
        const doc = {
            access: {
                id: 'my-access',
                targetScheme: { id: 'demo' },
                rules: {},
            },
        };
        expect(validate(doc)).toBe(true);
    });

    it('accepts an access policy with canonical inline rules', () => {
        const doc = {
            access: {
                id: 'library-access',
                targetScheme: {
                    id: 'cedar-valley-protection',
                    version: '>=1.0.0',
                },
                rules: {
                    inline: [
                        { id: 'r1', name: 'Clearance check' },
                        {
                            id: 'r2',
                            name: 'Classification level',
                            attribute: 'clearance.level',
                            categoryId: 'classification',
                            strategy: 'gte',
                        },
                    ],
                },
            },
        };
        expect(validate(doc)).toBe(true);
    });

    it('accepts an access layer, which binds to a base and adds rules', () => {
        const doc = {
            access: {
                id: 'division-access',
                type: 'layer',
                layer: { base: 'acme-rbac-access@1.0.0' },
                targetScheme: { id: 'acme-classification-primary' },
                rules: {
                    inline: [
                        {
                            id: 'division-endorsement',
                            name: 'Division endorsement required',
                            attribute: 'divisionEndorsement',
                            categoryId: 'classification',
                            strategy: 'includes',
                        },
                    ],
                },
            },
        };
        expect(validate(doc)).toBe(true);
    });
});

describe('accessSchema: an access layer can only add', () => {
    let validate: ValidateFunction;

    beforeAll(() => {
        const ajv = new (Ajv as unknown as new (o: { strict: boolean }) => {
            compile(s: unknown): ValidateFunction;
        })({ strict: false });
        validate = ajv.compile(accessSchema);
    });

    /**
     * The complete-only rule is carried by the shape, so the schema has to
     * refuse the vocabulary outright rather than leave it to a loader check.
     * Scheme, crosswalk, and guide layers all accept these two keys; the access
     * family is the one that does not, and this is where that stays true.
     */
    for (const key of ['removes', 'restores']) {
        it(`refuses layer.${key}`, () => {
            const doc = {
                access: {
                    id: 'division-access',
                    type: 'layer',
                    layer: {
                        base: 'acme-rbac-access@1.0.0',
                        [key]: [{ rule: 'clearance-floor' }],
                    },
                    targetScheme: { id: 'acme-classification-primary' },
                    rules: {},
                },
            };
            expect(validate(doc)).toBe(false);
        });
    }
});

describe('accessSchema: reject paths', () => {
    let validate: ValidateFunction;

    beforeAll(() => {
        const ajv = new (Ajv as unknown as new (o: { strict: boolean }) => {
            compile(s: unknown): ValidateFunction;
        })({ strict: false });
        validate = ajv.compile(accessSchema);
    });

    it('rejects a document missing access.id', () => {
        const doc = { access: { targetScheme: { id: 'demo' }, rules: {} } };
        expect(validate(doc)).toBe(false);
    });

    it('rejects a document missing access.targetScheme', () => {
        const doc = { access: { id: 'x', rules: {} } };
        expect(validate(doc)).toBe(false);
    });

    it('rejects a document missing access.rules', () => {
        const doc = { access: { id: 'x', targetScheme: { id: 'demo' } } };
        expect(validate(doc)).toBe(false);
    });

    it('rejects a document missing the top-level access wrapper', () => {
        // Passing the inner envelope without the outer { access: ... } key
        const doc = { id: 'x', targetScheme: { id: 'demo' }, rules: {} };
        expect(validate(doc)).toBe(false);
    });

    it('rejects an unknown key on the access envelope (additionalProperties: false)', () => {
        const doc = {
            access: {
                id: 'x',
                targetScheme: { id: 'demo' },
                rules: {},
                unknown_field: 'bad',
            },
        };
        expect(validate(doc)).toBe(false);
    });

    it('rejects a non-string access.id', () => {
        const doc = {
            access: {
                id: 42,
                targetScheme: { id: 'demo' },
                rules: {},
            },
        };
        expect(validate(doc)).toBe(false);
    });
});

// ---------------------------------------------------------------------------
// Exported sub-schema structure
// ---------------------------------------------------------------------------

describe('access-schema exports: sub-schema structure', () => {
    it('accessMetaSchema has id and targetScheme in its properties', () => {
        const props = accessMetaSchema.properties as Record<string, unknown>;
        expect(props).toHaveProperty('id');
        expect(props).toHaveProperty('targetScheme');
        expect(props).toHaveProperty('version');
    });

    it('accessRuleSchema validates one inline rule entry on its own', () => {
        const validateRule = new Ajv({ strict: false }).compile(
            accessRuleSchema,
        );
        const rule = {
            id: 'r2',
            name: 'Classification level',
            attribute: 'clearance.level',
            categoryId: 'classification',
            strategy: 'gte',
        };
        expect(validateRule(rule)).toBe(true);
        // Negative controls: a rule without its id, a rule with an unknown
        // key, and a whole rules block are each refused.
        expect(validateRule({ name: 'Classification level' })).toBe(false);
        expect(validateRule({ ...rule, extra: true })).toBe(false);
        expect(validateRule({ inline: [rule] })).toBe(false);
    });

    it('accessRuleSchema includes definitions so $ref pointers resolve', () => {
        expect(accessRuleSchema).toHaveProperty('definitions');
        const ruleDef = (
            accessRuleSchema.definitions as Record<string, unknown>
        ).AccessRuleEntry as Record<string, unknown>;
        const ruleProps = ruleDef.properties as Record<string, unknown>;
        expect(ruleProps).toHaveProperty('id');
        expect(ruleProps).toHaveProperty('name');
        expect(ruleProps).toHaveProperty('attribute');
        expect(ruleProps).toHaveProperty('strategy');
    });

    it('accessSchemaDefs carries AccessRuleEntry and AccessRule definitions', () => {
        const defs = accessSchemaDefs as Record<string, unknown>;
        expect(defs).toHaveProperty('AccessRuleEntry');
        expect(defs).toHaveProperty('AccessRule');
    });
});
