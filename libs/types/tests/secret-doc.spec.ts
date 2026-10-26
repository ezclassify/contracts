/**
 * Contract for the secret codec.
 *
 * `toSecretDoc` and `readSecretDoc` are the only place the broker and the
 * resolver agree on how a resolved secret looks in JSON. These cases pin the
 * round trip for every kind, the strict base64 rule for byte secrets, and the
 * two ways a document can be refused. Every refusal is checked for the value it
 * refused, because a resolver logs refusals and must never log a secret.
 */
import { describe, expect, it } from 'vitest';
import { readSecretDoc, toSecretDoc } from '../src';
import type {
    Secret,
    SecretDecryptRequest,
    SecretDecryptResponse,
    SecretDoc,
} from '../src';

const SENTINEL = 'sentinel-secret-7f3a9c';

const allByteValues = Uint8Array.from({ length: 256 }, (_, index) => index);

const secrets: Record<string, Secret> = {
    'string-secret': { kind: 'string-secret', value: SENTINEL },
    'byte-secret with all 256 byte values': {
        kind: 'byte-secret',
        value: allByteValues,
    },
    'cert-and-key-pair': {
        kind: 'cert-and-key-pair',
        certPem: `-----BEGIN CERTIFICATE-----\n${SENTINEL}\n-----END CERTIFICATE-----\n`,
        keyPem: `-----BEGIN PRIVATE KEY-----\n${SENTINEL}\n-----END PRIVATE KEY-----\n`,
    },
    'cert-and-key-pair with a key passphrase': {
        kind: 'cert-and-key-pair',
        certPem: 'cert',
        keyPem: 'key',
        keyPassphrase: SENTINEL,
    },
    'opaque-handle': {
        kind: 'opaque-handle',
        handleId: 'pkcs11:token=records-hsm;object=source-signing',
    },
    'opaque-handle with metadata': {
        kind: 'opaque-handle',
        handleId: 'kms-key-1',
        metadata: { slot: 0, label: 'signing' },
    },
};

/** Read a document that must decode, and return the secret. */
function mustRead(doc: unknown): Secret {
    const reading = readSecretDoc(doc);
    if (!reading.ok) {
        throw new Error(`expected a secret, got ${JSON.stringify(reading)}`);
    }
    return reading.secret;
}

/** Assert a refusal names the field and carries no trace of the input. */
function expectMalformed(doc: unknown, field: string, secretText?: string) {
    const reading = readSecretDoc(doc);
    expect(reading).toEqual({ ok: false, problem: 'malformed', field });
    if (secretText !== undefined) {
        expect(JSON.stringify(reading)).not.toContain(secretText);
    }
}

describe('toSecretDoc and readSecretDoc', () => {
    for (const [name, secret] of Object.entries(secrets)) {
        it(`round-trips ${name} through JSON text`, () => {
            const wire = JSON.stringify(toSecretDoc(secret));
            expect(mustRead(JSON.parse(wire))).toEqual(secret);
        });
    }

    it('writes byte material as the same base64 Node itself produces', () => {
        const doc = toSecretDoc({ kind: 'byte-secret', value: allByteValues });
        expect(doc).toEqual({
            kind: 'byte-secret',
            valueBase64: Buffer.from(allByteValues).toString('base64'),
        });
    });

    it('encodes and decodes byte material larger than one conversion chunk', () => {
        const large = Uint8Array.from(
            { length: 100_003 },
            (_, index) => (index * 31 + 7) % 256,
        );
        const doc = toSecretDoc({ kind: 'byte-secret', value: large });
        expect(doc).toEqual({
            kind: 'byte-secret',
            valueBase64: Buffer.from(large).toString('base64'),
        });
        expect(mustRead(doc)).toEqual({ kind: 'byte-secret', value: large });
    });

    it('reads the documented byte example as de ad be ef', () => {
        expect(
            mustRead({ kind: 'byte-secret', valueBase64: '3q2+7w==' }),
        ).toEqual({
            kind: 'byte-secret',
            value: Uint8Array.from([0xde, 0xad, 0xbe, 0xef]),
        });
    });

    it('writes only the fields a kind declares', () => {
        const withExtras = {
            kind: 'string-secret',
            value: 'token',
            cachedAt: 1,
        } as Secret;
        expect(toSecretDoc(withExtras)).toEqual({
            kind: 'string-secret',
            value: 'token',
        });
        const pair = toSecretDoc({
            kind: 'cert-and-key-pair',
            certPem: 'cert',
            keyPem: 'key',
        });
        expect(Object.keys(pair)).toEqual(['kind', 'certPem', 'keyPem']);
    });

    it('copies handle metadata instead of sharing it', () => {
        const metadata = { slot: 0 };
        const doc = toSecretDoc({
            kind: 'opaque-handle',
            handleId: 'kms-key-1',
            metadata,
        });
        expect(doc.kind === 'opaque-handle' && doc.metadata).not.toBe(metadata);
        const read = mustRead(doc);
        expect(read.kind === 'opaque-handle' && read.metadata).not.toBe(
            doc.kind === 'opaque-handle' && doc.metadata,
        );
        expect(read).toEqual({
            kind: 'opaque-handle',
            handleId: 'kms-key-1',
            metadata: { slot: 0 },
        });
    });
});

describe('readSecretDoc: open to fields it does not know', () => {
    it('ignores unknown fields on every kind and does not copy them', () => {
        const docs: SecretDoc[] = Object.values(secrets).map(toSecretDoc);
        for (const doc of docs) {
            const read = mustRead({
                ...doc,
                rotatedAt: '2026-09-29',
                extra: 1,
            });
            expect(read).not.toHaveProperty('rotatedAt');
            expect(read).not.toHaveProperty('extra');
            expect(read).toEqual(mustRead(doc));
        }
    });

    it('treats an unknown kind as unsupported, not malformed, and names it', () => {
        expect(
            readSecretDoc({ kind: 'sealed-envelope', value: SENTINEL }),
        ).toEqual({
            ok: false,
            problem: 'unsupported-kind',
            kind: 'sealed-envelope',
        });
    });
});

describe('readSecretDoc: byte secrets need canonical base64', () => {
    // Each of these decodes to bytes under Buffer.from(text, 'base64'). The
    // control below proves that, so the strict rule is what refuses them.
    const refused: Record<string, [text: string, bufferBytes: number]> = {
        'missing padding': ['3q2+7w', 4],
        'a trailing newline': ['3q2+7w==\n', 4],
        'a leading space': [' 3q2+7w==', 4],
        'an embedded line break': ['3q2+\n7w==', 4],
        'the URL-safe alphabet': ['3q2-7w==', 4],
        'nonzero trailing bits': ['3q2+7x==', 4],
        'padding only': ['====', 0],
    };

    for (const [name, [text, bufferBytes]] of Object.entries(refused)) {
        it(`refuses ${name}`, () => {
            expect(Buffer.from(text, 'base64')).toHaveLength(bufferBytes);
            expectMalformed(
                { kind: 'byte-secret', valueBase64: text },
                'valueBase64',
                text.trim(),
            );
        });
    }

    it('refuses the empty string, which Buffer reads as zero bytes', () => {
        expect(Buffer.from('', 'base64')).toHaveLength(0);
        expectMalformed(
            { kind: 'byte-secret', valueBase64: '' },
            'valueBase64',
        );
    });

    it('refuses a missing or non-string value, including raw bytes', () => {
        expectMalformed({ kind: 'byte-secret' }, 'valueBase64');
        expectMalformed(
            { kind: 'byte-secret', valueBase64: 42 },
            'valueBase64',
        );
        expectMalformed(
            { kind: 'byte-secret', value: '3q2+7w==' },
            'valueBase64',
        );
    });

    it('accepts the same text once it is canonical (negative control)', () => {
        expect(
            mustRead({ kind: 'byte-secret', valueBase64: '3q2+7w==' }),
        ).toEqual({
            kind: 'byte-secret',
            value: Uint8Array.from([0xde, 0xad, 0xbe, 0xef]),
        });
    });
});

describe('readSecretDoc: malformed documents fail closed', () => {
    it('refuses a value that is not an object', () => {
        for (const value of [null, undefined, SENTINEL, 42, [], [SENTINEL]]) {
            expectMalformed(value, 'kind', SENTINEL);
        }
    });

    it('refuses a missing, empty, or non-string kind', () => {
        expectMalformed({ value: SENTINEL }, 'kind', SENTINEL);
        expectMalformed({ kind: '', value: SENTINEL }, 'kind', SENTINEL);
        expectMalformed({ kind: 7, value: SENTINEL }, 'kind', SENTINEL);
    });

    it('refuses an empty or non-string value', () => {
        expectMalformed({ kind: 'string-secret', value: '' }, 'value');
        expectMalformed({ kind: 'string-secret' }, 'value');
        expectMalformed(
            { kind: 'string-secret', value: { token: SENTINEL } },
            'value',
            SENTINEL,
        );
    });

    it('refuses a pair with an empty or missing certificate or key', () => {
        expectMalformed(
            { kind: 'cert-and-key-pair', certPem: '', keyPem: SENTINEL },
            'certPem',
            SENTINEL,
        );
        expectMalformed(
            { kind: 'cert-and-key-pair', certPem: 'cert', keyPem: '' },
            'keyPem',
        );
        expectMalformed(
            { kind: 'cert-and-key-pair', certPem: 'cert' },
            'keyPem',
        );
    });

    it('refuses a nested certificate/key pair in the value field', () => {
        expectMalformed(
            {
                kind: 'cert-and-key-pair',
                value: { cert: 'cert', key: SENTINEL },
            },
            'certPem',
            SENTINEL,
        );
    });

    it('refuses a non-string key passphrase', () => {
        for (const keyPassphrase of [null, 42, { value: SENTINEL }]) {
            expectMalformed(
                {
                    kind: 'cert-and-key-pair',
                    certPem: 'cert',
                    keyPem: SENTINEL,
                    keyPassphrase,
                },
                'keyPassphrase',
                SENTINEL,
            );
        }
    });

    it('refuses an empty handle id', () => {
        expectMalformed({ kind: 'opaque-handle', handleId: '' }, 'handleId');
        expectMalformed({ kind: 'opaque-handle' }, 'handleId');
    });

    it('refuses handle metadata that is not an object', () => {
        for (const metadata of [null, [SENTINEL], SENTINEL, 0]) {
            expectMalformed(
                { kind: 'opaque-handle', handleId: 'kms-key-1', metadata },
                'metadata',
                SENTINEL,
            );
        }
    });
});

describe('decrypt envelope types', () => {
    it('describes the documented instances', () => {
        const responses = [
            {
                secret: {
                    kind: 'string-secret',
                    value: 'census-api-token-7f3a',
                },
            },
            { secret: { kind: 'byte-secret', valueBase64: '3q2+7w==' } },
            {
                secret: {
                    kind: 'cert-and-key-pair',
                    certPem: 'cert',
                    keyPem: 'key',
                },
            },
            {
                secret: {
                    kind: 'opaque-handle',
                    handleId: 'pkcs11:token=records-hsm;object=source-signing',
                    metadata: { slot: 0 },
                },
            },
        ] satisfies SecretDecryptResponse[];
        const requests = [
            {},
            { context: { sourceId: 'agency-offices', schemeId: 'records' } },
        ] satisfies SecretDecryptRequest[];
        for (const response of responses) {
            expect(readSecretDoc(response.secret).ok).toBe(true);
        }
        expect(requests).toHaveLength(2);
    });
});

describe('readSecretDoc: large byte secrets', () => {
    // The pattern this codec used first. Its repetition group backtracks once
    // per four characters, and V8 runs out of regex stack on long input.
    const REPEATED_QUANTUM_PATTERN =
        /^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/;

    it('shows the repeated-quantum pattern throws on a 16 MiB value', () => {
        const text = 'A'.repeat(16 * 1024 * 1024);
        expect(() => REPEATED_QUANTUM_PATTERN.test(text)).toThrow(RangeError);
    });

    it('decodes a 64 MiB value without throwing', () => {
        const bytes = Buffer.alloc(48 * 1024 * 1024, 0xa5);
        const valueBase64 = bytes.toString('base64');
        expect(valueBase64).toHaveLength(64 * 1024 * 1024);
        const reading = readSecretDoc({ kind: 'byte-secret', valueBase64 });
        expect(reading.ok).toBe(true);
        if (reading.ok && reading.secret.kind === 'byte-secret') {
            expect(reading.secret.value).toHaveLength(bytes.length);
            expect(Buffer.from(reading.secret.value).equals(bytes)).toBe(true);
        }
    }, 60_000);

    it('refuses a 64 MiB value with one bad character without throwing', () => {
        const valueBase64 = `${'A'.repeat(64 * 1024 * 1024 - 1)}-`;
        expect(readSecretDoc({ kind: 'byte-secret', valueBase64 })).toEqual({
            ok: false,
            problem: 'malformed',
            field: 'valueBase64',
        });
    }, 60_000);
});

describe('readSecretDoc: agrees with canonical base64 exhaustively', () => {
    it('accepts exactly the short strings Buffer encodes back to themselves', () => {
        const alphabet = ['A', 'B', 'g', '+', '/', '=', '-', '_', ' ', '\n'];
        let texts = [''];
        const all: string[] = [];
        for (let length = 1; length <= 4; length += 1) {
            texts = texts.flatMap((prefix) =>
                alphabet.map((character) => prefix + character),
            );
            all.push(...texts);
        }
        const disagreements = all.filter((text) => {
            const canonical =
                Buffer.from(text, 'base64').toString('base64') === text;
            const read = readSecretDoc({
                kind: 'byte-secret',
                valueBase64: text,
            }).ok;
            return canonical !== read;
        });
        expect(all).toHaveLength(11_110);
        expect(disagreements).toEqual([]);
    });
});

describe('readSecretDoc: an unsupported kind is safe to log', () => {
    it('cuts a long kind to 64 characters and marks the cut', () => {
        const reading = readSecretDoc({ kind: 'x'.repeat(100) });
        expect(reading).toEqual({
            ok: false,
            problem: 'unsupported-kind',
            kind: `${'x'.repeat(64)}...`,
        });
    });

    it('escapes control characters so a kind cannot forge a log line', () => {
        const reading = readSecretDoc({
            kind: 'sealed\nFAKE LOG LINE\r\u001b[31m',
        });
        expect(reading).toEqual({
            ok: false,
            problem: 'unsupported-kind',
            kind: 'sealed\\u000aFAKE LOG LINE\\u000d\\u001b[31m',
        });
    });

    it('escapes non-ASCII and doubles a backslash, so the escapes are unambiguous', () => {
        const reading = readSecretDoc({ kind: 'kéy\\u000a ' });
        expect(reading).toEqual({
            ok: false,
            problem: 'unsupported-kind',
            kind: 'k\\u00e9y\\\\u000a\\u2028',
        });
    });

    it('leaves a plain kind as it was (negative control)', () => {
        expect(readSecretDoc({ kind: 'sealed-envelope' })).toEqual({
            ok: false,
            problem: 'unsupported-kind',
            kind: 'sealed-envelope',
        });
    });
});
