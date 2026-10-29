import { spawnSync } from "node:child_process";
import { mkdir, readdir, writeFile } from "node:fs/promises";
import { arch, cpus, platform, release, totalmem } from "node:os";

const stages = [
  { name: "headless-common-suites", args: ["run", "test"] },
  { name: "chromium-editor-suites", args: ["run", "test:browser"] },
  { name: "paired-carriers-and-allocators", args: ["run", "step3:measure"] },
  {
    name: "snapshot-versus-targeted",
    args: ["run", "step3:snapshot-comparison"],
  },
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
  const captureBrowser = stage.name === "chromium-editor-suites";
  const execution = spawnSync(npm, stage.args, {
    stdio: captureBrowser ? "pipe" : "inherit",
    encoding: "utf8",
    maxBuffer: 32 * 1024 * 1024,
    shell: process.platform === "win32",
  });
  let stageError = execution.error?.message ?? null;
  if (captureBrowser) {
    process.stdout.write(execution.stdout ?? "");
    process.stderr.write(execution.stderr ?? "");
    if (!stageError && execution.status === 0) {
      const matches = [
        ...(execution.stdout ?? "").matchAll(
          /STEP3_EDITOR_FEEDBACK_JSON=(\{[^\r\n]*\})/g,
        ),
      ];
      try {
        if (matches.length !== 1)
          throw new Error("Expected exactly one browser measurement record.");
        const browser = JSON.parse(matches[0][1]);
        if (!Array.isArray(browser.samples) || browser.samples.length !== 14)
          throw new Error("Browser measurement samples are incomplete.");
        await writeFile(
          "step3-evidence/editor-feedback.json",
          JSON.stringify(
            {
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
              ...browser,
            },
            null,
            2,
          ) + "\n",
        );
        const workloadMatches = [
          ...(execution.stdout ?? "").matchAll(
            /STEP3_EDITOR_WORKLOADS_JSON=(\{[^\r\n]*\})/g,
          ),
        ];
        if (workloadMatches.length !== 1)
          throw new Error("Expected exactly one browser workload record.");
        const workloads = JSON.parse(workloadMatches[0][1]);
        if (
          workloads.profile?.cases?.length !== 9 ||
          !Array.isArray(workloads.samples) ||
          workloads.samples.length !== 126 ||
          !Array.isArray(workloads.summaries) ||
          workloads.summaries.length !== 18
        )
          throw new Error("Browser workload samples are incomplete.");
        await writeFile(
          "step3-evidence/editor-workloads.json",
          JSON.stringify(
            {
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
              ...workloads,
            },
            null,
            2,
          ) + "\n",
        );
        const isolationMatches = [
          ...(execution.stdout ?? "").matchAll(
            /STEP3_DOWNSTREAM_ISOLATION_JSON=(\{[^\r\n]*\})/g,
          ),
        ];
        if (isolationMatches.length !== 1)
          throw new Error("Expected exactly one downstream isolation record.");
        const isolation = JSON.parse(isolationMatches[0][1]);
        if (
          !Array.isArray(isolation.samples) ||
          isolation.samples.length !== 28
        )
          throw new Error("Downstream isolation samples are incomplete.");
        await writeFile(
          "step3-evidence/downstream-isolation.json",
          JSON.stringify(
            {
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
              ...isolation,
            },
            null,
            2,
          ) + "\n",
        );
      } catch (error) {
        stageError = `Browser evidence collection failed: ${error.message}`;
      }
    }
  }
  results.push({
    stage: stage.name,
    started,
    finished: new Date().toISOString(),
    exitCode: execution.status,
    error: stageError,
  });
  await writeFile(
    "step3-evidence/runner.json",
    JSON.stringify(
      { revision: process.env.GITHUB_SHA ?? null, stages: results },
      null,
      2,
    ) + "\n",
  );
  if (stageError || execution.status !== 0) {
    throw new Error(
      `Step 3 qualification stage ${stage.name} failed: ${stageError ?? execution.status}`,
    );
  }
}
