import type { MaybePromise } from './engine';

/**
 * A minimal HTTP request shape that auth handlers can mutate before a source
 * dispatches it. Kept narrow on purpose; sources that need richer fetch
 * semantics (streaming bodies, fetch-spec init) should accept this type and
 * adapt internally.
 *
 * @internal
 */
export interface HttpRequest {
    /** HTTP method, such as `GET` or `POST`. */
    method: string;
    /** Absolute URL the request is sent to, including any query string. */
    url: string;
    /**
     * Request headers by name. A handler adds credentials here, for example an
     * `Authorization` header.
     */
    headers: Record<string, string>;
    /** Request body, or `null` or absent when the request has none. */
    body?: string | Uint8Array | null;
}

/**
 * Per-call context passed to an auth handler. Carries the resolved
 * {@link Secret} and an optional opaque session bag the handler may read or
 * write to memoize tokens, refresh state, or replay nonces.
 *
 * Sources never construct this directly; the auth machinery does, after
 * resolving the source's credential reference (a `SecretRefDoc`).
 *
 * @internal
 */
export interface AuthContext {
    /**
     * The credential resolved from the source's `SecretRefDoc`. Flows that
     * need no credential receive an empty string secret.
     */
    secret: Secret;
    /**
     * Per-source declarative params from the `ExternalSourceAuth.params` block.
     * Handlers read flow-specific knobs from here (`header`, `format`,
     * `tokenEndpoint`, `scope`, `region`, `service`, ...). Treated as read-only
     * by handlers.
     */
    params?: Record<string, string>;
    /**
     * Free-form bag the handler may use to keep state, such as a token and its
     * expiry, between its `apply` and `refresh` calls. The HTTP transport
     * creates one per outgoing request and shares it across that request's
     * retries.
     */
    session?: Record<string, unknown>;
    /** Best-effort wall-clock for handlers that mint time-bounded headers. */
    now?: Date;
}

/**
 * A handler that knows how to apply a single auth flow (Basic, Bearer,
 * AWS-SigV4, OAuth2-CC, ...) to an outgoing request.
 *
 * Implementations are registered in a finite registry by `id`; sources
 * reference handlers by id in their declarative config. Browsers never hold raw
 * secrets: the secret resolver is the only place they land, and the handler
 * reads them via `ctx.secret`.
 *
 * `refresh` is optional: handlers backed by short-lived tokens (OAuth2, STS)
 * implement it so a rejected token can be renewed and the request retried;
 * handlers for static schemes (Basic, fixed Bearer) leave it undefined.
 *
 * @internal
 * @see {@link MarkingProcessorAdapter} , the same narrow id-keyed handler
 * pattern: a small interface referenced by id from declarative config.
 */
export interface AuthFlowHandler {
    /** Registry id that a source's declarative auth `flow` names. */
    readonly id: string;
    /**
     * Returns the request with this flow's credentials applied. The handler
     * receives a copy of the request, so it may modify and return it.
     *
     * @param req - The outgoing request before authentication.
     * @param ctx - The resolved secret, flow parameters and session state.
     * @returns The request to send.
     */
    apply(req: HttpRequest, ctx: AuthContext): MaybePromise<HttpRequest>;
    /**
     * Renews short-lived credentials. The HTTP transport calls it once after a
     * `401` response and then retries the request; a second `401` fails the
     * call.
     *
     * @param ctx - The same context the failed `apply` call received.
     */
    refresh?(ctx: AuthContext): MaybePromise<void>;
}

/**
 * A resolved secret, discriminated on `kind` so handlers can switch
 * exhaustively without losing type information.
 *
 * - `string-secret`: a single opaque string (passwords, bearer tokens).
 * - `byte-secret`: arbitrary binary key material (HMAC keys, AES keys).
 * - `cert-and-key-pair`: an X.509 cert plus its private key (mTLS, signing).
 * - `opaque-handle`: a handle into a remote keystore (PKCS#11 slot, KMS key id,
 *   Kerberos credential cache); the bytes never enter our process.
 *
 * @public
 */
export type Secret =
    | {
          /** Discriminator: a single opaque string. */
          kind: 'string-secret';
          /** The secret string, such as a password or bearer token. */
          value: string;
      }
    | {
          /** Discriminator: binary key material. */
          kind: 'byte-secret';
          /** The raw key bytes. */
          value: Uint8Array;
      }
    | {
          /** Discriminator: an X.509 certificate with its private key. */
          kind: 'cert-and-key-pair';
          /** PEM-encoded certificate, optionally followed by its chain. */
          certPem: string;
          /** PEM-encoded private key for `certPem`. */
          keyPem: string;
          /** Passphrase that decrypts `keyPem`, when the key is encrypted. */
          keyPassphrase?: string;
      }
    | {
          /** Discriminator: a handle into a keystore that holds the key. */
          kind: 'opaque-handle';
          /** Keystore-specific identifier, such as a key id or slot label. */
          handleId: string;
          /** Provider-specific metadata (slot index, label, key spec, ...). */
          metadata?: Record<string, unknown>;
      };

/**
 * The JSON form of a {@link Secret}, as it travels between processes. Each kind
 * keeps the field names of the in-process union. The one difference is binary
 * material: JSON has no byte type, so a byte secret carries RFC 4648 base64
 * (standard alphabet, padded) in `valueBase64`.
 *
 * Readers must tolerate fields they do not know on any kind and must treat an
 * unknown `kind` as unsupported for that reference, never as a crash. Use
 * `toSecretDoc` to write one and `readSecretDoc` to read one, so both ends
 * agree on the encoding.
 *
 * @public
 */
export type SecretDoc =
    | {
          /** Discriminator: a single opaque string. */
          kind: 'string-secret';
          /** The secret string. */
          value: string;
      }
    | {
          /** Discriminator: binary key material. */
          kind: 'byte-secret';
          /** The key bytes as padded, standard-alphabet RFC 4648 base64. */
          valueBase64: string;
      }
    | {
          /** Discriminator: an X.509 certificate with its private key. */
          kind: 'cert-and-key-pair';
          /** PEM-encoded certificate, optionally followed by its chain. */
          certPem: string;
          /** PEM-encoded private key for `certPem`. */
          keyPem: string;
          /** Passphrase that decrypts `keyPem`, when the key is encrypted. */
          keyPassphrase?: string;
      }
    | {
          /** Discriminator: a handle into a keystore that holds the key. */
          kind: 'opaque-handle';
          /** Keystore-specific identifier, such as a key id or slot label. */
          handleId: string;
          /** Provider-specific metadata (slot index, label, key spec, ...). */
          metadata?: Record<string, unknown>;
      };

/**
 * Request body of a secret broker's decrypt call, served at
 * `POST /v1/secrets/{secretId}/decrypt`. The body is optional. It is closed: a
 * broker refuses any field it does not declare.
 *
 * @public
 */
export interface SecretDecryptRequest {
    /** Audit attribution only. It never changes which secret is returned. */
    context?: {
        /** Id of the source that needs the secret. */
        sourceId?: string;
        /** Id of the scheme whose source needs the secret. */
        schemeId?: string;
    };
}

/**
 * Response body of a secret broker's decrypt call. It is open: later versions
 * may add fields, and readers ignore the ones they do not know.
 *
 * @public
 */
export interface SecretDecryptResponse {
    /** The decrypted secret in its JSON form. */
    secret: SecretDoc;
}
