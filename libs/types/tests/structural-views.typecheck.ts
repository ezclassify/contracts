import { expectTypeOf } from 'vitest';
import type {
    ConceptView,
    GuideRuleView,
    GuideStructuralView,
    SchemeStructuralView,
    StructuralView,
} from '../src/index';

/**
 * The scheme and guide views are declared separately so each can describe its
 * own members, but a component that renders either one takes the shared generic
 * shape. Both must stay exactly that shape for their item type.
 */
expectTypeOf<SchemeStructuralView>().toEqualTypeOf<
    StructuralView<ConceptView>
>();
expectTypeOf<GuideStructuralView>().toEqualTypeOf<
    StructuralView<GuideRuleView>
>();
