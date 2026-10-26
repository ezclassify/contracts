import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parse as parseYaml } from 'yaml';

// @ts-expect-error: the validator is plain ESM JavaScript with no types.
import { validateDocument } from '../src/index.mjs';
// @ts-expect-error: the validator is plain ESM JavaScript with no types.
import { compilePlan } from '../src/plan.mjs';

/**
 * `render.surfaces`, checked against the formats it writes through and reads.
 *
 * Every case starts from the design fixture or from the layer that restates it,
 * and changes one thing. The fixture has two surfaces: `sensitivity`, with
 * three views, a part view with a guarded case, a whole view also read in a
 * retired form and a view with no role, and a default per role; and
 * `retention`, with one view that is its default for every role. Each refusal
 * is pinned to the path it reports, so a rule that fires somewhere else, or a
 * document refused for an unrelated reason, does not pass for the rule under
 * test.
 */

const here = path.dirname(fileURLToPath(import.meta.url));
const DESIGN = path.join(here, 'fixtures', 'format-contract', 'design');
const EXAMPLE = path.join(DESIGN, 'surface-outputs.yaml');
const LAYER = path.join(DESIGN, 'surface-outputs-layer.yaml');

interface Diagnostic {
    id: string;
    severity: 'error' | 'warning';
    path: string;
    message: string;
}

/** Parsed YAML that each case reshapes freely. */
type Doc = any;

function example(): Doc {
    return parseYaml(fs.readFileSync(EXAMPLE, 'utf8'));
}

function layerExample(): Doc {
    return parseYaml(fs.readFileSync(LAYER, 'utf8'));
}

function errors(document: Doc): Diagnostic[] {
    return (compilePlan(document).diagnostics as Diagnostic[]).filter(
        (entry) => entry.severity === 'error',
    );
}

function errorPaths(document: Doc): string[] {
    return errors(document).map((entry) => entry.path);
}

/** Where format `id` sits in `render.formats`. */
function formatAt(document: Doc, id: string): number {
    const index = document.scheme.render.formats.findIndex(
        (one: { id: string }) => one.id === id,
    );
    if (index < 0) throw new Error(`no format ${id} in the fixture`);
    return index;
}

function formatOf(document: Doc, id: string): Doc {
    return document.scheme.render.formats[formatAt(document, id)];
}

/** Take a format out of `render.formats`. */
function dropFormat(document: Doc, id: string): void {
    document.scheme.render.formats.splice(formatAt(document, id), 1);
}

/**
 * Take a surface out of `render.surfaces`, and its formats with it, since a
 * format no view names is refused on its own account.
 */
function dropSurface(document: Doc, surface: string): void {
    const render = document.scheme.render;
    render.surfaces = render.surfaces.filter(
        (entry: { surface: string }) => entry.surface !== surface,
    );
    render.formats = render.formats.filter(
        (format: { surface?: string }) => format.surface !== surface,
    );
}

/** The sensitivity surface's views, by id. */
function viewOf(document: Doc, id: string): Doc {
    const view = document.scheme.render.surfaces[0].views.find(
        (one: { id: string }) => one.id === id,
    );
    if (!view) throw new Error(`no view ${id} in the fixture`);
    return view;
}

describe('render.surfaces', () => {
    it('accepts views that state their roles and their forms, beside a surface with a single default view', () => {
        const document = example();
        expect(validateDocument(document).errors).toEqual([]);
        expect(errors(document)).toEqual([]);
        expect(document.scheme.render.surfaces).toEqual([
            {
                surface: 'sensitivity',
                default: { whole: 'full', part: 'short' },
                views: [
                    {
                        id: 'short',
                        role: 'part',
                        format: 'short_line',
                        cases: [
                            {
                                when: {
                                    named_condition: 'shared-with-partners',
                                },
                                format: 'short_shared_line',
                            },
                        ],
                    },
                    {
                        id: 'full',
                        role: 'whole',
                        format: 'full_line',
                        also_read_in: ['full_line_2019'],
                    },
                    { id: 'xml', format: 'xml_attributes' },
                ],
            },
            {
                surface: 'retention',
                default: 'block',
                views: [{ id: 'block', format: 'retention_block' }],
            },
        ]);
    });

    it('accepts one default view for every role when no view of another role is passed over', () => {
        const document = example();
        document.scheme.render.surfaces[0].default = 'full';
        delete viewOf(document, 'short').role;
        expect(validateDocument(document).errors).toEqual([]);
        expect(errors(document)).toEqual([]);
    });

    it('accepts a view named default, which is an ordinary id', () => {
        const document = example();
        const surface = document.scheme.render.surfaces[0];
        surface.views[1].id = 'default';
        surface.default = { whole: 'default', part: 'short' };
        expect(errors(document)).toEqual([]);
    });

    it('lists at least one surface: the schema refuses an empty list', () => {
        const document = example();
        expect(validateDocument(document).errors).toEqual([]);
        document.scheme.render.surfaces = [];
        const result = validateDocument(document);
        expect(result.ok).toBe(false);
        expect(result.errors).toContainEqual(
            expect.objectContaining({
                keyword: 'minItems',
                path: '/scheme/render/surfaces',
            }),
        );
    });
});

describe('a surface default', () => {
    it('is refused when it names no view of its surface', () => {
        const document = example();
        document.scheme.render.surfaces[0].default = 'compact';
        expect(errors(document)).toEqual([
            {
                id: 'plan/unresolved-reference',
                severity: 'error',
                path: '/scheme/render/surfaces/0/default',
                message:
                    "surface `sensitivity` defaults to view `compact`, which it does not declare. A default is one of the surface's own views: `short`, `full`, `xml`.",
            },
        ]);
    });

    it('is refused when it names a view only another surface declares', () => {
        const document = example();
        document.scheme.render.surfaces[1].default = 'short';
        expect(errorPaths(document)).toEqual([
            '/scheme/render/surfaces/1/default',
        ]);
    });

    it('is a view id or a view per role: the schema refuses any other object', () => {
        const document = example();
        document.scheme.render.surfaces[0].default = { format: 'short_line' };
        const result = validateDocument(document);
        expect(result.ok).toBe(false);
        expect(
            result.errors.map((entry: { path: string }) => entry.path),
        ).toContain('/scheme/render/surfaces/0/default');
    });

    it('is refused by the plan in a shape that is neither', () => {
        const document = example();
        document.scheme.render.surfaces[0].default = ['full'];
        expect(errors(document)).toEqual([
            {
                id: 'plan/unresolved-reference',
                severity: 'error',
                path: '/scheme/render/surfaces/0/default',
                message:
                    'surface `sensitivity` has to name its default as a view id, or as a view per role with `whole` and, when a part is written in another view, `part`.',
            },
        ]);
    });

    it('always has a view to name: the schema refuses a surface with none', () => {
        const document = example();
        document.scheme.render.surfaces[0].views = [];
        const result = validateDocument(document);
        expect(result.ok).toBe(false);
        expect(
            result.errors.map((entry: { path: string }) => entry.path),
        ).toContain('/scheme/render/surfaces/0/views');
    });
});

describe('a default per role', () => {
    const defaultOf = (document: Doc) => document.scheme.render.surfaces[0];

    it('may name whole alone, which a part falls back to, where no view is of part markings', () => {
        const document = example();
        defaultOf(document).default = { whole: 'full' };
        delete viewOf(document, 'short').role;
        expect(validateDocument(document).errors).toEqual([]);
        expect(errors(document)).toEqual([]);
    });

    it('is refused without whole', () => {
        const document = example();
        defaultOf(document).default = { part: 'short' };
        expect(errors(document)).toEqual([
            {
                id: 'plan/unresolved-reference',
                severity: 'error',
                path: '/scheme/render/surfaces/0/default',
                message:
                    'surface `sensitivity` names a default by role without `whole`. A whole marking, and a marking with no role, are written in that view, and `part` falls back to it.',
            },
        ]);
        const result = validateDocument(document);
        expect(result.ok).toBe(false);
        expect(result.errors).toContainEqual(
            expect.objectContaining({
                keyword: 'required',
                path: '/scheme/render/surfaces/0/default',
            }),
        );

        // Negative control: the same map with `whole` added.
        defaultOf(document).default.whole = 'full';
        expect(errors(document)).toEqual([]);
        expect(validateDocument(document).errors).toEqual([]);
    });

    it('is refused naming a key that is not a role', () => {
        const document = example();
        defaultOf(document).default.segment = 'short';
        expect(errors(document)).toEqual([
            {
                id: 'plan/unresolved-reference',
                severity: 'error',
                path: '/scheme/render/surfaces/0/default/segment',
                message:
                    'surface `sensitivity` names a default view for `segment`, which is not a role. A default by role names `whole` and, when a part is written in another view, `part`.',
            },
        ]);
        const result = validateDocument(document);
        expect(result.ok).toBe(false);
        expect(result.errors).toContainEqual(
            expect.objectContaining({
                keyword: 'additionalProperties',
                path: '/scheme/render/surfaces/0/default',
            }),
        );

        // Negative control: both role keys, and nothing else, are accepted.
        delete defaultOf(document).default.segment;
        expect(Object.keys(defaultOf(document).default)).toEqual([
            'whole',
            'part',
        ]);
        expect(errors(document)).toEqual([]);
    });

    it('is refused when a role names a view the surface does not declare', () => {
        const whole = example();
        defaultOf(whole).default.whole = 'header';
        expect(errors(whole)).toEqual([
            {
                id: 'plan/unresolved-reference',
                severity: 'error',
                path: '/scheme/render/surfaces/0/default/whole',
                message:
                    "surface `sensitivity` writes a whole marking in view `header`, which it does not declare. A default is one of the surface's own views: `short`, `full`, `xml`.",
            },
        ]);

        const part = example();
        defaultOf(part).default.part = 'compact';
        expect(errorPaths(part)).toEqual([
            '/scheme/render/surfaces/0/default/part',
        ]);

        // A view only another surface declares is not one of this surface's.
        const borrowed = example();
        defaultOf(borrowed).default.part = 'block';
        expect(errorPaths(borrowed)).toEqual([
            '/scheme/render/surfaces/0/default/part',
        ]);
    });

    it('is refused when a role names a view of another role, where the surface has views of its own', () => {
        const document = example();
        defaultOf(document).default.whole = 'short';
        expect(errors(document)).toEqual([
            {
                id: 'plan/unresolved-reference',
                severity: 'error',
                path: '/scheme/render/surfaces/0/default/whole',
                message:
                    'surface `sensitivity` writes a whole marking in view `short`, a view of part markings, although it has views of whole markings: `full`. A surface writes a marking in a view of its own role where it has one.',
            },
        ]);

        // One view is not the default of both roles while each has views.
        const same = example();
        defaultOf(same).default = { whole: 'full', part: 'full' };
        expect(errors(same)).toEqual([
            {
                id: 'plan/unresolved-reference',
                severity: 'error',
                path: '/scheme/render/surfaces/0/default/part',
                message:
                    'surface `sensitivity` writes a part marking in view `full`, a view of whole markings, although it has views of part markings: `short`. A surface writes a marking in a view of its own role where it has one.',
            },
        ]);
    });

    it('is refused when a role names a view with no role, where the surface has views of that role', () => {
        const document = example();
        defaultOf(document).default.part = 'xml';
        expect(errors(document)).toEqual([
            {
                id: 'plan/unresolved-reference',
                severity: 'error',
                path: '/scheme/render/surfaces/0/default/part',
                message:
                    'surface `sensitivity` writes a part marking in view `xml`, a view with no role, although it has views of part markings: `short`. A surface writes a marking in a view of its own role where it has one.',
            },
        ]);

        // Negative control: the same view, once it is a view of part markings.
        viewOf(document, 'xml').role = 'part';
        expect(errors(document)).toEqual([]);
    });

    it('means what one view id means when it names whole alone, or one view for both roles', () => {
        // Retention's one view has no role, so there is nothing to pass over.
        const retention = (document: Doc) => document.scheme.render.surfaces[1];
        const document = example();
        for (const value of [
            'block',
            { whole: 'block' },
            { whole: 'block', part: 'block' },
        ]) {
            retention(document).default = value;
            expect(errors(document)).toEqual([]);
        }

        // A surface whose one view is a part writes wholes there too, either way.
        retention(document).views[0].role = 'part';
        for (const value of [
            'block',
            { whole: 'block' },
            { whole: 'block', part: 'block' },
        ]) {
            retention(document).default = value;
            expect(errors(document)).toEqual([]);
        }
    });

    it('keeps parts in a view of part markings when it gives them one of their own', () => {
        // No view on the surface states a role, so no role is passed over, but
        // a part written in `xml` would read back with no role and be written
        // again in `full`.
        const document = example();
        delete viewOf(document, 'full').role;
        delete viewOf(document, 'short').role;
        defaultOf(document).default = { whole: 'full', part: 'xml' };
        expect(errors(document)).toEqual([
            {
                id: 'plan/unresolved-reference',
                severity: 'error',
                path: '/scheme/render/surfaces/0/default/part',
                message:
                    'surface `sensitivity` writes a part marking in view `xml`, a view with no role, and a whole marking in `full`. A part written in `xml` would be read back with no role, as a whole is, and written again in `full`; a view a surface keeps for part markings is a view of part markings.',
            },
        ]);

        // Negative control: `xml` as a view of part markings. The whole view
        // may have no role, since a marking read back with none is written as
        // a whole, in that same view.
        viewOf(document, 'xml').role = 'part';
        expect(errors(document)).toEqual([]);
    });

    it('keeps wholes out of a view of part markings when parts have a view of their own', () => {
        const document = example();
        viewOf(document, 'full').role = 'part';
        expect(errors(document)).toEqual([
            {
                id: 'plan/unresolved-reference',
                severity: 'error',
                path: '/scheme/render/surfaces/0/default/whole',
                message:
                    'surface `sensitivity` writes a whole marking in view `full`, a view of part markings, and a part marking in `short`. A whole written in `full` would be read back as a part, and written again in `short`; name a view for wholes that is not a view of part markings.',
            },
        ]);

        // Negative control: wholes in the view with no role.
        defaultOf(document).default.whole = 'xml';
        expect(errors(document)).toEqual([]);
    });
});

describe('a default where the surface has views of a role', () => {
    const surfaceOf = (document: Doc) => document.scheme.render.surfaces[0];

    it('refuses one view for every role that passes over the views of another role', () => {
        const document = example();
        surfaceOf(document).default = 'full';
        expect(errors(document)).toEqual([
            {
                id: 'plan/unresolved-reference',
                severity: 'error',
                path: '/scheme/render/surfaces/0/default',
                message:
                    'surface `sensitivity` writes every marking in view `full`, a view of whole markings, so it writes a part marking there although it has views of part markings: `short`. A surface writes a marking in a view of its own role where it has one; name a default per role.',
            },
        ]);

        // A view with no role passes over both roles.
        const neither = example();
        surfaceOf(neither).default = 'xml';
        expect(errors(neither).map((entry) => entry.message)).toEqual([
            'surface `sensitivity` writes every marking in view `xml`, a view with no role, so it writes a whole marking there although it has views of whole markings: `full`. A surface writes a marking in a view of its own role where it has one; name a default per role.',
            'surface `sensitivity` writes every marking in view `xml`, a view with no role, so it writes a part marking there although it has views of part markings: `short`. A surface writes a marking in a view of its own role where it has one; name a default per role.',
        ]);

        // Negative control: a surface whose views have no role at all, as
        // retention's one view has none, takes any of them.
        const plain = example();
        surfaceOf(plain).default = 'xml';
        delete viewOf(plain, 'full').role;
        delete viewOf(plain, 'short').role;
        expect(errors(plain)).toEqual([]);
    });

    it('refuses a whole that a part falls back to while the surface has views of part markings', () => {
        const document = example();
        surfaceOf(document).default = { whole: 'full' };
        expect(errors(document)).toEqual([
            {
                id: 'plan/unresolved-reference',
                severity: 'error',
                path: '/scheme/render/surfaces/0/default',
                message:
                    'surface `sensitivity` names no default for a part, so a part marking falls back to view `full`, a view of whole markings, although it has views of part markings: `short`. Name `part`.',
            },
        ]);

        // Negative control: naming `part` settles it.
        surfaceOf(document).default.part = 'short';
        expect(errors(document)).toEqual([]);
    });
});

describe('what render.surfaces refuses', () => {
    const cases: Array<[string, (document: Doc) => void, string]> = [
        [
            'render.default beside it',
            (document) => {
                document.scheme.render.default = 'short_line';
            },
            '/scheme/render/default',
        ],
        [
            'a surface the scheme does not declare in scopes',
            (document) => {
                // Added beside the default scope's surface, so the default
                // scope stays listed and only the undeclared surface is wrong.
                document.scheme.render.surfaces.push({
                    surface: 'handling',
                    default: 'short',
                    views: [{ id: 'short', format: 'short_line' }],
                });
            },
            '/scheme/render/surfaces/2/surface',
        ],
        [
            'a view whose format is not declared',
            (document) => {
                dropFormat(document, 'full_line');
            },
            '/scheme/render/surfaces/0/views/1/format',
        ],
        [
            'a case whose format is not declared',
            (document) => {
                dropFormat(document, 'short_shared_line');
            },
            '/scheme/render/surfaces/0/views/0/cases/0/format',
        ],
        [
            'a case whose condition is not declared',
            (document) => {
                document.scheme.render.surfaces[0].views[0].cases[0].when = {
                    named_condition: 'missing',
                };
            },
            '/scheme/render/surfaces/0/views/0/cases/0/when',
        ],
        [
            'a view written by a format of another surface',
            (document) => {
                formatOf(document, 'full_line').surface = 'retention';
            },
            '/scheme/render/surfaces/0/views/1/format',
        ],
        [
            'a view declared twice on one surface',
            (document) => {
                document.scheme.render.surfaces[0].views[2].id = 'full';
            },
            '/scheme/render/surfaces/0/views/2/id',
        ],
        [
            'a surface listed twice',
            (document) => {
                const surfaces = document.scheme.render.surfaces;
                surfaces.push(structuredClone(surfaces[0]));
            },
            '/scheme/render/surfaces/2/surface',
        ],
        [
            'two surfaces and no separator',
            (document) => {
                delete document.scheme.render.surface_separator;
            },
            '/scheme/render/surface_separator',
        ],
    ];

    it.each(cases)('%s', (_name, change, expected) => {
        const document = example();
        change(document);
        expect(errorPaths(document)).toEqual([expected]);
    });
});

describe('the forms of a view', () => {
    it('are refused when a format is a form of no view', () => {
        const document = example();
        document.scheme.render.formats.push({
            id: 'spelled_line',
            surface: 'sensitivity',
            mode: 'inline',
            separator: ' / ',
            fields: [{ category: 'level' }, { category: 'sharing' }],
        });
        expect(errors(document)).toEqual([
            {
                id: 'plan/unresolved-reference',
                severity: 'error',
                path: '/scheme/render/formats/6/id',
                message:
                    'no view in `render.surfaces` names format `spelled_line`. Every format of a scheme that declares its outputs by surface is a form of a view: written as its `format` or in a case, or read in through `also_read_in`. Name it on the view it belongs to, or remove it.',
            },
        ]);

        // Negative control: the same format, read in for `full`.
        viewOf(document, 'full').also_read_in.push('spelled_line');
        expect(errors(document)).toEqual([]);
    });

    it('are refused when two views of one surface name one format', () => {
        // As one view's format and another's.
        const written = example();
        dropFormat(written, 'xml_attributes');
        viewOf(written, 'xml').format = 'full_line';
        expect(errors(written)).toEqual([
            {
                id: 'plan/unresolved-reference',
                severity: 'error',
                path: '/scheme/render/surfaces/0/views/2/format',
                message:
                    'format `full_line` is named by `sensitivity/full` as its `format` and by `sensitivity/xml` as its `format`. A format is a form of one view on each surface it serves, so text read in it is read as one view; only one of them may name it.',
            },
        ]);

        // As one view's case and another's format: the later one is refused,
        // and the message names both.
        const cased = example();
        dropFormat(cased, 'short_shared_line');
        viewOf(cased, 'short').cases[0].format = 'full_line';
        expect(
            errors(cased).map((entry) => [entry.path, entry.message]),
        ).toEqual([
            [
                '/scheme/render/surfaces/0/views/1/format',
                'format `full_line` is named by `sensitivity/short` in case 0 and by `sensitivity/full` as its `format`. A format is a form of one view on each surface it serves, so text read in it is read as one view; only one of them may name it.',
            ],
        ]);

        // As forms both views are only read in.
        const read = example();
        viewOf(read, 'short').also_read_in = ['full_line_2019'];
        expect(
            errors(read).map((entry) => [entry.path, entry.message]),
        ).toEqual([
            [
                '/scheme/render/surfaces/0/views/1/also_read_in/0',
                'format `full_line_2019` is named by `sensitivity/short` in `also_read_in` and by `sensitivity/full` in `also_read_in`. A format is a form of one view on each surface it serves, so text read in it is read as one view; only one of them may name it.',
            ],
        ]);
    });

    it('may serve several surfaces, named by one view on each', () => {
        const document = example();
        const xml = formatOf(document, 'xml_attributes');
        delete xml.surface;
        xml.surfaces = ['sensitivity', 'retention'];
        xml.fields.push({ attribute: 'keep', category: 'keep' });
        document.scheme.render.surfaces[1].views.push({
            id: 'xml',
            format: 'xml_attributes',
        });
        expect(errors(document)).toEqual([]);

        // The same format twice on one of them is refused there.
        document.scheme.render.surfaces[1].views.push({
            id: 'attributes',
            format: 'xml_attributes',
        });
        expect(errorPaths(document)).toEqual([
            '/scheme/render/surfaces/1/views/2/format',
        ]);
    });

    it('are read in only through declared formats of the view surface', () => {
        const missing = example();
        viewOf(missing, 'full').also_read_in.push('missing');
        expect(errors(missing)).toEqual([
            {
                id: 'plan/unresolved-reference',
                severity: 'error',
                path: '/scheme/render/surfaces/0/views/1/also_read_in/1',
                message:
                    'view `sensitivity/full` is also read in format `missing`, which `render.formats` does not declare.',
            },
        ]);

        const elsewhere = example();
        viewOf(elsewhere, 'full').also_read_in.push('retention_block');
        expect(errors(elsewhere)).toEqual([
            {
                id: 'plan/unresolved-reference',
                severity: 'error',
                path: '/scheme/render/surfaces/0/views/1/also_read_in/1',
                message:
                    'view `sensitivity/full` is also read in format `retention_block`, which does not write surface `sensitivity`.',
            },
        ]);
    });

    it('list in also_read_in only forms the view never writes, each once', () => {
        const own = example();
        viewOf(own, 'full').also_read_in.push('full_line');
        expect(errors(own)).toEqual([
            {
                id: 'plan/unresolved-reference',
                severity: 'error',
                path: '/scheme/render/surfaces/0/views/1/also_read_in/1',
                message:
                    'view `sensitivity/full` is also read in format `full_line`, which it writes as its `format`. A view is read in what it writes already; `also_read_in` lists only the forms it never writes.',
            },
        ]);

        const cased = example();
        viewOf(cased, 'short').also_read_in = ['short_shared_line'];
        expect(errors(cased)).toEqual([
            {
                id: 'plan/unresolved-reference',
                severity: 'error',
                path: '/scheme/render/surfaces/0/views/0/also_read_in/0',
                message:
                    'view `sensitivity/short` is also read in format `short_shared_line`, which it writes in case 0. A view is read in what it writes already; `also_read_in` lists only the forms it never writes.',
            },
        ]);

        const twice = example();
        viewOf(twice, 'full').also_read_in.push('full_line_2019');
        expect(errors(twice)).toEqual([
            {
                id: 'plan/unresolved-reference',
                severity: 'error',
                path: '/scheme/render/surfaces/0/views/1/also_read_in/1',
                message:
                    'view `sensitivity/full` lists format `full_line_2019` in `also_read_in` more than once.',
            },
        ]);

        // A repeat is reported once, as a repeat, whatever else is wrong with
        // the entry it repeats.
        const another = example();
        viewOf(another, 'xml').also_read_in = ['short_line', 'short_line'];
        expect(
            errors(another).map((entry) => [entry.path, entry.message]),
        ).toEqual([
            [
                '/scheme/render/surfaces/0/views/2/also_read_in/0',
                'format `short_line` is named by `sensitivity/short` as its `format` and by `sensitivity/xml` in `also_read_in`. A format is a form of one view on each surface it serves, so text read in it is read as one view; only one of them may name it.',
            ],
            [
                '/scheme/render/surfaces/0/views/2/also_read_in/1',
                'view `sensitivity/xml` lists format `short_line` in `also_read_in` more than once.',
            ],
        ]);
    });

    it('take a role and an also_read_in list the schema can check', () => {
        const role = example();
        viewOf(role, 'short').role = 'segment';
        const refusedRole = validateDocument(role);
        expect(refusedRole.ok).toBe(false);
        expect(
            refusedRole.errors.map((entry: { path: string }) => entry.path),
        ).toContain('/scheme/render/surfaces/0/views/0/role');
        // The plan judges nothing against a role the schema refuses.
        expect(errors(role)).toEqual([]);

        const empty = example();
        viewOf(empty, 'full').also_read_in = [];
        const refusedList = validateDocument(empty);
        expect(refusedList.ok).toBe(false);
        expect(refusedList.errors).toContainEqual(
            expect.objectContaining({
                keyword: 'minItems',
                path: '/scheme/render/surfaces/0/views/1/also_read_in',
            }),
        );
    });
});

describe('the default scope', () => {
    it('is accepted when `default_scope` names one of the listed surfaces', () => {
        expect(errors(example())).toEqual([]);

        const named = example();
        named.scheme.default_scope = 'retention';
        expect(errors(named)).toEqual([]);
    });

    it('is refused when `default_scope` names a surface with no outputs', () => {
        const document = example();
        dropSurface(document, 'sensitivity');
        delete document.scheme.render.surface_separator;
        expect(errors(document)).toEqual([
            {
                id: 'plan/unresolved-reference',
                severity: 'error',
                path: '/scheme/default_scope',
                message:
                    "the default scope is `sensitivity`, and `render.surfaces` lists no outputs for it; it lists `retention`. A result with nothing else to go on writes the default scope's surface, so it would have no output to be written in. List `sensitivity` in `render.surfaces`, or name a listed surface as `default_scope`.",
            },
        ]);

        const other = example();
        dropSurface(other, 'retention');
        delete other.scheme.render.surface_separator;
        other.scheme.default_scope = 'retention';
        expect(errorPaths(other)).toEqual(['/scheme/default_scope']);
    });

    it('is refused once when it is missing or not declared, not again for its outputs', () => {
        // Each is a fault in the default scope itself. Saying again that it
        // has no outputs would send the author to `render.surfaces` for a
        // problem that is not there.
        const missing = example();
        delete missing.scheme.default_scope;
        expect(errors(missing).map((entry) => entry.message)).toEqual([
            'the scheme declares scopes (`sensitivity`, `retention`) and names none of them as its default. A marking that names no scope is in the default one, so name it with `default_scope`.',
        ]);

        const undeclared = example();
        undeclared.scheme.default_scope = 'archive';
        expect(errors(undeclared).map((entry) => entry.message)).toEqual([
            '`default_scope` names `archive`, which the scheme does not declare in `scopes`; it declares `sensitivity`, `retention`.',
        ]);
    });
});

describe('a form a view is only read in', () => {
    /**
     * Retention records about a conference, abbreviated `CONF` like the
     * confidential level. `full_line_2019` reads the abbreviated view and binds
     * the level, not how long a record is kept.
     */
    function withConferenceRecords(views: Doc, extra: Doc = {}): Doc {
        const document = example();
        document.scheme.data.concepts.inline.push({
            id: 'CONFERENCE_RECORDS',
            name: 'Conference records',
            views,
            categories: ['keep'],
            ...extra,
        });
        return document;
    }

    /**
     * The retention block written in the abbreviated view, so the scheme writes
     * conference records as `CONF`.
     */
    function withAbbreviatedBlock(document: Doc): Doc {
        formatOf(document, 'retention_block').view = 'abbreviated';
        return document;
    }

    const sharedSpelling = (spelling: string): Diagnostic => ({
        id: 'plan/read-only-form-shared-spelling',
        severity: 'error',
        path: '/scheme/render/surfaces/0/views/1/also_read_in/0',
        message: `format \`full_line_2019\`, which \`sensitivity/full\` is only read in, reads ${JSON.stringify(spelling)} as \`CONFIDENTIAL\` in \`level\`, and a form the scheme writes reads it as \`CONFERENCE_RECORDS\` in \`keep\`. The form binds no field to \`keep\`, so text that means \`CONFERENCE_RECORDS\` is read there as \`CONFIDENTIAL\`: a wrong fact, and a form that is only read is never written back to show it. Bind \`keep\` in this form as well, leave \`CONFIDENTIAL\` out of the field that reads it, or stop reading this form.`,
    });

    it('is refused when it reads a spelling a written form reads as another concept', () => {
        const document = withAbbreviatedBlock(
            withConferenceRecords({
                default: 'CONFERENCE RECORDS',
                abbreviated: 'CONF',
            }),
        );
        // `short_line` and `short_shared_line` read the same view and bind
        // the level too. They are written, and what they write is read back,
        // so only the form that is only read is refused.
        expect(errors(document)).toEqual([sharedSpelling('CONF')]);
    });

    it('is accepted when no written form reads the spelling as the other concept', () => {
        // Conference records are `CONF` in the abbreviated view, but the
        // retention block writes them in the default view, and no form that
        // reads the abbreviated view binds `keep`. Nothing the scheme writes
        // spells them `CONF`, so reading `CONF` as the level is no wrong fact.
        const document = withConferenceRecords({
            default: 'CONFERENCE RECORDS',
            abbreviated: 'CONF',
        });
        expect(errors(document)).toEqual([]);

        // A written field that leaves the concept out does not read it.
        const excluded = withAbbreviatedBlock(
            withConferenceRecords({
                default: 'CONFERENCE RECORDS',
                abbreviated: 'CONF',
            }),
        );
        formatOf(excluded, 'retention_block').fields[0].exclude_concepts = [
            'CONFERENCE_RECORDS',
        ];
        expect(errors(excluded)).toEqual([]);
    });

    it('is refused when the other concept shares the spelling through an alias', () => {
        // An alias is read in every view, so the retention block reads `CONF`
        // as conference records in the default view it writes.
        const alias = withConferenceRecords(
            { default: 'CONFERENCE RECORDS' },
            { aliases: ['conf'] },
        );
        expect(errors(alias)).toEqual([sharedSpelling('CONF')]);

        const positional = withConferenceRecords(
            { default: 'CONFERENCE RECORDS' },
            { input_aliases: [{ text: 'CONF', position: 'non-leading' }] },
        );
        expect(errors(positional)).toEqual([sharedSpelling('CONF')]);
    });

    it('compares spellings as the scheme compares text', () => {
        const document = withConferenceRecords(
            { default: 'CONFERENCE RECORDS' },
            { aliases: ['conf'] },
        );
        document.scheme.parse = { case_sensitive: true };
        expect(errors(document)).toEqual([]);
    });

    it('is accepted when the other concept is spelled differently in the view the form reads', () => {
        // The retention block writes conference records as `CONF` in the
        // default view, but `full_line_2019` reads the abbreviated view, where
        // they are `CONF RECORDS`: text in that form never spells them `CONF`.
        const document = withConferenceRecords({
            default: 'CONF',
            abbreviated: 'CONF RECORDS',
        });
        expect(errors(document)).toEqual([]);
    });

    it('is accepted when the other concept belongs to a category the form binds', () => {
        // The same spelling in the sharing list, which `short_shared_line`
        // writes and the form reads: text in the form can be read as either,
        // and neither is read as the other.
        const document = example();
        document.scheme.data.concepts.inline.push({
            id: 'CONFERENCE_PARTNERS',
            name: 'Shared with conference partners',
            views: { default: 'CONFERENCE PARTNERS', abbreviated: 'CONF' },
            categories: ['sharing'],
        });
        expect(errors(document)).toEqual([]);

        // A field that leaves the concept out still binds its category: the
        // rule is about categories the form reads, not which of their
        // concepts one field writes.
        formatOf(document, 'full_line_2019').fields[1].exclude_concepts = [
            'CONFERENCE_PARTNERS',
        ];
        expect(errors(document)).toEqual([]);
    });
});

describe('surface_separator', () => {
    function withoutSurfaces(document: Doc): Doc {
        delete document.scheme.render.surfaces;
        delete document.scheme.render.surface_separator;
        document.scheme.render.default = 'short_line';
        return document;
    }

    it('is refused in a scheme that declares no render.surfaces', () => {
        const document = withoutSurfaces(example());
        expect(errors(document)).toEqual([]);
        document.scheme.render.surface_separator = '\n';
        expect(errors(document)).toEqual([
            {
                id: 'plan/unresolved-reference',
                severity: 'error',
                path: '/scheme/render/surface_separator',
                message:
                    '`render.surface_separator` is declared without `render.surfaces`, where every format is an output under its own id and no string carries the outputs of two surfaces. Nothing would ever be written between them; remove it.',
            },
        ]);
    });

    it('is accepted beside render.surfaces, even with one surface listed', () => {
        const document = example();
        dropSurface(document, 'retention');
        expect(document.scheme.render.surface_separator).toBe('\n');
        expect(errors(document)).toEqual([]);
    });
});

describe('formats that write more than one surface', () => {
    function sharedXml(document: Doc): Doc {
        const format = formatOf(document, 'xml_attributes');
        delete format.surface;
        format.surfaces = ['sensitivity', 'retention'];
        format.fields.push({ attribute: 'keep', category: 'keep' });
        document.scheme.render.surfaces[1].views.push({
            id: 'xml',
            format: 'xml_attributes',
        });
        return document;
    }

    const xmlPath = (document: Doc) =>
        `/scheme/render/formats/${formatAt(document, 'xml_attributes')}`;

    it('serve a view on each surface they write', () => {
        expect(errors(sharedXml(example()))).toEqual([]);
    });

    it('are refused where a surface they write has no view that names them', () => {
        const document = sharedXml(example());
        document.scheme.render.surfaces[1].views.pop();
        expect(errors(document)).toEqual([
            {
                id: 'plan/unresolved-reference',
                severity: 'error',
                path: `${xmlPath(document)}/surfaces/1`,
                message:
                    'format `xml_attributes` writes surface `retention`, and no view of `retention` names it. A format is a form of one view on each surface it serves; name it on a view of `retention`, or take `retention` out of its `surfaces`.',
            },
        ]);

        // Only read there counts as named there.
        document.scheme.render.surfaces[1].views[0].also_read_in = [
            'xml_attributes',
        ];
        expect(errors(document)).toEqual([]);
    });

    it('state one role between the views that name them on different surfaces', () => {
        const document = sharedXml(example());
        viewOf(document, 'xml').role = 'whole';
        expect(errors(document)).toEqual([
            {
                id: 'plan/unresolved-reference',
                severity: 'error',
                path: '/scheme/render/surfaces/1/views/1/format',
                message:
                    'format `xml_attributes` is a form of `sensitivity/xml`, a view of whole markings, and of `retention/xml`, a view with no role. Text read in a form has one role, so the views that name it on different surfaces state the same role, or none of them does.',
            },
        ]);

        // A whole on one surface and a part on the other is refused too.
        const retention = document.scheme.render.surfaces[1];
        retention.views[1].role = 'part';
        retention.default = { whole: 'block', part: 'xml' };
        expect(errorPaths(document)).toEqual([
            '/scheme/render/surfaces/1/views/1/format',
        ]);

        // Negative control: a whole on both. Retention then writes its wholes
        // in `xml`, its one view of whole markings.
        retention.views[1].role = 'whole';
        retention.default = { whole: 'xml' };
        expect(errors(document)).toEqual([]);
    });

    it('name their surfaces with exactly one of surface and surfaces', () => {
        const document = sharedXml(example());
        formatOf(document, 'xml_attributes').surface = 'sensitivity';
        expect(errorPaths(document)).toEqual([`${xmlPath(document)}/surface`]);
    });

    it('list each surface once', () => {
        const document = sharedXml(example());
        formatOf(document, 'xml_attributes').surfaces = [
            'sensitivity',
            'sensitivity',
        ];
        expect(errorPaths(document)).toEqual([`${xmlPath(document)}/surfaces`]);
    });

    it('list two or more: one surface is named in surface', () => {
        const document = sharedXml(example());
        formatOf(document, 'xml_attributes').surfaces = ['sensitivity'];
        expect(errorPaths(document)).toEqual([`${xmlPath(document)}/surfaces`]);
    });

    it('report an empty list once, and not again at the views that name it', () => {
        const document = sharedXml(example());
        formatOf(document, 'xml_attributes').surfaces = [];
        expect(errors(document)).toEqual([
            {
                id: 'plan/unresolved-reference',
                severity: 'error',
                path: `${xmlPath(document)}/surfaces`,
                message:
                    'format `xml_attributes` has to list two or more surfaces in `surfaces`, each once. A format that writes one surface names it in `surface`.',
            },
        ]);
    });

    it('are refused by the schema with fewer than two surfaces', () => {
        const document = sharedXml(example());
        expect(validateDocument(document).errors).toEqual([]);
        formatOf(document, 'xml_attributes').surfaces = ['sensitivity'];
        const result = validateDocument(document);
        expect(result.ok).toBe(false);
        // The schema's own refusal, not the plan's, which reports the same path.
        expect(result.errors).toContainEqual(
            expect.objectContaining({
                keyword: 'minItems',
                path: `${xmlPath(document)}/surfaces`,
            }),
        );
    });

    it('are refused naming a surface the scheme does not declare', () => {
        const document = sharedXml(example());
        formatOf(document, 'xml_attributes').surfaces = [
            'sensitivity',
            'handling',
        ];
        expect(errorPaths(document)).toEqual([
            `${xmlPath(document)}/surfaces/1`,
            '/scheme/render/surfaces/1/views/1/format',
        ]);
    });

    it('exist only in a scheme that declares its outputs by surface', () => {
        const document = sharedXml(example());
        delete document.scheme.render.surfaces;
        delete document.scheme.render.surface_separator;
        document.scheme.render.default = 'short_line';
        expect(validateDocument(document).ok).toBe(false);
        expect(errors(document)).toEqual([
            {
                id: 'plan/unresolved-reference',
                severity: 'error',
                path: `${xmlPath(document)}/surfaces`,
                message:
                    'format `xml_attributes` writes several surfaces, which only a scheme that declares its outputs by surface can use. Without `render.surfaces` every format is an output under its own id, and an output writes one surface. Declare `render.surfaces`, or give this format one `surface`.',
            },
        ]);

        // The same scheme, the same format writing one surface: accepted.
        const format = formatOf(document, 'xml_attributes');
        delete format.surfaces;
        format.surface = 'sensitivity';
        expect(errors(document)).toEqual([]);
        expect(validateDocument(document).errors).toEqual([]);
    });

    it('say which surface owns each fixed attribute', () => {
        const document = sharedXml(example());
        const fields = formatOf(document, 'xml_attributes').fields;
        const at = `${xmlPath(document)}/fields/3/output_surfaces`;
        fields.push({
            attribute: 'partnerShared',
            value: 'true',
            when: { named_condition: 'shared-with-partners' },
        });
        expect(errorPaths(document)).toEqual([at]);
        fields[3].output_surfaces = ['handling'];
        expect(errorPaths(document)).toEqual([at]);
        fields[3].output_surfaces = [];
        expect(errorPaths(document)).toEqual([at]);
        fields[3].output_surfaces = ['sensitivity', 'sensitivity'];
        expect(errorPaths(document)).toEqual([at]);
        fields[3].output_surfaces = ['sensitivity'];
        expect(errors(document)).toEqual([]);
        fields[3].output_surfaces = ['sensitivity', 'retention'];
        expect(errors(document)).toEqual([]);
    });

    it('carry the surfaces of each fixed attribute into the plan', () => {
        const document = sharedXml(example());
        formatOf(document, 'xml_attributes').fields.push({
            attribute: 'partnerShared',
            value: 'true',
            when: { named_condition: 'shared-with-partners' },
            output_surfaces: ['sensitivity'],
        });
        const plan = compilePlan(document);
        const xml = plan.formats.find(
            (one: { id: string }) => one.id === 'xml_attributes',
        );
        expect(xml.surfaces).toEqual(['sensitivity', 'retention']);
        // A fixed attribute sits behind its own `when`.
        const fixed = xml.root.children
            .map((node: { kind: string; node?: { kind: string } }) =>
                node.kind === 'conditional' ? node.node : node,
            )
            .find((node: { kind: string }) => node.kind === 'fixed');
        expect(fixed.outputSurfaces).toEqual(['sensitivity']);
    });

    it('are refused by the schema with an empty output_surfaces', () => {
        const document = sharedXml(example());
        formatOf(document, 'xml_attributes').fields.push({
            attribute: 'partnerShared',
            value: 'true',
            when: { named_condition: 'shared-with-partners' },
            output_surfaces: [],
        });
        const result = validateDocument(document);
        expect(result.ok).toBe(false);
        expect(result.errors).toContainEqual(
            expect.objectContaining({
                keyword: 'minItems',
                path: `${xmlPath(document)}/fields/3/output_surfaces`,
            }),
        );
    });
});

describe('role_detection', () => {
    const condition = { named_condition: 'shared-with-partners' };

    it('keeps only required_when beside render.surfaces, where views state their roles', () => {
        const document = example();
        document.scheme.role_detection = {
            whole: { required_when: condition },
            part: { required_when: { none: [condition] } },
        };
        expect(validateDocument(document).errors).toEqual([]);
        expect(errors(document)).toEqual([]);
    });

    it('is refused for a role entry that says nothing, in any document', () => {
        const message =
            '`role_detection.part` says nothing: it lists no formats and names no `required_when`. Remove it.';
        const beside = example();
        beside.scheme.role_detection = { part: {} };
        expect(errors(beside)).toEqual([
            {
                id: 'plan/unresolved-reference',
                severity: 'error',
                path: '/scheme/role_detection/part',
                message,
            },
        ]);

        const without = example();
        delete without.scheme.render.surfaces;
        delete without.scheme.render.surface_separator;
        without.scheme.render.default = 'full_line';
        without.scheme.role_detection = { part: {} };
        expect(errors(without).map((entry) => entry.message)).toEqual([
            message,
        ]);

        const layer = layerExample();
        delete layer.scheme.render;
        layer.scheme.role_detection = { part: {} };
        expect(errors(layer).map((entry) => entry.message)).toEqual([message]);
    });

    it('is refused naming a condition the scheme does not declare in required_when', () => {
        const document = example();
        document.scheme.role_detection = {
            part: { required_when: { named_condition: 'missing' } },
        };
        expect(errors(document)).toEqual([
            {
                id: 'plan/unresolved-condition',
                severity: 'error',
                path: '/scheme/role_detection/part/required_when',
                message:
                    '`when` names the condition `missing`, which the scheme does not declare in `named_conditions`. A predicate nothing defines is never true, so a part marking would never be required by it.',
            },
        ]);

        // A layer's condition may be one the stack below declares.
        const layer = layerExample();
        layer.scheme.role_detection = {
            part: { required_when: { named_condition: 'missing' } },
        };
        expect(errors(layer)).toEqual([]);
    });

    it('is refused listing formats beside render.surfaces, flat or under views', () => {
        const flat = example();
        flat.scheme.role_detection = { part: ['short_line'] };
        expect(errors(flat)).toEqual([
            {
                id: 'plan/unresolved-reference',
                severity: 'error',
                path: '/scheme/role_detection/part',
                message:
                    '`role_detection.part` lists formats beside `render.surfaces`, where each view states its own `role` and a role is read in the forms of the views that state it. Give those views their `role`, and keep only `required_when` here.',
            },
        ]);

        const nested = example();
        nested.scheme.role_detection = {
            whole: { views: ['full_line'], required_when: condition },
        };
        expect(errorPaths(nested)).toEqual([
            '/scheme/role_detection/whole/views',
        ]);

        // An empty list is still a list.
        const empty = example();
        empty.scheme.role_detection = { part: [] };
        expect(errorPaths(empty)).toEqual(['/scheme/role_detection/part']);
    });

    it('is refused listing formats in a layer that restates surfaces', () => {
        const document = layerExample();
        document.scheme.role_detection = { part: { views: ['short_line'] } };
        expect(errorPaths(document)).toEqual([
            '/scheme/role_detection/part/views',
        ]);
    });

    it('lists formats in a scheme without render.surfaces, where nothing else says them', () => {
        const document = example();
        delete document.scheme.render.surfaces;
        delete document.scheme.render.surface_separator;
        document.scheme.render.default = 'full_line';

        document.scheme.role_detection = {
            whole: ['full_line'],
            part: { views: ['short_line'], required_when: condition },
        };
        expect(validateDocument(document).errors).toEqual([]);

        document.scheme.role_detection = {
            part: { required_when: condition },
        };
        expect(errors(document)).toEqual([
            {
                id: 'plan/unresolved-reference',
                severity: 'error',
                path: '/scheme/role_detection/part',
                message:
                    '`role_detection.part` names no formats. Without `render.surfaces`, the formats a role is read in are listed here under `views`. List them, or declare `render.surfaces` and give each view its `role`.',
            },
        ]);
        expect(validateDocument(document).ok).toBe(false);

        // Each format a list names is one the scheme declares.
        document.scheme.role_detection = {
            whole: ['full_line', 'header_line'],
            part: { views: ['tag_line'] },
        };
        expect(errors(document)).toEqual([
            {
                id: 'plan/unresolved-reference',
                severity: 'error',
                path: '/scheme/role_detection/whole/1',
                message:
                    '`role_detection` names format `header_line`, which `render.formats` does not declare.',
            },
            {
                id: 'plan/unresolved-reference',
                severity: 'error',
                path: '/scheme/role_detection/part/views/0',
                message:
                    '`role_detection` names format `tag_line`, which `render.formats` does not declare.',
            },
        ]);
    });

    it('leaves a layer without render.surfaces to the stack it composes onto', () => {
        // The layer may sit on a base that declares surfaces, where a role
        // keeps only its condition, so only the composed document can say.
        const document = layerExample();
        delete document.scheme.render;
        document.scheme.role_detection = { part: { required_when: condition } };
        expect(errors(document)).toEqual([]);

        // Its lists may name the stack's formats.
        document.scheme.role_detection = { part: ['tag_line'] };
        expect(errors(document)).toEqual([]);
    });
});

describe('a layer that restates an inherited surface', () => {
    const views = (document: Doc) => document.scheme.render.surfaces[0].views;

    it('is accepted when its views lean on what the stack below declares', () => {
        const document = layerExample();
        expect(validateDocument(document).errors).toEqual([]);
        expect(errors(document)).toEqual([]);
    });

    it('may name a case whose condition and format the stack below declares', () => {
        // `short` writes `short_line` again while a marking is not shared,
        // instead of only reading it.
        const document = layerExample();
        views(document)[0] = {
            id: 'short',
            role: 'part',
            format: 'short_shared_line',
            cases: [
                {
                    when: {
                        none: [{ named_condition: 'shared-with-partners' }],
                    },
                    format: 'short_line',
                },
            ],
        };
        expect(errors(document)).toEqual([]);

        // As a base scheme, the condition and both formats are unresolved.
        delete document.scheme.type;
        delete document.scheme.layer;
        expect(errorPaths(document)).toEqual([
            '/scheme/render/surfaces/0/surface',
            '/scheme/render/surfaces/0/views/0/format',
            '/scheme/render/surfaces/0/views/0/cases/0/when',
            '/scheme/render/surfaces/0/views/0/cases/0/format',
            '/scheme/render/surfaces/0/default/whole',
        ]);
    });

    it('may restate a default with views only the stack below declares', () => {
        // `full` and `xml` are the base's views; the layer lists only `short`.
        const document = layerExample();
        expect(document.scheme.render.surfaces[0].default).toEqual({
            whole: 'full',
            part: 'short',
        });
        document.scheme.render.surfaces[0].default = 'full';
        expect(errors(document)).toEqual([]);
        document.scheme.render.surfaces[0].default = {
            whole: 'xml',
            part: 'short',
        };
        expect(errors(document)).toEqual([]);
    });

    it('is refused as a base scheme, where nothing below supplies them', () => {
        const document = layerExample();
        delete document.scheme.type;
        delete document.scheme.layer;
        expect(errorPaths(document)).toEqual([
            '/scheme/render/surfaces/0/surface',
            '/scheme/render/surfaces/0/views/0/format',
            '/scheme/render/surfaces/0/views/0/also_read_in/0',
            '/scheme/render/surfaces/0/default/whole',
        ]);
    });

    it('may add a separator and restate surfaces without the ones below', () => {
        const document = layerExample();
        document.scheme.render.surface_separator = ' | ';
        document.scheme.render.surfaces.push({
            surface: 'retention',
            default: 'block',
            views: [{ id: 'block', format: 'retention_block' }],
        });
        expect(errors(document)).toEqual([]);
        delete document.scheme.render.surfaces;
        expect(errors(document)).toEqual([]);
    });

    it('is still held to what it decides on its own', () => {
        const twice = layerExample();
        views(twice).push({ id: 'short', format: 'full_line' });
        expect(errorPaths(twice)).toEqual([
            '/scheme/render/surfaces/0/views/1/id',
        ]);

        const listedTwice = layerExample();
        listedTwice.scheme.render.surfaces.push(
            structuredClone(listedTwice.scheme.render.surfaces[0]),
        );
        expect(errorPaths(listedTwice)).toEqual([
            '/scheme/render/surfaces/1/surface',
        ]);

        const withDefault = layerExample();
        withDefault.scheme.render.default = 'short_line';
        expect(errorPaths(withDefault)).toEqual(['/scheme/render/default']);

        // A restated default replaces the one below whole, so the layer's map
        // has to stand on its own: `whole` named, and only role keys.
        const noWhole = layerExample();
        delete noWhole.scheme.render.surfaces[0].default.whole;
        expect(errorPaths(noWhole)).toEqual([
            '/scheme/render/surfaces/0/default',
        ]);

        const notARole = layerExample();
        notARole.scheme.render.surfaces[0].default.header = 'full';
        expect(errorPaths(notARole)).toEqual([
            '/scheme/render/surfaces/0/default/header',
        ]);

        const empty = layerExample();
        views(empty).length = 0;
        const result = validateDocument(empty);
        expect(result.ok).toBe(false);
        expect(
            result.errors.map((entry: { path: string }) => entry.path),
        ).toContain('/scheme/render/surfaces/0/views');
    });

    it('is held to the forms of the views it lists', () => {
        // Two views it lists cannot share a form: both reach the composed
        // surface, whatever sits below.
        const shared = layerExample();
        views(shared).push({
            id: 'compact',
            role: 'part',
            format: 'short_line',
        });
        expect(errorPaths(shared)).toEqual([
            '/scheme/render/surfaces/0/views/1/format',
        ]);

        const repeated = layerExample();
        views(repeated)[0].also_read_in.push('short_shared_line');
        expect(errorPaths(repeated)).toEqual([
            '/scheme/render/surfaces/0/views/0/also_read_in/1',
        ]);
    });

    it('is held to the roles of the views it lists, and only those', () => {
        // `short` overrides the view below complete, so its role is the
        // layer's to state, and a part default naming it has to be a part.
        const document = layerExample();
        views(document)[0].role = 'whole';
        expect(errors(document)).toEqual([
            {
                id: 'plan/unresolved-reference',
                severity: 'error',
                path: '/scheme/render/surfaces/0/default/part',
                message:
                    'surface `sensitivity` writes a part marking in view `short`, a view of whole markings, and a whole marking in `full`. A part written in `short` would be read back as a whole, and written again in `full`; a view a surface keeps for part markings is a view of part markings.',
            },
        ]);

        // A view id it lists beside a view of another role it also lists.
        const passedOver = layerExample();
        views(passedOver).push({
            id: 'full',
            role: 'whole',
            format: 'full_line',
        });
        passedOver.scheme.render.surfaces[0].default = 'full';
        expect(errorPaths(passedOver)).toEqual([
            '/scheme/render/surfaces/0/default',
        ]);
    });
});
