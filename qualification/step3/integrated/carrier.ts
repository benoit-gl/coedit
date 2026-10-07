import type { BlockId, InlineContentId } from "../../../src/domain/index.js";
import type {
  StructuralPlacement,
  StructuralPositionCodec,
  StructuralPositionOrdering,
} from "../../../src/carrier/index.js";
import type { QualificationEffectContext } from "./effectContext.js";
import type { RecordedPayloadEffect } from "./replacementEvidence.js";
import type {
  QualificationOrigin,
  QualificationPayloadSnapshot,
} from "../payload/carrier.js";

/** Candidate names used by integrated Step 3 qualification. */
export type IntegratedCarrierCandidate = "yjs" | "automerge";

/** Complete fine-grained text replacement inside one integrated transaction. */
export interface IntegratedTextReplacement {
  /** Operation discriminator. */
  readonly kind: "replace-text";
  /** InlineContent whose payload changes. */
  readonly inlineContentId: InlineContentId;
  /** Exact allowlisted Media Type spelling. */
  readonly mediaType: string;
  /** Complete replacement native string. */
  readonly text: string;
  /** Origin assigned to replacement material. */
  readonly origin: QualificationOrigin;
}

/** Complete opaque payload replacement inside one integrated transaction. */
export interface IntegratedOpaqueReplacement {
  /** Operation discriminator. */
  readonly kind: "replace-opaque";
  /** InlineContent whose payload changes. */
  readonly inlineContentId: InlineContentId;
  /** Exact non-fine-grained Media Type spelling. */
  readonly mediaType: string;
  /** Complete replacement bytes. */
  readonly bytes: Uint8Array;
  /** Payload-level replacement Origin. */
  readonly origin: QualificationOrigin;
}

/** Fine-grained text insertion inside one integrated transaction. */
export interface IntegratedTextInsertion {
  /** Operation discriminator. */
  readonly kind: "insert-text";
  /** InlineContent whose text changes. */
  readonly inlineContentId: InlineContentId;
  /** Native-string UTF-16 insertion offset. */
  readonly offset: number;
  /** Inserted native string. */
  readonly text: string;
  /** Origin assigned to inserted material. */
  readonly origin: QualificationOrigin;
}

/** Fine-grained text deletion inside one integrated transaction. */
export interface IntegratedTextDeletion {
  /** Operation discriminator. */
  readonly kind: "delete-text";
  /** InlineContent whose text changes. */
  readonly inlineContentId: InlineContentId;
  /** Inclusive native-string UTF-16 start offset. */
  readonly start: number;
  /** Exclusive native-string UTF-16 end offset. */
  readonly end: number;
}

/** One payload mutation inside an integrated document transaction. */
export type IntegratedPayloadChange =
  | IntegratedTextReplacement
  | IntegratedOpaqueReplacement
  | IntegratedTextInsertion
  | IntegratedTextDeletion;

/** One structural mutation inside an integrated document transaction. */
export interface IntegratedPlacementChange<Position> {
  /** Block whose placement changes. */
  readonly blockId: BlockId;
  /** Complete replacement structural placement. */
  readonly placement: StructuralPlacement<Position>;
}

/** Creates one immutable InlineContent-to-Block ownership relationship. */
export interface IntegratedInlineContentCreation {
  /** Newly created InlineContent identity. */
  readonly inlineContentId: InlineContentId;
  /** Live Block that owns the new InlineContent. */
  readonly blockId: BlockId;
}

/** One all-or-none integrated qualification transaction. */
export interface IntegratedDocumentChange<Position> {
  /** Structural placement replacements in this transaction. */
  readonly placements?: readonly IntegratedPlacementChange<Position>[];
  /** InlineContents created against their immutable owning Blocks. */
  readonly inlineContents?: readonly IntegratedInlineContentCreation[];
  /** Payload operations in this transaction. */
  readonly payloads?: readonly IntegratedPayloadChange[];
  /**
   * Blocks whose observed liveness effects this transaction retires.
   *
   * @remarks
   * The list is one atomic application command. Surviving descendants receive
   * their parent from normal projection; this change emits no re-parenting
   * operations.
   */
  readonly deleteBlockIds?: readonly BlockId[];
  /** Optional actor/effect attribution, published with this semantic change. */
  readonly context?: QualificationEffectContext;
}

/** Detached integrated document projection. */
export interface IntegratedDocumentSnapshot<Position> {
  /** Immutable document root identity. */
  readonly rootId: BlockId;
  /** Liveness by known Block identity, including the immutable root. */
  readonly blockLiveness: ReadonlyMap<BlockId, boolean>;
  /** Current non-root structural placements by Block identity. */
  readonly placements: ReadonlyMap<BlockId, StructuralPlacement<Position>>;
  /** Owning Block for each visible InlineContent payload. */
  readonly inlineContentOwners: ReadonlyMap<InlineContentId, BlockId>;
  /** Current detached payload projections by InlineContent identity. */
  readonly payloads: ReadonlyMap<InlineContentId, QualificationPayloadSnapshot>;
}

/** Common Step 3 integrated carrier surface. */
export interface IntegratedDocumentCarrier<Position> {
  /** Candidate implementation name. */
  readonly candidate: IntegratedCarrierCandidate;
  /** Applies one all-or-none integrated transaction. */
  applyChange(change: IntegratedDocumentChange<Position>): void;
  /** Retains a detached qualification state and returns its opaque local token. */
  captureHistoricalState(): string;
  /** Materializes one retained qualification state without changing the tip. */
  materializeHistoricalState(
    token: string,
  ): IntegratedDocumentSnapshot<Position>;
  /** Restores one retained state as one carrier change, preserving entity identities. */
  restoreHistoricalState(
    token: string,
    context?: QualificationEffectContext,
  ): void;
  /** Detached, replicated semantic-effect context (not product Contributions). */
  effects(): ReadonlyMap<string, QualificationEffectContext>;
  /** Immutable candidate-native payload effect evidence for Gate B alternatives. */
  recordedPayloadEffects(): readonly RecordedPayloadEffect[];
  /** Projects detached carrier-neutral state. */
  snapshot(): IntegratedDocumentSnapshot<Position>;
  /** Encodes complete candidate state for reload or merge qualification. */
  encode(): Uint8Array;
  /**
   * Merges complete encoded state from another replica.
   *
   * @remarks
   * Both replicas must descend from the same encoded native genesis. Matching
   * root identity alone does not establish candidate merge compatibility.
   */
  mergeEncoded(encoded: Uint8Array): void;
}

/** Factory for one integrated candidate and structural position representation. */
export interface IntegratedDocumentCarrierFactory<Position> {
  /** Candidate implementation name. */
  readonly candidate: IntegratedCarrierCandidate;
  /** Creates a fresh integrated document and native replica lineage. */
  create(rootId: BlockId): IntegratedDocumentCarrier<Position>;
  /** Reloads candidate state; branch replicas by loading the same encoded state. */
  load(encoded: Uint8Array): IntegratedDocumentCarrier<Position>;
  /** Structural position codec used by this integrated fixture. */
  readonly positionCodec: StructuralPositionCodec<Position>;
  /** Structural position ordering used by this integrated fixture. */
  readonly positionOrdering: StructuralPositionOrdering<Position>;
}
