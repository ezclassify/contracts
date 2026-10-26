import type { DocumentValidationResult } from './validation-result.js';

/**
 * Validate a parsed context document against the published schema.
 *
 * @param document - A parsed context document, `{ context: ... }`
 * @returns The schema errors; warnings are always empty
 */
export function validateContextDocument(
    document: unknown,
): DocumentValidationResult<'context'>;
