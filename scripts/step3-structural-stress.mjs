// Paired qualification-only structural measurements; no production threshold.
import { readFileSync, writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { performance } from "node:perf_hooks";
import { arch, cpus, platform, release, totalmem } from "node:os";
import { createServer } from "vite";

const output = process.argv[2];
if (!output || process.argv.length !== 3)
  throw new Error(
    "Usage: node scripts/step3-structural-stress.mjs OUTPUT.json",
  );
// Profiles 2–5 vary one baseline dimension; the last combines dimensions.
const allProfiles = [
  { siblings: 8, subtree: 4, depth: 2, repeatedMoves: 2 },
  { siblings: 32, subtree: 4, depth: 2, repeatedMoves: 2 },
  { siblings: 8, subtree: 16, depth: 2, repeatedMoves: 2 },
  { siblings: 8, subtree: 16, depth: 8, repeatedMoves: 2 },
  { siblings: 8, subtree: 4, depth: 2, repeatedMoves: 16 },
  { siblings: 64, subtree: 16, depth: 8, repeatedMoves: 16 },
];
const smoke = process.env.STEP3_STRUCTURAL_SMOKE === "1";
const profiles = smoke ? allProfiles.slice(0, 1) : allProfiles;
const warmups = smoke ? 0 : 1,
  samples = smoke ? 1 : 3;
const git = (...args) => {
  const result = spawnSync("git", args, { encoding: "utf8" });
  if (result.error)
    return { value: null, error: result.error.code ?? "spawn failed" };
  if (result.status !== 0)
    return { value: null, error: `git exited ${result.status}` };
  return { value: result.stdout.trim(), error: null };
};
const head = git("rev-parse", "HEAD");
const workingTree = git("status", "--porcelain");
const packages = {};
const packageErrors = {};
for (const name of [
  "yjs",
  "@automerge/automerge",
  "fractional-indexing",
  "fugue",
  "vite",
]) {
  try {
    const version = JSON.parse(
      readFileSync(`node_modules/${name}/package.json`, "utf8"),
    ).version;
    if (typeof version !== "string") throw new Error("version unavailable");
    packages[name] = version;
  } catch (error) {
    packages[name] = null;
    packageErrors[name] =
      error instanceof Error ? error.message : String(error);
  }
}
const metadata = {
  schemaVersion: 1,
  revision: process.env.GITHUB_SHA ?? null,
  githubHeadSha: process.env.GITHUB_HEAD_SHA ?? null,
  localHead: head.value,
  workingTree: workingTree.value,
  dirty: workingTree.value === null ? null : workingTree.value.length > 0,
  gitErrors: { head: head.error, workingTree: workingTree.error },
  profile: {
    smoke,
    profiles,
    warmups,
    samples,
    order:
      "paired candidates alternate by iteration; one process; fresh carrier per sample",
  },
  environment: {
    node: process.version,
    platform: platform(),
    release: release(),
    arch: arch(),
    cpu: cpus()[0]?.model,
    logicalCpus: cpus().length,
    totalMemoryBytes: totalmem(),
    packages,
    packageErrors,
  },
  boundaries:
    "Mutation timers cover applyChange only. Snapshot, projection, encoding, load and merge are timed separately; verification, setup and fixture construction are excluded except initMs includes initial applyChange.",
  limitations: [
    "Qualification fixture; no product API or allocator selection.",
    "Three observations do not estimate tail latency.",
    "Paired samples in one process share runtime warming and garbage collection.",
    "Only two independent, distinct-Block concurrent moves and complete-state exchange are measured.",
  ],
};
const rows = [];
const write = (status, error) =>
  writeFileSync(
    output,
    JSON.stringify(
      { ...metadata, status, rows, ...(error ? { error } : {}) },
      null,
      2,
    ) + "\n",
  );
writeFileSync(
  output,
  JSON.stringify({ ...metadata, status: "running", rows }) + "\n",
  { flag: "wx" },
);
let server;
try {
  server = await createServer({
    appType: "custom",
    server: { middlewareMode: true, hmr: false, ws: false },
    logLevel: "error",
  });
  const load = (path) => server.ssrLoadModule("/" + path);
  const [
    { measureStructuralStress },
    { localDensePositionAllocator },
    { createYjsIntegratedDocumentCarrierFactory },
    { createAutomergeIntegratedDocumentCarrierFactory },
  ] = await Promise.all([
    load("qualification/step3/comparison/structuralStress.ts"),
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
  for (const profile of profiles) {
    for (let iteration = -warmups; iteration < samples; iteration++) {
      const order = iteration % 2 ? [...factories].reverse() : factories;
      for (
        let candidateOrder = 0;
        candidateOrder < order.length;
        candidateOrder++
      ) {
        const factory = order[candidateOrder];
        const result = measureStructuralStress(factory, profile, () =>
          performance.now(),
        );
        if (iteration >= 0) {
          rows.push({
            iteration,
            candidateOrder: candidateOrder + 1,
            ...result,
          });
          write("running");
        }
      }
    }
  }
  write("complete");
} catch (error) {
  write(
    "error",
    error instanceof Error ? (error.stack ?? error.message) : String(error),
  );
  throw error;
} finally {
  if (server) await server.close();
}
