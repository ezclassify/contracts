#!/usr/bin/env node
/**
 * Record the native Contracts mirror for the release conductor's private
 * publisher.
 */
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import {
    lstatSync,
    readdirSync,
    readFileSync,
    realpathSync,
    writeFileSync,
} from 'node:fs';
import { join, resolve, sep } from 'node:path';
import { pathToFileURL } from 'node:url';

/**
 * Bind every packed native package to an exact official source and preparation
 * attempt.
 */
export function createMirrorRecord(root, directory, producer) {
    root = realpathSync(root);
    if (
        producer?.repository !== 'ezclassify/contracts' ||
        !/^[a-f0-9]{40}$/.test(producer.sourceSha ?? '') ||
        !Number.isSafeInteger(producer.runId) ||
        producer.runId <= 0 ||
        !Number.isSafeInteger(producer.runAttempt) ||
        producer.runAttempt <= 0
    )
        throw new Error('Invalid official mirror producer');
    directory = realpathSync(directory);
    if (directory === root || directory.startsWith(root + sep))
        throw new Error('Mirror output must be outside source');
    const names = JSON.parse(
        readFileSync(join(root, 'scripts/mirror-packages.json')),
    ).packages;
    if (
        !Array.isArray(names) ||
        !names.length ||
        new Set(names).size !== names.length ||
        names.some((n) => !/^@ezclassify\/[a-z0-9-]+$/.test(n))
    )
        throw new Error('Invalid native mirror package list');
    const version = `1.0.0-mirror.${producer.runId}.${producer.runAttempt}`;
    const packages = [];
    for (const file of readdirSync(directory).sort()) {
        const path = join(directory, file);
        if (
            !/^[a-z0-9][a-z0-9.-]*\.tgz$/.test(file) ||
            !lstatSync(path).isFile() ||
            realpathSync(path) !== path
        )
            throw new Error(`Invalid mirror tarball ${file}`);
        const bytes = readFileSync(path);
        if (bytes.length > 128 * 1024 * 1024)
            throw new Error(`Mirror tarball exceeds bound: ${file}`);
        let manifest;
        try {
            manifest = JSON.parse(
                execFileSync('tar', ['-xOf', path, 'package/package.json'], {
                    encoding: 'utf8',
                    maxBuffer: 1024 * 1024,
                    stdio: ['ignore', 'pipe', 'pipe'],
                }),
            );
        } catch (cause) {
            throw new Error(`Invalid mirror tarball manifest ${file}`, {
                cause,
            });
        }
        if (
            !names.includes(manifest.name) ||
            manifest.version !== version ||
            packages.some((p) => p.name === manifest.name)
        )
            throw new Error(`Unexpected mirror tarball ${file}`);
        packages.push({
            name: manifest.name,
            version,
            file,
            integrity: `sha512-${createHash('sha512').update(bytes).digest('base64')}`,
            sha256: createHash('sha256').update(bytes).digest('hex'),
        });
    }
    if (packages.length !== names.length)
        throw new Error('Mirror tarball set is incomplete');
    return { format: 1, producer, version, packages };
}
if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
    const directory = process.argv[2];
    if (!directory)
        throw new Error('Use development-mirror.mjs <packed-directory>');
    const producer = {
        repository: process.env.GITHUB_REPOSITORY,
        sourceSha: process.env.GITHUB_SHA,
        runId: Number(process.env.GITHUB_RUN_ID),
        runAttempt: Number(process.env.GITHUB_RUN_ATTEMPT),
    };
    const record = createMirrorRecord(
        process.cwd(),
        resolve(directory),
        producer,
    );
    writeFileSync(
        resolve(directory, 'development-mirror.json'),
        `${JSON.stringify(record, null, 2)}\n`,
    );
}
