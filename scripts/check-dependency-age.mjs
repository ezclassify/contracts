#!/usr/bin/env node
/**
 * Dependency quarantine gate.
 *
 * Refuses packages that were published inside a quarantine window, so a freshly
 * compromised release has to sit on the registry for a while before it can
 * enter this repository's dependency tree. `npm run deps:relock` resolves with
 * a `--before` bound for the same window; this check holds whatever lockfile is
 * present to it, including one a dependency update proposes.
 *
 * Every registry package here is third-party. This repository depends on no
 * EzClassify package it does not contain (AGENTS.md), so its own packages are
 * workspace links and are skipped, and an `@ezclassify/*` entry that would
 * install from a registry is refused outright, whatever its age.
 *
 * Reads the lockfile rather than the manifests: the lockfile names the exact
 * versions that would be installed, including transitive ones.
 *
 * Usage:
 *
 *     node scripts/check-dependency-age.mjs [--days=N] [--lockfile=PATH] [--registry=URL]
 *
 * Each flag also has an environment form, which is what the tests use:
 * `EZCLASSIFY_DEPENDENCY_AGE_DAYS`, `EZCLASSIFY_DEPENDENCY_AGE_LOCKFILE` and
 * `EZCLASSIFY_DEPENDENCY_AGE_REGISTRY` (the registry asked about an entry whose
 * lockfile record carries no `resolved` URL).
 *
 * @module
 */
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * Default quarantine window. A week is long enough that a malicious release has
 * usually been reported and unpublished, and short enough that ordinary
 * upgrades are not held up for a sprint.
 */
const DEFAULT_QUARANTINE_DAYS = 7;

const MILLISECONDS_PER_DAY = 86_400_000;

/**
 * How long one publish-date request may take. A required check must fail on a
 * registry that accepts the connection and never answers, not hang the job.
 */
const REQUEST_TIMEOUT_MS = 20_000;

/**
 * Registry consulted for an entry whose lockfile record carries no `resolved`
 * URL, which is common when the lockfile was written with
 * `--package-lock-only`.
 */
const DEFAULT_REGISTRY = 'https://registry.npmjs.org';

/** Scope of this repository's own packages, which install only as links. */
const FIRST_PARTY_PREFIX = '@ezclassify/';

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');

function parseArguments(argv) {
    const options = {};
    for (const argument of argv) {
        const match = /^--(days|lockfile|registry)=(.+)$/.exec(argument);
        if (!match) {
            throw new Error(
                `Unrecognized argument "${argument}". Usage: check-dependency-age.mjs [--days=N] [--lockfile=PATH] [--registry=URL]`,
            );
        }
        options[match[1]] = match[2];
    }
    return options;
}

function resolveQuarantineDays(options) {
    const raw =
        options.days ??
        process.env['EZCLASSIFY_DEPENDENCY_AGE_DAYS'] ??
        String(DEFAULT_QUARANTINE_DAYS);
    const days = Number(raw);
    if (!Number.isFinite(days) || days < 0) {
        throw new Error(
            `Quarantine window must be a non-negative number of days, got "${raw}".`,
        );
    }
    return days;
}

function resolveLockfilePath(options) {
    return resolve(
        options.lockfile ??
            process.env['EZCLASSIFY_DEPENDENCY_AGE_LOCKFILE'] ??
            resolve(repositoryRoot, 'package-lock.json'),
    );
}

function resolveDefaultRegistry(options) {
    const raw =
        options.registry ??
        process.env['EZCLASSIFY_DEPENDENCY_AGE_REGISTRY'] ??
        DEFAULT_REGISTRY;
    return raw.replace(/\/+$/, '');
}

/**
 * Collect the registry packages a lockfile would install, keyed by
 * `name@version` so a package pinned at two versions is checked at both, and
 * the `@ezclassify/*` entries that would install from anywhere but this
 * repository.
 *
 * Skips the root entry, workspace packages and links, and git or file
 * dependencies. `resolved` is consulted only for the registry origin, never as
 * a filter: a lockfile written with `--package-lock-only` omits it on many
 * entries, and skipping those would drop them from the check.
 */
function collectRegistryPackages(lockfile, defaultRegistry) {
    const entries = new Map();
    const foreignFirstParty = [];
    for (const [path, entry] of Object.entries(lockfile.packages ?? {})) {
        if (path === '' || entry.link === true) continue;
        if (!path.includes('node_modules/')) continue;
        if (typeof entry.version !== 'string') continue;
        const name = entry.name ?? nameFromLockfilePath(path);
        if (!name) continue;
        if (name.startsWith(FIRST_PARTY_PREFIX)) {
            foreignFirstParty.push(`${name}@${entry.version}`);
            continue;
        }
        const registry = registryOf(entry.resolved, defaultRegistry);
        if (registry === null) continue;
        entries.set(`${name}@${entry.version}`, {
            name,
            version: entry.version,
            registry,
        });
    }
    return { packages: [...entries.values()], foreignFirstParty };
}

/**
 * Registry origin for a lockfile entry: the origin of its `resolved` tarball
 * when present, otherwise the configured default. Returns null for a non-http
 * source, which has no registry to ask.
 */
function registryOf(resolved, defaultRegistry) {
    if (typeof resolved !== 'string') return defaultRegistry;
    let url;
    try {
        url = new URL(resolved);
    } catch {
        return null;
    }
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return null;
    return url.origin;
}

/**
 * Recover a package name from a lockfile path such as
 * `node_modules/a/node_modules/@scope/b`. The last `node_modules/` segment
 * wins, so a nested copy reports its own name rather than its parent's.
 */
function nameFromLockfilePath(path) {
    const marker = 'node_modules/';
    const index = path.lastIndexOf(marker);
    if (index < 0) return null;
    return path.slice(index + marker.length);
}

/**
 * Fetch a package's publish times from its registry. Asks for the full
 * packument: the abbreviated install document omits per-version timestamps.
 */
async function fetchPublishTimes(registry, name) {
    const url = `${registry}/${name.replace('/', '%2f')}`;
    let response;
    try {
        response = await fetch(url, {
            headers: { accept: 'application/json' },
            signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
        });
    } catch (cause) {
        throw new Error(
            `Could not reach ${registry} to check the publish date of ${name}: ${cause instanceof Error ? cause.message : String(cause)}`,
            { cause },
        );
    }
    if (!response.ok) {
        throw new Error(
            `${registry} answered ${response.status} for ${name}; cannot confirm its publish date.`,
        );
    }
    const document = await response.json();
    const times = document?.time;
    if (!times || typeof times !== 'object') {
        throw new Error(
            `${registry} returned no publish times for ${name}; cannot confirm the quarantine window.`,
        );
    }
    return times;
}

async function main() {
    const options = parseArguments(process.argv.slice(2));
    const quarantineDays = resolveQuarantineDays(options);
    const lockfile = JSON.parse(
        readFileSync(resolveLockfilePath(options), 'utf8'),
    );
    const { packages, foreignFirstParty } = collectRegistryPackages(
        lockfile,
        resolveDefaultRegistry(options),
    );
    if (foreignFirstParty.length > 0) {
        console.error(
            'This repository depends on no EzClassify package it does not contain (AGENTS.md), but the lockfile installs:',
        );
        for (const entry of foreignFirstParty) console.error(`  ${entry}`);
        process.exitCode = 1;
        return;
    }

    if (quarantineDays === 0) {
        console.log(
            'Dependency quarantine window is 0 days; nothing to check.',
        );
        return;
    }

    const cutoff = Date.now() - quarantineDays * MILLISECONDS_PER_DAY;
    const timesByPackage = new Map();
    const violations = [];
    const unknown = [];

    for (const entry of packages) {
        const cacheKey = `${entry.registry} ${entry.name}`;
        if (!timesByPackage.has(cacheKey)) {
            // One unreachable package must not hide the violations found in
            // the rest of the tree, so a failed lookup marks the package
            // unknown and the loop goes on.
            try {
                timesByPackage.set(
                    cacheKey,
                    await fetchPublishTimes(entry.registry, entry.name),
                );
            } catch (cause) {
                console.error(
                    cause instanceof Error ? cause.message : String(cause),
                );
                timesByPackage.set(cacheKey, null);
            }
        }
        const times = timesByPackage.get(cacheKey);
        const publishedAt =
            times && typeof times[entry.version] === 'string'
                ? Date.parse(times[entry.version])
                : Number.NaN;
        if (Number.isNaN(publishedAt)) {
            unknown.push(entry);
        } else if (publishedAt > cutoff) {
            violations.push({ ...entry, published: times[entry.version] });
        }
    }

    for (const entry of unknown) {
        console.error(
            `Dependency quarantine: ${entry.registry} reports no publish date for ${entry.name}@${entry.version}.`,
        );
    }
    if (violations.length > 0) {
        console.error(
            `Dependency quarantine: ${violations.length} package(s) were published less than ${quarantineDays} day(s) ago.`,
        );
        for (const violation of violations) {
            console.error(
                `  ${violation.name}@${violation.version} published ${violation.published}`,
            );
        }
        console.error(
            'Wait out the window, or pin an older version, before taking these in.',
        );
    }
    if (unknown.length > 0 || violations.length > 0) {
        process.exitCode = 1;
        return;
    }

    console.log(
        `Dependency quarantine passed: ${packages.length} package(s) are all older than ${quarantineDays} day(s).`,
    );
}

main().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
});
