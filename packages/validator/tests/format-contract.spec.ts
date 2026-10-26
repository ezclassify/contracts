import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parse as parseYaml } from 'yaml';

// @ts-expect-error: the validator is plain ESM JavaScript with no types.
import { validateDocument } from '../src/index.mjs';
import {
    compilePlan,
    resolveTierHeadRelation,
    severityOf,
    // @ts-expect-error: the validator is plain ESM JavaScript with no types.
} from '../src/plan.mjs';

/**
 * # The format contract, proved against the artifacts
 *
 * Two questions, asked of the artifacts rather than of a summary of them.
 *
 * 1. Does every fragment the contract proposes embed into a schema-valid document?
 *    Each one is checked in under `design/` and validated here. A fragment that
 *    only reads well in prose has not been proved to be expressible.
 * 2. Do the compile-time rules fire where they should and stay quiet where they
 *    should? Each diagnostic has a fixture that trips it, and every valid
 *    fixture is held against the whole diagnostic set, which is what stops a
 *    rule from being satisfied by refusing everything.
 */

const here = path.dirname(fileURLToPath(import.meta.url));
const FIXTURES = path.join(here, 'fixtures', 'format-contract');

interface Doc {
    scheme: Record<string, unknown>;
}

function load(group: 'design' | 'falsification', file: string): Doc {
    return parseYaml(
        fs.readFileSync(path.join(FIXTURES, group, file), 'utf8'),
    ) as Doc;
}

function filesIn(group: 'design' | 'falsification'): string[] {
    return fs
        .readdirSync(path.join(FIXTURES, group))
        .filter((name) => name.endsWith('.yaml'))
        .sort();
}

interface Diagnostic {
    id: string;
    severity: 'error' | 'warning';
    path: string;
    message: string;
}

function diagnostics(document: Doc): Diagnostic[] {
    return compilePlan(document).diagnostics as Diagnostic[];
}

/** Every diagnostic id, in the order reported, duplicates included. */
function diagnosticIds(document: Doc): string[] {
    return diagnostics(document).map((entry) => entry.id);
}

/** Error ids only: what makes a document invalid. */
function errorIds(document: Doc): string[] {
    return diagnostics(document)
        .filter((entry) => entry.severity === 'error')
        .map((entry) => entry.id);
}

/** Warning ids only: what a valid document is told about anyway. */
function warningIds(document: Doc): string[] {
    return diagnostics(document)
        .filter((entry) => entry.severity === 'warning')
        .map((entry) => entry.id);
}

function tierHeadRelation(document: Doc) {
    const scheme = document.scheme as any;
    const field = scheme.render.formats[0].fields[0];
    return resolveTierHeadRelation({
        concepts: scheme.data.concepts.inline,
        tiers: field.tiers.map((tier: any) => ({
            tier: tier.tier,
            view: tier.view,
            headView: tier.head_view,
        })),
        fieldView: scheme.render.formats[0].view ?? 'default',
        path: '/scheme/render/formats/0/fields/0',
    }) as {
        headByConcept: Map<string, string>;
        ambiguousConcepts: Set<string>;
        diagnostics: Diagnostic[];
    };
}

/**
 * The exact error and warning set for every falsification fixture.
 *
 * Exact, not "contains". A fixture that picks up a second diagnostic is either
 * a rule firing where it should not or a fixture that stopped being about the
 * one thing it was written for, and `toContain` reports neither. Warnings are
 * listed separately because they do not make a document invalid: an author
 * whose block format has a free-text field is told about it and is not asked to
 * declare an escape mechanism their format does not have.
 */
const EXPECTED: Record<string, { errors: string[]; warnings: string[] }> = {
    'D-indeterminate-separator.yaml': {
        errors: [
            'plan/indeterminate-separator',
            'plan/indeterminate-separator',
        ],
        warnings: [],
    },
    'D-non-adjacent-join.yaml': {
        errors: ['plan/non-adjacent-join'],
        warnings: [],
    },
    'D-separator-spelling.yaml': {
        errors: [],
        warnings: ['plan/reserved-literal-collision'],
    },
    'D-unbound-tier-view.yaml': {
        // Two entries, two severities, and the fixture was written with both
        // cases in it before either was distinguished. The first names a view
        // none of the tier's concepts declares, so the composed token has
        // nothing to print and no layer repairs the concepts that already
        // exist. The second names a tier nothing carries, which is what a base
        // document says when the layer that populates the tier has not been
        // composed onto it yet.
        errors: ['plan/unbound-tier-view'],
        warnings: ['plan/unbound-tier-view'],
    },
    'D-unresolved-after-category.yaml': {
        errors: ['plan/unresolved-reference'],
        warnings: [],
    },
    'D-unresolved-recognizer.yaml': {
        errors: ['plan/unresolved-reference', 'plan/unresolved-reference'],
        warnings: [],
    },
    'F01-canonical-inline.yaml': { errors: [], warnings: [] },
    'F02-tolerant-case-order.yaml': { errors: [], warnings: [] },
    'F03-overlapping-bindings.yaml': {
        errors: ['plan/overlapping-bindings', 'plan/overlapping-bindings'],
        warnings: [],
    },
    'F04-unknown-tail.yaml': {
        errors: [],
        warnings: ['plan/unframable-value'],
    },
    'F05-unframable-value.yaml': {
        errors: [],
        warnings: ['plan/unframable-value'],
    },
    'F06-unknown-placeholder.yaml': {
        errors: [
            'plan/unknown-placeholder',
            'plan/unknown-placeholder',
            'plan/unknown-placeholder',
        ],
        warnings: ['plan/unframable-value'],
    },
    'F07-unresolved-condition.yaml': {
        errors: ['plan/unresolved-condition'],
        warnings: [],
    },
    'F08-calendar-dates.yaml': { errors: [], warnings: [] },
    'F09-event-companion-date.yaml': {
        errors: [],
        warnings: ['plan/unframable-value'],
    },
    'F10-source-kind.yaml': {
        errors: [],
        warnings: ['plan/unframable-value', 'plan/reserved-literal-collision'],
    },
    'F11-group-order.yaml': { errors: [], warnings: [] },
    'F12-contextual-position.yaml': { errors: [], warnings: [] },
    'F13-hierarchy-and-header.yaml': {
        errors: ['plan/hierarchy-cycle', 'plan/overlapping-bindings'],
        warnings: [],
    },
    'F14-duplicate-attribute.yaml': {
        errors: ['plan/duplicate-attribute'],
        warnings: [],
    },
    'F14a-attribute-unrelated-category.yaml': {
        errors: ['plan/duplicate-attribute'],
        warnings: [],
    },
    'F14b-attribute-ancestor-pair.yaml': {
        errors: ['plan/duplicate-attribute'],
        warnings: [],
    },
    'F15-repeat-vs-distinct.yaml': { errors: [], warnings: [] },
    'F16-empty-match.yaml': {
        errors: [],
        warnings: [],
    },
    'F17-deprecation.yaml': { errors: [], warnings: [] },
    'F18-tiers-and-groups.yaml': { errors: [], warnings: [] },
    'F19-surfaces-and-defaults.yaml': {
        errors: [],
        warnings: ['plan/unframable-value'],
    },
    'F20-async-source.yaml': { errors: [], warnings: [] },
    'F21-reserved-literal.yaml': {
        errors: [],
        warnings: ['plan/unframable-value', 'plan/reserved-literal-collision'],
    },
    'F22-complementary-alternatives.yaml': { errors: [], warnings: [] },
    'F23-uncovered-alternatives.yaml': {
        errors: [],
        warnings: [],
    },
    'F24-fixed-attribute.yaml': { errors: [], warnings: [] },
    'F24a-fixed-attribute-unconditional.yaml': {
        errors: ['plan/unresolved-condition'],
        warnings: [],
    },
    'F25-composed-head-view.yaml': { errors: [], warnings: [] },
    'F25a-unbound-head-view.yaml': {
        errors: ['plan/unbound-tier-view'],
        warnings: [],
    },
    'F26-required-field.yaml': { errors: [], warnings: [] },
    'F27-phrases.yaml': { errors: [], warnings: [] },
    'F27a-phrase-head-not-bound.yaml': {
        errors: ['plan/phrase-head-not-bound'],
        warnings: [],
    },
    'F27b-overlapping-phrases.yaml': {
        errors: ['plan/overlapping-phrases'],
        warnings: [],
    },
    'F27c-unknown-phrase-head.yaml': {
        errors: ['plan/unresolved-reference'],
        warnings: [],
    },
    'F28-prefix-aliases.yaml': { errors: [], warnings: [] },
    'F28a-colliding-prefix-alias.yaml': {
        errors: ['plan/prefix-alias-collision'],
        warnings: [],
    },
    'F28b-prefix-alias-without-prefix.yaml': {
        errors: ['plan/unresolved-reference'],
        warnings: [],
    },
    'F28c-conditional-prefix-alias.yaml': { errors: [], warnings: [] },
    'F29-separator-aliases.yaml': { errors: [], warnings: [] },
    'F29a-colliding-separator-alias.yaml': {
        errors: ['plan/separator-alias-collision'],
        warnings: [],
    },
    'F29b-separator-alias-without-separator.yaml': {
        errors: ['plan/unresolved-reference'],
        warnings: [],
    },
    'F29c-separator-alias-opens-a-field.yaml': {
        errors: ['plan/separator-alias-collision'],
        warnings: [],
    },
    'F30-conflicting-tier-head-view.yaml': {
        errors: ['plan/conflicting-tier-head-view'],
        warnings: [],
    },
    'F31-ambiguous-tier-head.yaml': {
        errors: ['plan/ambiguous-tier-head'],
        warnings: [],
    },
};

// ---------------------------------------------------------------------------
// 1. Every proposed fragment embeds into a schema-valid document
// ---------------------------------------------------------------------------

describe('design fragments embed into schema-valid fixtures', () => {
    for (const file of filesIn('design')) {
        it(`${file} is schema-valid and compiles clean`, () => {
            const document = load('design', file);
            const result = validateDocument(document);
            expect(result.errors, file).toEqual([]);
            expect(result.ok).toBe(true);
        });
    }

    it('covers every design example and every worked example the contract carries', () => {
        // Listed in the order `filesIn` returns, which is the directory sorted.
        expect(filesIn('design')).toEqual([
            'block-alternatives.yaml',
            'conditional-affix.yaml',
            'contextual-aliases.yaml',
            'each.yaml',
            'groups.yaml',
            'inline-fields.yaml',
            'joins.yaml',
            'notice-slot.yaml',
            'recognizers.yaml',
            'suffix-order.yaml',
            'surface-outputs-layer.yaml',
            'surface-outputs.yaml',
            'swap-alternatives.yaml',
            'tiers.yaml',
            'typed-values.yaml',
            'xml-attributes.yaml',
        ]);
    });

    it('the release header group is one of the formats in the groups fixture', () => {
        const document = load('design', 'groups.yaml');
        const formats = (
            document.scheme.render as { formats: Array<{ id: string }> }
        ).formats;
        expect(formats.map((format) => format.id)).toContain('release_banner');
    });
});

// ---------------------------------------------------------------------------
// 2. The compile-only plan walker
// ---------------------------------------------------------------------------

describe('compile-only plan walker', () => {
    it('keeps category and concept identifiers distinct when each contains the claim separator', () => {
        const document = structuredClone(load('design', 'inline-fields.yaml'));
        const scheme = document.scheme as any;
        const [level, handling] = scheme.data.categories;
        const [levelOne, , compartmentA] = scheme.data.concepts.inline;
        scheme.data.categories = [
            { ...level, id: 'a::b' },
            { ...handling, id: 'a' },
        ];
        scheme.data.concepts.inline = [
            { ...levelOne, id: 'c', categories: ['a::b'] },
            { ...compartmentA, id: 'b::c', categories: ['a'] },
        ];
        scheme.render.formats[0].fields = [
            { category: 'a::b', concept: 'c' },
            { category: 'a', concept: 'b::c' },
        ];

        // Both ids may contain ::, but (a::b, c) and (a, b::c) are different
        // facts. Public validation must accept their schema-valid format.
        expect(validateDocument(document).errors).toEqual([]);
        expect(validateDocument(document).ok).toBe(true);

        for (const duplicate of [
            { category: 'a::b', concept: 'c' },
            { category: 'a', concept: 'b::c' },
        ]) {
            const overlap = structuredClone(document);
            (overlap.scheme as any).render.formats[0].fields.push(duplicate);
            const result = validateDocument(overlap);
            expect(result.ok).toBe(false);
            expect(
                result.errors.map((error: { id: string }) => error.id),
            ).toEqual(['plan/overlapping-bindings']);
            expect(result.errors[0].message).toContain(
                `write \`${duplicate.concept}\` from \`${duplicate.category}\``,
            );
        }
    });

    it('builds a plan tree without recognizing or rendering anything', () => {
        const plan = compilePlan(load('design', 'groups.yaml'));
        expect(plan.diagnostics).toEqual([]);
        expect(plan.formats).toHaveLength(3);

        const [origin] = plan.formats;
        expect(origin.id).toBe('fgi_origin_portion');
        expect(origin.surface).toBe('banner');
        // prefix '//' wraps the sequence of top-level fields
        expect(origin.root.kind).toBe('affix');
        expect(origin.root.prefix).toEqual([{ text: '//' }]);
        const top = origin.root.node;
        expect(top.kind).toBe('sequence');
        // one top-level field: the named group
        expect(top.children).toHaveLength(1);
        const group = top.children[0];
        expect(group.kind).toBe('sequence');
        expect(group.separator).toBe(' ');
        expect(
            group.children.map((child: { kind: string }) => child.kind),
        ).toEqual(['binding', 'binding']);
        expect(group.children[0].category).toBe('owner');
        expect(group.children[0].view).toBe('portion');
    });

    it('records a join against the boundary it covers', () => {
        const plan = compilePlan(load('design', 'joins.yaml'));
        expect(plan.diagnostics).toEqual([]);
        const root = plan.formats[0].root;
        expect([...root.joins.entries()]).toEqual([[0, ' ']]);
    });

    it('carries the tier composition onto the binding that writes it', () => {
        const plan = compilePlan(load('design', 'tiers.yaml'));
        expect(plan.diagnostics).toEqual([]);
        expect(plan.formats[0].root.children[0].tiers).toEqual([
            { tier: 'subprogram', attached_by: '-', view: 'abbreviated' },
            { tier: 'element', attached_by: ' ', view: 'abbreviated' },
        ]);
    });

    it('keeps the per-value affix distinct from the field affix', () => {
        const plan = compilePlan(load('design', 'each.yaml'));
        expect(plan.diagnostics).toEqual([]);
        const field = plan.formats[0].root.children[0];
        expect(field.kind).toBe('affix');
        expect(field.prefix).toEqual([{ text: 'PROG-' }]);
        expect(field.node.each).toEqual({ prefix: 'SP-' });
    });

    it('frames an alternatives field with its own prefix', () => {
        // The prefix belongs to the field, not to the options: the line says
        // `Declassify On: ` whichever instruction is written after it.
        const plan = compilePlan(load('design', 'block-alternatives.yaml'));
        expect(
            plan.diagnostics.filter(
                (one: Diagnostic) => one.severity === 'error',
            ),
        ).toEqual([]);
        const field = plan.formats[0].root.children[3];
        expect(field.kind).toBe('affix');
        expect(field.prefix).toEqual([{ text: 'Declassify On: ' }]);
        expect(field.node.kind).toBe('alternatives');
    });

    it('carries the attribute name onto the binding that writes it', () => {
        // Without this, a runtime holding the plan has the value but not the
        // name it is written under, and has to resolve the node's YAML path
        // back into the document to emit or recognize a single attribute.
        const plan = compilePlan(load('design', 'xml-attributes.yaml'));
        expect(plan.diagnostics).toEqual([]);
        const structured = plan.formats.find(
            (format: { id: string }) => format.id === 'structured',
        );
        const named = structured.root.children.map(
            (child: {
                kind: string;
                attribute?: string;
                node?: { attribute?: string };
            }) =>
                child.kind === 'conditional'
                    ? [child.kind, child.node?.attribute]
                    : [child.kind, child.attribute],
        );
        expect(named).toEqual([
            ['binding', 'declassDate'],
            ['binding', 'declassEvent'],
            ['conditional', 'declassDate'],
        ]);
    });

    it('a swapped field order compiles when the two orders cover every state', () => {
        // The counterexample as a case rather than as a report. A whole marking
        // that writes owner-then-level in one state and level-then-owner in the
        // other is two representations of one field, which is what
        // `alternatives` is for. swap-alternatives gives its format an
        // unconditional `//` prefix, so the empty-match check never reaches the
        // fields. F22 takes the unconditional frame away, which is what a real
        // banner does (the separator is written only when there is something to
        // lead), and then the whole question is whether the alternation can
        // come out empty.
        //
        // It cannot, and the walker says why: the guards are a named
        // condition and its `none`, so no state selects neither option, and
        // each option writes a required category, so no selected option is
        // silent.
        const document = load(
            'falsification',
            'F22-complementary-alternatives.yaml',
        );
        expect(validateDocument(document).errors).toEqual([]);
        expect(diagnostics(document)).toEqual([]);
    });

    it.each([
        ['single member', ['OWNER_HOME'], false],
        ['two members', ['OWNER_HOME', 'OWNER_OTHER'], true],
        ['empty list', [], false],
    ])(
        'models a %s none condition in an unframed format',
        (_label, ids, canBeEmpty) => {
            const document = load(
                'falsification',
                'F22-complementary-alternatives.yaml',
            );
            const conditions = document.scheme.named_conditions as Record<
                string,
                { none: Array<{ has: string }> }
            >;
            conditions['owner-is-not-home'].none = ids.map((id) => ({
                has: id,
            }));

            expect(validateDocument(document).errors).toEqual([]);
            expect(diagnostics(document)).toEqual([]);
            expect(compilePlan(document).formats[0].root.canBeEmpty).toBe(
                canBeEmpty,
            );
        },
    );

    it('accepts finite uncovered alternatives without claiming nonempty output', () => {
        // F23 is F22 with the second guard changed to an unrelated condition.
        // The guards can leave both options unselected. The validator accepts
        // this finite format without an empty-match diagnostic; its compiled
        // root canBeEmpty is true. Runtime rendering and detection own actual
        // empty-output behavior.
        //
        // F22 is the contrast: complementary guards give canBeEmpty false.
        const document = load(
            'falsification',
            'F23-uncovered-alternatives.yaml',
        );
        expect(validateDocument(document).errors).toEqual([]);
        const reported = diagnostics(document);
        expect(reported).toEqual([]);
    });

    it('allows a finite optional inline format without an empty-match diagnostic', () => {
        // F16 has no predicates at all: every field is optional. That makes an
        // empty render legitimate; it does not create a repeated nullable node
        // in this finite tree. Discovery and scanning own zero-width progress.
        const reported = diagnostics(
            load('falsification', 'F16-empty-match.yaml'),
        );
        expect(reported).toEqual([]);
    });

    it('records which children a sequence is not a reading of without', () => {
        // The indices sit on the sequence rather than as a flag on each child.
        // The rule belongs to the group: the same child node read somewhere it
        // is optional is the same node, and a reader asking "is this sequence
        // a reading?" has the answer in one place instead of having to look
        // inside every child it just walked.
        const plan = compilePlan(
            load('falsification', 'F26-required-field.yaml'),
        );
        expect(plan.diagnostics).toEqual([]);
        const top = plan.formats[0].root;
        expect(top.kind).toBe('sequence');
        expect([...top.required]).toEqual([1]);
        const group = top.children[1];
        expect(group.kind).toBe('sequence');
        expect([...group.required]).toEqual([0]);
    });

    it('hangs a phrase off the binding whose category places it', () => {
        // A phrase is a value of the field it sits on, not a field beside it.
        // It hangs off the binding for that reason: the category's order is
        // what places it, and the binding is the node that knows the category.
        // Putting it in the sequence instead would give it a position of its
        // own, which is exactly the thing this key exists to avoid.
        const plan = compilePlan(load('falsification', 'F27-phrases.yaml'));
        expect(plan.diagnostics).toEqual([]);
        const handling = plan.formats[0].root.children[1];
        expect(handling.kind).toBe('binding');
        expect(
            handling.phrases.map((one: { head: string }) => one.head),
        ).toEqual(['H_TWO', 'H_FOUR']);
        expect(handling.phrases[0].headLast).toBe(false);
        expect(handling.phrases[1].headLast).toBe(true);
        expect(handling.phrases[0].path).toBe(
            '/scheme/render/formats/0/fields/1/phrases/0',
        );
        // The phrase's own fields are an ordinary sequence, so everything a
        // group can say inside one - separators, joins, affixes, nesting - is
        // said the same way and by the same code.
        expect(handling.phrases[0].node.kind).toBe('sequence');
        expect(handling.phrases[0].node.children[0].category).toBe(
            'recipients',
        );
    });

    it('frames the whole phrase rather than its fields', () => {
        // `prefix` on a phrase is written before the phrase, head included.
        // Wrapping the fields in it would put it between the head and its
        // list, which is the boundary `separator` names and is a different
        // thing. So the parts ride on the phrase and the fields stay a plain
        // sequence.
        const document = load('falsification', 'F27-phrases.yaml');
        const field = (
            document.scheme.render as {
                formats: Array<{
                    fields: Array<{
                        phrases?: Array<Record<string, unknown>>;
                    }>;
                }>;
            }
        ).formats[0].fields[1];
        field.phrases![0].prefix = '(';
        field.phrases![0].suffix = ')';
        const plan = compilePlan(document);
        expect(plan.diagnostics).toEqual([]);
        const phrase = plan.formats[0].root.children[1].phrases[0];
        expect(phrase.prefix).toEqual([{ text: '(' }]);
        expect(phrase.suffix).toEqual([{ text: ')' }]);
        expect(phrase.node.kind).toBe('sequence');
    });

    it('leaves a field with no phrases without the key', () => {
        // Absent rather than an empty list, because a binding that never heard
        // of phrases and one that declares none are the same binding. Every
        // reader asks `phrases?` and gets the same answer from both.
        const plan = compilePlan(
            load('falsification', 'F26-required-field.yaml'),
        );
        expect(plan.formats[0].root.children[0].kind).toBe('binding');
        expect(plan.formats[0].root.children[0].phrases).toBeUndefined();
    });

    it('still claims a phrase head once, from the field that writes it', () => {
        // The head is not excluded from the field's eligible concepts. It is a
        // concept this field writes; the phrase says where and with what. So
        // the overlap check sees one claim on it, and a second field that also
        // wrote it would still be caught.
        const document = load('falsification', 'F27-phrases.yaml');
        expect(compilePlan(document).diagnostics).toEqual([]);
        const format = (
            document.scheme.render as {
                formats: Array<{ fields: Array<Record<string, unknown>> }>;
            }
        ).formats[0];
        format.fields.push({ concept: 'H_TWO', category: 'handling' });
        expect(errorIds(document)).toContain('plan/overlapping-bindings');
    });

    it('leaves a sequence with no required child with an empty set', () => {
        // Absence is the default and it is spelled, not left undefined, so a
        // reader never has to tell "no required children" from "not computed".
        const plan = compilePlan(load('falsification', 'F16-empty-match.yaml'));
        const top = plan.formats[0].root;
        expect(top.required).toBeInstanceOf(Set);
        expect([...top.required]).toEqual([]);
    });

    it('leaves the emptiness condition exactly where it was', () => {
        // `required` adds empty states rather than removing them: a group
        // whose required child has nothing writes nothing at all. Folding that
        // into the emptiness condition would conflate a group that declines
        // for a stated reason with an optional group that can write nothing.
        // The run time holds the state and knows which field declined.
        //
        // The pair is the falsification: strike the two `required` words out
        // of F26 and every emptiness answer in the plan is the same one.
        const withRequired = compilePlan(
            load('falsification', 'F26-required-field.yaml'),
        );
        const document = load('falsification', 'F26-required-field.yaml');
        const format = (
            document.scheme.render as {
                formats: Array<{
                    fields: Array<{
                        required?: boolean;
                        fields?: Array<{ required?: boolean }>;
                    }>;
                }>;
            }
        ).formats[0];
        delete format.fields[1].required;
        delete format.fields[1].fields![0].required;
        const without = compilePlan(document);

        expect([...without.formats[0].root.required]).toEqual([]);
        const emptiness = (root: {
            canBeEmpty: boolean;
            children: Array<{ canBeEmpty: boolean }>;
        }): unknown => [
            root.canBeEmpty,
            root.children.map((child) => child.canBeEmpty),
        ];
        expect(emptiness(withRequired.formats[0].root)).toEqual(
            emptiness(without.formats[0].root),
        );
    });

    it('proves a branch pair exhaustive from a required category too', () => {
        // The third form of complementarity, and the one that is not syntactic:
        // the guards are two different concept assertions, not a predicate and
        // its negation, and between them they name everything a required
        // single-valued category can hold. A state denying both denies the
        // whole category, and the scheme says the category is always occupied.
        const document = {
            scheme: {
                id: 'exhaustive-by-requiredness',
                version: '1.0.0',
                name: 'Exhaustive by requiredness',
                default_scope: 'banner',
                scopes: [{ id: 'banner', label: 'Banner' }],
                data: {
                    categories: [
                        {
                            id: 'origin',
                            label: 'Origin',
                            rollup: 'first',
                            single: true,
                            required: true,
                        },
                    ],
                    concepts: {
                        inline: [
                            {
                                id: 'ORIGIN_A',
                                name: 'Origin A',
                                views: { default: 'A' },
                                categories: ['origin'],
                            },
                            {
                                id: 'ORIGIN_B',
                                name: 'Origin B',
                                views: { default: 'B' },
                                categories: ['origin'],
                            },
                        ],
                    },
                },
                render: {
                    default: 'banner',
                    formats: [
                        {
                            id: 'banner',
                            surface: 'banner',
                            mode: 'inline',
                            view: 'default',
                            separator: '//',
                            fields: [
                                {
                                    name: 'Origin',
                                    alternatives: [
                                        {
                                            name: 'A first',
                                            when: { has: 'ORIGIN_A' },
                                            category: 'origin',
                                            concept: 'ORIGIN_A',
                                        },
                                        {
                                            name: 'B first',
                                            when: { has: 'ORIGIN_B' },
                                            category: 'origin',
                                            concept: 'ORIGIN_B',
                                        },
                                    ],
                                },
                            ],
                        },
                    ],
                },
            },
        } as unknown as Doc;
        expect(diagnostics(document)).toEqual([]);

        // Removing requiredness admits a state selecting neither branch. The
        // finite format is still valid and emits no empty-match diagnostic.
        const optional = JSON.parse(JSON.stringify(document)) as Doc;
        (
            optional.scheme.data as {
                categories: Array<{ required?: boolean }>;
            }
        ).categories[0].required = false;
        expect(diagnosticIds(optional)).toEqual([]);
    });

    it('a fixed-value attribute is a field that binds no concept', () => {
        // The shape carries a literal and a predicate and nothing else. It is
        // read back as a check that the predicate holds, which is why the
        // predicate is required: written for every state it would say nothing
        // about any of them.
        const document = load('falsification', 'F24-fixed-attribute.yaml');
        expect(validateDocument(document).errors).toEqual([]);
        expect(diagnostics(document)).toEqual([]);
        const plan = compilePlan(document);
        const last = plan.formats[0].root.children.at(-1);
        expect(last.kind).toBe('conditional');
        expect(last.node).toMatchObject({
            kind: 'fixed',
            attribute: 'shared',
            value: 'true',
        });
        expect(last.node.category).toBeUndefined();
        expect(last.node.concept).toBeUndefined();
    });

    it('a composed token names a view for each of its two halves', () => {
        // `view` was the only knob and it set the child's, so a format that
        // wanted the head short inside a composed token and long outside one
        // had nothing to say it with. The plan carries both, and the head view
        // is checked against the concepts that actually appear as heads.
        const document = load('falsification', 'F25-composed-head-view.yaml');
        expect(validateDocument(document).errors).toEqual([]);
        expect(diagnostics(document)).toEqual([]);
        const plan = compilePlan(document);
        expect(plan.formats[0].root.children[0].tiers).toEqual([
            { tier: 'subprogram', attached_by: '-', head_view: 'abbreviated' },
        ]);

        // A head view nothing declares cannot print, exactly as an unbound
        // child view cannot, and the path says which half it is about.
        const unbound = load('falsification', 'F25a-unbound-head-view.yaml');
        const reported = diagnostics(unbound);
        expect(reported.map((one: { id: string }) => one.id)).toEqual([
            'plan/unbound-tier-view',
        ]);
        expect(reported[0].path.endsWith('/head_view')).toBe(true);

        // A rule whose tier has members but no head this field also writes is
        // the layering case the tier rule itself already distinguishes: a
        // warning, because a layer may bring the head in.
        const headless = JSON.parse(JSON.stringify(document)) as Doc;
        const concepts = (
            headless.scheme.data as {
                concepts: { inline: Array<{ id: string }> };
            }
        ).concepts;
        concepts.inline = concepts.inline.filter(
            (one) => one.id !== 'PROGRAM_ROOT',
        );
        (
            headless.scheme.data as {
                concepts: { inline: Array<{ parents?: string[] }> };
            }
        ).concepts.inline[0].parents = ['PROGRAM_ROOT'];
        // Both formats declare the rule, so both report it.
        expect(diagnosticIds(headless)).toEqual([
            'plan/unbound-tier-view',
            'plan/unbound-tier-view',
        ]);
        expect(errorIds(headless)).toEqual([]);
    });

    it('rejects conflicting spellings for one composition head in every declaration order', () => {
        const document = load(
            'falsification',
            'F30-conflicting-tier-head-view.yaml',
        );
        expect(errorIds(document)).toEqual(['plan/conflicting-tier-head-view']);
        expect(validateDocument(document).ok).toBe(false);

        const reordered = structuredClone(document);
        const scheme = reordered.scheme as any;
        scheme.data.concepts.inline.reverse();
        scheme.render.formats[0].fields[0].tiers.reverse();
        expect(errorIds(reordered)).toEqual([
            'plan/conflicting-tier-head-view',
        ]);

        // With no head_view, a head that is itself tiered uses its own tier's
        // view. That effective spelling must agree with an explicit head_view
        // on another child boundary.
        const inherited = structuredClone(document);
        const inheritedScheme = inherited.scheme as any;
        inheritedScheme.data.concepts.inline.find(
            (concept: { id: string }) => concept.id === 'HEAD',
        ).tier = 'head';
        const inheritedTiers =
            inheritedScheme.render.formats[0].fields[0].tiers;
        inheritedTiers.unshift({
            tier: 'head',
            attached_by: '~',
            view: 'abbreviated',
        });
        delete inheritedTiers.find(
            (tier: { tier: string }) => tier.tier === 'alpha',
        ).head_view;
        inheritedTiers.find(
            (tier: { tier: string }) => tier.tier === 'beta',
        ).head_view = 'default';
        expect(errorIds(inherited)).toEqual([
            'plan/conflicting-tier-head-view',
        ]);

        // View ids describe spellings rather than semantic identities. Two
        // names that resolve to the same text make the same composed token and
        // therefore do not conflict.
        const sameSpelling = structuredClone(document);
        (sameSpelling.scheme.data as any).concepts.inline.find(
            (concept: { id: string }) => concept.id === 'HEAD',
        ).views.abbreviated = 'HEAD';
        expect(errorIds(sameSpelling)).toEqual([]);
        expect(validateDocument(sameSpelling).ok).toBe(true);
    });

    it('publishes the same tier-head relation for resolved external vocabularies', () => {
        const conflict = load(
            'falsification',
            'F30-conflicting-tier-head-view.yaml',
        );
        const reversedConflict = structuredClone(conflict);
        (reversedConflict.scheme as any).data.concepts.inline.reverse();
        (
            reversedConflict.scheme as any
        ).render.formats[0].fields[0].tiers.reverse();
        for (const document of [conflict, reversedConflict]) {
            const relation = tierHeadRelation(document);
            expect([...relation.headByConcept.entries()].sort()).toEqual([
                ['ALPHA', 'HEAD'],
                ['BETA', 'HEAD'],
            ]);
            expect(relation.diagnostics.map((one) => one.id)).toEqual([
                'plan/conflicting-tier-head-view',
            ]);
        }

        const ambiguous = load('falsification', 'F31-ambiguous-tier-head.yaml');
        const reversedAmbiguous = structuredClone(ambiguous);
        const reversedConcepts = (reversedAmbiguous.scheme as any).data.concepts
            .inline;
        reversedConcepts.reverse();
        reversedConcepts
            .find((concept: { id: string }) => concept.id === 'CHILD')
            .parents.reverse();
        for (const document of [ambiguous, reversedAmbiguous]) {
            const relation = tierHeadRelation(document);
            expect([...relation.ambiguousConcepts]).toEqual(['CHILD']);
            expect(relation.headByConcept.has('CHILD')).toBe(false);
            expect(relation.diagnostics.map((one) => one.id)).toEqual([
                'plan/ambiguous-tier-head',
            ]);

            const narrowed = structuredClone(document);
            (narrowed.scheme as any).data.concepts.inline = (
                narrowed.scheme as any
            ).data.concepts.inline.filter(
                (concept: { id: string }) => concept.id !== 'HEAD_ONE',
            );
            const narrowedRelation = tierHeadRelation(narrowed);
            expect([...narrowedRelation.headByConcept.entries()]).toEqual([
                ['CHILD', 'HEAD_TWO'],
            ]);
            expect(narrowedRelation.diagnostics).toEqual([]);
        }
    });

    it('rejects multiple eligible composition parents without banning taxonomy parents', () => {
        const document = load('falsification', 'F31-ambiguous-tier-head.yaml');
        expect(errorIds(document)).toEqual(['plan/ambiguous-tier-head']);
        expect(validateDocument(document).ok).toBe(false);

        const reordered = structuredClone(document);
        const reorderedConcepts = (reordered.scheme.data as any).concepts
            .inline;
        reorderedConcepts.reverse();
        reorderedConcepts
            .find((concept: { id: string }) => concept.id === 'CHILD')
            .parents.reverse();
        expect(errorIds(reordered)).toEqual(['plan/ambiguous-tier-head']);

        // HEAD_TWO remains a taxonomy parent, but this format does not write
        // it. Put it first to prove validation resolves the one eligible head
        // instead of accepting whichever parent declaration order presents.
        const oneEligible = structuredClone(document);
        const concepts = (oneEligible.scheme.data as any).concepts.inline;
        concepts.find(
            (concept: { id: string }) => concept.id === 'HEAD_TWO',
        ).categories = ['taxonomy'];
        concepts.find(
            (concept: { id: string }) => concept.id === 'CHILD',
        ).parents = ['HEAD_TWO', 'HEAD_ONE'];
        expect(errorIds(oneEligible)).toEqual([]);
        expect(validateDocument(oneEligible).ok).toBe(true);
    });

    it('the expected-diagnostic table covers every falsification fixture', () => {
        // A new fixture with no row would otherwise be checked by nothing.
        expect(filesIn('falsification')).toEqual(Object.keys(EXPECTED).sort());
    });

    for (const [file, expected] of Object.entries(EXPECTED)) {
        it(`${file} reports exactly its named diagnostics`, () => {
            const document = load('falsification', file);
            expect(errorIds(document), file).toEqual(expected.errors);
            expect(warningIds(document), file).toEqual(expected.warnings);
        });
    }

    it('a warning does not make a document invalid', () => {
        // F05 is the framing case. The document is well-formed; the values that
        // cannot be written are a run-time result, and refusing the document
        // here would push the author into declaring an escape their format does
        // not have.
        const result = validateDocument(
            load('falsification', 'F05-unframable-value.yaml'),
        );
        expect(result.ok).toBe(true);
        expect(result.errors).toEqual([]);
        expect(
            result.warnings.map((entry: { id: string }) => entry.id),
        ).toEqual(['plan/unframable-value']);
        expect(severityOf('plan/unframable-value')).toBe('warning');
        expect(severityOf('plan/overlapping-bindings')).toBe('error');
    });

    it('every diagnostic the walker can report has a fixture that fires it', () => {
        const fired = new Set<string>();
        for (const file of filesIn('falsification')) {
            for (const id of diagnosticIds(load('falsification', file))) {
                fired.add(id);
            }
        }
        expect([...fired].sort()).toEqual(
            [
                'plan/duplicate-attribute',
                'plan/ambiguous-tier-head',
                'plan/conflicting-tier-head-view',
                'plan/hierarchy-cycle',
                'plan/indeterminate-separator',
                'plan/non-adjacent-join',
                'plan/overlapping-bindings',
                'plan/overlapping-phrases',
                'plan/phrase-head-not-bound',
                'plan/prefix-alias-collision',
                'plan/reserved-literal-collision',
                'plan/separator-alias-collision',
                'plan/unbound-tier-view',
                'plan/unframable-value',
                'plan/unknown-placeholder',
                'plan/unresolved-condition',
                'plan/unresolved-reference',
            ].sort(),
        );
    });

    it('names a category that does not exist', () => {
        const document = load('falsification', 'F01-canonical-inline.yaml');
        (document.scheme.render as any).formats[0].fields[0].category =
            'no-such-category';
        expect(diagnosticIds(document)).toContain('plan/unresolved-reference');
    });

    it('rejects a narrowed concept outside the field category', () => {
        const document = load('falsification', 'F01-canonical-inline.yaml');
        const fields = (document.scheme.render as any).formats[0].fields;
        fields[1] = { category: 'level', concept: 'HANDLING_A' };

        const result = validateDocument(document);
        expect(result.ok).toBe(false);
        expect(result.warnings).toEqual([]);
        expect(diagnostics(document)).toMatchObject([
            {
                id: 'plan/unresolved-reference',
                severity: 'error',
                path: '/scheme/render/formats/0/fields/1/concept',
            },
        ]);

        fields[1] = { category: 'handling', concept: 'HANDLING_A' };
        expect(validateDocument(document).ok).toBe(true);
        expect(diagnostics(document)).toEqual([]);

        // The category can be inferred when the concept has exactly one.
        fields[1] = { concept: 'HANDLING_A' };
        expect(validateDocument(document).ok).toBe(true);
        expect(diagnostics(document)).toEqual([]);

        // An explicit choice remains valid when a concept belongs to both.
        const multiCategory = structuredClone(document);
        const multiScheme = multiCategory.scheme as any;
        multiScheme.data.concepts.inline
            .find((concept: { id: string }) => concept.id === 'HANDLING_A')
            .categories.push('level');
        multiScheme.render.formats[0].fields[0] = {
            category: 'level',
            concept: 'HANDLING_A',
        };
        multiScheme.render.formats[0].fields[1] = {
            category: 'handling',
            concept: 'HANDLING_A',
        };
        expect(validateDocument(multiCategory).ok).toBe(true);
        expect(diagnostics(multiCategory)).toEqual([]);

        fields[1] = { category: 'no-such-category', concept: 'HANDLING_A' };
        expect(diagnostics(document).map((one) => one.path)).toEqual([
            '/scheme/render/formats/0/fields/1/category',
        ]);

        fields[1] = { category: 'handling', concept: 'NO_SUCH_CONCEPT' };
        expect(diagnostics(document).map((one) => one.path)).toEqual([
            '/scheme/render/formats/0/fields/1/concept',
        ]);
    });

    /**
     * The gate that keeps the others honest. Each rule is mutated on a fixture
     * that otherwise passes, and has to go red. A rule nobody can trip is a
     * rule that proves nothing about the ones that pass.
     */
    describe('sensitivity: removing the reason turns each rule red', () => {
        it('dropping a field separator trips the separator rule', () => {
            const document = load('design', 'inline-fields.yaml');
            delete (document.scheme.render as any).formats[0].fields[1]
                .separator;
            expect(diagnosticIds(document)).toContain(
                'plan/indeterminate-separator',
            );
        });

        it('dropping the exclusion trips the overlap rule', () => {
            const document = load('design', 'groups.yaml');
            const release = (document.scheme.render as any).formats[2];
            delete release.fields[1].exclude_concepts;
            expect(diagnosticIds(document)).toContain(
                'plan/overlapping-bindings',
            );
        });

        it('widening a single-valued category trips the attribute rule', () => {
            const document = load('design', 'xml-attributes.yaml');
            // The attribute pair is provably exclusive only because the category it
            // draws from holds one concept at a time.
            (document.scheme.data as any).categories[0].single = false;
            expect(diagnosticIds(document)).toContain(
                'plan/duplicate-attribute',
            );
        });

        it('reordering the joined pair trips the adjacency rule', () => {
            const document = load('design', 'joins.yaml');
            const fields = (document.scheme.render as any).formats[0].fields;
            [fields[1], fields[2]] = [fields[2], fields[1]];
            expect(diagnosticIds(document)).toContain('plan/non-adjacent-join');
        });

        it('renaming a tier view trips the tier rule', () => {
            const document = load('design', 'tiers.yaml');
            (document.scheme.render as any).formats[0].fields[0].tiers[0].view =
                'no-such-view';
            expect(diagnosticIds(document)).toContain('plan/unbound-tier-view');
        });

        it('declaring an escape silences the framing rule, and only that', () => {
            // Read in the direction that proves something for a rule that is a
            // warning. The fixture declares no escape, because the format it
            // stands for has none, and the warning is the accounting for it.
            const document = load('design', 'block-alternatives.yaml');
            expect(errorIds(document)).toEqual([]);
            expect(warningIds(document)).toEqual([
                'plan/unframable-value',
                'plan/unframable-value',
            ]);

            // An author whose format really does escape says so, and the rule
            // has nothing left to say. If it still fired, the escape would be
            // decorative and every block format would carry the warning.
            (document.scheme.render as any).formats[0].syntax = {
                type: 'text',
                escape: 'backslash',
            };
            expect(warningIds(document)).toEqual([]);
        });

        it('a parent chain that closes trips the hierarchy rule', () => {
            const document = load('design', 'tiers.yaml');
            (document.scheme.data as any).concepts.inline[0].parents = [
                'PROGRAM_LEAF',
            ];
            expect(diagnosticIds(document)).toContain('plan/hierarchy-cycle');
        });

        it('renaming a named condition trips the condition rule', () => {
            const document = load('design', 'groups.yaml');
            (document.scheme as any).named_conditions = {};
            expect(diagnosticIds(document)).toContain(
                'plan/unresolved-condition',
            );
        });

        it('a second placeholder in a view trips the placeholder rule', () => {
            const document = load('design', 'typed-values.yaml');
            (document.scheme.data as any).concepts.inline[0].views.default =
                '{year}-{value}';
            expect(diagnosticIds(document)).toContain(
                'plan/unknown-placeholder',
            );
        });

        it('an unrelated single-valued membership does not prove exclusivity', () => {
            // The permissive direction. F14a compiles clean the moment the
            // proof is taken from the concept's whole membership set instead of
            // the category the field writes.
            const document = load(
                'falsification',
                'F14a-attribute-unrelated-category.yaml',
            );
            expect(errorIds(document)).toEqual(['plan/duplicate-attribute']);

            // Bind the fields to the single-valued category they actually share
            // and the pair becomes provable, which is the same rule reading the
            // other way.
            const fields = (document.scheme.render as any).formats[0].fields;
            fields[0].category = 'kind';
            fields[1].category = 'kind';
            expect(errorIds(document)).toEqual([]);
        });

        it('a parent chain between the two concepts defeats the cardinality proof', () => {
            const document = load(
                'falsification',
                'F14b-attribute-ancestor-pair.yaml',
            );
            expect(errorIds(document)).toEqual(['plan/duplicate-attribute']);

            // Break the chain and the same two fields are provably exclusive:
            // the closure no longer asserts one alongside the other.
            delete (document.scheme.data as any).concepts.inline[1].parents;
            expect(errorIds(document)).toEqual([]);
        });

        it('the attribute pair stops being provable once its category is not the bound one', () => {
            const document = load('design', 'xml-attributes.yaml');
            expect(errorIds(document)).toEqual([]);
            // Put DECLASS_DATE in a second category and bind the field to that
            // one instead. The concepts still share `declass`, but the field no
            // longer writes it, so the reading this format produces is not the
            // one the cardinality constrains.
            const concepts = (document.scheme.data as any).concepts.inline;
            concepts[0].categories = ['declass', 'declass_date'];
            (document.scheme.render as any).formats[0].fields[0].category =
                'declass_date';
            expect(errorIds(document)).toContain('plan/duplicate-attribute');
        });

        it('a predicate concept in two categories is no longer bounded by one cardinality', () => {
            // The `when` side of the proof. DECLASS_EVENT is a member of one
            // single-valued category, so asserting it rules out the other
            // writer's concept. Give it a second category and it can be
            // asserted there instead, with both fields active.
            const document = load('design', 'xml-attributes.yaml');
            expect(errorIds(document)).toEqual([]);
            const concepts = (document.scheme.data as any).concepts.inline;
            concepts[1].categories = ['declass', 'declass_date'];
            // The field that writes it now has to name its category too, so
            // pin that down and keep the attribute question the only one left.
            (document.scheme.render as any).formats[0].fields[1].category =
                'declass';
            (document.scheme.render as any).formats[1].fields[1].category =
                'declass';
            expect(errorIds(document)).toEqual([
                'plan/duplicate-attribute',
                'plan/duplicate-attribute',
            ]);
        });

        it('a concept in two categories has to say which one the field binds', () => {
            const document = load('design', 'xml-attributes.yaml');
            (document.scheme.data as any).concepts.inline[1].categories = [
                'declass',
                'declass_date',
            ];
            expect(errorIds(document)).toContain('plan/unresolved-reference');
        });

        it('renaming a conditional prefix condition trips the condition rule', () => {
            const document = load('design', 'conditional-affix.yaml');
            expect(errorIds(document)).toEqual([]);
            delete (document.scheme as any).named_conditions['owner-is-home'];
            expect(errorIds(document)).toContain('plan/unresolved-condition');
        });

        it('renaming the recognizer target trips the reference rule', () => {
            const document = load('design', 'recognizers.yaml');
            expect(errorIds(document)).toEqual([]);
            (document.scheme as any).parse.recognizers[0].binds[0].field =
                'citation';
            expect(errorIds(document)).toEqual(['plan/unresolved-reference']);
        });

        it('renaming the aliased category trips the reference rule', () => {
            const document = load('design', 'contextual-aliases.yaml');
            expect(errorIds(document)).toEqual([]);
            (
                document.scheme.data as any
            ).concepts.inline[2].input_aliases[0].after_category = 'nope';
            expect(errorIds(document)).toEqual(['plan/unresolved-reference']);
        });

        it('two alternatives writing one concept is the shape, not an overlap', () => {
            const document = load('design', 'swap-alternatives.yaml');
            expect(errorIds(document)).toEqual([]);
        });

        for (const where of ['after', 'before'] as const) {
            it(`a field lifted out ${where} the alternatives is an overlap`, () => {
                // Both orders, because the answer must not depend on which
                // field the walker happened to reach first. Folding one claim
                // per alternative field into the format is what makes the
                // conflict visible either way.
                const document = load('design', 'swap-alternatives.yaml');
                const fields = (document.scheme.render as any).formats[0]
                    .fields;
                const lifted = structuredClone(fields[0].alternatives[0]);
                if (where === 'after') fields.push(lifted);
                else fields.unshift(lifted);
                expect(errorIds(document)).toContain(
                    'plan/overlapping-bindings',
                );
            });
        }

        it('two fields inside ONE alternative are an ordinary overlap', () => {
            // Exactly one alternative is active, so two of them writing a
            // concept is the shape. Two fields inside the SAME one are both
            // active together, which is the overlap the rule is for.
            const document = load('design', 'swap-alternatives.yaml');
            (
                document.scheme.render as any
            ).formats[0].fields[0].alternatives[0].fields.push({
                category: 'owner',
                separator: ' ',
            });
            expect(errorIds(document)).toContain('plan/overlapping-bindings');
        });

        it('a concept that implies both writers defeats the cardinality proof', () => {
            // The ancestor case generalized. It is not enough that neither
            // writer's concept implies the other: anything that implies both
            // puts both in the category at once through the same closure.
            const document = load(
                'falsification',
                'F14b-attribute-ancestor-pair.yaml',
            );
            const data = document.scheme.data as any;
            delete data.concepts.inline[1].parents;
            expect(errorIds(document)).toEqual([]);

            data.categories.push({
                id: 'other',
                label: 'Other',
                rollup: 'union',
            });
            data.concepts.inline.push({
                id: 'BOTH',
                name: 'Both instructions',
                views: { default: 'BOTH' },
                categories: ['other'],
                parents: ['BROAD', 'NARROW'],
            });
            expect(errorIds(document)).toEqual(['plan/duplicate-attribute']);
        });

        it('a recognizer may name a field by the concept it narrows to', () => {
            const document = load('design', 'recognizers.yaml');
            const field = (document.scheme.render as any).formats[0].fields[1];
            delete field.category;
            field.concept = 'REFERENCE_NUMBER';
            (document.scheme as any).parse.recognizers[0].binds[0].field =
                'REFERENCE_NUMBER';
            expect(errorIds(document)).toEqual([]);
        });

        it('reports a reserved-literal collision inside one category too', () => {
            // The hazard is free text and a fixed word reachable in the same
            // field. An `alternatives` wrapper is one way to get there and not
            // the common one: a category that holds both kinds of concept is,
            // and a rule that only looked at alternatives said nothing about it.
            const document = load('design', 'block-alternatives.yaml');
            const concepts = (document.scheme.data as any).concepts.inline;
            delete concepts[4].text_input.encoding;
            // One category now holds the free-text date and a fixed word.
            concepts.push({
                id: 'DECLASS_RETIRED',
                name: 'Retired instruction',
                views: { default: 'OADR' },
                categories: ['declass'],
            });
            const collisions = compilePlan(document).diagnostics.filter(
                (one: Diagnostic) =>
                    one.id === 'plan/reserved-literal-collision',
            );
            expect(collisions.map((one: Diagnostic) => one.path)).toContain(
                '/scheme/render/formats/0/fields/3/alternatives/0',
            );
        });

        it('a reserved-literal collision does not refuse the document', () => {
            // Enforcement is the run-time unrepresentable-value result against
            // the value that actually collided. A category holding an
            // instruction spelled as a word and one written as a description is
            // ordinary; refusing it would be a claim about the domain.
            const document = load('design', 'block-alternatives.yaml');
            delete (document.scheme.data as any).concepts.inline[4].text_input
                .encoding;
            expect(diagnosticIds(document)).toContain(
                'plan/reserved-literal-collision',
            );
            expect(errorIds(document)).toEqual([]);
        });

        it('two options of one alternation may write one attribute', () => {
            // The alternation is the proof: one option is active, so the
            // element carries the name once. Two fields outside one still
            // have to prove it, which the next case checks stays true.
            const document = load('design', 'xml-attributes.yaml');
            const format = (document.scheme.render as any).formats[0];
            format.fields = [
                {
                    name: 'DelevelCode instruction',
                    alternatives: [
                        { attribute: 'declassDate', concept: 'DECLASS_DATE' },
                        { attribute: 'declassDate', concept: 'DECLASS_EVENT' },
                    ],
                },
            ];
            expect(errorIds(document)).toEqual([]);
        });

        it('two fields outside one alternation still have to prove it', () => {
            const document = load('design', 'xml-attributes.yaml');
            const format = (document.scheme.render as any).formats[0];
            format.fields = [
                { attribute: 'declassDate', concept: 'DECLASS_DATE' },
                { attribute: 'declassDate', concept: 'DECLASS_EVENT_DATE' },
            ];
            expect(diagnosticIds(document)).toContain(
                'plan/duplicate-attribute',
            );
        });

        it('untyping the value trips the reserved-literal rule', () => {
            const document = load('design', 'block-alternatives.yaml');
            // The block alternatives are safe because the date is encoded. Take
            // the encoding away and the free value can spell the code beside it.
            delete (document.scheme.data as any).concepts.inline[4].text_input
                .encoding;
            expect(diagnosticIds(document)).toContain(
                'plan/reserved-literal-collision',
            );
        });
    });
});

describe('a field that declares `unspelled`', () => {
    const withField = (field: Record<string, unknown>): Doc => ({
        scheme: {
            id: 'closed-view',
            version: '1.0.0',
            name: 'Closed view',
            data: {
                categories: [
                    { id: 'control', label: 'Control', rollup: 'union' },
                ],
                concepts: {
                    inline: [
                        {
                            id: 'LISTED',
                            name: 'Listed',
                            views: { default: 'LSD', short: 'LS' },
                            categories: ['control'],
                        },
                        {
                            id: 'UNLISTED',
                            name: 'Unlisted',
                            views: { default: 'ULS' },
                            categories: ['control'],
                        },
                    ],
                },
            },
            render: {
                formats: [
                    {
                        id: 'closed',
                        surface: 'banner',
                        view: 'short',
                        fields: [
                            { category: 'control', separator: '/', ...field },
                        ],
                    },
                ],
            },
        },
    });

    it('is accepted on a view_only field', () => {
        expect(
            errorIds(withField({ view_only: true, unspelled: ['UNLISTED'] })),
        ).toEqual([]);
    });

    it('is refused on a field that is not view_only', () => {
        expect(diagnostics(withField({ unspelled: ['UNLISTED'] }))).toEqual([
            expect.objectContaining({
                id: 'plan/unspelled-without-view-only',
                severity: 'error',
                path: '/scheme/render/formats/0/fields/0/unspelled',
            }),
        ]);
    });
});
