import { describe, expect, it } from "vitest";

import { parseBlockId } from "../../../src/domain/index.js";
import type { BlockId } from "../../../src/domain/index.js";
import { createAutomergeStructuralCarrierFactory } from "./automergeStructuralCarrier.js";
import type { LocalDensePosition } from "./localDensePosition.js";
import { localDensePositionAllocator } from "./localDensePosition.js";
import type { StructuralPlacement } from "../../../src/carrier/structuralCarrier.js";
import type { StructuralCarrierFactory } from "./carrier.js";
import { projectStructuralSnapshot } from "./carrier.js";
import { createYjsStructuralCarrierFactory } from "./yjsStructuralCarrier.js";

const rootId = parseBlockId("50000000-0000-4000-8000-000000000001");
const otherRootId = parseBlockId("50000000-0000-4000-8000-000000000099");
const blockA = parseBlockId("50000000-0000-4000-8000-000000000002");
const blockB = parseBlockId("50000000-0000-4000-8000-000000000003");
const blockC = parseBlockId("50000000-0000-4000-8000-000000000004");

const structuralCarrierFactories = [
  createYjsStructuralCarrierFactory(localDensePositionAllocator),
  createAutomergeStructuralCarrierFactory(localDensePositionAllocator),
];

for (const factory of structuralCarrierFactories) {
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
        projectStructuralSnapshot(
          carrier.snapshot(),
          localDensePositionAllocator,
        ).map(({ blockId, parentId, depth }) => ({
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
      expect(() => carrier.applyChange({ deletes: [rootId] })).toThrow(/root/u);
    });

    it("rejects a live non-root Block without a placement instead of hiding it", () => {
      expect(() =>
        projectStructuralSnapshot(
          {
            rootId,
            entries: [
              { blockId: rootId, payload: {}, live: true },
              { blockId: blockA, payload: {}, live: true },
            ],
          },
          localDensePositionAllocator,
        ),
      ).toThrow(/requires a placement/u);
    });

    it("rejects depth zero for every non-root placement", () => {
      const carrier = factory.create(rootId);
      expect(() =>
        carrier.applyChange({
          placements: [placement(blockA, 1, 0, "a-invalid-depth")],
        }),
      ).toThrow(/positive integer/u);
      expect(carrier.snapshot().entries).toHaveLength(1);
    });

    it("moves an ordered subtree run atomically with one depth delta", () => {
      const carrier = createTree(factory);
      carrier.applyChange({
        placements: [
          placement(blockA, 4, 1, "a-move"),
          placement(blockB, 5, 2, "b-move"),
        ],
      });

      const projected = projectStructuralSnapshot(
        carrier.snapshot(),
        localDensePositionAllocator,
      );
      expect(projected.map((entry) => entry.blockId)).toEqual([
        rootId,
        blockC,
        blockA,
        blockB,
      ]);
      expect(
        projected.find((entry) => entry.blockId === blockB)?.parentId,
      ).toBe(blockA);
    });

    it("rejects a late invalid operation without partial publication", () => {
      const carrier = factory.create(rootId);
      carrier.applyChange({
        placements: [placement(blockA, 1, 1, "a-create")],
      });
      const before = carrier.snapshot();

      expect(() =>
        carrier.applyChange({
          deletes: [blockA],
          payloads: [
            {
              blockId: blockB,
              key: "tag",
              value: "invalid",
              liveToken: "b-invalid-update",
            },
          ],
        }),
      ).toThrow(/existing Block namespace/u);

      expect(carrier.snapshot()).toEqual(before);
    });

    it("survives repeated subtree moves with fresh placements", () => {
      const carrier = createTree(factory);
      carrier.applyChange({
        placements: [placement(blockC, 1_000, 1, "c-anchor")],
      });

      for (let index = 0; index < 32; index += 1) {
        const beforeC = index % 2 === 0;
        const start = beforeC ? 10 + index * 2 : 2_000 + index * 2;
        carrier.applyChange({
          placements: [
            placement(blockA, start, 1, `a-move-${index}`),
            placement(blockB, start + 1, 2, `b-move-${index}`),
          ],
        });

        expect(
          projectStructuralSnapshot(
            carrier.snapshot(),
            localDensePositionAllocator,
          ).map((entry) => entry.blockId),
        ).toEqual(
          beforeC
            ? [rootId, blockA, blockB, blockC]
            : [rootId, blockC, blockA, blockB],
        );
      }

      expect(factory.load(carrier.encode()).snapshot()).toEqual(
        carrier.snapshot(),
      );
    });

    it("converges concurrent moves to one complete submitted placement", () => {
      const base = createTree(factory);
      const left = factory.load(base.encode());
      const right = factory.load(base.encode());
      const leftPlacement = position(4, 1);
      const rightPlacement = position(6, 2);

      left.applyChange({
        placements: [
          {
            blockId: blockA,
            placement: leftPlacement,
            liveToken: "a-left-move",
          },
        ],
      });
      right.applyChange({
        placements: [
          {
            blockId: blockA,
            placement: rightPlacement,
            liveToken: "a-right-move",
          },
        ],
      });
      converge(left, right);

      const convergedPlacement = left
        .snapshot()
        .entries.find((entry) => entry.blockId === blockA)?.placement;
      expect([leftPlacement, rightPlacement]).toContainEqual(
        convergedPlacement,
      );
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

      const entry = left
        .snapshot()
        .entries.find((value) => value.blockId === blockA);
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

    it("does not resurrect a Block when normalization is concurrent with deletion", () => {
      const base = factory.create(rootId);
      base.applyChange({ placements: [placement(blockA, 1, 1, "a-create")] });
      const left = factory.load(base.encode());
      const right = factory.load(base.encode());

      left.applyChange({ deletes: [blockA] });
      right.applyChange({
        normalizations: [{ blockId: blockA, placement: position(2, 1) }],
      });
      converge(left, right);

      const entry = left
        .snapshot()
        .entries.find((value) => value.blockId === blockA);
      expect(entry?.live).toBe(false);
      expect(left.snapshot()).toEqual(right.snapshot());
    });

    it("replicates collision normalization and its dependent insertion together", () => {
      const base = factory.create(rootId);
      base.applyChange({
        placements: [
          placement(blockA, 1, 1, "a-create"),
          placement(blockB, 1, 1, "b-create"),
        ],
      });
      const writer = factory.load(base.encode());
      const peer = factory.load(base.encode());

      writer.applyChange({
        normalizations: [{ blockId: blockB, placement: position(3, 1) }],
        placements: [placement(blockC, 2, 1, "c-create")],
      });
      peer.mergeEncoded(writer.encode());

      expect(
        projectStructuralSnapshot(
          peer.snapshot(),
          localDensePositionAllocator,
        ).map((entry) => entry.blockId),
      ).toEqual([rootId, blockA, blockC, blockB]);
      expect(peer.snapshot()).toEqual(writer.snapshot());
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
      expect(
        snapshot.entries.find((entry) => entry.blockId === blockA)?.live,
      ).toBe(false);
      expect(
        snapshot.entries.find((entry) => entry.blockId === blockB)?.live,
      ).toBe(true);
      expect(
        projectStructuralSnapshot(snapshot, localDensePositionAllocator).find(
          (entry) => entry.blockId === blockB,
        )?.parentId,
      ).toBe(rootId);
    });

    it("uses BlockId as a deterministic tie-break for exact position collisions", () => {
      const carrier = factory.create(rootId);
      carrier.applyChange({
        placements: [
          placement(blockB, 1, 1, "b-create"),
          placement(blockA, 1, 1, "a-create"),
        ],
      });

      expect(
        projectStructuralSnapshot(
          carrier.snapshot(),
          localDensePositionAllocator,
        ).map((entry) => entry.blockId),
      ).toEqual([rootId, blockA, blockB]);
    });

    it("rejects encoded state from a different structural root atomically", () => {
      const local = factory.create(rootId);
      local.applyChange({
        placements: [placement(blockA, 1, 1, "local-a-create")],
      });
      const foreign = factory.create(otherRootId);
      foreign.applyChange({
        placements: [placement(blockB, 1, 1, "foreign-b-create")],
      });
      const before = local.snapshot();

      expect(() => local.mergeEncoded(foreign.encode())).toThrow(
        /share one root identity/u,
      );
      expect(local.snapshot()).toEqual(before);
    });

    it("survives complete reload and duplicate replicated delivery", () => {
      const carrier = createTree(factory);
      const encoded = carrier.encode();
      const reloaded = factory.load(encoded);
      reloaded.mergeEncoded(encoded);

      expect(reloaded.snapshot()).toEqual(carrier.snapshot());
      expect(
        projectStructuralSnapshot(
          reloaded.snapshot(),
          localDensePositionAllocator,
        ),
      ).toEqual(
        projectStructuralSnapshot(
          carrier.snapshot(),
          localDensePositionAllocator,
        ),
      );
    });

    it("preserves update-over-delete after convergence and complete reload", () => {
      const base = factory.create(rootId);
      base.applyChange({ placements: [placement(blockA, 1, 1, "a-create")] });
      const deletion = factory.load(base.encode());
      const update = factory.load(base.encode());
      deletion.applyChange({ deletes: [blockA] });
      update.applyChange({
        payloads: [
          {
            blockId: blockA,
            key: "tag",
            value: "retained",
            liveToken: "a-update",
          },
        ],
      });
      converge(deletion, update);

      const reloaded = factory.load(deletion.encode());
      const entry = reloaded
        .snapshot()
        .entries.find((value) => value.blockId === blockA);
      expect(entry?.live).toBe(true);
      expect(entry?.payload.tag).toBe("retained");
    });
  });
}

function createTree(factory: StructuralCarrierFactory<LocalDensePosition>) {
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

function position(
  order: number,
  depth: number,
): StructuralPlacement<LocalDensePosition> {
  return {
    position: {
      digits: [order],
      run: "60000000-0000-4000-8000-000000000099",
      member: 1,
    },
    depth,
  };
}

function converge(
  left: ReturnType<StructuralCarrierFactory<LocalDensePosition>["create"]>,
  right: ReturnType<StructuralCarrierFactory<LocalDensePosition>["create"]>,
): void {
  const leftState = left.encode();
  const rightState = right.encode();
  left.mergeEncoded(rightState);
  right.mergeEncoded(leftState);
}
