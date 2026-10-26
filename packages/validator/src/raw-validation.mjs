/**
 * Normalize errors from a checked-in Ajv standalone validator.
 *
 * The standalone modules contain the canonical schema logic. This small layer
 * keeps the validator package's existing public diagnostic shape stable.
 *
 * @param {(document: unknown) => boolean} validate
 * @param {unknown} document
 */
export function schemaErrors(validate, document) {
    validate(document);
    return (validate.errors ?? []).map((error) => ({
        keyword: error.keyword,
        path: error.instancePath || '',
        message: error.message ?? 'is invalid',
        params: error.params ?? {},
    }));
}

/**
 * Validate one raw document against its canonical schema.
 *
 * @param {string} kind
 * @param {(document: unknown) => boolean} validate
 * @param {unknown} document
 */
export function validateSchemaDocument(kind, validate, document) {
    const errors = schemaErrors(validate, document);
    return { ok: errors.length === 0, kind, errors, warnings: [] };
}
