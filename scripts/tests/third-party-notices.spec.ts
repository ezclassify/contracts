import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import {
    bundledDependencies,
    productionDependencies,
    renderNotices,
    thirdPartyDependencies,
    workspaceDirs,
    workspacesNeedingNotices,
} from '../generate-notices.mjs';

const REPO_ROOT = path.resolve(import.meta.dirname, '..', '..');

/**
 * Attribution has to describe the dependency tree that actually ships. A
 * hand-written notice file fails in both directions: it can credit a package
 * the tree never depended on, and a package that does install third-party code
 * at run time can ship with no notice at all.
 *
 * So the check is not "does a notice file exist". It is "is the committed file
 * what the generator produces from the tree right now", which is the same
 * question `npm run check:notices` asks in CI.
 */
describe('third-party notices', () => {
    const needing = workspacesNeedingNotices(REPO_ROOT);

    /**
     * Derived here rather than written down, because a fixed list of names
     * cannot fail when a new workspace is missed. Every publishable workspace
     * is asked the same question the generator asks: does anything third-party
     * end up in its installed tree. Third-party code that arrives only through
     * one of our own packages counts, which is the case a selection made from
     * the manifest's direct dependencies would drop before looking at it.
     */
    const publishableWithThirdPartyCode = workspaceDirs(REPO_ROOT)
        .map((dir) => ({
            dir,
            manifest: JSON.parse(
                fs.readFileSync(path.join(dir, 'package.json'), 'utf8'),
            ) as { name: string; private?: boolean },
        }))
        .filter(({ manifest }) => !manifest.private)
        .filter(
            ({ manifest }) =>
                thirdPartyDependencies(manifest.name, manifest, REPO_ROOT)
                    .length > 0,
        )
        .map(({ manifest }) => manifest.name);

    it('finds every publishable package whose tree installs third-party code', () => {
        expect(publishableWithThirdPartyCode.length).toBeGreaterThan(0);
        expect(needing.map(({ name }) => name).sort()).toEqual(
            [...publishableWithThirdPartyCode].sort(),
        );
    });

    it.each(needing)(
        '$name ships the notices its tree produces',
        ({ dir, name, dependencies }) => {
            const committed = path.join(dir, 'THIRD-PARTY-NOTICES.md');
            expect(fs.existsSync(committed), committed).toBe(true);
            expect(fs.readFileSync(committed, 'utf8')).toBe(
                renderNotices(name, dependencies, REPO_ROOT),
            );
        },
    );

    it.each(needing)('$name publishes the notice file', ({ dir, name }) => {
        const manifest = JSON.parse(
            fs.readFileSync(path.join(dir, 'package.json'), 'utf8'),
        ) as { files: string[] };
        expect(manifest.files, name).toContain('THIRD-PARTY-NOTICES.md');
    });

    it('names generated-code inputs that are not runtime dependencies', () => {
        const manifest = JSON.parse(
            fs.readFileSync(
                path.join(REPO_ROOT, 'packages/validator/package.json'),
                'utf8',
            ),
        );
        expect(
            productionDependencies('@ezclassify/validator', REPO_ROOT).map(
                ({ name }) => name,
            ),
        ).not.toContain('ajv');
        expect(
            bundledDependencies(manifest, REPO_ROOT).map(({ name }) => name),
        ).toEqual(['ajv', 'ajv-formats']);
    });

    it('leaves no notice file behind in a package with no runtime dependencies', () => {
        const stray = execFileSync(
            'git',
            ['ls-files', '*THIRD-PARTY-NOTICES.md'],
            { cwd: REPO_ROOT, encoding: 'utf8' },
        )
            .split('\n')
            .filter(Boolean)
            .filter(
                (file) =>
                    !needing.some(({ dir }) =>
                        file.startsWith(
                            `${path.relative(REPO_ROOT, dir)}/`.replace(
                                /\\/g,
                                '/',
                            ),
                        ),
                    ),
            );
        expect(stray).toEqual([]);
    });
});

/**
 * The selection has to be made from the resolved tree, not from the manifest. A
 * package can declare nothing but our own packages and still install
 * third-party code through them, and that package owes attribution just as much
 * as one that names its dependencies directly. No workspace in this repository
 * is shaped that way at the moment, so the case is built here instead: `outer`
 * depends only on `inner`, and `inner` is the one that pulls the third-party
 * package in.
 */
describe('selection reaches third-party code held by a first-party dependency', () => {
    let fixture: string;

    beforeAll(() => {
        fixture = fs.mkdtempSync(path.join(os.tmpdir(), 'ezc-notices-'));
        const write = (file: string, body: unknown) => {
            const target = path.join(fixture, file);
            fs.mkdirSync(path.dirname(target), { recursive: true });
            fs.writeFileSync(target, JSON.stringify(body, null, 2), 'utf8');
        };
        write('package.json', {
            name: 'notices-fixture',
            version: '1.0.0',
            private: true,
            workspaces: ['packages/*'],
        });
        write('packages/outer/package.json', {
            name: '@ezclassify/outer',
            version: '1.0.0',
            dependencies: { '@ezclassify/inner': 'file:../inner' },
        });
        write('packages/inner/package.json', {
            name: '@ezclassify/inner',
            version: '1.0.0',
            dependencies: { 'held-transitively': 'file:../../vendor/held' },
        });
        write('vendor/held/package.json', {
            name: 'held-transitively',
            version: '2.0.0',
            license: 'MIT',
        });
        fs.writeFileSync(
            path.join(fixture, 'vendor', 'held', 'LICENSE'),
            'MIT license text.\n',
            'utf8',
        );
        execFileSync(
            'npm',
            [
                'install',
                '--no-audit',
                '--no-fund',
                '--offline',
                '--ignore-scripts',
            ],
            { cwd: fixture, stdio: 'ignore' },
        );
    }, 120_000);

    afterAll(() => {
        if (fixture) fs.rmSync(fixture, { force: true, recursive: true });
    });

    it('selects the package whose only declared dependency is first-party', () => {
        expect(
            Object.keys(
                JSON.parse(
                    fs.readFileSync(
                        path.join(fixture, 'packages', 'outer', 'package.json'),
                        'utf8',
                    ),
                ).dependencies,
            ),
        ).toEqual(['@ezclassify/inner']);
        expect(
            workspacesNeedingNotices(fixture).map(({ name }) => name),
        ).toContain('@ezclassify/outer');
    });

    it('credits the transitively held package in what it would write', () => {
        const rendered = renderNotices(
            '@ezclassify/outer',
            productionDependencies('@ezclassify/outer', fixture),
            fixture,
        );
        expect(rendered).toContain('held-transitively');
    });
});

/**
 * The notices are generated on macOS and checked on Linux. A package that ships
 * its license as `license` matches `LICENSE` only on a case-insensitive file
 * system, so a lookup by exact name gives two different files for one tree.
 */
describe('license text is found regardless of the file name case', () => {
    let fixture: string;

    beforeAll(() => {
        fixture = fs.mkdtempSync(path.join(os.tmpdir(), 'ezc-notices-case-'));
        const dir = path.join(fixture, 'node_modules', 'lowercase-licensed');
        fs.mkdirSync(dir, { recursive: true });
        fs.writeFileSync(
            path.join(dir, 'package.json'),
            JSON.stringify({
                name: 'lowercase-licensed',
                version: '1.0.0',
                license: 'MIT',
            }),
            'utf8',
        );
        fs.writeFileSync(
            path.join(dir, 'license'),
            'Lowercase license text.\n',
            'utf8',
        );
    });

    afterAll(() => {
        if (fixture) fs.rmSync(fixture, { force: true, recursive: true });
    });

    it('includes the text of a lowercase license file', () => {
        const rendered = renderNotices(
            '@ezclassify/example',
            [{ name: 'lowercase-licensed', version: '1.0.0' }],
            fixture,
        );
        expect(rendered).toContain('Lowercase license text.');
        expect(rendered).not.toContain('ships no license file');
    });
});
