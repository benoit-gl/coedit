import { describe, expect, it } from "vitest";

import { parseBlockId } from "../domain/ids.js";
import type { BlockId } from "../domain/ids.js";
import { automergeStructuralCarrierFactory } from "./automergeStructuralCarrier.js";
import type { StructuralCarrierFactory, StructuralPlacement } from "./structuralCarrier.js";
import { projectStructuralSnapshot } from "./structuralCarrier.js";
import { yjsStructuralCarrierFactory } from "./yjsStructuralCarrier.js";

const rootId = parseBlockId("50000000-0000-4000-8000-000000000001");
const blockA = parseBlockId("50000000-0000-4000-8000-000000000002");
const blockB = parseBlockId("50000000-0000-4000-8000-000000000003");
const blockC = parseBlockId("50000000-0000-4000-8000-000000000004");

for (const factory of [
  yjsStructuralCarrierFactory,
  automergeStructuralCarrierFactory,
]) {
  describe(`${factory.candidate} structural carrier`, () => {
    it("keeps one immutable live root and projects non-sequential depths", () => {
      const carrier = factory.create(rootId);
      carrier.applyChange({
        placements: [
          placement(blockA, 1, 1, "a-create"),
          placement(blockB, 2, 3, "b-create"),
          placement(blockC, 3, 1, "c-create"),
        ],
      });

      expect(
        projectStructuralSnapshot(carrier.snapshot()).map(({ blockId, parentId, depth }) => ({
          blockId,
          parentId,
          depth,
        })),
      ).toEqual([
        { blockId: rootId, parentId: undefined, depth: 0 },
        { blockId: blockA, parentId: rootId, depth: 1 },
        { blockId: blockB, parentId: blockA, depth: 3 },
        { blockId: blockC, parentId: rootId, depth: 1 },
      ]);
      expect(() =>
        carrier.applyChange({ deletes: [rootId] }),
      ).toThrow(/root/u);
    });

    it("moves an ordered subtree run atomically with one depth delta", () => {
      const carrier = createTree(factory);
      carrier.applyChange({
        placements: [
          placement(blockA, 4, 1, "a-move"),
          placement(blockB, 5, 2, "b-move"),
        ],
      });

      const projected = projectStructuralSnapshot(carrier.snapshot());
      expect(projected.map((entry) => entry.blockId)).toEqual([
        rootId,
        blockC,
        blockA,
        blockB,
      ]);
      expect(projected.find((entry) => entry.blockId === blockB)?.parentId).toBe(
        blockA,
      );
    });

    it("converges concurrent moves of one Block to one deterministic placement", () => {
      const base = createTree(factory);
      const left = factory.load(base.encode());
      const right = factory.load(base.encode());

      left.applyChange({
        placements: [placement(blockA, 4, 1, "a-left-move")],
      });
      right.applyChange({
        placements: [placement(blockA, 6, 2, "a-right-move")],
      });
      converge(left, right);

      expect(left.snapshot()).toEqual(right.snapshot());
    });

    it("lets a concurrent semantic payload update win over deletion", () => {
      const base = factory.create(rootId);
      base.applyChange({ placements: [placement(blockA, 1, 1, "a-create")] });
      const left = factory.load(base.encode());
      const right = factory.load(base.encode());

      left.applyChange({ deletes: [blockA] });
      right.applyChange({
        payloads: [
          {
            blockId: blockA,
            key: "childrenPresentation",
            value: "sections",
            liveToken: "a-payload-update",
          },
        ],
      });
      converge(left, right);

      const entry = left.snapshot().entries.find((value) => value.blockId === blockA);
      expect(entry?.live).toBe(true);
      expect(entry?.payload.childrenPresentation).toBe("sections");
      expect(left.snapshot()).toEqual(right.snapshot());
    });

    it("lets a concurrent move win over deletion", () => {
      const base = factory.create(rootId);
      base.applyChange({ placements: [placement(blockA, 1, 1, "a-create")] });
      const left = factory.load(base.encode());
      const right = factory.load(base.encode());

      left.applyChange({ deletes: [blockA] });
      right.applyChange({ placements: [placement(blockA, 3, 1, "a-move")] });
      converge(left, right);

      expect(
        left.snapshot().entries.find((value) => value.blockId === blockA)?.live,
      ).toBe(true);
      expect(left.snapshot()).toEqual(right.snapshot());
    });

    it("does not keep a deleted ancestor alive because a descendant changed", () => {
      const base = createTree(factory);
      const left = factory.load(base.encode());
      const right = factory.load(base.encode());

      left.applyChange({ deletes: [blockA, blockB] });
      right.applyChange({
        payloads: [
          {
            blockId: blockB,
            key: "tag",
            value: "updated",
            liveToken: "b-update",
          },
        ],
      });
      converge(left, right);

      const snapshot = left.snapshot();
      expect(snapshot.entries.find((entry) => entry.blockId === blockA)?.live).toBe(
        false,
      );
      expect(snapshot.entries.find((entry) => entry.blockId === blockB)?.live).toBe(
        true,
      );
      expect(
        projectStructuralSnapshot(snapshot).find((entry) => entry.blockId === blockB)
          ?.parentId,
      ).toBe(rootId);
    });

    it("publishes placement and several Block-local payload updates together", () => {
      const carrier = factory.create(rootId);
      carrier.applyChange({
        placements: [placement(blockA, 1, 1, "a-create")],
        payloads: [
          {
            blockId: blockA,
            key: "inline:first",
            value: "alpha",
            liveToken: "a-inline-first",
          },
          {
            blockId: blockA,
            key: "inline:second",
            value: "beta",
            liveToken: "a-inline-second",
          },
        ],
      });

      const entry = carrier.snapshot().entries.find((value) => value.blockId === blockA);
      expect(entry).toMatchObject({
        live: true,
        payload: { "inline:first": "alpha", "inline:second": "beta" },
      });
    });

    it("uses BlockId as a deterministic tie-break for exact position collisions", () => {
      const carrier = factory.create(rootId);
      carrier.applyChange({
        placements: [
          placement(blockB, 1, 1, "b-create"),
          placement(blockA, 1, 1, "a-create"),
        ],
      });

      expect(projectStructuralSnapshot(carrier.snapshot()).map((entry) => entry.blockId)).toEqual([
        rootId,
        blockA,
        blockB,
      ]);
    });

    it("survives complete reload and duplicate replicated delivery", () => {
      const carrier = createTree(factory);
      const encoded = carrier.encode();
      const reloaded = factory.load(encoded);
      reloaded.mergeEncoded(encoded);

      expect(reloaded.snapshot()).toEqual(carrier.snapshot());
      expect(projectStructuralSnapshot(reloaded.snapshot())).toEqual(
        projectStructuralSnapshot(carrier.snapshot()),
      );
    });
  });
}

function createTree(factory: StructuralCarrierFactory) {
  const carrier = factory.create(rootId);
  carrier.applyChange({
    placements: [
      placement(blockA, 1, 1, "a-create"),
      placement(blockB, 2, 2, "b-create"),
      placement(blockC, 3, 1, "c-create"),
    ],
  });
  return carrier;
}

function placement(
  blockId: BlockId,
  order: number,
  depth: number,
  liveToken: string,
) {
  return {
    blockId,
    placement: position(order, depth),
    liveToken,
  } as const;
}

function position(order: number, depth: number): StructuralPlacement {
  return {
    position: { digits: [order], run: "qualification", member: 0 },
    depth,
  };
}

function converge(
  left: ReturnType<StructuralCarrierFactory["create"]>,
  right: ReturnType<StructuralCarrierFactory["create"]>,
): void {
  const leftState = left.encode();
  const rightState = right.encode();
  left.mergeEncoded(rightState);
  right.mergeEncoded(leftState);
}
