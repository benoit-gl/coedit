import {
  parseBlockId,
  parseInlineContentId,
} from "../../../src/domain/index.js";
import { localDensePositionAllocator } from "../structure/localDensePosition.js";
import { createYjsIntegratedDocumentCarrierFactory } from "../integrated/yjsIntegratedDocumentCarrier.js";
import type { QualificationWorkCounters } from "../integrated/carrier.js";

const root = parseBlockId("e2000000-0000-4000-8000-000000000001");
const target = parseInlineContentId("e2000000-0000-4000-8000-000000000002");
const human = { id: "benchmark", kind: "human" } as const;
const other = { id: "other", kind: "imported" } as const;
/** Yjs text-preflight paths measured by this qualification fixture. */
export type Variant = "native" | "ascii";
function create(variant: Variant, workCounters?: QualificationWorkCounters) {
  return createYjsIntegratedDocumentCarrierFactory(
    localDensePositionAllocator,
    localDensePositionAllocator,
    {
      ordinaryEditVariant: "targeted",
      yjsTextPreflightVariant: variant,
      ...(workCounters ? { workCounters } : {}),
    },
  );
}
function counters(): QualificationWorkCounters {
  return {
    snapshots: 0,
    placementDecodes: 0,
    payloads: {},
    textUnits: {},
    textSpans: {},
    opaqueBytes: {},
    livenessTokens: {},
    temporaryTextUnits: {},
  };
}
function canonical(value: unknown): string {
  return JSON.stringify(value, (_key, v: unknown) =>
    v instanceof Map ? [...v.entries()] : v instanceof Uint8Array ? [...v] : v,
  );
}
/** Fixture dimensions for the Yjs text-preflight comparison. */
export type Profile = {
  /** Stable shape label. */
  name: string;
  /** Target length in UTF-16 units. */
  length: number;
  /** Number of alternating-Origin replacements used to seed fragmentation. */
  fragments: number;
  /** Number of insert-and-delete history batches. */
  history: number;
};
/** Single ordered transition timings for one variant. */
export type Transitions = {
  /** Loading duration in milliseconds. */
  loadMs: number;
  /** Merge duration in milliseconds. */
  mergeMs: number;
  /** First attributed edit after merge, in milliseconds. */
  afterMergeMs: number;
  /** Restore duration in milliseconds. */
  restoreMs: number;
  /** First attributed edit after restore, in milliseconds. */
  afterRestoreMs: number;
  /** Replacement duration in milliseconds. */
  replacementMs: number;
  /** First attributed edit after replacement, in milliseconds. */
  afterReplacementMs: number;
};
/** Same-genesis Yjs preflight measurements; all timings are exploratory. */
export function runYjsTextPreflightComparison(samples = 3): {
  /** Recorded fixture shapes. */
  profiles: Profile[];
  /** Raw samples and work observations for each shape. */
  rows: {
    /** Fixture shape. */
    profile: Profile;
    /** Number of timed edit samples per variant. */
    samples: number;
    /** Raw attributed edit durations in milliseconds. */
    measured: Record<Variant, number[]>;
    /** Input units to native temporary preflight in the separate counted pass. */
    temporaryTextUnits: Record<Variant, number>;
    /** One ordered transition timing per variant. */
    transitions: Record<Variant, Transitions>;
  }[];
  /** Restrictions on interpreting these observations. */
  limitations: string[];
} {
  if (!Number.isSafeInteger(samples) || samples < 1)
    throw new RangeError("Samples must be a positive integer.");
  const profiles = [
    { name: "ascii-256", length: 256, fragments: 0, history: 0 },
    { name: "ascii-4096", length: 4096, fragments: 0, history: 0 },
    { name: "ascii-fragmented", length: 256, fragments: 32, history: 0 },
    { name: "ascii-history", length: 256, fragments: 0, history: 100 },
    { name: "unicode-fallback", length: 256, fragments: 0, history: 0 },
  ];
  const rows = [];
  for (const profile of profiles) {
    const base = create("native").create(root);
    const initialText =
      profile.name === "unicode-fallback"
        ? "😀" + "a".repeat(profile.length - 2)
        : "a".repeat(profile.length);
    base.applyChange({
      inlineContents: [{ inlineContentId: target, blockId: root }],
      payloads: [
        {
          kind: "replace-text",
          inlineContentId: target,
          mediaType: "text/plain",
          text: initialText,
          origin: human,
        },
      ],
    });
    for (let i = 0; i < profile.fragments; i++)
      base.applyChange({
        payloads: [
          {
            kind: "delete-text",
            inlineContentId: target,
            start: i * 2,
            end: i * 2 + 1,
          },
          {
            kind: "insert-text",
            inlineContentId: target,
            offset: i * 2,
            text: "a",
            origin: other,
          },
        ],
      });
    for (let i = 0; i < profile.history; i++)
      base.applyChange({
        payloads: [
          {
            kind: "insert-text",
            inlineContentId: target,
            offset: 0,
            text: "x",
            origin: human,
          },
          { kind: "delete-text", inlineContentId: target, start: 0, end: 1 },
        ],
      });
    const bytes = base.encode();
    const genesisPayload = base.snapshot().payloads.get(target);
    if (
      genesisPayload?.kind !== "text" ||
      genesisPayload.text !== initialText ||
      (profile.fragments &&
        genesisPayload.spans.length !== profile.fragments * 2)
    )
      throw new Error("Preflight comparison genesis mismatch.");
    const measured = { native: [] as number[], ascii: [] as number[] };
    const units = { native: 0, ascii: 0 };
    const firstOutcomes: Partial<Record<Variant, string>> = {};
    for (let sample = 0; sample < samples; sample++) {
      const outputs: string[] = [];
      for (const variant of sample % 2
        ? (["ascii", "native"] as const)
        : (["native", "ascii"] as const)) {
        const c = create(variant).load(bytes);
        const start = performance.now();
        c.applyChange({
          context: { actorId: "bench", effectId: `edit-${sample}` },
          payloads: [
            {
              kind: "insert-text",
              inlineContentId: target,
              offset: 0,
              text: "x",
              origin: other,
            },
            { kind: "delete-text", inlineContentId: target, start: 0, end: 1 },
          ],
        });
        measured[variant].push(performance.now() - start);
        const output = canonical({
          snapshot: c.snapshot(),
          effects: c.effects(),
          evidence: c.recordedPayloadEffects(),
        });
        outputs.push(output);
        if (sample === 0) firstOutcomes[variant] = output;
      }
      if (outputs[0] !== outputs[1])
        throw new Error(`Yjs preflight comparison mismatch: ${profile.name}`);
    }
    // Count separately on equivalent genesis, outside timing.
    for (const variant of ["native", "ascii"] as const) {
      const observed = counters();
      const c = create(variant, observed).load(bytes);
      observed.temporaryTextUnits = {};
      c.applyChange({
        context: { actorId: "bench", effectId: "edit-0" },
        payloads: [
          {
            kind: "insert-text",
            inlineContentId: target,
            offset: 0,
            text: "x",
            origin: other,
          },
          { kind: "delete-text", inlineContentId: target, start: 0, end: 1 },
        ],
      });
      units[variant] = observed.temporaryTextUnits[target] ?? 0;
      if (
        canonical({
          snapshot: c.snapshot(),
          effects: c.effects(),
          evidence: c.recordedPayloadEffects(),
        }) !== firstOutcomes[variant]
      )
        throw new Error(
          `Instrumented preflight outcome mismatch: ${profile.name}`,
        );
    }
    const remote = create("native").load(bytes);
    remote.applyChange({
      context: { actorId: "remote", effectId: "prefix" },
      payloads: [
        {
          kind: "insert-text",
          inlineContentId: target,
          offset: 0,
          text: "R",
          origin: human,
        },
      ],
    });
    const remoteBytes = remote.encode();
    const transitions: Record<
      Variant,
      {
        loadMs: number;
        mergeMs: number;
        afterMergeMs: number;
        restoreMs: number;
        afterRestoreMs: number;
        replacementMs: number;
        afterReplacementMs: number;
      }
    > = {} as never;
    const transitionOutcomes = [];
    for (const variant of ["native", "ascii"] as const) {
      let start = performance.now();
      const c = create(variant).load(bytes);
      const loadMs = performance.now() - start;
      const token = c.captureHistoricalState();
      start = performance.now();
      c.mergeEncoded(remoteBytes);
      const mergeMs = performance.now() - start;
      start = performance.now();
      c.applyChange({
        context: { actorId: "bench", effectId: "after-merge" },
        payloads: [
          {
            kind: "insert-text",
            inlineContentId: target,
            offset: 0,
            text: "x",
            origin: other,
          },
        ],
      });
      const afterMergeMs = performance.now() - start;
      start = performance.now();
      c.restoreHistoricalState(token, {
        actorId: "bench",
        effectId: "restore",
      });
      const restoreMs = performance.now() - start;
      start = performance.now();
      c.applyChange({
        context: { actorId: "bench", effectId: "after-restore" },
        payloads: [
          {
            kind: "insert-text",
            inlineContentId: target,
            offset: 0,
            text: "x",
            origin: other,
          },
        ],
      });
      const afterRestoreMs = performance.now() - start;
      start = performance.now();
      c.applyChange({
        context: { actorId: "bench", effectId: "replacement" },
        payloads: [
          {
            kind: "replace-text",
            inlineContentId: target,
            mediaType: "text/plain",
            text: initialText,
            origin: human,
          },
        ],
      });
      const replacementMs = performance.now() - start;
      start = performance.now();
      c.applyChange({
        context: { actorId: "bench", effectId: "after-replacement" },
        payloads: [
          {
            kind: "insert-text",
            inlineContentId: target,
            offset: 0,
            text: "x",
            origin: other,
          },
        ],
      });
      const afterReplacementMs = performance.now() - start;
      transitions[variant] = {
        loadMs,
        mergeMs,
        afterMergeMs,
        restoreMs,
        afterRestoreMs,
        replacementMs,
        afterReplacementMs,
      };
      transitionOutcomes.push(
        canonical({
          snapshot: c.snapshot(),
          effects: c.effects(),
          evidence: c.recordedPayloadEffects(),
        }),
      );
    }
    if (transitionOutcomes[0] !== transitionOutcomes[1])
      throw new Error(`Yjs transition comparison mismatch: ${profile.name}`);
    rows.push({
      profile,
      samples,
      measured,
      temporaryTextUnits: units,
      transitions,
    });
  }
  return {
    profiles,
    rows,
    limitations: [
      "Same-host exploratory timings exclude counters but include complete target projection and effect preparation; they do not isolate native preflight time.",
      "The ASCII check scans the full target. Non-ASCII input uses the native reference, including Unicode and malformed input.",
      "Fragmented origins and edit history add retained native history; they are not isolated from fragmentation cost.",
      "Transition timings are one ordered sample per variant; they include load/validation or the full attributed operation and are not a distribution.",
      "Edit samples have no explicit warmup; variant order alternates by sample within each profile.",
      "Native Yjs internal traversal is not observed. These samples do not establish product latency, correctness for other implementations, or the normal-typing criterion.",
    ],
  };
}
