import validate from './generated/access.validator.mjs';
import { validateSchemaDocument } from './raw-validation.mjs';

/** Validate a parsed access document without Node.js or runtime code generation. */
export function validateAccessDocument(document) {
    return validateSchemaDocument('access', validate, document);
}
