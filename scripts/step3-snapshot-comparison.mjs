// Usage: node scripts/step3-snapshot-comparison.mjs [output.json] [samples] [iterations] [warmup]
// Writes a new file exclusively; it never replaces existing evidence.
import { readFile, writeFile } from "node:fs/promises";
import { cpus, platform, release, arch, totalmem } from "node:os";
import { execFileSync } from "node:child_process";
import { createServer } from "vite";
import { URL } from "node:url";

if (process.argv.includes("--help")) {
  console.log(
    "Usage: node scripts/step3-snapshot-comparison.mjs [output.json] [samples=8] [iterations=10] [warmup=10]\nOutput is created exclusively; iterations and warmup must be positive even integers. Timings are local headless applyChange only.",
  );
  process.exit(0);
}
const [
  output = `step3-snapshot-comparison-${Date.now()}.json`,
  sampleArg = "8",
  iterationArg = "10",
  warmupArg = "10",
] = process.argv.slice(2);
const versions = Object.fromEntries(
  await Promise.all(
    ["yjs", "@automerge/automerge", "vite"].map(async (name) => [
      name,
      JSON.parse(
        await readFile(
          new URL(`../node_modules/${name}/package.json`, import.meta.url),
          "utf8",
        ),
      ).version,
    ]),
  ),
);
let revision = null;
let workingTree = null;
try {
  revision = execFileSync("git", ["rev-parse", "HEAD"], {
    encoding: "utf8",
  }).trim();
  workingTree = execFileSync("git", ["status", "--short"], {
    encoding: "utf8",
  }).trim();
} catch {
  /* Report unknown rather than infer a revision. */
}
// Reserve the path before performing expensive work and preserve an error report on failure.
await writeFile(output, JSON.stringify({ status: "running" }) + "\n", {
  flag: "wx",
});
const metadata = {
  generatedAt: new Date().toISOString(),
  revision,
  workingTree,
  environment: {
    platform: platform(),
    release: release(),
    arch: arch(),
    node: process.version,
    cpu: cpus()[0]?.model,
    logicalCpus: cpus().length,
    ramBytes: totalmem(),
    packages: versions,
  },
};
let server;
try {
  server = await createServer({
    appType: "custom",
    server: { middlewareMode: true, hmr: false },
    logLevel: "error",
  });
  const { runSnapshotComparison } = await server.ssrLoadModule(
    "/qualification/step3/comparison/snapshotComparison.ts",
  );
  const comparison = runSnapshotComparison(
    Number(sampleArg),
    Number(iterationArg),
    Number(warmupArg),
  );
  await writeFile(
    output,
    JSON.stringify(
      { status: "complete", ...metadata, ...comparison },
      null,
      2,
    ) + "\n",
  );
  console.log(`Wrote ${output}`);
} catch (error) {
  await writeFile(
    output,
    JSON.stringify(
      {
        status: "error",
        ...metadata,
        error: error instanceof Error ? error.stack : String(error),
      },
      null,
      2,
    ) + "\n",
  );
  throw error;
} finally {
  if (server) await server.close();
}
