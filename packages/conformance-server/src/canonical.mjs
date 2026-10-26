/**
 * Canonical forms for matching a live request against a recorded one.
 *
 * The corpus is generated with recursively ordered object keys, so a recorded
 * request body is already canonical. A live request is not: a client is free to
 * serialize the same object in any key order, with any whitespace, and it is
 * still the same request. Matching therefore happens on canonical forms rather
 * than on raw bytes, and the rules here restate the ones the corpus generator
 * in the runtime used, so the two sides agree by construction.
 *
 * Array order is preserved. It carries meaning on this wire (suggestion order,
 * category order in a suggest batch, rule order in an access policy), so
 * sorting arrays here would match requests the runtime treats as different.
 */

/** Recursively order object keys. Arrays keep their order. */
function sortValue(value) {
    if (Array.isArray(value)) return value.map(sortValue);
    if (value === null || typeof value !== 'object') return value;
    // Parsed JSON may own "__proto__"; a plain object would drop that key.
    const sorted = Object.create(null);
    for (const key of Object.keys(value).sort()) {
        sorted[key] = sortValue(value[key]);
    }
    return sorted;
}

/**
 * Compact canonical JSON: keys ordered recursively, no insignificant
 * whitespace. Used as a map key, so it is compact rather than pretty.
 *
 * @param {unknown} value - Parsed JSON value
 * @returns {string} Canonical text
 */
export function canonicalJson(value) {
    return JSON.stringify(sortValue(value));
}

/**
 * Canonical form of a request path: a trailing slash is dropped, and an empty
 * path becomes `/`.
 *
 * Exported so a caller that holds only the path applies the same rule
 * {@link canonicalTarget} applies. A route lookup and a corpus lookup that
 * normalized differently would disagree about the same request.
 *
 * @param {string} rawPath - Path as received, without the query string
 * @returns {string} Canonical path
 */
export function canonicalPath(rawPath) {
    if (rawPath === '') return '/';
    if (rawPath.length > 1 && rawPath.endsWith('/'))
        return rawPath.slice(0, -1);
    return rawPath;
}

/**
 * Canonical form of a request target.
 *
 * Two normalizations, and no more than two. A trailing slash is dropped,
 * because `/v1/scheme/list/` and `/v1/scheme/list` address the same operation
 * and no recorded path carries one. Query parameters are ordered by name and
 * then by value, because a query string is a set of parameters and a client
 * that emits them in a different order has not made a different request.
 *
 * Percent-encoding is left exactly as the client wrote it. Decoding it here
 * would make `/v1/ctx/a%2Fb/...` and `/v1/ctx/a/b/...` look like the same
 * request, which they are not.
 *
 * @param {string} target - Request target as received, path and query
 * @returns {string} Canonical target
 */
export function canonicalTarget(target) {
    const split = target.indexOf('?');
    const rawQuery = split === -1 ? '' : target.slice(split + 1);
    const path = canonicalPath(split === -1 ? target : target.slice(0, split));

    if (rawQuery === '') return path;
    const pairs = rawQuery
        .split('&')
        .filter((pair) => pair !== '')
        .map((pair) => {
            const at = pair.indexOf('=');
            return at === -1
                ? [pair, '']
                : [pair.slice(0, at), pair.slice(at + 1)];
        })
        .sort((left, right) =>
            left[0] === right[0]
                ? left[1] < right[1]
                    ? -1
                    : left[1] > right[1]
                      ? 1
                      : 0
                : left[0] < right[0]
                  ? -1
                  : 1,
        );
    const query = pairs
        .map(([name, value]) => (value === '' ? name : `${name}=${value}`))
        .join('&');
    return `${path}?${query}`;
}

/**
 * Match key for one exchange: method, canonical target, canonical body.
 *
 * A request with no body and a request with an empty body are different keys.
 * The corpus records both (`route-miss.route-not-found` sends nothing;
 * `route-miss.ctx-operation-not-found` sends `{}`), and the server answers them
 * differently.
 *
 * @param {string} method - HTTP method
 * @param {string} target - Request target, path and query
 * @param {unknown} body - Parsed request body, or undefined when there is none
 * @returns {string} Key
 */
export function matchKey(method, target, body) {
    const bodyPart = body === undefined ? '(no body)' : canonicalJson(body);
    return `${method.toUpperCase()} ${canonicalTarget(target)}\n${bodyPart}`;
}
