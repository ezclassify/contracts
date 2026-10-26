import type { Attribution } from './source';

/** Describes whether an observed source can be loaded again byte-for-byte. */
export type Reproducibility = 'reproducible' | 'best-effort';

/** Identifies a byte-for-byte reproducible source observation. */
export interface ReproducibleSourceIdentity {
    /** Whether the source observation can be reproduced byte-for-byte. */
    reproducibility: 'reproducible';
    /** Immutable content identity. */
    snapshotId: string;
    /** Location from which the content was observed. */
    locator?: string;
}

/** Identifies a source observation that cannot promise immutable replay. */
export interface BestEffortSourceIdentity {
    /** Whether the source observation can be reproduced byte-for-byte. */
    reproducibility: 'best-effort';
    /** Snapshot identity is forbidden when reproducibility is not proven. */
    snapshotId?: never;
    /** Location from which the mutable content was observed. */
    locator?: string;
}

/** Identifies a reproducible or explicitly best-effort source observation. */
export type SourceIdentity =
    | ReproducibleSourceIdentity
    | BestEffortSourceIdentity;

/** Closed artifact families participating in a composed operation. */
export type ArtifactKind =
    | 'scheme'
    | 'layer'
    | 'guide'
    | 'access'
    | 'crosswalk'
    | 'context';

/** Identifies an immutable artifact participating in a composed operation. */
export interface ArtifactReference {
    /** Artifact family. */
    kind: ArtifactKind;
    /** Artifact identifier. */
    id: string;
    /** Resolved immutable artifact version. */
    version: string;
    /** Content digest when the resolver can supply one. */
    digest?: string;
}

/** Reproducible source identity and mandatory attribution for an operation. */
export interface ReproducibleSourceReference extends ReproducibleSourceIdentity {
    /** Stable identifier for the source provider. */
    providerId: string;
    /** Attribution and license information for the observed source. */
    attribution: Attribution;
}

/** Best-effort source identity and mandatory attribution for an operation. */
export interface BestEffortSourceReference extends BestEffortSourceIdentity {
    /** Stable identifier for the source provider. */
    providerId: string;
    /** Attribution and license information for the observed source. */
    attribution: Attribution;
}

/** Records source identity and mandatory attribution for an operation. */
export type SourceReference =
    | ReproducibleSourceReference
    | BestEffortSourceReference;

/** Compact source join carried by a qualified rule reference. */
export interface ReproducibleRuleSourceReference {
    /** Stable identifier for the source provider. */
    providerId: string;
    /** Whether the source observation can be reproduced byte-for-byte. */
    reproducibility: 'reproducible';
    /** Immutable snapshot containing the rule. */
    snapshotId: string;
}

/** Best-effort external source join carried by a qualified rule reference. */
export interface BestEffortRuleSourceReference {
    /** Stable identifier for the source provider. */
    providerId: string;
    /** Whether the source observation can be reproduced byte-for-byte. */
    reproducibility: 'best-effort';
    /** Snapshot identity is forbidden when reproducibility is not proven. */
    snapshotId?: never;
}

/** Compact source join carried by a qualified rule reference. */
export type RuleSourceReference =
    | ReproducibleRuleSourceReference
    | BestEffortRuleSourceReference;

/** Identifies the exact resolved semantics of one policy rule. */
export interface RuleReference {
    /** Artifact that owns the rule. */
    artifact: ArtifactReference;
    /** Rule identifier within the owning artifact. */
    ruleId: string;
    /** RFC 8785/SHA-256 digest of the canonical resolved rule content. */
    ruleDigest: string;
    /** External source identity when the rule was not supplied inline. */
    source?: RuleSourceReference;
}

/** Compact reference to an assertion without engine-production metadata. */
export interface AssertionReference {
    /** Category containing the asserted concept. */
    categoryId: string;
    /** Asserted concept identifier. */
    conceptId: string;
    /** Captured value for value-bearing concepts. */
    value?: string;
}

/** Evidence range in the exact accepted UTF-8 document bytes. */
export interface ContentEvidenceSpan {
    /** Zero-based inclusive byte offset. @asType integer */
    start: number;
    /** Zero-based exclusive byte offset. @asType integer */
    end: number;
    /** Frozen offset encoding for document evidence. */
    offsetEncoding: 'utf-8-bytes';
    /** Qualified rule that produced the evidence. */
    rule: RuleReference;
    /** Matched source text, present only in the full response profile. */
    matched?: string;
}

/** Joins assertion support to the guide fact that supplied its authority. */
export interface GuideFactReference {
    /** Authority state of the referenced guide fact. */
    kind: GuideFactKind;
    /** Finding or manual-selection identifier. */
    factId: string;
}

/** Authority state of a fact used by guide compilation. */
export type GuideFactKind =
    | 'accepted-finding'
    | 'manual-selection'
    | 'projected-finding';

/** De-duplicated content lineage for one compiled assertion. */
export interface AssertionSupport {
    /** Content-derived stable support identifier. */
    supportId: string;
    /** Assertion supported by the cited facts and rules. */
    assertion: AssertionReference;
    /** Direct and computed rules contributing to the assertion. */
    rules: RuleReference[];
    /** Canonically ordered evidence for the assertion. */
    evidence: ContentEvidenceSpan[];
    /** Human-decision or projected facts supplying the assertion. */
    factReferences: GuideFactReference[];
}
