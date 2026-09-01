import { describe, expect, it } from "vitest";

import type { LocalDensePosition } from "./position.js";
import {
  hasLocalDenseAnchorCollision,
  isValidLocalDensePosition,
  localDensePositionAllocator,
  localDenseRunAnchor,
} from "./position.js";

const runA = "60000000-0000-4000-8000-000000000001";
const runB = "60000000-0000-4000-8000-000000000002";
const runC = "60000000-0000-4000-8000-000000000003";

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

describe("local dense structural position allocator", () => {
  it("allocates a stable ordered run between open bounds", () => {
    const result = allocate(undefined, undefined, 3, runA);
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.value.every(isValidLocalDensePosition)).toBe(true);
    expect(
      localDensePositionAllocator.compare(result.value[0]!, result.value[1]!),
    ).toBeLessThan(0);
    expect(
      localDensePositionAllocator.compare(result.value[1]!, result.value[2]!),
    ).toBeLessThan(0);
    expect(localDenseRunAnchor(result.value[0]!)).toEqual(
      localDenseRunAnchor(result.value[2]!),
    );
  });

  it("allocates strictly between existing positions", () => {
    const first = allocate(undefined, undefined, 2, runA);
    expect(first.ok).toBe(true);
    if (!first.ok) return;

    const middle = allocate(first.value[0], first.value[1], 1, runB);
    expect(middle.ok).toBe(true);
    if (!middle.ok) return;

    expect(
      localDensePositionAllocator.compare(first.value[0]!, middle.value[0]!),
    ).toBeLessThan(0);
    expect(
      localDensePositionAllocator.compare(middle.value[0]!, first.value[1]!),
    ).toBeLessThan(0);
  });

  it("keeps independently allocated runs contiguous when their anchors differ", () => {
    const left = allocate(undefined, undefined, 1, runA);
    const right = allocate(undefined, undefined, 1, runB);
    expect(left.ok && right.ok).toBe(true);
    if (!left.ok || !right.ok) return;

    const lower =
      localDensePositionAllocator.compare(left.value[0]!, right.value[0]!) < 0
        ? left.value[0]
        : right.value[0];
    const upper = lower === left.value[0] ? right.value[0] : left.value[0];
    const run = allocate(lower, upper, 5, runC);
    expect(run.ok).toBe(true);
    if (!run.ok) return;

    for (let index = 1; index < run.value.length; index += 1) {
      expect(
        localDensePositionAllocator.compare(
          run.value[index - 1]!,
          run.value[index]!,
        ),
      ).toBeLessThan(0);
    }
    expect(
      localDensePositionAllocator.compare(lower!, run.value[0]!),
    ).toBeLessThan(0);
    expect(
      localDensePositionAllocator.compare(run.value.at(-1)!, upper!),
    ).toBeLessThan(0);
  });

  it("detects exact concurrent run-anchor collisions", () => {
    const first = allocate(undefined, undefined, 1, runA);
    expect(first.ok).toBe(true);
    if (!first.ok) return;

    const collided = {
      ...first.value[0]!,
      run: runB,
    };
    expect(hasLocalDenseAnchorCollision(first.value[0]!, collided)).toBe(true);
  });

  it("round-trips its private representation through its codec", () => {
    const result = allocate(undefined, undefined, 1, runA);
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const encoded = localDensePositionAllocator.encode(result.value[0]!);
    expect(localDensePositionAllocator.decode(encoded)).toEqual(
      result.value[0],
    );
  });

  it("grows path depth instead of exhausting a dense interval", () => {
    const outer = allocate(undefined, undefined, 2, runA);
    expect(outer.ok).toBe(true);
    if (!outer.ok) return;

    let lower = outer.value[0]!;
    const upper = outer.value[1]!;
    for (let index = 0; index < 64; index += 1) {
      const nonce = `70000000-0000-4000-8000-${index.toString(16).padStart(12, "0")}`;
      const next = allocate(lower, upper, 1, nonce);
      expect(next.ok).toBe(true);
      if (!next.ok) return;
      lower = next.value[0]!;
    }
    expect(localDensePositionAllocator.compare(lower, upper)).toBeLessThan(0);
    expect(lower.digits.length).toBeLessThan(32);
  });
});
