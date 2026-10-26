import type {
    DocumentKind,
    DocumentValidationResult,
    ValidationIssue,
} from './validation-result.js';

export type {
    DocumentKind,
    DocumentValidationResult,
    ValidationIssue,
} from './validation-result.js';
export { PLAN_DIAGNOSTICS } from './plan.js';

/** Every diagnostic id the scheme rule checks can report. */
export declare const RULE_DIAGNOSTICS: Readonly<Record<string, string>>;

/**
 * The published JSON Schema for each document kind, keyed by the envelope key a
 * document of that kind carries at its top level.
 */
export declare const SCHEMAS: Readonly<Record<DocumentKind, object>>;

/**
 * The result of validating one document. `kind` is absent when no document kind
 * was detected, and `ok` reads the errors only.
 */
export interface ValidationResult {
    /** `true` when `errors` is empty. Warnings do not affect it. */
    ok: boolean;
    /** The kind the document was validated as, when one was detected. */
    kind: DocumentKind | undefined;
    /** Problems that make the document invalid. */
    errors: ValidationIssue[];
    /** Problems worth knowing that do not make the document invalid. */
    warnings: ValidationIssue[];
}

/** {@link ValidationResult} plus the file it came from. */
export interface FileValidationResult extends ValidationResult {
    /** Path of the validated file, as it was given or found. */
    file: string;
}

/**
 * Parse a document from disk. `.json` is parsed as JSON so a malformed one
 * reports a JSON error; everything else is parsed as YAML.
 *
 * @param file - Path to the document
 * @returns The parsed document
 * @throws {Error} When the file cannot be read or parsed
 */
export function parseDocument(file: string): unknown;

/**
 * Infer a document's kind from its envelope key.
 *
 * @param document - A parsed document
 * @returns The kind, or `undefined` when the document carries no known envelope
 */
export function detectKind(document: unknown): DocumentKind | undefined;

/**
 * Validate one parsed document against the published schema for its kind.
 *
 * @param document - The parsed document
 * @param kind - Explicit kind; inferred from the envelope when omitted
 * @returns The result for that document
 * @throws {Error} When `kind` names no document kind
 */
export function validateDocument<K extends DocumentKind>(
    document: unknown,
    kind: K,
): DocumentValidationResult<K>;
export function validateDocument(document: unknown): ValidationResult;

/**
 * Validate one file on disk. A parse failure is reported as a failed result
 * rather than thrown.
 *
 * @param file - Path to the document
 * @param kind - Explicit kind; inferred from the envelope when omitted
 * @returns The result for that file
 */
export function validateFile(
    file: string,
    kind?: DocumentKind,
): FileValidationResult;

/**
 * Collect candidate document paths from a file or a directory, walked
 * recursively and skipping `node_modules` and dot-directories.
 *
 * @param target - File or directory path
 * @returns The candidate paths, sorted
 */
export function collectDocuments(target: string): string[];

/**
 * Validate every document under the given files and directories. A file with no
 * recognized envelope found by walking a directory is skipped; a file named
 * explicitly is always validated.
 *
 * @param targets - Files or directories
 * @param options - `kind` to force one document kind
 * @returns One result per validated file
 */
export function validateTargets(
    targets: readonly string[],
    options?: { kind?: DocumentKind },
): FileValidationResult[];
