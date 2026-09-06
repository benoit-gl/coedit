import { describe, expect, it } from "vitest";

import {
  fractionalIndexPositionAllocator,
  type FractionalIndexAllocationContext,
  type FractionalIndexPosition,
} from "./fractionalIndexPosition.js";
import {
  fuguePositionAllocator,
  type FugueAllocationContext,
  type FugueStructuralPosition,
} from "./fuguePosition.js";
import type { StructuralPositionAllocator } from "./position.js";

const runA = "61000000-0000-4000-8000-000000000001";
const runB = "61000000-0000-4000-8000-000000000002";
const runC = "61000000-0000-4000-8000-000000000003";

interface Candidate<Position, Context> {
  readonly allocator: StructuralPositionAllocator<Position, Context>;
  readonly context: (runNonce: string) => Context;
}

const candidates: readonly Candidate<unknown, unknown>[] = [
  {
    allocator: fractionalIndexPositionAllocator as StructuralPositionAllocator<
      unknown,
      unknown
    >,
    context: (runNonce) =>
      ({ runNonce }) satisfies FractionalIndexAllocationContext,
  },
  {
    allocator: fuguePositionAllocator as StructuralPositionAllocator<
      unknown,
      unknown
    >,
    context: (runNonce) => ({ runNonce }) satisfies FugueAllocationContext,
  },
];

for (const candidate of candidates) {
  describe(`${candidate.allocator.candidate} structural position allocator`, () => {
    it("allocates before, after, and between existing positions", () => {
      const middle = allocate(candidate, undefined, undefined, 1, runA);
      expect(middle.ok).toBe(true);
      if (!middle.ok) return;

      const before = allocate(candidate, undefined, middle.value[0], 2, runB);
      const after = allocate(candidate, middle.value[0], undefined, 2, runC);
      expect(before.ok && after.ok).toBe(true);
      if (!before.ok || !after.ok) return;

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
      expectOrdered(candidate.allocator, between.value);
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

    it("survives repeated narrow-gap allocation without a semantic maximum", () => {
      const outer = allocate(candidate, undefined, undefined, 2, runA);
      expect(outer.ok).toBe(true);
      if (!outer.ok) return;

      let lower = outer.value[0];
      const upper = outer.value[1];
      for (let index = 0; index < 128; index += 1) {
        const nonce = `62000000-0000-4000-8000-${index
          .toString(16)
          .padStart(12, "0")}`;
        const next = allocate(candidate, lower, upper, 1, nonce);
        expect(next.ok).toBe(true);
        if (!next.ok) return;
        lower = next.value[0];
      }
      expect(candidate.allocator.compare(lower, upper)).toBeLessThan(0);
    });
  });
}

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
  allocator: StructuralPositionAllocator<Position, Context>,
  positions: readonly Position[],
): void {
  for (let index = 1; index < positions.length; index += 1) {
    expect(
      allocator.compare(positions[index - 1]!, positions[index]!),
    ).toBeLessThan(0);
  }
}

// Keep the concrete types referenced so changes to either adapter remain type-checked.
type _FractionalCandidatePosition = FractionalIndexPosition;
type _FugueCandidatePosition = FugueStructuralPosition;
