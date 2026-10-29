import { spawnSync } from "node:child_process";
import { mkdir, readdir, writeFile } from "node:fs/promises";

const stages = [
  { name: "headless-common-suites", args: ["run", "test"] },
  { name: "chromium-editor-suites", args: ["run", "test:browser"] },
  { name: "paired-carriers-and-allocators", args: ["run", "step3:measure"] },
  { name: "nonselectable-loro-reference", args: ["run", "step3:loro"] },
];
await mkdir("step3-evidence", { recursive: true });
if ((await readdir("step3-evidence")).length !== 0)
  throw new Error(
    "step3-evidence is not empty. Preserve or move its prior results before starting a new run.",
  );
const results = [];
const npm = process.platform === "win32" ? "npm.cmd" : "npm";
for (const stage of stages) {
  const started = new Date().toISOString();
  const execution = spawnSync(npm, stage.args, {
    stdio: "inherit",
    shell: process.platform === "win32",
  });
  results.push({
    stage: stage.name,
    started,
    finished: new Date().toISOString(),
    exitCode: execution.status,
    error: execution.error?.message ?? null,
  });
  await writeFile(
    "step3-evidence/runner.json",
    JSON.stringify(
      { revision: process.env.GITHUB_SHA ?? null, stages: results },
      null,
      2,
    ) + "\n",
  );
  if (execution.error || execution.status !== 0) {
    throw new Error(
      `Step 3 qualification stage ${stage.name} failed: ${execution.error?.message ?? execution.status}`,
    );
  }
}
