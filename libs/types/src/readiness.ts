/**
 * Readiness warning codes a runtime replica reports on its readiness probe.
 *
 * A warning describes a degraded condition an operator should act on. It never
 * changes readiness: a replica that is ready stays ready and keeps serving
 * while it carries one. The set is closed so a probe consumer can alert on
 * each code by name.
 *
 * `audit-degraded`: the runtime could not write one or more audit records and
 * keeps answering requests without them until audit writes succeed again.
 *
 * `application-allowance-exceeded`: more distinct application ids have called
 * the runtime than its license's application allowance. Every application is
 * still served, registered or not: the warning informs and never refuses a
 * request.
 *
 * `generation-refused`: a managed runtime refused what its control plane last
 * offered, either the newest generation or the desired-state page as a whole,
 * and keeps the generation it already holds, if it holds one.
 *
 * `desired-state-stale`: a managed runtime has no current signed statement from
 * its control plane that the generation it serves is still the desired one. The
 * control plane may be unreachable, or newer generations may be withheld on the
 * way to the runtime. It keeps serving the generation it holds.
 *
 * @public
 */
export type ReadinessWarning =
    | 'audit-degraded'
    | 'application-allowance-exceeded'
    | 'generation-refused'
    | 'desired-state-stale';
