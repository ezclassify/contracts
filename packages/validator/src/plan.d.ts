/**
 * The plan walker, published at `@ezclassify/validator/internal/plan` for an
 * engine that compiles formats against the same contract. Not a public API: its
 * shapes follow the walker and may change in any release. The diagnostic ids
 * are public through the package root as `PLAN_DIAGNOSTICS`.
 *
 * @module
 */

/**
 * Whether a diagnostic stops the document or advises about it. An error means
 * the document does not describe an output; a warning means it does, and
 * something about it is worth knowing before a value arrives.
 */
export type PlanSeverity = 'error' | 'warning';

/** One problem the plan walker found in a scheme's formats. */
export interface PlanDiagnostic {
    /** Stable diagnostic id, one of {@link PLAN_DIAGNOSTICS}. */
    id: string;
    /** Whether this stops the document or advises about it. */
    severity: PlanSeverity;
    /** JSON pointer to where in the document the problem is. */
    path: string;
    /** What is wrong and what would fix it. */
    message: string;
}

/**
 * One node of a compiled format tree. The node shapes are the walker's working
 * representation, discriminated by `kind`; a consumer that needs a node's
 * fields types them itself.
 */
export interface PlanNode {
    /** The node shape: `sequence`, `binding`, `alternatives`, and so on. */
    readonly kind: string;
    /** JSON pointer of the authored field the node came from. */
    readonly path?: string;
    readonly [field: string]: unknown;
}

/** One render format of a scheme, compiled into its plan tree. */
export interface PlanFormat {
    /** The format's id. */
    id: string;
    /** The scope id of the surface the format writes. */
    surface?: string;
    /** `inline` runs the fields together; `block` puts each on its own line. */
    mode?: 'inline' | 'block';
    /** The format's authored syntax block. */
    syntax?: {
        /** Encoding, such as `text` or `xml-attributes`. */
        type: string;
        [key: string]: unknown;
    };
    /** Root of the compiled field tree. */
    root: PlanNode;
}

/** Every diagnostic id the plan walker can report. */
export declare const PLAN_DIAGNOSTICS: Readonly<Record<string, string>>;

/** The diagnostic ids that are warnings; every other id is an error. */
export declare const PLAN_DIAGNOSTIC_SEVERITY: Readonly<
    Record<string, PlanSeverity>
>;

/**
 * The severity of one diagnostic id.
 *
 * @param id - A diagnostic id
 * @returns `'warning'` for an advisory id, `'error'` for anything else
 */
export function severityOf(id: string): PlanSeverity;

/**
 * Work out which concept heads each tiered concept of one field composes under,
 * from that field's resolved vocabulary.
 *
 * @param input - The field's concepts, its tier declarations, its resolved view
 *   and its JSON pointer
 * @returns Each tiered concept's head, the concepts with more than one eligible
 *   head, and the diagnostics found
 */
export function resolveTierHeadRelation(input: {
    /** The concepts the field binds, as the scheme document declares them. */
    concepts: readonly object[];
    /** The field's `tiers` declarations. */
    tiers: readonly object[];
    /** The concept view the field writes. */
    fieldView: string;
    /** JSON pointer of the field, used in diagnostic paths. */
    path: string;
}): {
    /** Each tiered concept's id mapped to the id of its head concept. */
    headByConcept: Map<string, string>;
    /** Ids of tiered concepts with more than one eligible head. */
    ambiguousConcepts: Set<string>;
    /** Problems found while resolving heads. */
    diagnostics: PlanDiagnostic[];
};

/**
 * Compile a scheme document's formats into plan trees and report every
 * compile-time problem. Nothing is recognized and nothing is rendered.
 *
 * @param document - A parsed scheme document, `{ scheme: ... }`
 * @returns The compiled formats and the diagnostics
 */
export function compilePlan(document: unknown): {
    /** One compiled plan per render format the scheme declares. */
    formats: PlanFormat[];
    /** Every compile-time problem found, errors and warnings alike. */
    diagnostics: PlanDiagnostic[];
};
