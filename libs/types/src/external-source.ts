/**
 * Closed set of credential providers a 1.0 deployment can resolve. Future
 * providers (k8s-secret URI, AWS Secrets Manager, etc.) require an explicit
 * extension to this union; strings outside this set must be rejected at parse
 * time.
 *
 * @public
 */
export type CredentialProviderId = 'env' | 'file' | 'secret-store';

/**
 * A reference to a piece of secret material, never the material itself.
 * `provider` says where the server finds it when the source issues a request:
 * `env` reads an environment variable (or a certificate and key pair of them),
 * `file` reads a mounted file (or a certificate and key pair of files), and
 * `secret-store` asks the secret store the deployment names for the secret
 * with that id.
 *
 * Browsers never see raw secrets, only the reference. The material stays on
 * the server that resolves it.
 *
 * @public
 */
export type SecretRefDoc =
    | {
          /** Read the secret from an environment variable. */
          provider: 'env';
          /** Name of the environment variable that holds the secret. */
          envVar: string;
      }
    | {
          /** Read a certificate and key pair from two environment variables. */
          provider: 'env';
          /** Environment variable that holds the PEM certificate. */
          certVar: string;
          /** Environment variable that holds the PEM private key. */
          keyVar: string;
      }
    | {
          /** Read the secret from a mounted file. */
          provider: 'file';
          /**
           * Path of the file that holds the secret. It must lie under a file
           * root the deployment allows.
           */
          path: string;
      }
    | {
          /** Read a certificate and key pair from two mounted files. */
          provider: 'file';
          /** Path of the PEM certificate file, under an allowed file root. */
          certPath: string;
          /** Path of the PEM private key file, under an allowed file root. */
          keyPath: string;
      }
    | {
          /** Ask the deployment's secret store for the secret. */
          provider: 'secret-store';
          /** The id of the secret in that store. */
          secretId: string;
      };

/**
 * Request-level authentication on an external source. `flow` selects the
 * registered handler (Basic, Bearer, a named header, AWS-SigV4, OAuth2 client
 * credentials) that decorates each request; the credential refs are
 * provider-specific opaque ids that are resolved server-side.
 *
 * Certificates are not request-level. A client certificate for mutual TLS, and
 * a CA bundle for a private upstream, belong to the connection and are
 * declared in the source's `tls` block.
 *
 * @public
 */
export interface ExternalSourceAuth {
    /** Registered AuthFlowHandler id. */
    flow: 'none' | 'basic' | 'bearer' | 'header' | 'aws-sigv4' | 'oauth2-cc';
    /** Single primary credential, used by `basic`, `bearer`, `header`. */
    credentialRef?: SecretRefDoc;
    /** OAuth2 client credential, used by `oauth2-cc`. */
    clientCredentialRef?: SecretRefDoc;
    /** AWS access key ref, used by `aws-sigv4`. */
    accessKeyRef?: SecretRefDoc;
    /** AWS secret access key ref, used by `aws-sigv4`. */
    secretKeyRef?: SecretRefDoc;
    /** Optional scopes / region / token endpoint params, provider-specific. */
    params?: Record<string, string>;
}

/**
 * TLS settings for an HTTP external source's connections. They apply to
 * requests to `source` and to same-origin redirects. Any `tls` setting pins the
 * source to its origin, so a cross-origin redirect is refused. Server
 * verification is always on and cannot be turned off here.
 *
 * Declare at least one field, and give `keyPassphraseRef` only together with
 * `clientCertAndKeyRef`. The block is valid only on an `http` transport whose
 * `source` is an `https:` URL; the runtime refuses it anywhere else when it
 * builds the source.
 *
 * @minProperties 1
 * @if {"required":["keyPassphraseRef"]}
 * @then {"required":["clientCertAndKeyRef"]}
 * @public
 */
export interface ExternalSourceTls {
    /**
     * PEM CA bundle that verifies the upstream server certificate. Resolves to
     * a string-secret. When set, it replaces the platform's default roots for
     * this source. The material is public, but it is referenced rather than
     * inlined so the deployment can rotate it without a new artifact version.
     */
    caBundleRef?: SecretRefDoc;
    /**
     * Client certificate and private key presented in the handshake (mutual
     * TLS). Resolves to a cert-and-key-pair.
     */
    clientCertAndKeyRef?: SecretRefDoc;
    /**
     * Passphrase for an encrypted private key in `clientCertAndKeyRef`.
     * Resolves to a string-secret. Requires `clientCertAndKeyRef`. Leave it
     * unset when the pair already carries its passphrase; supplying both is
     * refused.
     */
    keyPassphraseRef?: SecretRefDoc;
}

/**
 * Pagination shape declared on an HTTP transport.
 *
 * A read follows the declared style until the style's last page, and fails
 * rather than return a partial set when it cannot get there: a failed page, a
 * repeated continuation or page, or a read past the host's page, record or
 * time limit. The page size, for every style, is the `queryParams.pageSize`
 * parameter.
 *
 * The `page` and `offset` styles compute the next request themselves, so an
 * empty page is the only page that ends the read; a short page does not,
 * because the upstream's page size is not something the read trusts. The
 * `cursor` and `link-header` styles follow the continuation the upstream
 * returns, and the read ends at the first page that names none.
 *
 * @public
 */
export type ExternalSourcePagination =
    | {
          /** The upstream answers in a single response. */
          style: 'none';
      }
    | {
          /**
           * The upstream pages by page number: `start` first, then one more
           * per page, until a page comes back empty.
           */
          style: 'page';
          /** Name of the query parameter that carries the page number. */
          pageParam: string;
          /**
           * The number of the first page, usually `0` or `1`.
           *
           * @asType integer
           */
          start: number;
      }
    | {
          /**
           * The upstream pages by record offset: `0` first, then the previous
           * offset plus the records that page returned, until a page comes
           * back empty.
           */
          style: 'offset';
          /** Name of the query parameter that carries the record offset. */
          offsetParam: string;
      }
    | {
          /**
           * The upstream pages by an opaque cursor it returns. The read ends at
           * the first page whose response names no next cursor.
           */
          style: 'cursor';
          /** Name of the query parameter that carries the cursor. */
          cursorParam: string;
          /** Dot-path in the response body to the next page's cursor. */
          nextField: string;
      }
    | {
          /**
           * The upstream links the next page in its `Link` response header.
           * The read ends at the first page whose response links no next page.
           */
          style: 'link-header';
      };

/**
 * Upstream-specific query-parameter names for an HTTP external source. Each
 * field overrides the transport's built-in default name (`search` → `q`,
 * `prefix` → `prefix`, `scope` → `scope`, `pageSize` → `pageSize`) so a
 * customer mapping an upstream that searches via `?query=` or `?filter=` isn't
 * stuck with the transport's own convention. Page continuation parameters
 * belong to the `pagination` block.
 *
 * @public
 */
export interface ExternalSourceQueryParams {
    /** Name of the query parameter that carries a search term. Default `q`. */
    search?: string;
    /**
     * Name of the query parameter that carries a prefix to match. Default
     * `prefix`.
     */
    prefix?: string;
    /** Name of the query parameter that carries a scope. Default `scope`. */
    scope?: string;
    /**
     * Name of the query parameter that carries the page size, for every
     * pagination style. Default `pageSize`.
     */
    pageSize?: string;
}

/**
 * Capability hints declared on an external source. The compiler infers defaults
 * from the mapping shape; an explicit block overrides inference.
 *
 * @public
 */
export interface ExternalSourceCapabilities {
    /**
     * How the upstream resolves an alias to a concept: `exact` for literal
     * matches, `fuzzy` for tolerant ones, or `none` when it cannot.
     */
    resolveAliases?: 'exact' | 'fuzzy' | 'none';
    /** Whether the upstream answers a free-text search. */
    search?: boolean;
    /** Whether the upstream answers a prefix lookup. */
    prefixMatch?: boolean;
    /** Whether the upstream can list a concept's ancestors. */
    ancestorsOf?: boolean;
    /** Whether the upstream can list a concept's children. */
    childrenOf?: boolean;
    /**
     * Whether the upstream can be browsed page by page. Used by authoring
     * tools, not by the runtime.
     */
    enumerate?: boolean;
    /**
     * Whether the upstream reports how many records it holds. Used by authoring
     * tools.
     */
    count?: boolean;
}

/**
 * One category membership in a concept mapping, applied only to the records
 * that satisfy its condition.
 *
 * A bare string entry in `categories` gives every record the same membership.
 * That is right for a category every record belongs to and wrong for one that
 * holds for most of them, which is why this form exists: the membership is
 * still declared once, and the condition says which records it reaches.
 *
 * `when` and `unless` are conditions over the record. A bare field holds when
 * it is present and not empty; `field == 'X'`, `field != 'X'` and
 * `field in ['X', 'Y']` compare projected values as strings. Declare one or the
 * other, whichever reads as the plainer sentence.
 *
 * @public
 */
export interface ConceptCategoryMappingDoc {
    /** Expression for the category id, or ids, this entry contributes. */
    id: string;
    /** Apply the membership only to records this condition holds for. */
    when?: string;
    /** Apply the membership to every record except those this condition holds for. */
    unless?: string;
}

/**
 * Mapping spec for an external concept source: declarative projection of
 * upstream records into canonical Concept fields. Expression strings use a
 * small JMESPath subset: field paths, literal and wildcard indexes, quoted
 * literals, `@`, `+` concatenation, and `??` for the first present operand.
 *
 * @public
 */
export interface ConceptMappingDoc {
    /** Selector for the array of records on a transport response. */
    record?: string;
    /**
     * Condition, in the same expression subset as `record`, evaluated against
     * each upstream record. A record it holds for is dropped before any concept
     * is projected, so the omitted records are absent from enumerate, count,
     * search and resolve alike.
     *
     * Use it when the upstream snapshot is the right source of truth and a few
     * of its records have no representation in the scheme being built. Every
     * field the condition names must exist on the records, or the source fails
     * to load.
     */
    omit?: string;
    /** How each record's fields project onto a concept. */
    concept: {
        /**
         * Expression for the concept id. A record that yields none is refused.
         */
        id: string;
        /** Expression for the display name. Falls back to the id. */
        name?: string;
        /** Expressions for the concept's aliases, one per entry. */
        aliases?: string[];
        /**
         * Expression for the concept's parent concept ids: one id or a list of
         * them.
         */
        parents?: string;
        /**
         * The categories each record's concept belongs to: an expression or
         * list of expressions for category ids, or conditional memberships.
         */
        categories?: (string | ConceptCategoryMappingDoc)[] | string;
        /**
         * Expressions for the concept's display representations, keyed by view
         * name. The `default` view falls back to the name.
         */
        views?: Record<string, string>;
        /**
         * Expression for the concept's numeric rank. A value that does not
         * convert to a number leaves the concept unranked.
         */
        rank?: string;
        /**
         * Expression for the concept's numeric render position. A value that
         * does not convert to a number gives position 0.
         */
        position?: string;
        /**
         * Expression that marks the concept deprecated when it yields a truthy
         * value.
         */
        deprecated?: string;
        /**
         * Expression for a human-readable definition (concept.definition on the
         * output).
         */
        definition?: string;
        /** Expression for usage guidance text (concept.guidance on the output). */
        guidance?: string;
        /**
         * Expression for the provenance citation (concept.citation on the
         * output). A record that carries its own citation keeps it; a source
         * whose citation is the same for every record can supply a literal.
         */
        citation?: string;
        /**
         * Declares that the upstream supports a search call and names the query
         * parameter that carries the search term. Presence infers
         * `capabilities.search` and `capabilities.prefixMatch`, and supplies
         * the transport's default search parameter name unless
         * `queryParams.search` overrides it.
         */
        search?: {
            /** Name of the query parameter that carries the search term. */
            queryParam: string;
        };
    };
}

/**
 * Mapping spec for an external guide-rule source: declarative projection of
 * upstream records into guide rules. Every value is an expression in the same
 * subset a concept mapping uses, evaluated against one record.
 *
 * @public
 */
export interface RuleMappingDoc {
    /** Selector for the array of records on a transport response. */
    record?: string;
    /** How each record's fields project onto a guide rule. */
    rule: {
        /** Expression for the rule id. A record that yields none is refused. */
        id: string;
        /** Expression for the display name. Falls back to the id. */
        name?: string;
        /** Expression for the rule's description. */
        description?: string;
        /** One expression, or a list of them, for the rule's keywords. */
        keywords?: string[] | string;
        /** Expression for the guide category the rule is listed under. */
        category?: string;
        /**
         * What the rule contributes to the marking when it is activated. Give
         * either or both.
         */
        outcome?: {
            /** Expression for a pre-rendered marking string. */
            rendered?: string;
            /**
             * Expression for a list of concepts. Each item is a concept id, or
             * an object with `id` (or `conceptId`) and optional `category` (or
             * `categoryId`) and `value`.
             */
            concepts?: string;
        };
    };
}

/**
 * Mapping spec for an external access-rule source: declarative projection of
 * upstream records into simple-mapping access rules. Every value is an
 * expression evaluated against one record.
 *
 * @public
 */
export interface AccessMappingDoc {
    /** Selector for the array of records on a transport response. */
    record?: string;
    /** How each record's fields project onto an access rule. */
    access: {
        /** Expression for the rule id. A record that yields none is refused. */
        id: string;
        /** Expression for the display name. Falls back to the id. */
        name?: string;
        /** Expression for the user attribute the rule reads (dot-path). */
        attribute?: string;
        /** Expression for the category the attribute is compared against. */
        categoryId?: string;
        /** Expression for the comparison strategy. */
        strategy?: string;
    };
}

/**
 * Provenance attached to every external source. Mirrors the runtime
 * `Attribution` declared in `./source.ts`; redeclared here so the YAML
 * schema can validate it without depending on the runtime source contract.
 *
 * @public
 */
export interface AttributionDoc {
    /** Display name of the upstream source. */
    name: string;
    /** SPDX identifier or short license token, such as `CC-BY-4.0`. */
    license: string;
    /** Canonical URL where the license terms can be inspected. */
    licenseUrl?: string;
    /** Suggested citation for the source. */
    citation?: string;
}

/**
 * Discriminated transport union for an external source. `transport` is inferred
 * from the URI scheme when omitted (`https://` → `http`, `file://` → `file`, no
 * scheme → `inline-data`); explicit values win.
 *
 * @public
 */
export type ExternalSourceTransport = 'http' | 'file' | 'inline-data';

/**
 * The body of an `external:` block on a concept / guide-rule / access source.
 * The mapping field is one of `ConceptMappingDoc`, `RuleMappingDoc`,
 * or `AccessMappingDoc` depending on which artifact this block belongs
 * to.
 *
 * @public
 */
export interface ExternalSourceSpec<
    TMapping = ConceptMappingDoc | RuleMappingDoc | AccessMappingDoc,
> {
    /**
     * Stable identifier for this source within the containing artifact.
     * Required when multiple external sources appear on the same scheme; the
     * loader synthesizes `external-${i}` when the field is absent.
     */
    id?: string;
    /** URI for the upstream: http(s), file://, or inline:// (rare). */
    source: string;
    /** Inferred from `source` when omitted. */
    transport?: ExternalSourceTransport;
    /** HTTP-only knobs. Ignored for non-http transports. */
    pagination?: ExternalSourcePagination;
    /** HTTP-only: override the transport's default query-parameter names. */
    queryParams?: ExternalSourceQueryParams;
    /**
     * HTTP only: the connection's TLS settings (a private CA, a client
     * certificate for mutual TLS). Independent of `auth`, so a source can
     * present a client certificate and a bearer token together. A source whose
     * only credential is its client certificate has `tls` and no `auth`.
     */
    tls?: ExternalSourceTls;
    /** Request-level authentication, applied to each request. */
    auth?: ExternalSourceAuth;
    /** Static request headers (HTTP only). */
    headers?: Record<string, string>;
    /** Static query params (HTTP only). */
    query?: Record<string, string>;
    /**
     * Dot-path into the JSON response body that locates the records array (HTTP
     * only). Omit when the response body is itself the array. Use this for
     * upstreams that wrap their payload, e.g. GeoJSON
     * `FeatureCollection.features`, ArcGIS REST `features`, Elasticsearch
     * `hits.hits`.
     */
    recordsPath?: string;
    /** Declarative projection from foreign records into canonical shape. */
    mapping: TMapping;
    /**
     * Optional pin on the records this source serves: the sha256 records digest
     * the source reports for them, written `sha256:` followed by 64 lowercase
     * hex digits (the pattern `^sha256:[0-9a-f]{64}$`).
     * When it is set, the engine loads the artifact only if the source reports
     * the same digest, so an artifact version is immutable around it. To absorb
     * new data from upstream, mint a new artifact version with the new digest.
     *
     * A label such as a release name never matches and is refused; it belongs
     * in `attribution.citation`. Omit the pin for a best-effort live source
     * that cannot report a stable digest.
     *
     * @pattern ^sha256:[0-9a-f]{64}$
     */
    snapshotId?: string;
    /** Capability overrides. When omitted, inferred from `mapping`. */
    capabilities?: ExternalSourceCapabilities;
    /** Provenance for downstream attribution UIs. */
    attribution?: AttributionDoc;
    /** Per-instance rate-limit bucket. */
    rateLimit?: {
        /** Most requests allowed in one window. @asType integer */
        burst: number;
        /** Length of the window, in milliseconds. */
        windowMs: number;
    };
    /** Per-request timeout in ms. */
    timeoutMs?: number;
    // ---- Publisher fields ------------------------------------------------------
    //
    // Written by whoever published the artifact. `mappingHash` is the only one
    // the engine checks; the rest record how the publisher obtained the
    // source's records, and the engine accepts them without acting on them.

    /**
     * The publisher's anchor over this spec block: SHA-256 hex of its canonical
     * sorted-key JSON serialization, excluding this field. Whoever publishes
     * the artifact writes it. The engine recomputes it when it loads the
     * Context and refuses to load on a mismatch, so a block edited after
     * publication is caught. Absent means the block carries no anchor and
     * nothing is checked.
     */
    mappingHash?: string;
    /**
     * How the publisher obtained the records it published for this source:
     * `true` when it read the upstream as it composed the artifact, `false`
     * (the default) when it used a stored snapshot, named by `snapshotRef`.
     * Provenance only; the engine accepts it and does not act on it.
     */
    liveFetch?: boolean;
    /**
     * The publisher's content-addressed reference to the stored snapshot the
     * records came from, when `liveFetch` is `false`. Provenance only; the
     * engine accepts it and does not act on it.
     */
    snapshotRef?: string;
    /**
     * The publisher's opaque reference (`srcref:<uuid>`) to a source another
     * organization shared with it, when the records came through such a share.
     * Provenance only; the engine accepts it and does not act on it.
     */
    srcref?: string;
    /**
     * The publisher's opaque reference (`grantId:<uuid>`) to the sharing grant
     * under which it read the source `srcref` names. Provenance only; the
     * engine accepts it and does not act on it.
     */
    grantId?: string;
}
