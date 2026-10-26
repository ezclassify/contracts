import { describe, expect, it, vi } from 'vitest';
import { createGeneratedJsonWriter } from '../generated-json-writer.mjs';

describe('generated JSON writer', () => {
    it('formats completely before writing the destination once', async () => {
        const events: string[] = [];
        const formattedJson = '{\n    "answer": 42\n}\n';
        const format = vi.fn(async () => {
            events.push('format');
            return formattedJson;
        });
        const writeFileSync = vi.fn(
            (_outFile: string, contents: string, encoding: string) => {
                events.push('write');
                expect(contents).toBe(formattedJson);
                expect(encoding).toBe('utf8');
            },
        );

        const writeGeneratedJson = await createGeneratedJsonWriter(
            '/repo/schema.json',
            {
                format,
                resolveConfig: async () => ({ tabWidth: 4 }),
                writeFileSync,
            },
        );
        await writeGeneratedJson('/repo/schema.json', '{"answer":42}');

        expect(events).toEqual(['format', 'write']);
        expect(format).toHaveBeenCalledWith('{"answer":42}', {
            tabWidth: 4,
            filepath: '/repo/schema.json',
        });
        expect(writeFileSync).toHaveBeenCalledOnce();
    });

    it('does not write the destination when formatting fails', async () => {
        const writeFileSync = vi.fn();
        const writeGeneratedJson = await createGeneratedJsonWriter(
            '/repo/schema.json',
            {
                format: async () => {
                    throw new Error('format failed');
                },
                resolveConfig: async () => ({}),
                writeFileSync,
            },
        );

        await expect(
            writeGeneratedJson('/repo/schema.json', '{"answer":42}'),
        ).rejects.toThrow('format failed');
        expect(writeFileSync).not.toHaveBeenCalled();
    });
});
