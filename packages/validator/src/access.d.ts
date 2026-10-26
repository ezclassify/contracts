import type { DocumentValidationResult } from './validation-result.js';

/**
 * Validate a parsed access document against the published schema.
 *
 * @param document - A parsed access document, `{ access: ... }`
 * @returns The schema errors; warnings are always empty
 */
export function validateAccessDocument(
    document: unknown,
): DocumentValidationResult<'access'>;
