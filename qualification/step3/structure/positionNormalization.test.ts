import { describe, expect, it } from "vitest";

import type { LocalDensePosition } from "./localDensePosition.js";
import { localDensePositionAllocator } from "./localDensePosition.js";
import { planPositionCollisionNormalization } from "../../../src/carrier/positionNormalization.js";

const runA = "60000000-0000-4000-8000-000000000001";
const runB = "60000000-0000-4000-8000-000000000002";
const runC = "60000000-0000-4000-8000-000000000003";
const normalizeRun = "60000000-0000-4000-8000-000000000004";
const insertRun = "60000000-0000-4000-8000-000000000005";

function allocate(
  lower: LocalDensePosition | undefined,
  upper: LocalDensePosition | undefined,
  count: number,
  runNonce: string,
) {
  return localDensePositionAllocator.allocateRun({
    ...(lower === undefined ? {} : { lower }),
    ...(upper === undefined ? {} : { upper }),
    count,
    context: { runNonce },
  });
}

describe("planPositionCollisionNormalization", () => {
  it("moves only the later part of a two-way primary collision and opens a gap", () => {
    const lower = { digits: [100, 100], run: runA, member: 1 } as const;
    const collided = { digits: [100, 100], run: runB, member: 1 } as const;
    const upper = { digits: [200, 100], run: runC, member: 1 } as const;

    const result = planPositionCollisionNormalization(
      localDensePositionAllocator,
      [lower, collided, upper],
      1,
      { runNonce: normalizeRun },
    );
    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }
    expect(result.value.updates).toHaveLength(1);
    expect(
      localDensePositionAllocator.compare(lower, result.value.insertionUpper),
    ).toBeLessThan(0);
    expect(
      localDensePositionAllocator.compare(result.value.insertionUpper, upper),
    ).toBeLessThan(0);

    const insertion = allocate(
      result.value.insertionLower,
      result.value.insertionUpper,
      1,
      insertRun,
    );
    expect(insertion.ok).toBe(true);
  });

  it("moves all later members of a multi-way collision in their existing order", () => {
    const first = { digits: [100, 100], run: runA, member: 1 } as const;
    const second = { digits: [100, 100], run: runB, member: 1 } as const;
    const third = { digits: [100, 100], run: runC, member: 1 } as const;
    const upper = {
      digits: [200, 100],
      run: "60000000-0000-4000-8000-000000000006",
      member: 1,
    } as const;

    const result = planPositionCollisionNormalization(
      localDensePositionAllocator,
      [first, second, third, upper],
      1,
      { runNonce: normalizeRun },
    );
    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }
    expect(result.value.updates.map((update) => update.index)).toEqual([1, 2]);
    expect(
      localDensePositionAllocator.compare(
        result.value.updates[0]!.position,
        result.value.updates[1]!.position,
      ),
    ).toBeLessThan(0);
    expect(
      localDensePositionAllocator.compare(
        result.value.updates[1]!.position,
        upper,
      ),
    ).toBeLessThan(0);
  });

  it("rejects a boundary that does not contain a primary-position collision", () => {
    const result = planPositionCollisionNormalization(
      localDensePositionAllocator,
      [
        { digits: [100, 100], run: runA, member: 1 },
        { digits: [150, 100], run: runB, member: 1 },
      ],
      1,
      { runNonce: normalizeRun },
    );
    expect(result).toMatchObject({ ok: false, error: { kind: "NoCollision" } });
  });

  it("rejects an out-of-range insertion boundary", () => {
    const result = planPositionCollisionNormalization(
      localDensePositionAllocator,
      [{ digits: [100, 100], run: runA, member: 1 }],
      1,
      { runNonce: normalizeRun },
    );
    expect(result).toMatchObject({ ok: false, error: { kind: "InvalidIndex" } });
  });

  it("rejects unsorted normalization input", () => {
    const result = planPositionCollisionNormalization(
      localDensePositionAllocator,
      [
        { digits: [200, 100], run: runB, member: 1 },
        { digits: [100, 100], run: runA, member: 1 },
      ],
      1,
      { runNonce: normalizeRun },
    );
    expect(result).toMatchObject({ ok: false, error: { kind: "InvalidOrder" } });
  });

  it("surfaces allocator failure without changing the requested collision run", () => {
    const lower = { digits: [100, 100], run: runA, member: 1 } as const;
    const collided = { digits: [100, 100], run: runB, member: 1 } as const;
    const upper = { digits: [200, 100], run: runC, member: 1 } as const;
    const allocator = {
      ...localDensePositionAllocator,
      allocateRun: () =>
        ({
          ok: false,
          error: { kind: "InjectedFailure", message: "injected failure" },
        }) as const,
    };

    const result = planPositionCollisionNormalization(
      allocator,
      [lower, collided, upper],
      1,
      { runNonce: normalizeRun },
    );
    expect(result).toMatchObject({
      ok: false,
      error: {
        kind: "AllocationFailed",
        allocationError: { kind: "InjectedFailure" },
      },
    });
  });
});
