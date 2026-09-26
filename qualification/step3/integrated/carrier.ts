import type { BlockId, InlineContentId } from "../../../src/domain/index.js";
import type {
  StructuralPlacement,
  StructuralPositionCodec,
  StructuralPositionOrdering,
} from "../../../src/carrier/index.js";
import type { QualificationOrigin, QualificationPayloadSnapshot } from "../payload/carrier.js";

/** Candidate names used by integrated Step 3 qualification. */
export type IntegratedCarrierCandidate = "yjs" | "automerge";

/** One payload mutation inside an integrated document transaction. */
export type IntegratedPayloadChange =
  | { readonly kind: "replace-text"; readonly inlineContentId: InlineContentId; readonly mediaType: string; readonly text: string; readonly origin: QualificationOrigin }
  | { readonly kind: "replace-opaque"; readonly inlineContentId: InlineContentId; readonly mediaType: string; readonly bytes: Uint8Array; readonly origin: QualificationOrigin }
  | { readonly kind: "insert-text"; readonly inlineContentId: InlineContentId; readonly offset: number; readonly text: string; readonly origin: QualificationOrigin }
  | { readonly kind: "delete-text"; readonly inlineContentId: InlineContentId; readonly start: number; readonly end: number };

/** One structural mutation inside an integrated document transaction. */
export interface IntegratedPlacementChange<Position> {
  readonly blockId: BlockId;
  readonly placement: StructuralPlacement<Position>;
}

/** One all-or-none integrated qualification transaction. */
export interface IntegratedDocumentChange<Position> {
  readonly placements?: readonly IntegratedPlacementChange<Position>[];
  readonly payloads?: readonly IntegratedPayloadChange[];
}

/** Detached integrated document projection. */
export interface IntegratedDocumentSnapshot<Position> {
  readonly rootId: BlockId;
  readonly placements: ReadonlyMap<BlockId, StructuralPlacement<Position>>;
  readonly payloads: ReadonlyMap<InlineContentId, QualificationPayloadSnapshot>;
}

/** Common Step 3 integrated carrier surface. */
export interface IntegratedDocumentCarrier<Position> {
  readonly candidate: IntegratedCarrierCandidate;
  applyChange(change: IntegratedDocumentChange<Position>): void;
  snapshot(): IntegratedDocumentSnapshot<Position>;
  encode(): Uint8Array;
  mergeEncoded(encoded: Uint8Array): void;
}

/** Factory for one integrated candidate and structural position representation. */
export interface IntegratedDocumentCarrierFactory<Position> {
  readonly candidate: IntegratedCarrierCandidate;
  create(rootId: BlockId): IntegratedDocumentCarrier<Position>;
  load(encoded: Uint8Array): IntegratedDocumentCarrier<Position>;
  readonly positionCodec: StructuralPositionCodec<Position>;
  readonly positionOrdering: StructuralPositionOrdering<Position>;
}
