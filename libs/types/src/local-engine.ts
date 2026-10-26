/** In-process engine structures used by local Runtime subsystems. */

import type {
    Assertion,
    AggregateResult,
    ProcessResult,
    RenderResult,
    RenderPreservation,
    ProcessingContext,
    Scheme,
    ValidateResult,
} from './scheme';

/**
 * Timing breakdown (in milliseconds) for each pipeline stage and the total
 * processing duration.
 *
 * Use `totalTimeMs` to set performance budgets; use the per-stage fields to
 * identify bottlenecks. Stage times are wall-clock durations.
 *
 * @internal
 */
export type TelemetryData = {
    /** Time spent parsing the marking. */
    parseTimeMs: number;
    /** Time spent applying repair rules. */
    repairTimeMs: number;
    /** Time spent applying inference rules. */
    inferTimeMs: number;
    /** Time spent validating. */
    validateTimeMs: number;
    /** Time spent rendering. */
    renderTimeMs: number;
    /** Time for the whole operation, including work between stages. */
    totalTimeMs: number;
};

/**
 * Point-in-time capture of engine state including scheme identity, hash, and
 * configuration.
 *
 * Useful for cache invalidation (compare `schemeHash` between snapshots),
 * diagnostics, and telemetry. `conceptCount` and `config` describe the loaded
 * scheme at the moment the snapshot was taken and do not update when the
 * engine is later reconfigured.
 *
 * @internal
 */
export interface EngineSnapshot {
    /** The id of the loaded scheme. */
    schemeId: string;
    /** The version of the loaded scheme. */
    schemeVersion: string;
    /**
     * SHA-256 of the loaded scheme's serialized form, as hex. Equal hashes mean
     * the same loaded content.
     */
    schemeHash: string;
    /**
     * How many concepts the loaded scheme holds.
     *
     * @asType integer
     */
    conceptCount: number;
    /** When the snapshot was taken, as an ISO 8601 timestamp. */
    timestamp: string;
    /**
     * Summary of the loaded scheme's configuration, such as its default render
     * format and its category, rule and format counts.
     */
    config: Record<string, unknown>;
}

/**
 * What the scanner needs from the engine, so it does not import the engine
 * class.
 *
 * A scan reads each marking it finds the way validate reads one, in the role
 * the region has, and that read is the region's `result`. It never processes a
 * region: a scan has no author to correct the marking for.
 *
 * @internal
 */
export interface ScanProcessor {
    /**
     * Validates one marking the scan found.
     *
     * @param input - The marking text.
     * @param options - Input and output formats, the region's processing
     *   context, and a cancellation signal.
     * @returns The validation result for the region.
     */
    validate(
        input: string,
        options?: {
            inputFormat?: string;
            outputFormat?: string;
            context?: ProcessingContext;
            signal?: AbortSignal;
        },
    ): ValidateResult;
    /**
     * Renders assertions in a format.
     *
     * @param assertions - Assertions to render.
     * @param format - Render format id. Defaults to the scheme's default
     *   format.
     * @param options - Preservation of the reader's text and a cancellation
     *   signal.
     * @returns The rendered marking.
     */
    render(
        assertions: Assertion[],
        format?: string,
        options?: { preservation?: RenderPreservation; signal?: AbortSignal },
    ): RenderResult;
    /**
     * Returns the loaded runtime scheme, which the scanner reads for its
     * recognition patterns and formats.
     */
    _getInternalScheme(): Scheme;
}

/**
 * Minimal interface a marking processor must satisfy for in-process guide
 * evaluation. The local scheme engine satisfies this structurally; no import
 * dependency is required between the guide and scheme subsystems.
 *
 * A composed local Context supplies the processor to its guide engine. Remote
 * guide evaluation never sees this shape: the server holds both halves and the
 * caller names the guide, which is why the processor-taking members live only
 * on `LocalGuideEngineAdapter`.
 *
 * @internal
 */
export interface MarkingProcessorAdapter {
    /**
     * Processes a marking, given as text or as assertions.
     *
     * @param input - Marking text or assertions.
     * @param schemeId - Scheme to process against. Omit it for the
     *   default scheme.
     * @returns The process result.
     */
    process(input: string | Assertion[], schemeId?: string): ProcessResult;
    /**
     * Rolls several markings up into one.
     *
     * @param inputs - Marking texts.
     * @param schemeId - Scheme to aggregate against. Omit it for the
     *   default scheme.
     * @returns The aggregate result.
     */
    aggregate(inputs: string[], schemeId?: string): AggregateResult;
}
