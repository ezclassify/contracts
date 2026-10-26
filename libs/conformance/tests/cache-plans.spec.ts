import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import Ajv2020 from 'ajv/dist/2020.js';
import { describe, expect, it } from 'vitest';

/**
 * The cache plans are the executable form of `cache/v1/CACHE-SEMANTICS.md`.
 * Every SDK runs them against the wire corpus, so a plan that names a case that
 * is not there, misstates what the contract says an operation does, or leaves a
 * checklist item uncovered would fail in five languages at once, or worse, pass
 * in all of them. These checks keep the plans, the contract text and the corpus
 * saying the same thing.
 */

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const cacheDir = path.join(root, 'cache', 'v1');

type Treatment = 'cached' | 'decision' | 'never' | 'uncached' | 'resource';

interface Operation {
    name: string;
    method: string;
    route: string;
    treatment: Treatment;
}

interface Step {
    step: string;
    operation?: string;
    case?: string;
    times?: number;
    caller?: string;
    callers?: string[];
    cancelable?: string[];
    variant?: string;
    member?: string;
    preCanceled?: boolean;
    expect?: { error: unknown };
    count?: number;
    synthetic?: string;
}

interface Plan {
    id: string;
    covers: string[];
    capabilities: string[];
    client: {
        binding: 'pinned' | 'unpinned';
        context?: string;
        cacheAccessDecisions?: boolean;
        construction?: 'refused';
    };
    steps: Step[];
}

interface PlanDocument {
    corpus: string;
    denialCase: string;
    operations: Operation[];
    checklist: { id: string; requirement: string }[];
    capabilities: Record<
        string,
        { description: string; notApplicable?: string }
    >;
    knownGaps: { checklist: string; operation: string; reason: string }[];
    plans: Plan[];
}

interface WireCase {
    id: string;
    request: { method: string; path: string; pathTemplate?: string };
    response: { status: number; body: unknown };
    neverCache?: string;
}

function readJson(file: string): unknown {
    return JSON.parse(readFileSync(file, 'utf8'));
}

const document = readJson(path.join(cacheDir, 'plans.json')) as PlanDocument;
const contract = readFileSync(
    path.join(cacheDir, 'CACHE-SEMANTICS.md'),
    'utf8',
);
const corpus = readJson(path.resolve(cacheDir, document.corpus)) as {
    cases: WireCase[];
};
const casesById = new Map(corpus.cases.map((entry) => [entry.id, entry]));
const operations = new Map(document.operations.map((op) => [op.name, op]));

interface SchemaNode {
    $ref?: string;
    required?: string[];
    properties?: Record<string, SchemaNode>;
    anyOf?: SchemaNode[];
}

const openapi = readJson(
    path.resolve(root, '..', 'openapi', 'openapi.json'),
) as {
    paths: Record<
        string,
        Record<
            string,
            {
                responses?: Record<
                    string,
                    { content?: Record<string, { schema: SchemaNode }> }
                >;
            }
        >
    >;
    components: { schemas: Record<string, SchemaNode> };
};

/** Follow a component reference to the schema it names. */
function deref(node: SchemaNode): SchemaNode {
    if (!node.$ref) return node;
    return deref(openapi.components.schemas[node.$ref.split('/').pop()!]!);
}

/**
 * Whether every segment of pointer is a member its parent schema requires,
 * starting from the 200 response schema of the recorded case's route.
 */
function pointerIsRequired(recorded: WireCase, pointer: string): boolean {
    const route =
        openapi.paths[recorded.request.pathTemplate!]?.[
            recorded.request.method.toLowerCase()
        ];
    let node: SchemaNode | undefined =
        route?.responses?.['200']?.content?.['application/json']?.schema;
    for (const segment of pointer.split('/').slice(1)) {
        if (!node) return false;
        const resolved = deref(node);
        const branch = resolved.properties
            ? resolved
            : resolved.anyOf
                  ?.map(deref)
                  .find((one) => one.properties?.[segment]);
        if (!branch?.required?.includes(segment)) return false;
        node = branch.properties?.[segment];
    }
    return true;
}

/** Whether pointer resolves to a value in body. */
function pointerResolves(body: unknown, pointer: string): boolean {
    let value: unknown = body;
    for (const segment of pointer.split('/').slice(1)) {
        if (value === null || typeof value !== 'object' || !(segment in value))
            return false;
        value = (value as Record<string, unknown>)[segment];
    }
    return true;
}

/**
 * Whether the plan sends one recorded request through two operations that share
 * a method and route, the case where only the operation name tells their cache
 * entries apart. Calling one of them per request needs nothing from the port.
 */
function usesSharedRoute(plan: Plan): boolean {
    const sent = new Map<string, string>();
    for (const step of plan.steps) {
        const operation = step.operation && operations.get(step.operation);
        if (!operation || step.case === undefined) continue;
        const key = `${operation.method} ${operation.route} ${step.case}`;
        const first = sent.get(key);
        if (first !== undefined && first !== operation.name) return true;
        sent.set(key, operation.name);
    }
    return false;
}

/** Steps that need a harness capability, and the capability they need. */
function capabilitiesUsed(plan: Plan): Set<string> {
    const used = new Set<string>();
    for (const step of plan.steps) {
        if (step.step === 'gate' || step.step === 'release')
            used.add('responseGate');
        if (step.step === 'advanceClock') used.add('clock');
        if (step.step === 'respond') used.add('scriptedResponses');
        if (step.step === 'quiesce') used.add('quiesce');
        if (step.step === 'cancel' || step.cancelable || step.preCanceled)
            used.add('cancellation');
        if (step.step === 'expectWireAborted') used.add('cancellation');
        if (step.variant === 'explicitNullMember')
            used.add('explicitNullMember');
        if (
            step.operation &&
            operations.get(step.operation)?.treatment === 'resource'
        )
            used.add('schemeResourceOperations');
    }
    if (usesSharedRoute(plan)) used.add('sharedRouteOperations');
    return used;
}

describe('cache conformance plans', () => {
    it('match their schema', () => {
        const ajv = new Ajv2020({
            allErrors: true,
            strict: true,
            strictRequired: false,
        });
        const validate = ajv.compile(
            readJson(path.join(cacheDir, 'plans.schema.json')) as object,
        );
        const valid = validate(document);
        expect(validate.errors ?? []).toEqual([]);
        expect(valid).toBe(true);
    });

    it('name each plan and operation once', () => {
        const planIds = document.plans.map((plan) => plan.id);
        expect(new Set(planIds).size).toBe(planIds.length);
        expect(operations.size).toBe(document.operations.length);
    });

    it('list the operations the contract table lists, with the same treatment', () => {
        const rows = [
            ...contract.matchAll(
                /^\| `([a-z]+\.[A-Za-z]+)` +\| `(GET|POST) ([a-z/-]+)` +\| `([a-z]+)` +\|$/gm,
            ),
        ].map(([, name, method, route, treatment]) => ({
            name,
            method,
            route,
            treatment,
        }));
        expect(rows).toEqual(document.operations);
    });

    it('carry the checklist the contract states', () => {
        const rows = [
            ...contract.matchAll(/^\| (C\d{2}) +\| (.+?) +\|$/gm),
        ].map(([, id]) => id);
        expect(rows).toEqual(document.checklist.map((item) => item.id));
    });

    it('cover every checklist item and nothing else', () => {
        const ids = new Set(document.checklist.map((item) => item.id));
        const covered = new Set(document.plans.flatMap((plan) => plan.covers));
        expect([...covered].filter((id) => !ids.has(id))).toEqual([]);
        expect([...ids].filter((id) => !covered.has(id))).toEqual([]);
    });

    it('let no optional capability hollow out an item other than C05, C08 and C09', () => {
        // A port may declare an optional capability absent, so an item covered
        // only by plans needing one could pass by being skipped. That is
        // allowed for the two cancellation items and for C05, which binds only
        // ports exposing two operations over one route and body.
        const optional = new Set(
            Object.entries(document.capabilities)
                .filter(([, capability]) => capability.notApplicable)
                .map(([id]) => id),
        );
        expect(optional.has('cancellation')).toBe(true);
        expect(optional.has('sharedRouteOperations')).toBe(true);
        const coveredUnconditionally = new Set(
            document.plans
                .filter((plan) =>
                    plan.capabilities.every((id) => !optional.has(id)),
                )
                .flatMap((plan) => plan.covers),
        );
        expect(
            document.checklist
                .map((item) => item.id)
                .filter((id) => !coveredUnconditionally.has(id)),
        ).toEqual(['C05', 'C08', 'C09']);
    });

    it.each(document.plans.map((plan) => [plan.id, plan] as const))(
        '%s declares exactly the capabilities its steps use',
        (_id, plan) => {
            for (const id of plan.capabilities) {
                expect(document.capabilities[id], id).toBeDefined();
            }
            expect([...plan.capabilities].sort()).toEqual(
                [...capabilitiesUsed(plan)].sort(),
            );
        },
    );

    it.each(document.plans.map((plan) => [plan.id, plan] as const))(
        '%s drives recorded cases through the operation that sends them',
        (_id, plan) => {
            const context = plan.client.context ?? 'ez-full';
            for (const step of plan.steps) {
                if (step.case === undefined) continue;
                const recorded = casesById.get(step.case);
                expect(recorded, step.case).toBeDefined();
                expect(recorded!.request.path.split('/')[3], step.case).toBe(
                    context,
                );
                if (step.operation === undefined) continue;
                const operation = operations.get(step.operation);
                expect(operation, step.operation).toBeDefined();
                expect(recorded!.request.method).toBe(operation!.method);
                expect(recorded!.request.pathTemplate).toBe(
                    `/v1/ctx/{ctxId}/{version}/${operation!.route}`,
                );
            }
        },
    );

    it.each(document.plans.map((plan) => [plan.id, plan] as const))(
        '%s settles every caller it starts and releases every gate',
        (_id, plan) => {
            if (plan.client.construction === 'refused') {
                expect(plan.steps).toEqual([]);
                return;
            }
            expect(plan.steps.length).toBeGreaterThan(0);
            const started = new Set<string>();
            const pending = new Set<string>();
            const cancelable = new Set<string>();
            const settled = new Set<string>();
            const gated = new Set<string>();
            for (const step of plan.steps) {
                const named =
                    step.callers ?? (step.caller ? [step.caller] : []);
                switch (step.step) {
                    case 'call':
                        if (step.caller) settled.add(step.caller);
                        break;
                    case 'concurrent':
                        for (const caller of named) {
                            expect(started.has(caller), caller).toBe(false);
                            started.add(caller);
                            pending.add(caller);
                        }
                        for (const caller of step.cancelable ?? []) {
                            expect(named).toContain(caller);
                            cancelable.add(caller);
                        }
                        break;
                    case 'cancel':
                        expect(cancelable.has(step.caller!), step.caller).toBe(
                            true,
                        );
                        break;
                    case 'expectOk':
                    case 'expectError':
                        for (const caller of named) {
                            expect(started.has(caller), caller).toBe(true);
                            pending.delete(caller);
                            settled.add(caller);
                        }
                        break;
                    case 'mutateResult':
                    case 'expectIndependentResults':
                        for (const caller of named) {
                            expect(settled.has(caller), caller).toBe(true);
                        }
                        break;
                    case 'gate':
                        gated.add(step.case!);
                        break;
                    case 'release':
                        expect(gated.delete(step.case!), step.case).toBe(true);
                        break;
                }
            }
            expect([...pending]).toEqual([]);
            expect([...gated]).toEqual([]);
        },
    );

    it('state wire counts that follow from each operation treatment', () => {
        // Plans made only of calls and counts can be worked out from the
        // operations table alone: a cacheable call files one entry per
        // request identity, every other call is a wire trip, and a refused
        // call files nothing. A plan whose count disagrees has misread the
        // contract, so this replays them and compares.
        let replayed = 0;
        for (const plan of document.plans) {
            const simple = plan.steps.every(
                (step) =>
                    step.step === 'call' || step.step === 'expectWireCount',
            );
            if (!simple || plan.steps.length === 0) continue;
            replayed += 1;
            const requests = new Map<string, number>();
            const entries = new Set<string>();
            for (const step of plan.steps) {
                const identity =
                    step.variant === 'explicitNullMember'
                        ? `${step.case}|null:${step.member}`
                        : step.case!;
                if (step.step === 'expectWireCount') {
                    expect(
                        requests.get(identity) ?? 0,
                        `${plan.id} ${identity}`,
                    ).toBe(step.count);
                    continue;
                }
                const { treatment } = operations.get(step.operation!)!;
                const cacheable =
                    treatment === 'cached' ||
                    (treatment === 'decision' &&
                        plan.client.cacheAccessDecisions === true);
                const entry = `${step.operation}|${identity}`;
                for (let i = 0; i < (step.times ?? 1); i += 1) {
                    if (cacheable && entries.has(entry)) continue;
                    requests.set(identity, (requests.get(identity) ?? 0) + 1);
                    if (cacheable && step.expect === undefined)
                        entries.add(entry);
                }
            }
        }
        expect(replayed).toBeGreaterThan(30);
    });

    it('exercise every operation under the item its treatment answers to', () => {
        const itemFor: Record<Treatment, string[]> = {
            cached: ['C01'],
            decision: ['C12', 'C13'],
            never: ['C15'],
            uncached: ['C03'],
            resource: ['C03'],
        };
        const gaps = new Set(
            document.knownGaps.map(
                (gap) => `${gap.checklist}|${gap.operation}`,
            ),
        );
        const missing: string[] = [];
        for (const operation of document.operations) {
            for (const item of itemFor[operation.treatment]) {
                const exercised = document.plans.some(
                    (plan) =>
                        plan.covers.includes(item) &&
                        plan.steps.some(
                            (step) => step.operation === operation.name,
                        ),
                );
                if (!exercised && !gaps.has(`${item}|${operation.name}`))
                    missing.push(`${item} ${operation.name}`);
            }
        }
        expect(missing).toEqual([]);
        for (const gap of document.knownGaps) {
            expect(operations.has(gap.operation), gap.operation).toBe(true);
        }
    });

    it('agree with the corpus about which exchanges are never cached', () => {
        // A route two operations share is never cached when either of them
        // is, so a case counts once any operation driving it is.
        const driven = new Map<string, Set<Treatment>>();
        for (const plan of document.plans) {
            for (const step of plan.steps) {
                if (step.step !== 'call' || !step.operation || !step.case)
                    continue;
                const seen = driven.get(step.case) ?? new Set<Treatment>();
                seen.add(operations.get(step.operation)!.treatment);
                driven.set(step.case, seen);
            }
        }
        const marked = corpus.cases
            .filter((entry) => entry.neverCache !== undefined)
            .map((entry) => entry.id)
            .sort();
        const answeredNever = [...driven]
            .filter(
                ([caseId, treatments]) =>
                    (treatments.has('decision') || treatments.has('never')) &&
                    casesById.get(caseId)!.response.status === 200,
            )
            .map(([caseId]) => caseId)
            .sort();
        expect(answeredNever).toEqual(marked);
    });

    it('make a malformed success only by removing members the contract requires', () => {
        // Removing an optional member leaves a valid answer, and a plan that
        // calls it malformed would fail every port that is right.
        for (const plan of document.plans) {
            for (const step of plan.steps) {
                if (step.synthetic !== 'malformed-success') continue;
                const recorded = casesById.get(step.case!)!;
                expect(recorded.response.status).toBe(200);
                for (const pointer of (step as { removeMembers: string[] })
                    .removeMembers) {
                    expect(
                        pointerResolves(recorded.response.body, pointer),
                        `${plan.id} ${pointer}`,
                    ).toBe(true);
                    expect(
                        pointerIsRequired(recorded, pointer),
                        `${plan.id} ${pointer}`,
                    ).toBe(true);
                }
            }
        }
    });

    it('cover each item with a plan shaped to prove it', () => {
        // covers is a claim; these are the steps without which the claim
        // cannot be true.
        const shape: Record<string, (plan: Plan) => boolean> = {
            C02: (plan) =>
                plan.steps.some(
                    (step) =>
                        step.step === 'concurrent' && step.callers!.length > 1,
                ) ||
                plan.steps.filter((step) => step.step === 'concurrent').length >
                    1,
            C04: (plan) =>
                plan.steps.some((step) => step.variant !== undefined),
            C05: (plan) =>
                new Set(
                    plan.steps
                        .filter((step) => step.step === 'call')
                        .map((step) => step.operation),
                ).size > 1,
            C06: (plan) => plan.steps.some((step) => step.expect !== undefined),
            C07: (plan) =>
                plan.steps.some(
                    (step) => step.synthetic === 'malformed-success',
                ),
            C08: (plan) =>
                plan.steps.some(
                    (step) => step.step === 'cancel' || step.preCanceled,
                ),
            C09: (plan) =>
                plan.steps.some((step) => step.step === 'expectWireAborted'),
            C10: (plan) =>
                plan.client.binding === 'pinned' &&
                plan.steps.some((step) => step.step === 'advanceClock'),
            C11: (plan) =>
                plan.client.binding !== 'pinned' &&
                plan.steps.some((step) => step.step === 'advanceClock'),
            C13: (plan) => plan.client.cacheAccessDecisions === true,
            C14: (plan) =>
                plan.client.binding !== 'pinned' &&
                plan.client.cacheAccessDecisions === true &&
                plan.client.construction === 'refused',
            C16: (plan) =>
                plan.client.binding !== 'pinned' &&
                plan.steps.some(
                    (step) => step.synthetic === 'resolved-version',
                ),
            C17: (plan) =>
                plan.steps.some((step) => step.synthetic === 'denial-404') ||
                plan.steps.some(
                    (step) =>
                        (step.expect?.error as { status?: number } | undefined)
                            ?.status === 404,
                ),
            C18: (plan) =>
                plan.steps.some((step) => step.step === 'mutateResult') &&
                plan.steps.some(
                    (step) => step.step === 'expectIndependentResults',
                ),
        };
        const misshapen = document.plans.flatMap((plan) =>
            plan.covers
                .filter((id) => shape[id] && !shape[id]!(plan))
                .map((id) => `${plan.id} ${id}`),
        );
        expect(misshapen).toEqual([]);
        expect(
            document.plans.some((plan) =>
                plan.steps.some((step) => step.synthetic === 'denial-404'),
            ),
        ).toBe(true);
    });

    it('replay the runtime constant denial as the denial-404 response', () => {
        const denial = casesById.get(document.denialCase);
        expect(denial?.response.status).toBe(404);
        expect(denial?.response.body).toEqual({ error: 'not_found' });
    });
});
