import { describe, expect, it } from "vitest";

import {
  applyStructuralOperations,
  createEmptyDocument,
  parseBlockId,
  parseDocumentId,
} from "../../../src/domain/index.js";
import type {
  BlockId,
  StructuralDocument,
  StructuralOperation,
} from "../../../src/domain/index.js";
import { planStructuralOperationPlacements } from "../../../src/carrier/structuralOperationPlacement.js";
import type {
  StructuralPlacement,
  StructuralProjectionSnapshot,
} from "../../../src/carrier/structuralCarrier.js";
import { createAutomergeStructuralCarrierFactory } from "./automergeStructuralCarrier.js";
import type {
  StructuralCarrier,
  StructuralCarrierFactory,
  StructuralCarrierSnapshot,
} from "./carrier.js";
import { projectStructuralSnapshot } from "./carrier.js";
import type {
  LocalDenseAllocationContext,
  LocalDensePosition,
} from "./localDensePosition.js";
import { localDensePositionAllocator } from "./localDensePosition.js";
import { createYjsStructuralCarrierFactory } from "./yjsStructuralCarrier.js";

const documentId = parseDocumentId(
  "70000000-0000-4000-8000-000000000001",
);
const rootId = parseBlockId("70000000-0000-4000-8000-000000000002");
const blockA = parseBlockId("70000000-0000-4000-8000-000000000003");
const blockB = parseBlockId("70000000-0000-4000-8000-000000000004");
const blockC = parseBlockId("70000000-0000-4000-8000-000000000005");
const blockD = parseBlockId("70000000-0000-4000-8000-000000000006");

type BlockPlacementOperation = Extract<
  StructuralOperation,
  { readonly kind: "CreateBlock" | "MoveBlock" }
>;

interface QualificationState {
  document: StructuralDocument;
  readonly carrier: StructuralCarrier<LocalDensePosition>;
  nextRun: number;
}

const factories = [
  createYjsStructuralCarrierFactory(localDensePositionAllocator),
  createAutomergeStructuralCarrierFactory(localDensePositionAllocator),
];

for (const factory of factories) {
  describe(factory.candidate + " command-to-placement mapping", () => {
    it("maps first, last, and middle child creation through allocator positions", () => {
      const state = createState(factory);

      execute(state, createBlock(blockA, rootId, 0));
      execute(state, createBlock(blockB, blockA, 0));
      execute(state, createBlock(blockC, blockA, 1));
      execute(state, createBlock(blockD, blockA, 1));

      expectProjected(state, [
        [rootId, 0],
        [blockA, 1],
        [blockB, 2],
        [blockD, 2],
        [blockC, 2],
      ]);
    });

    it("moves one subtree as a fresh ordered run with one depth delta", () => {
      const state = createState(factory);
      execute(state, createBlock(blockA, rootId, 0));
      execute(state, createBlock(blockB, blockA, 0));
      execute(state, createBlock(blockC, blockB, 0));
      execute(state, createBlock(blockD, rootId, 1));

      const before = currentPlacement(state.carrier, blockA).position;
      const plan = execute(state, {
        kind: "MoveBlock",
        blockId: blockA,
        parentId: blockD,
        index: 0,
      });

      expect(plan.placements.map((entry) => entry.blockId)).toEqual([
        blockA,
        blockB,
        blockC,
      ]);
      expect(plan.placements.map((entry) => entry.placement.depth)).toEqual([
        2, 3, 4,
      ]);
      expect(
        localDensePositionAllocator.compare(
          before,
          currentPlacement(state.carrier, blockA).position,
        ),
      ).not.toBe(0);
      expectProjected(state, [
        [rootId, 0],
        [blockD, 1],
        [blockA, 2],
        [blockB, 3],
        [blockC, 4],
      ]);
    });

    it("normalizes a collided boundary with its dependent insertion", () => {
      const state = createState(factory);
      execute(state, createBlock(blockA, rootId, 0));
      execute(state, createBlock(blockB, rootId, 1));
      execute(state, createBlock(blockC, rootId, 2));

      const collidedPlacement = currentPlacement(state.carrier, blockB);
      state.carrier.applyChange({
        normalizations: [{ blockId: blockC, placement: collidedPlacement }],
      });
      expectProjected(state, [
        [rootId, 0],
        [blockA, 1],
        [blockB, 1],
        [blockC, 1],
      ]);

      const plan = execute(state, createBlock(blockD, rootId, 2));

      expect(plan.normalizations.map((entry) => entry.blockId)).toEqual([
        blockC,
      ]);
      expect(plan.placements.map((entry) => entry.blockId)).toEqual([blockD]);
      expectProjected(state, [
        [rootId, 0],
        [blockA, 1],
        [blockB, 1],
        [blockD, 1],
        [blockC, 1],
      ]);
    });

    it("keeps Step 2 operation rejection authoritative", () => {
      const state = createState(factory);
      const result = planStructuralOperationPlacements(
        state.document,
        projectionSnapshot(state.carrier.snapshot()),
        {
          kind: "MoveBlock",
          blockId: rootId,
          parentId: rootId,
          index: 0,
        },
        localDensePositionAllocator,
        allocationContexts(1),
      );

      expect(result.ok).toBe(false);
      if (result.ok) return;
      expect(result.error.kind).toBe("DomainRejected");
      expect(result.error.domainError?.kind).toBe("RootMutation");
    });

    it("rejects a carrier projection that does not match the logical document", () => {
      const state = createState(factory);
      state.carrier.applyChange({
        placements: [
          {
            blockId: blockA,
            placement: manualPlacement(1, 1),
            liveToken: "unexpected-a",
          },
        ],
      });

      const result = planStructuralOperationPlacements(
        state.document,
        projectionSnapshot(state.carrier.snapshot()),
        createBlock(blockB, rootId, 0),
        localDensePositionAllocator,
        allocationContexts(1),
      );

      expect(result.ok).toBe(false);
      if (result.ok) return;
      expect(result.error.kind).toBe("SnapshotMismatch");
    });
  });
}

function createState(
  factory: StructuralCarrierFactory<LocalDensePosition>,
): QualificationState {
  const created = createEmptyDocument({
    documentId,
    rootId,
    childrenPresentation: "sections",
  });
  if (!created.ok) {
    throw new Error(created.error.message);
  }
  return {
    document: created.value,
    carrier: factory.create(rootId),
    nextRun: 1,
  };
}

function createBlock(
  blockId: BlockId,
  parentId: BlockId,
  index: number,
): Extract<StructuralOperation, { readonly kind: "CreateBlock" }> {
  return {
    kind: "CreateBlock",
    blockId,
    parentId,
    index,
    tags: [],
    childrenPresentation: "sections",
  };
}

function execute(
  state: QualificationState,
  operation: BlockPlacementOperation,
) {
  const plan = planStructuralOperationPlacements(
    state.document,
    projectionSnapshot(state.carrier.snapshot()),
    operation,
    localDensePositionAllocator,
    allocationContexts(state.nextRun),
  );
  state.nextRun += 2;
  expect(plan.ok).toBe(true);
  if (!plan.ok) {
    throw new Error(plan.error.message);
  }

  state.carrier.applyChange({
    normalizations: plan.value.normalizations,
    placements: plan.value.placements.map((entry, index) => ({
      ...entry,
      liveToken: "operation-" + state.nextRun + "-" + index,
    })),
  });

  const applied = applyStructuralOperations(state.document, [operation]);
  if (!applied.ok) {
    throw new Error(applied.error.message);
  }
  state.document = applied.value;
  return plan.value;
}

function expectProjected(
  state: QualificationState,
  expected: readonly (readonly [BlockId, number])[],
): void {
  const projected = projectStructuralSnapshot(
    state.carrier.snapshot(),
    localDensePositionAllocator,
  );
  expect(projected.map((entry) => [entry.blockId, entry.depth])).toEqual(
    expected,
  );
}

function projectionSnapshot(
  snapshot: StructuralCarrierSnapshot<LocalDensePosition>,
): StructuralProjectionSnapshot<LocalDensePosition> {
  return {
    rootId: snapshot.rootId,
    entries: snapshot.entries
      .filter((entry) => entry.live)
      .map((entry) => ({
        blockId: entry.blockId,
        ...(entry.placement === undefined
          ? {}
          : { placement: entry.placement }),
      })),
  };
}

function currentPlacement(
  carrier: StructuralCarrier<LocalDensePosition>,
  blockId: BlockId,
): StructuralPlacement<LocalDensePosition> {
  const placement = carrier
    .snapshot()
    .entries.find((entry) => entry.blockId === blockId)?.placement;
  if (placement === undefined) {
    throw new Error("Missing placement for " + blockId);
  }
  return placement;
}

function allocationContexts(
  firstRun: number,
): {
  readonly normalization: LocalDenseAllocationContext;
  readonly operation: LocalDenseAllocationContext;
} {
  return {
    normalization: { runNonce: runNonce(firstRun) },
    operation: { runNonce: runNonce(firstRun + 1) },
  };
}

function runNonce(value: number): string {
  return (
    "80000000-0000-4000-8000-" + value.toString().padStart(12, "0")
  );
}

function manualPlacement(
  order: number,
  depth: number,
): StructuralPlacement<LocalDensePosition> {
  return {
    position: {
      digits: [order],
      run: "80000000-0000-4000-8000-000000000099",
      member: 1,
    },
    depth,
  };
}
