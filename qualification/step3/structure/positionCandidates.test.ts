import { describe, expect, it } from "vitest";

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
import type { QualificationPositionAllocator } from "./carrier.js";

const runA = "61000000-0000-4000-8000-000000000001";
const runB = "61000000-0000-4000-8000-000000000002";
const runC = "61000000-0000-4000-8000-000000000003";

interface Candidate<Position, Context> {
  readonly allocator: QualificationPositionAllocator<Position, Context>;
  readonly context: (runNonce: string) => Context;
  readonly sameDestinationPrimaryCollisions: number;
  readonly sameDestinationTransitions: number;
}

const candidates: readonly Candidate<unknown, unknown>[] = [
  {
    allocator: fractionalIndexPositionAllocator,
    context: (runNonce) =>
      ({ runNonce }) satisfies FractionalIndexAllocationContext,
    sameDestinationPrimaryCollisions: 4,
    sameDestinationTransitions: 7,
  },
  {
    allocator: fuguePositionAllocator,
    context: (runNonce) => ({ runNonce }) satisfies FugueAllocationContext,
    sameDestinationPrimaryCollisions: 0,
    sameDestinationTransitions: 1,
  },
  {
    allocator: localDensePositionAllocator,
    context: (runNonce) => ({ runNonce }) satisfies LocalDenseAllocationContext,
    sameDestinationPrimaryCollisions: 0,
    sameDestinationTransitions: 1,
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

    it("records concurrent same-destination collision and interleaving behavior", () => {
      const left = allocate(candidate, undefined, undefined, 4, runA);
      const right = allocate(candidate, undefined, undefined, 4, runB);
      expect(left.ok && right.ok).toBe(true);
      if (!left.ok || !right.ok) return;

      let primaryCollisions = 0;
      for (let index = 0; index < left.value.length; index += 1) {
        if (
          candidate.allocator.comparePrimary(
            left.value[index],
            right.value[index],
          ) === 0
        ) {
          primaryCollisions += 1;
        }
      }
      expect(primaryCollisions).toBe(
        candidate.sameDestinationPrimaryCollisions,
      );

      const labels = [
        ...left.value.map((position) => ({
          position,
          label: "left" as const,
        })),
        ...right.value.map((position) => ({
          position,
          label: "right" as const,
        })),
      ]
        .sort((a, b) => candidate.allocator.compare(a.position, b.position))
        .map(({ label }) => label);
      expect(countTransitions(labels)).toBe(
        candidate.sameDestinationTransitions,
      );
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

function countTransitions(values: readonly string[]): number {
  let transitions = 0;
  for (let index = 1; index < values.length; index += 1) {
    if (values[index - 1] !== values[index]) {
      transitions += 1;
    }
  }
  return transitions;
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
  allocator: QualificationPositionAllocator<Position, Context>,
  positions: readonly Position[],
): void {
  for (let index = 1; index < positions.length; index += 1) {
    expect(
      allocator.compare(positions[index - 1]!, positions[index]!),
    ).toBeLessThan(0);
  }
}
