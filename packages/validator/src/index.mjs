/**
 * `@ezclassify/validator`: schema-only validation for EzClassify authoring
 * documents.
 *
 * This checks a document against the published JSON Schema for its kind and
 * stops there. It does not load a scheme, resolve layers, evaluate rules, or
 * make an access decision. That is engine work, and the engine is not part of
 * this package or this repo. A document that passes here is well-formed;
 * whether it behaves as its author intended is a separate question that only a
 * runtime can answer.
 *
 * Authored-format plan checks sit alongside the schema: a field that can hold
 * two values and says nothing about what goes between them may pass the schema
 * while describing no usable output. These checks report that ambiguity without
 * recognizing or rendering anything.
 *
 * The point of shipping it is that a community scheme author can check their
 * work with nothing installed but this package.
 */
import { readFileSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';
import { parse as parseYaml } from 'yaml';
import {
    schemeSchema,
    guideSchema,
    accessSchema,
    contextSchema,
    crosswalkSchema,
} from '@ezclassify/schemas';
import { validateAccessDocument } from './access.mjs';
import { validateContextDocument } from './context.mjs';
import { validateCrosswalkDocument } from './crosswalk.mjs';
import { validateGuideDocument } from './guide.mjs';
import { validateSchemeDocument } from './scheme.mjs';

export { PLAN_DIAGNOSTICS } from './plan.mjs';
export { RULE_DIAGNOSTICS } from './rules.mjs';

/**
 * Document kinds this validator knows, keyed by the envelope key the document
 * carries at its top level. A scheme file is `{ scheme: ... }`, a guide file is
 * `{ guide: ... }`, and so on, so the kind is detectable without being told.
 */
export const SCHEMAS = Object.freeze({
    scheme: schemeSchema,
    guide: guideSchema,
    access: accessSchema,
    context: contextSchema,
    crosswalk: crosswalkSchema,
});

/** File extensions treated as candidate documents when walking a directory. */
const DOCUMENT_EXTENSIONS = new Set(['.yaml', '.yml', '.json']);

const VALIDATORS = Object.freeze({
    scheme: validateSchemeDocument,
    guide: validateGuideDocument,
    access: validateAccessDocument,
    context: validateContextDocument,
    crosswalk: validateCrosswalkDocument,
});

function validatorFor(kind) {
    if (!Object.hasOwn(VALIDATORS, kind))
        throw new Error(`No schema for document kind '${kind}'`);
    return VALIDATORS[kind];
}

/**
 * Parse a document by extension. YAML is a superset of JSON, but `.json` files
 * are parsed as JSON so that a malformed one reports a JSON error rather than a
 * confusing YAML one.
 *
 * @param file Absolute or relative path to the document.
 */
export function parseDocument(file) {
    const text = readFileSync(file, 'utf8');
    return path.extname(file).toLowerCase() === '.json'
        ? JSON.parse(text)
        : parseYaml(text);
}

/**
 * Infer the document kind from its envelope key.
 *
 * @param document A parsed document.
 * @returns The kind, or `undefined` when the document carries no known
 *   envelope.
 */
export function detectKind(document) {
    if (!document || typeof document !== 'object') return undefined;
    const keys = Object.keys(document);
    // Own properties only. `in` would report an inherited name such as
    // `toString` as a known kind, and the lookup behind it would not be a
    // schema.
    return keys.find((key) => Object.hasOwn(SCHEMAS, key));
}

/**
 * Validate one already-parsed document.
 *
 * @param document The parsed document.
 * @param kind Optional explicit kind; inferred from the envelope when omitted.
 * @returns `{ ok, kind, errors, warnings }` where each entry carries a JSON
 *   pointer and a message. `ok` reads the errors only: a warning describes
 *   something worth knowing about a document that is nonetheless valid, and a
 *   run that failed on advice would push authors into declaring things that are
 *   not true to get past it.
 */
export function validateDocument(document, kind) {
    const resolved = kind ?? detectKind(document);
    if (!resolved) {
        return {
            ok: false,
            kind: undefined,
            errors: [
                {
                    path: '',
                    message: `not an EzClassify document: expected a top-level ${Object.keys(
                        SCHEMAS,
                    )
                        .map((k) => `'${k}'`)
                        .join(', ')} key`,
                },
            ],
            warnings: [],
        };
    }
    return validatorFor(resolved)(document);
}

/**
 * Validate one file on disk. A parse failure is reported as a validation
 * failure rather than thrown, so a run over many files reports every bad file
 * instead of stopping at the first.
 *
 * @param file Path to the document.
 * @param kind Optional explicit kind.
 */
export function validateFile(file, kind) {
    let document;
    try {
        document = parseDocument(file);
    } catch (error) {
        return {
            file,
            ok: false,
            kind: undefined,
            errors: [
                { path: '', message: `could not parse: ${error.message}` },
            ],
            warnings: [],
        };
    }
    try {
        return { file, ...validateDocument(document, kind) };
    } catch (error) {
        // A validator that cannot be built is this file's problem, not the
        // run's: report it here so the other targets still get an answer.
        return {
            file,
            ok: false,
            kind: undefined,
            errors: [
                { path: '', message: `could not validate: ${error.message}` },
            ],
            warnings: [],
        };
    }
}

/**
 * Collect candidate document paths from a file or directory. Directories are
 * walked recursively; `node_modules` and dot-directories are skipped.
 *
 * @param target File or directory path.
 */
export function collectDocuments(target) {
    const stats = statSync(target);
    if (stats.isFile()) return [target];
    const found = [];
    for (const entry of readdirSync(target, { withFileTypes: true })) {
        if (entry.name.startsWith('.') || entry.name === 'node_modules')
            continue;
        const full = path.join(target, entry.name);
        if (entry.isDirectory()) {
            found.push(...collectDocuments(full));
        } else if (DOCUMENT_EXTENSIONS.has(path.extname(entry.name))) {
            found.push(full);
        }
    }
    return found.sort();
}

/**
 * Validate every document under the given targets.
 *
 * When a directory is walked, files that carry no recognized envelope are
 * skipped rather than failed, because a scheme folder legitimately holds other
 * JSON and YAML. A file named explicitly is always validated, so an author who
 * points at one file gets an answer about that file.
 *
 * A target that cannot be read is reported as a failed result rather than
 * thrown, so one mistyped path does not hide the answer for every other target
 * in the same run.
 *
 * @param targets Files or directories.
 * @param options `{ kind }` to force a document kind.
 */
export function validateTargets(targets, options = {}) {
    const results = [];
    for (const target of targets) {
        let stats;
        try {
            stats = statSync(target);
        } catch (error) {
            results.push({
                file: target,
                ok: false,
                kind: undefined,
                errors: [
                    { path: '', message: `could not read: ${error.message}` },
                ],
                warnings: [],
            });
            continue;
        }
        const explicitFile = stats.isFile();
        for (const file of collectDocuments(target)) {
            if (!explicitFile && !options.kind) {
                let document;
                try {
                    document = parseDocument(file);
                } catch {
                    // A malformed candidate has no trustworthy envelope to
                    // inspect. Report it so a directory cannot validate clean
                    // while hiding a broken document.
                    results.push(validateFile(file, options.kind));
                    continue;
                }
                if (!detectKind(document)) continue;
            }
            results.push(validateFile(file, options.kind));
        }
    }
    return results;
}
