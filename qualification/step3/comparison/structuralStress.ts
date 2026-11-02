import {
  parseBlockId,
  parseInlineContentId,
} from "../../../src/domain/index.js";
import type { BlockId } from "../../../src/domain/index.js";
import { projectStructuralSnapshot } from "../../../src/carrier/index.js";
import type { StructuralPlacement } from "../../../src/carrier/index.js";
import type {
  IntegratedDocumentCarrierFactory,
  IntegratedDocumentSnapshot,
} from "../integrated/carrier.js";
import { localDensePositionAllocator } from "../structure/localDensePosition.js";
import type { LocalDensePosition } from "../structure/localDensePosition.js";

/** Explicit, independent structural stress dimensions. */
export interface StructuralStressProfile {
  /** Number of unrelated sibling Blocks, including the move target. */
  readonly siblings: number;
  /** Number of Blocks in the moved subtree, including its root. */
  readonly subtree: number;
  /** Maximum indicated depth in the moved subtree. */
  readonly depth: number;
  /** Number of additional subtree moves, alternating destinations. */
  readonly repeatedMoves: number;
}

const uuid = (n: number) =>
  `73000000-0000-4000-8000-${n.toString(16).padStart(12, "0")}`;
const root = parseBlockId(uuid(1));
const textId = parseInlineContentId(uuid(2));
const opaqueId = parseInlineContentId(uuid(3));
const mixedTextId = parseInlineContentId(uuid(4));
const mixedOpaqueId = parseInlineContentId(uuid(5));
const origin = { id: "structure-author", kind: "human" } as const;
const pos = (digit: number, epoch = 1): LocalDensePosition => ({
  digits: [digit],
  run: uuid(900 + epoch),
  member: 1,
});
type Placement = StructuralPlacement<LocalDensePosition>;

/**
 * Measure integrated structural operations on one fresh candidate.
 *
 * @remarks
 * Mutation intervals exclude setup, checking and projection. Snapshot/projection,
 * encode, merge and reload are separately timed. Expected order, parentage,
 * payloads and placements are built from fixture input rather than the carrier.
 */
export function measureStructuralStress(
  factory: IntegratedDocumentCarrierFactory<LocalDensePosition>,
  profile: StructuralStressProfile,
  now: () => number,
): Record<string, unknown> {
  const { siblings, subtree, depth, repeatedMoves } = profile;
  if (
    ![siblings, subtree, depth, repeatedMoves].every(Number.isSafeInteger) ||
    siblings < 3 ||
    subtree < 2 ||
    depth < 2 ||
    depth > subtree ||
    repeatedMoves < 1 ||
    siblings + subtree > 1000
  )
    throw new RangeError("Invalid structural stress profile.");
  const siblingIds = Array.from({ length: siblings }, (_, i) =>
    parseBlockId(uuid(1000 + i)),
  );
  const subtreeIds = Array.from({ length: subtree }, (_, i) =>
    parseBlockId(uuid(3000 + i)),
  );
  const created = parseBlockId(uuid(5000));
  const mixed = parseBlockId(uuid(5001));
  const deleted = siblingIds[siblings - 1]!;
  const anchor = siblingIds[0]!;
  const parent = new Map<BlockId, BlockId>();
  const positions = new Map<BlockId, Placement>();
  const live = new Map<BlockId, boolean>([[root, true]]);
  const add = (
    id: BlockId,
    digit: number,
    d: number,
    parentId: BlockId,
    epoch = 1,
  ) => {
    positions.set(id, { position: pos(digit, epoch), depth: d });
    parent.set(id, parentId);
    live.set(id, true);
  };
  add(anchor, 100, 1, root);
  subtreeIds.forEach((id, i) =>
    add(
      id,
      110 + i,
      Math.min(i + 1, depth),
      i === 0 ? root : subtreeIds[Math.min(i - 1, depth - 2)]!,
    ),
  );
  siblingIds.slice(1).forEach((id, i) => add(id, 500 + i, 1, root));
  const carrier = factory.create(root);
  const [, initMs] = timed(now, () =>
    carrier.applyChange({
      placements: [...positions].map(([blockId, placement]) => ({
        blockId,
        placement,
      })),
      inlineContents: [
        { inlineContentId: textId, blockId: root },
        { inlineContentId: opaqueId, blockId: anchor },
      ],
      payloads: [
        {
          kind: "replace-text",
          inlineContentId: textId,
          mediaType: "text/plain",
          text: "alpha",
          origin,
        },
        {
          kind: "replace-opaque",
          inlineContentId: opaqueId,
          mediaType: "application/example",
          bytes: Uint8Array.of(1, 2, 3),
          origin,
        },
      ],
      context: { actorId: "structural-stress", effectId: "init" },
    }),
  );
  let mixedPresent = false;
  let currentText = "alpha";
  const verify = (snapshot: IntegratedDocumentSnapshot<LocalDensePosition>) => {
    if (
      !equal(snapshot.blockLiveness, live) ||
      !equal(snapshot.placements, positions)
    )
      throw Error(
        "Structural identities, liveness or placements differ from fixture.",
      );
    const owners = new Map([
      [textId, root],
      [opaqueId, anchor],
      ...(mixedPresent
        ? [[mixedTextId, mixed] as const, [mixedOpaqueId, mixed] as const]
        : []),
    ]);
    if (!equal(snapshot.inlineContentOwners, owners))
      throw Error("InlineContent ownership differs from fixture.");
    const payloads = new Map<string, unknown>();
    payloads.set(textId, {
      kind: "text",
      mediaType: "text/plain",
      text: currentText,
      spans: [{ text: currentText, origin }],
    });
    payloads.set(opaqueId, {
      kind: "opaque",
      mediaType: "application/example",
      bytes: Uint8Array.of(1, 2, 3),
      origin,
    });
    if (mixedPresent) {
      payloads.set(mixedTextId, {
        kind: "text",
        mediaType: "text/plain",
        text: "new",
        spans: [{ text: "new", origin }],
      });
      payloads.set(mixedOpaqueId, {
        kind: "opaque",
        mediaType: "application/example",
        bytes: Uint8Array.of(4, 5),
        origin,
      });
    }
    if (!equal(snapshot.payloads, payloads))
      throw Error("Structural transaction payload differs from fixture.");
    const projected = projectStructuralSnapshot(
      {
        rootId: root,
        entries: [
          { blockId: root },
          ...[...snapshot.placements].map(([blockId, placement]) => ({
            blockId,
            placement,
          })),
        ],
      },
      localDensePositionAllocator,
    );
    const expected = [
      { blockId: root, depth: 0 },
      ...[...positions]
        .sort(([, a], [, b]) => a.position.digits[0]! - b.position.digits[0]!)
        .map(([blockId, placement]) => ({
          blockId,
          parentId: parent.get(blockId)!,
          depth: placement.depth,
        })),
    ];
    if (!equal(projected, expected))
      throw Error("Projected preorder or parentage differs from fixture.");
  };
  verify(carrier.snapshot());
  const encode = () => timed(now, () => carrier.encode());
  const [initialBytes, initialEncodeMs] = encode();
  const createPlacement = { position: pos(50, 2), depth: 1 };
  const [, createMs] = timed(now, () =>
    carrier.applyChange({
      placements: [{ blockId: created, placement: createPlacement }],
      context: { actorId: "structural-stress", effectId: "create" },
    }),
  );
  add(created, 50, 1, root, 2);
  verify(carrier.snapshot());
  const movePlacement = { position: pos(60000, 3), depth: 1 };
  const [, moveMs] = timed(now, () =>
    carrier.applyChange({
      placements: [{ blockId: anchor, placement: movePlacement }],
      context: { actorId: "structural-stress", effectId: "move" },
    }),
  );
  add(anchor, 60000, 1, root, 3);
  verify(carrier.snapshot());
  const moveSubtree = (iteration: number) => {
    const start = iteration % 2 === 0 ? 20 : 40000;
    const updates = subtreeIds.map((blockId, i) => ({
      blockId,
      placement: {
        position: pos(start + i, iteration + 10),
        depth: Math.min(i + 1, depth),
      },
    }));
    const [, ms] = timed(now, () =>
      carrier.applyChange({
        placements: updates,
        context: {
          actorId: "structural-stress",
          effectId: `subtree-${iteration}`,
        },
      }),
    );
    updates.forEach(({ blockId, placement }) =>
      positions.set(blockId, placement),
    );
    verify(carrier.snapshot());
    return ms;
  };
  const subtreeMoveMs = moveSubtree(0);
  const repeatedMoveMs = Array.from({ length: repeatedMoves }, (_, i) =>
    moveSubtree(i + 1),
  );
  const [, deleteMs] = timed(now, () =>
    carrier.applyChange({
      deleteBlockIds: [deleted],
      context: { actorId: "structural-stress", effectId: "delete" },
    }),
  );
  positions.delete(deleted);
  live.set(deleted, false);
  verify(carrier.snapshot());
  const before = carrier.snapshot();
  const beforeEncoded = carrier.encode();
  const beforeEffects = carrier.effects();
  let rejected = false;
  try {
    carrier.applyChange({
      placements: [
        { blockId: mixed, placement: { position: pos(5, 50), depth: 1 } },
      ],
      payloads: [
        {
          kind: "insert-text",
          inlineContentId: parseInlineContentId(uuid(9999)),
          offset: 0,
          text: "x",
          origin,
        },
      ],
    });
  } catch {
    rejected = true;
  }
  if (
    !rejected ||
    !equal(carrier.snapshot(), before) ||
    !equal(carrier.encode(), beforeEncoded) ||
    !equal(carrier.effects(), beforeEffects)
  )
    throw Error("Invalid mixed transaction was not atomically rejected.");
  const [, mixedMs] = timed(now, () =>
    carrier.applyChange({
      placements: [
        { blockId: mixed, placement: { position: pos(5, 51), depth: 1 } },
      ],
      inlineContents: [
        { inlineContentId: mixedTextId, blockId: mixed },
        { inlineContentId: mixedOpaqueId, blockId: mixed },
      ],
      payloads: [
        {
          kind: "insert-text",
          inlineContentId: textId,
          offset: 5,
          text: "!",
          origin,
        },
        {
          kind: "replace-text",
          inlineContentId: mixedTextId,
          mediaType: "text/plain",
          text: "new",
          origin,
        },
        {
          kind: "replace-opaque",
          inlineContentId: mixedOpaqueId,
          mediaType: "application/example",
          bytes: Uint8Array.of(4, 5),
          origin,
        },
      ],
      context: { actorId: "structural-stress", effectId: "mixed" },
    }),
  );
  add(mixed, 5, 1, root, 51);
  mixedPresent = true;
  currentText = "alpha!";
  const [snapshot, snapshotMs] = timed(now, () => carrier.snapshot());
  verify(snapshot);
  const [, projectionMs] = timed(now, () =>
    projectStructuralSnapshot(
      {
        rootId: root,
        entries: [
          { blockId: root },
          ...[...snapshot.placements].map(([blockId, placement]) => ({
            blockId,
            placement,
          })),
        ],
      },
      localDensePositionAllocator,
    ),
  );
  const [encoded, encodeMs] = encode();
  const [reopened, reopenMs] = timed(now, () => factory.load(encoded));
  verify(reopened.snapshot());
  // Two independent concurrent transactions update distinct existing Blocks.
  const left = factory.load(encoded),
    right = factory.load(encoded);
  const leftPlacement = { position: pos(55000, 70), depth: 1 };
  const rightPlacement = { position: pos(57000, 71), depth: 1 };
  const other = siblingIds[1]!;
  left.applyChange({
    placements: [{ blockId: anchor, placement: leftPlacement }],
    context: { actorId: "left", effectId: "move" },
  });
  right.applyChange({
    placements: [{ blockId: other, placement: rightPlacement }],
    context: { actorId: "right", effectId: "move" },
  });
  const leftBytes = left.encode(),
    rightBytes = right.encode();
  const [, mergeLeftMs] = timed(now, () => left.mergeEncoded(rightBytes));
  const [, mergeRightMs] = timed(now, () => right.mergeEncoded(leftBytes));
  positions.set(anchor, leftPlacement);
  positions.set(other, rightPlacement);
  verify(left.snapshot());
  verify(right.snapshot());
  if (!equal(left.snapshot(), right.snapshot()))
    throw Error("Concurrent structural changes failed to converge.");
  const [mergedEncoded, mergedEncodeMs] = timed(now, () => left.encode());
  verify(factory.load(mergedEncoded).snapshot());
  return {
    candidate: factory.candidate,
    profile,
    initMs,
    createMs,
    moveMs,
    subtreeMoveMs,
    repeatedMoveMs,
    deleteMs,
    mixedMs,
    snapshotMs,
    projectionMs,
    initialEncodeMs,
    encodeMs,
    reopenMs,
    mergeLeftMs,
    mergeRightMs,
    mergedEncodeMs,
    initialBytes: initialBytes.length,
    encodedBytes: encoded.length,
    mergedBytes: mergedEncoded.length,
    atomicRefusal: true,
  };
}

function timed<T>(now: () => number, fn: () => T): [T, number] {
  const start = now();
  const value = fn();
  return [value, now() - start];
}

// The qualification snapshots use maps and bytes. Canonicalize their values so
// equality does not depend on Map insertion order or property order.
function equal(left: unknown, right: unknown): boolean {
  const canonical = (value: unknown) =>
    JSON.stringify(value, (_key, item: unknown) => {
      if (item instanceof Map)
        return [...item.entries()].sort(([a], [b]) =>
          String(a).localeCompare(String(b)),
        );
      if (item instanceof Uint8Array) return [...item];
      if (item && typeof item === "object" && !Array.isArray(item))
        return Object.fromEntries(
          Object.entries(item).sort(([a], [b]) => a.localeCompare(b)),
        );
      return item;
    });
  return canonical(left) === canonical(right);
}
