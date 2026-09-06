import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { platform } from "node:os";
import { join } from "node:path";
import { performance } from "node:perf_hooks";

import { describe, expect, it } from "vitest";

import type { OriginRecord } from "../../src/domain/content.js";
import {
  parseContributionId,
  parseContributorId,
  parseOriginId,
} from "../../src/domain/ids.js";
import { automergeContentCarrierFactory } from "../../src/carrier/automergeContentCarrier.js";
import type { ContentCarrierFactory } from "../../src/carrier/contentCarrier.js";
import {
  fractionalIndexPositionAllocator,
  type FractionalIndexAllocationContext,
} from "../../src/carrier/fractionalIndexPosition.js";
import {
  fuguePositionAllocator,
  type FugueAllocationContext,
} from "../../src/carrier/fuguePosition.js";
import {
  localDensePositionAllocator,
  type LocalDenseAllocationContext,
  type StructuralPositionAllocator,
} from "../../src/carrier/position.js";
import { yjsContentCarrierFactory } from "../../src/carrier/yjsContentCarrier.js";

interface ContentMeasurement {
  readonly candidate: string;
  readonly insert100kMs: number;
  readonly snapshot100kMs: number;
  readonly reload100kMs: number;
  readonly encoded100kBytes: number;
}

interface AllocatorMeasurement {
  readonly candidate: string;
  readonly allocateRepeated1000Ms: number;
  readonly averageEncodedBytes: number;
  readonly maxEncodedBytes: number;
  readonly concurrentRunNoninterleaving: boolean;
  readonly concurrentPrimaryCollisions: number;
}

interface QualificationEvidence {
  readonly generatedAt: string;
  readonly environment: {
    readonly node: string;
    readonly os: string;
    readonly arch: string;
  };
  readonly fixture: {
    readonly contentCodeUnits: 100_000;
    readonly repeatedAllocatorInsertions: 1_000;
    readonly concurrentRunMembers: 16;
  };
  readonly packageVersions: Readonly<Record<string, string>>;
  readonly content: readonly ContentMeasurement[];
  readonly allocators: readonly AllocatorMeasurement[];
}

const contentFactories: readonly ContentCarrierFactory[] = [
  yjsContentCarrierFactory,
  automergeContentCarrierFactory,
];
const qualificationOrigin = origin(1);

describe("Step 3 persisted qualification", () => {
  it("measures equivalent carrier and allocator fixtures", () => {
    const content = contentFactories.map(measureContentCandidate);
    const allocators = [
      measureAllocator(
        localDensePositionAllocator,
        (runNonce) => ({ runNonce }) satisfies LocalDenseAllocationContext,
      ),
      measureAllocator(
        fractionalIndexPositionAllocator,
        (runNonce) => ({ runNonce }) satisfies FractionalIndexAllocationContext,
      ),
      measureAllocator(
        fuguePositionAllocator,
        (runNonce) => ({ runNonce }) satisfies FugueAllocationContext,
      ),
    ];

    for (const measurement of content) {
      expect(measurement.encoded100kBytes).toBeGreaterThan(0);
    }
    for (const measurement of allocators) {
      expect(measurement.averageEncodedBytes).toBeGreaterThan(0);
      expect(measurement.maxEncodedBytes).toBeGreaterThan(0);
    }

    const evidence: QualificationEvidence = {
      generatedAt: new Date().toISOString(),
      environment: {
        node: process.version,
        os: platform(),
        arch: process.arch,
      },
      fixture: {
        contentCodeUnits: 100_000,
        repeatedAllocatorInsertions: 1_000,
        concurrentRunMembers: 16,
      },
      packageVersions: packageVersions(),
      content,
      allocators,
    };
    writeEvidence(evidence);
  }, 30_000);
});

function measureContentCandidate(
  factory: ContentCarrierFactory,
): ContentMeasurement {
  const carrier = factory.create();
  const text = "a".repeat(100_000);

  const insertStarted = performance.now();
  carrier.insertText(0, text, qualificationOrigin);
  const insert100kMs = performance.now() - insertStarted;

  const snapshotStarted = performance.now();
  expect(carrier.snapshot().items).toHaveLength(1);
  const snapshot100kMs = performance.now() - snapshotStarted;

  const encoded = carrier.encode();
  const reloadStarted = performance.now();
  const reloaded = factory.load(encoded);
  expect(reloaded.snapshot()).toEqual(carrier.snapshot());
  const reload100kMs = performance.now() - reloadStarted;

  return {
    candidate: factory.candidate,
    insert100kMs,
    snapshot100kMs,
    reload100kMs,
    encoded100kBytes: encoded.byteLength,
  };
}

function measureAllocator<Position, Context>(
  allocator: StructuralPositionAllocator<Position, Context>,
  context: (runNonce: string) => Context,
): AllocatorMeasurement {
  let lower: Position | undefined;
  const positions: Position[] = [];
  const started = performance.now();
  for (let index = 0; index < 1_000; index += 1) {
    const result = allocator.allocateRun({
      ...(lower === undefined ? {} : { lower }),
      count: 1,
      context: context(runNonce(100 + index)),
    });
    expect(result.ok).toBe(true);
    if (!result.ok) {
      throw new Error(result.error.message);
    }
    lower = result.value[0]!;
    positions.push(lower);
  }
  const allocateRepeated1000Ms = performance.now() - started;

  const encodedLengths = positions.map(
    (position) =>
      new TextEncoder().encode(allocator.encode(position)).byteLength,
  );
  const left = allocator.allocateRun({
    count: 16,
    context: context(runNonce(10_001)),
  });
  const right = allocator.allocateRun({
    count: 16,
    context: context(runNonce(10_002)),
  });
  expect(left.ok && right.ok).toBe(true);
  if (!left.ok || !right.ok) {
    throw new Error("Concurrent allocator fixture failed.");
  }

  const tagged = [
    ...left.value.map((position) => ({ position, run: "left" as const })),
    ...right.value.map((position) => ({ position, run: "right" as const })),
  ].sort((a, b) => allocator.compare(a.position, b.position));
  const transitions = tagged.reduce(
    (count, value, index) =>
      index > 0 && tagged[index - 1]?.run !== value.run ? count + 1 : count,
    0,
  );
  const primaryCollisions = left.value.reduce(
    (count, leftPosition) =>
      count +
      right.value.filter(
        (rightPosition) =>
          allocator.comparePrimary(leftPosition, rightPosition) === 0,
      ).length,
    0,
  );

  return {
    candidate: allocator.candidate,
    allocateRepeated1000Ms,
    averageEncodedBytes:
      encodedLengths.reduce((total, value) => total + value, 0) /
      encodedLengths.length,
    maxEncodedBytes: Math.max(...encodedLengths),
    concurrentRunNoninterleaving: transitions <= 1,
    concurrentPrimaryCollisions: primaryCollisions,
  };
}

function writeEvidence(evidence: QualificationEvidence): void {
  const outputDirectory =
    process.env.COEDIT_STEP3_EVIDENCE_DIR ?? "artifacts/step3";
  mkdirSync(outputDirectory, { recursive: true });
  writeFileSync(
    join(outputDirectory, "qualification.json"),
    `${JSON.stringify(evidence, null, 2)}\n`,
    "utf8",
  );
}

function packageVersions(): Readonly<Record<string, string>> {
  const packageJson = JSON.parse(readFileSync("package.json", "utf8")) as {
    readonly dependencies?: Readonly<Record<string, string>>;
    readonly devDependencies?: Readonly<Record<string, string>>;
  };
  const all = {
    ...packageJson.dependencies,
    ...packageJson.devDependencies,
  };
  return Object.fromEntries(
    [
      "@automerge/automerge",
      "@playwright/test",
      "@tiptap/core",
      "@tiptap/pm",
      "dompurify",
      "fractional-indexing",
      "fugue",
      "yjs",
    ].map((name) => [name, all[name] ?? "missing"]),
  );
}

function runNonce(index: number): string {
  return `67000000-0000-4000-8000-${index.toString(16).padStart(12, "0")}`;
}

function origin(index: number): OriginRecord {
  const suffix = index.toString().padStart(12, "0");
  return {
    id: parseOriginId(`68000000-0000-4000-8000-${suffix}`),
    agentId: parseContributorId(`69000000-0000-4000-8000-${suffix}`),
    kind: "human",
    createdBy: parseContributionId(`6a000000-0000-4000-8000-${suffix}`),
  };
}
