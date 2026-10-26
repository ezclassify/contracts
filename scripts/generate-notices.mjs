#!/usr/bin/env node
/**
 * Writes THIRD-PARTY-NOTICES.md for every workspace that ships third-party code
 * to a consumer, and checks the committed files against the tree on demand.
 *
 * Attribution is an obligation, so the file has to say what the package
 * actually depends on. Hand-authoring it does not survive a dependency change:
 * one of these files claimed to be generated from the production dependency
 * tree while naming a package the workspace had never depended on, and the two
 * workspaces that do carry runtime dependencies shipped no notice at all.
 *
 * What counts as third-party here: everything in the production dependency
 * tree, transitively, that is not one of our own `@ezclassify/*` packages, plus
 * dependencies explicitly declared in `bundledThirdPartyDependencies` because
 * their implementation is compiled into a published artifact. Development and
 * peer dependencies are otherwise excluded because neither reaches a consumer
 * through our tarball.
 *
 * Usage:
 *
 * Node scripts/generate-notices.mjs # write the files node
 * scripts/generate-notices.mjs --check # fail if a file is stale
 *
 * @module
 */

import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const REPO_ROOT = path.resolve(
    path.dirname(fileURLToPath(import.meta.url)),
    '..',
);

const NOTICE_FILE = 'THIRD-PARTY-NOTICES.md';
const FIRST_PARTY_SCOPE = '@ezclassify/';

/** Filenames a dependency may ship its license text under. */
const LICENSE_FILENAMES = [
    'LICENSE',
    'LICENSE.md',
    'LICENSE.txt',
    'LICENCE',
    'LICENCE.md',
    'LICENCE.txt',
    'COPYING',
];

/** Every workspace directory, read from the root manifest's globs. */
export function workspaceDirs(root = REPO_ROOT) {
    const manifest = JSON.parse(
        fs.readFileSync(path.join(root, 'package.json'), 'utf8'),
    );
    const dirs = [];
    for (const pattern of manifest.workspaces ?? []) {
        const parent = path.join(root, pattern.replace(/\/\*$/, ''));
        if (!fs.existsSync(parent)) continue;
        for (const entry of fs.readdirSync(parent).sort()) {
            const dir = path.join(parent, entry);
            if (fs.existsSync(path.join(dir, 'package.json'))) dirs.push(dir);
        }
    }
    return dirs;
}

/** Flattens an `npm ls --all` tree into `name@version` keys. */
function collect(node, into) {
    for (const [name, entry] of Object.entries(node?.dependencies ?? {})) {
        if (!name.startsWith(FIRST_PARTY_SCOPE)) {
            into.set(`${name}@${entry.version}`, { name, ...entry });
        }
        collect(entry, into);
    }
    return into;
}

/**
 * The production dependency tree of one workspace, transitively, with our own
 * packages walked through but not listed.
 */
export function productionDependencies(workspaceName, root = REPO_ROOT) {
    const raw = execFileSync(
        'npm',
        [
            'ls',
            '--omit=dev',
            '--omit=peer',
            '--all',
            '--json',
            '-w',
            workspaceName,
        ],
        { cwd: root, encoding: 'utf8', maxBuffer: 32 * 1024 * 1024 },
    );
    return [...collect(JSON.parse(raw), new Map()).values()].sort(
        (a, b) =>
            a.name.localeCompare(b.name) || a.version.localeCompare(b.version),
    );
}

/** Resolves third-party source packages compiled into a workspace artifact. */
export function bundledDependencies(manifest, root = REPO_ROOT) {
    return (manifest.bundledThirdPartyDependencies ?? [])
        .map((name) => {
            if (name.startsWith(FIRST_PARTY_SCOPE)) {
                throw new Error(
                    `${manifest.name}: bundledThirdPartyDependencies must name third-party packages`,
                );
            }
            const packageManifest = JSON.parse(
                fs.readFileSync(
                    path.join(root, 'node_modules', name, 'package.json'),
                    'utf8',
                ),
            );
            return { name, version: packageManifest.version };
        })
        .sort(
            (a, b) =>
                a.name.localeCompare(b.name) ||
                a.version.localeCompare(b.version),
        );
}

/** All third-party packages whose code reaches a workspace tarball. */
export function thirdPartyDependencies(
    workspaceName,
    manifest,
    root = REPO_ROOT,
) {
    const dependencies = new Map();
    for (const dependency of [
        ...productionDependencies(workspaceName, root),
        ...bundledDependencies(manifest, root),
    ]) {
        dependencies.set(
            `${dependency.name}@${dependency.version}`,
            dependency,
        );
    }
    return [...dependencies.values()].sort(
        (a, b) =>
            a.name.localeCompare(b.name) || a.version.localeCompare(b.version),
    );
}

/** Reads a dependency's declared license and its license text, if it ships one. */
function licenseOf(name, root = REPO_ROOT) {
    const dir = path.join(root, 'node_modules', name);
    let declared = 'See the package';
    try {
        const manifest = JSON.parse(
            fs.readFileSync(path.join(dir, 'package.json'), 'utf8'),
        );
        declared =
            typeof manifest.license === 'string'
                ? manifest.license
                : (manifest.license?.type ?? declared);
    } catch {
        return { declared, text: '' };
    }
    const shipped = licenseFileOf(dir);
    return {
        declared,
        text: shipped
            ? fs.readFileSync(path.join(dir, shipped), 'utf8').trim()
            : '',
    };
}

/**
 * The license file a package directory ships, matched without regard to case so
 * the notices come out the same on a case-sensitive file system as on a
 * case-insensitive one: `license` and `LICENSE` are the same file to macOS and
 * two different names to Linux. Earlier names in {@link LICENSE_FILENAMES} win.
 */
function licenseFileOf(dir) {
    const entries = fs
        .readdirSync(dir, { withFileTypes: true })
        .filter((entry) => entry.isFile())
        .map((entry) => entry.name)
        .sort();
    for (const filename of LICENSE_FILENAMES) {
        const match = entries.find(
            (entry) => entry.toUpperCase() === filename.toUpperCase(),
        );
        if (match) return match;
    }
    return null;
}

/**
 * Renders a padded Markdown table.
 *
 * Column widths are padded here rather than left ragged so the generated file
 * is already in the shape the repository's formatter wants. An unformatted
 * generated file makes `format:check` and the generator disagree forever, and
 * whichever one ran last wins.
 */
function markdownTable(headers, rows) {
    const widths = headers.map((header, column) =>
        Math.max(header.length, ...rows.map((row) => row[column].length), 3),
    );
    const line = (cells) =>
        `| ${cells.map((cell, column) => cell.padEnd(widths[column])).join(' | ')} |`;
    return [
        line(headers),
        `| ${widths.map((width) => '-'.repeat(width)).join(' | ')} |`,
        ...rows.map(line),
    ];
}

/** Renders the notice file for one workspace. */
export function renderNotices(workspaceName, dependencies, root = REPO_ROOT) {
    const lines = [
        '# Third-party notices',
        '',
        `The published \`${workspaceName}\` package distributes code from the packages`,
        'below. Each is listed with its declared license and shipped license text.',
        '',
        'Generated from the production dependency tree and declared bundled-code inputs by',
        '`scripts/generate-notices.mjs`. Do not hand-edit: run the script.',
        '',
    ];
    if (dependencies.length === 0) {
        lines.push('This package distributes no third-party code.', '');
        return lines.join('\n');
    }
    lines.push(
        ...markdownTable(
            ['Package', 'Version', 'License'],
            dependencies.map((dependency) => [
                `\`${dependency.name}\``,
                dependency.version,
                licenseOf(dependency.name, root).declared,
            ]),
        ),
    );
    lines.push('');
    for (const dependency of dependencies) {
        const { declared, text } = licenseOf(dependency.name, root);
        lines.push(`## ${dependency.name} ${dependency.version}`, '');
        lines.push(`License: ${declared}`, '');
        if (text) lines.push('```text', text, '```', '');
        else
            lines.push(
                'This package ships no license file. See its repository for terms.',
                '',
            );
    }
    return lines.join('\n');
}

/**
 * Workspaces that publish and carry at least one third-party dependency or
 * compiled third-party implementation.
 *
 * The question is asked of the resolved tree, not of the manifest. A workspace
 * can depend only on our own packages and still install third-party code,
 * because `productionDependencies` walks through an `@ezclassify/*` link to
 * whatever it brings with it. Selecting on the direct dependencies would skip
 * that workspace before its tree was ever looked at, and it would ship no
 * attribution at all.
 */
export function workspacesNeedingNotices(root = REPO_ROOT) {
    const needing = [];
    for (const dir of workspaceDirs(root)) {
        const manifest = JSON.parse(
            fs.readFileSync(path.join(dir, 'package.json'), 'utf8'),
        );
        if (manifest.private) continue;
        const dependencies = thirdPartyDependencies(
            manifest.name,
            manifest,
            root,
        );
        if (dependencies.length === 0) continue;
        needing.push({ dir, name: manifest.name, dependencies });
    }
    return needing;
}

function main() {
    const check = process.argv.includes('--check');
    const failures = [];
    for (const { dir, name, dependencies } of workspacesNeedingNotices()) {
        const rendered = renderNotices(name, dependencies);
        const target = path.join(dir, NOTICE_FILE);
        if (check) {
            const current = fs.existsSync(target)
                ? fs.readFileSync(target, 'utf8')
                : '';
            if (current !== rendered) {
                failures.push(path.relative(REPO_ROOT, target));
            }
            continue;
        }
        fs.writeFileSync(target, rendered, 'utf8');
        console.log(`notices: wrote ${path.relative(REPO_ROOT, target)}`);
    }
    if (failures.length > 0) {
        console.error(
            `notices: stale or missing:\n  ${failures.join('\n  ')}\n` +
                'Regenerate with: npm run notices',
        );
        process.exit(1);
    }
    if (check) console.log('notices: OK (every notice file matches the tree).');
}

if (
    process.argv[1] &&
    import.meta.url === pathToFileURL(process.argv[1]).href
) {
    main();
}
