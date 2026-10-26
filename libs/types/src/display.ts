/**
 * Two small pure functions over published contract shapes.
 *
 * Both answer a question more than one surface asks: how a guide rule's outcome
 * reads on screen, and how a flat list of selectables indexes by category.
 * Neither carries policy, neither needs a runtime, and neither has any input
 * beyond the contract types they read. They sit here rather than inside one
 * implementation so that a UI, an HTTP client, and an engine derive the same
 * answer instead of each keeping a copy that quietly diverges.
 */
import type { GuideRuleOutcome } from './guide.js';
import type { Selectable } from './scheme.js';

/**
 * Render a guide rule's outcome as a display string.
 *
 * An outcome carries either a pre-rendered marking or the concept references
 * that produce one. The pre-rendered form wins when present; otherwise the
 * concept ids are listed in order. An outcome with neither renders as the empty
 * string rather than a placeholder, so a caller can decide what absence looks
 * like.
 *
 * @param outcome - The rule outcome to describe.
 * @returns The display string, or `''` when the outcome carries nothing.
 */
export function describeOutcome(outcome: GuideRuleOutcome): string {
    if (outcome.rendered) return outcome.rendered;
    if (outcome.concepts && outcome.concepts.length > 0) {
        return outcome.concepts.map((c) => c.id).join(', ');
    }
    return '';
}

/**
 * Index a flat list of selectables by category id.
 *
 * Anything that reasons about a marking one category at a time needs this
 * grouping first: rendering a marking in category order, deciding which options
 * a category may still offer, evaluating a `when` condition against the
 * categories a marking already holds. Entries keep their relative order within
 * each category, and a category with no entries is absent from the map rather
 * than present and empty.
 *
 * @param items - The selectables to group; the input array is not modified.
 * @returns A map from category id to the entries in that category.
 */
export function buildCategoryMap<T extends Selectable>(
    items: T[],
): Map<string, T[]> {
    const map = new Map<string, T[]>();
    for (const a of items) {
        const list = map.get(a.categoryId) ?? [];
        list.push(a);
        map.set(a.categoryId, list);
    }
    return map;
}
