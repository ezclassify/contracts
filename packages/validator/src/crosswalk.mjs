import validate from './generated/crosswalk.validator.mjs';
import { validateSchemaDocument } from './raw-validation.mjs';

/**
 * Validate a parsed crosswalk document without Node.js or runtime code
 * generation.
 */
export function validateCrosswalkDocument(document) {
    return validateSchemaDocument('crosswalk', validate, document);
}
