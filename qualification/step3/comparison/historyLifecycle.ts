import {
  parseBlockId,
  parseInlineContentId,
} from "../../../src/domain/index.js";
import { localDensePositionAllocator } from "../structure/localDensePosition.js";
import type { LocalDensePosition } from "../structure/localDensePosition.js";
import type {
  IntegratedDocumentCarrierFactory,
  IntegratedDocumentSnapshot,
} from "../integrated/carrier.js";

const uuid = (n: number) =>
  `71000000-0000-4000-8000-${n.toString(16).padStart(12, "0")}`;
const root = parseBlockId(uuid(1));
const block = parseBlockId(uuid(2));
const textId = parseInlineContentId(uuid(3));
const opaqueId = parseInlineContentId(uuid(4));
const origin = { id: "history-author", kind: "human" } as const;

// Snapshots contain Maps and opaque bytes; compare their contents, not object identity.
function canonical(
  snapshot: IntegratedDocumentSnapshot<LocalDensePosition>,
): string {
  return JSON.stringify(snapshot, (_key, value: unknown) => {
    if (value instanceof Map)
      return [...value.entries()].sort(([a], [b]) =>
        String(a).localeCompare(String(b)),
      );
    if (value instanceof Uint8Array) return [...value];
    return value;
  });
}

/**
 * One mixed history with constant visible text length and changing retained history.
 * Timings are per-phase wall-clock intervals, including synchronous validation where
 * it is part of a carrier operation. Correctness checks occur outside those intervals.
 */
export function measureMixedHistoryLifecycle(
  factory: IntegratedDocumentCarrierFactory<LocalDensePosition>,
  effects: number,
  now: () => number,
): Record<string, unknown> {
  if (!Number.isSafeInteger(effects) || effects < 4 || effects % 4 !== 0)
    throw new RangeError(
      "effects must be a positive multiple of four of at least four",
    );
  const positions = localDensePositionAllocator.allocateRun({
    count: 2,
    context: { runNonce: uuid(99) },
  });
  if (!positions.ok || !positions.value[0] || !positions.value[1])
    throw new Error("Position allocation failed");
  const carrier = factory.create(root);
  carrier.applyChange({
    placements: [
      { blockId: block, placement: { position: positions.value[0], depth: 1 } },
    ],
    inlineContents: [
      { inlineContentId: textId, blockId: root },
      { inlineContentId: opaqueId, blockId: block },
    ],
    payloads: [
      {
        kind: "replace-text",
        inlineContentId: textId,
        mediaType: "text/plain",
        text: "abcdefgh",
        origin,
      },
      {
        kind: "replace-opaque",
        inlineContentId: opaqueId,
        mediaType: "application/example",
        bytes: new Uint8Array([0, 1, 2, 3]),
        origin,
      },
    ],
  });
  const phase = <T>(fn: () => T): [T, number] => {
    const start = now();
    const result = fn();
    return [result, now() - start];
  };
  const edit = (i: number) => {
    const context = { actorId: "mixed-history", effectId: `effect-${i}` };
    switch (i % 4) {
      case 0:
        carrier.applyChange({
          payloads: [
            {
              kind: "insert-text",
              inlineContentId: textId,
              offset: 1,
              text: "X",
              origin,
            },
          ],
          context,
        });
        break;
      case 1:
        carrier.applyChange({
          payloads: [
            { kind: "delete-text", inlineContentId: textId, start: 1, end: 2 },
          ],
          context,
        });
        break;
      case 2:
        carrier.applyChange({
          payloads: [
            {
              kind: "replace-text",
              inlineContentId: textId,
              mediaType: "text/plain",
              text: i % 8 === 2 ? "abcdefgh" : "ABCDEFGH",
              origin,
            },
          ],
          context,
        });
        break;
      default:
        carrier.applyChange({
          placements: [
            {
              blockId: block,
              placement: { position: positions.value[(i >> 2) % 2]!, depth: 1 },
            },
          ],
          payloads: [
            {
              kind: "replace-opaque",
              inlineContentId: opaqueId,
              mediaType: "application/example",
              bytes: new Uint8Array([i % 256, 1, 2, 3]),
              origin,
            },
          ],
          context,
        });
    }
  };
  // Capture at a complete cycle; each phase therefore ends at the same visible size.
  const midpoint = Math.floor(effects / 8) * 4 || 4;
  const [, firstEditsMs] = phase(() => {
    for (let i = 0; i < midpoint; i++) edit(i);
  });
  const expected = canonical(carrier.snapshot());
  const [token, captureMs] = phase(() => carrier.captureHistoricalState());
  const [, laterEditsMs] = phase(() => {
    for (let i = midpoint; i < effects; i++) edit(i);
  });
  const tip = canonical(carrier.snapshot());
  const [historical, materializeMs] = phase(() =>
    carrier.materializeHistoricalState(token),
  );
  if (
    canonical(historical) !== expected ||
    canonical(carrier.snapshot()) !== tip
  )
    throw new Error("Historical materialization differs or mutates tip");
  const [encoded, encodeMs] = phase(() => carrier.encode());
  const [reopened, reopenMs] = phase(() => factory.load(encoded));
  if (
    canonical(reopened.snapshot()) !== tip ||
    canonical(reopened.materializeHistoricalState(token)) !== expected
  )
    throw new Error("Reopen lost tip or history");
  const [, restoreMs] = phase(() =>
    reopened.restoreHistoricalState(token, {
      actorId: "mixed-history",
      effectId: "restore",
    }),
  );
  if (
    canonical(reopened.snapshot()) !== expected ||
    canonical(reopened.materializeHistoricalState(token)) !== expected
  )
    throw new Error("Restore differs from retained state");
  const [, postRestoreEditMs] = phase(() =>
    reopened.applyChange({
      payloads: [
        {
          kind: "insert-text",
          inlineContentId: textId,
          offset: 1,
          text: "!",
          origin,
        },
      ],
      context: { actorId: "mixed-history", effectId: "post-restore" },
    }),
  );
  const post = reopened.snapshot().payloads.get(textId);
  if (
    post?.kind !== "text" ||
    post.text.length !== 9 ||
    canonical(reopened.materializeHistoricalState(token)) !== expected
  )
    throw new Error("Post-restore edit or retained history differs");
  const finalEncoded = reopened.encode();
  if (
    canonical(factory.load(finalEncoded).snapshot()) !==
    canonical(reopened.snapshot())
  )
    throw new Error("Post-restore reopen differs");
  return {
    effects,
    midpoint,
    visibleTextUnits: 8,
    opaqueBytes: 4,
    initialEncodedBytes: encoded.length,
    finalEncodedBytes: finalEncoded.length,
    effectCountBeforeRestore: carrier.effects().size,
    nativeLifecycle: carrier.nativeLifecycle(),
    firstEditsMs,
    laterEditsMs,
    captureMs,
    materializeMs,
    encodeMs,
    reopenMs,
    restoreMs,
    postRestoreEditMs,
  };
}
