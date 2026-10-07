/** Attribution for one qualification-only semantic effect. */
export interface QualificationEffectContext {
  /** Stable, caller-generated identity for this effect across replicas. */
  readonly effectId: string;
  /** Acting actor identity, distinct from payload material Origin. */
  readonly actorId: string;
  /** Optional source of a copy or restore, not a Range lineage edge. */
  readonly source?: {
    /** Type of derivation that produced this effect. */
    readonly kind: "copy" | "restore";
    /** Stable source effect or retained historical-state token. */
    readonly reference: string;
  };
}

/** Serialize validated primitives, without invoking caller JSON hooks. */
export function encodeEffectContext(context: QualificationEffectContext): string {
  const effectId = context.effectId;
  const actorId = context.actorId;
  const source = context.source;
  if (typeof effectId !== "string" || effectId.length === 0 ||
      typeof actorId !== "string" || actorId.length === 0)
    throw new TypeError("Qualification actor/effect identity is invalid.");
  const sourceValue = source === undefined ? undefined : {
    kind: source.kind,
    reference: source.reference,
  };
  if (sourceValue !== undefined &&
      (!(sourceValue.kind === "copy" || sourceValue.kind === "restore") ||
       typeof sourceValue.reference !== "string" || sourceValue.reference.length === 0))
    throw new TypeError("Qualification derivation reference is invalid.");
  return JSON.stringify({
    effectId,
    actorId,
    ...(sourceValue === undefined ? {} : { source: sourceValue }),
  });
}

/** Decode a native replicated effect context through the same validation seam. */
export function decodeEffectContext(encoded: string): QualificationEffectContext {
  const parsed: unknown = JSON.parse(encoded);
  if (typeof parsed !== "object" || parsed === null ||
      !("effectId" in parsed) || !("actorId" in parsed))
    throw new TypeError("Replicated qualification effect context is invalid.");
  const candidate = parsed as { readonly effectId: unknown; readonly actorId: unknown; readonly source?: unknown };
  const source = candidate.source;
  if (source !== undefined &&
      (typeof source !== "object" || source === null ||
       !("kind" in source) || !("reference" in source)))
    throw new TypeError("Replicated qualification derivation is invalid.");
  const normalized: QualificationEffectContext = {
    effectId: candidate.effectId as string,
    actorId: candidate.actorId as string,
    ...(source === undefined ? {} : {
      source: {
        kind: (source as {kind: "copy" | "restore"}).kind,
        reference: (source as {reference: string}).reference,
      },
    }),
  };
  return JSON.parse(encodeEffectContext(normalized)) as QualificationEffectContext;
}
