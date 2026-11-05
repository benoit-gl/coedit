import { expect, test } from "vitest";
import { fractionalIndexPositionAllocator } from "../structure/fractionalIndexPosition.js";
import { fuguePositionAllocator } from "../structure/fuguePosition.js";
import { localDensePositionAllocator } from "../structure/localDensePosition.js";
import {
  measureAllocatorFailureModes,
  measureAllocatorStress,
} from "./allocatorStress.js";

for (const allocator of [
  fractionalIndexPositionAllocator,
  fuguePositionAllocator,
  localDensePositionAllocator,
]) {
  test(`${allocator.candidate} checks allocation, collision normalization and parentage`, () => {
    const result = measureAllocatorStress(allocator, 16, () => 0);
    expect(result).toMatchObject({
      size: 16,
      concurrentRuns: 8,
      concurrentRunLength: 2,
      completeCollisions: 0,
      normalizationRunLength: 8,
      normalizationRewrites: 7,
    });
    const failures = measureAllocatorFailureModes(allocator);
    expect(failures).toMatchObject({
      invalidCount: "InvalidCount",
      invalidNonce: "InvalidNonce",
      invalidBounds: "InvalidBounds",
    });
    expect(failures.largeRun).toMatchObject({
      outcome:
        allocator.candidate === "local-dense-v1"
          ? "explicit-refusal"
          : "not-exercised",
    });
    expect(result.parentageMismatches).toBe(
      allocator.candidate === "fractional-indexing-v4" ? 7 : 0,
    );
    if (allocator.candidate === "fractional-indexing-v4") {
      expect(result.observedNormalization).toEqual({
        outcome: "completed",
        groups: 2,
        rewrites: 14,
        elapsedMs: 0,
        parentageBefore: 7,
        parentageAfter: 7,
      });
    } else {
      expect(result.observedNormalization).toEqual({
        outcome: "not-applicable",
        groups: 0,
        rewrites: 0,
        elapsedMs: null,
        parentageBefore: 0,
        parentageAfter: 0,
      });
    }
    expect(() => measureAllocatorStress(allocator, 1, () => 0)).toThrow(
      RangeError,
    );
  });
}
