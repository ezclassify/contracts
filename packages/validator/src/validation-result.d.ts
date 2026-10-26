/**
 * The kind of EzClassify document, named after the envelope key it carries at
 * its top level.
 */
export type DocumentKind =
    'access' | 'context' | 'crosswalk' | 'guide' | 'scheme';

/**
 * One problem found in a document. A schema failure carries `keyword` and
 * `params`; a rule or plan check carries a diagnostic `id` instead.
 */
export interface ValidationIssue {
    /**
     * JSON pointer to the offending value, such as `/scheme/rules/0`. Empty for
     * a problem with the document as a whole.
     */
    path: string;
    /** What is wrong, in words. */
    message: string;
    /** JSON Schema keyword that failed, such as `required` or `enum`. */
    keyword?: string;
    /** The failed keyword's parameters, such as the missing property name. */
    params?: Readonly<Record<string, unknown>>;
    /** Stable diagnostic id from a rule or plan check. */
    id?: string;
}

/** The result of validating a document whose kind is known. */
export interface DocumentValidationResult<K extends DocumentKind> {
    /** `true` when `errors` is empty. Warnings do not affect it. */
    ok: boolean;
    /** The kind the document was validated as. */
    kind: K;
    /** Problems that make the document invalid. */
    errors: ValidationIssue[];
    /** Problems worth knowing that do not make the document invalid. */
    warnings: ValidationIssue[];
}
