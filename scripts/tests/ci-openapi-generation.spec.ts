import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import yaml from 'js-yaml';
import { describe, expect, it } from 'vitest';

const workflow = yaml.load(
    readFileSync(
        new URL('../../.github/workflows/ci.yml', import.meta.url),
        'utf8',
    ),
) as {
    permissions: Record<string, string>;
    jobs: Record<string, { steps: Array<Record<string, unknown>> }>;
};
const steps = workflow.jobs['build-and-test'].steps;
const step = (name: string) => {
    const found = steps.find((item) => item.name === name);
    if (!found) throw new Error(`Missing native generation step: ${name}`);
    return found;
};
const applies = (condition: unknown, full: string, nodeVersion: string) =>
    runInNewContext(
        String(condition)
            .slice(3, -2)
            .replaceAll('matrix.node-version', 'matrix.nodeVersion'),
        { needs: { policy: { outputs: { full } } }, matrix: { nodeVersion } },
        { timeout: 100 },
    );

// Native generation must not turn a routine check into an implicit source writer.
describe('native OpenAPI generation evidence', () => {
    it('generates only in full qualification and captures one supported interpreter', () => {
        const generate = step('Generate the canonical OpenAPI document');
        const capture = step('Capture native OpenAPI generation');
        const retain = step('Retain native OpenAPI generation for review');
        expect(generate.run).toBe('npm run codegen');
        expect(retain.if).toBe(capture.if);
        const ordered = [
            step('Build'),
            generate,
            capture,
            retain,
            step('Test'),
        ];
        for (let index = 1; index < ordered.length; index += 1) {
            expect(steps.indexOf(ordered[index - 1])).toBeLessThan(
                steps.indexOf(ordered[index]),
            );
        }
        for (const version of ['22', '24']) {
            expect(applies(generate.if, 'true', version)).toBe(true);
            expect(applies(generate.if, 'false', version)).toBe(false);
            expect(applies(capture.if, 'false', version)).toBe(false);
        }
        expect(applies(capture.if, 'true', '22')).toBe(true);
        expect(applies(capture.if, 'true', '24')).toBe(false);
        expect(retain.with).toMatchObject({
            'name': 'openapi-generation',
            'path': '${{ runner.temp }}/openapi-generation',
            'if-no-files-found': 'error',
            'retention-days': 7,
        });
        expect(workflow.permissions).toEqual({ contents: 'read' });
    });
    it('retains native notice-writer outputs before tests without bypassing committed freshness', () => {
        const generate = step('Generate native package notices');
        const capture = step('Capture native package notices');
        const retain = step('Retain native package notices for review');
        expect(generate.run).toBe('npm run notices');
        expect(retain.if).toBe(capture.if);
        for (const version of ['22', '24']) {
            expect(applies(generate.if, 'true', version)).toBe(true);
            expect(applies(generate.if, 'false', version)).toBe(false);
            expect(applies(capture.if, 'false', version)).toBe(false);
        }
        expect(applies(capture.if, 'true', '22')).toBe(true);
        expect(applies(capture.if, 'true', '24')).toBe(false);
        const ordered = [
            step('Build'),
            generate,
            capture,
            retain,
            step('Test'),
            step('Working tree is clean after build'),
        ];
        for (let index = 1; index < ordered.length; index += 1)
            expect(steps.indexOf(ordered[index - 1])).toBeLessThan(
                steps.indexOf(ordered[index]),
            );
        expect(capture.run).toContain('workspacesNeedingNotices()');
        expect(capture.run).toContain("'THIRD-PARTY-NOTICES.md'");
        expect(retain.with).toMatchObject({
            'name': 'notices-generation',
            'path': '${{ runner.temp }}/notices-generation',
            'if-no-files-found': 'error',
            'retention-days': 7,
        });
    });
});
