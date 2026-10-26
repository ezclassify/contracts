/**
 * Diagnostics for unmatched requests, including nearby recordings and
 * differences in paths, query parameters and body fields.
 */

import { canonicalJson } from './canonical.mjs';

/** Levenshtein distance, iterative, two rows. Short strings only. */
function editDistance(left, right) {
    if (left === right) return 0;
    let previous = Array.from({ length: right.length + 1 }, (_, at) => at);
    for (let i = 0; i < left.length; i += 1) {
        const current = [i + 1];
        for (let j = 0; j < right.length; j += 1) {
            current[j + 1] = Math.min(
                previous[j + 1] + 1,
                current[j] + 1,
                previous[j] + (left[i] === right[j] ? 0 : 1),
            );
        }
        previous = current;
    }
    return previous[right.length];
}

/** Case and separator insensitive form, so `scheme_id` and `schemeId` collide. */
function foldName(name) {
    return name.toLowerCase().replace(/[-_\s]/g, '');
}

/**
 * The declared name a caller most likely meant.
 *
 * Exact fold first: `scheme_id` against `schemeId` is a naming-convention
 * mistake and deserves a confident answer, not a distance score. Only then does
 * it fall back to edit distance, and only within a quarter of the name's length
 * so that a genuinely unrelated field gets no suggestion at all.
 *
 * @param {string} name - The name the caller used
 * @param {string[]} declared - Names the contract declares here
 * @returns {string | null} The suggestion, or null when nothing is close
 */
export function nearestName(name, declared) {
    const folded = foldName(name);
    const sameFold = declared.find(
        (candidate) => foldName(candidate) === folded,
    );
    if (sameFold) return sameFold;
    let best = null;
    let bestDistance = Infinity;
    for (const candidate of declared) {
        const distance = editDistance(folded, foldName(candidate));
        if (distance < bestDistance) {
            best = candidate;
            bestDistance = distance;
        }
    }
    const budget = Math.max(1, Math.floor(name.length / 4));
    return best !== null && bestDistance <= budget ? best : null;
}

/** Resolve an Ajv instance path against the body it was reported on. */
function valueAt(body, instancePath) {
    let current = body;
    for (const raw of instancePath.split('/').slice(1)) {
        if (current === null || typeof current !== 'object') return undefined;
        current = current[raw.replace(/~1/g, '/').replace(/~0/g, '~')];
    }
    return current;
}

/**
 * Turn Ajv errors into something a developer can act on.
 *
 * @param {object} route - Route the request resolved to
 * @param {object[]} errors - Ajv errors
 * @param {import('./spec.mjs').SpecIndex} spec - The contract
 * @param {unknown} body - The request body the errors were reported on
 * @returns {object[]} Findings, deduplicated
 */
export function explainValidation(route, errors, spec, body) {
    const findings = new Map();
    for (const error of errors) {
        const where = error.instancePath || '(root)';
        const finding = {
            at: where,
            keyword: error.keyword,
            message: error.message ?? 'failed validation',
        };
        if (error.keyword === 'additionalProperties') {
            const sent = error.params?.additionalProperty;
            const declared = spec.propertiesAt(route, error.instancePath);
            const suggestion = sent ? nearestName(sent, declared) : null;
            finding.field = sent;
            finding.message = suggestion
                ? `${where} has no field "${sent}". The contract calls it "${suggestion}".`
                : `${where} has no field "${sent}".`;
            if (declared.length > 0) finding.declared = declared;
        } else if (error.keyword === 'required') {
            const missing = error.params?.missingProperty;
            finding.field = missing;
            finding.message = `${where} is missing the required field "${missing}".`;
            // Not every schema on this wire closes itself with
            // `additionalProperties: false`, so a misspelled field often
            // surfaces only as the correct one being absent. Say which of the
            // caller's own keys was probably meant to be it.
            const carried = valueAt(body, error.instancePath);
            const sent =
                carried !== null &&
                typeof carried === 'object' &&
                !Array.isArray(carried)
                    ? Object.keys(carried).find(
                          (name) =>
                              name !== missing &&
                              foldName(name) === foldName(missing),
                      )
                    : undefined;
            if (sent) {
                finding.sentInstead = sent;
                finding.message = `${where} is missing the required field "${missing}". It carries "${sent}", which is not a name the contract uses.`;
            }
        } else if (error.keyword === 'enum') {
            const allowed = error.params?.allowedValues ?? [];
            finding.message = `${where} is not one of the values the contract allows.`;
            if (allowed.length > 0) finding.allowed = allowed;
        } else if (error.keyword === 'type') {
            finding.message = `${where} should be ${error.params?.type}.`;
        }
        const key = [finding.keyword, finding.at, finding.field ?? ''].join(
            '|',
        );
        if (!findings.has(key)) findings.set(key, finding);
    }
    return [...findings.values()];
}

/** Distance between two paths: segment edits, with a length penalty. */
function pathDistance(live, recorded) {
    const a = live.split('/');
    const b = recorded.split('/');
    let differing = 0;
    const shared = Math.min(a.length, b.length);
    for (let at = 0; at < shared; at += 1) {
        if (a[at] !== b[at]) differing += 1;
    }
    return differing + Math.abs(a.length - b.length) * 2;
}

/** Flatten an object into dotted leaf paths, so a diff can name a nested field. */
function flatten(value, prefix = '', into = new Map()) {
    if (value === null || typeof value !== 'object') {
        into.set(prefix || '(body)', value);
        return into;
    }
    if (Array.isArray(value)) {
        if (value.length === 0) into.set(prefix || '(body)', []);
        value.forEach((entry, at) => flatten(entry, `${prefix}[${at}]`, into));
        return into;
    }
    const keys = Object.keys(value);
    if (keys.length === 0) into.set(prefix || '(body)', {});
    for (const key of keys.sort()) {
        flatten(value[key], prefix === '' ? key : `${prefix}.${key}`, into);
    }
    return into;
}

/**
 * Field-level difference between what arrived and what was recorded.
 *
 * @param {unknown} live - Body as received
 * @param {unknown} recorded - Body as recorded
 * @returns {{ missing: string[]; unexpected: string[]; different: object[] }}
 *   Diff
 */
export function bodyDiff(live, recorded) {
    return diffFlattened(
        flatten(live === undefined ? {} : live),
        flatten(recorded === undefined ? {} : recorded),
    );
}

/**
 * {@link bodyDiff} over sides that are already flattened, so a caller comparing
 * one live body against many recordings flattens it once.
 *
 * @param {Map<string, unknown>} left - Flattened live body
 * @param {Map<string, unknown>} right - Flattened recorded body
 * @returns {{ missing: string[]; unexpected: string[]; different: object[] }}
 *   Diff
 */
function diffFlattened(left, right) {
    const missing = [];
    const unexpected = [];
    const different = [];
    for (const [field, value] of right) {
        if (!left.has(field)) {
            missing.push(field);
            continue;
        }
        const sent = left.get(field);
        // Leaves are primitives except for the empty-container sentinels, so
        // the canonical form is only needed when the fast comparison says no.
        if (sent !== value && canonicalJson(sent) !== canonicalJson(value)) {
            different.push({ field, recorded: value, sent });
        }
    }
    for (const field of left.keys()) {
        if (!right.has(field)) unexpected.push(field);
    }
    return { different, missing, unexpected };
}

/**
 * Rank recorded cases by how close they are to a request nobody recorded.
 *
 * Path first, then body, which is the order a developer debugs in: a wrong path
 * is a different question from a wrong field, and telling them the field diff
 * against an unrelated operation would be noise. Same-path cases therefore
 * always outrank a closer-bodied case on another path.
 *
 * @param {object} loaded - Corpus from `loadCorpus`
 * @param {string} method - Live method
 * @param {string} path - Live path, without the query string
 * @param {unknown} body - Live parsed body
 * @param {number} [limit] - How many candidates to report
 * @returns {object[]} Nearest cases, closest first
 */
export function nearestCases(loaded, method, path, body, limit = 3) {
    // The live body is the same for every candidate, so it is flattened once
    // rather than once per same-path recording.
    const liveFields = flatten(body === undefined ? {} : body);
    const scored = loaded.servable.map((entry) => {
        const samePath = entry.request.path === path;
        // The body diff is only computed where it means something, and it is
        // also what orders the candidates once the path is settled: of two
        // recordings of the same operation, the one that differs in two fields
        // is a better lead than the one that differs in five.
        const diff = samePath
            ? diffFlattened(
                  liveFields,
                  flatten(
                      entry.request.body === undefined
                          ? {}
                          : entry.request.body,
                  ),
              )
            : null;
        return {
            diffSize: diff
                ? diff.missing.length +
                  diff.unexpected.length +
                  diff.different.length
                : Infinity,
            distance: pathDistance(path, entry.request.path),
            diff,
            entry,
            sameMethod: entry.request.method === method.toUpperCase(),
            samePath,
        };
    });
    scored.sort((left, right) => {
        if (left.samePath !== right.samePath) return left.samePath ? -1 : 1;
        if (left.distance !== right.distance)
            return left.distance - right.distance;
        if (left.sameMethod !== right.sameMethod)
            return left.sameMethod ? -1 : 1;
        if (left.diffSize !== right.diffSize)
            return left.diffSize - right.diffSize;
        return left.entry.id < right.entry.id ? -1 : 1;
    });

    return scored
        .slice(0, limit)
        .map(({ diff, entry, samePath, sameMethod }) => {
            const nearest = {
                caseId: entry.id,
                method: entry.request.method,
                path: entry.request.path,
            };
            if (entry.operationId) nearest.operationId = entry.operationId;
            if (entry.summary) nearest.summary = entry.summary;
            if (!sameMethod) {
                nearest.methodDiffers = `recorded as ${entry.request.method}, you sent ${method.toUpperCase()}`;
            }
            if (!samePath)
                nearest.pathDiffers = `recorded path is ${entry.request.path}`;
            if (diff) nearest.bodyDiff = diff;
            return nearest;
        });
}
