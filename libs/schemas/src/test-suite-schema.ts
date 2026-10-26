import schema from '../generated/json-schemas-input/test-suite.schema.json';

/**
 * Generated portable suite input schema; semantic inheritance and operation
 * checks remain runner-owned.
 */
export const testSuiteSchema = schema as Record<string, unknown>;

import results from '../generated/json-schemas-test/test-operation-results.schema.json';
import report from '../generated/json-schemas-test/test-suite-run.schema.json';

/**
 * Native result contracts for typed test expectations: the JSON Schema
 * document published as
 * `@ezclassify/schemas/json-schemas-test/test-operation-results.schema.json`.
 * Its definitions carry their own descriptions.
 */
export const testOperationResultsSchema = results;

/**
 * Generated saved report contract, including native coverage references: the
 * JSON Schema document published as
 * `@ezclassify/schemas/json-schemas-test/test-suite-run.schema.json`. Its
 * definitions carry their own descriptions.
 */
export const testSuiteRunSchema = report;
