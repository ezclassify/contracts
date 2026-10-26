/**
 * Strict lookups for carving fragment schemas out of a bundled schema.
 *
 * Every fragment this package exports is a node of a bundled schema. A node
 * that is missing, or a `$ref` that names no definition, means the bundled
 * schema and this package disagree. That fails at module load: a fragment that
 * quietly degraded to `{}` would accept every document handed to it.
 */

/** A JSON Schema node. */
export type SchemaNode = Record<string, unknown>;

/** Strict reader over one bundled schema. */
export interface SchemaReader {
    /** Every named definition of the schema. */
    readonly defs: Record<string, SchemaNode>;
    /** The definition called `name`. */
    definition(name: string): SchemaNode;
    /** `node` itself, or the definition its local `$ref` names. */
    resolve(node: unknown, at: string): SchemaNode;
    /** The `properties` of the resolved node. */
    properties(node: unknown, at: string): Record<string, SchemaNode>;
    /** The `required` list of the resolved node. */
    required(node: unknown, at: string): string[];
    /** The resolved item schema of an array node. */
    items(node: unknown, at: string): SchemaNode;
}

function isNode(value: unknown): value is SchemaNode {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * Build a reader over `schema`, whose named definitions live under `key`.
 *
 * @param source - Schema file name, used in load errors.
 * @throws If `schema[key]` is not an object.
 */
export function schemaReader(
    schema: unknown,
    key: '$defs' | 'definitions',
    source: string,
): SchemaReader {
    const fail = (message: string): never => {
        throw new Error(`${source}: ${message}`);
    };
    const defsNode = isNode(schema) ? schema[key] : undefined;
    if (!isNode(defsNode)) fail(`has no \`${key}\` object`);
    const defs = defsNode as Record<string, SchemaNode>;
    const refPrefix = `#/${key}/`;

    const definition = (name: string): SchemaNode => {
        const node = defs[name];
        if (!isNode(node)) fail(`has no definition named "${name}"`);
        return node;
    };

    const resolve = (node: unknown, at: string): SchemaNode => {
        if (!isNode(node)) return fail(`${at} is missing`);
        const ref = node['$ref'];
        if (ref === undefined) return node;
        if (typeof ref !== 'string' || !ref.startsWith(refPrefix)) {
            return fail(
                `${at} has a $ref outside ${refPrefix}: ${String(ref)}`,
            );
        }
        return definition(decodeURIComponent(ref.slice(refPrefix.length)));
    };

    return {
        defs,
        definition,
        resolve,
        properties(node, at) {
            const properties = resolve(node, at)['properties'];
            if (!isNode(properties)) fail(`${at} declares no properties`);
            return properties as Record<string, SchemaNode>;
        },
        required(node, at) {
            const required = resolve(node, at)['required'];
            if (!Array.isArray(required))
                fail(`${at} declares no required list`);
            return required as string[];
        },
        items(node, at) {
            return resolve(resolve(node, at)['items'], `${at}[]`);
        },
    };
}
