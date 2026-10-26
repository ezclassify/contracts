import { describe, expect, it } from 'vitest';
import { isContextAdapter } from '../src';
import type { ContextAdapter, SchemeEngineAdapter } from '../src';

/**
 * A host injects one engine and the UI has to decide, at runtime, whether it
 * got the composed Context surface or a bare scheme engine. There is no brand
 * to check, deliberately: a customer's own implementation qualifies on shape
 * alone. That makes the shape the contract, and this is where it is pinned.
 */

const schemeEngine = {
    connected: true,
    process: () => ({}),
} as unknown as SchemeEngineAdapter;

const context = {
    connected: true,
    scheme: schemeEngine,
    audit: () => ({}),
} as unknown as ContextAdapter;

describe('isContextAdapter', () => {
    it('recognizes an adapter carrying the composed surface', () => {
        expect(isContextAdapter(context)).toBe(true);
    });

    it('rejects a bare scheme engine', () => {
        expect(isContextAdapter(schemeEngine)).toBe(false);
    });

    it('rejects an adapter that exposes a scheme but no composed operation', () => {
        // A scheme engine that happens to hold a `scheme` field is not a
        // Context. Both halves have to be there before a caller may reach for
        // audit or access.
        const halfway = {
            connected: true,
            scheme: schemeEngine,
        } as unknown as SchemeEngineAdapter;
        expect(isContextAdapter(halfway)).toBe(false);
    });

    it('narrows the union so the composed operations are reachable', () => {
        const injected: SchemeEngineAdapter | ContextAdapter = context;
        if (!isContextAdapter(injected)) throw new Error('expected a Context');
        expect(typeof injected.audit).toBe('function');
        expect(injected.scheme).toBe(schemeEngine);
    });
});
