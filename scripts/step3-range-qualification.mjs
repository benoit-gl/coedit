import { performance } from "node:perf_hooks";
import { cpus, platform, release, arch, totalmem } from "node:os";
import { spawnSync } from "node:child_process";
import { createServer } from "vite";

// Run from repository root; each completed row is logged even if a later case fails.
const rows = [];
const warmups = 1;
const samples = 3;
const git = (...args) => {
  const result = spawnSync("git", args, { encoding: "utf8" });
  return result.status === 0 ? result.stdout.trim() : null;
};
const status = git("status", "--porcelain");
const metadata = {
  revision: {
    githubSha: process.env.GITHUB_SHA ?? null,
    githubHeadSha: process.env.GITHUB_HEAD_SHA ?? null,
    head: git("rev-parse", "HEAD"),
    dirty: status === null ? null : status.length > 0,
  },
  environment: {
    node: process.version,
    platform: platform(),
    release: release(),
    arch: arch(),
    cpu: cpus()[0]?.model,
    cpus: cpus().length,
    ramBytes: totalmem(),
  },
  warmups,
  samples,
  processPolicy:
    "one process for all candidate/profile cases; fresh carrier per sample; alternating candidate order; process max RSS includes all prior cases and validation",
};
let server;
try {
  server = await createServer({
    appType: "custom",
    server: { middlewareMode: true, hmr: false, ws: false },
    logLevel: "error",
  });
  const load = (path) => server.ssrLoadModule("/" + path);
  const [range, position, yjs, automerge] = await Promise.all([
    load("qualification/step3/comparison/rangeQualification.ts"),
    load("qualification/step3/structure/localDensePosition.ts"),
    load("qualification/step3/integrated/yjsIntegratedDocumentCarrier.ts"),
    load(
      "qualification/step3/integrated/automergeIntegratedDocumentCarrier.ts",
    ),
  ]);
  const allocator = position.localDensePositionAllocator;
  const factories = [
    yjs.createYjsIntegratedDocumentCarrierFactory(allocator, allocator),
    automerge.createAutomergeIntegratedDocumentCarrierFactory(
      allocator,
      allocator,
    ),
  ];
  for (const shape of range.rangeQualificationShapes) {
    for (let iteration = -warmups; iteration < samples; iteration++) {
      const order =
        Math.abs(iteration) % 2 ? [...factories].reverse() : factories;
      for (const [index, factory] of order.entries()) {
        const result = range.measureRangeQualification(factory, shape, () =>
          performance.now(),
        );
        if (iteration >= 0) {
          const row = {
            candidate: factory.candidate,
            shape,
            iteration,
            candidateOrder: index + 1,
            result,
            processMaxRssKiB: process.resourceUsage().maxRSS,
          };
          rows.push(row);
          console.error("STEP3_RANGE_ROW " + JSON.stringify(row));
        }
      }
    }
  }
  console.log(
    JSON.stringify(
      {
        status: "completed",
        generatedAt: new Date().toISOString(),
        ...metadata,
        profile: range.rangeQualificationShapes,
        rows,
      },
      null,
      2,
    ),
  );
} catch (error) {
  console.log(
    JSON.stringify(
      {
        status: "error",
        ...metadata,
        rows,
        error: error instanceof Error ? error.stack : String(error),
      },
      null,
      2,
    ),
  );
  process.exitCode = 1;
} finally {
  if (server) await server.close();
}
