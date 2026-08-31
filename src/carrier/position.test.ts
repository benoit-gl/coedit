import { describe, expect, it } from "vitest";

import {
  allocateCarrierPositionRun,
  carrierRunAnchor,
  compareCarrierPositions,
  hasCarrierAnchorCollision,
  isValidCarrierPosition,
} from "./position.js";

const runA = "60000000-0000-4000-8000-000000000001";
const runB = "60000000-0000-4000-8000-000000000002";
const runC = "60000000-0000-4000-8000-000000000003";

describe("carrier positions", () => {
  it("allocates a stable ordered run between open bounds", () => {
    const result = allocateCarrierPositionRun(undefined, undefined, 3, runA);
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.value.every(isValidCarrierPosition)).toBe(true);
    expect(
      compareCarrierPositions(result.value[0]!, result.value[1]!),
    ).toBeLessThan(0);
    expect(
      compareCarrierPositions(result.value[1]!, result.value[2]!),
    ).toBeLessThan(0);
    expect(carrierRunAnchor(result.value[0]!)).toEqual(
      carrierRunAnchor(result.value[2]!),
    );
  });

  it("allocates strictly between existing positions", () => {
    const first = allocateCarrierPositionRun(undefined, undefined, 2, runA);
    expect(first.ok).toBe(true);
    if (!first.ok) return;

    const middle = allocateCarrierPositionRun(
      first.value[0],
      first.value[1],
      1,
      runB,
    );
    expect(middle.ok).toBe(true);
    if (!middle.ok) return;

    expect(
      compareCarrierPositions(first.value[0]!, middle.value[0]!),
    ).toBeLessThan(0);
    expect(
      compareCarrierPositions(middle.value[0]!, first.value[1]!),
    ).toBeLessThan(0);
  });

  it("keeps independently allocated runs contiguous when their anchors differ", () => {
    const left = allocateCarrierPositionRun(undefined, undefined, 1, runA);
    const right = allocateCarrierPositionRun(undefined, undefined, 1, runB);
    expect(left.ok && right.ok).toBe(true);
    if (!left.ok || !right.ok) return;

    const lower =
      compareCarrierPositions(left.value[0]!, right.value[0]!) < 0
        ? left.value[0]
        : right.value[0];
    const upper = lower === left.value[0] ? right.value[0] : left.value[0];
    const run = allocateCarrierPositionRun(lower, upper, 5, runC);
    expect(run.ok).toBe(true);
    if (!run.ok) return;

    for (let index = 1; index < run.value.length; index += 1) {
      expect(
        compareCarrierPositions(run.value[index - 1]!, run.value[index]!),
      ).toBeLessThan(0);
    }
    expect(compareCarrierPositions(lower!, run.value[0]!)).toBeLessThan(0);
    expect(compareCarrierPositions(run.value.at(-1)!, upper!)).toBeLessThan(0);
  });

  it("detects exact concurrent run-anchor collisions", () => {
    const first = allocateCarrierPositionRun(undefined, undefined, 1, runA);
    expect(first.ok).toBe(true);
    if (!first.ok) return;

    const collided = {
      ...first.value[0]!,
      run: runB,
    };
    expect(hasCarrierAnchorCollision(first.value[0]!, collided)).toBe(true);
  });

  it("grows path depth instead of exhausting a dense interval", () => {
    const outer = allocateCarrierPositionRun(undefined, undefined, 2, runA);
    expect(outer.ok).toBe(true);
    if (!outer.ok) return;

    let lower = outer.value[0]!;
    const upper = outer.value[1]!;
    for (let index = 0; index < 64; index += 1) {
      const nonce = `70000000-0000-4000-8000-${index.toString(16).padStart(12, "0")}`;
      const next = allocateCarrierPositionRun(lower, upper, 1, nonce);
      expect(next.ok).toBe(true);
      if (!next.ok) return;
      lower = next.value[0]!;
    }
    expect(compareCarrierPositions(lower, upper)).toBeLessThan(0);
    expect(lower.digits.length).toBeLessThan(32);
  });
});
