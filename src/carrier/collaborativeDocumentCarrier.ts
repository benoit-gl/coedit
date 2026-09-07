import type { InlineContentValue } from "../domain/content.js";
import type {
  BlockId,
  ContributionId,
  InlineContentId,
} from "../domain/ids.js";
import type { ContentCarrierOperation } from "./contentCarrier.js";
import type {
  StructuralCarrierChange,
  StructuralCarrierSnapshot,
} from "./structuralCarrier.js";

/** One new InlineContent published inside the logical collaborative document. */
export interface InlineContentInitialization {
  /** Durable identity for the new InlineContent. */
  readonly inlineContentId: InlineContentId;
  /** Complete validated canonical CollaborativeContent initial value. */
  readonly content: InlineContentValue;
}

/** One ordered mutation batch against an existing or same-change initialized InlineContent. */
export interface InlineContentMutation {
  /** Durable InlineContent identity to mutate. */
  readonly inlineContentId: InlineContentId;
  /** Ordered candidate-runtime operations applied atomically with the logical document change. */
  readonly operations: readonly ContentCarrierOperation[];
}

/** Opaque Contribution metadata stored at the same atomic publication boundary. */
export interface CarrierContributionMetadata {
  /** Durable Contribution identity. */
  readonly contributionId: ContributionId;
  /** Carrier-neutral serialized metadata owned by the engine qualification layer. */
  readonly metadata: string;
}

/** One atomic change against the complete logical collaborative document. */
export interface CollaborativeDocumentCarrierChange<Position> {
  /** Structural effects for this logical change. */
  readonly structural?: StructuralCarrierChange<Position>;
  /** New InlineContents whose canonical attributed content publishes with the change. */
  readonly inlineContents?: readonly InlineContentInitialization[];
  /** Ordered mutations to actual InlineContents in this same logical carrier document. */
  readonly inlineContentMutations?: readonly InlineContentMutation[];
  /** Contribution metadata that publishes with the same change. */
  readonly contributions?: readonly CarrierContributionMetadata[];
}

/** Detached snapshot of one actual InlineContent namespace. */
export interface InlineContentCarrierSnapshot {
  /** Durable InlineContent identity. */
  readonly inlineContentId: InlineContentId;
  /** Detached canonical CollaborativeContent projection. */
  readonly content: InlineContentValue;
}

/** Detached complete logical collaborative-document snapshot. */
export interface CollaborativeDocumentCarrierSnapshot<Position> {
  /** Flat structural carrier projection state. */
  readonly structural: StructuralCarrierSnapshot<Position>;
  /** All actual InlineContent namespaces in deterministic identity order. */
  readonly inlineContents: readonly InlineContentCarrierSnapshot[];
  /** Opaque Contribution metadata in deterministic Contribution identity order. */
  readonly contributions: readonly CarrierContributionMetadata[];
}

/** Candidate-neutral logical collaborative-document carrier contract. */
export interface CollaborativeDocumentCarrier<Position> {
  /** Candidate name used in qualification output. */
  readonly candidate: "yjs" | "automerge";

  /** Applies one all-or-none structure, content, Origin, and Contribution change. */
  applyChange(change: CollaborativeDocumentCarrierChange<Position>): void;

  /** Projects a detached complete logical-document snapshot. */
  snapshot(): CollaborativeDocumentCarrierSnapshot<Position>;

  /** Projects one detached InlineContent value, or returns undefined when its namespace is unavailable. */
  snapshotInlineContent(
    inlineContentId: InlineContentId,
  ): InlineContentValue | undefined;

  /** Creates one stable cursor inside an InlineContent namespace. */
  createInlineContentCursor(
    inlineContentId: InlineContentId,
    runtimeUtf16Offset: number,
    affinity: "before" | "after",
  ): string;

  /** Resolves one stable cursor inside its expected InlineContent namespace. */
  resolveInlineContentCursor(
    inlineContentId: InlineContentId,
    cursor: string,
  ): number | undefined;

  /** Encodes all replicated state of this one logical collaborative document. */
  encode(): Uint8Array;

  /** Merges complete or incremental state from another replica. */
  mergeEncoded(encoded: Uint8Array): void;
}

/** Factory used by the common logical-document carrier qualification suite. */
export interface CollaborativeDocumentCarrierFactory<Position> {
  /** Candidate name. */
  readonly candidate: CollaborativeDocumentCarrier<Position>["candidate"];

  /** Creates one logical document with one immutable live root. */
  create(rootId: BlockId): CollaborativeDocumentCarrier<Position>;

  /** Reloads one complete logical collaborative document. */
  load(encoded: Uint8Array): CollaborativeDocumentCarrier<Position>;
}
