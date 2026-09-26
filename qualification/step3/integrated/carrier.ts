import type { BlockId, InlineContentId } from "../../../src/domain/index.js";
import type {
  StructuralPlacement,
  StructuralPositionCodec,
  StructuralPositionOrdering,
} from "../../../src/carrier/index.js";
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

/** One all-or-none integrated qualification transaction. */
export interface IntegratedDocumentChange<Position> {
  /** Structural placement replacements in this transaction. */
  readonly placements?: readonly IntegratedPlacementChange<Position>[];
  /** Payload operations in this transaction. */
  readonly payloads?: readonly IntegratedPayloadChange[];
}

/** Detached integrated document projection. */
export interface IntegratedDocumentSnapshot<Position> {
  /** Immutable document root identity. */
  readonly rootId: BlockId;
  /** Current non-root structural placements by Block identity. */
  readonly placements: ReadonlyMap<BlockId, StructuralPlacement<Position>>;
  /** Current detached payload projections by InlineContent identity. */
  readonly payloads: ReadonlyMap<InlineContentId, QualificationPayloadSnapshot>;
}

/** Common Step 3 integrated carrier surface. */
export interface IntegratedDocumentCarrier<Position> {
  /** Candidate implementation name. */
  readonly candidate: IntegratedCarrierCandidate;
  /** Applies one all-or-none integrated transaction. */
  applyChange(change: IntegratedDocumentChange<Position>): void;
  /** Projects detached carrier-neutral state. */
  snapshot(): IntegratedDocumentSnapshot<Position>;
  /** Encodes complete candidate state for reload or merge qualification. */
  encode(): Uint8Array;
  /** Merges complete encoded state from another replica. */
  mergeEncoded(encoded: Uint8Array): void;
}

/** Factory for one integrated candidate and structural position representation. */
export interface IntegratedDocumentCarrierFactory<Position> {
  /** Candidate implementation name. */
  readonly candidate: IntegratedCarrierCandidate;
  /** Creates a fresh integrated document. */
  create(rootId: BlockId): IntegratedDocumentCarrier<Position>;
  /** Reloads complete candidate state. */
  load(encoded: Uint8Array): IntegratedDocumentCarrier<Position>;
  /** Structural position codec used by this integrated fixture. */
  readonly positionCodec: StructuralPositionCodec<Position>;
  /** Structural position ordering used by this integrated fixture. */
  readonly positionOrdering: StructuralPositionOrdering<Position>;
}
