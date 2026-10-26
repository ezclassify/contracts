#!/usr/bin/env node
/**
 * Guards the one property that makes `openapi.yaml` safe to publish: it
 * describes the public data-path contract and nothing else.
 *
 * Private control-plane endpoints and entitlement schemas must not enter the
 * public data-path document.
 *
 * Eight checks, each naming a failure that is still possible:
 *
 * 1. Surface freeze. Every operation is listed in `openapi-surface.txt`. A new or
 *    renamed endpoint fails until the list is regenerated on purpose (`npm run
 *    check:spec -- --write`) in the same commit.
 * 2. Reserved path prefixes. Licensing, debug, admin and internal routes have no
 *    place on the data path, whatever the freeze file says.
 * 3. Entitlement vocabulary in contract names. Every name-bearing position in the
 *    document is checked; see {@link walkNamedPositions} for the list, which is
 *    long on purpose. Names only: scheme content legitimately describes its own
 *    SPDX license, and an access decision legitimately has a `granted` field,
 *    so values and prose stay out of scope.
 * 4. No unreachable components. Everything defined must be reachable from an
 *    operation, from a security requirement, or from the by-value allowlist in
 *    {@link REACHABLE_BY_VALUE}. The allowlist covers public components used by
 *    value that therefore have no reference edge in the document.
 * 5. YAML and JSON agree. Both files ship, so a check that only reads one of them
 *    guards half the artifact.
 * 6. The default server is https. Generators and API explorers adopt the first
 *    `servers` entry as their base URL, so a plaintext entry at the front hands
 *    every consumer a plaintext default for a credential-bearing API.
 * 7. Prose is prose. Descriptions come from TSDoc comments, and an inline tag such
 *    as `{@link X}` means something to a TypeScript editor and nothing to a
 *    reader of the published document or of a generated SDK's docs.
 * 8. Every field is described. Each SDK generator turns a schema's description
 *    into the type's doc comment and each property's into its field's, so a
 *    schema or property without one ships as an undocumented type or field in
 *    every language.
 *
 * Run directly to check the repository; import `auditPublicSpec` to check a
 * document held in memory.
 *
 * @module
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import yaml from 'js-yaml';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

/**
 * The document lives in the package that publishes it, `@ezclassify/openapi`.
 * The frozen surface stays here with the guard that reads it: it is a review
 * record of what the contract is allowed to expose, not part of the artifact.
 */
export const OPENAPI_PACKAGE = path.join(ROOT, 'libs', 'openapi');

export const YAML_FILE = path.join(OPENAPI_PACKAGE, 'openapi.yaml');
export const JSON_FILE = path.join(OPENAPI_PACKAGE, 'openapi.json');
export const SURFACE_FILE = path.join(ROOT, 'openapi-surface.txt');

/** Route namespaces that belong to the control plane or to a developer's laptop. */
const RESERVED_PATH_PREFIXES = [
    '/v1/license',
    '/v1/licence',
    '/v1/entitlement',
    '/v1/debug',
    '/v1/admin',
    '/v1/internal',
];

/**
 * Runtime-entitlement vocabulary, matched against names rather than prose.
 * `Grant` is anchored so `granted` on an access decision stays legal.
 */
const ENTITLEMENT_NAME_PATTERNS = [
    /Entitle/i,
    /(^|[a-z])Grants?$/,
    /Licen[cs]e(Status|Decision|Phase|Organization|FamilyMembership)/i,
    /RuntimeLicen[cs]e/i,
    /RuntimeSurface/i,
    /ClockFloor/i,
    /ProductionSystem/i,
    /ProductionExecution/i,
    /Subscription/i,
    /SeatCount|Seats$/i,
];

const HTTP_METHODS = new Set([
    'get',
    'put',
    'post',
    'delete',
    'options',
    'head',
    'patch',
    'trace',
]);

/**
 * Lists `METHOD /path operationId` for every operation in the document, sorted.
 * This is the shape the frozen surface file stores.
 *
 * @param {Record<string, any>} spec Parsed OpenAPI document.
 * @returns {string[]} One entry per operation.
 */
export function specSurface(spec) {
    const found = [];
    for (const [route, item] of Object.entries(spec?.paths ?? {})) {
        for (const [method, operation] of Object.entries(item ?? {})) {
            if (!HTTP_METHODS.has(method)) continue;
            const id = operation?.operationId ?? '(no operationId)';
            found.push(`${method.toUpperCase()} ${route} ${id}`);
        }
    }
    return found.sort();
}

const isBannedName = (name) =>
    ENTITLEMENT_NAME_PATTERNS.some((re) => re.test(name));

const isPlainObject = (value) =>
    value !== null && typeof value === 'object' && !Array.isArray(value);

/**
 * Collects every reference string anywhere inside a node.
 *
 * `$ref` is the ordinary form. `discriminator.mapping` values are references
 * too. They sit under a key that is not `$ref`, either as a full `#/...`
 * pointer or as a bare schema name, so they are collected here rather than
 * being rediscovered as a reachability bug later.
 */
function refsIn(node, out = []) {
    if (node === null || typeof node !== 'object') return out;
    if (Array.isArray(node)) {
        for (const child of node) refsIn(child, out);
        return out;
    }
    for (const [key, value] of Object.entries(node)) {
        if (key === '$ref' && typeof value === 'string') {
            out.push(value);
            continue;
        }
        if (key === 'discriminator' && isPlainObject(value)) {
            for (const target of Object.values(value.mapping ?? {})) {
                if (typeof target !== 'string') continue;
                out.push(
                    target.startsWith('#/')
                        ? target
                        : `#/components/schemas/${target}`,
                );
            }
        }
        refsIn(value, out);
    }
    return out;
}

/**
 * Maps whose keys are names the author chose, not OpenAPI keywords.
 *
 * Two things follow from being on this list. The keys are candidates for the
 * vocabulary check (the ones that are contract names get emitted by a branch in
 * {@link walkNamedPositions}), and, the reason the list has to exist, a key
 * inside one of these maps is never read as a keyword. Without that, a schema
 * with a property called `required` or `encoding` would send the walk down a
 * keyword branch holding a property schema, and it would report that schema's
 * own `type` and `items` keys as contract names.
 */
const NAME_KEYED_MAPS = new Set([
    'callbacks',
    'content',
    'dependentRequired',
    'dependentSchemas',
    'encoding',
    'headers',
    'links',
    'mapping',
    'patternProperties',
    'pathItems',
    'paths',
    'properties',
    'requestBodies',
    'responses',
    'schemas',
    'scopes',
    'securitySchemes',
    'variables',
    'webhooks',
]);

/**
 * Keys whose values are sample or default DATA rather than contract structure.
 *
 * The walk stops at them. An example payload for a scheme operation is a scheme
 * document, and a scheme document has its own `properties` and `required` keys
 * that mean nothing about this contract's shape. Descending into one produces
 * names that were never declared here.
 */
const VALUE_ONLY_KEYS = new Set(['example', 'examples', 'default', 'const']);

/**
 * Walks the whole document and reports every position that names something in
 * the contract, as `(name, kind, jsonPath)`.
 *
 * Looking only at `components.schemas` would leave an inline request body free
 * to declare `{properties: {entitlements}}` and ship, so every position that
 * declares a name is walked:
 *
 * - `properties.<name>` keys anywhere, starting at the document root
 * - `required[]` entries, and `dependentRequired` keys and entries: property
 *   names declared by value rather than by position
 * - `parameters[].name`, `components.parameters.<*>.name`, and the keys of a
 *   link's `parameters` map, which are names rather than objects
 * - Keys of any `headers` map, in operations and in `components.responses` alike
 * - Keys of an inline `links` map on a response, and of an operation's
 *   `callbacks` map
 * - Keys of a media type's `encoding` map, which name request-body properties
 * - OAuth2 scope names, from `flows.<flow>.scopes` keys and from the arrays in a
 *   `security` requirement; and the scheme names those requirements reference
 * - `securitySchemes.<*>.name`, the wire header or query name of an apiKey scheme
 * - `webhooks` keys and `servers[].variables` keys
 * - `operationId`
 * - `discriminator.propertyName` and `discriminator.mapping` keys
 * - `tags` entries, both the string arrays on operations and `spec.tags[].name`
 *
 * Deliberately NOT covered: `name` in general (`info.license.name` is prose),
 * enum values, descriptions, examples and defaults. Values carry legitimate
 * licensing words; names do not.
 *
 * @param {unknown} node Subtree to walk.
 * @param {string} trail JSON path of `node`.
 * @param {(name: string, kind: string, jsonPath: string) => void} emit Sink.
 * @param {boolean} keysAreNames True when this node's keys were chosen by the
 *   author (a `properties` map, a `components.schemas` map) rather than being
 *   OpenAPI keywords. The keys of `components` itself ARE keywords, so no
 *   special case is needed for it.
 */
function walkNamedPositions(node, trail, emit, keysAreNames = false) {
    if (node === null || typeof node !== 'object') return;
    if (Array.isArray(node)) {
        node.forEach((child, index) =>
            walkNamedPositions(child, `${trail}[${index}]`, emit, keysAreNames),
        );
        return;
    }
    for (const [key, value] of Object.entries(node)) {
        const here = `${trail}.${key}`;
        if (keysAreNames) {
            walkNamedPositions(value, here, emit, false);
            continue;
        }
        if (VALUE_ONLY_KEYS.has(key)) continue;

        if (key === 'properties' && isPlainObject(value)) {
            for (const name of Object.keys(value))
                emit(name, 'property', `${here}.${name}`);
        } else if (key === 'required' && Array.isArray(value)) {
            value.forEach((entry, index) => {
                if (typeof entry === 'string')
                    emit(entry, 'required property', `${here}[${index}]`);
            });
        } else if (key === 'dependentRequired' && isPlainObject(value)) {
            for (const [name, dependents] of Object.entries(value)) {
                emit(name, 'property', `${here}.${name}`);
                if (!Array.isArray(dependents)) continue;
                dependents.forEach((entry, index) => {
                    if (typeof entry === 'string')
                        emit(
                            entry,
                            'required property',
                            `${here}.${name}[${index}]`,
                        );
                });
            }
        } else if (key === 'dependentSchemas' && isPlainObject(value)) {
            for (const name of Object.keys(value))
                emit(name, 'property', `${here}.${name}`);
        } else if (key === 'headers' && isPlainObject(value)) {
            for (const name of Object.keys(value))
                emit(name, 'header', `${here}.${name}`);
        } else if (key === 'links' && isPlainObject(value)) {
            for (const name of Object.keys(value))
                emit(name, 'link', `${here}.${name}`);
        } else if (key === 'callbacks' && isPlainObject(value)) {
            for (const name of Object.keys(value))
                emit(name, 'callback', `${here}.${name}`);
        } else if (key === 'encoding' && isPlainObject(value)) {
            for (const name of Object.keys(value))
                emit(name, 'encoding property', `${here}.${name}`);
        } else if (key === 'scopes' && isPlainObject(value)) {
            for (const name of Object.keys(value))
                emit(name, 'oauth scope', `${here}.${name}`);
        } else if (key === 'webhooks' && isPlainObject(value)) {
            for (const name of Object.keys(value))
                emit(name, 'webhook', `${here}.${name}`);
        } else if (key === 'variables' && isPlainObject(value)) {
            for (const name of Object.keys(value))
                emit(name, 'server variable', `${here}.${name}`);
        } else if (key === 'securitySchemes' && isPlainObject(value)) {
            // The component key is reported by `namedPositions`. This is the
            // other name an apiKey scheme carries: the header or query
            // parameter it actually travels in.
            for (const [scheme, definition] of Object.entries(value)) {
                if (
                    isPlainObject(definition) &&
                    typeof definition.name === 'string'
                )
                    emit(
                        definition.name,
                        'api key name',
                        `${here}.${scheme}.name`,
                    );
            }
        } else if (key === 'security' && Array.isArray(value)) {
            value.forEach((requirement, index) => {
                if (!isPlainObject(requirement)) return;
                for (const [scheme, scopes] of Object.entries(requirement)) {
                    emit(
                        scheme,
                        'security requirement',
                        `${here}[${index}].${scheme}`,
                    );
                    if (!Array.isArray(scopes)) continue;
                    scopes.forEach((scope, position) => {
                        if (typeof scope === 'string')
                            emit(
                                scope,
                                'oauth scope',
                                `${here}[${index}].${scheme}[${position}]`,
                            );
                    });
                }
            });
        } else if (key === 'operationId' && typeof value === 'string') {
            emit(value, 'operationId', here);
        } else if (key === 'discriminator' && isPlainObject(value)) {
            if (typeof value.propertyName === 'string')
                emit(
                    value.propertyName,
                    'discriminator property',
                    `${here}.propertyName`,
                );
            for (const name of Object.keys(value.mapping ?? {}))
                emit(name, 'discriminator mapping', `${here}.mapping.${name}`);
        } else if (key === 'parameters') {
            // Arrays on path items and operations; a map under `components`;
            // and a map under a link, where the KEY is the parameter name and
            // the value is a runtime expression rather than an object.
            const entries = Array.isArray(value)
                ? value.map((entry, index) => [`[${index}]`, entry, null])
                : Object.entries(value ?? {}).map(([k, v]) => [`.${k}`, v, k]);
            for (const [suffix, entry, mapKey] of entries) {
                if (isPlainObject(entry) && typeof entry.name === 'string')
                    emit(entry.name, 'parameter', `${here}${suffix}.name`);
                else if (mapKey !== null)
                    emit(mapKey, 'parameter', `${here}${suffix}`);
            }
        } else if (key === 'tags' && Array.isArray(value)) {
            value.forEach((entry, index) => {
                if (typeof entry === 'string')
                    emit(entry, 'tag', `${here}[${index}]`);
                else if (isPlainObject(entry) && typeof entry.name === 'string')
                    emit(entry.name, 'tag', `${here}[${index}].name`);
            });
        }

        walkNamedPositions(
            value,
            here,
            emit,
            NAME_KEYED_MAPS.has(key) && isPlainObject(value),
        );
    }
}

/**
 * Every name the contract declares, from all of the positions above plus the
 * two that are structural rather than nested: component keys and path
 * segments.
 *
 * @param {Record<string, any>} spec Parsed OpenAPI document.
 * @returns {{ name: string; kind: string; jsonPath: string }[]} Named
 *   positions.
 */
export function namedPositions(spec) {
    const found = [];
    const emit = (name, kind, jsonPath) => found.push({ name, kind, jsonPath });

    for (const [kind, entries] of Object.entries(spec?.components ?? {})) {
        for (const name of Object.keys(entries ?? {}))
            emit(name, 'component', `$.components.${kind}.${name}`);
    }
    for (const route of Object.keys(spec?.paths ?? {})) {
        route
            .split('/')
            .map((segment) => segment.replace(/[{}]/g, ''))
            .forEach((segment, index) => {
                if (segment !== '')
                    emit(segment, 'path segment', `$.paths.${route}[${index}]`);
            });
    }
    walkNamedPositions(spec ?? {}, '$', emit);

    // `components.headers.<x>` is both a component key and a headers-map key.
    // One position, one report.
    const seen = new Set();
    return found.filter(({ jsonPath }) => {
        if (seen.has(jsonPath)) return false;
        seen.add(jsonPath);
        return true;
    });
}

/**
 * Seeds the reachability walk with components referenced BY NAME instead of by
 * `$ref`.
 *
 * A security scheme is named from a `security:` array and never `$ref`ed, so a
 * pure `$ref` crawl reports every scheme as dead the moment auth lands. The
 * standing rule, so the next such kind is added rather than rediscovered: any
 * component kind whose reference form is not `$ref` needs a seeder here.
 *
 * @param {Record<string, any>} spec Parsed OpenAPI document.
 * @returns {string[]} Component pointers the document reaches by name.
 */
function securitySchemeSeeds(spec) {
    const seeds = [];
    const addRequirements = (requirements) => {
        if (!Array.isArray(requirements)) return;
        for (const requirement of requirements) {
            if (!isPlainObject(requirement)) continue;
            for (const name of Object.keys(requirement))
                seeds.push(`#/components/securitySchemes/${name}`);
        }
    };

    addRequirements(spec?.security);
    for (const item of Object.values(spec?.paths ?? {})) {
        for (const [method, operation] of Object.entries(item ?? {})) {
            if (!HTTP_METHODS.has(method)) continue;
            addRequirements(operation?.security);
        }
    }
    return seeds;
}

/**
 * Components that belong to the public contract but cannot be reached by
 * reference, because the server emits them BY VALUE rather than pointing a
 * schema at them.
 *
 * This escape hatch exists because reading "unreferenced" as "dead" would
 * delete the only documentation of the stable `INVALID_INPUT` detail values and
 * the reproducibility vocabulary. A guard that reports live contract as dead is
 * worse than the leak it was built to catch, because someone acts on it.
 *
 * Entries are `pointer -> reason`, and the reason has to say what emits the
 * value, so a later reader can re-test the claim instead of trusting the list.
 * Each entry is also a ROOT of the reachability walk, not just an exemption:
 * anything the exempt component itself references is legitimately reachable
 * through it, the same as through a `$ref`.
 *
 * An entry is still an admission. Where the emitter can be changed to reference
 * the component honestly, that is the better fix and the entry should go.
 *
 * @type {Map<string, string>}
 */
export const REACHABLE_BY_VALUE = new Map([
    [
        '#/components/schemas/DocumentInputErrorDetail',
        'Stable INVALID_INPUT detail strings that go out on the wire and that ' +
            'SDK consumers switch on. Unreferenced because the error envelope ' +
            'types `detail` as a bare string; the enum is published as ' +
            'vocabulary. The generator emits it deliberately: it is a codegen ' +
            'root (libs/openapi/scripts/codegen-roots.ts) and its presence is ' +
            'asserted by the SDK generation contract test.',
    ],
    [
        '#/components/schemas/Reproducibility',
        'Wire vocabulary for whether a source can be loaded again ' +
            'byte-for-byte. Individual source schemas pin one member with ' +
            '`const`, so nothing $refs the union, but the union is the ' +
            'published closed set. Also a codegen root asserted by the SDK ' +
            'generation contract test.',
    ],
]);

/** A TSDoc inline tag: `{@link X}`, `{@linkcode X}`, `{@inheritDoc X}` and so on. */
const INLINE_TAG = /\{@[A-Za-z]+[^}]*\}/;

/**
 * Lists every `description` and `summary` string in the document that still
 * carries a TSDoc inline tag, with where it sits. Sample data is skipped.
 *
 * @param {unknown} node Any part of the parsed document.
 * @param {string} [trail] JSON path of `node`.
 * @param {{ jsonPath: string; text: string }[]} [out] Accumulator.
 * @returns {{ jsonPath: string; text: string }[]} The offending strings.
 */
export function inlineTagsInProse(node, trail = '$', out = []) {
    if (node === null || typeof node !== 'object') return out;
    const entries = Array.isArray(node)
        ? node.map((value, index) => [String(index), value])
        : Object.entries(node);
    for (const [key, value] of entries) {
        const jsonPath = Array.isArray(node)
            ? `${trail}[${key}]`
            : `${trail}.${key}`;
        if (!Array.isArray(node) && VALUE_ONLY_KEYS.has(key)) continue;
        if (
            !Array.isArray(node) &&
            (key === 'description' || key === 'summary') &&
            typeof value === 'string'
        ) {
            if (INLINE_TAG.test(value)) out.push({ jsonPath, text: value });
            continue;
        }
        inlineTagsInProse(value, jsonPath, out);
    }
    return out;
}

/**
 * Keywords whose subschemas select or exclude a value rather than declare one.
 * A conditional's `if` names a property only to test it, and a `not` names one
 * only to forbid it, so neither names a field a reader needs described. A
 * conditional's `then` and `else` can declare fields and are walked.
 */
const SELECTOR_KEYWORDS = new Set(['if', 'not']);

/**
 * Lists every property, at any depth, that carries no `description` of its own.
 * A property that only references a described type still leaves its field
 * undocumented: SDK generators take a field's doc from the property. Sample
 * data and the selectors inside conditionals are skipped.
 *
 * @param {unknown} node Any schema, or a map of named schemas.
 * @param {string} trail JSON path of `node`.
 * @param {string[]} [out] Accumulator.
 * @returns {string[]} JSON paths of the undescribed properties.
 */
export function undescribedProperties(node, trail, out = []) {
    if (node === null || typeof node !== 'object') return out;
    if (Array.isArray(node)) {
        node.forEach((value, index) =>
            undescribedProperties(value, `${trail}[${index}]`, out),
        );
        return out;
    }
    for (const [key, value] of Object.entries(node)) {
        if (VALUE_ONLY_KEYS.has(key) || SELECTOR_KEYWORDS.has(key)) continue;
        if (
            key !== 'properties' ||
            value === null ||
            typeof value !== 'object'
        ) {
            undescribedProperties(value, `${trail}.${key}`, out);
            continue;
        }
        for (const [name, property] of Object.entries(value)) {
            const at = `${trail}.properties.${name}`;
            if (
                typeof property?.description !== 'string' ||
                !property.description.trim()
            )
                out.push(at);
            undescribedProperties(property, at, out);
        }
    }
    return out;
}

/**
 * Audits a parsed OpenAPI document against the publication rules.
 *
 * @param {Record<string, any>} spec Parsed OpenAPI document.
 * @param {object} [options]
 * @param {string[]} [options.frozenSurface] Operations the public contract is
 *   frozen at. Omit to skip the freeze comparison.
 * @param {string} [options.jsonText] Contents of the shipped JSON restatement.
 *   Omit to skip the agreement check.
 * @param {Map<string, string>} [options.reachableByValue] Overrides
 *   {@link REACHABLE_BY_VALUE} for tests.
 * @returns {string[]} Human-readable failures; empty means the document is
 *   clean.
 */
export function auditPublicSpec(spec, options = {}) {
    const failures = [];
    const fail = (check, detail) => failures.push(`${check}: ${detail}`);
    const surface = specSurface(spec);

    if (options.frozenSurface) {
        const frozen = options.frozenSurface;
        for (const op of surface) {
            if (!frozen.includes(op)) {
                fail(
                    'surface freeze',
                    `operation not in the frozen public surface: ${op}`,
                );
            }
        }
        for (const op of frozen) {
            if (!surface.includes(op)) {
                fail(
                    'surface freeze',
                    `frozen operation missing from the spec: ${op}`,
                );
            }
        }
    }

    const servers = spec?.servers;
    if (!Array.isArray(servers) || servers.length === 0) {
        fail('default server', 'the document declares no servers entry');
    } else {
        const first = servers[0]?.url;
        if (typeof first !== 'string' || !first.startsWith('https://')) {
            fail(
                'default server',
                `the first servers entry is the default base URL for generated clients, so it has to be https: ${String(first)}`,
            );
        }
    }

    for (const route of Object.keys(spec?.paths ?? {})) {
        const reserved = RESERVED_PATH_PREFIXES.find((prefix) =>
            route.startsWith(prefix),
        );
        if (reserved) {
            fail(
                'reserved path',
                `${route} is under the reserved namespace ${reserved}`,
            );
        }
    }

    for (const { name, kind, jsonPath } of namedPositions(spec)) {
        if (isBannedName(name))
            fail('entitlement vocabulary', `${kind} ${name} at ${jsonPath}`);
    }

    const roots = Object.fromEntries(
        Object.entries(spec ?? {}).filter(([key]) => key !== 'components'),
    );
    const reachableByValue = options.reachableByValue ?? REACHABLE_BY_VALUE;
    const reached = new Set();
    const pending = [
        ...refsIn(roots),
        ...securitySchemeSeeds(spec),
        ...reachableByValue.keys(),
    ];
    while (pending.length > 0) {
        const ref = pending.pop();
        if (reached.has(ref)) continue;
        reached.add(ref);
        const match = /^#\/components\/([^/]+)\/(.+)$/.exec(ref);
        if (!match) {
            fail('dangling reference', `unsupported $ref form: ${ref}`);
            continue;
        }
        const [, kind, name] = match;
        const target = spec?.components?.[kind]?.[name];
        if (target === undefined) {
            fail('dangling reference', ref);
            continue;
        }
        pending.push(...refsIn(target));
    }
    for (const [kind, entries] of Object.entries(spec?.components ?? {})) {
        for (const name of Object.keys(entries ?? {})) {
            const pointer = `#/components/${kind}/${name}`;
            if (reached.has(pointer)) continue;
            fail(
                'unreachable component',
                `components.${kind}.${name} is not reachable from any operation`,
            );
        }
    }

    for (const { jsonPath, text } of inlineTagsInProse(spec)) {
        fail(
            'source markup',
            `${jsonPath} carries the TSDoc inline tag ${INLINE_TAG.exec(text)?.[0]}`,
        );
    }

    for (const [name, schema] of Object.entries(
        spec?.components?.schemas ?? {},
    )) {
        const at = `$.components.schemas.${name}`;
        if (
            typeof schema?.description !== 'string' ||
            !schema.description.trim()
        )
            fail('undescribed field', `${at} has no description`);
        for (const jsonPath of undescribedProperties(schema, at))
            fail('undescribed field', `${jsonPath} has no description`);
    }
    // An inline schema in an operation or another component kind ships as a
    // field in every SDK just the same.
    const elsewhere = {
        paths: spec?.paths,
        ...Object.fromEntries(
            Object.entries(spec?.components ?? {})
                .filter(([kind]) => kind !== 'schemas')
                .map(([kind, entries]) => [`components.${kind}`, entries]),
        ),
    };
    for (const [where, node] of Object.entries(elsewhere))
        for (const jsonPath of undescribedProperties(node, `$.${where}`))
            fail('undescribed field', `${jsonPath} has no description`);

    if (options.jsonText !== undefined) {
        if (options.jsonText !== `${JSON.stringify(spec, null, 2)}\n`) {
            fail(
                'yaml/json agreement',
                'openapi.json is not openapi.yaml re-serialized as JSON (2-space indent, trailing newline)',
            );
        }
    }

    return failures;
}

/** Reads the frozen surface file, ignoring blank lines. */
export function readFrozenSurface(file = SURFACE_FILE) {
    return fs
        .readFileSync(file, 'utf8')
        .split('\n')
        .filter((line) => line.trim() !== '');
}

function main(argv) {
    const spec = yaml.load(fs.readFileSync(YAML_FILE, 'utf8'));

    if (argv.includes('--write')) {
        // Both artifacts are derived from openapi.yaml, so both are rewritten
        // here rather than by hand: the frozen surface, which is a deliberate
        // acceptance of the operation list, and the JSON restatement, which is
        // a pure re-serialization and never a judgment call.
        const surface = specSurface(spec);
        fs.writeFileSync(SURFACE_FILE, `${surface.join('\n')}\n`);
        fs.writeFileSync(JSON_FILE, `${JSON.stringify(spec, null, 2)}\n`);
        console.log(
            `Wrote ${surface.length} operations to ${path.relative(ROOT, SURFACE_FILE)} ` +
                `and re-serialized ${path.relative(ROOT, JSON_FILE)}.`,
        );
        return 0;
    }

    const failures = auditPublicSpec(spec, {
        frozenSurface: readFrozenSurface(),
        jsonText: fs.readFileSync(JSON_FILE, 'utf8'),
    });

    if (failures.length > 0) {
        console.error(
            'The public OpenAPI spec failed its publication guard:\n',
        );
        for (const line of failures) console.error(`  - ${line}`);
        console.error(
            '\nThis spec ships to the public. Make a change here deliberately:',
        );
        console.error(
            '  - a new public operation lands with `npm run check:spec -- --write` in the same commit',
        );
        console.error(
            '  - entitlement and control-plane surface belongs in a private control-plane contract, not here',
        );
        console.error(
            '  - an undescribed field gets a doc comment in libs/types/src, then `npm run codegen`',
        );
        return 1;
    }

    // This repository generates the file it is checking (libs/openapi), so a
    // green check here is a statement about the contract this repo owns, not
    // about a copy that arrived from somewhere else.
    console.log(
        `Public spec guard passed: ${specSurface(spec).length} operations, ` +
            `${Object.keys(spec.components?.schemas ?? {}).length} schemas, ` +
            'all reachable and described, no reserved surface.',
    );
    return 0;
}

if (
    process.argv[1] &&
    path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
    process.exit(main(process.argv.slice(2)));
}
