import type { DocumentValidationResult } from './validation-result.js';

/**
 * Validate a parsed guide document against the published schema.
 *
 * @param document - A parsed guide document, `{ guide: ... }`
 * @returns The schema errors; warnings are always empty
 */
export function validateGuideDocument(
    document: unknown,
): DocumentValidationResult<'guide'>;
