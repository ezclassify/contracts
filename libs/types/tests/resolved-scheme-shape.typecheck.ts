import type { Scheme } from '../src/index';

declare const resolved: Scheme;

// Recognition and wizard metadata belong to the authored document. The
// resolved model has no mapped values for these fields.
// @ts-expect-error recognizers are document-only
resolved.recognizers;
// @ts-expect-error wizard questions are document-only
resolved.wizard_questions;
