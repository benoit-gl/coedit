import { Buffer } from "node:buffer";
import { spawn } from "node:child_process";
import { setTimeout, clearTimeout } from "node:timers";
import { URL } from "node:url";
import { readFile } from "node:fs/promises";
import { mkdirSync, writeFileSync } from "node:fs";
import { cpus, platform, release, arch, totalmem } from "node:os";
import { performance } from "node:perf_hooks";
import { createServer } from "vite";

const profile = JSON.parse(
  await readFile(
    new URL("../qualification/step3/comparison/profile.json", import.meta.url),
    "utf8",
  ),
);
const rows = [];
let unknownHistoryFailure = false;
const historyTimeoutMs = profile.history.timeoutMs ?? 300_000;
if (!Number.isInteger(historyTimeoutMs) || historyTimeoutMs <= 0)
  throw new Error("history.timeoutMs must be a positive integer");
function checkpoint(status) {
  const report = {
    schemaVersion: 1,
    status,
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
  mkdirSync("step3-evidence", { recursive: true });
  writeFileSync(
    "step3-evidence/measurements.json",
    JSON.stringify(report, null, 2) + "\n",
  );
}
checkpoint("incomplete");
const server = await createServer({
  appType: "custom",
  server: { middlewareMode: true, hmr: false },
  logLevel: "error",
});
let serverClosed = false;
async function closeLoader() {
  if (serverClosed) return;
  await server.close();
  serverClosed = true;
}
const load = (path) => server.ssrLoadModule("/" + path);

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
  checkpoint("incomplete");
  console.log("STEP3_ROW " + JSON.stringify(row));
}
async function runHistoryCandidate(candidate, count) {
  const started = performance.now();
  const child = spawn(process.execPath, ["scripts/step3-history.mjs"], {
    stdio: ["ignore", "pipe", "pipe"],
    env: {
      ...process.env,
      STEP3_HISTORY_CANDIDATE: candidate,
      STEP3_HISTORY_COUNT: String(count),
    },
  });
  let stdout = "";
  let stderrTail = "";
  let error;
  let timedOut = false;
  const timer = setTimeout(() => {
    timedOut = true;
    child.kill("SIGKILL");
  }, historyTimeoutMs);
  child.stdout.setEncoding("utf8").on("data", (chunk) => {
    stdout += chunk;
  });
  child.stderr.setEncoding("utf8").on("data", (chunk) => {
    process.stderr.write(chunk);
    stderrTail = (stderrTail + chunk).slice(-65536);
  });
  child.on("error", (cause) => {
    error = cause;
  });
  const { exitCode, signal } = await new Promise((resolve) => {
    child.on("close", (code, exitSignal) => {
      resolve({ exitCode: code, signal: exitSignal });
    });
  });
  clearTimeout(timer);
  return {
    stdout,
    stderrTail,
    exitCode,
    signal,
    error,
    timedOut,
    wallMs: performance.now() - started,
  };
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
    { runExtendedMeasurements },
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
    load("qualification/step3/comparison/extendedMeasurements.ts"),
  ]);
  await closeLoader();
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
  runExtendedMeasurements(
    factories,
    profile.ranges.holders,
    profile.ranges.sourceTextUtf16Units,
    bench,
  );
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
  // Alternate candidates for each sample and size on the same host. Every
  // measured history has its own process and fresh fixture.
  for (const count of profile.history.effects) {
    const historyRows = new Map(
      factories.map(({ candidate }) => [
        candidate,
        {
          candidate,
          workload: "attributed-effect-history",
          size: count,
          samplesMs: [],
          medianMs: null,
          p95Ms: null,
          details: {
            samples: [],
            warmups: 0,
            requestedSamples: profile.method.samples,
            timeoutMs: historyTimeoutMs,
            interval: "edit loop only",
            status: "incomplete",
          },
        },
      ]),
    );
    rows.push(...historyRows.values());
    checkpoint("incomplete");
    for (let iteration = 0; iteration < profile.method.samples; iteration++) {
      const order = iteration % 2 ? [...factories].reverse() : factories;
      for (const { candidate } of order) {
        const row = historyRows.get(candidate);
        // A timeout or explicit OOM makes further attempts at this size infeasible.
        if (
          row.details.status === "resource-exhaustion" ||
          row.details.status === "timeout"
        )
          continue;
        console.log(
          "STEP3_HISTORY_START " +
            JSON.stringify({
              candidate,
              count,
              iteration,
              timeoutMs: historyTimeoutMs,
            }),
        );
        const execution = await runHistoryCandidate(candidate, count);
        const match = execution.stdout.match(/^STEP3_HISTORY (.+)$/m);
        let result = null;
        try {
          if (execution.exitCode === 0 && match) result = JSON.parse(match[1]);
        } catch {
          /* malformed output is an unknown failure */
        }
        const outcome = execution.timedOut
          ? "timeout"
          : result?.outcome === "completed"
            ? "completed"
            : /rust_oom|out of memory|allocation failed/i.test(
                  execution.stderrTail,
                )
              ? "resource-exhaustion"
              : "unknown-failure";
        const sample = {
          iteration,
          outcome,
          wallMs: execution.wallMs,
          ...(outcome === "completed"
            ? result
            : {
                exitCode: execution.exitCode,
                signal: execution.signal,
                error: execution.error?.message ?? null,
                stderrTail: execution.stderrTail,
              }),
        };
        row.details.samples.push(sample);
        if (outcome === "completed") row.samplesMs.push(result.editLoopMs);
        else {
          row.details.status = outcome;
          if (outcome === "unknown-failure") unknownHistoryFailure = true;
        }
        if (row.samplesMs.length >= 3)
          row.medianMs = percentile(row.samplesMs, 50);
        if (row.samplesMs.length >= 20)
          row.p95Ms = percentile(row.samplesMs, 95);
        if (
          row.details.samples.length === profile.method.samples &&
          row.details.samples.every((s) => s.outcome === "completed")
        )
          row.details.status = "completed";
        checkpoint("incomplete");
        console.log(
          "STEP3_HISTORY_RESULT " +
            JSON.stringify({ candidate, count, ...sample }),
        );
      }
    }
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
    for (const count of profile.content.opaqueBytes) {
      const opaqueId = parseInlineContentId(uuid(3));
      const seed = seeded(factory, "a");
      seed.applyChange({
        inlineContents: [{ inlineContentId: opaqueId, blockId: root }],
        payloads: [
          {
            kind: "replace-opaque",
            inlineContentId: opaqueId,
            mediaType: "application/example",
            bytes: new Uint8Array(1),
            origin,
          },
        ],
      });
      const initial = seed.encode();
      const bytes = new Uint8Array(count).fill(42);
      bench(factory.candidate, "opaque-replacement", count, () => {
        const carrier = factory.load(initial);
        return () => {
          carrier.applyChange({
            payloads: [
              {
                kind: "replace-opaque",
                inlineContentId: opaqueId,
                mediaType: "application/example",
                bytes,
                origin,
              },
            ],
          });
          const projected = carrier.snapshot().payloads.get(opaqueId);
          if (projected?.kind !== "opaque" || projected.bytes.length !== count)
            throw Error("Opaque replacement differs");
          return { encodedBytes: carrier.encode().length };
        };
      });
    }
    bench(factory.candidate, "replacement-alternative-retention", 2, () => {
      const initial = seeded(factory, "abc").encode();
      const left = factory.load(initial);
      const right = factory.load(initial);
      return () => {
        left.applyChange({
          payloads: [
            {
              kind: "replace-text",
              inlineContentId: id,
              mediaType: "text/plain",
              text: "left",
              origin,
            },
          ],
          context: { actorId: "left", effectId: "replacement" },
        });
        right.applyChange({
          payloads: [
            {
              kind: "replace-text",
              inlineContentId: id,
              mediaType: "text/markdown",
              text: "right",
              origin,
            },
          ],
          context: { actorId: "right", effectId: "replacement" },
        });
        left.mergeEncoded(right.encode());
        const effects = left.recordedPayloadEffects();
        if (effects.length < 2)
          throw Error("Replacement alternatives not retained");
        return {
          recordedEffects: effects.length,
          encodedBytes: left.encode().length,
        };
      };
    });
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
  checkpoint(unknownHistoryFailure ? "incomplete" : "completed");
  if (unknownHistoryFailure) process.exitCode = 1;
} finally {
  await closeLoader();
}
