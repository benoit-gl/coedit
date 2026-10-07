import type { InlineContentId } from "../../../src/domain/index.js";
import type { IntegratedPayloadChange } from "./carrier.js";
import { encodeQualificationOrigin } from "../payload/carrier.js";

/** Immutable payload effect retained within each native qualification document. */
export interface RecordedPayloadEffect {
  /** Stable actor-independent effect identity. */
  readonly effectId: string;
  /** All payload-effect identities observed at authoring time. */
  readonly observed: readonly string[];
  /** Detached payload changes, including otherwise losing replacements and edits. */
  readonly operations: readonly Record<string, string | number | readonly number[]>[];
}

/** Encode validated payload evidence without retaining caller-owned buffers. */
export function encodePayloadEffect(
  effectId: string,
  observed: readonly string[],
  operations: readonly IntegratedPayloadChange[],
): string {
  const detached = operations.map((operation) => {
    if (operation.kind === "replace-opaque")
      return {kind: operation.kind, inlineContentId: operation.inlineContentId,
        mediaType: operation.mediaType, bytes: [...operation.bytes],
        origin: encodeQualificationOrigin(operation.origin)};
    if (operation.kind === "replace-text")
      return {kind: operation.kind, inlineContentId: operation.inlineContentId,
        mediaType: operation.mediaType, text: operation.text,
        origin: encodeQualificationOrigin(operation.origin)};
    if (operation.kind === "insert-text")
      return {kind: operation.kind, inlineContentId: operation.inlineContentId,
        offset: operation.offset, text: operation.text,
        origin: encodeQualificationOrigin(operation.origin)};
    return {kind: operation.kind, inlineContentId: operation.inlineContentId,
      start: operation.start, end: operation.end};
  });
  return JSON.stringify({effectId, observed: [...observed].sort(), operations: detached});
}

/** Decode one preserved native effect record for carrier-neutral comparison. */
export function decodePayloadEffect(encoded: string): RecordedPayloadEffect {
  const value = JSON.parse(encoded) as RecordedPayloadEffect;
  if (typeof value.effectId !== "string" || !Array.isArray(value.observed) ||
      !Array.isArray(value.operations))
    throw new TypeError("Invalid replicated payload effect evidence.");
  return value;
}

/** Competing deterministic whole-replacement precedence probes; Gate B selects. */
export function replacementFrontier(
  effects: readonly RecordedPayloadEffect[],
  inlineContentId: InlineContentId,
): readonly string[] {
  const replacements = effects.filter((effect) =>
    effect.operations.some((operation) =>
      operation.inlineContentId === inlineContentId &&
      (operation.kind === "replace-text" || operation.kind === "replace-opaque")));
  return replacements
    .filter((effect) => !replacements.some((other) =>
      other.effectId !== effect.effectId && other.observed.includes(effect.effectId)))
    .map((effect) => effect.effectId).sort();
}

/** Compare both stable observable winner alternatives without selecting one. */
export function replacementWinnerAlternatives(
  effects: readonly RecordedPayloadEffect[],
  inlineContentId: InlineContentId,
): {readonly lowest: string | undefined; readonly highest: string | undefined} {
  const frontier = replacementFrontier(effects, inlineContentId);
  return {lowest: frontier[0], highest: frontier[frontier.length - 1]};
}

/** Find losing-branch edits retained for later mixed-policy comparison. */
export function editsNotBasedOnWinner(
  effects: readonly RecordedPayloadEffect[],
  inlineContentId: InlineContentId,
  winnerId: string,
): readonly string[] {
  return effects.filter((effect) =>
    !effect.observed.includes(winnerId) && effect.effectId !== winnerId &&
    effect.operations.some((operation) =>
      operation.inlineContentId === inlineContentId &&
      (operation.kind === "insert-text" || operation.kind === "delete-text")))
    .map((effect) => effect.effectId).sort();
}
