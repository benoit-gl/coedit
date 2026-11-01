import {
  parseBlockId,
  parseInlineContentId,
} from "../../../src/domain/index.js";
import { createAutomergeIntegratedDocumentCarrierFactory } from "../integrated/automergeIntegratedDocumentCarrier.js";
import { createYjsIntegratedDocumentCarrierFactory } from "../integrated/yjsIntegratedDocumentCarrier.js";
import { localDensePositionAllocator } from "../structure/localDensePosition.js";
import type {
  IntegratedDocumentCarrierFactory,
  QualificationWorkCounters,
} from "../integrated/carrier.js";
import { readEditorText } from "../editor/semanticText.js";
import type { LocalDensePosition } from "../structure/localDensePosition.js";

type Variant = "snapshot" | "targeted";
/** One diagnostic document shape. */
export interface SnapshotComparisonProfile {
  /** Stable fixture label. */
  name: string;
  /** Target text size in UTF-16 units. */
  targetLength: number;
  /** Count of unrelated text payloads. */
  unrelatedCount: number;
  /** Size of each unrelated text payload. */
  unrelatedLength: number;
  /** Count of unrelated opaque payloads. */
  opaqueCount: number;
  /** Size in bytes of each unrelated opaque payload. */
  opaqueLength: number;
  /** Count of live non-root Block placements. */
  blockCount: number;
  /** Number of real alternating edits applied to the target before measurement. */
  historyEdits: number;
  /** Approximate Origin span count in an unrelated payload. */
  spans: number;
  /** Expected number of Origin spans in the target, if specified. */
  targetSpans?: number;
}
type Profile = SnapshotComparisonProfile;

/** Result of a same-host diagnostic run. */
export interface SnapshotComparisonResult {
  /** Number of recorded samples per case. */
  samples: number;
  /** Number of edits in each steady sample. */
  iterations: number;
  /** Number of unmeasured warmup edits. */
  warmup: number;
  /** Document shapes tested by the run. */
  profiles: SnapshotComparisonProfile[];
  /** Candidate and variant observations, including raw samples. */
  rows: unknown[];
  /** Limits on interpreting the observations. */
  limitations: string[];
}
const uuid = (n: number) =>
  `70000000-0000-4000-8000-${n.toString(16).padStart(12, "0")}`;
const root = parseBlockId(uuid(1));
const target = parseInlineContentId(uuid(2));
const origin = { id: "benchmark", kind: "human" } as const;
const profiles: Profile[] = [
  {
    name: "baseline",
    targetLength: 256,
    unrelatedCount: 0,
    unrelatedLength: 256,
    opaqueCount: 0,
    opaqueLength: 0,
    blockCount: 0,
    historyEdits: 0,
    spans: 1,
  },
  ...[20, 100].map((count) => ({
    name: `blocks-only-${count}`,
    targetLength: 256,
    unrelatedCount: 0,
    unrelatedLength: 256,
    opaqueCount: 0,
    opaqueLength: 0,
    blockCount: count,
    historyEdits: 0,
    spans: 1,
  })),
  ...[100, 500].map((count) => ({
    name: `target-history-${count}`,
    targetLength: 256,
    unrelatedCount: 0,
    unrelatedLength: 256,
    opaqueCount: 0,
    opaqueLength: 0,
    blockCount: 0,
    historyEdits: count,
    spans: 1,
  })),
  {
    name: "unrelated-count-20",
    targetLength: 256,
    unrelatedCount: 20,
    unrelatedLength: 256,
    opaqueCount: 0,
    opaqueLength: 0,
    blockCount: 0,
    historyEdits: 0,
    spans: 1,
  },
  {
    name: "live-blocks-20",
    targetLength: 256,
    unrelatedCount: 20,
    unrelatedLength: 256,
    opaqueCount: 0,
    opaqueLength: 0,
    blockCount: 20,
    historyEdits: 0,
    spans: 1,
  },
  {
    name: "unrelated-count-100",
    targetLength: 256,
    unrelatedCount: 100,
    unrelatedLength: 256,
    opaqueCount: 0,
    opaqueLength: 0,
    blockCount: 0,
    historyEdits: 0,
    spans: 1,
  },
  {
    name: "unrelated-length-4096",
    targetLength: 256,
    unrelatedCount: 20,
    unrelatedLength: 4096,
    opaqueCount: 0,
    opaqueLength: 0,
    blockCount: 0,
    historyEdits: 0,
    spans: 1,
  },
  {
    name: "target-length-4096",
    targetLength: 4096,
    unrelatedCount: 0,
    unrelatedLength: 256,
    opaqueCount: 0,
    opaqueLength: 0,
    blockCount: 0,
    historyEdits: 0,
    spans: 1,
  },
  {
    name: "opaque-20x256",
    targetLength: 256,
    unrelatedCount: 0,
    unrelatedLength: 0,
    opaqueCount: 20,
    opaqueLength: 256,
    blockCount: 0,
    historyEdits: 0,
    spans: 1,
  },
  {
    name: "opaque-1x4096",
    targetLength: 256,
    unrelatedCount: 0,
    unrelatedLength: 0,
    opaqueCount: 1,
    opaqueLength: 4096,
    blockCount: 0,
    historyEdits: 0,
    spans: 1,
  },
  {
    name: "opaque-20x4096",
    targetLength: 256,
    unrelatedCount: 0,
    unrelatedLength: 0,
    opaqueCount: 20,
    opaqueLength: 4096,
    blockCount: 0,
    historyEdits: 0,
    spans: 1,
  },
  {
    name: "origin-spans-32",
    targetLength: 256,
    unrelatedCount: 20,
    unrelatedLength: 256,
    opaqueCount: 0,
    opaqueLength: 0,
    blockCount: 0,
    historyEdits: 0,
    spans: 32,
  },
  {
    name: "target-origin-spans-64",
    targetLength: 256,
    unrelatedCount: 0,
    unrelatedLength: 256,
    opaqueCount: 0,
    opaqueLength: 0,
    blockCount: 0,
    historyEdits: 0,
    spans: 1,
    targetSpans: 64,
  },
];

function factory(
  candidate: "yjs" | "automerge",
  variant: Variant,
  counters?: QualificationWorkCounters,
  editorVariant: Variant = "snapshot",
  pureDecoder = true,
): IntegratedDocumentCarrierFactory<LocalDensePosition> {
  const create =
    candidate === "yjs"
      ? createYjsIntegratedDocumentCarrierFactory
      : createAutomergeIntegratedDocumentCarrierFactory;
  return create(localDensePositionAllocator, localDensePositionAllocator, {
    ordinaryEditVariant: variant,
    editorProjectionVariant: editorVariant,
    ...(counters ? { workCounters: counters } : {}),
    purePositionDecoder: pureDecoder,
  });
}
function seed(
  f: IntegratedDocumentCarrierFactory<LocalDensePosition>,
  p: Profile,
): Uint8Array {
  const c = f.create(root);
  const inlineContents = [{ inlineContentId: target, blockId: root }];
  const payloads: Parameters<typeof c.applyChange>[0]["payloads"] extends
    readonly (infer T)[] | undefined
    ? T[]
    : never = [
    {
      kind: "replace-text",
      inlineContentId: target,
      mediaType: "text/plain",
      text: "a".repeat(p.targetLength),
      origin,
    },
  ];
  for (let i = 0; i < p.unrelatedCount; i++) {
    const id = parseInlineContentId(uuid(100 + i));
    inlineContents.push({ inlineContentId: id, blockId: root });
    payloads.push({
      kind: "replace-text",
      inlineContentId: id,
      mediaType: "text/plain",
      text: "b".repeat(p.unrelatedLength),
      origin,
    });
  }
  for (let i = 0; i < p.opaqueCount; i++) {
    const id = parseInlineContentId(uuid(10000 + i));
    inlineContents.push({ inlineContentId: id, blockId: root });
    payloads.push({
      kind: "replace-opaque",
      inlineContentId: id,
      mediaType: "application/example",
      bytes: new Uint8Array(p.opaqueLength),
      origin,
    });
  }
  const placements: NonNullable<
    Parameters<typeof c.applyChange>[0]["placements"]
  >[number][] = [];
  if (p.blockCount > 0) {
    const allocated = localDensePositionAllocator.allocateRun({
      count: p.blockCount,
      context: { runNonce: uuid(90000) },
    });
    if (!allocated.ok || allocated.value.length !== p.blockCount)
      throw new Error("Block position allocation failed");
    for (let i = 0; i < p.blockCount; i++) {
      const position = allocated.value[i];
      if (!position) throw new Error("Block position missing");
      placements.push({
        blockId: parseBlockId(uuid(20000 + i)),
        placement: { position, depth: 1 },
      });
    }
  }
  c.applyChange({ placements, inlineContents, payloads });
  // Replace alternating target characters without changing its length or text.
  // Each replacement leaves a distinct Origin between original spans.
  for (let i = 0; i < (p.targetSpans ?? 0) / 2; i++)
    c.applyChange({
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
          origin: { id: `target-author-${i}`, kind: "human" },
        },
      ],
    });
  if (p.targetSpans) {
    const targetPayload = c.snapshot().payloads.get(target);
    if (
      targetPayload?.kind !== "text" ||
      targetPayload.text !== "a".repeat(p.targetLength) ||
      targetPayload.spans.length !== p.targetSpans
    )
      throw new Error("Target Origin fragmentation setup failed");
  }
  // Alternate provenance in one unrelated payload; text length increases by spans-1.
  if (p.unrelatedCount > 0)
    for (let i = 1; i < p.spans; i++)
      c.applyChange({
        payloads: [
          {
            kind: "insert-text",
            inlineContentId: parseInlineContentId(uuid(100)),
            offset: i * 2,
            text: "z",
            origin: { id: `author-${i}`, kind: "human" },
          },
        ],
      });
  // Real alternating edits retain liveness tokens while returning to the same text.
  // Native carrier history grows too; the workload does not isolate token costs.
  for (let i = 0; i < p.historyEdits; i++)
    c.applyChange({
      payloads: [
        i % 2 === 0
          ? {
              kind: "insert-text",
              inlineContentId: target,
              offset: 1,
              text: "x",
              origin,
            }
          : { kind: "delete-text", inlineContentId: target, start: 1, end: 2 },
      ],
    });
  return c.encode();
}
function canonical(value: unknown): string {
  return JSON.stringify(value, (_key, v: unknown) =>
    v instanceof Map ? [...v.entries()] : v instanceof Uint8Array ? [...v] : v,
  );
}
function percentile(values: number[], p: number): number {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.ceil(sorted.length * p) - 1] ?? 0;
}
function summary(values: number[]) {
  return {
    medianMs: percentile(values, 0.5),
    p95Ms: percentile(values, 0.95),
    maxMs: Math.max(...values),
  };
}

/** Run from the standalone Vite SSR loader, not from browser feedback tests. */
export function runSnapshotComparison(
  samples = 8,
  iterations = 10,
  warmup = 10,
): SnapshotComparisonResult {
  if (
    ![samples, iterations, warmup].every(
      (n) => Number.isSafeInteger(n) && n > 0,
    ) ||
    iterations % 2 !== 0 ||
    warmup % 2 !== 0
  )
    throw new RangeError(
      "Samples must be positive; iterations and warmup must be positive even integers.",
    );
  const rows: unknown[] = [];
  for (const candidate of ["yjs", "automerge"] as const)
    for (const p of profiles) {
      const encoded = seed(factory(candidate, "snapshot"), p);
      const variants = ["snapshot", "targeted"] as const;
      const carriers = Object.fromEntries(
        variants.map((variant) => [
          variant,
          factory(candidate, variant).load(encoded),
        ]),
      ) as Record<
        Variant,
        ReturnType<IntegratedDocumentCarrierFactory<LocalDensePosition>["load"]>
      >;
      // Counters are captured in an untimed pass on the same genesis. Timing
      // uses separate uninstrumented instances so counter cost is excluded.
      const editorWork = {} as Record<Variant, unknown>;
      const diagnosticContext = (effectId: string) => ({
        actorId: "editor-diagnostic",
        effectId,
      });
      const editorProjections: string[] = [];
      const transitionProjections: Record<string, string[]> = {
        merge: [],
        restore: [],
        replace: [],
      };
      const remoteForWork = factory(candidate, "snapshot").load(encoded);
      remoteForWork.applyChange({
        context: diagnosticContext("remote"),
        payloads: [
          {
            kind: "insert-text",
            inlineContentId: target,
            offset: 1,
            text: "x",
            origin,
          },
        ],
      });
      const remoteBytesForWork = remoteForWork.encode();
      for (const variant of variants) {
        const counters: QualificationWorkCounters = {
          snapshots: 0,
          placementDecodes: 0,
          payloads: {},
          textUnits: {},
          textSpans: {},
          opaqueBytes: {},
          livenessTokens: {},
          temporaryTextUnits: {},
        };
        const c = factory(candidate, variant, counters, variant).load(encoded);
        const capture = () => {
          const result = structuredClone(counters);
          counters.snapshots = 0;
          counters.placementDecodes = 0;
          counters.payloads = {};
          counters.textUnits = {};
          counters.textSpans = {};
          counters.opaqueBytes = {};
          counters.livenessTokens = {};
          counters.temporaryTextUnits = {};
          return result;
        };
        const loadWork = capture();
        const buffer = readEditorText(c, target);
        const readWork = capture();
        const anchor = c.createStableTextPosition(target, 1, "after");
        const createWork = capture();
        c.applyChange({
          context: diagnosticContext("editor-insert"),
          payloads: [
            {
              kind: "insert-text",
              inlineContentId: target,
              offset: 1,
              text: "x",
              origin,
            },
          ],
        });
        const editWork = capture();
        const resolved = c.resolveStableTextPosition(anchor);
        const resolveWork = capture();
        const after = readEditorText(c, target);
        if (
          buffer.text !== "a".repeat(p.targetLength) ||
          after.text !== "ax" + "a".repeat(p.targetLength - 1)
        )
          throw new Error("Editor diagnostic projection mismatch");
        editorProjections.push(
          canonical({
            buffer,
            after,
            resolved,
            snapshot: c.snapshot(),
            effects: c.effects(),
          }),
        );
        const transitionWork: Record<string, unknown> = {};
        for (const transition of ["merge", "restore", "replace"] as const) {
          const t = factory(candidate, variant, counters, variant).load(
            encoded,
          );
          let token = "";
          if (transition === "restore") {
            token = t.captureHistoricalState();
            t.applyChange({
              context: diagnosticContext("setup"),
              payloads: [
                {
                  kind: "insert-text",
                  inlineContentId: target,
                  offset: 1,
                  text: "x",
                  origin,
                },
              ],
            });
          }
          capture(); // fixture preparation is outside the observed transition
          if (transition === "merge") t.mergeEncoded(remoteBytesForWork);
          else if (transition === "restore")
            t.restoreHistoricalState(token, diagnosticContext("restore"));
          else
            t.applyChange({
              context: diagnosticContext("replace"),
              payloads: [
                {
                  kind: "replace-text",
                  inlineContentId: target,
                  mediaType: "text/plain",
                  text: "a".repeat(p.targetLength),
                  origin,
                },
              ],
            });
          const transitionCounts = capture();
          t.applyChange({
            context: diagnosticContext("first"),
            payloads: [
              {
                kind: "insert-text",
                inlineContentId: target,
                offset: 1,
                text: "x",
                origin,
              },
            ],
          });
          const firstEdit = capture();
          t.applyChange({
            context: diagnosticContext("warm"),
            payloads: [
              {
                kind: "delete-text",
                inlineContentId: target,
                start: 1,
                end: 2,
              },
            ],
          });
          const warmEdit = capture();
          const expectedEffects =
            transition === "merge"
              ? ["first", "remote", "warm"]
              : transition === "restore"
                ? ["first", "restore", "setup", "warm"]
                : ["first", "replace", "warm"];
          const effects = [...t.effects().values()].sort((a, b) =>
            a.effectId.localeCompare(b.effectId),
          );
          if (
            canonical(effects.map((e) => e.effectId)) !==
            canonical(expectedEffects)
          )
            throw new Error(`${transition}: diagnostic effects differ`);
          transitionProjections[transition]!.push(
            canonical({ snapshot: t.snapshot(), effects }),
          );
          transitionWork[transition] = {
            transitionCounts,
            firstEdit,
            warmEdit,
          };
        }
        let untrustedDecoderFallback: unknown = null;
        if (variant === "targeted" && p.blockCount > 0) {
          const fallback = factory(
            candidate,
            variant,
            counters,
            variant,
            false,
          ).load(encoded);
          capture();
          readEditorText(fallback, target);
          const read = capture();
          fallback.applyChange({
            context: diagnosticContext("fallback"),
            payloads: [
              {
                kind: "insert-text",
                inlineContentId: target,
                offset: 1,
                text: "x",
                origin,
              },
            ],
          });
          const edit = capture();
          untrustedDecoderFallback = { read, edit };
        }
        const elapsedMs: number[] = [];
        for (let sample = 0; sample < Math.min(samples, 3); sample++) {
          const timed = factory(candidate, variant, undefined, variant).load(
            encoded,
          );
          const start = performance.now();
          const timedBefore = readEditorText(timed, target);
          const pos = timed.createStableTextPosition(target, 1, "after");
          timed.applyChange({
            context: diagnosticContext("editor-insert"),
            payloads: [
              {
                kind: "insert-text",
                inlineContentId: target,
                offset: 1,
                text: "x",
                origin,
              },
            ],
          });
          const timedResolved = timed.resolveStableTextPosition(pos);
          const timedAfter = readEditorText(timed, target);
          elapsedMs.push(performance.now() - start);
          if (
            canonical({
              buffer: timedBefore,
              after: timedAfter,
              resolved: timedResolved,
              snapshot: timed.snapshot(),
              effects: timed.effects(),
            }) !== editorProjections[editorProjections.length - 1]
          )
            throw new Error(
              "Instrumented and uninstrumented editor outcomes differ",
            );
        }
        editorWork[variant] = {
          loadWork,
          readWork,
          createWork,
          editWork,
          resolveWork,
          transitionWork,
          untrustedDecoderFallback,
          elapsedMs,
        };
      }
      if (
        Object.values(transitionProjections).some((pair) => pair[0] !== pair[1])
      )
        throw new Error(
          `${candidate} ${p.name}: transition diagnostic variants differ`,
        );
      if (editorProjections[0] !== editorProjections[1])
        throw new Error(`${candidate} ${p.name}: editor variants differ`);
      const raw: Record<Variant, number[]> = { snapshot: [], targeted: [] };
      const cold: Record<Variant, number[]> = { snapshot: [], targeted: [] };
      const loads: Record<Variant, number[]> = { snapshot: [], targeted: [] };
      const makeChange = (index: number) => ({
        context: { actorId: "benchmark", effectId: `edit-${index}` },
        payloads: [
          index % 2 === 0
            ? {
                kind: "insert-text" as const,
                inlineContentId: target,
                offset: 1,
                text: "x",
                origin,
              }
            : {
                kind: "delete-text" as const,
                inlineContentId: target,
                start: 1,
                end: 2,
              },
        ],
      });
      const changes = Array.from(
        { length: warmup + samples * iterations },
        (_, i) => makeChange(i),
      );
      const first = makeChange(0);
      // Independent freshly loaded carriers: first edit only, loading outside the clock.
      for (let i = 0; i < samples; i++) {
        const projections: string[] = [];
        for (const variant of i % 2 ? [...variants].reverse() : variants) {
          const loader = factory(candidate, variant);
          const loadStart = performance.now();
          const c = loader.load(encoded);
          loads[variant].push(performance.now() - loadStart);
          const start = performance.now();
          c.applyChange(first);
          cold[variant].push(performance.now() - start);
          const snapshot = c.snapshot();
          projections.push(canonical(snapshot));
          const payload = snapshot.payloads.get(target);
          const effects = [...c.effects().values()];
          if (
            payload?.kind !== "text" ||
            payload.text !== "ax" + "a".repeat(p.targetLength - 1) ||
            effects.length !== 1 ||
            effects[0]?.actorId !== "benchmark" ||
            effects[0]?.effectId !== "edit-0"
          )
            throw new Error("Cold projection/effect mismatch");
        }
        if (projections[0] !== projections[1])
          throw new Error("Cold variant projections differ");
      }
      const transitions = ["merge", "restore", "fallback-replace"] as const;
      const transitionData = Object.fromEntries(
        variants.map((variant) => [
          variant,
          Object.fromEntries(
            transitions.map((name) => [
              name,
              { transitionMs: [] as number[], nextEditMs: [] as number[] },
            ]),
          ),
        ]),
      ) as Record<
        Variant,
        Record<
          (typeof transitions)[number],
          { transitionMs: number[]; nextEditMs: number[] }
        >
      >;
      // The remote branch is identical for both variants, and prepared before timing.
      const remote = factory(candidate, "snapshot").load(encoded);
      remote.applyChange({
        ...first,
        context: { actorId: "benchmark", effectId: "remote" },
      });
      const remoteEncoded = remote.encode();
      const transitionContext = {
        actorId: "benchmark",
        effectId: "transition",
      };
      for (const name of transitions)
        for (let sample = 0; sample < samples; sample++) {
          const checked: string[] = [];
          for (const variant of sample % 2
            ? [...variants].reverse()
            : variants) {
            const c = factory(candidate, variant).load(encoded);
            let token = "";
            if (name === "restore") {
              token = c.captureHistoricalState();
              c.applyChange({
                ...first,
                context: { actorId: "benchmark", effectId: "setup" },
              });
            }
            const replacement = {
              context: transitionContext,
              payloads: [
                {
                  kind: "replace-text" as const,
                  inlineContentId: target,
                  mediaType: "text/plain",
                  text: "a".repeat(p.targetLength),
                  origin,
                },
              ],
            };
            const start = performance.now();
            if (name === "merge") c.mergeEncoded(remoteEncoded);
            else if (name === "restore")
              c.restoreHistoricalState(token, transitionContext);
            else c.applyChange(replacement);
            transitionData[variant][name].transitionMs.push(
              performance.now() - start,
            );
            const editStart = performance.now();
            c.applyChange(first);
            transitionData[variant][name].nextEditMs.push(
              performance.now() - editStart,
            );
            const snapshot = c.snapshot();
            const payload = snapshot.payloads.get(target);
            const expected =
              name === "merge"
                ? "axx" + "a".repeat(p.targetLength - 1)
                : "ax" + "a".repeat(p.targetLength - 1);
            const expectedEffects =
              name === "merge"
                ? ["edit-0", "remote"]
                : name === "restore"
                  ? ["edit-0", "setup", "transition"]
                  : ["edit-0", "transition"];
            const effects = [...c.effects().values()];
            if (
              payload?.kind !== "text" ||
              payload.text !== expected ||
              effects.length !== expectedEffects.length ||
              effects.some(
                (effect) =>
                  effect.actorId !== "benchmark" ||
                  !expectedEffects.includes(effect.effectId),
              )
            )
              throw new Error(
                `${candidate} ${p.name} ${name}: transition semantics mismatch`,
              );
            checked.push(
              canonical({
                snapshot,
                effects: effects.sort((a, b) =>
                  a.effectId.localeCompare(b.effectId),
                ),
              }),
            );
          }
          if (checked[0] !== checked[1])
            throw new Error(
              `${candidate} ${p.name} ${name}: variant results differ`,
            );
        }
      for (let i = 0; i < warmup; i++)
        for (const variant of i % 2 ? [...variants].reverse() : variants)
          carriers[variant].applyChange(changes[i]!);
      for (let sample = 0; sample < samples; sample++)
        for (const variant of sample % 2 ? [...variants].reverse() : variants) {
          const start = performance.now();
          for (let i = 0; i < iterations; i++)
            carriers[variant].applyChange(
              changes[warmup + sample * iterations + i]!,
            );
          raw[variant].push((performance.now() - start) / iterations);
        }
      const snapshots = variants.map((variant) => carriers[variant].snapshot());
      if (
        snapshots.some((snapshot) => snapshot.placements.size !== p.blockCount)
      )
        throw new Error("Fixture block placements differ");
      if (canonical(snapshots[0]) !== canonical(snapshots[1]))
        throw new Error(`${candidate} ${p.name}: variant snapshots differ`);
      for (const variant of variants) {
        const payload = carriers[variant].snapshot().payloads.get(target);
        if (
          payload?.kind !== "text" ||
          payload.text !== "a".repeat(p.targetLength) ||
          carriers[variant].effects().size !== changes.length ||
          [...carriers[variant].effects().values()].some(
            (effect) =>
              effect.actorId !== "benchmark" ||
              !changes.some(
                (change) => change.context.effectId === effect.effectId,
              ),
          )
        )
          throw new Error(
            `${candidate} ${p.name}: projection/effects mismatch`,
          );
        rows.push({
          candidate,
          variant,
          profile: p,
          editorWork: editorWork[variant],
          effectCount: carriers[variant].effects().size,
          seedEncodedBytes: encoded.length,
          finalEncodedBytes: carriers[variant].encode().length,
          transitions: Object.fromEntries(
            transitions.map((name) => {
              const data = transitionData[variant][name];
              return [
                name,
                {
                  ...data,
                  transitionSummary: summary(data.transitionMs),
                  nextEditSummary: summary(data.nextEditMs),
                },
              ];
            }),
          ),
          loadMs: loads[variant],
          loadSummary: summary(loads[variant]),
          coldFirstEditMs: cold[variant],
          coldSummary: summary(cold[variant]),
          steadyBatchMeanMsPerEdit: raw[variant],
          steadySummary: summary(raw[variant]),
        });
      }
    }
  return {
    samples,
    iterations,
    warmup,
    profiles,
    rows,
    limitations: [
      "Editor diagnostics explicitly pair snapshot/snapshot and targeted/targeted paths on one genesis. The untimed counters cover selected qualification projection, liveness, placement and Yjs temporary text-preflight sites, not native library internals, full validation, effect traversal or Range holders. Work on load, transitions, first and warm edits is counted separately; fallback is probed without the pure-decoder opt-in when placements exist, not estimated as a representative frequency. Timing uses fresh uninstrumented instances, at most three samples; no tail claim.",
      "Headless local carrier intervals: load; first applyChange after load; steady applyChange batches; mergeEncoded, restoreHistoricalState, or fallback replace-text applyChange; and the following applyChange. No editor, network, encode or snapshot inside timed intervals.",
      "Transition fixtures each start from a fresh load: merge one prebuilt same-lineage remote insertion; restore a captured seed after a setup insertion; or replace the target with identical text via the fallback path. The following attributed insertion is timed separately. Remote preparation, capture, setup, and checks are excluded.",
      "Load timing includes the variant’s load-time validation. First edit is timed separately with load excluded; both are measured in a warmed process, not a cold process.",
      "These carrier timings do not establish editor responsiveness or user-facing latency.",
      "Steady samples reuse a carrier and alternate insertion/deletion; liveness tokens and native history grow throughout warmup and measurements. This does not isolate history size.",
      "Blocks-only profiles vary unrelated live placements with all other fixture dimensions held at baseline. The live-blocks-20 profile adds 20 placements to the unrelated-count-20 shape. This fixture opts in to the pure local-dense decoder; arbitrary decoders retain full preflight for placements. Dead identities are not varied.",
      "Target-history profiles seed alternating real edits of the touched content and return to the same text. They grow target and owner liveness tokens together with native carrier history; they do not isolate token enumeration from native history costs. Seed edits have no effect context and are excluded from measured attributed effect counts.",
      "The fragmented-target profile replaces alternating characters with distinct Origins before measurement. It also increases native history and liveness records, so it does not isolate fragmentation cost from history cost.",
      "Intervals include native transaction, validation and allocation. GC, JIT, scheduling, cache state and ordered batch effects may affect results; repeat on the same idle host and compare distributions.",
      "With few samples p95 is effectively the maximum, not a reliable tail estimate; no product threshold is implied.",
    ],
  };
}
