import {
  parseBlockId,
  parseInlineContentId,
} from "../../../src/domain/index.js";
import type {
  IntegratedDocumentCarrier,
  IntegratedDocumentCarrierFactory,
  QualificationWorkCounters,
} from "../integrated/carrier.js";
import { createYjsIntegratedDocumentCarrierFactory } from "../integrated/yjsIntegratedDocumentCarrier.js";
import { createAutomergeIntegratedDocumentCarrierFactory } from "../integrated/automergeIntegratedDocumentCarrier.js";
import {
  localDensePositionAllocator,
  type LocalDensePosition,
} from "../structure/localDensePosition.js";
import { QualificationTextEditor } from "../editor/semanticText.js";
import {
  QualificationIncrementalEditor,
  createIncrementalEditorWork,
} from "../editor/incrementalEditor.js";
import {
  ordinarySource,
  ordinaryWork,
  resetOrdinaryWork,
} from "./ordinaryEditComparison.js";

const root = parseBlockId("91000000-0000-4000-8000-000000000001");
const block = parseBlockId("91000000-0000-4000-8000-000000000002");
const target = parseInlineContentId("91000000-0000-4000-8000-000000000003");
const opaque = parseInlineContentId("91000000-0000-4000-8000-000000000004");
const origin = { id: "lifecycle-origin", kind: "human" as const };
const variants = ["snapshot", "targeted", "incremental"] as const;
type Candidate = "yjs" | "automerge";
type Variant = (typeof variants)[number];
type Carrier = IntegratedDocumentCarrier<LocalDensePosition>;

function makeFactory(
  candidate: Candidate,
  variant: Variant,
  work: QualificationWorkCounters,
): IntegratedDocumentCarrierFactory<LocalDensePosition> {
  const create =
    candidate === "yjs"
      ? createYjsIntegratedDocumentCarrierFactory
      : createAutomergeIntegratedDocumentCarrierFactory;
  return create(localDensePositionAllocator, localDensePositionAllocator, {
    ordinaryEditVariant: variant,
    editorProjectionVariant: variant === "snapshot" ? "snapshot" : "targeted",
    purePositionDecoder: true,
    workCounters: work,
  });
}

function seed(candidate: Candidate): Uint8Array {
  const carrier = makeFactory(candidate, "snapshot", ordinaryWork()).create(
    root,
  );
  carrier.applyChange({
    placements: [
      {
        blockId: block,
        placement: {
          depth: 1,
          position: { digits: [1], run: root, member: 1 },
        },
      },
    ],
    inlineContents: [
      { inlineContentId: target, blockId: root },
      { inlineContentId: opaque, blockId: block },
    ],
    payloads: [
      {
        kind: "replace-text",
        inlineContentId: target,
        mediaType: "text/markdown",
        text: ordinarySource(1024),
        origin,
      },
      {
        kind: "replace-opaque",
        inlineContentId: opaque,
        mediaType: "application/octet-stream",
        bytes: new Uint8Array(4096),
        origin,
      },
    ],
  });
  return carrier.encode();
}

function semantic(carrier: Carrier): string {
  return JSON.stringify(
    {
      snapshot: carrier.snapshot(),
      effects: carrier.effects(),
      evidence: carrier.recordedPayloadEffects(),
    },
    (_key, value: unknown) => {
      if (value instanceof Map)
        return [...value.entries()].sort(([a], [b]) =>
          String(a).localeCompare(String(b)),
        );
      if (value instanceof Uint8Array) return [...value];
      return value;
    },
  );
}

function measure<T>(
  work: QualificationWorkCounters,
  action: () => T,
): { value: T; ms: number; work: QualificationWorkCounters } {
  resetOrdinaryWork(work);
  const start = performance.now();
  const value = action();
  const ms = performance.now() - start;
  return { value, ms, work: structuredClone(work) };
}

function editPair(
  carrier: Carrier,
  variant: Variant,
  work: QualificationWorkCounters,
  label: string,
) {
  const editorWork = createIncrementalEditorWork();
  const activation = measure(work, () =>
    variant === "incremental"
      ? new QualificationIncrementalEditor(carrier, target, editorWork)
      : new QualificationTextEditor(carrier, target),
  );
  const editor = activation.value;
  const activationEditorWork = structuredClone(editorWork);
  const edit = (effectId: string) => {
    editorWork.activationUnits = 0;
    for (const key of Object.keys(
      editorWork.indexed,
    ) as (keyof typeof editorWork.indexed)[])
      editorWork.indexed[key] = 0;
    const result = measure(work, () => {
      const context = { actorId: "lifecycle-editor", effectId };
      if (editor instanceof QualificationIncrementalEditor)
        editor.apply(
          [{ start: 0, end: 0, insertion: [{ text: "x", origin }] }],
          context,
        );
      else editor.replaceSelection(0, 0, "x", origin, context);
    });
    return {
      ms: result.ms,
      work: result.work,
      editorWork: structuredClone(editorWork),
    };
  };
  const first = edit(`${label}-first`);
  const warm = edit(`${label}-warm`);
  return {
    activation: {
      ms: activation.ms,
      work: activation.work,
      editorWork: activationEditorWork,
    },
    first,
    warm,
  };
}

function runVariant(
  candidate: Candidate,
  variant: Variant,
  genesis: Uint8Array,
  inbound: Uint8Array,
) {
  const work = ordinaryWork();
  const factory = makeFactory(candidate, variant, work);
  const load = measure(work, () => factory.load(genesis));
  const carrier = load.value;
  const phases: Record<string, unknown> = {};
  const states: Record<string, string> = {};
  states.afterLoad = semantic(carrier);
  const pair = (name: string) => {
    phases[name] = editPair(carrier, variant, work, name);
    states[name] = semantic(carrier);
  };
  pair("normal");
  const saved = carrier.captureHistoricalState();
  const merge = measure(work, () => carrier.mergeEncoded(inbound));
  states.afterMergeTransition = semantic(carrier);
  pair("afterMerge");
  const restore = measure(work, () => carrier.restoreHistoricalState(saved));
  states.afterRestoreTransition = semantic(carrier);
  pair("afterRestore");
  const replacement = measure(work, () =>
    carrier.applyChange({
      payloads: [
        {
          kind: "replace-text",
          inlineContentId: target,
          mediaType: "text/markdown",
          text: ordinarySource(1024),
          origin,
        },
      ],
    }),
  );
  states.afterReplacementTransition = semantic(carrier);
  pair("afterReplacement");
  const beforeRejected = carrier.encode();
  const rejected = measure(work, () => {
    try {
      carrier.applyChange({
        payloads: [
          {
            kind: "delete-text",
            inlineContentId: target,
            start: 99999,
            end: 100000,
          },
        ],
      });
    } catch (error) {
      if (error instanceof RangeError) return error.message;
      throw error;
    }
    throw new Error("Invalid lifecycle edit unexpectedly succeeded.");
  });
  const afterRejected = carrier.encode();
  if (
    beforeRejected.length !== afterRejected.length ||
    beforeRejected.some((value, i) => value !== afterRejected[i])
  )
    throw new Error("Rejected edit changed encoded state.");
  states.afterRejectedTransition = semantic(carrier);
  const recovery =
    variant === "incremental"
      ? measure(work, () => carrier.prepareOrdinaryText())
      : undefined;
  if (recovery && !recovery.value)
    throw new Error("Incremental recovery failed.");
  pair("afterRejectionRecovery");
  return {
    variant,
    transitions: {
      load: { ms: load.ms, work: load.work },
      merge: { ms: merge.ms, work: merge.work },
      restore: { ms: restore.ms, work: restore.work },
      replacement: { ms: replacement.ms, work: replacement.work },
      rejected: {
        ms: rejected.ms,
        work: rejected.work,
        error: rejected.value,
        encodedStateUnchanged: true,
        fallbackReason:
          variant === "incremental"
            ? "rejection invalidated indexed proof; explicit recovery required"
            : "rejection requires reference preflight on the next edit",
      },
      recovery: recovery
        ? { ms: recovery.ms, work: recovery.work, available: recovery.value }
        : {
            available: false,
            reason: "reference variant has no indexed recovery",
          },
    },
    phases,
    states,
  };
}

function decoderFallback(candidate: Candidate, genesis: Uint8Array) {
  let decodes = 0;
  const codec = {
    ...localDensePositionAllocator,
    decode: (encoded: string) => {
      decodes++;
      return localDensePositionAllocator.decode(encoded);
    },
  };
  const create =
    candidate === "yjs"
      ? createYjsIntegratedDocumentCarrierFactory
      : createAutomergeIntegratedDocumentCarrierFactory;
  const work = ordinaryWork();
  const carrier = create(codec, localDensePositionAllocator, {
    ordinaryEditVariant: "incremental",
    workCounters: work,
  }).load(genesis);
  const available = carrier.prepareOrdinaryText();
  let editorActivationError: string | undefined;
  try {
    new QualificationIncrementalEditor(carrier, target);
  } catch (error) {
    if (!(error instanceof TypeError)) throw error;
    editorActivationError = error.message;
  }
  resetOrdinaryWork(work);
  decodes = 0;
  carrier.applyChange({
    payloads: [
      {
        kind: "insert-text",
        inlineContentId: target,
        offset: 0,
        text: "x",
        origin,
      },
    ],
  });
  if (
    available ||
    editorActivationError === undefined ||
    work.snapshots === 0 ||
    decodes === 0
  )
    throw new Error("Expected arbitrary decoder fallback was not observed.");
  return {
    candidate,
    status: "ineligible",
    reason:
      "arbitrary position decoder with retained placement; purity not opted in",
    activationAvailable: available,
    editorActivationError,
    snapshots: work.snapshots,
    placementDecodes: decodes,
  };
}

/** Lifecycle and fallback characterization; timing is descriptive, never a product threshold. */
export function runOrdinaryEditLifecycle(): Record<string, unknown> {
  const rows: unknown[] = [];
  const fallback: unknown[] = [];
  for (const candidate of ["yjs", "automerge"] as const) {
    const genesis = seed(candidate);
    const remote = makeFactory(candidate, "snapshot", ordinaryWork()).load(
      genesis,
    );
    remote.applyChange({
      payloads: [
        {
          kind: "insert-text",
          inlineContentId: target,
          offset: 1024,
          text: "r",
          origin,
        },
      ],
      context: { actorId: "lifecycle-remote", effectId: "inbound" },
    });
    const inbound = remote.encode();
    const runs = variants.map((variant) =>
      runVariant(candidate, variant, genesis, inbound),
    );
    const baseline = JSON.stringify(runs[0]!.states);
    if (runs.some((run) => JSON.stringify(run.states) !== baseline))
      throw new Error(`Lifecycle semantic mismatch for ${candidate}.`);
    for (const run of runs)
      rows.push({
        candidate,
        variant: run.variant,
        transitions: run.transitions,
        phases: run.phases,
        semanticCheck:
          "matched snapshots, Origins, effects and payload evidence outside timing",
      });
    fallback.push(decoderFallback(candidate, genesis));
  }
  return {
    status: "complete",
    profile: {
      targetUtf16Units: 1024,
      placedBlocks: 1,
      opaqueBytes: 4096,
      samplesPerInterval: 1,
    },
    rows,
    fallback,
  };
}
