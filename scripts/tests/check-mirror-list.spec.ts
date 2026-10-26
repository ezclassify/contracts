import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { auditMirrorList } from '../check-mirror-list.mjs';

const roots: string[] = [];

afterEach(() => {
    for (const root of roots.splice(0)) {
        rmSync(root, { recursive: true, force: true });
    }
});

function fixture(): {
    root: string;
    writeList: (names: string[]) => void;
} {
    const root = mkdtempSync(path.join(tmpdir(), 'ezc-mirror-list-'));
    roots.push(root);
    const write = (relative: string, value: unknown) => {
        const file = path.join(root, relative);
        mkdirSync(path.dirname(file), { recursive: true });
        writeFileSync(file, `${JSON.stringify(value)}\n`);
    };
    write('package.json', {
        private: true,
        workspaces: ['packages/*'],
    });
    write('packages/a/package.json', {
        name: '@ezclassify/a',
        version: '1.0.0-dev.28',
        dependencies: { '@ezclassify/b': '^1.0.0-0' },
    });
    write('packages/b/package.json', {
        name: '@ezclassify/b',
        version: '1.0.0-dev.28',
    });
    const writeList = (names: string[]) =>
        write('scripts/mirror-packages.json', { packages: names });
    return { root, writeList };
}

describe('mirror package list publication guard', () => {
    it('accepts a complete list with one entry per publishable workspace', () => {
        const { root, writeList } = fixture();
        writeList(['@ezclassify/a', '@ezclassify/b']);
        expect(auditMirrorList({ root }).problems).toEqual([]);
    });

    it('rejects duplicate names before the publish loop can partially complete', () => {
        const { root, writeList } = fixture();
        writeList(['@ezclassify/a', '@ezclassify/a', '@ezclassify/b']);
        expect(auditMirrorList({ root }).problems).toEqual([
            'scripts/mirror-packages.json lists @ezclassify/a more than once; each package must be published only once per run.',
        ]);
    });
});
