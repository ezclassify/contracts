/**
 * Checks on a scheme's rules that the schema cannot state in a way an author
 * can act on.
 *
 * The schema accepts a rule whose fields have the right types. Some rules are
 * still wrong in a way only the combination of fields shows, and the generic
 * schema message ("must have required property") would not say what the author
 * most likely meant. Those are reported here, by stable id, with a message that
 * names the fix.
 */

/** Every diagnostic the rule checks can report. */
export const RULE_DIAGNOSTICS = Object.freeze({
    /**
     * A `restrict` rule names no `category`. `restrict` says which values one
     * category may hold, so without the category it says nothing. A rule that
     * asks for at least one of its targets is a `require_any`.
     */
    RESTRICT_WITHOUT_CATEGORY: 'rule/restrict-without-category',
    /**
     * A rule's `id` begins with `_`. The engine keeps that prefix for its own
     * ids, the ones it reports its own errors under as `constraintId` and
     * writes as `sourceRule` on assertions its structure added, so a scheme
     * rule under such an id could not be told apart from them.
     */
    RESERVED_ID: 'rule/reserved-id',
});

/** The prefix the engine keeps for ids it writes as `sourceRule` itself. */
const ENGINE_ID_PREFIX = '_';

/**
 * Report what is wrong with the rules of a scheme document.
 *
 * Reads `scheme.rules` only and ignores anything that is not a rule object, so
 * it is safe to run on a document the schema has not accepted; the schema
 * reports the shape errors.
 *
 * @param {unknown} document A parsed scheme document (`{ scheme: ... }`).
 * @returns {{ id: string; path: string; message: string }[]}
 */
export function ruleDiagnostics(document) {
    const rules = document?.scheme?.rules;
    if (!Array.isArray(rules)) return [];
    const diagnostics = [];
    rules.forEach((rule, index) => {
        if (rule === null || typeof rule !== 'object') return;
        const path = `/scheme/rules/${index}`;
        const named =
            typeof rule.id === 'string' && rule.id !== ''
                ? `rule \`${rule.id}\``
                : 'this rule';
        // An id of the wrong type is a schema error, reported there.
        if (
            typeof rule.id === 'string' &&
            rule.id.startsWith(ENGINE_ID_PREFIX)
        ) {
            diagnostics.push({
                id: RULE_DIAGNOSTICS.RESERVED_ID,
                path,
                message: `${named} has an id that begins with \`${ENGINE_ID_PREFIX}\`, which is reserved for the engine's own ids, the ones it reports its own errors under as \`constraintId\` and writes as \`sourceRule\` on assertions its structure added. Rename the rule so its id does not begin with \`${ENGINE_ID_PREFIX}\`.`,
            });
        }
        if (rule.action !== 'restrict') return;
        // A named category passes here. One of the wrong type is a schema
        // error, reported there.
        if (rule.category !== undefined && rule.category !== '') return;
        diagnostics.push({
            id: RULE_DIAGNOSTICS.RESTRICT_WITHOUT_CATEGORY,
            path,
            message: `${named} uses \`restrict\` without a \`category\`. A \`restrict\` rule limits one category to its targets, so it must name that category. To require at least one of the targets instead, use \`action: require_any\`.`,
        });
    });
    return diagnostics;
}
