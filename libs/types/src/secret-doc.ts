/**
 * The codec between a resolved {@link Secret} and its JSON form,
 * {@link SecretDoc}.
 *
 * A secret broker writes with `toSecretDoc` and a secret resolver reads with
 * `readSecretDoc`. Both ends import the same two functions, so they cannot
 * disagree on the one part of the encoding JSON forces on them: binary material
 * as base64 text. The functions use only `btoa` and `atob`, which Node 22 and
 * browsers both provide, so this module needs no runtime of its own.
 */
import type { Secret, SecretDoc } from './auth.js';

/**
 * The outcome of reading one {@link SecretDoc}.
 *
 * - `ok: true`: a fresh {@link Secret} built from the known fields only.
 * - `unsupported-kind`: the document is a kind this reader does not know. The
 *   reference cannot be resolved here, but nothing is wrong with the document
 *   as far as this reader can tell. `kind` is the kind it carried, made safe
 *   to log: cut to its first 64 characters (marked with a trailing `...`),
 *   with a backslash doubled and every character outside printable ASCII
 *   written as a `\uXXXX` escape. It names the kind for a message; it is not
 *   meant to be matched against.
 * - `malformed`: a known kind with a field that is missing, of the wrong type,
 *   empty where a value is required, or not canonical base64. `field` names the
 *   field. A value that is not an object, or has no non-empty string `kind`, is
 *   malformed at `kind`.
 *
 * A refusal never carries the value it refused, so it is safe to log.
 *
 * @public
 */
export type SecretDocReading =
    | {
          /** Discriminator: the document was read. */
          ok: true;
          /** The secret the document carried. */
          secret: Secret;
      }
    | {
          /** Discriminator: the document was refused. */
          ok: false;
          /** The document names a kind this reader does not support. */
          problem: 'unsupported-kind';
          /** The refused kind, shortened and escaped so it is safe to log. */
          kind: string;
      }
    | {
          /** Discriminator: the document was refused. */
          ok: false;
          /** A known kind with a missing or invalid field. */
          problem: 'malformed';
          /** Name of the field that is missing or invalid. */
          field: string;
      };

/**
 * Write a {@link Secret} as a {@link SecretDoc}.
 *
 * Total over the union. Byte material becomes RFC 4648 base64 with the
 * standard alphabet and padding. Only the fields the kind declares are copied,
 * so anything else a caller attached to the object stays in process.
 *
 * @param secret - The resolved secret to encode.
 * @returns Its JSON form, ready for `JSON.stringify`.
 */
export function toSecretDoc(secret: Secret): SecretDoc {
    switch (secret.kind) {
        case 'string-secret':
            return { kind: 'string-secret', value: secret.value };
        case 'byte-secret':
            return {
                kind: 'byte-secret',
                valueBase64: encodeBase64(secret.value),
            };
        case 'cert-and-key-pair':
            return secret.keyPassphrase === undefined
                ? {
                      kind: 'cert-and-key-pair',
                      certPem: secret.certPem,
                      keyPem: secret.keyPem,
                  }
                : {
                      kind: 'cert-and-key-pair',
                      certPem: secret.certPem,
                      keyPem: secret.keyPem,
                      keyPassphrase: secret.keyPassphrase,
                  };
        case 'opaque-handle':
            return secret.metadata === undefined
                ? { kind: 'opaque-handle', handleId: secret.handleId }
                : {
                      kind: 'opaque-handle',
                      handleId: secret.handleId,
                      metadata: { ...secret.metadata },
                  };
    }
}

/**
 * Read a {@link SecretDoc} received from another process.
 *
 * The document is open: fields a kind does not declare are ignored and never
 * reach the returned {@link Secret}. The values are not: every declared field
 * is checked, and a byte secret's `valueBase64` must be canonical padded base64
 * in the standard alphabet with no whitespace. A caller that gets anything but
 * `ok: true` must fail the resolution rather than fall back to a default.
 *
 * @param value - The parsed JSON value that should be a {@link SecretDoc}.
 * @returns The decoded secret, or why it could not be decoded.
 */
export function readSecretDoc(value: unknown): SecretDocReading {
    if (!isPlainObject(value)) return malformed('kind');
    const kind = value['kind'];
    if (!isNonEmptyString(kind)) return malformed('kind');
    switch (kind) {
        case 'string-secret': {
            const text = value['value'];
            if (!isNonEmptyString(text)) return malformed('value');
            return { ok: true, secret: { kind, value: text } };
        }
        case 'byte-secret': {
            const bytes = decodeBase64(value['valueBase64']);
            if (bytes === undefined) return malformed('valueBase64');
            return { ok: true, secret: { kind, value: bytes } };
        }
        case 'cert-and-key-pair': {
            const certPem = value['certPem'];
            const keyPem = value['keyPem'];
            const keyPassphrase = value['keyPassphrase'];
            if (!isNonEmptyString(certPem)) return malformed('certPem');
            if (!isNonEmptyString(keyPem)) return malformed('keyPem');
            if (keyPassphrase === undefined) {
                return { ok: true, secret: { kind, certPem, keyPem } };
            }
            if (typeof keyPassphrase !== 'string') {
                return malformed('keyPassphrase');
            }
            return {
                ok: true,
                secret: { kind, certPem, keyPem, keyPassphrase },
            };
        }
        case 'opaque-handle': {
            const handleId = value['handleId'];
            const metadata = value['metadata'];
            if (!isNonEmptyString(handleId)) return malformed('handleId');
            if (metadata === undefined) {
                return { ok: true, secret: { kind, handleId } };
            }
            if (!isPlainObject(metadata)) return malformed('metadata');
            return {
                ok: true,
                secret: { kind, handleId, metadata: { ...metadata } },
            };
        }
        default:
            return {
                ok: false,
                problem: 'unsupported-kind',
                kind: loggableKind(kind),
            };
    }
}

// Standard alphabet with at most two padding characters at the end. Together
// with a length that is a multiple of four, that is the whole shape of padded
// base64. The check is a single linear scan with no repetition group to
// backtrack through, so a long value cannot exhaust the regex stack.
const BASE64_ALPHABET = /^[A-Za-z0-9+/]*={0,2}$/;

// `String.fromCharCode` takes its code units as arguments, and engines cap the
// argument count, so bytes become a binary string one bounded slice at a time.
const CHUNK_BYTES = 0x8000;

function encodeBase64(bytes: Uint8Array): string {
    let binary = '';
    for (let start = 0; start < bytes.length; start += CHUNK_BYTES) {
        binary += String.fromCharCode(
            ...bytes.subarray(start, start + CHUNK_BYTES),
        );
    }
    return btoa(binary);
}

/**
 * Decode canonical base64, or return `undefined`.
 *
 * `atob` alone is too forgiving: it accepts missing padding, embedded
 * whitespace, and a final character whose unused bits are not zero, so two
 * different texts can decode to the same bytes. The length and alphabet checks
 * refuse the first two, and requiring the bytes to encode back to the exact
 * input refuses the third. The empty string is refused because an empty key is
 * never a key.
 */
function decodeBase64(text: unknown): Uint8Array | undefined {
    if (
        !isNonEmptyString(text) ||
        text.length % 4 !== 0 ||
        !BASE64_ALPHABET.test(text)
    ) {
        return undefined;
    }
    let binary: string;
    try {
        binary = atob(text);
    } catch {
        return undefined;
    }
    const bytes = new Uint8Array(binary.length);
    for (let index = 0; index < binary.length; index += 1) {
        bytes[index] = binary.charCodeAt(index);
    }
    return encodeBase64(bytes) === text ? bytes : undefined;
}

// A kind comes from another process and is echoed into log lines, so it is
// bounded and escaped before it leaves this module.
const KIND_ECHO_LIMIT = 64;

function loggableKind(kind: string): string {
    const head = kind.slice(0, KIND_ECHO_LIMIT);
    let text = '';
    for (let index = 0; index < head.length; index += 1) {
        const code = head.charCodeAt(index);
        if (code === 0x5c) text += '\\\\';
        else if (code >= 0x20 && code <= 0x7e) text += head[index];
        else text += `\\u${code.toString(16).padStart(4, '0')}`;
    }
    return kind.length > KIND_ECHO_LIMIT ? `${text}...` : text;
}

function malformed(field: string): SecretDocReading {
    return { ok: false, problem: 'malformed', field };
}

function isNonEmptyString(value: unknown): value is string {
    return typeof value === 'string' && value.length > 0;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
}
