import type { BlockId } from "../../../src/domain/index.js";
import type { StructuralPositionCodec } from "../../../src/carrier/index.js";
import { captureHistoricalState } from "./historicalState.js";
import type {
  IntegratedDocumentSnapshot,
  IntegratedInlineContentCreation,
} from "./carrier.js";

/**
 * Encode the immutable semantic envelope reserved by one contextual change.
 *
 * @remarks
 * This qualification-only record lets a replica reject reuse of an
 * actor/effect pair before a native merge combines distinct structural and
 * payload state under one attribution identity.
 */
export function encodeAppliedEffectEnvelope(
  authoringNonce: string,
  placements: readonly {
    readonly blockId: BlockId;
    readonly encoded: string;
  }[],
  inlineContents: readonly IntegratedInlineContentCreation[],
  deleteBlockIds: readonly BlockId[],
  payloadEffect: string | undefined,
): string {
  assertAuthoringNonce(authoringNonce);
  return JSON.stringify({
    kind: "apply",
    authoringNonce,
    placements: placements.map(({ blockId, encoded }) => [blockId, encoded]),
    inlineContents: inlineContents.map(({ inlineContentId, blockId }) => [
      inlineContentId,
      blockId,
    ]),
    deleteBlockIds: [...deleteBlockIds].sort(),
    payloadEffect: payloadEffect ?? null,
  });
}

/** Encode a restore's visible target without treating its token as portable. */
export function encodeRestoreEffectEnvelope<Position>(
  authoringNonce: string,
  snapshot: IntegratedDocumentSnapshot<Position>,
  positionCodec: StructuralPositionCodec<Position>,
): string {
  assertAuthoringNonce(authoringNonce);
  return JSON.stringify({
    kind: "restore",
    authoringNonce,
    target: captureHistoricalState(snapshot, positionCodec),
  });
}

function assertAuthoringNonce(value: string): void {
  if (typeof value !== "string" || value.length === 0)
    throw new TypeError("Qualification effect authoring nonce is invalid.");
}
