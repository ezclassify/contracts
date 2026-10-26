import validate from './generated/context.validator.mjs';
import { validateSchemaDocument } from './raw-validation.mjs';

/**
 * Validate a parsed context document without Node.js or runtime code
 * generation.
 */
export function validateContextDocument(document) {
    return validateSchemaDocument('context', validate, document);
}
