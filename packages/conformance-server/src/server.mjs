/**
 * The conformance replay server.
 *
 * It answers real HTTP by looking a request up in the golden wire corpus and
 * serving what the real runtime answered when that request was recorded. It has
 * no engine in it, no rules, no scheme loader, and no opinion about what any
 * operation means. A request the corpus does not contain gets a diagnostic, not
 * an answer, and that is the boundary this package is on the public side of.
 */

import { createServer } from 'node:http';

import { canonicalJson, canonicalPath, matchKey } from './canonical.mjs';
import { loadCorpus } from './corpus.mjs';
import { explainValidation, nearestCases } from './diagnostics.mjs';
import { SpecIndex } from './spec.mjs';
import { integrationScenario, loadIntegrationCorpus } from './scenarios.mjs';

/**
 * The one credential simulated authentication accepts.
 *
 * A fixed, published test value. It is not a secret and it is not a credential
 * any real deployment issues: the corpus records no credential at all (a signed
 * carrier belongs to whoever minted it), so a replay server that wants to
 * exercise a client's auth discrimination has to name its own. Import it rather
 * than copying the literal.
 */
export const TEST_BEARER_TOKEN = 'ezclassify-conformance-test-bearer';

/**
 * Header carrying {@link TEST_BEARER_TOKEN}, for a harness building a request by
 * hand.
 */
export const TEST_AUTHORIZATION_HEADER = `Bearer ${TEST_BEARER_TOKEN}`;

/** Marks every response this server produced itself rather than replayed. */
export const DIAGNOSTIC_HEADER = 'x-ezclassify-conformance';

/**
 * Identifies deliberately simulated integration failures, never recorded
 * outcomes.
 */
export const SIMULATION_HEADER = 'x-ezclassify-simulation';

/**
 * Status for a diagnostic.
 *
 * 501 on purpose. Every other status in the four hundreds and five hundreds is
 * something the wire itself emits, and a replay server that answered an
 * unrecorded request with a 404 would be indistinguishable from the runtime
 * answering a missing resource, which is exactly the confusion the corpus
 * exists to remove. Nothing on this wire returns 501, so a 501 is always this
 * server saying it has nothing recorded.
 */
const DIAGNOSTIC_STATUS = 501;

const AUTH_MODES = new Set(['none', 'simulated']);

/** A request body over the ceiling. Carries the limit so the answer can name it. */
class BodyTooLargeError extends Error {
    constructor(limit) {
        super(`request body exceeded ${limit} bytes`);
        this.name = 'BodyTooLargeError';
        this.limit = limit;
    }
}

/**
 * Collect a request body without letting an unbounded upload sit in memory.
 *
 * Over the ceiling it pauses the stream rather than destroying it. Killing the
 * socket here would take the answer with it: the client would get a connection
 * reset instead of a diagnostic naming the limit, which is the least debuggable
 * failure this server could hand anyone. The caller writes the diagnostic and
 * closes the connection with it.
 */
function readBody(request, limit) {
    return new Promise((resolve, reject) => {
        const chunks = [];
        let size = 0;
        request.on('data', (chunk) => {
            size += chunk.length;
            if (size > limit) {
                request.pause();
                reject(new BodyTooLargeError(limit));
                return;
            }
            chunks.push(chunk);
        });
        request.on('end', () => resolve(Buffer.concat(chunks)));
        request.on('error', reject);
    });
}

/** Bearer value a request presents, or null. */
function presentedBearer(request) {
    const header = request.headers.authorization;
    if (typeof header !== 'string') return null;
    const match = /^Bearer +(.+)$/i.exec(header.trim());
    return match ? match[1] : null;
}

/**
 * Write a JSON response.
 *
 * The body is serialized canonically, which for a replayed response reproduces
 * the corpus's own key order. That is the strongest fidelity available: the
 * artifact orders keys recursively when it is written, so the recording
 * server's insertion order was never captured and cannot be reproduced by
 * anything. What is byte-exact is what the corpus holds: every value, the
 * status, and every recorded header.
 */
function writeJsonResponse(response, status, headers, value) {
    const payload = Buffer.from(canonicalJson(value), 'utf8');
    response.writeHead(status, {
        ...headers,
        'content-length': String(payload.length),
    });
    response.end(payload);
}

/**
 * Start a replay server.
 *
 * @param {object} [options] - Server options
 * @param {number} [options.port] - Port to listen on; 0 picks a free one
 * @param {string} [options.host] - Interface to bind; loopback by default
 * @param {'none' | 'simulated'} [options.auth] - Authentication simulation
 * @param {string} [options.corpus] - Corpus path; the bundled corpus by default
 * @param {string} [options.scenario] - Named integration profile; excludes
 *   corpus
 * @param {string} [options.corsOrigin] - One explicit browser development
 *   origin
 * @param {Function} [options.observe] - Detached exchange observations, with no
 *   headers
 * @param {boolean} [options.observeBodies] - Include potentially sensitive JSON
 *   bodies
 * @param {number} [options.maxBodyBytes] - Request body ceiling
 * @param {((line: string) => void) | null} [options.log] - Where unmatched
 *   requests are reported; `console.error` by default, null to stay quiet
 * @returns {Promise<{
 *     url: string;
 *     port: number;
 *     host: string;
 *     auth: 'none' | 'simulated';
 *     scenario: string | null;
 *     resetScenario: () => void;
 *     corpus: {
 *         file: string;
 *         corpusVersion: string;
 *         cases: number;
 *         servable: number;
 *     };
 *     specVersion: string;
 *     stop: () => Promise<void>;
 * }>}
 *   The running server
 */
export async function startConformanceServer(options = {}) {
    const {
        auth = 'none',
        corpus: corpusPath,
        host = '127.0.0.1',
        log = (line) => console.error(line),
        maxBodyBytes = 8 * 1024 * 1024,
        port = 0,
        scenario: scenarioName,
        corsOrigin,
        observe,
        observeBodies = false,
    } = options;

    if (scenarioName !== undefined && corpusPath !== undefined) {
        throw new TypeError('scenario and corpus cannot be selected together');
    }
    const scenario =
        scenarioName === undefined ? null : integrationScenario(scenarioName);
    if (corsOrigin !== undefined) {
        let valid = false;
        try {
            const origin = new URL(corsOrigin);
            valid =
                ['http:', 'https:'].includes(origin.protocol) &&
                origin.origin === corsOrigin;
        } catch {}
        if (!valid)
            throw new TypeError(
                'corsOrigin must be one explicit HTTP or HTTPS origin, without a path or wildcard',
            );
    }
    if (observe !== undefined && typeof observe !== 'function')
        throw new TypeError('observe must be a function');
    if (observeBodies && !observe)
        throw new TypeError('observeBodies requires an observe callback');

    if (!AUTH_MODES.has(auth)) {
        throw new TypeError(
            `unknown auth mode "${auth}"; this server understands ${[
                ...AUTH_MODES,
            ]
                .map((mode) => `"${mode}"`)
                .join(' and ')}`,
        );
    }

    const loaded = scenario
        ? loadIntegrationCorpus(scenario)
        : loadCorpus(corpusPath);
    const attempts = new Map();
    const pendingDelays = new Set();
    const observedBodies = new WeakMap();
    const spec = new SpecIndex();
    const report = typeof log === 'function' ? log : () => {};

    const server = createServer((request, response) => {
        handle(request, response).catch((cause) => {
            report(`[conformance] request failed: ${cause.message}`);
            if (!response.headersSent) {
                writeJson(
                    response,
                    DIAGNOSTIC_STATUS,
                    {
                        'content-type': 'application/json',
                        [DIAGNOSTIC_HEADER]: 'error',
                    },
                    {
                        ezclassifyConformanceServer: {
                            message: cause.message,
                            problem: 'request-failed',
                        },
                    },
                );
                return;
            }
            response.destroy();
        });
    });

    function writeJson(response, status, headers, value) {
        const exchange = observedBodies.get(response);
        if (exchange) exchange.response.body = structuredClone(value);
        writeJsonResponse(response, status, headers, value);
    }

    /** Answer with the corpus's own refusal bytes. */
    function refuse(response) {
        const recorded = loaded.denial.response;
        writeJson(
            response,
            recorded.status,
            { ...recorded.headers },
            recorded.body,
        );
    }

    function diagnose(response, problem, detail) {
        report(
            `[conformance] ${problem}: ${detail.request.method} ${detail.request.path}: ` +
                'nothing in the corpus answers this request',
        );
        writeJson(
            response,
            DIAGNOSTIC_STATUS,
            {
                'cache-control': 'no-store',
                'content-type': 'application/json',
                [DIAGNOSTIC_HEADER]: problem,
            },
            {
                ezclassifyConformanceServer: {
                    boundary:
                        'This server replays a recorded corpus. It has no engine and cannot compute an answer to a request nobody recorded.',
                    corpus: {
                        corpusVersion: loaded.corpusVersion,
                        file: loaded.file,
                        recordedExchanges: loaded.servable.length,
                    },
                    problem,
                    ...detail,
                },
            },
        );
    }

    function observation(response, method, path) {
        const started = Date.now();
        const exchange = {
            scenario: scenario?.name ?? null,
            request: { method, path },
            response: {},
            durationMs: 0,
        };
        if (observeBodies) observedBodies.set(response, exchange);
        if (observe)
            response.once('close', () => {
                observedBodies.delete(response);
                exchange.durationMs = Date.now() - started;
                exchange.response.status = response.headersSent
                    ? response.statusCode
                    : undefined;
                exchange.response.disconnected = !response.writableFinished;
                try {
                    Promise.resolve(observe(structuredClone(exchange))).catch(
                        () => report('[conformance] exchange observer failed'),
                    );
                } catch {
                    report('[conformance] exchange observer failed');
                }
            });
        return exchange;
    }

    function delay(response) {
        return new Promise((resolve) => {
            const finish = (completed) => {
                clearTimeout(timer);
                response.removeListener('close', closed);
                pendingDelays.delete(cancel);
                resolve(completed);
            };
            const cancel = () => finish(false);
            const closed = () => cancel();
            const timer = setTimeout(() => finish(true), 1500);
            pendingDelays.add(cancel);
            response.once('close', closed);
        });
    }

    async function replay(response, matched, key, exchange) {
        let recorded = matched.response;
        // A connect-failure profile still accepts only recorded requests. The
        // refusal itself is a recording, not a synthetic authorization result.
        if (
            scenario?.refusalId &&
            [
                'ctxDescribe',
                'ctxSchemeSummary',
                'ctxSchemeConcepts',
                'ctxSchemeCategories',
            ].includes(matched.operationId)
        ) {
            recorded = loaded.servable.find(
                (entry) => entry.id === scenario.refusalId,
            ).response;
        }
        const fault =
            scenario?.operationId === matched.operationId
                ? scenario?.fault
                : undefined;
        if (fault) {
            const attempt = (attempts.get(key) ?? 0) + 1;
            attempts.set(key, attempt);
            if (fault === 'delay') {
                exchange.response.simulated = scenario.name;
                response.setHeader(SIMULATION_HEADER, scenario.name);
                if (!(await delay(response))) return;
            } else if (
                !['transient', 'rate-limit'].includes(fault) ||
                attempt === 1
            ) {
                exchange.response.simulated = scenario.name;
                if (fault === 'disconnected') {
                    response.destroy();
                    return;
                }
                const headers = {
                    'content-type': 'application/json',
                    'cache-control': 'no-store',
                    [SIMULATION_HEADER]: scenario.name,
                };
                if (fault === 'malformed-json') {
                    response.writeHead(200, headers);
                    response.end('{"ezclassifySimulation":');
                    return;
                }
                const status =
                    fault === 'transient'
                        ? 500
                        : fault === 'rate-limit'
                          ? 429
                          : fault === 'unavailable'
                            ? 503
                            : 200;
                if (fault === 'rate-limit') headers['retry-after'] = '1';
                recorded = {
                    status,
                    headers,
                    body:
                        status === 200
                            ? { ezclassifySimulation: scenario.name }
                            : status === 429
                              ? { error: 'Too Many Requests', retryAfter: 1 }
                              : {
                                    error: `Simulated integration failure: ${scenario.name}`,
                                },
                };
            }
        }
        writeJson(
            response,
            recorded.status,
            { ...recorded.headers },
            recorded.body,
        );
    }

    async function handle(request, response) {
        const target = request.url ?? '/';
        const split = target.indexOf('?');
        // Canonical, so the credential gate and the route lookup see the same
        // path the corpus matcher sees, including trailing-slash normalization.
        const path = canonicalPath(
            split === -1 ? target : target.slice(0, split),
        );
        const method = (request.method ?? 'GET').toUpperCase();
        const exchange = observation(response, method, path);
        if (corsOrigin && request.headers.origin === corsOrigin) {
            response.setHeader('access-control-allow-origin', corsOrigin);
            response.setHeader('vary', 'Origin');
            response.setHeader(
                'access-control-expose-headers',
                `X-EzClassify-Resolved-Version, Retry-After, ${DIAGNOSTIC_HEADER}, ${SIMULATION_HEADER}`,
            );
            if (method === 'OPTIONS') {
                response.writeHead(204, {
                    'access-control-allow-methods': [
                        ...new Set(spec.routes.map((route) => route.method)),
                    ].join(', '),
                    'access-control-allow-headers':
                        'Authorization, X-EzClassify-Context-Token, Content-Type',
                });
                response.end();
                return;
            }
        }

        // Refused before the body is read, the way a credential check ahead of
        // dispatch works on a real deployment. Nothing is learned from an
        // unauthenticated request's body, so nothing buffers it.
        if (auth === 'simulated' && spec.requiresCredential(method, path)) {
            if (presentedBearer(request) !== TEST_BEARER_TOKEN) {
                refuse(response);
                return;
            }
        }

        let raw;
        try {
            raw = await readBody(request, maxBodyBytes);
        } catch (cause) {
            if (!(cause instanceof BodyTooLargeError)) throw cause;
            // The rest of the upload is never read, so the connection cannot be
            // reused; saying so lets Node close it once the answer is out.
            response.setHeader('connection', 'close');
            diagnose(response, 'request-too-large', {
                detail: cause.message,
                hint: `This server buffers a request body to match it against the corpus, and it stops at ${cause.limit} bytes. Raise maxBodyBytes if a recorded request is genuinely larger than that.`,
                maxBodyBytes: cause.limit,
                request: { method, path },
            });
            return;
        }
        let body;
        if (raw.length > 0) {
            try {
                body = JSON.parse(raw.toString('utf8'));
            } catch (cause) {
                diagnose(response, 'malformed-json', {
                    detail: cause.message,
                    hint: 'The corpus is matched on a parsed body, so a body that is not JSON can never match.',
                    request: { method, path },
                });
                return;
            }
        }

        if (observeBodies && body !== undefined)
            exchange.request.body = structuredClone(body);
        const key = matchKey(method, target, body);
        const matched = loaded.byKey.get(key);
        if (matched) {
            exchange.caseId = matched.id;
            exchange.operationId = matched.operationId;
            await replay(response, matched, key, exchange);
            return;
        }

        const resolved = spec.resolvePath(path);
        const route = resolved.byMethod(method);
        const declared = resolved.matches;
        const detail = {
            request: { body, method, path },
            nearest: nearestCases(loaded, method, path, body),
        };
        if (route) {
            detail.operationId = route.operationId;
            const validation = spec.validateRequest(route, body);
            if (validation && !validation.ok) {
                detail.specValidation = explainValidation(
                    route,
                    validation.errors,
                    spec,
                    body,
                );
                detail.hint =
                    'The request does not satisfy the contract, so no recording could match it. Fix the request against the findings below first.';
            } else {
                detail.hint =
                    'The contract serves this request and it is well formed. Nobody recorded it, and this server has no engine to answer it with.';
            }
        } else if (declared.length > 0) {
            detail.hint = `The contract serves ${declared.map((entry) => entry.method).join(', ')} on this path, not ${method}.`;
        } else {
            detail.hint =
                'The contract declares no operation on this path. Check the path against openapi.yaml.';
        }
        diagnose(response, 'unmatched-request', detail);
    }

    await new Promise((resolve, reject) => {
        server.once('error', reject);
        server.listen(port, host, () => {
            server.removeListener('error', reject);
            resolve();
        });
    });

    // Past startup the server still emits `error`, and with no listener Node
    // rethrows it as an uncaught exception. This server runs inside SDK test
    // harnesses, so that would end the harness process instead of showing up
    // as a reported line.
    server.on('error', (cause) => {
        report(`[conformance] server error: ${cause.message}`);
    });

    const address = server.address();
    const boundPort =
        typeof address === 'object' && address !== null ? address.port : port;
    const authority = host.includes(':') ? `[${host}]` : host;

    return {
        auth,
        scenario: scenario?.name ?? null,
        resetScenario: () => attempts.clear(),
        corpus: {
            cases: loaded.cases.length,
            corpusVersion: loaded.corpusVersion,
            file: loaded.file,
            servable: loaded.servable.length,
        },
        host,
        port: boundPort,
        specVersion: spec.infoVersion,
        stop: () =>
            new Promise((resolve, reject) => {
                for (const cancel of [...pendingDelays]) cancel();
                server.closeAllConnections();
                server.close((cause) => (cause ? reject(cause) : resolve()));
            }),
        url: `http://${authority}:${boundPort}`,
    };
}
