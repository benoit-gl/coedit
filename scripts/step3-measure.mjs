import { Buffer } from "node:buffer";
import { URL } from "node:url";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { cpus, platform, release, arch, totalmem } from "node:os";
import { performance } from "node:perf_hooks";
import { createServer } from "vite";

const profile = JSON.parse(
  await readFile(
    new URL("../qualification/step3/comparison/profile.json", import.meta.url),
    "utf8",
  ),
);
const server = await createServer({
  appType: "custom",
  server: { middlewareMode: true, hmr: false },
  logLevel: "error",
});
const load = (path) => server.ssrLoadModule("/" + path);
const rows = [];
const percentile = (values, percent) =>
  [...values].sort((a, b) => a - b)[
    Math.ceil((values.length * percent) / 100) - 1
  ];
function bench(candidate, workload, size, setup) {
  const samplesMs = [];
  let details;
  for (let i = 0; i < profile.method.warmupRuns + profile.method.samples; i++) {
    const operation = setup();
    const start = performance.now();
    const outcome = operation();
    const elapsed = performance.now() - start;
    if (i >= profile.method.warmupRuns) {
      samplesMs.push(elapsed);
      details = outcome;
    }
  }
  const row = {
    candidate,
    workload,
    size,
    samplesMs,
    medianMs: percentile(samplesMs, 50),
    p95Ms: percentile(samplesMs, 95),
    details,
  };
  rows.push(row);
  console.log("STEP3_ROW " + JSON.stringify(row));
}
const uuid = (n) =>
  `70000000-0000-4000-8000-${n.toString(16).padStart(12, "0")}`;
const nonce = (n) =>
  `61000000-0000-4000-8000-${n.toString(16).padStart(12, "0")}`;
try {
  const [
    { parseBlockId, parseInlineContentId },
    { localDensePositionAllocator },
    { fractionalIndexPositionAllocator },
    { fuguePositionAllocator },
    { createYjsIntegratedDocumentCarrierFactory },
    { createAutomergeIntegratedDocumentCarrierFactory },
    { buildRetainedRangeScalingFixture },
    { resolveProbeRange },
  ] = await Promise.all([
    load("src/domain/index.ts"),
    load("qualification/step3/structure/localDensePosition.ts"),
    load("qualification/step3/structure/fractionalIndexPosition.ts"),
    load("qualification/step3/structure/fuguePosition.ts"),
    load("qualification/step3/integrated/yjsIntegratedDocumentCarrier.ts"),
    load(
      "qualification/step3/integrated/automergeIntegratedDocumentCarrier.ts",
    ),
    load("qualification/step3/integrated/rangeScaling.ts"),
    load("qualification/step3/integrated/rangeProbe.ts"),
  ]);
  const root = parseBlockId(uuid(1)),
    id = parseInlineContentId(uuid(2));
  const origin = { id: "benchmark-author", kind: "human" };
  const factories = [
    createYjsIntegratedDocumentCarrierFactory(
      localDensePositionAllocator,
      localDensePositionAllocator,
    ),
    createAutomergeIntegratedDocumentCarrierFactory(
      localDensePositionAllocator,
      localDensePositionAllocator,
    ),
  ];
  function seeded(factory, text) {
    const carrier = factory.create(root);
    carrier.applyChange({
      inlineContents: [{ inlineContentId: id, blockId: root }],
      payloads: [
        {
          kind: "replace-text",
          inlineContentId: id,
          mediaType: "text/plain",
          text,
          origin,
        },
      ],
    });
    return carrier;
  }
  for (const factory of factories) {
    for (const size of profile.content.textUtf16Units) {
      const source = "a".repeat(size);
      const baseline = seeded(factory, source).encode();
      bench(factory.candidate, "insert-and-project", size, () => {
        const carrier = factory.load(baseline);
        return () => {
          carrier.applyChange({
            payloads: [
              {
                kind: "insert-text",
                inlineContentId: id,
                offset: size / 2,
                text: "x",
                origin,
              },
            ],
          });
          const projected = carrier.snapshot().payloads.get(id);
          if (projected?.kind !== "text" || projected.text.length !== size + 1)
            throw Error("Changed text projection");
          return { encodedBytes: carrier.encode().length };
        };
      });
      bench(factory.candidate, "encode-reload-project", size, () => {
        const carrier = factory.load(baseline);
        return () => {
          const encoded = carrier.encode();
          const reloaded = factory.load(encoded);
          if (reloaded.snapshot().payloads.get(id)?.text !== source)
            throw Error("Reloaded text differs");
          return { encodedBytes: encoded.length };
        };
      });
    }
    for (const size of profile.ranges.holders) {
      const carrier = seeded(
        factory,
        "a".repeat(profile.ranges.sourceTextUtf16Units),
      );
      const token = carrier.captureHistoricalState();
      bench(
        factory.candidate,
        "range-build-and-lazy-resolve",
        size,
        () => () => {
          const ranges = buildRetainedRangeScalingFixture(
            carrier,
            token,
            { blockId: root, inlineContentId: id, start: 2, end: 5 },
            size,
          );
          const result = resolveProbeRange(
            carrier,
            ranges[size - 1],
            token,
            [],
          );
          if (result.length !== 1 || result[0].text !== "aaa")
            throw Error("Range resolution differs");
          return { holders: size, resolved: result.length };
        },
      );
    }
    console.log(
      "STEP3_NATIVE_LIFECYCLE " +
        JSON.stringify({
          candidate: factory.candidate,
          capability: seeded(factory, "a").nativeLifecycle(),
        }),
    );
  }
  for (const allocator of [
    localDensePositionAllocator,
    fractionalIndexPositionAllocator,
    fuguePositionAllocator,
  ]) {
    for (const size of profile.structure.narrowGapInsertions) {
      bench(allocator.candidate, "narrow-gap-and-sort", size, () => () => {
        const initial = allocator.allocateRun({
          count: 2,
          context: { runNonce: nonce(1) },
        });
        if (!initial.ok) throw Error("Allocator initial run failed");
        let lower = initial.value[0];
        const upper = initial.value[1],
          positions = [...initial.value];
        for (let i = 0; i < size; i++) {
          const next = allocator.allocateRun({
            lower,
            upper,
            count: 1,
            context: { runNonce: nonce(i + 2) },
          });
          if (
            !next.ok ||
            allocator.compare(lower, next.value[0]) >= 0 ||
            allocator.compare(next.value[0], upper) >= 0
          )
            throw Error("Allocator order invalid");
          lower = next.value[0];
          positions.push(lower);
        }
        positions.sort((a, b) => allocator.compare(a, b));
        const widths = positions.map((x) =>
          Buffer.byteLength(allocator.encode(x)),
        );
        return {
          maxPositionBytes: Math.max(...widths),
          totalPositionBytes: widths.reduce((a, b) => a + b, 0),
        };
      });
    }
  }
  const report = {
    schemaVersion: 1,
    profile,
    generatedAt: new Date().toISOString(),
    revision: process.env.GITHUB_SHA ?? null,
    environment: {
      platform: platform(),
      release: release(),
      arch: arch(),
      node: process.version,
      cpu: cpus()[0]?.model,
      cpus: cpus().length,
      ramBytes: totalmem(),
    },
    rows,
  };
  await mkdir("step3-evidence", { recursive: true });
  await writeFile(
    "step3-evidence/measurements.json",
    JSON.stringify(report, null, 2) + "\n",
  );
} finally {
  await server.close();
}
