import type { DocumentValidationResult } from './validation-result.js';

/**
 * Validate a parsed scheme document: its schema shape and rule checks, then,
 * when those pass, the compiled plan of its formats.
 *
 * @param document - A parsed scheme document, `{ scheme: ... }`
 * @returns Errors and warnings from every check that ran
 */
export function validateSchemeDocument(
    document: unknown,
): DocumentValidationResult<'scheme'>;

/**
 * Validate a parsed scheme document's schema shape and rule checks only,
 * without compiling its formats. Use it for a layer, whose format references
 * may resolve only against its base.
 *
 * @param document - A parsed scheme document, `{ scheme: ... }`
 * @returns The schema and rule errors; warnings are always empty
 */
export function validateSchemeShape(
    document: unknown,
): DocumentValidationResult<'scheme'>;
