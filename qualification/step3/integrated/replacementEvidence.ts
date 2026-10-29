import type { InlineContentId } from "../../../src/domain/index.js";
import type { IntegratedPayloadChange } from "./carrier.js";
import { encodeQualificationOrigin } from "../payload/carrier.js";

/** Immutable payload effect retained within each native qualification document. */
export interface RecordedPayloadEffect {
  /** Canonical actor/effect identity retained by the candidate. */
  readonly effectId: string;
  /** Immediate payload-effect frontier observed at authoring time. */
  readonly parents: readonly string[];
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
  /** Immediate payload-effect parents; ancestry requires the retained DAG. */
  readonly parents: readonly string[];
  /** Immutable complete replacement operation. */
  readonly operation: Readonly<
    Record<string, string | number | readonly number[]>
  >;
}

/** Encode validated payload evidence without retaining caller-owned buffers. */
export function encodePayloadEffect(
  effectId: string,
  parents: readonly string[],
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
    parents: [...parents].sort(),
    operations: detached,
  });
}

/** Decode one preserved native effect record for carrier-neutral comparison. */
export function decodePayloadEffect(encoded: string): RecordedPayloadEffect {
  const value = JSON.parse(encoded) as RecordedPayloadEffect;
  if (
    typeof value.effectId !== "string" ||
    !Array.isArray(value.parents) ||
    !Array.isArray(value.operations)
  )
    throw new TypeError("Invalid replicated payload effect evidence.");
  return value;
}

/**
 * Validate the retained payload DAG and derive its maximal observed frontier.
 *
 * @remarks
 * Used on reload and staged merge, not on each local insertion. Missing
 * dependencies, duplicate identities/edges, and cycles reject the candidate.
 * Parent links retain causal reachability without storing transitive closures.
 * This qualification encoding deliberately does not read the former observed
 * closure format; it is not a frozen portable format or product History API.
 */
export function payloadEffectFrontier(
  effects: readonly RecordedPayloadEffect[],
): readonly string[] {
  const remaining = new Map<string, number>();
  const children = new Map<string, string[]>();
  const heads = new Set<string>();
  for (const effect of effects) {
    if (
      typeof effect.effectId !== "string" ||
      effect.effectId.length === 0 ||
      remaining.has(effect.effectId) ||
      !Array.isArray(effect.parents) ||
      effect.parents.some(
        (parent) => typeof parent !== "string" || parent.length === 0,
      ) ||
      new Set(effect.parents).size !== effect.parents.length
    )
      throw new TypeError("Invalid qualification payload causal DAG.");
    remaining.set(effect.effectId, effect.parents.length);
    heads.add(effect.effectId);
  }
  for (const effect of effects) {
    for (const parent of effect.parents) {
      if (!remaining.has(parent))
        throw new TypeError(
          "Qualification payload causal dependency is missing.",
        );
      heads.delete(parent);
      const dependents = children.get(parent) ?? [];
      dependents.push(effect.effectId);
      children.set(parent, dependents);
    }
  }
  const ready = [...remaining]
    .filter(([, count]) => count === 0)
    .map(([id]) => id);
  let visited = 0;
  while (ready.length > 0) {
    const id = ready.pop();
    if (id === undefined) continue;
    visited++;
    for (const child of children.get(id) ?? []) {
      const count = remaining.get(child);
      if (count === undefined)
        throw new TypeError("Invalid qualification payload causal DAG.");
      remaining.set(child, count - 1);
      if (count === 1) ready.push(child);
    }
  }
  if (visited !== effects.length)
    throw new TypeError("Qualification payload causal DAG contains a cycle.");
  return [...heads].sort();
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
  // Traverse once from all replacement parents, including intermediate edits
  // and effects on other payloads. Direct-parent checks alone lose causality.
  payloadEffectFrontier(effects);
  const byId = new Map(effects.map((effect) => [effect.effectId, effect]));
  const observed = new Set<string>();
  const pending = replacements.flatMap((effect) => effect.parents);
  while (pending.length > 0) {
    const id = pending.pop();
    if (id === undefined || observed.has(id)) continue;
    observed.add(id);
    for (const parent of byId.get(id)?.parents ?? []) pending.push(parent);
  }
  return replacements
    .filter((effect) => !observed.has(effect.effectId))
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
              parents: effect.parents,
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
