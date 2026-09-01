import { describe, expect, it } from "vitest";

import { allocateCarrierPositionRun, compareCarrierPositions } from "./position.js";
import { planExactPositionCollisionNormalization } from "./positionNormalization.js";

const runA = "60000000-0000-4000-8000-000000000001";
const runB = "60000000-0000-4000-8000-000000000002";
const runC = "60000000-0000-4000-8000-000000000003";
const normalizeRun = "60000000-0000-4000-8000-000000000004";
const insertRun = "60000000-0000-4000-8000-000000000005";

describe("planExactPositionCollisionNormalization", () => {
  it("moves only the later part of a two-way exact collision and opens a gap", () => {
    const lower = { digits: [100, 100], run: runA, member: 1 } as const;
    const collided = { digits: [100, 100], run: runB, member: 1 } as const;
    const upper = { digits: [200, 100], run: runC, member: 1 } as const;

    const result = planExactPositionCollisionNormalization(
      [lower, collided, upper],
      1,
      normalizeRun,
    );
    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }
    expect(result.value.updates).toHaveLength(1);
    expect(compareCarrierPositions(lower, result.value.insertionUpper)).toBeLessThan(0);
    expect(compareCarrierPositions(result.value.insertionUpper, upper)).toBeLessThan(0);

    const insertion = allocateCarrierPositionRun(
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

    const result = planExactPositionCollisionNormalization(
      [first, second, third, upper],
      1,
      normalizeRun,
    );
    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }
    expect(result.value.updates.map((update) => update.index)).toEqual([1, 2]);
    expect(
      compareCarrierPositions(
        result.value.updates[0]!.position,
        result.value.updates[1]!.position,
      ),
    ).toBeLessThan(0);
    expect(
      compareCarrierPositions(result.value.updates[1]!.position, upper),
    ).toBeLessThan(0);
  });

  it("rejects a boundary that does not contain an exact primary-path collision", () => {
    const result = planExactPositionCollisionNormalization(
      [
        { digits: [100, 100], run: runA, member: 1 },
        { digits: [150, 100], run: runB, member: 1 },
      ],
      1,
      normalizeRun,
    );
    expect(result).toMatchObject({ ok: false, error: { kind: "NoCollision" } });
  });
});
