/**
 * `@ezclassify/conformance-server`: a replay server for the golden wire corpus.
 *
 * Start one in a test harness, point a client at `url`, and every request the
 * corpus recorded is answered with what the real runtime answered. Anything
 * else is refused with a diagnostic. There is no engine here.
 */

export {
    DIAGNOSTIC_HEADER,
    SIMULATION_HEADER,
    TEST_AUTHORIZATION_HEADER,
    TEST_BEARER_TOKEN,
    startConformanceServer,
} from './server.mjs';

export {
    BUNDLED_CORPUS_PATH,
    BUNDLED_MANIFEST_PATH,
    CorpusError,
    loadCorpus,
    readManifest,
} from './corpus.mjs';

export { canonicalJson, canonicalTarget, matchKey } from './canonical.mjs';

export { listIntegrationScenarios, readScenarioCases } from './scenarios.mjs';
