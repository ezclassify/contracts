import type { DocumentValidationResult } from './validation-result.js';

/**
 * Validate a parsed crosswalk document against the published schema.
 *
 * @param document - A parsed crosswalk document, `{ crosswalk: ... }`
 * @returns The schema errors; warnings are always empty
 */
export function validateCrosswalkDocument(
    document: unknown,
): DocumentValidationResult<'crosswalk'>;
