import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { cpus, platform, totalmem } from "node:os";
import { join } from "node:path";
import { performance } from "node:perf_hooks";

import { describe, expect, it } from "vitest";

import type {
  InlineContentValue,
  OriginRecord,
} from "../../src/domain/content.js";
import {
  parseBlockId,
  parseContributionId,
  parseContributorId,
  parseInlineContentId,
  parseOriginId,
} from "../../src/domain/ids.js";
import { createAutomergeCollaborativeDocumentCarrierFactory } from "../../src/carrier/automergeCollaborativeDocumentCarrier.js";
import { automergeContentCarrierFactory } from "../../src/carrier/automergeContentCarrier.js";
import type { CollaborativeDocumentCarrierFactory } from "../../src/carrier/collaborativeDocumentCarrier.js";
import type {
  ContentCarrier,
  ContentCarrierFactory,
} from "../../src/carrier/contentCarrier.js";
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
  type LocalDensePosition,
  type StructuralPositionAllocator,
} from "../../src/carrier/position.js";
import { createYjsCollaborativeDocumentCarrierFactory } from "../../src/carrier/yjsCollaborativeDocumentCarrier.js";
import { yjsContentCarrierFactory } from "../../src/carrier/yjsContentCarrier.js";

interface SampleSummary {
  readonly samples: number;
  readonly medianMs: number;
  readonly p95Ms: number;
  readonly minimumMs: number;
  readonly maximumMs: number;
}

interface GrowthPoint {
  readonly contentCodePoints: number;
  readonly runtimeUtf16CodeUnits: number;
  readonly encodedBytes: number;
}

interface ContentMeasurement {
  readonly candidate: string;
  readonly constructAndProject100k: SampleSummary;
  readonly localEditAndProject100k: SampleSummary;
  readonly snapshot100k: SampleSummary;
  readonly reloadAndProject100k: SampleSummary;
  readonly encode100k: SampleSummary;
  readonly encoded100kBytes: number;
  readonly nativeCursorAffinity: {
    readonly beforeInsertionBoundary: number | undefined;
    readonly afterInsertionBoundary: number | undefined;
    readonly supportsBothLogicalAffinities: boolean;
  };
  readonly growth: readonly GrowthPoint[];
}

interface LogicalDocumentMeasurement {
  readonly candidate: string;
  readonly atomicStructureTwoContentsAnd5000Contributions: SampleSummary;
  readonly encodedBytes: number;
}

interface AllocatorMeasurement {
  readonly candidate: string;
  readonly allocateRepeated1000: SampleSummary;
  readonly sort1000: SampleSummary;
  readonly averageEncodedBytes: number;
  readonly maxEncodedBytes: number;
  readonly concurrentRunNoninterleaving: boolean;
  readonly concurrentPrimaryCollisions: number;
}

interface AdapterComplexity {
  readonly candidate: string;
  readonly modules: readonly string[];
  readonly nonblankSourceLines: number;
}

interface QualificationEvidence {
  readonly generatedAt: string;
  readonly environment: {
    readonly node: string;
    readonly os: string;
    readonly arch: string;
    readonly cpuModel: string;
    readonly logicalCpuCount: number;
    readonly totalMemoryBytes: number;
  };
  readonly method: {
    readonly warmupRuns: 2;
    readonly measuredRuns: 7;
    readonly tailPercentile: 95;
    readonly measuredInterval: string;
    readonly contentDistribution: string;
    readonly logicalDocumentDistribution: string;
  };
  readonly fixture: {
    readonly contentCodePoints: 100_000;
    readonly contentGrowthPoints: readonly [1_000, 10_000, 100_000];
    readonly historySurrogateContributions: 5_000;
    readonly repeatedAllocatorInsertions: 1_000;
    readonly concurrentRunMembers: 16;
  };
  readonly packageVersions: Readonly<Record<string, string>>;
  readonly content: readonly ContentMeasurement[];
  readonly logicalDocuments: readonly LogicalDocumentMeasurement[];
  readonly allocators: readonly AllocatorMeasurement[];
  readonly adapterComplexity: readonly AdapterComplexity[];
}

const WARMUP_RUNS = 2;
const MEASURED_RUNS = 7;
const contentFactories: readonly ContentCarrierFactory[] = [
  yjsContentCarrierFactory,
  automergeContentCarrierFactory,
];
const rootId = parseBlockId("61000000-0000-4000-8000-000000000001");
const blockId = parseBlockId("61000000-0000-4000-8000-000000000002");
const inlineA = parseInlineContentId("62000000-0000-4000-8000-000000000001");
const inlineB = parseInlineContentId("62000000-0000-4000-8000-000000000002");

describe("Step 3 persisted qualification", () => {
  it("measures equivalent carrier and allocator fixtures", () => {
    const content = contentFactories.map(measureContentCandidate);
    const logicalDocuments = contentFactories.map((factory) =>
      measureLogicalDocumentCandidate(logicalFactory(factory.candidate)),
    );
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

    const cpu = cpus()[0];
    const evidence: QualificationEvidence = {
      generatedAt: new Date().toISOString(),
      environment: {
        node: process.version,
        os: platform(),
        arch: process.arch,
        cpuModel: cpu?.model ?? "unknown",
        logicalCpuCount: cpus().length,
        totalMemoryBytes: totalmem(),
      },
      method: {
        warmupRuns: WARMUP_RUNS,
        measuredRuns: MEASURED_RUNS,
        tailPercentile: 95,
        measuredInterval:
          "Each interval surrounds only the named synchronous carrier or allocator operation. Fixture construction is excluded unless named.",
        contentDistribution:
          "100,000 Unicode code points drawn from Latin, combining, astral emoji, CJK, and Arabic text; eight Origin runs; overlapping bold and italic marks; inline code; and hard breaks.",
        logicalDocumentDistribution:
          "One Block placement, two attributed InlineContents, and 5,000 opaque Contribution metadata records in one logical carrier change.",
      },
      fixture: {
        contentCodePoints: 100_000,
        contentGrowthPoints: [1_000, 10_000, 100_000],
        historySurrogateContributions: 5_000,
        repeatedAllocatorInsertions: 1_000,
        concurrentRunMembers: 16,
      },
      packageVersions: packageVersions(),
      content,
      logicalDocuments,
      allocators,
      adapterComplexity: adapterComplexity(),
    };
    writeEvidence(evidence);
  }, 120_000);
});

function measureContentCandidate(
  factory: ContentCarrierFactory,
): ContentMeasurement {
  const representativeText = textWithCodePoints(100_000);
  const baseline = createRepresentativeCarrier(factory, representativeText);
  const encoded = baseline.encode();
  const expectedText = visibleText(baseline.snapshot());

  return {
    candidate: factory.candidate,
    constructAndProject100k: measure(() => {
      const carrier = createRepresentativeCarrier(factory, representativeText);
      expect(visibleText(carrier.snapshot())).toBe(expectedText);
    }),
    localEditAndProject100k: measureWithSetup(
      () => factory.load(encoded),
      (carrier) => {
        carrier.insertText(50_000, "Ω", origin(20));
        expect(visibleText(carrier.snapshot())).toContain("Ω");
      },
    ),
    snapshot100k: measure(() => {
      expect(visibleText(baseline.snapshot())).toBe(expectedText);
    }),
    reloadAndProject100k: measure(() => {
      expect(visibleText(factory.load(encoded).snapshot())).toBe(expectedText);
    }),
    encode100k: measure(() => {
      expect(baseline.encode().byteLength).toBeGreaterThan(0);
    }),
    encoded100kBytes: encoded.byteLength,
    nativeCursorAffinity: measureCursorAffinity(factory),
    growth: [1_000, 10_000, 100_000].map((contentCodePoints) => {
      const text = textWithCodePoints(contentCodePoints);
      const carrier = createRepresentativeCarrier(factory, text);
      return {
        contentCodePoints,
        runtimeUtf16CodeUnits: text.length,
        encodedBytes: carrier.encode().byteLength,
      };
    }),
  };
}

function measureLogicalDocumentCandidate(
  factory: CollaborativeDocumentCarrierFactory<LocalDensePosition>,
): LogicalDocumentMeasurement {
  const contentA = createRepresentativeCarrier(
    contentFactory(factory.candidate),
    textWithCodePoints(10_000),
  ).snapshot();
  const contentB = createRepresentativeCarrier(
    contentFactory(factory.candidate),
    textWithCodePoints(5_000),
  ).snapshot();
  const contributions = Array.from({ length: 5_000 }, (_, index) => ({
    contributionId: parseContributionId(uuid("63000000", index + 1)),
    metadata: JSON.stringify({
      sequence: index + 1,
      kind: "history-surrogate",
    }),
  }));
  let encodedBytes = 0;
  const atomicStructureTwoContentsAnd5000Contributions = measure(() => {
    const carrier = factory.create(rootId);
    carrier.applyChange({
      structural: {
        placements: [
          {
            blockId,
            placement: {
              position: {
                digits: [1],
                run: "64000000-0000-4000-8000-000000000001",
                member: 1,
              },
              depth: 1,
            },
            liveToken: "qualification-logical-document",
          },
        ],
      },
      inlineContents: [
        { inlineContentId: inlineA, content: contentA },
        { inlineContentId: inlineB, content: contentB },
      ],
      contributions,
    });
    const snapshot = carrier.snapshot();
    expect(snapshot.inlineContents).toHaveLength(2);
    expect(snapshot.contributions).toHaveLength(5_000);
    encodedBytes = carrier.encode().byteLength;
  });
  return {
    candidate: factory.candidate,
    atomicStructureTwoContentsAnd5000Contributions,
    encodedBytes,
  };
}

function createRepresentativeCarrier(
  factory: ContentCarrierFactory,
  text: string,
): ContentCarrier {
  const carrier = factory.create();
  const chunks = splitIntoRuns(text, 8);
  let runtimeUtf16Offset = 0;
  for (const [index, chunk] of chunks.entries()) {
    carrier.insertText(runtimeUtf16Offset, chunk, origin(index + 1));
    runtimeUtf16Offset += chunk.length;
    if (index === 2 || index === 5) {
      carrier.insertHardBreak(runtimeUtf16Offset, origin(index + 1));
      runtimeUtf16Offset += 1;
    }
  }
  carrier.addMark(0, Math.floor(runtimeUtf16Offset * 0.6), {
    kind: "bold",
    boundaryPolicy: "both",
  });
  carrier.addMark(
    Math.floor(runtimeUtf16Offset * 0.3),
    Math.floor(runtimeUtf16Offset * 0.8),
    {
      kind: "italic",
      boundaryPolicy: "both",
    },
  );
  carrier.addMark(
    Math.floor(runtimeUtf16Offset * 0.45),
    Math.floor(runtimeUtf16Offset * 0.55),
    {
      kind: "inlineCode",
      boundaryPolicy: "none",
    },
  );
  return carrier;
}

function measureAllocator<Position, Context>(
  allocator: StructuralPositionAllocator<Position, Context>,
  context: (runNonce: string) => Context,
): AllocatorMeasurement {
  let representativePositions: readonly Position[] = [];
  const allocateRepeated1000 = measure(() => {
    representativePositions = allocateNarrowPositions(allocator, context);
    expect(representativePositions).toHaveLength(1_000);
  });
  const encodedLengths = representativePositions.map(
    (position) =>
      new TextEncoder().encode(allocator.encode(position)).byteLength,
  );
  const sort1000 = measure(() => {
    expect(
      [...representativePositions].reverse().sort(allocator.compare),
    ).toHaveLength(1_000);
  });
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
    allocateRepeated1000,
    sort1000,
    averageEncodedBytes:
      encodedLengths.reduce((total, value) => total + value, 0) /
      encodedLengths.length,
    maxEncodedBytes: Math.max(...encodedLengths),
    concurrentRunNoninterleaving: transitions <= 1,
    concurrentPrimaryCollisions: primaryCollisions,
  };
}

function allocateNarrowPositions<Position, Context>(
  allocator: StructuralPositionAllocator<Position, Context>,
  context: (runNonce: string) => Context,
): readonly Position[] {
  let lower: Position | undefined;
  const positions: Position[] = [];
  for (let index = 0; index < 1_000; index += 1) {
    const result = allocator.allocateRun({
      ...(lower === undefined ? {} : { lower }),
      count: 1,
      context: context(runNonce(100 + index)),
    });
    if (!result.ok) {
      throw new Error(result.error.message);
    }
    lower = result.value[0]!;
    positions.push(lower);
  }
  return positions;
}

function measureCursorAffinity(
  factory: ContentCarrierFactory,
): ContentMeasurement["nativeCursorAffinity"] {
  const carrier = factory.create();
  carrier.insertText(0, "ab", origin(1));
  const before = carrier.createCursor(1, "before");
  const after = carrier.createCursor(1, "after");
  carrier.insertText(1, "X", origin(2));
  const beforeInsertionBoundary = carrier.resolveCursor(before);
  const afterInsertionBoundary = carrier.resolveCursor(after);
  return {
    beforeInsertionBoundary,
    afterInsertionBoundary,
    supportsBothLogicalAffinities:
      beforeInsertionBoundary === 1 && afterInsertionBoundary === 2,
  };
}

function measure(operation: () => void): SampleSummary {
  for (let index = 0; index < WARMUP_RUNS; index += 1) operation();
  const values = Array.from({ length: MEASURED_RUNS }, () => {
    const started = performance.now();
    operation();
    return performance.now() - started;
  });
  return summarize(values);
}

function measureWithSetup<T>(
  setup: () => T,
  operation: (value: T) => void,
): SampleSummary {
  for (let index = 0; index < WARMUP_RUNS; index += 1) operation(setup());
  const values = Array.from({ length: MEASURED_RUNS }, () => {
    const value = setup();
    const started = performance.now();
    operation(value);
    return performance.now() - started;
  });
  return summarize(values);
}

function summarize(values: readonly number[]): SampleSummary {
  const sorted = [...values].sort((left, right) => left - right);
  return {
    samples: sorted.length,
    medianMs: percentile(sorted, 50),
    p95Ms: percentile(sorted, 95),
    minimumMs: sorted[0]!,
    maximumMs: sorted.at(-1)!,
  };
}

function percentile(sorted: readonly number[], requested: number): number {
  return sorted[Math.max(0, Math.ceil((requested / 100) * sorted.length) - 1)]!;
}

function adapterComplexity(): readonly AdapterComplexity[] {
  return [
    complexity("yjs", [
      "src/carrier/yjsContentCarrier.ts",
      "src/carrier/yjsStructuralCarrier.ts",
      "src/carrier/yjsCollaborativeDocumentCarrier.ts",
      "src/carrier/yjsTextFormattingCache.ts",
    ]),
    complexity("automerge", [
      "src/carrier/automergeContentCarrier.ts",
      "src/carrier/automergeStructuralCarrier.ts",
      "src/carrier/automergeCollaborativeDocumentCarrier.ts",
    ]),
  ];
}

function complexity(
  candidate: string,
  modules: readonly string[],
): AdapterComplexity {
  return {
    candidate,
    modules,
    nonblankSourceLines: modules.reduce(
      (total, path) =>
        total +
        readFileSync(path, "utf8")
          .split("\n")
          .filter((line) => line.trim().length > 0).length,
      0,
    ),
  };
}

function logicalFactory(
  candidate: ContentCarrierFactory["candidate"],
): CollaborativeDocumentCarrierFactory<LocalDensePosition> {
  return candidate === "yjs"
    ? createYjsCollaborativeDocumentCarrierFactory(localDensePositionAllocator)
    : createAutomergeCollaborativeDocumentCarrierFactory(
        localDensePositionAllocator,
      );
}

function contentFactory(
  candidate: ContentCarrierFactory["candidate"],
): ContentCarrierFactory {
  return candidate === "yjs"
    ? yjsContentCarrierFactory
    : automergeContentCarrierFactory;
}

function splitIntoRuns(text: string, count: number): readonly string[] {
  const codePoints = Array.from(text);
  return Array.from({ length: count }, (_, index) => {
    const start = Math.floor((index * codePoints.length) / count);
    const end = Math.floor(((index + 1) * codePoints.length) / count);
    return codePoints.slice(start, end).join("");
  });
}

function textWithCodePoints(count: number): string {
  const pattern = Array.from("Coedit e\u0301 😀 漢字 العربية | ");
  return Array.from(
    { length: count },
    (_, index) => pattern[index % pattern.length],
  ).join("");
}

function visibleText(value: InlineContentValue): string {
  return value.items
    .map((item) => (item.kind === "text" ? item.text : "\n"))
    .join("");
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
  const all = { ...packageJson.dependencies, ...packageJson.devDependencies };
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
  return uuid("67000000", index);
}

function origin(index: number): OriginRecord {
  return {
    id: parseOriginId(uuid("68000000", index)),
    agentId: parseContributorId(uuid("69000000", index)),
    kind: "human",
    createdBy: parseContributionId(uuid("6a000000", index)),
  };
}

function uuid(prefix: string, index: number): string {
  return `${prefix}-0000-4000-8000-${index.toString(16).padStart(12, "0")}`;
}
