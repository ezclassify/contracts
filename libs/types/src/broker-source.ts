/**
 * Per-call context handed to a broker source `fetch`.
 *
 * Carries who is asking (`callerOrgId`), which source they want (`srcref`), and
 * under which grant. The broker uses this to decide visibility and access; an
 * organization with no grant for the source returns
 * `SOURCE_NOT_VISIBLE_IN_ORG`.
 *
 * @internal
 */
export interface SourceContext {
    /** Stable reference to the source being fetched. */
    readonly srcref: string;
    /** Organization making the request: the unit of visibility and access. */
    readonly callerOrgId: string;
    /** Grant authorizing this organization's access, when one applies. */
    readonly grantId?: string;
    /** Provider-specific query parameters, validated by the broker. */
    readonly parameters?: Record<string, unknown>;
}

/**
 * Expected failure reasons returned by a broker source.
 *
 * - `SOURCE_NOT_VISIBLE_IN_ORG`: the caller's organization cannot view it.
 * - `GRANT_REVOKED`: access existed but the grant was withdrawn.
 * - `UPSTREAM_UNAVAILABLE`: the backing provider could not be reached.
 * - `MAPPING_FAILED`: upstream data did not project to the canonical shape.
 * - `RATE_LIMITED`: the caller exceeded the provider's request budget.
 * - `PARAM_INVALID`: a query parameter was rejected.
 * - `SNAPSHOT_STALE`: the pinned snapshot no longer matches the provider.
 *
 * @internal
 */
export type BrokerErrorCode =
    | 'SOURCE_NOT_VISIBLE_IN_ORG'
    | 'GRANT_REVOKED'
    | 'UPSTREAM_UNAVAILABLE'
    | 'MAPPING_FAILED'
    | 'RATE_LIMITED'
    | 'PARAM_INVALID'
    | 'SNAPSHOT_STALE';

/**
 * Successful broker fetch carrying projected canonical records.
 *
 * @internal
 */
export interface SourceOk<T> {
    /** Discriminator: the fetch succeeded. */
    readonly ok: true;
    /** Records the caller's organization may see, in canonical shape. */
    readonly items: T[];
}

/**
 * Expected broker failure. Known conditions use a {@link BrokerErrorCode};
 * providers may return a more specific code when necessary.
 *
 * @internal
 */
export interface SourceErr {
    /** Discriminator: the fetch failed with an expected condition. */
    readonly ok: false;
    /** Machine-readable failure reason. */
    readonly code: BrokerErrorCode | string;
    /** Human-readable explanation of the failure. */
    readonly message: string;
}

/**
 * Discriminated result of a broker fetch. Expected caller-facing conditions
 * return `ok: false`; unexpected programmer errors still throw normally.
 *
 * @internal
 */
export type SourceResult<T> = SourceOk<T> | SourceErr;

/**
 * Minimal concept identity served across the broker boundary, before any
 * scheme-specific mapping.
 *
 * @internal
 */
export interface SourceConcept {
    /** Stable concept id within the source. */
    readonly id: string;
    /** Display name of the concept. */
    readonly name: string;
    /** Alternate spellings that resolve to this concept. */
    readonly aliases?: string[];
}

/**
 * Concept broker contract. `providerId` identifies the backing provider and
 * `snapshotId` pins the served version for cache and staleness checks.
 *
 * @internal
 */
export interface BrokerConceptSource {
    /** Id of the provider that backs this source. */
    readonly providerId: string;
    /**
     * Version of the provider's data this source serves. Callers compare it to
     * detect a stale cache.
     */
    readonly snapshotId: string;
    /**
     * Returns the concepts the calling organization may see.
     *
     * @param ctx - Caller organization, source reference and grant.
     * @returns The concepts, or an expected failure.
     */
    fetch(ctx: SourceContext): Promise<SourceResult<SourceConcept>>;
}

/**
 * Guide rule served across the broker boundary.
 *
 * @internal
 */
export interface SourceGuideRule {
    /** Stable rule id within the source. */
    readonly id: string;
    /** Display name of the rule. */
    readonly name: string;
    /** Operator-facing guidance for applying the rule. */
    readonly description?: string;
}

/**
 * Guide-rule broker contract. It returns only the rules the caller's
 * organization is allowed to see.
 *
 * @internal
 */
export interface BrokerGuideRuleSource {
    /** Id of the provider that backs this source. */
    readonly providerId: string;
    /**
     * Version of the provider's data this source serves. Callers compare it to
     * detect a stale cache.
     */
    readonly snapshotId: string;
    /**
     * Returns the guide rules the calling organization may see.
     *
     * @param ctx - Caller organization, source reference and grant.
     * @returns The rules, or an expected failure.
     */
    fetch(ctx: SourceContext): Promise<SourceResult<SourceGuideRule>>;
}

/**
 * Access-rule entry served across the broker boundary.
 *
 * @internal
 */
export interface SourceAccessRuleEntry {
    /** Stable entry id within the source. */
    readonly id: string;
    /** Display name of the entry. */
    readonly name: string;
    /** Whether the entry grants (`true`) or denies access. */
    readonly allow?: boolean;
    /** Operator-facing explanation of the entry. */
    readonly description?: string;
}

/**
 * Access-rule broker contract. It returns only the entries the caller's
 * organization is allowed to see.
 *
 * @internal
 */
export interface BrokerAccessRuleSource {
    /** Id of the provider that backs this source. */
    readonly providerId: string;
    /**
     * Version of the provider's data this source serves. Callers compare it to
     * detect a stale cache.
     */
    readonly snapshotId: string;
    /**
     * Returns the access-rule entries the calling organization may see.
     *
     * @param ctx - Caller organization, source reference and grant.
     * @returns The entries, or an expected failure.
     */
    fetch(ctx: SourceContext): Promise<SourceResult<SourceAccessRuleEntry>>;
}

/**
 * Broker sources available to a context, keyed by source reference. Each map
 * holds one record kind; the matching map resolves a scheme, guide, or access
 * source reference to its broker.
 *
 * @internal
 */
export interface SourceProviderMap {
    /** Concept brokers by source reference. */
    conceptSources?: Map<string, BrokerConceptSource>;
    /** Guide-rule brokers by source reference. */
    guideRuleSources?: Map<string, BrokerGuideRuleSource>;
    /** Access-rule brokers by source reference. */
    accessRuleSources?: Map<string, BrokerAccessRuleSource>;
}
