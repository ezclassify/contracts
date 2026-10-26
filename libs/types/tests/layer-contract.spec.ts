/**
 * The polymorphic layer contract, pinned at the type level.
 *
 * Two things are worth freezing here and nowhere else. The first is the nesting
 * shape: a layer binds to its base by sitting inside that base's reference in a
 * Context, and every layerable family uses the same shape, so a reader who
 * learns one has learned all four. A stray top-level `layers:` sibling, or one
 * family quietly growing a different shape from the others, is the drift these
 * pins catch.
 *
 * The second is the access family's refusal. An access layer may only add, and
 * that rule is carried by the shape rather than by prose alone: `AccessLayer`
 * has no `removes` and no `restores`. `toEqualTypeOf` is exact, so anyone who
 * later adds a removal vocabulary to the access family has to come here and
 * argue for it.
 *
 * The third is prose, and it is here because the prose is the contract.
 * `layer.ts` is the one place the composition rules are written down, and
 * `AccessLayer` points at it for how merging works. A rule stated there without
 * its access carve-out reads as universal, and a reader who implements it that
 * way builds the silent override the complete-only decision exists to prevent.
 * The same goes for the one constructor contract that accepts layers: a reader
 * has to be able to see which families it does not take yet.
 */
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, expectTypeOf, it } from 'vitest';
import type {
    AccessDefinition,
    AccessLayer,
    ComponentRef,
    ContextAccessRef,
    ContextCrosswalkRef,
    ContextDefinition,
    ContextGuideRef,
    ContextSchemeRef,
    CrosswalkDefinition,
    CrosswalkLayer,
    CrosswalkLayerRemoval,
    GuideDefinition,
    GuideLayer,
    GuideLayerRemoval,
    LayerBinding,
    LayerBlockDoc,
    ResolvedComponent,
} from '../src/index';

/** The shape every family's reference takes: a ref, with layers inside it. */
interface NestedRef {
    id: string;
    version: string;
    layers?: ComponentRef[];
}

describe('layers bind by nesting, in the same shape for every family', () => {
    it('gives each family reference the id + version + layers shape', () => {
        expectTypeOf<ContextSchemeRef>().toEqualTypeOf<NestedRef>();
        expectTypeOf<ContextGuideRef>().toEqualTypeOf<NestedRef>();
        expectTypeOf<ContextCrosswalkRef>().toEqualTypeOf<NestedRef>();
        expectTypeOf<ContextAccessRef>().toEqualTypeOf<NestedRef>();
    });

    it('routes every layerable slot of a Context through those references', () => {
        expectTypeOf<
            ContextDefinition['context']['scheme']
        >().toEqualTypeOf<ContextSchemeRef>();
        expectTypeOf<ContextDefinition['context']['guides']>().toEqualTypeOf<
            readonly ContextGuideRef[] | undefined
        >();
        expectTypeOf<
            ContextDefinition['context']['crosswalks']
        >().toEqualTypeOf<readonly ContextCrosswalkRef[] | undefined>();
        expectTypeOf<ContextDefinition['context']['access']>().toEqualTypeOf<
            ContextAccessRef | undefined
        >();
    });

    it('keeps a Context free of any top-level layers sibling', () => {
        expectTypeOf<keyof ContextDefinition['context']>().toEqualTypeOf<
            | 'id'
            | 'version'
            | 'description'
            | 'scheme'
            | 'guides'
            | 'crosswalks'
            | 'access'
        >();
    });

    it('resolves every component the same way, layers included', () => {
        expectTypeOf<ResolvedComponent['layers']>().toEqualTypeOf<
            { ref: ComponentRef; resolvedVersion: string }[] | undefined
        >();
    });
});

describe('the layer envelope is one envelope with per-family payloads', () => {
    it('discriminates layer-ness on a single field in every family', () => {
        expectTypeOf<CrosswalkDefinition['crosswalk']['type']>().toEqualTypeOf<
            'crosswalk' | 'layer' | undefined
        >();
        expectTypeOf<GuideDefinition['guide']['type']>().toEqualTypeOf<
            'guide' | 'layer' | undefined
        >();
        expectTypeOf<AccessDefinition['access']['type']>().toEqualTypeOf<
            'access' | 'layer' | undefined
        >();
    });

    it('carries the family payload in the one layer block', () => {
        expectTypeOf<CrosswalkDefinition['crosswalk']['layer']>().toEqualTypeOf<
            CrosswalkLayer | undefined
        >();
        expectTypeOf<GuideDefinition['guide']['layer']>().toEqualTypeOf<
            GuideLayer | undefined
        >();
        expectTypeOf<AccessDefinition['access']['layer']>().toEqualTypeOf<
            AccessLayer | undefined
        >();
    });

    it('binds every payload to one base', () => {
        expectTypeOf<LayerBinding>().toEqualTypeOf<{
            base: string;
            requires?: string[];
        }>();
        expectTypeOf<LayerBlockDoc>().toMatchTypeOf<LayerBinding>();
        expectTypeOf<CrosswalkLayer>().toMatchTypeOf<LayerBinding>();
        expectTypeOf<GuideLayer>().toMatchTypeOf<LayerBinding>();
        expectTypeOf<AccessLayer>().toMatchTypeOf<LayerBinding>();
    });

    it('names removals by kind and id rather than by path', () => {
        expectTypeOf<CrosswalkLayerRemoval>().toEqualTypeOf<
            { mapping: string } | { selection: string }
        >();
        expectTypeOf<GuideLayerRemoval>().toEqualTypeOf<
            { rule: string } | { category: string }
        >();
    });
});

describe('an access layer can only add', () => {
    it('leaves no removal vocabulary to express', () => {
        expectTypeOf<AccessLayer>().toEqualTypeOf<{
            base: string;
            requires?: string[];
        }>();
        expectTypeOf<keyof AccessLayer>().toEqualTypeOf<'base' | 'requires'>();
    });

    it('is the one family whose payload is nothing but the binding', () => {
        expectTypeOf<keyof CrosswalkLayer>().toEqualTypeOf<
            'base' | 'requires' | 'removes' | 'restores'
        >();
        expectTypeOf<keyof GuideLayer>().toEqualTypeOf<
            'base' | 'requires' | 'removes' | 'restores'
        >();
    });
});

const srcDir = path.resolve(
    path.dirname(fileURLToPath(import.meta.url)),
    '../src',
);

/** The body of one `## Heading` section of a docblock, heading excluded. */
function docSection(source: string, heading: string): string {
    const start = source.indexOf(`## ${heading}`);
    expect(start, `no "## ${heading}" section found`).toBeGreaterThan(-1);
    const rest = source.slice(start + heading.length + 3);
    const end = rest.indexOf('## ');
    return end === -1 ? rest : rest.slice(0, end);
}

/** The docblock immediately above a declaration. */
function docBlockAbove(source: string, declaration: string): string {
    const at = source.indexOf(declaration);
    expect(at, `no declaration "${declaration}" found`).toBeGreaterThan(-1);
    const before = source.slice(0, at);
    const opened = before.lastIndexOf('/**');
    const closed = before.lastIndexOf('*/');
    expect(opened, `no docblock above "${declaration}"`).toBeGreaterThan(-1);
    return before.slice(opened, closed);
}

describe('the composition rules say where access departs from them', () => {
    const layerSource = readFileSync(path.join(srcDir, 'layer.ts'), 'utf8');

    it('meets the fail-closed family inside the section that states the rules', () => {
        // Not a style preference. `AccessLayer` links here as its merge
        // contract, so whatever this section states unqualified is what an
        // implementer reads as the access rule too.
        expect(docSection(layerSource, 'Composition')).toMatch(/access/i);
    });

    it('promises only what an override leaves observable', () => {
        // The runtime keeps no record of the element an override replaced;
        // the winner's source provenance is all a result carries.
        const prose = docSection(layerSource, 'Composition')
            .replace(/\n\s*\*\s?/g, ' ')
            .replace(/\s+/g, ' ');
        expect(prose).not.toMatch(/override marker/i);
        expect(prose).toMatch(/The composed result shows only the winner/);
        expect(prose).toMatch(
            /carries that source's `provenance`\. No record names the element the layer replaced/,
        );
    });

    it('still explains the departure in full further down', () => {
        expect(docSection(layerSource, 'Where the families differ')).toMatch(
            /may only add/,
        );
    });
});

describe('the runtime Context contract admits which layers it takes', () => {
    const contextSource = readFileSync(path.join(srcDir, 'context.ts'), 'utf8');
    const doc = docBlockAbove(
        contextSource,
        'export interface ContextFromComponentsArgs',
    );

    it.each(['scheme', 'guide', 'access'])(
        'names the supported %s layer family',
        (family) => {
            expect(doc.toLowerCase()).toContain(family);
        },
    );

    it('requires explicit refusal of unsupported crosswalk layers', () => {
        expect(doc).toMatch(/Crosswalk layers are not accepted yet/);
        expect(doc).toMatch(/resolvers must refuse them explicitly/);
    });
});
