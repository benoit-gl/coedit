import type { BlockId, InlineContentId } from "../../../src/domain/index.js";
import { parseBlockId, parseInlineContentId } from "../../../src/domain/index.js";
import type { StructuralPositionCodec } from "../../../src/carrier/index.js";
import {
  decodeStructuralPlacement,
  encodeStructuralPlacement,
} from "../../../src/carrier/index.js";
import type {
  QualificationOrigin,
  QualificationPayloadSnapshot,
  QualificationTextSpan,
} from "../payload/carrier.js";
import type { IntegratedDocumentSnapshot } from "./carrier.js";

interface HistoricalPayload {
  readonly id: string;
  readonly value:
    | {
        readonly kind: "text";
        readonly mediaType: string;
        readonly text: string;
        readonly spans: readonly QualificationTextSpan[];
      }
    | {
        readonly kind: "opaque";
        readonly mediaType: string;
        readonly bytes: readonly number[];
        readonly origin: QualificationOrigin;
      };
}

/** Detached qualification-only material, with no product Version semantics. */
export interface HistoricalState {
  readonly rootId: string;
  readonly blockLiveness: readonly (readonly [string, boolean])[];
  readonly placements: readonly (readonly [string, string])[];
  readonly inlineContentOwners: readonly (readonly [string, string])[];
  readonly payloads: readonly HistoricalPayload[];
}

/** Encodes the complete visible state without retaining caller-owned buffers. */
export function captureHistoricalState<Position>(
  snapshot: IntegratedDocumentSnapshot<Position>,
  codec: StructuralPositionCodec<Position>,
): string {
  const payloads: HistoricalPayload[] = [];
  for (const [id, value] of snapshot.payloads)
    payloads.push({
      id,
      value:
        value.kind === "text"
          ? {
              kind: "text",
              mediaType: value.mediaType,
              text: value.text,
              spans: value.spans,
            }
          : {
              kind: "opaque",
              mediaType: value.mediaType,
              bytes: [...value.bytes],
              origin: value.origin,
            },
    });
  return JSON.stringify({
    rootId: snapshot.rootId,
    blockLiveness: [...snapshot.blockLiveness],
    placements: [...snapshot.placements].map(
      ([id, placement]) =>
        [id, encodeStructuralPlacement(placement, codec)] as const,
    ),
    inlineContentOwners: [...snapshot.inlineContentOwners],
    payloads,
  } satisfies HistoricalState);
}

/** Parses a retained qualification state; the token lookup precedes this call. */
export function decodeHistoricalState<Position>(
  encoded: string,
  codec: StructuralPositionCodec<Position>,
): IntegratedDocumentSnapshot<Position> {
  const state = JSON.parse(encoded) as HistoricalState;
  const payloads = new Map<InlineContentId, QualificationPayloadSnapshot>();
  for (const { id, value } of state.payloads) {
    payloads.set(
      parseInlineContentId(id),
      value.kind === "text"
        ? {
            kind: "text",
            mediaType: value.mediaType,
            text: value.text,
            spans: value.spans,
          }
        : {
            kind: "opaque",
            mediaType: value.mediaType,
            bytes: Uint8Array.from(value.bytes),
            origin: value.origin,
          },
    );
  }
  return {
    rootId: parseBlockId(state.rootId),
    blockLiveness: new Map(
      state.blockLiveness.map(([id, live]) => [parseBlockId(id), live]),
    ),
    placements: new Map(
      state.placements.map(([id, value]) => [
        parseBlockId(id),
        decodeStructuralPlacement(value, codec),
      ]),
    ),
    inlineContentOwners: new Map(
      state.inlineContentOwners.map(([id, owner]) => [
        parseInlineContentId(id),
        parseBlockId(owner),
      ]),
    ),
    payloads,
  };
}
