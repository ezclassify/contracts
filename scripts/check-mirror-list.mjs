#!/usr/bin/env node
/**
 * Guards the mirror publish before it runs.
 *
 * The GitHub Packages mirror carries prerelease versions only:
 * `1.0.0-mirror.N`, never a plain `1.0.0`. That is a deliberate decision, and
 * it has a consequence most people get wrong once: a dependency range of
 * `^1.0.0` does not match `1.0.0-mirror.7`. npm excludes prereleases from a
 * range unless the range names one. So a package published to the mirror while
 * declaring `"@ezclassify/schemas": "^1.0.0"` installs cleanly here, where the
 * sibling is a workspace link, and is unresolvable everywhere else. The tarball
 * looks right and the whole fleet still cannot install it.
 *
 * Three checks:
 *
 * 1. The list matches reality. Every publishable workspace is in
 *    `mirror-packages.json` and every name in that file is a publishable
 *    workspace exactly once. Adding a package to a publish loop is a
 *    publication decision, so the list stays hand-written, but a package added
 *    to the repo and forgotten here would otherwise just never mirror,
 *    silently, which is the failure this check exists to make loud.
 * 2. First-party ranges admit a mirror version. Any dependency on a package this
 *    repository publishes must be written `^1.0.0-0`, not `^1.0.0`.
 * 3. With `--expect-version <v>`, every listed package is actually at that
 *    version. The publish workflow stamps the mirror version and then calls
 *    this, so a package that slipped past the stamp cannot go out carrying a
 *    plain `1.0.0` the mirror is not supposed to have.
 *
 * Exits 1 with the specific package and field on any failure.
 *
 * @module
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, '..');

const DEP_FIELDS = [
    'dependencies',
    'devDependencies',
    'peerDependencies',
    'optionalDependencies',
];

/** Reads the hand-maintained publish list. */
export function readMirrorList(root = repoRoot) {
    const file = path.join(root, 'scripts', 'mirror-packages.json');
    const parsed = JSON.parse(fs.readFileSync(file, 'utf8'));
    if (!Array.isArray(parsed.packages) || parsed.packages.length === 0) {
        throw new Error(`${file} declares no packages`);
    }
    return parsed.packages;
}

/**
 * Every workspace this repository could publish: a package.json under one of
 * the root `workspaces` globs that is not marked private. The root package
 * itself is private and never appears.
 */
export function findPublishableWorkspaces(root = repoRoot) {
    const rootPkg = JSON.parse(
        fs.readFileSync(path.join(root, 'package.json'), 'utf8'),
    );
    const globs = Array.isArray(rootPkg.workspaces)
        ? rootPkg.workspaces
        : (rootPkg.workspaces?.packages ?? []);
    const found = [];
    for (const glob of globs) {
        if (!glob.endsWith('/*')) {
            throw new Error(
                `unsupported workspace glob ${glob}: this check only understands "dir/*"`,
            );
        }
        const dir = path.join(root, glob.slice(0, -2));
        if (!fs.existsSync(dir)) {
            throw new Error(
                `workspace glob ${glob} names ${dir}, which does not exist`,
            );
        }
        for (const entry of fs.readdirSync(dir).sort()) {
            const manifest = path.join(dir, entry, 'package.json');
            if (!fs.existsSync(manifest)) continue;
            const pkg = JSON.parse(fs.readFileSync(manifest, 'utf8'));
            if (pkg.private === true) continue;
            found.push({ name: pkg.name, version: pkg.version, manifest, pkg });
        }
    }
    if (found.length === 0) {
        throw new Error(
            'found no publishable workspaces, which cannot be right: check the workspace globs',
        );
    }
    return found;
}

/** A range that npm will match against `1.0.0-mirror.N`. */
function admitsMirrorVersion(range) {
    // Not a general semver evaluation, and it should not be: the mirror stream is
    // exactly one shape, so the rule is that the range names a 1.0.0 prerelease.
    return /^\^?1\.0\.0-0$/.test(range.trim());
}

export function auditMirrorList({
    root = repoRoot,
    expectVersion = null,
} = {}) {
    const problems = [];
    const listed = readMirrorList(root);
    const publishable = findPublishableWorkspaces(root);
    const publishableNames = publishable.map((w) => w.name);
    const firstParty = new Set(publishableNames);

    for (const name of publishableNames) {
        if (!listed.includes(name)) {
            problems.push(
                `${name} is a publishable workspace but is not in scripts/mirror-packages.json, so it would never mirror. Add it, or mark the package private if it is not meant to publish.`,
            );
        }
    }
    const seenListed = new Set();
    for (const name of listed) {
        if (seenListed.has(name)) {
            problems.push(
                `scripts/mirror-packages.json lists ${name} more than once; each package must be published only once per run.`,
            );
        }
        seenListed.add(name);
        if (!publishableNames.includes(name)) {
            problems.push(
                `scripts/mirror-packages.json names ${name}, which is not a publishable workspace here. The publish step would fail on it.`,
            );
        }
    }

    for (const { name, manifest, pkg, version } of publishable) {
        const rel = path.relative(root, manifest);
        for (const field of DEP_FIELDS) {
            for (const [dep, range] of Object.entries(pkg[field] ?? {})) {
                if (!firstParty.has(dep)) continue;
                if (admitsMirrorVersion(range)) continue;
                problems.push(
                    `${rel} ${field}.${dep} is "${range}". The mirror publishes 1.0.0-mirror.N and npm will not match a prerelease against that range, so ${name} would be uninstallable off this machine. Use "^1.0.0-0".`,
                );
            }
        }
        if (expectVersion && version !== expectVersion) {
            problems.push(
                `${rel} is at version ${version}, expected ${expectVersion}. The mirror version stamp did not reach this package; publishing now would put a version on the mirror that is not part of the mirror stream.`,
            );
        }
    }

    return { problems, listed, publishable: publishableNames };
}

function main(argv) {
    let expectVersion = null;
    const at = argv.indexOf('--expect-version');
    if (at !== -1) {
        expectVersion = argv[at + 1];
        if (!expectVersion) {
            console.error('--expect-version needs a version');
            return 2;
        }
    }

    const { problems, listed, publishable } = auditMirrorList({
        expectVersion,
    });

    if (problems.length > 0) {
        console.error('Mirror publish list is not safe to publish:\n');
        for (const problem of problems) console.error(`  - ${problem}`);
        console.error('');
        return 1;
    }

    console.log(
        `Mirror list OK: ${listed.length} packages, matching ${publishable.length} publishable workspaces.`,
    );
    console.log(`  ${listed.join('\n  ')}`);
    if (expectVersion)
        console.log(`All ${listed.length} packages are at ${expectVersion}.`);
    return 0;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
    process.exit(main(process.argv.slice(2)));
}
