import validate from './generated/scheme.validator.mjs';
import { compilePlan } from './plan.mjs';
import { schemaErrors } from './raw-validation.mjs';
import { ruleDiagnostics } from './rules.mjs';

/**
 * Validate a parsed scheme against the canonical schema and authored-format
 * plan rules, without Node.js or runtime code generation.
 */
export function validateSchemeDocument(document) {
    const result = validateSchemeShape(document);
    const { errors, warnings } = result;
    if (errors.length > 0) return result;

    const plan = compilePlan(document);
    for (const entry of plan.diagnostics) {
        const target = entry.severity === 'warning' ? warnings : errors;
        target.push({ id: entry.id, path: entry.path, message: entry.message });
    }
    return { ok: errors.length === 0, kind: 'scheme', errors, warnings };
}

/**
 * Validate schema shape without resolving cross-layer plan references.
 *
 * Shape includes the rule checks: a rule whose fields combine into something
 * the engine refuses is reported here, with a message that names the fix.
 */
export function validateSchemeShape(document) {
    const errors = [
        ...schemaErrors(validate, document),
        ...ruleDiagnostics(document),
    ];
    const warnings = [];
    return { ok: errors.length === 0, kind: 'scheme', errors, warnings };
}
