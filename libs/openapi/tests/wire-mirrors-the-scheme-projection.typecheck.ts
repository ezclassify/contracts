import { expectTypeOf } from 'vitest';
import type { SchemeMetaView, SchemePublicView } from '@ezclassify/types';
// The loaded scheme shapes are internal to the engine, and the projection this
// file pins is exactly the point where they meet the wire.
import type { ParseConfig, Scheme } from '@ezclassify/types/internal';
import type {
    PublicGrammarResponseBody,
    SchemeScopesResponseBody,
    SchemeSummaryResponseBody,
} from '../src/wire.js';
import type { decl as categoriesDecl } from '../src/route-decls/ctx-scheme-categories.js';
import type { decl as conceptsDecl } from '../src/route-decls/ctx-scheme-concepts.js';
import type { decl as formatsDecl } from '../src/route-decls/ctx-scheme-formats.js';
import type { decl as labelPresetsDecl } from '../src/route-decls/ctx-scheme-label-presets.js';

/**
 * The scheme sub-resources answer with a field-for-field projection of the
 * loaded scheme document: `buildSchemeSummary`, `buildPublicConcepts` and the
 * rest in the runtime pick fields off a {@link Scheme} and hand the object
 * straight to `JSON.stringify`. The wire types here are hand-written copies of
 * the picked shape, and they are hand-written on purpose: an alias to the
 * definition type would let a scheme-authoring change widen the HTTP surface
 * without anyone deciding to.
 *
 * A copy can drift, though. A property the definition declares optional and the
 * copy declares required makes a client generated from the published contract
 * reject the response of every scheme that leaves it out, and a copy can name a
 * type the document never holds.
 *
 * So the copy stays a copy and this pins it. Each block below states that the
 * response body equals the picked fields of the definition type, including
 * optionality, which is the half that drifts quietly. Widening the HTTP surface
 * still takes a deliberate edit: adding a field to the definition does nothing
 * until someone adds it to both the projection and the pick list here, and
 * changing an existing field's shape or optionality fails this file rather than
 * the next corpus recording.
 *
 * `undefined` in a union does not satisfy these. That is deliberate too: JSON
 * has no `undefined`, so a property the server may leave out can only be
 * expressed as an optional one, and `T | undefined` on a required member says
 * the opposite of what the wire does.
 */

/** Merges an intersection into one object type, so it compares as one. */
type Flatten<T> = { [K in keyof T]: T[K] };

// The three render defaults are pinned against the meta view rather than
// against `Scheme`. For a scheme that declares `render.surfaces`,
// `Scheme.defaultRenderFormat` is absent and all three are resolved the way
// `getSchemeMeta` resolves them, so the meta view is the shape the summary
// carries.
expectTypeOf<SchemeSummaryResponseBody>().toEqualTypeOf<
    Flatten<
        Pick<
            Scheme,
            | 'id'
            | 'version'
            | 'name'
            | 'description'
            | 'definition'
            | 'guidance'
            | 'colorFrom'
            | 'colorRules'
            | 'roleAware'
            | 'vocabulary'
            | 'referenceSurfaceLabel'
            | 'contextFormats'
            | 'embeddedMarking'
            | 'defaultScope'
            | 'scopeLabel'
        > &
            Pick<
                SchemeMetaView,
                | 'defaultRenderFormat'
                | 'defaultPartRenderFormat'
                | 'defaultWholeRenderFormat'
            >
    >
>();

/**
 * The concept, category, format and label-preset collections answer with the
 * public views themselves, the shapes a local engine's `getScheme()` carries,
 * so a remote client assembles the same `SchemePublicView` a local one returns
 * without converting anything.
 */
type ResponseOf<D> = D extends { readonly _res?: infer R } ? R : never;
expectTypeOf<ResponseOf<typeof conceptsDecl>>().toEqualTypeOf<
    SchemePublicView['concepts']
>();
expectTypeOf<ResponseOf<typeof categoriesDecl>>().toEqualTypeOf<
    SchemePublicView['categories']
>();
expectTypeOf<ResponseOf<typeof formatsDecl>>().toEqualTypeOf<
    SchemePublicView['formats']
>();
expectTypeOf<ResponseOf<typeof labelPresetsDecl>>().toEqualTypeOf<
    NonNullable<SchemePublicView['labelPresets']>
>();

/**
 * Remote presentation uses the same resolved layout as the local adapter: a
 * format view is the meta view's layout plus its syntax discriminant.
 */
type LocalFormatLayout = NonNullable<SchemeMetaView['formats']>[number];
expectTypeOf<
    Omit<SchemePublicView['formats'][number], 'syntax'>
>().toEqualTypeOf<LocalFormatLayout>();

expectTypeOf<PublicGrammarResponseBody>().toEqualTypeOf<
    Pick<ParseConfig, 'caseSensitive' | 'stripWhitespace'>
>();

/**
 * The scopes resource returns the scheme's own `scopes` array, empty when it
 * declares none.
 */
expectTypeOf<SchemeScopesResponseBody>().toEqualTypeOf<
    NonNullable<Scheme['scopes']>
>();
