/**
 * Types for `@ezclassify/conformance-server`.
 *
 * The implementation is plain ESM, like every other tool this repository
 * publishes. This file is the published shape of it, so a TypeScript harness
 * gets the same contract a JavaScript one reads out of the JSDoc.
 */

/** Authentication the replay server simulates. */
export type ConformanceAuthMode = 'none' | 'simulated';

/** Options for {@link startConformanceServer}. */
export interface ConformanceServerOptions {
    /** Port to listen on. 0 picks a free one. */
    port?: number;
    /** Interface to bind. Loopback by default. */
    host?: string;
    /** Authentication simulation. Off by default. */
    auth?: ConformanceAuthMode;
    /** Corpus JSON to replay. The bundled corpus by default. */
    corpus?: string;
    /** Named integration scenario. Mutually exclusive with corpus. */
    scenario?: string;
    /** Exact browser origin permitted for local development. No wildcard. */
    corsOrigin?: string;
    /**
     * Opt-in observations. Never receives request headers or credentials.
     *
     * @param exchange - The observed exchange
     */
    observe?: (exchange: ExchangeObservation) => void | Promise<void>;
    /**
     * Include request/response bodies in observations; these can contain
     * sensitive data.
     */
    observeBodies?: boolean;
    /** Request body ceiling, in bytes. */
    maxBodyBytes?: number;
    /**
     * Where unmatched requests are reported. `null` stays quiet.
     *
     * @param line - One line describing an unmatched request
     */
    log?: ((line: string) => void) | null;
}

/** What a running server loaded, as {@link ConformanceServer.corpus} reports it. */
export interface LoadedCorpusSummary {
    /** Absolute path the corpus was read from. */
    file: string;
    /** Corpus format version, as the artifact declares it. */
    corpusVersion: string;
    /** Cases in the file. */
    cases: number;
    /** Cases this server will answer from. */
    servable: number;
}

/** A running replay server, as {@link startConformanceServer} returns it. */
export interface ConformanceServer {
    /** Base URL to point a client at. */
    url: string;
    /** Port the server listens on. */
    port: number;
    /** Interface the server is bound to. */
    host: string;
    /** Authentication simulation in effect. */
    auth: ConformanceAuthMode;
    /** Selected integration profile, or null for strict conformance replay. */
    scenario: string | null;
    /** Restart per-request transient failure counters for this server. */
    resetScenario(): void;
    /** The corpus the server replays. */
    corpus: LoadedCorpusSummary;
    /** `info.version` of the contract the server validates against. */
    specVersion: string;
    /** Close listeners and connections. */
    stop(): Promise<void>;
}

/** One recorded exchange. */
export interface CorpusCase {
    /** Stable case id. Consumers name cases by it. */
    id: string;
    /** OpenAPI `operationId` of the operation the case exercises. */
    operationId?: string;
    /** One-line description of what the case shows. */
    summary?: string;
    /** The conditions the exchange was recorded under. No credential is stored. */
    auth: {
        /** Whether the recorded deployment required authentication. */
        deployment: 'open' | 'authenticated';
        /**
         * Kind of credential presented: `none`, `context-token` or
         * `invalid-bearer`.
         */
        credential: string;
    };
    /** The recorded request. */
    request: {
        /** HTTP method. */
        method: string;
        /** Request path, with any query string. */
        path: string;
        /** The OpenAPI path template the request matched. */
        pathTemplate?: string;
        /** Recorded request headers. */
        headers: Record<string, string>;
        /** Request body, when the request had one. */
        body?: unknown;
    };
    /** The recorded response. */
    response: {
        /** HTTP status code. */
        status: number;
        /** Recorded response headers. */
        headers: Record<string, string>;
        /** Response body. */
        body: unknown;
        /**
         * `false` when the contract declares no response for this status, as
         * for a request to an undeclared route or method.
         */
        statusDeclaredInContract: boolean;
    };
    /**
     * Present only for operations a client must not serve from cache, and says
     * why.
     */
    neverCache?: string;
}

/** A corpus file as {@link loadCorpus} reads and indexes it. */
export interface LoadedCorpus {
    /** Absolute path the corpus was read from. */
    file: string;
    /** Corpus format version, as the artifact declares it. */
    corpusVersion: string;
    /** Every case in the file. */
    cases: CorpusCase[];
    /** Cases the server answers from: open deployment, refusals removed. */
    servable: CorpusCase[];
    /** Servable cases keyed by method, canonical target and canonical body. */
    byKey: Map<string, CorpusCase>;
    /** The case whose response defines the wire's constant refusal. */
    denial: CorpusCase;
}

/** A corpus this server cannot serve from. Thrown at load, never per request. */
export declare class CorpusError extends Error {}

/**
 * Start a replay server over a corpus or a named integration scenario.
 *
 * @param options - Port, host, authentication simulation, corpus or scenario,
 *   and observation settings
 * @returns The running server; call `stop()` when the harness is done
 * @throws {CorpusError} When the corpus cannot be served
 */
export declare function startConformanceServer(
    options?: ConformanceServerOptions,
): Promise<ConformanceServer>;

/**
 * Read and index a corpus file.
 *
 * @param file - Corpus path; the bundled corpus when omitted
 * @returns The loaded corpus
 * @throws {CorpusError} When the corpus cannot be served
 */
export declare function loadCorpus(file?: string): LoadedCorpus;

/**
 * Read the provenance manifest that ships beside a corpus: the spec digest it
 * was validated against, the runtime that produced it, and the contract
 * divergences an SDK author needs to know about.
 *
 * @param file - Manifest path; the bundled manifest when omitted
 * @returns The parsed manifest, or `null` when it could not be read
 */
export declare function readManifest(
    file?: string,
): Record<string, unknown> | null;

/**
 * Canonical JSON: object keys ordered recursively, array order preserved.
 *
 * @param value - Any JSON value
 */
export declare function canonicalJson(value: unknown): string;

/**
 * Canonical request target: trailing slash dropped, query parameters ordered.
 *
 * @param target - Request target: a path with an optional query string
 */
export declare function canonicalTarget(target: string): string;

/**
 * Corpus index key for one exchange.
 *
 * @param method - HTTP method
 * @param target - Request target: a path with an optional query string
 * @param body - Parsed request body, when there is one
 */
export declare function matchKey(
    method: string,
    target: string,
    body?: unknown,
): string;

/** The one credential `auth: 'simulated'` accepts. */
export declare const TEST_BEARER_TOKEN: string;

/** `Bearer` header value carrying {@link TEST_BEARER_TOKEN}. */
export declare const TEST_AUTHORIZATION_HEADER: string;

/** Response header marking anything this server produced rather than replayed. */
export declare const DIAGNOSTIC_HEADER: string;

/** Absolute path of the corpus bundled with this package. */
export declare const BUNDLED_CORPUS_PATH: string;

/** Absolute path of the manifest bundled beside the corpus. */
export declare const BUNDLED_MANIFEST_PATH: string;

/**
 * One opt-in HTTP observation. This is test evidence, not a production audit
 * record.
 */
export interface ExchangeObservation {
    /** The selected integration scenario, or `null` for corpus replay. */
    scenario: string | null;
    /** Id of the corpus case that answered, when one did. */
    caseId?: string;
    /** OpenAPI `operationId` of the matched operation. */
    operationId?: string;
    /** The request as received. Headers are never included. */
    request: {
        /** HTTP method. */
        method: string;
        /** Request path without the query string, trailing slash dropped. */
        path: string;
        /** Parsed request body, only when `observeBodies` is set. */
        body?: unknown;
    };
    /** What the server sent back. */
    response: {
        /** HTTP status code, when a response started. */
        status?: number;
        /** `true` when the connection closed before the response finished. */
        disconnected: boolean;
        /** Name of the scenario that simulated this response, when one did. */
        simulated?: string;
        /** Response body, only when `observeBodies` is set. */
        body?: unknown;
    };
    /** Time from request to response end, in milliseconds. */
    durationMs: number;
}

/** Named integration fixture descriptions. */
export declare function listIntegrationScenarios(): {
    /** Scenario name, which `scenario` options take. */
    name: string;
    /** What the scenario does. */
    description: string;
}[];
/**
 * Detached supported exchanges for the selected integration profile.
 *
 * @param name - Scenario name. Defaults to `cedar-valley`
 */
export declare function readScenarioCases(name?: string): CorpusCase[];
/** Response header identifying a deliberately simulated integration failure. */
export declare const SIMULATION_HEADER: string;
