// Standalone, exclusive evidence writer; the full runner supplies an empty directory.
import { execFileSync } from "node:child_process";
import { writeFileSync } from "node:fs";
import { readFile, writeFile } from "node:fs/promises";
import { URL } from "node:url";
import { cpus, platform, release, arch, totalmem } from "node:os";
import { createServer } from "vite";

const output = process.argv[2] ?? "step3-evidence/ordinary-edit.json";
const metadata = {
  generatedAt: new Date().toISOString(),
  revision: execFileSync("git", ["rev-parse", "HEAD"], {
    encoding: "utf8",
  }).trim(),
  workingTree: execFileSync("git", ["status", "--short"], {
    encoding: "utf8",
  }).trim(),
  environment: {
    platform: platform(),
    release: release(),
    arch: arch(),
    node: process.version,
    cpu: cpus()[0]?.model,
    logicalCpus: cpus().length,
    ramBytes: totalmem(),
  },
  packages: Object.fromEntries(
    await Promise.all(
      [
        "yjs",
        "@automerge/automerge",
        "prosemirror-view",
        "prosemirror-state",
        "vite",
      ].map(async (name) => [
        name,
        JSON.parse(
          await readFile(
            new URL(`../node_modules/${name}/package.json`, import.meta.url),
            "utf8",
          ),
        ).version,
      ]),
    ),
  ),
};
await writeFile(
  output,
  JSON.stringify({ status: "running", ...metadata }) + "\n",
  { flag: "wx" },
);
let server;
let partialRows = [];
try {
  server = await createServer({
    appType: "custom",
    server: { middlewareMode: true, hmr: false },
    logLevel: "error",
  });
  const { runOrdinaryEditComparison } = await server.ssrLoadModule(
    "/qualification/step3/comparison/ordinaryEditComparison.ts",
  );
  const { runOrdinaryEditLifecycle } = await server.ssrLoadModule(
    "/qualification/step3/comparison/ordinaryEditLifecycle.ts",
  );
  const { runNativeOrdinaryWork } = await server.ssrLoadModule(
    "/qualification/step3/comparison/nativeOrdinaryWork.ts",
  );
  const result = runOrdinaryEditComparison(undefined, 5, 2, (rows) => {
    partialRows = rows;
    writeFileSync(
      output,
      JSON.stringify({ status: "running", ...metadata, partialRows }, null, 2) +
        "\n",
    );
  });
  const lifecycle = runOrdinaryEditLifecycle();
  const nativeWork = runNativeOrdinaryWork();
  await writeFile(
    output,
    JSON.stringify({ ...metadata, ...result, lifecycle, nativeWork }, null, 2) +
      "\n",
  );
  console.log(`Wrote ${output}`);
} catch (error) {
  await writeFile(
    output,
    JSON.stringify(
      {
        status: "error",
        ...metadata,
        partialRows,
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
