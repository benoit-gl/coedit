// Bounded comparative allocator evidence. Each completed row is checkpointed.
import { createServer } from "vite";
import { performance } from "node:perf_hooks";
import { writeFileSync, readFileSync } from "node:fs";
import { cpus, platform, release, arch, totalmem } from "node:os";
import { execFileSync } from "node:child_process";

const output = process.argv[2];
if (!output || process.argv.length !== 3)
  throw new Error("Usage: node scripts/step3-allocator-stress.mjs OUTPUT.json");
const smoke = process.env.STEP3_ALLOCATOR_SMOKE === "1";
const profile = {
  sizes: smoke ? [8] : [16, 128, 512],
  warmups: smoke ? 0 : 1,
  samples: smoke ? 1 : 3,
  concurrentRuns: 8,
  membersPerRun: 2,
  syntheticCollisionHolders: 8,
  practicalRunMembers: 4096,
  localCandidateRefusalMembers: 65536,
  candidateOrder:
    "rotate candidates per iteration; one process, all sizes sequential",
  timing:
    "synchronous performance.now; allocation, encode, decode, adjacent comparisons, sort, narrow loop, normalization and 4096-member allocation separately; narrow includes interval checks; verification outside other intervals",
  maturity: "experimental",
};
const git = (...args) => {
  try {
    return execFileSync("git", args, { encoding: "utf8" }).trim();
  } catch {
    return null;
  }
};
const data = {
  status: "running",
  profile,
  revision: {
    githubSha: process.env.GITHUB_SHA ?? null,
    githubHeadSha: process.env.GITHUB_HEAD_SHA ?? null,
    localHead: git("rev-parse", "HEAD"),
    workingTree: git("status", "--porcelain"),
  },
  environment: {
    node: process.version,
    platform: platform(),
    release: release(),
    arch: arch(),
    cpu: cpus()[0]?.model,
    logicalCpus: cpus().length,
    ramBytes: totalmem(),
    packages: Object.fromEntries(
      ["fractional-indexing", "fugue", "vite"].map((name) => [
        name,
        JSON.parse(readFileSync(`node_modules/${name}/package.json`, "utf8"))
          .version,
      ]),
    ),
  },
  rows: [],
  practical: [],
};
writeFileSync(output, JSON.stringify(data, null, 2) + "\n", { flag: "wx" });
const checkpoint = () =>
  writeFileSync(output, JSON.stringify(data, null, 2) + "\n");
let server;
try {
  server = await createServer({
    configFile: false,
    appType: "custom",
    server: { middlewareMode: true, hmr: false, ws: false },
    logLevel: "error",
  });
  const load = (path) => server.ssrLoadModule("/" + path);
  const [fixture, fractional, fugue, local] = await Promise.all([
    load("qualification/step3/comparison/allocatorStress.ts"),
    load("qualification/step3/structure/fractionalIndexPosition.ts"),
    load("qualification/step3/structure/fuguePosition.ts"),
    load("qualification/step3/structure/localDensePosition.ts"),
  ]);
  const candidates = [
    fractional.fractionalIndexPositionAllocator,
    fugue.fuguePositionAllocator,
    local.localDensePositionAllocator,
  ];
  let sequence = 0;
  for (const size of profile.sizes) {
    for (
      let iteration = -profile.warmups;
      iteration < profile.samples;
      iteration++
    ) {
      const shift = (iteration + profile.warmups) % candidates.length;
      const order = [...candidates.slice(shift), ...candidates.slice(0, shift)];
      for (const [orderIndex, candidate] of order.entries()) {
        const sample = fixture.measureAllocatorStress(candidate, size, () =>
          performance.now(),
        );
        if (iteration >= 0) {
          data.rows.push({
            iteration,
            order: orderIndex + 1,
            sequence: ++sequence,
            ...sample,
          });
          checkpoint();
        }
      }
    }
  }
  for (const [order, candidate] of candidates.entries()) {
    data.practical.push({
      candidate: candidate.candidate,
      order: order + 1,
      ...fixture.measurePracticalAllocatorRun(candidate, () =>
        performance.now(),
      ),
      failures: fixture.measureAllocatorFailureModes(candidate),
      processMaxRssKiB: process.resourceUsage().maxRSS,
    });
    checkpoint();
  }
  data.status = "completed";
  checkpoint();
  console.log(`Wrote ${output}`);
} catch (error) {
  data.status = "error";
  data.error = error instanceof Error ? error.stack : String(error);
  checkpoint();
  throw error;
} finally {
  if (server) await server.close();
}
