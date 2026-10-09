import type { InlineContentId } from "../../../src/domain/index.js";
import type { IntegratedPayloadChange } from "./carrier.js";
import { encodeQualificationOrigin } from "../payload/carrier.js";

/** Immutable payload effect retained within each native qualification document. */
export interface RecordedPayloadEffect {
  /** Canonical actor/effect identity retained by the candidate. */
  readonly effectId: string;
  /** All payload-effect identities observed at authoring time. */
  readonly observed: readonly string[];
  /** Detached payload changes, including otherwise losing replacements and edits. */
  readonly operations: readonly Record<
    string,
    string | number | readonly number[]
  >[];
}

/** One retained whole-payload alternative, without selecting it as the winner. */
export interface RecordedReplacementAlternative {
  /** Effect that carried the complete replacement. */
  readonly effectId: string;
  /** Effects observed when this replacement was authored. */
  readonly observed: readonly string[];
  /** Immutable complete replacement operation. */
  readonly operation: Readonly<
    Record<string, string | number | readonly number[]>
  >;
}

/** Encode validated payload evidence without retaining caller-owned buffers. */
export function encodePayloadEffect(
  effectId: string,
  observed: readonly string[],
  operations: readonly IntegratedPayloadChange[],
  replacementBases: readonly (string | undefined)[],
): string {
  if (replacementBases.length !== operations.length)
    throw new TypeError("Payload-effect bases do not align with operations.");
  const detached = operations.map((operation, index) => {
    if (operation.kind === "replace-opaque")
      return {
        kind: operation.kind,
        inlineContentId: operation.inlineContentId,
        mediaType: operation.mediaType,
        bytes: [...operation.bytes],
        origin: encodeQualificationOrigin(operation.origin),
      };
    if (operation.kind === "replace-text")
      return {
        kind: operation.kind,
        inlineContentId: operation.inlineContentId,
        mediaType: operation.mediaType,
        text: operation.text,
        origin: encodeQualificationOrigin(operation.origin),
      };
    if (operation.kind === "insert-text")
      return {
        kind: operation.kind,
        inlineContentId: operation.inlineContentId,
        offset: operation.offset,
        text: operation.text,
        origin: encodeQualificationOrigin(operation.origin),
        ...baseReplacementEffect(replacementBases[index]),
      };
    return {
      kind: operation.kind,
      inlineContentId: operation.inlineContentId,
      start: operation.start,
      end: operation.end,
      ...baseReplacementEffect(replacementBases[index]),
    };
  });
  return JSON.stringify({
    effectId,
    observed: [...observed].sort(),
    operations: detached,
  });
}

/** Decode one preserved native effect record for carrier-neutral comparison. */
export function decodePayloadEffect(encoded: string): RecordedPayloadEffect {
  const value = JSON.parse(encoded) as RecordedPayloadEffect;
  if (
    typeof value.effectId !== "string" ||
    !Array.isArray(value.observed) ||
    !Array.isArray(value.operations)
  )
    throw new TypeError("Invalid replicated payload effect evidence.");
  return value;
}

/** Competing deterministic whole-replacement precedence probes; Gate B selects. */
export function replacementFrontier(
  effects: readonly RecordedPayloadEffect[],
  inlineContentId: InlineContentId,
): readonly string[] {
  const replacements = effects.filter((effect) =>
    effect.operations.some(
      (operation) =>
        operation.inlineContentId === inlineContentId &&
        (operation.kind === "replace-text" ||
          operation.kind === "replace-opaque"),
    ),
  );
  return replacements
    .filter(
      (effect) =>
        !replacements.some(
          (other) =>
            other.effectId !== effect.effectId &&
            other.observed.includes(effect.effectId),
        ),
    )
    .map((effect) => effect.effectId)
    .sort();
}

/**
 * Returns the complete retained replacement values at the causal frontier.
 *
 * @remarks
 * Callers can compare these alternatives without adopting a winner rule. The
 * returned records include exact Media Type, payload material, and Origin.
 */
export function replacementAlternatives(
  effects: readonly RecordedPayloadEffect[],
  inlineContentId: InlineContentId,
): readonly RecordedReplacementAlternative[] {
  const frontier = new Set(replacementFrontier(effects, inlineContentId));
  return effects
    .filter((effect) => frontier.has(effect.effectId))
    .flatMap((effect) => {
      const operation = [...effect.operations]
        .reverse()
        .find(
          (candidate) =>
            candidate.inlineContentId === inlineContentId &&
            (candidate.kind === "replace-text" ||
              candidate.kind === "replace-opaque"),
        );
      return operation === undefined
        ? []
        : [
            {
              effectId: effect.effectId,
              observed: effect.observed,
              operation,
            },
          ];
    })
    .sort((left, right) => left.effectId.localeCompare(right.effectId));
}

/**
 * Derive fine-edit branch bases from candidate-native replacement state.
 *
 * @remarks
 * This is intentionally not caller input. A replacement in the same atomic
 * effect becomes the branch for later operations in that effect; an ordinary
 * text edit inherits the branch held by its native payload before the change.
 */
export function derivePayloadEffectBases(
  operations: readonly IntegratedPayloadChange[],
  effectId: string,
  replacementBranch: (inlineContentId: InlineContentId) => string | undefined,
): readonly (string | undefined)[] {
  const branches = new Map<InlineContentId, string | undefined>();
  const current = (inlineContentId: InlineContentId): string | undefined => {
    if (!branches.has(inlineContentId))
      branches.set(inlineContentId, replacementBranch(inlineContentId));
    return branches.get(inlineContentId);
  };
  return operations.map((operation) => {
    if (
      operation.kind === "replace-text" ||
      operation.kind === "replace-opaque"
    ) {
      branches.set(operation.inlineContentId, effectId);
      return undefined;
    }
    return current(operation.inlineContentId);
  });
}

/** Compare both stable observable winner alternatives without selecting one. */
export function replacementWinnerAlternatives(
  effects: readonly RecordedPayloadEffect[],
  inlineContentId: InlineContentId,
): {
  /** Lexically lowest concurrent replacement effect identity. */
  readonly lowest: string | undefined;
  /** Lexically highest concurrent replacement effect identity. */
  readonly highest: string | undefined;
} {
  const frontier = replacementFrontier(effects, inlineContentId);
  return { lowest: frontier[0], highest: frontier[frontier.length - 1] };
}

/**
 * Find edits whose fixture-recorded base differs from one winner alternative.
 *
 * @remarks
 * Causal observation alone does not identify the payload branch that supplied
 * a fine-grained edit. Only an explicit retained base association can support
 * this deferred mixed-policy comparison.
 */
export function editsNotBasedOnWinner(
  effects: readonly RecordedPayloadEffect[],
  inlineContentId: InlineContentId,
  winnerId: string,
): readonly string[] {
  return effects
    .filter((effect) =>
      effect.operations.some(
        (operation) =>
          operation.inlineContentId === inlineContentId &&
          (operation.kind === "insert-text" ||
            operation.kind === "delete-text") &&
          operation.baseReplacementEffectId !== undefined &&
          operation.baseReplacementEffectId !== winnerId,
      ),
    )
    .map((effect) => effect.effectId)
    .sort();
}

function baseReplacementEffect(
  baseReplacementEffectId: string | undefined,
): Readonly<Record<string, string>> {
  if (baseReplacementEffectId === undefined) return {};
  if (
    typeof baseReplacementEffectId !== "string" ||
    baseReplacementEffectId.length === 0
  )
    throw new TypeError("Payload-effect base replacement identity is invalid.");
  return { baseReplacementEffectId };
}
