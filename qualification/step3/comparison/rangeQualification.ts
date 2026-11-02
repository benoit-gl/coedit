import {
  parseBlockId,
  parseInlineContentId,
} from "../../../src/domain/index.js";
import {
  createProbeRange,
  resolveProbeRange,
} from "../integrated/rangeProbe.js";
import type {
  ProbeMember,
  ProbeTransition,
  ResolvedProbeSpan,
} from "../integrated/rangeProbe.js";
import type { IntegratedDocumentCarrierFactory } from "../integrated/carrier.js";
import { localDensePositionAllocator } from "../structure/localDensePosition.js";
import type { LocalDensePosition } from "../structure/localDensePosition.js";

const uuid = (n: number) =>
  `79000000-0000-4000-8000-${n.toString(16).padStart(12, "0")}`;
const root = parseBlockId(uuid(1));
const block = parseBlockId(uuid(2));
const content = parseInlineContentId(uuid(3));
const splitBlock = parseBlockId(uuid(4));
const splitContent = parseInlineContentId(uuid(5));
const origin = { kind: "human", id: "range-author" } as const;

/** Experimental independent dimensions for unregistered, externally held Range probes. */
export interface RangeQualificationShape {
  /** Number of application-owned probe values. */
  readonly holders: number;
  /** Alternating one-character source members per selected probe. */
  readonly members: number;
  /** Unrelated live Blocks with text. */
  readonly unrelatedBlocks: number;
  /** Moves of the target before Range capture. */
  readonly priorMoves: number;
}

/** Experimental cases independently vary holders, members and unrelated Blocks. */
export const rangeQualificationShapes: readonly RangeQualificationShape[] = [
  { holders: 1, members: 1, unrelatedBlocks: 0, priorMoves: 0 },
  { holders: 64, members: 1, unrelatedBlocks: 0, priorMoves: 0 },
  { holders: 256, members: 1, unrelatedBlocks: 0, priorMoves: 0 },
  { holders: 1024, members: 1, unrelatedBlocks: 0, priorMoves: 0 },
  { holders: 64, members: 4, unrelatedBlocks: 0, priorMoves: 0 },
  { holders: 64, members: 1, unrelatedBlocks: 8, priorMoves: 0 },
  { holders: 64, members: 1, unrelatedBlocks: 0, priorMoves: 12 },
];

/**
 * Execute a bounded lifecycle and scaling case with independent span expectations.
 *
 * @remarks
 * Holder instrumentation covers only the supplied external collection. The carrier
 * has no holder registration API here; zero reads is not a product-wide scan proof.
 * Timings include only the synchronous operation named by each field, not setup or
 * assertions, except that `constructionMs` includes Range validation/materialization.
 */
export function measureRangeQualification(
  factory: IntegratedDocumentCarrierFactory<LocalDensePosition>,
  shape: RangeQualificationShape,
  now: () => number,
): Record<string, unknown> {
  if (
    ![
      shape.holders,
      shape.members,
      shape.unrelatedBlocks,
      shape.priorMoves,
    ].every(Number.isSafeInteger) ||
    shape.holders < 1 ||
    shape.members < 1 ||
    shape.unrelatedBlocks < 0 ||
    shape.priorMoves < 0 ||
    shape.members > 16 ||
    shape.unrelatedBlocks > 32 ||
    shape.priorMoves > 100
  )
    throw new RangeError("Invalid Range qualification shape.");
  const positions = localDensePositionAllocator.allocateRun({
    count: shape.unrelatedBlocks + 3,
    context: { runNonce: uuid(99) },
  });
  if (!positions.ok || positions.value.length !== shape.unrelatedBlocks + 3)
    throw new Error("Position allocation failed.");
  const placement = (index: number) => ({
    position: positions.value[index]!,
    depth: 1,
  });
  const timed = <T>(fn: () => T): [T, number] => {
    const t = now();
    const value = fn();
    return [value, now() - t];
  };
  const carrier = factory.create(root);
  carrier.applyChange({
    placements: [
      { blockId: block, placement: placement(0) },
      ...Array.from({ length: shape.unrelatedBlocks }, (_, i) => ({
        blockId: parseBlockId(uuid(100 + i)),
        placement: placement(i + 3),
      })),
    ],
    inlineContents: [
      { inlineContentId: content, blockId: block },
      ...Array.from({ length: shape.unrelatedBlocks }, (_, i) => ({
        inlineContentId: parseInlineContentId(uuid(200 + i)),
        blockId: parseBlockId(uuid(100 + i)),
      })),
    ],
    payloads: [
      {
        kind: "replace-text",
        inlineContentId: content,
        mediaType: "text/plain",
        text: "abcd",
        origin,
      },
      ...Array.from({ length: shape.unrelatedBlocks }, (_, i) => ({
        kind: "replace-text" as const,
        inlineContentId: parseInlineContentId(uuid(200 + i)),
        mediaType: "text/plain",
        text: `unrelated-${i}`,
        origin,
      })),
    ],
  });
  for (let i = 0; i < shape.priorMoves; i++)
    carrier.applyChange({
      placements: [{ blockId: block, placement: placement((i + 1) % 2) }],
    });
  const created = carrier.captureHistoricalState();
  const members: ProbeMember[] = Array.from(
    { length: shape.members },
    (_, i) => ({
      blockId: block,
      inlineContentId: content,
      start: i % 2 ? 2 : 1,
      end: i % 2 ? 3 : 2,
    }),
  );
  const [ranges, constructionMs] = timed(() =>
    Array.from({ length: shape.holders }, () =>
      createProbeRange(carrier, created, "span", members),
    ),
  );
  let reads = 0;
  const guarded = new Proxy(ranges, {
    get(target, property, receiver) {
      reads++;
      return Reflect.get(target, property, receiver) as unknown;
    },
  });
  const selected = ranges[shape.holders - 1]!;
  const [before, initialResolveMs] = timed(() =>
    resolveProbeRange(carrier, selected, created, []),
  );
  const expectSpans = (
    actual: readonly ResolvedProbeSpan[],
    texts: readonly string[],
    ids: readonly string[],
    starts: readonly number[],
  ) => {
    if (
      actual.length !== texts.length ||
      actual.some(
        (span, i) =>
          span.text !== texts[i] ||
          span.inlineContentId !== ids[i] ||
          span.start !== starts[i] ||
          span.end !== starts[i] + texts[i].length ||
          span.blockId !== (ids[i] === splitContent ? splitBlock : block),
      )
    )
      throw new Error("Range spans differ from fixture expectation.");
  };
  const texts = (left: string, right: string) =>
    members.map((_, i) => (i % 2 ? right : left));
  const ids = (left: string, right: string) =>
    members.map((_, i) => (i % 2 ? right : left));
  const starts = (left: number, right: number) =>
    members.map((_, i) => (i % 2 ? right : left));
  expectSpans(before, texts("b", "c"), ids(content, content), starts(1, 2));
  reads = 0;
  const [, editMs] = timed(() =>
    carrier.applyChange({
      payloads: [
        {
          kind: "insert-text",
          inlineContentId: content,
          offset: 2,
          text: "X",
          origin,
        },
      ],
    }),
  );
  const inserted = carrier.captureHistoricalState();
  const movedPlacement = placement(1 - (shape.priorMoves % 2));
  const [, moveMs] = timed(() =>
    carrier.applyChange({
      placements: [{ blockId: block, placement: movedPlacement }],
    }),
  );
  const moved = carrier.captureHistoricalState();
  if (
    JSON.stringify(carrier.snapshot().placements.get(block)) !==
    JSON.stringify(movedPlacement)
  )
    throw new Error("Moved placement differs from fixture expectation.");
  const holderReadsDuringChanges = reads;
  if (holderReadsDuringChanges !== 0)
    throw new Error("Edit or move accessed external holders.");
  void guarded[0];
  const positiveControlReads = reads;
  if (positiveControlReads < 1)
    throw new Error("Holder instrumentation failed its positive control.");
  const edges: ProbeTransition[] = [
    {
      from: created,
      to: inserted,
      edits: [
        { kind: "insert", inlineContentId: content, offset: 2, length: 1 },
      ],
    },
    { from: inserted, to: moved },
  ];
  const [afterMove, transitionResolveMs] = timed(() =>
    resolveProbeRange(carrier, selected, moved, edges),
  );
  expectSpans(
    afterMove,
    texts("bX", "Xc"),
    ids(content, content),
    starts(1, 2),
  );
  carrier.applyChange({
    payloads: [
      { kind: "delete-text", inlineContentId: content, start: 2, end: 3 },
    ],
  });
  const deleted = carrier.captureHistoricalState();
  edges.push({
    from: moved,
    to: deleted,
    edits: [{ kind: "delete", inlineContentId: content, start: 2, end: 3 }],
  });
  expectSpans(
    resolveProbeRange(carrier, selected, deleted, edges),
    texts("b", "c"),
    ids(content, content),
    starts(1, 2),
  );
  carrier.applyChange({
    placements: [{ blockId: splitBlock, placement: placement(2) }],
    inlineContents: [{ inlineContentId: splitContent, blockId: splitBlock }],
    payloads: [
      {
        kind: "replace-text",
        inlineContentId: content,
        mediaType: "text/plain",
        text: "ab",
        origin,
      },
      {
        kind: "replace-text",
        inlineContentId: splitContent,
        mediaType: "text/plain",
        text: "cd",
        origin,
      },
    ],
  });
  const split = carrier.captureHistoricalState();
  edges.push({
    from: deleted,
    to: split,
    lineage: [
      {
        sourceInlineContentId: content,
        sourceStart: 0,
        sourceEnd: 2,
        targetBlockId: block,
        targetInlineContentId: content,
        targetStart: 0,
      },
      {
        sourceInlineContentId: content,
        sourceStart: 2,
        sourceEnd: 4,
        targetBlockId: splitBlock,
        targetInlineContentId: splitContent,
        targetStart: 0,
      },
    ],
  });
  const [splitSpans, splitResolveMs] = timed(() =>
    resolveProbeRange(carrier, selected, split, edges),
  );
  expectSpans(
    splitSpans,
    texts("b", "c"),
    ids(content, splitContent),
    starts(1, 0),
  );
  carrier.applyChange({
    deleteBlockIds: [splitBlock],
    payloads: [
      {
        kind: "replace-text",
        inlineContentId: content,
        mediaType: "text/plain",
        text: "abcd",
        origin,
      },
    ],
  });
  const merged = carrier.captureHistoricalState();
  edges.push({
    from: split,
    to: merged,
    lineage: [
      {
        sourceInlineContentId: content,
        sourceStart: 0,
        sourceEnd: 2,
        targetBlockId: block,
        targetInlineContentId: content,
        targetStart: 0,
      },
      {
        sourceInlineContentId: splitContent,
        sourceStart: 0,
        sourceEnd: 2,
        targetBlockId: block,
        targetInlineContentId: content,
        targetStart: 2,
      },
    ],
  });
  const [mergedSpans, mergeResolveMs] = timed(() =>
    resolveProbeRange(carrier, selected, merged, edges),
  );
  expectSpans(
    mergedSpans,
    texts("b", "c"),
    ids(content, content),
    starts(1, 2),
  );
  const [encoded, encodeMs] = timed(() => carrier.encode());
  const [reloaded, reloadMs] = timed(() => factory.load(encoded));
  expectSpans(
    resolveProbeRange(reloaded, selected, merged, edges),
    texts("b", "c"),
    ids(content, content),
    starts(1, 2),
  );
  expectSpans(
    resolveProbeRange(reloaded, selected, created, []),
    texts("b", "c"),
    ids(content, content),
    starts(1, 2),
  );
  reloaded.applyChange({
    payloads: [
      {
        kind: "replace-text",
        inlineContentId: content,
        mediaType: "text/plain",
        text: "abcd",
        origin,
      },
    ],
  });
  const replaced = reloaded.captureHistoricalState();
  const invalidated: ProbeTransition[] = [
    ...edges,
    { from: merged, to: replaced, invalidated: [content] },
  ];
  if (resolveProbeRange(reloaded, selected, replaced, invalidated).length !== 0)
    throw new Error("Replacement reattached invalidated members.");
  reloaded.restoreHistoricalState(merged, {
    actorId: "range-author",
    effectId: "restore",
  });
  const restored = reloaded.captureHistoricalState();
  const restoredSnapshot = reloaded.snapshot();
  const restoredPayload = restoredSnapshot.payloads.get(content);
  if (
    restoredSnapshot.inlineContentOwners.get(content) !== block ||
    restoredPayload?.kind !== "text" ||
    restoredPayload.text !== "abcd"
  )
    throw new Error("Restored text identity differs from fixture expectation.");
  if (
    resolveProbeRange(reloaded, selected, restored, [
      ...invalidated,
      { from: replaced, to: restored },
    ]).length !== 0
  )
    throw new Error("Restore reattached invalidated members.");
  const holderBytes = new TextEncoder().encode(JSON.stringify(ranges)).length;
  return {
    ...shape,
    constructionMs,
    initialResolveMs,
    editMs,
    moveMs,
    transitionResolveMs,
    splitResolveMs,
    mergeResolveMs,
    encodeMs,
    reloadMs,
    encodedBytes: encoded.length,
    externalHolderJsonBytes: holderBytes,
    holderReadsDuringChanges,
    positiveControlReads,
    retainedTokens: 6,
    nativeLifecycle: carrier.nativeLifecycle(),
  };
}
