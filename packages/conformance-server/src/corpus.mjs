/**
 * Loading and indexing the golden wire corpus.
 *
 * The corpus is a recording of the real runtime answering real requests. This
 * module turns it into something a server can answer from, and it refuses to
 * build an index it cannot answer from unambiguously: a corpus with two cases
 * that a live request could not be told apart by is a defect, and it stops the
 * load rather than picking one at random.
 */

import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';

import { canonicalJson, matchKey } from './canonical.mjs';

const require = createRequire(import.meta.url);

/**
 * The corpus shipped with this package, resolved through the package that owns
 * it rather than through a relative path, so a consumer who overrides one of
 * the two independently still gets a coherent pair.
 */
export const BUNDLED_CORPUS_PATH =
    require.resolve('@ezclassify/conformance/wire/v1/corpus.json');

/** Provenance for the bundled corpus: spec digest, coverage, divergences. */
export const BUNDLED_MANIFEST_PATH =
    require.resolve('@ezclassify/conformance/wire/v1/manifest.json');

/**
 * A corpus this server cannot serve from. Thrown at load, never at request
 * time.
 */
export class CorpusError extends Error {
    /** @param {string} message - What is wrong with the corpus */
    constructor(message) {
        super(message);
        this.name = 'CorpusError';
    }
}

/** Byte-comparable form of a recorded response, ignoring corpus annotations. */
function responseIdentity(response) {
    return canonicalJson({
        body: response.body,
        headers: response.headers ?? {},
        status: response.status,
    });
}

/**
 * Find the one response the wire uses to refuse a request it will not talk
 * about.
 *
 * It is read off the corpus rather than written down here, because the whole
 * point of the shape is that it is the server's, not this package's. The
 * recording that defines it is the authenticated deployment answering a request
 * that presented no credential: there is exactly one such case, and if the
 * corpus ever carries none or several, the shape is no longer a constant and
 * this server has no business guessing which one to serve.
 */
function findDenialResponse(cases) {
    const candidates = cases.filter(
        (entry) =>
            entry.auth?.deployment === 'authenticated' &&
            entry.auth?.credential === 'none' &&
            entry.response.status === 404,
    );
    if (candidates.length !== 1) {
        throw new CorpusError(
            `expected exactly one recorded refusal (an authenticated deployment answering 404 with no credential presented), found ${candidates.length}. ` +
                'Simulated authentication has no byte-exact answer to serve without it.',
        );
    }
    return candidates[0];
}

/**
 * Read a corpus document off disk.
 *
 * @param {string} file - Path to a corpus JSON file
 * @returns {{ corpusVersion: string; cases: object[] }} Parsed corpus
 */
export function readCorpusFile(file) {
    let parsed;
    try {
        parsed = JSON.parse(readFileSync(file, 'utf8'));
    } catch (cause) {
        throw new CorpusError(
            `could not read the corpus at ${file}: ${cause.message}`,
        );
    }
    if (!Array.isArray(parsed?.cases) || parsed.cases.length === 0) {
        throw new CorpusError(
            `${file} declares no cases, so there is nothing to replay`,
        );
    }
    return parsed;
}

/**
 * Index a corpus for replay.
 *
 * Two decisions are made here and both are visible in the result.
 *
 * The servable set is the cases recorded against the **open** deployment, minus
 * every case whose response is the refusal shape. The refusals are not
 * operations; they are what one posture answers when a credential is missing or
 * wrong, and this server produces them from its own auth mode instead of
 * matching a request to them. Serving them as ordinary entries would also make
 * the index ambiguous: `denial.context-without-carrier` is recorded with the
 * same method, path and body as `ctx-scheme-process.ok`, and the only thing
 * that told them apart on the wire was a credential the corpus deliberately
 * does not record.
 *
 * What is left has to be unambiguous, and that is asserted rather than assumed.
 *
 * @param {string} [file] - Corpus path; the bundled corpus when omitted
 * @returns {{
 *     file: string;
 *     corpusVersion: string;
 *     cases: object[];
 *     servable: object[];
 *     byKey: Map<string, object>;
 *     denial: object;
 * }}
 *   Loaded corpus
 */
export function loadCorpus(file = BUNDLED_CORPUS_PATH) {
    const parsed = readCorpusFile(file);
    const cases = parsed.cases;

    const seenIds = new Set();
    for (const entry of cases) {
        if (typeof entry.id !== 'string' || entry.id === '') {
            throw new CorpusError(`${file} carries a case with no id`);
        }
        if (seenIds.has(entry.id)) {
            throw new CorpusError(
                `${file} carries two cases with the id ${entry.id}`,
            );
        }
        seenIds.add(entry.id);
    }

    const denialCase = findDenialResponse(cases);
    const denialIdentity = responseIdentity(denialCase.response);

    const servable = cases.filter(
        (entry) =>
            entry.auth?.deployment === 'open' &&
            responseIdentity(entry.response) !== denialIdentity,
    );
    if (servable.length === 0) {
        throw new CorpusError(
            `${file} carries no operation recordings against an open deployment`,
        );
    }

    const byKey = new Map();
    for (const entry of servable) {
        const key = matchKey(
            entry.request.method,
            entry.request.path,
            entry.request.body,
        );
        const clash = byKey.get(key);
        if (clash) {
            throw new CorpusError(
                `${file}: cases ${clash.id} and ${entry.id} are the same request ` +
                    `(${entry.request.method} ${entry.request.path} with the same body). ` +
                    'A replay server cannot tell them apart, so it will not start.',
            );
        }
        byKey.set(key, entry);
    }

    return {
        byKey,
        cases,
        corpusVersion: parsed.corpusVersion ?? 'unknown',
        denial: denialCase,
        file,
        servable,
    };
}

/**
 * Read the manifest that ships beside a corpus.
 *
 * Provenance only: which spec digest the recording was validated against, which
 * runtime produced it, and the contract divergences an SDK author needs to know
 * about. Absent or unreadable is not fatal: the corpus is what gets served.
 *
 * @param {string} [file] - Manifest path; the bundled manifest when omitted
 * @returns {object | null} Parsed manifest, or null when it could not be read
 */
export function readManifest(file = BUNDLED_MANIFEST_PATH) {
    try {
        return JSON.parse(readFileSync(file, 'utf8'));
    } catch {
        return null;
    }
}
