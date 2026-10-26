import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { compareGeneratedSchemas } from '../compare-generated-schemas.mjs';

const roots: string[] = [];

afterEach(() => {
    for (const root of roots.splice(0)) {
        rmSync(root, { recursive: true, force: true });
    }
});

function fixture() {
    const root = mkdtempSync(path.join(tmpdir(), 'ezc-schema-compare-'));
    roots.push(root);
    const committed = path.join(root, 'committed');
    const generated = path.join(root, 'generated');
    mkdirSync(path.join(committed, 'json-schemas'), { recursive: true });
    mkdirSync(path.join(generated, 'json-schemas'), { recursive: true });
    const write = (dir: string, name: string, content: string) =>
        writeFileSync(path.join(dir, 'json-schemas', name), content);
    return { committed, generated, write };
}

describe('generated schema freshness comparison', () => {
    it('accepts byte-identical trees', () => {
        const { committed, generated, write } = fixture();
        write(committed, 'a.json', '{}\n');
        write(generated, 'a.json', '{}\n');
        expect(compareGeneratedSchemas(committed, generated)).toEqual([]);
    });

    it('reports changed, missing, and unexpected snapshots', () => {
        const { committed, generated, write } = fixture();
        write(committed, 'changed.json', '{}\n');
        write(generated, 'changed.json', '{"changed":true}\n');
        write(committed, 'missing.json', '{}\n');
        write(generated, 'unexpected.json', '{}\n');
        expect(compareGeneratedSchemas(committed, generated)).toEqual([
            'json-schemas/changed.json',
            'json-schemas/missing.json',
            'json-schemas/unexpected.json',
        ]);
    });
});
