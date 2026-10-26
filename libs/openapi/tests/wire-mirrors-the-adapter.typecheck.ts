import { expectTypeOf } from 'vitest';
import type {
    Assertion,
    CrosswalkTranslationInput,
    RemoteContextSchemeEngineAdapter,
    RemoteSchemeEngineAdapter,
    SchemeEngineAdapter,
} from '@ezclassify/types';
import type {
    CtxCrosswalkTranslateRequestBody,
    CtxDescribeResponseBody,
    CtxComponentDescriptor,
    CtxSchemeExplainRequestBody,
    CtxSchemeProcessRequestBody,
    CtxSchemeValidateRequestBody,
} from '../src/wire.js';

/**
 * Context request bodies are written out field by field rather than aliased to
 * the definition type, so each one is a named schema root a generator can
 * address. That is the convention here and it is fine, right up until the two
 * copies drift: `ContextAdapter.translate` takes a
 * {@link CrosswalkTranslationInput} and the route accepts a
 * `CtxCrosswalkTranslateRequestBody`, and a caller that satisfies one is
 * supposed to satisfy the other.
 *
 * The two are different types on purpose. In process the source is one field
 * holding either a marking string or its parsed assertions; on the wire it is
 * two fields, because the MCP catalog builder refuses a scalar-or-array union
 * in a tool input. So the pin is the mapping rather than an equality: each half
 * of the adapter's union is a wire field, the field sets line up, and adding a
 * field to either side alone fails here, which is the moment to decide whether
 * the other side should carry it too.
 */
expectTypeOf<keyof CrosswalkTranslationInput>().toEqualTypeOf<
    'crosswalkId' | 'marking'
>();
expectTypeOf<keyof CtxCrosswalkTranslateRequestBody>().toEqualTypeOf<
    'crosswalkId' | 'marking' | 'assertions'
>();

expectTypeOf<CtxCrosswalkTranslateRequestBody['crosswalkId']>().toEqualTypeOf<
    CrosswalkTranslationInput['crosswalkId']
>();

expectTypeOf<
    NonNullable<CtxCrosswalkTranslateRequestBody['marking']>
>().toEqualTypeOf<Extract<CrosswalkTranslationInput['marking'], string>>();

expectTypeOf<
    NonNullable<CtxCrosswalkTranslateRequestBody['assertions']>
>().toEqualTypeOf<Extract<CrosswalkTranslationInput['marking'], Assertion[]>>();

/**
 * The process option bag and the process request body, pinned key for key.
 *
 * `validateOnly` sat on every adapter's option bag for months while the request
 * body refused it: a remote adapter either dropped it silently or sent it and
 * got a 400. The adapter type is what a caller codes against, so whatever it
 * offers has to be something the route accepts. `input` is the positional
 * argument on the adapter and a field on the wire; `signal` cancels the call on
 * the caller's side and never travels. Everything else must match both ways,
 * and `check:openapi` holds the published document to this body, so the chain
 * from adapter to schema has no link a test does not hold.
 */
type ProcessOptions<
    Adapter extends { process: (...args: never[]) => unknown },
> = Exclude<keyof NonNullable<ProcessOptionBag<Adapter['process']>>, 'signal'>;
// The last overload of each process method is the context-bound form,
// `(input, options)`, which is the one the Context route serves.
type ProcessOptionBag<Process> = Process extends (
    input: string | Assertion[],
    options?: infer Options,
) => unknown
    ? Options
    : never;
type WireProcessFields = Exclude<keyof CtxSchemeProcessRequestBody, 'input'>;

expectTypeOf<
    ProcessOptions<SchemeEngineAdapter>
>().toEqualTypeOf<WireProcessFields>();
expectTypeOf<
    ProcessOptions<RemoteSchemeEngineAdapter>
>().toEqualTypeOf<WireProcessFields>();
expectTypeOf<
    ProcessOptions<RemoteContextSchemeEngineAdapter>
>().toEqualTypeOf<WireProcessFields>();

// Field for field, too: a key that matched with a different type would pass the
// check above and still be refused by the route. The Context-bound adapter is
// the one this route serves; the other two lanes are held to the same bag
// exactly by adapter-symmetry.typecheck.ts in @ezclassify/types.
expectTypeOf<
    Omit<
        NonNullable<
            ProcessOptionBag<RemoteContextSchemeEngineAdapter['process']>
        >,
        'signal'
    >
>().toEqualTypeOf<Omit<CtxSchemeProcessRequestBody, 'input'>>();

/**
 * The validate option bag and the validate request body.
 *
 * Validate takes text or facts. On the adapter that is one positional argument
 * of either type; on the wire it is `input` or `assertions`, because the MCP
 * catalog builder refuses a field that is a string or an array. Everything else
 * is the option bag, key for key and type for type, and none of it changes how
 * the marking is settled.
 */
type ValidateOptionBag<Validate> = Validate extends (
    input: string | Assertion[],
    options?: infer Options,
) => unknown
    ? Options
    : never;
expectTypeOf<
    Omit<
        NonNullable<
            ValidateOptionBag<RemoteContextSchemeEngineAdapter['validate']>
        >,
        'signal'
    >
>().toEqualTypeOf<Omit<CtxSchemeValidateRequestBody, 'input' | 'assertions'>>();
expectTypeOf<
    NonNullable<CtxSchemeValidateRequestBody['input']>
>().toEqualTypeOf<
    Extract<Parameters<RemoteContextSchemeEngineAdapter['validate']>[0], string>
>();
expectTypeOf<
    NonNullable<CtxSchemeValidateRequestBody['assertions']>
>().toEqualTypeOf<
    Extract<
        Parameters<RemoteContextSchemeEngineAdapter['validate']>[0],
        Assertion[]
    >
>();

/**
 * The explain option bag and the explain request body: what process takes, less
 * `outputs` and `suggestFor`, on both sides.
 */
expectTypeOf<
    Omit<
        NonNullable<
            ProcessOptionBag<RemoteContextSchemeEngineAdapter['explain']>
        >,
        'signal'
    >
>().toEqualTypeOf<Omit<CtxSchemeExplainRequestBody, 'input'>>();
expectTypeOf<Omit<CtxSchemeExplainRequestBody, 'input'>>().toEqualTypeOf<
    Omit<CtxSchemeProcessRequestBody, 'input' | 'outputs' | 'suggestFor'>
>();

// Discovery describes concrete context identity and ordered component provenance.
expectTypeOf<keyof CtxDescribeResponseBody>().toEqualTypeOf<
    | 'id'
    | 'version'
    | 'description'
    | 'scheme'
    | 'schemes'
    | 'guides'
    | 'access'
    | 'crosswalks'
>();
expectTypeOf<CtxDescribeResponseBody['version']>().toEqualTypeOf<string>();
expectTypeOf<
    CtxDescribeResponseBody['scheme']
>().toEqualTypeOf<CtxComponentDescriptor>();
expectTypeOf<CtxComponentDescriptor['layers']>().toEqualTypeOf<
    CtxComponentDescriptor[] | undefined
>();
