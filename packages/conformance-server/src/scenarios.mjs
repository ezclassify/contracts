/** Named integration fixtures, separate from the golden SDK conformance corpus. */
import { fileURLToPath } from 'node:url';
import { matchKey } from './canonical.mjs';
import { loadCorpus, CorpusError } from './corpus.mjs';

const CORPUS_PATH = fileURLToPath(
    new URL('../scenarios/cedar-valley/corpus.json', import.meta.url),
);
const PROFILES = [
    {
        name: 'cedar-valley',
        description:
            'Recorded Cedar Valley UI, guide, validation, access and error exchanges.',
    },
    {
        name: 'context-not-found',
        description:
            'Recorded bootstrap requests replay the real missing-context refusal.',
        refusalId: 'cedar-valley.context-not-found',
    },
    {
        name: 'version-not-found',
        description:
            'Recorded bootstrap requests replay the real missing-version refusal.',
        refusalId: 'cedar-valley.version-not-found',
    },
    {
        name: 'slow-response',
        description:
            'Delay recorded marking processing by 1500 ms for loading and cancellation tests.',
        fault: 'delay',
    },
    {
        name: 'transient-error',
        description:
            'First attempt at each recorded marking request returns simulated 500; retries recover.',
        fault: 'transient',
    },
    {
        name: 'rate-limit',
        description:
            'First attempt at each recorded marking request returns simulated 429 with Retry-After: 1; retries recover.',
        fault: 'rate-limit',
    },
    {
        name: 'unavailable',
        description:
            'Recorded marking processing always returns simulated 503.',
        fault: 'unavailable',
    },
    {
        name: 'disconnected',
        description:
            'Close the socket on recorded marking processing without a response.',
        fault: 'disconnected',
    },
    {
        name: 'malformed-json',
        description:
            'Recorded marking processing returns deliberately invalid JSON with status 200.',
        fault: 'malformed-json',
    },
    {
        name: 'malformed-envelope',
        description:
            'Recorded marking processing returns a deliberately invalid response envelope with status 200.',
        fault: 'malformed-envelope',
    },
];

/**
 * List the built-in scenario names and their behavior without loading
 * recordings.
 */
export function listIntegrationScenarios() {
    return PROFILES.map(({ name, description }) => ({ name, description }));
}

/** Resolve a built-in selection before opening a listener. */
export function integrationScenario(name) {
    const profile = PROFILES.find((entry) => entry.name === name);
    if (!profile)
        throw new TypeError(
            `unknown integration scenario "${name}"; choose ${PROFILES.map((entry) => entry.name).join(', ')}`,
        );
    return { ...profile, corpus: CORPUS_PATH, operationId: 'ctxSchemeProcess' };
}

/**
 * Read detached, servable exchanges for a harness that needs exact supported
 * inputs.
 */
export function readScenarioCases(name = 'cedar-valley') {
    return structuredClone(
        loadIntegrationCorpus(integrationScenario(name)).servable,
    );
}

/**
 * Missing resources legitimately use the constant refusal. Integration fixtures
 * retain those exact requests; strict SDK conformance keeps its existing
 * index.
 */
export function loadIntegrationCorpus(scenario) {
    const loaded = loadCorpus(scenario.corpus);
    const servable = loaded.cases.filter(
        (entry) => entry.auth?.deployment === 'open',
    );
    const byKey = new Map();
    for (const entry of servable) {
        const key = matchKey(
            entry.request.method,
            entry.request.path,
            entry.request.body,
        );
        if (byKey.has(key))
            throw new CorpusError(
                `integration cases ${byKey.get(key).id} and ${entry.id} are the same request`,
            );
        byKey.set(key, entry);
    }
    if (
        scenario.refusalId &&
        !servable.some((entry) => entry.id === scenario.refusalId)
    )
        throw new CorpusError(
            `integration corpus has no case ${scenario.refusalId}`,
        );
    return { ...loaded, servable, byKey };
}
