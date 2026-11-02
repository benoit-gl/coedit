import { performance } from "node:perf_hooks";
import { cpus, platform, release, arch, totalmem } from "node:os";
import { createServer } from "vite";

// Reproduce with: node scripts/step3-mixed-history.mjs > mixed-history.json
// Each sample makes a new carrier. Alternating order reduces systematic bias.
const counts = [12, 40, 100];
const samples = 3;
const server = await createServer({
  appType: "custom",
  server: { middlewareMode: true, hmr: false },
  logLevel: "error",
});
const load = (p) => server.ssrLoadModule("/" + p);
try {
  const [
    { measureMixedHistoryLifecycle },
    { localDensePositionAllocator },
    { createYjsIntegratedDocumentCarrierFactory },
    { createAutomergeIntegratedDocumentCarrierFactory },
  ] = await Promise.all([
    load("qualification/step3/comparison/historyLifecycle.ts"),
    load("qualification/step3/structure/localDensePosition.ts"),
    load("qualification/step3/integrated/yjsIntegratedDocumentCarrier.ts"),
    load(
      "qualification/step3/integrated/automergeIntegratedDocumentCarrier.ts",
    ),
  ]);
  const factories = [
    createYjsIntegratedDocumentCarrierFactory,
    createAutomergeIntegratedDocumentCarrierFactory,
  ].map((make) =>
    make(localDensePositionAllocator, localDensePositionAllocator),
  );
  const rows = [];
  for (const count of counts)
    for (let iteration = 0; iteration < samples; iteration++) {
      const order = iteration % 2 ? [...factories].reverse() : factories;
      for (const [index, factory] of order.entries()) {
        const details = measureMixedHistoryLifecycle(factory, count, () =>
          performance.now(),
        );
        const row = {
          candidate: factory.candidate,
          count,
          iteration,
          order: index + 1,
          details,
        };
        rows.push(row);
        // Keep individual completed samples in stderr even if a later sample fails.
        console.error("STEP3_MIXED_HISTORY " + JSON.stringify(row));
      }
    }
  console.log(
    JSON.stringify(
      {
        schemaVersion: 1,
        status: "completed",
        generatedAt: new Date().toISOString(),
        revision: process.env.GITHUB_SHA ?? null,
        counts,
        samples,
        warmups: 0,
        environment: {
          node: process.version,
          platform: platform(),
          release: release(),
          arch: arch(),
          cpu: cpus()[0]?.model,
          cpus: cpus().length,
          ramBytes: totalmem(),
        },
        rows,
      },
      null,
      2,
    ),
  );
} finally {
  await server.close();
}
