import {
  parseBlockId,
  parseInlineContentId,
} from "../../../src/domain/index.js";
import { createYjsIntegratedDocumentCarrierFactory } from "../integrated/yjsIntegratedDocumentCarrier.js";
import { createAutomergeIntegratedDocumentCarrierFactory } from "../integrated/automergeIntegratedDocumentCarrier.js";
import type {
  IntegratedDocumentCarrierFactory,
  QualificationWorkCounters,
} from "../integrated/carrier.js";
import {
  localDensePositionAllocator,
  type LocalDensePosition,
} from "../structure/localDensePosition.js";
import { QualificationTextEditor } from "../editor/semanticText.js";
import {
  QualificationIncrementalEditor,
  createIncrementalEditorWork,
} from "../editor/incrementalEditor.js";

/** Experimental ordinary-edit workload, independently varied from the baseline. */
export interface OrdinaryEditProfile {
  /** Stable evidence row name. */
  readonly name: string;
  /** Initial target size in ECMAScript UTF-16 units. */
  readonly targetUnits: number;
  /** Retained unrelated Block placements. */
  readonly blocks: number;
  /** Unrelated text payload count, each 1,024 units. */
  readonly texts: number;
  /** Unrelated opaque payload count. */
  readonly opaque: number;
  /** Bytes per opaque payload. */
  readonly opaqueBytes: number;
  /** Origin runs inserted into the target during setup. */
  readonly origins: number;
  /** Prior insert/delete pairs that preserve visible text. */
  readonly historyPairs: number;
  /** Whether prior edits retain qualification effect context and payload evidence. */
  readonly attributedHistory: boolean;
}

/** Reproducible Unicode and Markdown-like source, never ending in half a surrogate pair. */
export function ordinarySource(units: number): string {
  const pattern = "# Title 😀\nA **bold** café, é, 漢字 and [link](path).\n";
  let text = pattern.repeat(Math.ceil(units / pattern.length)).slice(0, units);
  const last = text.charCodeAt(text.length - 1);
  if (last >= 0xd800 && last <= 0xdbff) text = text.slice(0, -1) + "x";
  return text;
}

/** Zero-valued counters; reset their existing indexed object to preserve passive references. */
export function ordinaryWork(): QualificationWorkCounters {
  return {
    snapshots: 0,
    placementDecodes: 0,
    payloads: {},
    textUnits: {},
    textSpans: {},
    opaqueBytes: {},
    temporaryTextUnits: {},
    livenessTokens: {},
  };
}

/** Reset existing counters after activation, outside the measured ordinary path. */
export function resetOrdinaryWork(work: QualificationWorkCounters): void {
  work.snapshots = 0;
  work.placementDecodes = 0;
  for (const field of [
    work.payloads,
    work.textUnits,
    work.textSpans,
    work.opaqueBytes,
    work.temporaryTextUnits,
    work.livenessTokens,
  ])
    for (const key of Object.keys(field)) delete field[key];
  if (work.indexed) {
    work.indexed.rebuildUnits = 0;
    work.indexed.readUnits = 0;
    work.indexed.readPieces = 0;
    work.indexed.pathVisits = 0;
    work.indexed.cacheHits = 0;
  }
}

const root = parseBlockId("89000000-0000-4000-8000-000000000001");
const target = parseInlineContentId("89000000-0000-4000-8000-000000000002");
const origin = { id: "ordinary-original", kind: "human" as const };
const editing = { id: "ordinary-editor", kind: "human" as const };
type Variant = "snapshot" | "targeted" | "incremental";
const variants: readonly Variant[] = ["snapshot", "targeted", "incremental"];

function profile(
  name: string,
  changes: Partial<OrdinaryEditProfile> = {},
): OrdinaryEditProfile {
  return {
    name,
    targetUnits: 1024,
    blocks: 0,
    texts: 0,
    opaque: 0,
    opaqueBytes: 0,
    origins: 1,
    historyPairs: 0,
    attributedHistory: false,
    ...changes,
  };
}

/** Independent and combined dimensions; these sizes are experimental characterization points. */
export const ordinaryEditProfiles: readonly OrdinaryEditProfile[] = [
  profile("unicode-1024"),
  profile("unicode-10000", { targetUnits: 10000 }),
  profile("unicode-100000", { targetUnits: 100000 }),
  profile("placements-20", { blocks: 20 }),
  profile("placements-100", { blocks: 100 }),
  profile("unrelated-text-20", { texts: 20 }),
  profile("opaque-1x4096", { opaque: 1, opaqueBytes: 4096 }),
  profile("opaque-20x256", { opaque: 20, opaqueBytes: 256 }),
  profile("opaque-20x4096", { opaque: 20, opaqueBytes: 4096 }),
  profile("origins-64", { origins: 64 }),
  profile("history-100", { historyPairs: 100 }),
  profile("history-500", { historyPairs: 500 }),
  profile("effects-100", { historyPairs: 100, attributedHistory: true }),
  profile("combined", {
    targetUnits: 10000,
    blocks: 20,
    texts: 20,
    opaque: 4,
    opaqueBytes: 4096,
    origins: 32,
    historyPairs: 100,
    attributedHistory: true,
  }),
];

function factory(
  candidate: "yjs" | "automerge",
  variant: Variant,
  work?: QualificationWorkCounters,
): IntegratedDocumentCarrierFactory<LocalDensePosition> {
  const create =
    candidate === "yjs"
      ? createYjsIntegratedDocumentCarrierFactory
      : createAutomergeIntegratedDocumentCarrierFactory;
  return create(localDensePositionAllocator, localDensePositionAllocator, {
    ordinaryEditVariant: variant,
    editorProjectionVariant: variant === "snapshot" ? "snapshot" : "targeted",
    purePositionDecoder: true,
    ...(work ? { workCounters: work } : {}),
  });
}

function seed(
  candidate: "yjs" | "automerge",
  p: OrdinaryEditProfile,
): Uint8Array {
  const carrier = factory(candidate, "incremental").create(root);
  const text = ordinarySource(p.targetUnits);
  carrier.applyChange({
    placements: Array.from({ length: p.blocks }, (_, i) => ({
      blockId: parseBlockId(
        `89000001-0000-4000-8000-${String(i + 1).padStart(12, "0")}`,
      ),
      placement: {
        depth: 1,
        position: { digits: [i + 1], run: root, member: i + 1 },
      },
    })),
    inlineContents: [
      { inlineContentId: target, blockId: root },
      ...Array.from({ length: p.texts + p.opaque }, (_, i) => ({
        inlineContentId: parseInlineContentId(
          `89000002-0000-4000-8000-${String(i + 1).padStart(12, "0")}`,
        ),
        blockId: root,
      })),
    ],
    payloads: [
      {
        kind: "replace-text",
        inlineContentId: target,
        mediaType: "text/markdown",
        text,
        origin,
      },
      ...Array.from({ length: p.texts + p.opaque }, (_, i) => {
        const id = parseInlineContentId(
          `89000002-0000-4000-8000-${String(i + 1).padStart(12, "0")}`,
        );
        return i < p.texts
          ? {
              kind: "replace-text" as const,
              inlineContentId: id,
              mediaType: "text/plain",
              text: ordinarySource(1024),
              origin,
            }
          : {
              kind: "replace-opaque" as const,
              inlineContentId: id,
              mediaType: "application/octet-stream",
              bytes: new Uint8Array(p.opaqueBytes),
              origin,
            };
      }),
    ],
  });
  // Rebuild attribution through complete replacement plus scalar-safe runs.
  if (p.origins > 1) {
    carrier.applyChange({
      payloads: [
        {
          kind: "replace-text",
          inlineContentId: target,
          mediaType: "text/markdown",
          text: "",
          origin,
        },
      ],
    });
    let start = 0;
    for (let i = 0; i < p.origins; i++) {
      let end =
        i === p.origins - 1
          ? text.length
          : Math.floor(((i + 1) * text.length) / p.origins);
      if (
        end < text.length &&
        text.charCodeAt(end) >= 0xdc00 &&
        text.charCodeAt(end) <= 0xdfff
      )
        end++;
      if (end > start)
        carrier.applyChange({
          payloads: [
            {
              kind: "insert-text",
              inlineContentId: target,
              offset: start,
              text: text.slice(start, end),
              origin: { id: `ordinary-origin-${i}`, kind: "human" },
            },
          ],
        });
      start = end;
    }
  }
  for (let i = 0; i < p.historyPairs * 2; i++)
    carrier.applyChange({
      payloads: [
        i % 2 === 0
          ? {
              kind: "insert-text",
              inlineContentId: target,
              offset: 0,
              text: "!",
              origin,
            }
          : { kind: "delete-text", inlineContentId: target, start: 0, end: 1 },
      ],
      ...(p.attributedHistory
        ? { context: { actorId: "ordinary-history", effectId: String(i) } }
        : {}),
    });
  return carrier.encode();
}

function exercise(
  candidate: "yjs" | "automerge",
  variant: Variant,
  bytes: Uint8Array,
  work?: QualificationWorkCounters,
) {
  const loadStart = performance.now();
  const carrier = factory(candidate, variant, work).load(bytes);
  const loadMs = performance.now() - loadStart;
  const editorWork = createIncrementalEditorWork();
  const activationStart = performance.now();
  const delta =
    variant === "incremental"
      ? new QualificationIncrementalEditor(carrier, target, editorWork)
      : undefined;
  const reference =
    delta === undefined
      ? new QualificationTextEditor(carrier, target)
      : undefined;
  const activationMs = performance.now() - activationStart;
  if (work) resetOrdinaryWork(work);
  editorWork.activationUnits = 0;
  for (const key of Object.keys(
    editorWork.indexed,
  ) as (keyof typeof editorWork.indexed)[])
    editorWork.indexed[key] = 0;
  let effect = 0;
  const operationTimesMs: number[] = [];
  let length = ordinarySourceLength(carrier, delta);
  if (work) resetOrdinaryWork(work);
  const replace = (start: number, end: number, text: string) => {
    const context = { actorId: "ordinary-measure", effectId: String(effect++) };
    const begin = performance.now();
    if (delta)
      delta.apply(
        [{ start, end, insertion: text ? [{ text, origin: editing }] : [] }],
        context,
      );
    else reference!.replaceSelection(start, end, text, editing, context);
    operationTimesMs.push(performance.now() - begin);
    length += text.length - (end - start);
  };
  replace(0, 0, "x");
  replace(0, 1, "");
  const source = ordinarySource(length);
  let middle = Math.floor(length / 2);
  if (
    source.charCodeAt(middle) >= 0xdc00 &&
    source.charCodeAt(middle) <= 0xdfff
  )
    middle--;
  replace(middle, middle, "M");
  replace(middle, middle + 1, "");
  // A paired insertion/deletion at the end and a fixed safe ASCII prefix
  // covers selection replacement without splitting a source surrogate pair.
  replace(length, length, "😀\n");
  replace(length - 3, length, "");
  replace(0, 1, "**");
  replace(0, 2, "#");
  const observedWork = work ? structuredClone(work) : null;
  const observedEditorWork = structuredClone(editorWork);
  const snapshot = carrier.snapshot();
  const payload = snapshot.payloads.get(target);
  if (payload?.kind !== "text")
    throw new Error("Ordinary comparison lost its target.");
  // Use complete semantic projections only outside measured/counted editing.
  return {
    loadMs,
    activationMs,
    operationTimesMs,
    observedWork,
    observedEditorWork,
    snapshot,
    effects: carrier.effects(),
    payloadEffects: carrier.recordedPayloadEffects(),
    encodedBytes: carrier.encode().length,
    middle,
  };
}

function ordinarySourceLength(
  carrier: ReturnType<
    IntegratedDocumentCarrierFactory<LocalDensePosition>["create"]
  >,
  delta: QualificationIncrementalEditor<LocalDensePosition> | undefined,
): number {
  if (delta) return delta.length;
  const payload = carrier.projectEditorPayload(target);
  if (payload?.kind !== "text") throw new Error("Expected text target.");
  return payload.text.length;
}

/**
 * Run matched native-genesis ordinary-edit comparisons.
 *
 * Timing and instrumentation use separate fresh instances. Snapshot/effect
 * equivalence is checked outside measured intervals. Five samples give only
 * descriptive order statistics, not a reliable population-tail estimate.
 */
export function runOrdinaryEditComparison(
  profiles: readonly OrdinaryEditProfile[] = ordinaryEditProfiles,
  samples = 5,
  warmups = 2,
  recordProgress?: (rows: readonly Record<string, unknown>[]) => void,
): Record<string, unknown> {
  const rows: Record<string, unknown>[] = [];
  for (const p of profiles)
    for (const candidate of ["yjs", "automerge"] as const) {
      const bytes = seed(candidate, p);
      let expected: ReturnType<typeof exercise> | undefined;
      const measurements = new Map<Variant, ReturnType<typeof exercise>[]>();
      for (let iteration = -warmups; iteration < samples; iteration++) {
        for (const variant of iteration % 2 === 0
          ? variants
          : [...variants].reverse()) {
          const result = exercise(candidate, variant, bytes);
          if (!expected) expected = result;
          if (
            JSON.stringify([...result.snapshot.payloads]) !==
              JSON.stringify([...expected.snapshot.payloads]) ||
            JSON.stringify([...result.effects]) !==
              JSON.stringify([...expected.effects]) ||
            JSON.stringify(result.payloadEffects) !==
              JSON.stringify(expected.payloadEffects)
          )
            throw new Error(
              `Ordinary semantic comparison failed: ${candidate}/${p.name}/${variant}`,
            );
          if (iteration >= 0)
            measurements.set(variant, [
              ...(measurements.get(variant) ?? []),
              result,
            ]);
        }
      }
      for (const variant of variants) {
        const work = ordinaryWork();
        const diagnostic = exercise(candidate, variant, bytes, work);
        if (variant === "incremental") {
          const w = diagnostic.observedWork!;
          if (
            w.snapshots !== 0 ||
            w.placementDecodes !== 0 ||
            Object.keys(w.payloads).length !== 0 ||
            Object.keys(w.opaqueBytes).length !== 0 ||
            Object.keys(w.temporaryTextUnits).length !== 0 ||
            Object.keys(w.livenessTokens).length !== 0 ||
            w.indexed?.rebuildUnits !== 0 ||
            diagnostic.observedEditorWork.activationUnits !== 0
          )
            throw new Error(
              "Warm incremental editor performed forbidden projection or rebuild work.",
            );
        }
        rows.push({
          candidate,
          variant,
          profile: p.name,
          seedEncodedBytes: bytes.length,
          samples: (measurements.get(variant) ?? []).map(
            (result, iteration) => ({
              iteration,
              loadMs: result.loadMs,
              activationMs: result.activationMs,
              operationTimesMs: result.operationTimesMs,
              encodedBytes: result.encodedBytes,
            }),
          ),
          work: diagnostic.observedWork,
          editorWork: diagnostic.observedEditorWork,
        });
      }
      recordProgress?.(rows);
    }
  return {
    version: 1,
    status: "complete",
    profiles,
    samples,
    warmups,
    order:
      "three variants alternate forward/reverse order; same native genesis within candidate/profile",
    operations: [
      "insert-start",
      "delete-start",
      "insert-middle",
      "delete-middle",
      "insert-end-Unicode-linefeed",
      "delete-end",
      "selection-replace",
      "restore-prefix",
    ],
    intervals: {
      loadMs: "factory.load including validation and index build",
      activationMs:
        "construct editor; incremental target index initialization, reference lazy until edit",
      operationTimesMs:
        "complete headless editor command through synchronous native publication; excludes later verification/encoding",
    },
    rows,
    limitations: [
      "Pure concrete local-dense allocator opt-in; arbitrary decoder fallback is not qualified.",
      "Native internal traversal is not observed. Indexed derived-state memory and native history are retained, not compacted.",
      "History without effects still combines liveness and native history; adding contexts isolates the extra evidence layer only approximately.",
      "No carrier, allocator, string-domain, capacity value or production API is selected.",
    ],
  };
}
