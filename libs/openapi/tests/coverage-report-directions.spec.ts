import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import yaml from 'js-yaml';
import { describe, expect, it } from 'vitest';

/**
 * A coverage report answers in two directions: what the parent is missing and
 * what it carries beyond what its children allow. Each direction has its own
 * pair of fields, so a client generated from this document can tell "add this"
 * from "remove this" without parsing a constraint id out of `refusals`.
 *
 * Every operation that returns coverage reaches it through the one
 * `CheckCoverageResult` component, and the last test holds that: an inlined
 * copy of the shape would be a second contract free to drift from this one.
 */

const packageRoot = path.resolve(
    path.dirname(fileURLToPath(import.meta.url)),
    '..',
);

interface SchemaNode {
    type?: string;
    enum?: string[];
    properties?: Record<string, SchemaNode>;
    required?: string[];
    items?: SchemaNode;
    $ref?: string;
    description?: string;
}

const spec = yaml.load(
    readFileSync(path.join(packageRoot, 'openapi.yaml'), 'utf8'),
) as { components: { schemas: Record<string, SchemaNode> } };

const coverage = spec.components.schemas['CheckCoverageResult'];

describe('CheckCoverageResult reports both directions', () => {
    it('declares excess beside missing, with the same shapes', () => {
        const properties = coverage.properties ?? {};
        const shape = (node: SchemaNode | undefined) => ({
            type: node?.type,
            items: node?.items,
        });
        expect(shape(properties['excess'])).toEqual(
            shape(properties['missing']),
        );
        expect(shape(properties['excessLabels'])).toEqual(
            shape(properties['missingLabels']),
        );
        expect(properties['excess']).toMatchObject({
            type: 'array',
            items: { $ref: '#/components/schemas/Assertion' },
        });
        expect(properties['excessLabels']).toMatchObject({
            type: 'array',
            items: { type: 'string' },
        });
        expect(properties['missingLabels']).toMatchObject({
            type: 'array',
            items: { type: 'string' },
        });
    });

    it('requires both pairs and leaves refusals optional', () => {
        expect([...(coverage.required ?? [])].sort()).toEqual([
            'covered',
            'excess',
            'excessLabels',
            'missing',
            'missingLabels',
            'rendered',
        ]);
        expect(coverage.properties?.['refusals']).toBeDefined();
    });

    it('defines covered in terms of both directions', () => {
        const covered = coverage.properties?.['covered']?.description ?? '';
        expect(covered).toContain('`missing`');
        expect(covered).toContain('`excess`');
        expect(covered).toContain('`refusals`');
    });

    /**
     * The per-rollup rules, one group of operators per paragraph that opens "In
     * a `x`, `y` or `z` category". The hierarchy-root paragraph qualifies rules
     * already given and is not one of them.
     */
    const rules = (): string[][] =>
        (coverage.description ?? '')
            .split(/\n\s*\n/)
            .map((paragraph) => paragraph.replace(/\s+/g, ' ').trim())
            .filter((paragraph) => !paragraph.includes('hierarchy root'))
            .map((paragraph) =>
                /^In an? ((?:`[a-z_]+`(?:, | or )?)+) category /.exec(
                    paragraph,
                ),
            )
            .filter((match): match is RegExpExecArray => match !== null)
            .map((match) =>
                [...match[1].matchAll(/`([a-z_]+)`/g)].map((m) => m[1]).sort(),
            );

    /**
     * The rule a category is judged by, read the way the description says to:
     * pipeline membership first, then the declared rollup. Without the
     * precedence sentence a category a pipeline names has no rule the text
     * gives it, and this returns undefined.
     */
    const ruleFor = (category: {
        rollup: string;
        namedByPipeline: boolean;
    }): string[] | undefined => {
        const text = (coverage.description ?? '').replace(/\s+/g, ' ');
        const pipelineFirst =
            /A category that a rollup pipeline names is judged as a `pipeline` category, whatever rollup it declares\./.test(
                text,
            );
        if (category.namedByPipeline && !pipelineFirst) return undefined;
        const judgedAs = category.namedByPipeline
            ? 'pipeline'
            : category.rollup;
        return rules().find((group) => group.includes(judgedAs));
    };

    it('gives every rollup operator exactly one rule, in its own group', () => {
        // Which field a difference lands in depends on the category's rollup,
        // so an operator the description does not rule on is one whose report
        // a client cannot predict. A new operator fails here until it is given
        // a rule, and moving one to a different rule is a contract change this
        // test makes deliberate.
        const operators = spec.components.schemas['Rollup']?.enum ?? [];
        expect(operators.length).toBeGreaterThan(0);
        expect(rules()).toEqual([
            ['union'],
            ['intersection'],
            ['least_upper_bound', 'max', 'min'],
            ['pipeline'],
            ['first', 'last'],
            ['complement', 'exclusive_or', 'symmetric_difference'],
        ]);
        expect(rules().flat().sort()).toEqual([...operators].sort());
    });

    it('judges a category a rollup pipeline names by the pipeline rule, whatever it declares', () => {
        // A pipeline's co-categories may declare their own rollup, and the
        // engine still judges them by the pipeline. A list category that
        // declares intersection inside a pipeline is the shipped case: read by
        // its declared operator, a whole with a shorter list would lack
        // nothing, which is not what the engine reports.
        const operators = spec.components.schemas['Rollup']?.enum ?? [];
        for (const rollup of operators) {
            expect(ruleFor({ rollup, namedByPipeline: true }), rollup).toEqual([
                'pipeline',
            ]);
        }
        // Negative control: outside a pipeline the declared rollup decides.
        expect(
            ruleFor({ rollup: 'intersection', namedByPipeline: false }),
        ).toEqual(['intersection']);
    });

    it('is the only schema that carries the coverage shape', () => {
        const carriers = Object.entries(spec.components.schemas)
            .filter(([, schema]) => schema.properties?.['missingLabels'])
            .map(([name]) => name);
        expect(carriers).toEqual(['CheckCoverageResult']);
    });
});
