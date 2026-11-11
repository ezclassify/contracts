import { expectTypeOf } from 'vitest';
import type {
    AccessDefinition,
    ContextCrosswalkDescriptor,
    CrosswalkDefinition,
    CrosswalkDisposition,
    CrosswalkMapping,
    CrosswalkMappingDoc,
    CrosswalkOutcome,
    CrosswalkSelectionOutcome,
    GuideBlock,
    GuideMetaView,
    GuideRule,
    GuideRuleDoc,
    GuideStructuralView,
    MarkingSchemeRefDoc,
} from '../src/index';

/**
 * A document's part markings stay in the document: the rule and mapping shapes
 * an engine answers with carry none, and only the whole reaches a summary. A
 * guide, access policy or crosswalk names its marking scheme by reference,
 * never as `self`.
 */
expectTypeOf<GuideRule>().not.toHaveProperty('marking');
expectTypeOf<CrosswalkMapping>().not.toHaveProperty('marking');
expectTypeOf<GuideRuleDoc['marking']>().toEqualTypeOf<string | undefined>();
expectTypeOf<CrosswalkMappingDoc['marking']>().toEqualTypeOf<
    string | undefined
>();

type Reference = MarkingSchemeRefDoc | undefined;
expectTypeOf<GuideBlock['marking_scheme']>().toEqualTypeOf<Reference>();
expectTypeOf<
    AccessDefinition['access']['marking_scheme']
>().toEqualTypeOf<Reference>();
expectTypeOf<
    CrosswalkDefinition['crosswalk']['marking_scheme']
>().toEqualTypeOf<Reference>();

type Whole = string | undefined;
expectTypeOf<GuideMetaView['marking']>().toEqualTypeOf<Whole>();
expectTypeOf<GuideStructuralView['marking']>().toEqualTypeOf<Whole>();
expectTypeOf<ContextCrosswalkDescriptor['marking']>().toEqualTypeOf<Whole>();

/**
 * `not-selected` is a fact about one translation, not a decision a document can
 * author or a selection can reach, so only an outcome carries it.
 */
expectTypeOf<CrosswalkOutcome['disposition']>().toEqualTypeOf<
    CrosswalkDisposition | 'unmapped' | 'not-selected'
>();
expectTypeOf<
    CrosswalkSelectionOutcome['disposition']
>().toEqualTypeOf<CrosswalkDisposition>();
