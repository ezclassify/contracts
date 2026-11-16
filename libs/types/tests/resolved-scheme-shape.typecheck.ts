import type { Scheme } from '../src/index';

declare const resolved: Scheme;

// Recognizers belong to the authored document. The resolved model has no
// mapped value for them.
// @ts-expect-error recognizers are document-only
resolved.recognizers;
