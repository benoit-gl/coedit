import { planPositionCollisionNormalization } from "../../../src/carrier/index.js";
import type { QualificationPositionAllocator } from "../structure/carrier.js";

/** Run identity consumed by each allocator in the stress fixture. */
export interface AllocatorStressContext {
  /** Deterministic UUID-v4 allocation-run identity. */
  readonly runNonce: string;
}

const nonce = (value: number): string =>
  `91000000-0000-4000-8000-${value.toString(16).padStart(12, "0")}`;

/**
 * Measure a bounded allocator fixture with interval, ordering and codec checks.
 * All elapsed values are synchronous wall time; correctness checks are outside
 * measured phases unless the native allocation or codec itself validates input.
 */
export function measureAllocatorStress(
  allocator: QualificationPositionAllocator<unknown, AllocatorStressContext>,
  size: number,
  now: () => number,
): Record<string, unknown> {
  if (!Number.isSafeInteger(size) || size < 2 || size > 4096)
    throw new RangeError("Allocator fixture size must be between 2 and 4096.");
  const time = <T>(operation: () => T): [T, number] => {
    const start = now();
    const result = operation();
    return [result, now() - start];
  };
  const allocate = (
    count: number,
    id: number,
    lower?: unknown,
    upper?: unknown,
  ): readonly unknown[] => {
    const result = allocator.allocateRun({
      count,
      context: { runNonce: nonce(id) },
      ...(lower === undefined ? {} : { lower }),
      ...(upper === undefined ? {} : { upper }),
    });
    if (!result.ok)
      throw new Error(
        `Allocation failed: ${result.error.kind}: ${result.error.message}`,
      );
    if (result.value.length !== count) throw new Error("Run length differs.");
    return result.value;
  };
  const [anchors] = time(() => allocate(2, 1));
  const lower = anchors[0]!;
  const upper = anchors[1]!;
  const [run, allocateMs] = time(() => allocate(size, 2, lower, upper));
  const assertOrdered = (
    values: readonly unknown[],
    lo?: unknown,
    hi?: unknown,
  ) => {
    if (lo !== undefined && allocator.compare(lo, values[0]) >= 0)
      throw new Error("Allocation escaped its lower bound.");
    if (hi !== undefined && allocator.compare(values.at(-1), hi) >= 0)
      throw new Error("Allocation escaped its upper bound.");
    for (let i = 1; i < values.length; i++)
      if (allocator.compare(values[i - 1], values[i]) >= 0)
        throw new Error("Run did not preserve strict order.");
  };
  assertOrdered(run, lower, upper);
  const [encoded, encodeMs] = time(() =>
    run.map((value) => allocator.encode(value)),
  );
  const [decoded, decodeMs] = time(() =>
    encoded.map((value) => allocator.decode(value)),
  );
  for (let i = 0; i < run.length; i++) {
    if (
      allocator.compare(run[i], decoded[i]) !== 0 ||
      allocator.encode(decoded[i]) !== encoded[i]
    )
      throw new Error("Codec round trip changed position.");
  }
  let compareChecksum = 0;
  const [, compareMs] = time(() => {
    for (let i = 1; i < run.length; i++)
      compareChecksum += allocator.compare(run[i - 1], run[i]);
  });
  if (compareChecksum !== -(run.length - 1))
    throw new Error("Comparator checksum differs.");
  const [sorted, sortMs] = time(() =>
    [...run].reverse().sort((a, b) => allocator.compare(a, b)),
  );
  for (let i = 0; i < run.length; i++)
    if (allocator.compare(sorted[i], run[i]) !== 0)
      throw new Error("Sort changed order.");
  const narrow: unknown[] = [];
  const [, narrowMs] = time(() => {
    let cursor = lower;
    for (let i = 0; i < size; i++) {
      const next = allocate(1, i + 10, cursor, upper)[0]!;
      if (
        allocator.compare(cursor, next) >= 0 ||
        allocator.compare(next, upper) >= 0
      )
        throw new Error("Narrow-gap insertion escaped its interval.");
      cursor = next;
      narrow.push(next);
    }
  });
  const narrowWidths = narrow.map(
    (value) => new TextEncoder().encode(allocator.encode(value)).length,
  );
  const widths = encoded.map((value) => new TextEncoder().encode(value).length);
  return {
    candidate: allocator.candidate,
    size,
    allocationMs: allocateMs,
    encodeMs,
    decodeMs,
    compareMs,
    sortMs,
    narrowMs,
    orderedRunBytes: distribution(widths),
    narrowPositionBytes: distribution(narrowWidths),
    ...concurrentEvidence(allocator, lower, upper, allocate, time),
  };

  function distribution(values: readonly number[]) {
    const sortedValues = [...values].sort((a, b) => a - b);
    return {
      min: sortedValues[0],
      median: sortedValues[Math.floor((sortedValues.length - 1) / 2)],
      p95: sortedValues[Math.ceil(sortedValues.length * 0.95) - 1],
      max: sortedValues.at(-1),
      total: sortedValues.reduce((sum, value) => sum + value, 0),
    };
  }
}

type Allocation = (
  count: number,
  id: number,
  lower?: unknown,
  upper?: unknown,
) => readonly unknown[];
type Timer = <T>(operation: () => T) => [T, number];

function concurrentEvidence(
  allocator: QualificationPositionAllocator<unknown, AllocatorStressContext>,
  lower: unknown,
  upper: unknown,
  allocate: Allocation,
  time: Timer,
): Record<string, unknown> {
  // Two-member concurrent runs represent a parent and its nested child.
  // Identical primary positions, if any, are retained instead of hidden.
  const runs = Array.from({ length: 8 }, (_, run) =>
    allocate(2, 10_000 + run, lower, upper).map((position, member) => ({
      position,
      run,
      member,
    })),
  );
  for (const run of runs) {
    if (allocator.compare(run[0]!.position, run[1]!.position) >= 0)
      throw new Error("Concurrent run is not ordered.");
  }
  const ordered = runs
    .flat()
    .sort((a, b) => allocator.compare(a.position, b.position));
  const reverse = [...runs]
    .reverse()
    .flat()
    .sort((a, b) => allocator.compare(a.position, b.position));
  for (let i = 0; i < ordered.length; i++) {
    if (allocator.compare(ordered[i]!.position, reverse[i]!.position) !== 0)
      throw new Error("Concurrent order depends on input order.");
    if (
      i &&
      allocator.compare(ordered[i - 1]!.position, ordered[i]!.position) >= 0
    )
      throw new Error("Concurrent complete positions collide.");
  }
  let primaryCollisions = 0;
  let collisionRuns = 0;
  let inCollision = false;
  let transitions = 0;
  let parentageMismatches = 0;
  let currentParent = -1;
  for (let i = 0; i < ordered.length; i++) {
    const item = ordered[i]!;
    if (i > 0) {
      const equal =
        allocator.comparePrimary(ordered[i - 1]!.position, item.position) === 0;
      if (equal) {
        primaryCollisions++;
        if (!inCollision) collisionRuns++;
      }
      inCollision = equal;
      if (ordered[i - 1]!.run !== item.run) transitions++;
    }
    if (item.member === 0) currentParent = item.run;
    else if (currentParent !== item.run) parentageMismatches++;
  }
  // Normalize the primary collision groups produced by these actual runs. The
  // planner keeps the existing order; it is not a parentage repair.
  const groups: { start: number; end: number }[] = [];
  for (let start = 0; start < ordered.length;) {
    let end = start + 1;
    while (
      end < ordered.length &&
      allocator.comparePrimary(
        ordered[start]!.position,
        ordered[end]!.position,
      ) === 0
    )
      end++;
    if (end - start > 1) groups.push({ start, end });
    start = end;
  }
  const observedPositions = [...ordered.map(({ position }) => position), upper];
  const openedIntervals: { lower: unknown; upper: unknown }[] = [];
  const [observedNormalization, observedNormalizationMs] = time(() => {
    let rewrites = 0;
    for (const [groupIndex, group] of groups.entries()) {
      const result = planPositionCollisionNormalization(
        allocator,
        observedPositions,
        group.start + 1,
        { runNonce: nonce(21_000 + groupIndex) },
      );
      if (!result.ok)
        return {
          outcome: "explicit-refusal",
          error: result.error.kind,
          rewrites,
        };
      if (result.value.updates.length !== group.end - group.start - 1)
        throw new Error(
          "Observed collision normalization changed the wrong suffix.",
        );
      for (const update of result.value.updates)
        observedPositions[update.index] = update.position;
      rewrites += result.value.updates.length;
      openedIntervals.push({
        lower: result.value.insertionLower,
        upper: result.value.insertionUpper,
      });
    }
    return {
      outcome: groups.length ? "completed" : "not-applicable",
      rewrites,
    };
  });
  let parentageAfterNormalization: number | null = null;
  if (observedNormalization.outcome !== "explicit-refusal") {
    for (let i = 1; i < observedPositions.length; i++) {
      if (
        allocator.compare(observedPositions[i - 1], observedPositions[i]) >= 0
      )
        throw new Error(
          "Observed normalization did not preserve strict order.",
        );
      if (
        allocator.comparePrimary(
          observedPositions[i - 1],
          observedPositions[i],
        ) >= 0
      )
        throw new Error("Observed normalization retained a primary collision.");
    }
    for (const [i, interval] of openedIntervals.entries()) {
      const inserted = allocate(
        1,
        22_000 + i,
        interval.lower,
        interval.upper,
      )[0];
      if (
        allocator.compare(interval.lower, inserted) >= 0 ||
        allocator.compare(inserted, interval.upper) >= 0
      )
        throw new Error(
          "Observed normalized interval cannot accept insertion.",
        );
    }
    // Associate each normalized position with its original Block/run, sort the
    // resulting placements, and derive the parent of every nested child again.
    const after = ordered
      .map((item, index) => ({ ...item, position: observedPositions[index] }))
      .sort((a, b) => allocator.compare(a.position, b.position));
    parentageAfterNormalization = 0;
    let afterParent = -1;
    for (const item of after) {
      if (item.member === 0) afterParent = item.run;
      else if (afterParent !== item.run) parentageAfterNormalization++;
    }
    if (parentageAfterNormalization !== parentageMismatches)
      throw new Error(
        "Normalization unexpectedly changed projected parentage.",
      );
  }
  // Synthetic exact collision exercises normalization even for candidates that
  // do not collide in this finite sample. Duplicates model distinct holders.
  const duplicates = Array.from({ length: 8 }, () => lower);
  const before = [...duplicates, upper];
  const [normalization, normalizationMs] = time(() =>
    planPositionCollisionNormalization(allocator, before, 1, {
      runNonce: nonce(20_000),
    }),
  );
  if (!normalization.ok)
    throw new Error(`Normalization failed: ${normalization.error.kind}`);
  if (normalization.value.updates.length !== 7)
    throw new Error("Normalization changed wrong collision-run suffix.");
  const after = [...before];
  for (const update of normalization.value.updates)
    after[update.index] = update.position;
  for (let i = 1; i < after.length; i++) {
    if (allocator.compare(after[i - 1], after[i]) >= 0)
      throw new Error("Normalized order is invalid.");
  }
  const inserted = allocate(
    1,
    20_001,
    normalization.value.insertionLower,
    normalization.value.insertionUpper,
  )[0];
  if (
    allocator.compare(normalization.value.insertionLower, inserted) >= 0 ||
    allocator.compare(inserted, normalization.value.insertionUpper) >= 0
  )
    throw new Error("Normalized interval cannot accept insertion.");
  return {
    concurrentRuns: runs.length,
    concurrentRunLength: 2,
    primaryCollisionAdjacencies: primaryCollisions,
    primaryCollisionRuns: collisionRuns,
    completeCollisions: 0,
    runTransitions: transitions,
    parentageMismatches,
    observedNormalization: {
      ...observedNormalization,
      groups: groups.length,
      elapsedMs: groups.length ? observedNormalizationMs : null,
      parentageBefore: parentageMismatches,
      parentageAfter: parentageAfterNormalization,
    },
    normalizationRunLength: duplicates.length,
    normalizationRewrites: normalization.value.updates.length,
    normalizationMs,
  };
}

/** Records explicit invalid-input and candidate-specific capacity outcomes. */
export function measureAllocatorFailureModes(
  allocator: QualificationPositionAllocator<unknown, AllocatorStressContext>,
): Record<string, unknown> {
  const invalidCount = allocator.allocateRun({
    count: 0,
    context: { runNonce: nonce(1) },
  });
  const invalidNonce = allocator.allocateRun({
    count: 1,
    context: { runNonce: "not-a-uuid" },
  });
  const anchors = allocator.allocateRun({
    count: 2,
    context: { runNonce: nonce(2) },
  });
  if (invalidCount.ok || invalidNonce.ok || !anchors.ok)
    throw new Error("Unexpected allocation input handling.");
  const invalidBounds = allocator.allocateRun({
    lower: anchors.value[1],
    upper: anchors.value[0],
    count: 1,
    context: { runNonce: nonce(3) },
  });
  if (invalidBounds.ok) throw new Error("Reversed bounds were accepted.");
  let malformedDecode: string;
  try {
    allocator.decode("");
    throw new Error("Malformed encoding was accepted.");
  } catch (error) {
    if (
      error instanceof Error &&
      error.message === "Malformed encoding was accepted."
    )
      throw error;
    malformedDecode = error instanceof Error ? error.name : "non-Error throw";
  }
  // The local adapter has a known finite one-anchor run limit; do not ask other
  // candidates for an unbounded run and mistake runtime exhaustion for refusal.
  let largeRun: Record<string, unknown> = {
    outcome: "not-exercised",
    count: 65_536,
  };
  if (allocator.candidate === "local-dense-v1") {
    const result = allocator.allocateRun({
      count: 65_536,
      context: { runNonce: nonce(4) },
    });
    if (result.ok) throw new Error("Local run capacity unexpectedly changed.");
    largeRun = {
      outcome: "explicit-refusal",
      count: 65_536,
      error: result.error.kind,
    };
  }
  return {
    candidate: allocator.candidate,
    invalidCount: invalidCount.error.kind,
    invalidNonce: invalidNonce.error.kind,
    invalidBounds: invalidBounds.error.kind,
    malformedDecode,
    largeRun,
  };
}

/** Probes one bounded large ordered run; completion is not proof of exhaustion or a production limit. */
export function measurePracticalAllocatorRun(
  allocator: QualificationPositionAllocator<unknown, AllocatorStressContext>,
  now: () => number,
): Record<string, unknown> {
  const count = 4096;
  const start = now();
  const result = allocator.allocateRun({
    count,
    context: { runNonce: nonce(30_000) },
  });
  const allocationMs = now() - start;
  if (!result.ok)
    return {
      count,
      outcome: "explicit-refusal",
      error: result.error.kind,
      allocationMs,
    };
  if (result.value.length !== count)
    throw new Error("Practical run length differs.");
  for (let i = 1; i < count; i++)
    if (allocator.compare(result.value[i - 1], result.value[i]) >= 0)
      throw new Error("Practical run order differs.");
  const lengths = result.value.map(
    (position) => new TextEncoder().encode(allocator.encode(position)).length,
  );
  return {
    count,
    outcome: "completed",
    allocationMs,
    minimumEncodedBytes: Math.min(...lengths),
    maximumEncodedBytes: Math.max(...lengths),
    totalEncodedBytes: lengths.reduce((sum, length) => sum + length, 0),
  };
}
