/**
 * Format-coverage capability types.
 *
 * A render format is a _lossy projection_ of a marking's full assertion state:
 * its field tree selects which categories it emits, and its `view` selects
 * which concept-label channel it draws from. Categories no field writes never
 * appear in the rendered string, and a capture-value concept whose
 * resolved view label has no `{value}` channel renders without its captured
 * text. Consumers that treat a rendered string as a transport therefore risk
 * silently dropping alternate-scope assertions and capture values.
 *
 * Two static assessments live here, named for what they answer. {@link
 * FormatCoverage} is the **projection** assessment: given a format, which
 * categories its field tree can emit and which of those lose capture values.
 * {@link FormatCoverage.reconstruction} is the **reconstruction** assessment:
 * whether the semantics this format writes can be recovered from what it wrote,
 * and why not when they cannot. Both are answers about a format, so they stop
 * there. Whether a particular render of a particular state lost anything is a
 * question about that render, and `RenderResult.assessment` answers it.
 *
 * This type is a TS-adapter-level capability, deliberately **off the wire**: it
 * is not part of the OpenAPI / JSON-schema contract. It must never be added to
 * `libs/schemas/build.mjs`'s allowlist nor referenced from any wire-root type.
 */

/** Whether the semantics a format writes can be read back out of what it wrote. */
export type ReconstructionStatus = 'supported' | 'unsupported' | 'unknown';

/**
 * The reconstruction assessment for one format: can the facts this format
 * writes be recovered from its output, and if not, why not.
 *
 * Separate from projection on purpose. Projection says what a format is able to
 * emit; reconstruction says whether emitting it is reversible. A format can
 * cover every category and still be `unsupported`, because an arbitrary
 * predicate, an unbounded free-text field beside a fixed literal, or two
 * readings of one spelling can each stop the recovery of a fact that was
 * printed perfectly well.
 *
 * `unknown` is a real answer and not a hedge: a static proof can be defeated by
 * an external fact the compiler has no access to, and saying so is better than
 * a `supported` that is true only for the inputs someone happened to test.
 */
export interface FormatReconstruction {
    /** Whether semantic recovery from this format's output is supported. */
    status: ReconstructionStatus;
    /**
     * Why the status is what it is, one reason per obstacle. Empty for a plain
     * `supported`; never empty for `unsupported` or `unknown`.
     */
    reasons: string[];
}

/**
 * The coverage a single render format provides over a scheme's category set.
 *
 * Returned by `SchemeEngine.getFormatCoverage()`. Use it to see, before
 * rendering, which of a scheme's categories a format is able to write at all.
 *
 * It is not a transport-safety verdict: a field whose condition does not hold
 * still counts its category as covered. Whether a render lost anything is
 * answered per render, against the state actually rendered, by
 * `RenderResult.assessment`.
 *
 * @public
 */
export interface FormatCoverage {
    /** The render-format id this coverage describes. */
    formatId: string;
    /**
     * The scheme category ids this format's field tree emits, in scheme
     * order. Categories not listed here are dropped from the rendered string: a
     * marking that asserts them cannot be reconstructed from the render.
     */
    coveredCategories: string[];
    /**
     * The subset of {@link coveredCategories} that contain at least one
     * capture-value concept (a `textInput` concept, or a concept whose default
     * view carries a `{value}` channel) whose resolved view label _for this
     * format_ lacks a `{value}` channel and has no `textInput` append fallback.
     * The category is emitted, but the captured text is lost from the render.
     */
    valueLossyCategories: string[];
    /**
     * Whether the facts this format writes can be recovered from its output.
     *
     * `coveredCategories` answers what can be emitted; this answers whether
     * emitting it is reversible.
     */
    reconstruction: FormatReconstruction;
}
