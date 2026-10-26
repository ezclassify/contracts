import type { Concept } from './scheme';
import type { GuideRule } from './guide';
import type { AccessRuleEntry } from './access';
import type { MaybePromise } from './engine';
import type { SourceIdentity } from './provenance';

/**
 * Provenance attached to every source so downstream consumers can render proper
 * attribution and license notices.
 *
 * Mandatory because most source data we'll integrate (NIST, ICS, IANA, external
 * taxonomies) requires citation. Sources that don't have a formal license
 * should set `license: 'unspecified'` rather than omit it.
 *
 * @public
 */
export interface Attribution {
    /** Display name of the upstream source (e.g. "NIST CSWP-29"). */
    name: string;
    /**
     * SPDX identifier or short license token (e.g. "CC-BY-4.0",
     * "public-domain").
     */
    license: string;
    /** Canonical URL where the license terms can be inspected. */
    licenseUrl?: string;
    /** Suggested citation string for academic / regulatory use. */
    citation?: string;
}

/**
 * Capability declaration for a source. The mapping engine consults these flags
 * to plan which operations it can pushdown vs. emulate, and authoring tools use
 * them to enable / disable builder UI affordances.
 *
 * `resolveAliases` is graded: `'exact'` means only literal id / canonical- name
 * lookups, `'fuzzy'` adds tolerant matching, `'none'` disables alias resolution
 * entirely. The grade names the strongest mode a source honors, and a source
 * declaring `'fuzzy'` honors `'exact'` too, since exact is fuzzy narrowed.
 *
 * `enumerate` and `count` are paged or potentially expensive. Per-request
 * evaluation never calls them; the runtime enumerates a source only when a
 * Context materializes its records at load, and an authoring source picker uses
 * the flags to decide whether to offer a "browse all" UI.
 *
 * @internal
 */
export interface SourceCapabilities {
    /** Strongest alias-resolution mode the source honors. */
    resolveAliases: 'exact' | 'fuzzy' | 'none';
    /** The source can return a concept's ancestors through its parent links. */
    ancestorsOf: boolean;
    /** The source can return the direct children of a concept. */
    childrenOf: boolean;
    /** The source can autocomplete concepts from a typed prefix. */
    prefixMatch: boolean;
    /** The source can run a free-text search over its concepts. */
    search: boolean;
    /**
     * The source offers a cheap membership pre-check, so callers can skip
     * lookups for tokens it cannot hold.
     */
    mightContain: boolean;
    /**
     * Paged browse, used by authoring builders and by load-time
     * materialization in a Context.
     */
    enumerate: boolean;
    /** Cardinality reporting for builder UI. */
    count: boolean;
    /**
     * The full corpus cannot be enumerated. Concept lookups must go through
     * resolveAliases, get, prefixMatch, or search. The engine must not call
     * materializeConceptMap on a source with this flag set: it will not
     * return.
     *
     * Typical for sources backed by large external registries (name lists, code
     * catalogs) where the complete concept set is too large to hold in memory.
     * Set enumerate: false alongside this flag.
     */
    queryableOnly?: boolean;
}

/**
 * Identity, attribution, and capability metadata common to every source
 * (concepts, guide rules, access rules).
 *
 * `sourceIdentity()` reports whether the observed content is reproducible and
 * supplies an immutable snapshot identifier only when that claim is true. A
 * mutable endpoint URL is a locator, not a snapshot identity.
 *
 * @internal
 * @see {@link MarkingProcessorAdapter} , the same structural-adapter pattern:
 * a small interface that decouples upstream subsystems from concrete
 * implementations.
 */
export interface SourceMetadata {
    /** Id of the provider that backs this source. */
    readonly providerId: string;
    /** Upstream name, license and citation for the data the source serves. */
    readonly attribution: Attribution;
    /** Optional operations this source supports. */
    readonly capabilities: SourceCapabilities;
    /** Observe the source's truthful reproducibility and content identity. */
    sourceIdentity(): MaybePromise<SourceIdentity>;
}

/**
 * Options for an alias-resolution call.
 *
 * An implementation honors a field it advertises or rejects the call; it must
 * not silently ignore one. A request for a mode the source cannot serve, then
 * answered in the mode it can, returns a different concept set than the caller
 * asked for with nothing in the result to say so. The capability flags exist so
 * a caller can pick a mode the source advertises before it calls, and
 * {@link SourceCapabilities.resolveAliases} states which that is.
 *
 * @internal
 */
export interface ResolveAliasesOptions {
    /**
     * Resolution mode for this call, regardless of the source's default:
     * `'exact'` for literal matching only, `'fuzzy'` for tolerant matching.
     * Requesting `'fuzzy'` from a source that advertises `'exact'` is a caller
     * error, and the source rejects it.
     */
    mode?: 'exact' | 'fuzzy';
    /** Restrict resolution to a specific category / namespace. */
    scope?: string;
    /** Locale hint for case folding / diacritic stripping. */
    locale?: string;
}

/**
 * Options for `enumerate()`, a paged browse.
 *
 * @internal
 */
export interface EnumerateOptions {
    /**
     * Opaque, source-specific position to start browsing from. Omit it to start
     * at the beginning.
     */
    cursor?: string;
    /**
     * Advisory page size. A source backed by a paged upstream uses it as the
     * size of each upstream request; sources may return fewer or more entries.
     */
    pageSize?: number;
}

/**
 * A source of {@link Concept}s addressable by id, with optional alias
 * resolution, hierarchy navigation, and search.
 *
 * The mapping engine, authoring source pickers, and runtime concept lookups all
 * depend on this interface rather than a concrete implementation. Most methods
 * return `MaybePromise<T>` so that local in-memory sources (tests, file-backed)
 * can return synchronously while HTTP / DB-backed sources stay async at the
 * same call sites.
 *
 * The streaming methods (`childrenOf`, `prefixMatch`, `search`, `enumerate`)
 * return `AsyncIterable<Concept>` so paged or unbounded result sets do not have
 * to be materialized in memory. Callers that want the full list should use `for
 * await (const c of source.childrenOf(id)) ...`.
 *
 * `mightContain` is a synchronous, conservative pre-check (typically backed by
 * a Bloom filter or trie) used to avoid round-trips on negative lookups: false
 * positives are allowed, false negatives are not.
 *
 * @internal
 */
export interface ConceptSource extends SourceMetadata {
    /**
     * Looks up one concept by id.
     *
     * @param id - Concept id.
     * @returns The concept, or `undefined` when the source has none with that
     *   id.
     */
    get(id: string): MaybePromise<Concept | undefined>;
    /**
     * Looks up several concepts by id.
     *
     * @param ids - Concept ids.
     * @returns The concepts found, keyed by id. Ids the source does not hold
     *   are absent.
     */
    getMany(ids: readonly string[]): MaybePromise<Map<string, Concept>>;
    /**
     * Resolves marking tokens to the concepts whose views or aliases spell
     * them. Concept ids and names are not marking syntax and do not match.
     *
     * @param tokens - Tokens read from a marking.
     * @param opts - Resolution mode, scope and locale.
     * @returns Matching concepts keyed by the input token. Tokens with no match
     *   are absent; a token can match more than one concept.
     */
    resolveAliases(
        tokens: readonly string[],
        opts?: ResolveAliasesOptions,
    ): MaybePromise<Map<string, readonly Concept[]>>;
    /**
     * Walks each concept's `parents` links.
     *
     * @param ids - Concept ids.
     * @returns Each id's ancestors, nearest first, keyed by the input id.
     */
    ancestorsOf(
        ids: readonly string[],
    ): MaybePromise<Map<string, readonly Concept[]>>;
    /**
     * Concepts whose `categories` array contains `categoryId`. Indexed lookup
     * intended for inner-loop use by the parser, renderer, and rollup stages
     * (where iterating the full corpus per parse call is not affordable for
     * large taxonomies). Implementations are expected to memoize and amortize
     * the cost across calls.
     *
     * @param categoryId - Id of the category.
     */
    conceptsInCategory(categoryId: string): MaybePromise<readonly Concept[]>;
    /**
     * All concepts that declare a `tier` value. Used by the parser's
     * parent/child decomposition logic to enumerate the slice of the corpus
     * that composes with a parent through a format field's `tiers`.
     */
    tieredConcepts(): MaybePromise<readonly Concept[]>;
    /**
     * Direct children of `parentId`: concepts whose `parents` array contains
     * the supplied id. Sync, indexed equivalent of {@link childrenOf} for the
     * runtime hot paths that need O(1) descendant access.
     *
     * @param parentId - Id of the parent concept.
     */
    conceptsByParent(parentId: string): MaybePromise<readonly Concept[]>;
    /**
     * Streams the direct children of a concept.
     *
     * @param parentId - Id of the parent concept.
     * @returns Concepts whose `parents` include `parentId`.
     */
    childrenOf(parentId: string): AsyncIterable<Concept>;
    /**
     * Streams concepts a typed prefix could complete, for autocomplete. What
     * the prefix is compared with, such as ids, names, views and aliases, and
     * whether case matters, is up to the source.
     *
     * @param prefix - Text the user has typed so far.
     * @param limit - Maximum number of concepts to yield.
     * @returns Each matching concept once.
     */
    prefixMatch(prefix: string, limit?: number): AsyncIterable<Concept>;
    /**
     * Streams concepts that match a free-text query. What a source searches,
     * such as ids, names, documentation, views and aliases, is up to the
     * source.
     *
     * @param query - Search text.
     * @param limit - Maximum number of concepts to yield.
     * @returns Matching concepts.
     */
    search(query: string, limit?: number): AsyncIterable<Concept>;
    /**
     * Streams the source's concepts, for builder browsing and for load-time
     * materialization. A source flagged `queryableOnly` cannot be enumerated.
     *
     * @param opts - Starting cursor and page size.
     * @returns Concepts in source order.
     */
    enumerate(opts?: EnumerateOptions): AsyncIterable<Concept>;
    /**
     * Reports how many concepts the source holds, for builder UI.
     *
     * @returns The concept count.
     */
    count(): MaybePromise<number>;
    /**
     * Conservative membership check for a marking token. It may return `true`
     * for a token the source cannot resolve, but never `false` for one it can.
     *
     * @param token - Token read from a marking.
     * @returns `false` when the source certainly cannot resolve the token.
     */
    mightContain(token: string): boolean;
}

/**
 * Options accepted by `GuideRuleSource.scanForMatches`.
 *
 * `limit` caps the number of returned hits per call; `format` selects the
 * matcher dialect when a source supports more than one (e.g. plain text vs.
 * HTML).
 *
 * @internal
 */
export interface ScanForMatchesOptions {
    /** Maximum number of matches to return. */
    limit?: number;
    /** Matcher dialect for the input text, when the source supports several. */
    format?: string;
}

/**
 * A single rule match produced by `GuideRuleSource.scanForMatches`. Mirrors the
 * shape of `GuideScanResult` in `guide.ts` but is phrased in terms of the
 * source's rule type so it can be reused before a guide is composed.
 *
 * @internal
 */
export interface GuideRuleMatch {
    /** The rule whose pattern matched. */
    rule: GuideRule;
    /** Start offset of the match in the scanned text, in UTF-16 code units. */
    start: number;
    /** End offset of the match, exclusive, in UTF-16 code units. */
    end: number;
    /** The matched text. */
    matched: string;
}

/**
 * A source of `GuideRule`s addressable by id, with hooks for the scanner
 * pipeline. Parallels {@link ConceptSource}; the two interfaces are
 * intentionally shaped similarly so that the mapping engine can treat concept
 * and rule sources uniformly.
 *
 * `scanForMatches` is the rule-source equivalent of a search call: it returns
 * an async stream of matches against the supplied document text. It is an
 * optional pushdown for a source that can match patterns itself; the engine's
 * guide scan matches the rules from `checkableRules` or `enumerate` on its own
 * and does not depend on it.
 *
 * @internal
 */
export interface GuideRuleSource extends SourceMetadata {
    /**
     * Looks up one guide rule by id.
     *
     * @param id - Rule id.
     * @returns The rule, or `undefined` when the source has none with that id.
     */
    get(id: string): MaybePromise<GuideRule | undefined>;
    /**
     * Looks up several guide rules by id.
     *
     * @param ids - Rule ids.
     * @returns The rules found, keyed by id. Ids the source does not hold are
     *   absent.
     */
    getMany(ids: readonly string[]): MaybePromise<Map<string, GuideRule>>;
    /**
     * Streams the places in `text` where a rule's pattern matches. A source
     * with no matcher of its own may yield nothing; the engine's guide scan
     * does not call this method.
     *
     * @param text - Document text to scan.
     * @param opts - Match limit and input dialect.
     * @returns Each match with its rule and position.
     */
    scanForMatches(
        text: string,
        opts?: ScanForMatchesOptions,
    ): AsyncIterable<GuideRuleMatch>;
    /**
     * Streams the source's rules, for builder browsing and for load-time
     * materialization.
     *
     * @param opts - Starting cursor and page size.
     * @returns Rules in source order.
     */
    enumerate(opts?: EnumerateOptions): AsyncIterable<GuideRule>;
    /**
     * Reports how many rules the source holds, for builder UI.
     *
     * @returns The rule count.
     */
    count(): MaybePromise<number>;
    /**
     * Conservative membership check. It may return `true` for a token the
     * source does not hold, but never `false` for one it does.
     *
     * @param token - Token to check.
     * @returns `false` when the source certainly does not hold the token.
     */
    mightContain(token: string): boolean;
    /**
     * Return all checkable (non-`when`) rules. Pass `guideId` to scope to a
     * single guide.
     *
     * @param guideId - Guide to scope to. Omit it for every guide.
     */
    checkableRules(guideId?: string): GuideRule[];
}

/**
 * A source of resolved access-policy rules used by the engine, addressable by id. Parallels {@link ConceptSource} and
 * {@link GuideRuleSource}.
 *
 * `forSubject` returns the (possibly empty) set of rules that could apply to a
 * given `userAttributes` set; the access engine narrows this to the rules it
 * actually evaluates. Implementations may return all rules and let the engine
 * filter, or pre-filter using whatever indexing they have.
 *
 * @internal
 */
export interface AccessRuleSource extends SourceMetadata {
    /**
     * Looks up one access rule by id.
     *
     * @param id - Access rule id.
     * @returns The rule, or `undefined` when the source has none with that id.
     */
    get(id: string): MaybePromise<AccessRuleEntry | undefined>;
    /**
     * Looks up several access rules by id.
     *
     * @param ids - Access rule ids.
     * @returns The rules found, keyed by id. Ids the source does not hold are
     *   absent.
     */
    getMany(ids: readonly string[]): MaybePromise<Map<string, AccessRuleEntry>>;
    /**
     * Streams the rules that could apply to a subject. The access engine
     * evaluates them; a source may return every rule and leave the narrowing
     * to the engine.
     *
     * @param subjectAttributes - The subject's attributes.
     * @returns Candidate rules for the subject.
     */
    forSubject(
        subjectAttributes: Record<string, unknown>,
    ): AsyncIterable<AccessRuleEntry>;
    /**
     * Streams the source's rules, for builder browsing and for load-time
     * materialization.
     *
     * @param opts - Starting cursor and page size.
     * @returns Rules in source order.
     */
    enumerate(opts?: EnumerateOptions): AsyncIterable<AccessRuleEntry>;
    /**
     * Reports how many rules the source holds, for builder UI.
     *
     * @returns The rule count.
     */
    count(): MaybePromise<number>;
    /**
     * Conservative membership check. It may return `true` for a token the
     * source does not hold, but never `false` for one it does.
     *
     * @param token - Token to check.
     * @returns `false` when the source certainly does not hold the token.
     */
    mightContain(token: string): boolean;
}
