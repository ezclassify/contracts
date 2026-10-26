import { existsSync, readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * Two things every published package owes a reader who lands on its npm page.
 *
 * A README at all, because the page renders the `description` field and nothing
 * else without one. And a license line that says what `package.json` says: the
 * front page is where most people read the license, and one that disagrees with
 * the LICENSE file beside it is worse than none.
 */

const REPO_ROOT = path.resolve(import.meta.dirname, '..', '..');
const WORKSPACE_DIRS = ['libs', 'packages'];

interface Manifest {
    name: string;
    license?: string;
    private?: boolean;
}

function workspacePackages(): { name: string; root: string }[] {
    const found: { name: string; root: string }[] = [];
    for (const dir of WORKSPACE_DIRS) {
        for (const entry of readdirSync(path.join(REPO_ROOT, dir))) {
            const root = path.join(dir, entry);
            const manifestPath = path.join(REPO_ROOT, root, 'package.json');
            if (!existsSync(manifestPath)) continue;
            const manifest = JSON.parse(
                readFileSync(manifestPath, 'utf8'),
            ) as Manifest;
            if (manifest.private) continue;
            found.push({ name: manifest.name, root });
        }
    }
    return found;
}

const PACKAGES = workspacePackages();

describe('every published package', () => {
    it('is discovered, so the checks below are not vacuously green', () => {
        expect(PACKAGES.length).toBeGreaterThan(5);
    });

    it.each(PACKAGES)('$name has a README', ({ root }) => {
        expect(existsSync(path.join(REPO_ROOT, root, 'README.md'))).toBe(true);
    });

    it.each(PACKAGES)('$name states the license it declares', ({ root }) => {
        const manifest = JSON.parse(
            readFileSync(path.join(REPO_ROOT, root, 'package.json'), 'utf8'),
        ) as Manifest;
        const readme = readFileSync(
            path.join(REPO_ROOT, root, 'README.md'),
            'utf8',
        );
        const section = readme.slice(readme.lastIndexOf('## License'));
        expect(section).toContain('## License');
        expect(section).toContain(manifest.license);
    });
});
