import validate from './generated/guide.validator.mjs';
import { validateSchemaDocument } from './raw-validation.mjs';

/** Validate a parsed guide document without Node.js or runtime code generation. */
export function validateGuideDocument(document) {
    return validateSchemaDocument('guide', validate, document);
}
