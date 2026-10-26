/**
 * Compare committed schema files with an isolated generator result by path and
 * bytes.
 *
 * @module
 */
import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';

function filesUnder(root, relative = '') {
    const directory = path.join(root, relative);
    return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
        const child = path.join(relative, entry.name);
        return entry.isDirectory() ? filesUnder(root, child) : [child];
    });
}

/** Compare the complete committed snapshot with an isolated generator output. */
export function compareGeneratedSchemas(committedRoot, generatedRoot) {
    const committed = new Set(filesUnder(committedRoot));
    const generated = new Set(filesUnder(generatedRoot));
    const paths = new Set([...committed, ...generated]);
    return [...paths]
        .filter(
            (relative) =>
                !committed.has(relative) ||
                !generated.has(relative) ||
                !readFileSync(path.join(committedRoot, relative)).equals(
                    readFileSync(path.join(generatedRoot, relative)),
                ),
        )
        .sort();
}
