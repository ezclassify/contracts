import { writeFileSync as writeFileSyncDefault } from 'node:fs';
import {
    format as formatDefault,
    resolveConfig as resolveConfigDefault,
} from 'prettier';

/**
 * @typedef {object} GeneratedJsonWriterDependencies
 * @property {(
 *     source: string,
 *     options: import('prettier').Options,
 * ) => Promise<string>} [format]
 * @property {(filePath: string) => Promise<import('prettier').Options | null>} [resolveConfig]
 * @property {(filePath: string, contents: string, encoding: 'utf8') => void} [writeFileSync]
 */

/**
 * Create a schema writer that never exposes unformatted generator output at its
 * destination path.
 *
 * @param {string} configSearchPath - Path Prettier uses to resolve repository
 *   configuration.
 * @param {GeneratedJsonWriterDependencies} [dependencies] - Injectable I/O for
 *   regression tests.
 * @returns {Promise<(outFile: string, rawJson: string) => Promise<void>>}
 */
export async function createGeneratedJsonWriter(
    configSearchPath,
    dependencies = {},
) {
    const format = dependencies.format ?? formatDefault;
    const resolveConfig = dependencies.resolveConfig ?? resolveConfigDefault;
    const writeFileSync = dependencies.writeFileSync ?? writeFileSyncDefault;
    const config = (await resolveConfig(configSearchPath)) ?? {};

    return async (outFile, rawJson) => {
        const formattedJson = await format(rawJson, {
            ...config,
            filepath: outFile,
        });
        writeFileSync(outFile, formattedJson, 'utf8');
    };
}
