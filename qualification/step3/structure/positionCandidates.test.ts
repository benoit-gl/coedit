import { describe, expect, it } from "vitest";

import { planPositionCollisionNormalization } from "../../../src/carrier/index.js";
import { parseBlockId } from "../../../src/domain/index.js";
import { createAutomergeStructuralCarrierFactory } from "./automergeStructuralCarrier.js";
import {
  fractionalIndexPositionAllocator,
  type FractionalIndexAllocationContext,
} from "./fractionalIndexPosition.js";
import {
  fuguePositionAllocator,
  type FugueAllocationContext,
} from "./fuguePosition.js";
import {
  localDensePositionAllocator,
  type LocalDenseAllocationContext,
} from "./localDensePosition.js";
import {
  projectStructuralSnapshot,
  type QualificationPositionAllocator,
} from "./carrier.js";
import { createYjsStructuralCarrierFactory } from "./yjsStructuralCarrier.js";

const runA = "61000000-0000-4000-8000-000000000001";
const runB = "61000000-0000-4000-8000-000000000002";
const runC = "61000000-0000-4000-8000-000000000003";
const rootId = parseBlockId("61000000-0000-4000-8000-000000000010");
const anchorLeftId = parseBlockId("61000000-0000-4000-8000-000000000011");
const anchorRightId = parseBlockId("61000000-0000-4000-8000-000000000012");
const leftOneId = parseBlockId("61000000-0000-4000-8000-000000000013");
const leftTwoId = parseBlockId("61000000-0000-4000-8000-000000000014");
const rightOneId = parseBlockId("61000000-0000-4000-8000-000000000015");
const rightTwoId = parseBlockId("61000000-0000-4000-8000-000000000016");

interface Candidate<Position, Context> {
  readonly allocator: QualificationPositionAllocator<Position, Context>;
  readonly context: (runNonce: string) => Context;
  readonly expectedConcurrentRunTransitions: number;
  readonly expectedSubtreeParentMismatches: number;
}

const candidates: readonly Candidate<unknown, unknown>[] = [
  {
    allocator: fractionalIndexPositionAllocator,
    context: (runNonce) =>
      ({ runNonce }) satisfies FractionalIndexAllocationContext,
    expectedConcurrentRunTransitions: 7,
    expectedSubtreeParentMismatches: 1,
  },
  {
    allocator: fuguePositionAllocator,
    context: (runNonce) => ({ runNonce }) satisfies FugueAllocationContext,
    expectedConcurrentRunTransitions: 1,
    expectedSubtreeParentMismatches: 0,
  },
  {
    allocator: localDensePositionAllocator,
    context: (runNonce) => ({ runNonce }) satisfies LocalDenseAllocationContext,
    expectedConcurrentRunTransitions: 1,
    expectedSubtreeParentMismatches: 0,
  },
];

for (const candidate of candidates) {
  describe(`${candidate.allocator.candidate} structural position allocator`, () => {
    it("allocates before, after, and between existing positions", () => {
      const middle = allocate(candidate, undefined, undefined, 1, runA);
      expect(middle.ok).toBe(true);
      if (!middle.ok) return;
      expect(middle.value).toHaveLength(1);

      const before = allocate(candidate, undefined, middle.value[0], 2, runB);
      const after = allocate(candidate, middle.value[0], undefined, 2, runC);
      expect(before.ok && after.ok).toBe(true);
      if (!before.ok || !after.ok) return;
      expect(before.value).toHaveLength(2);
      expect(after.value).toHaveLength(2);
      expectOrdered(candidate.allocator, before.value);
      expectOrdered(candidate.allocator, after.value);

      expect(
        candidate.allocator.compare(before.value.at(-1), middle.value[0]),
      ).toBeLessThan(0);
      expect(
        candidate.allocator.compare(middle.value[0], after.value[0]),
      ).toBeLessThan(0);

      const between = allocate(
        candidate,
        before.value.at(-1),
        middle.value[0],
        3,
        runC,
      );
      expect(between.ok).toBe(true);
      if (!between.ok) return;
      expect(between.value).toHaveLength(3);
      expectOrdered(candidate.allocator, between.value);
      expect(
        candidate.allocator.compare(before.value.at(-1), between.value[0]),
      ).toBeLessThan(0);
      expect(
        candidate.allocator.compare(between.value.at(-1), middle.value[0]),
      ).toBeLessThan(0);
    });

    it("round trips candidate-private positions through the production codec", () => {
      const result = allocate(candidate, undefined, undefined, 3, runA);
      expect(result.ok).toBe(true);
      if (!result.ok) return;

      for (const position of result.value) {
        expect(
          candidate.allocator.decode(candidate.allocator.encode(position)),
        ).toEqual(position);
      }
    });

    it("keeps deterministic total order for concurrent same-destination runs", () => {
      const left = allocate(candidate, undefined, undefined, 4, runA);
      const right = allocate(candidate, undefined, undefined, 4, runB);
      expect(left.ok && right.ok).toBe(true);
      if (!left.ok || !right.ok) return;

      const firstOrder = [...left.value, ...right.value].sort((a, b) =>
        candidate.allocator.compare(a, b),
      );
      const secondOrder = [...right.value, ...left.value].sort((a, b) =>
        candidate.allocator.compare(a, b),
      );
      expect(secondOrder).toEqual(firstOrder);
    });

    it("characterizes concurrent same-destination run interleaving", () => {
      const left = allocate(candidate, undefined, undefined, 4, runA);
      const right = allocate(candidate, undefined, undefined, 4, runB);
      expect(left.ok && right.ok).toBe(true);
      if (!left.ok || !right.ok) return;

      const ordered = [
        ...left.value.map((position) => ({ position, run: "left" as const })),
        ...right.value.map((position) => ({ position, run: "right" as const })),
      ];
      ordered.sort((a, b) =>
        candidate.allocator.compare(a.position, b.position),
      );

      let transitions = 0;
      for (let index = 1; index < ordered.length; index += 1) {
        if (ordered[index - 1]!.run !== ordered[index]!.run) {
          transitions += 1;
        }
      }
      expect(transitions).toBe(candidate.expectedConcurrentRunTransitions);
    });

    it("maintains ordering across repeated narrow-gap allocations", () => {
      const outer = allocate(candidate, undefined, undefined, 2, runA);
      expect(outer.ok).toBe(true);
      if (!outer.ok) return;

      let lower = outer.value[0];
      const upper = outer.value[1];
      for (let index = 0; index < 4; index += 1) {
        const nonce = `62000000-0000-4000-8000-${index
          .toString(16)
          .padStart(12, "0")}`;
        const next = allocate(candidate, lower, upper, 1, nonce);
        expect(next.ok).toBe(true);
        if (!next.ok) return;
        expect(candidate.allocator.compare(lower, next.value[0])).toBeLessThan(0);
        expect(candidate.allocator.compare(next.value[0], upper)).toBeLessThan(0);
        lower = next.value[0];
      }
    });

    it("allocates fresh positions for repeated moves to the same destination", () => {
      const encoded = new Set<string>();
      for (let index = 0; index < 32; index += 1) {
        const nonce = `63000000-0000-4000-8000-${index
          .toString(16)
          .padStart(12, "0")}`;
        const next = allocate(candidate, undefined, undefined, 1, nonce);
        expect(next.ok).toBe(true);
        if (!next.ok) return;
        const value = candidate.allocator.encode(next.value[0]);
        expect(encoded.has(value)).toBe(false);
        encoded.add(value);
      }
    });

    it("normalizes an exact primary collision and supports continued insertion", () => {
      const outer = allocate(candidate, undefined, undefined, 2, runA);
      expect(outer.ok).toBe(true);
      if (!outer.ok) return;
      const lower = outer.value[0];
      const collided = candidate.allocator.decode(
        candidate.allocator.encode(lower),
      );
      const upper = outer.value[1];

      const normalization = planPositionCollisionNormalization(
        candidate.allocator,
        [lower, collided, upper],
        1,
        candidate.context(runB),
      );
      expect(normalization.ok).toBe(true);
      if (!normalization.ok) return;

      const insertion = candidate.allocator.allocateRun({
        lower: normalization.value.insertionLower,
        upper: normalization.value.insertionUpper,
        count: 1,
        context: candidate.context(runC),
      });
      expect(insertion.ok).toBe(true);
      if (!insertion.ok) return;
      expect(
        candidate.allocator.compare(
          normalization.value.insertionLower,
          insertion.value[0],
        ),
      ).toBeLessThan(0);
      expect(
        candidate.allocator.compare(
          insertion.value[0],
          normalization.value.insertionUpper,
        ),
      ).toBeLessThan(0);
    });

    for (const factory of [
      createYjsStructuralCarrierFactory(candidate.allocator),
      createAutomergeStructuralCarrierFactory(candidate.allocator),
    ]) {
      it(`converges ${factory.candidate} carrier state and characterizes nested same-destination runs`, () => {
        const anchors = allocate(candidate, undefined, undefined, 2, runA);
        expect(anchors.ok).toBe(true);
        if (!anchors.ok) return;
        const leftRun = allocate(
          candidate,
          anchors.value[0],
          anchors.value[1],
          2,
          runB,
        );
        const rightRun = allocate(
          candidate,
          anchors.value[0],
          anchors.value[1],
          2,
          runC,
        );
        expect(leftRun.ok && rightRun.ok).toBe(true);
        if (!leftRun.ok || !rightRun.ok) return;

        const base = factory.create(rootId);
        base.applyChange({
          placements: [
            {
              blockId: anchorLeftId,
              placement: { position: anchors.value[0], depth: 1 },
              liveToken: "anchor-left",
            },
            {
              blockId: anchorRightId,
              placement: { position: anchors.value[1], depth: 1 },
              liveToken: "anchor-right",
            },
          ],
        });
        const baseState = base.encode();
        const left = factory.load(baseState);
        const right = factory.load(baseState);
        left.applyChange({
          placements: [
            {
              blockId: leftOneId,
              placement: { position: leftRun.value[0], depth: 1 },
              liveToken: "left-one",
            },
            {
              blockId: leftTwoId,
              placement: { position: leftRun.value[1], depth: 2 },
              liveToken: "left-two",
            },
          ],
        });
        right.applyChange({
          placements: [
            {
              blockId: rightOneId,
              placement: { position: rightRun.value[0], depth: 1 },
              liveToken: "right-one",
            },
            {
              blockId: rightTwoId,
              placement: { position: rightRun.value[1], depth: 2 },
              liveToken: "right-two",
            },
          ],
        });

        const leftState = left.encode();
        const rightState = right.encode();
        const forward = factory.load(baseState);
        forward.mergeEncoded(leftState);
        forward.mergeEncoded(rightState);
        forward.mergeEncoded(leftState);
        const reverse = factory.load(baseState);
        reverse.mergeEncoded(rightState);
        reverse.mergeEncoded(leftState);
        reverse.mergeEncoded(rightState);

        expect(forward.snapshot()).toEqual(reverse.snapshot());
        expect(factory.load(forward.encode()).snapshot()).toEqual(
          forward.snapshot(),
        );
        const projected = projectStructuralSnapshot(
          forward.snapshot(),
          candidate.allocator,
        );
        expect(projected.map((entry) => entry.blockId)).toEqual(
          projectStructuralSnapshot(
            reverse.snapshot(),
            candidate.allocator,
          ).map((entry) => entry.blockId),
        );

        const subtreeParents = [
          { childId: leftTwoId, expectedParentId: leftOneId },
          { childId: rightTwoId, expectedParentId: rightOneId },
        ];
        const parentMismatches = subtreeParents.filter(
          ({ childId, expectedParentId }) =>
            projected.find((entry) => entry.blockId === childId)?.parentId !==
            expectedParentId,
        );
        expect(parentMismatches).toHaveLength(
          candidate.expectedSubtreeParentMismatches,
        );
      });
    }
  });
}

describe("fractional-indexing position codec", () => {
  it("rejects malformed candidate keys during decode", () => {
    expect(() =>
      fractionalIndexPositionAllocator.decode(
        JSON.stringify({ key: "!", run: runA, member: 1 }),
      ),
    ).toThrow(/invalid/u);
  });
});

describe("Fugue qualification entropy", () => {
  it("keeps distinct UUID run identities distinct after deterministic seeding", () => {
    const first = fuguePositionAllocator.allocateRun({
      count: 1,
      context: { runNonce: "af142b9e-123d-4d56-adf4-feab65a1bf16" },
    });
    const second = fuguePositionAllocator.allocateRun({
      count: 1,
      context: { runNonce: "ba4a8f39-4f76-4859-a452-b6a5a537d759" },
    });
    expect(first.ok && second.ok).toBe(true);
    if (!first.ok || !second.ok) return;
    expect(first.value).not.toEqual(second.value);
  });
});

function allocate<Position, Context>(
  candidate: Candidate<Position, Context>,
  lower: Position | undefined,
  upper: Position | undefined,
  count: number,
  runNonce: string,
) {
  return candidate.allocator.allocateRun({
    ...(lower === undefined ? {} : { lower }),
    ...(upper === undefined ? {} : { upper }),
    count,
    context: candidate.context(runNonce),
  });
}

function expectOrdered<Position, Context>(
  allocator: QualificationPositionAllocator<Position, Context>,
  positions: readonly Position[],
): void {
  for (let index = 1; index < positions.length; index += 1) {
    expect(
      allocator.compare(positions[index - 1]!, positions[index]!),
    ).toBeLessThan(0);
  }
}
