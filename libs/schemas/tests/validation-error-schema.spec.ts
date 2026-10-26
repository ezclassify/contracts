import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import Ajv from 'ajv';
import { describe, expect, it } from 'vitest';

/**
 * The generated validation error schema, exercised with the did-you-mean an
 * error about an unread token carries. The member is optional, but when it is
 * there it names at least one concept: an empty list would read as a hint that
 * names nothing, and a host deciding whether the token was meant as a marking
 * must not have to tell that apart from no hint at all.
 */

const packageRoot = path.resolve(
    path.dirname(fileURLToPath(import.meta.url)),
    '..',
);

function compile(file: string) {
    const schema = JSON.parse(
        readFileSync(
            path.join(packageRoot, 'generated', 'json-schemas', file),
            'utf8',
        ),
    ) as object;
    return new Ajv({ allErrors: true, strict: false }).compile(schema);
}

const validateError = compile('validation-error.schema.json');

/**
 * A misspelling of a concept a layer respells: the message names the spelling
 * the author sees, and `didYouMean` names the concept by its id.
 */
const misspelled = {
    constraintId: '_unmatched_token',
    message:
        '"CRITCAL" was not recognized: it matched no known concept and will be kept visible in the rendered marking. Did you mean "CRITICAL"?',
    didYouMean: ['HIGH'],
};

describe('validation-error.schema.json', () => {
    it('accepts an unread token error that names the concepts it may have meant', () => {
        expect(
            validateError(misspelled),
            JSON.stringify(validateError.errors),
        ).toBe(true);
        expect(
            validateError({ ...misspelled, didYouMean: ['HIGH', 'MED'] }),
            JSON.stringify(validateError.errors),
        ).toBe(true);
    });

    it('accepts the same error with no hint, because the member is optional', () => {
        const { didYouMean: _, ...withoutHint } = misspelled;
        expect(
            validateError(withoutHint),
            JSON.stringify(validateError.errors),
        ).toBe(true);
    });

    it('refuses a hint that names no concept', () => {
        expect(validateError({ ...misspelled, didYouMean: [] })).toBe(false);
        expect(validateError.errors?.map((error) => error.keyword)).toEqual([
            'minItems',
        ]);
    });

    it('refuses a hint that is not a list of concept ids', () => {
        expect(validateError({ ...misspelled, didYouMean: 'HIGH' })).toBe(
            false,
        );
        expect(validateError({ ...misspelled, didYouMean: [7] })).toBe(false);
    });

    it('holds the errors of a validate result to the same rule', () => {
        const validateResult = compile('validate-result.schema.json');
        const result = {
            assertions: [],
            valid: false,
            inputWasValid: false,
            errors: [
                {
                    constraintId: '_recognition_incomplete',
                    message:
                        'The input does not read as a marking.',
                },
                misspelled,
            ],
            warnings: [],
            appliedFixes: [],
            rendered: 'CRITCAL',
            assessment: {
                emitted: [],
                omitted: [],
                collapsed: [],
                conflicts: [],
                unrepresentable: [],
            },
            notices: [],
        };
        expect(
            validateResult(result),
            JSON.stringify(validateResult.errors),
        ).toBe(true);
        result.errors[1] = { ...misspelled, didYouMean: [] };
        expect(validateResult(result)).toBe(false);
    });
});
