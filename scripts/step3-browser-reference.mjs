import { spawnSync } from "node:child_process";
import { closeSync, openSync } from "node:fs";
import { mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import { cpus, platform, release, arch, totalmem } from "node:os";
import { resolve } from "node:path";
import { URL } from "node:url";
import { chromium } from "playwright";
import {
  parseBrowserReference,
  summarizeBrowserReference,
} from "./step3-browser-reference-report.mjs";

if (process.argv.length > 3)
  throw Error(
    "Usage: node scripts/step3-browser-reference.mjs [OUTPUT_DIRECTORY]",
  );
const output = resolve(process.argv[2] ?? "step3-evidence/browser-reference");
await mkdir(output, { recursive: true });
if ((await readdir(output)).length)
  throw Error("Browser/reference evidence directory must be empty.");
const git = (...args) => {
  const result = spawnSync("git", args, { encoding: "utf8" });
  if (result.error || result.status !== 0)
    throw Error(
      `Cannot identify measured source: ${result.error?.message ?? result.stderr}`,
    );
  return result.stdout.trim();
};
const profile = JSON.parse(
  await readFile(
    new URL(
      "../qualification/step3/comparison/browser-reference-profile.json",
      import.meta.url,
    ),
    "utf8",
  ),
);
const report = {
  schemaVersion: 1,
  status: "running",
  generatedAt: new Date().toISOString(),
  revision: {
    head: git("rev-parse", "HEAD"),
    workingTree: git("status", "--short"),
    githubSha: process.env.GITHUB_SHA ?? null,
    githubHeadSha: process.env.GITHUB_HEAD_SHA ?? null,
  },
  environment: {
    node: process.version,
    platform: platform(),
    release: release(),
    arch: arch(),
    cpu: cpus()[0]?.model,
    logicalCpus: cpus().length,
    ramBytes: totalmem(),
  },
  profile,
  errors: [],
};
const checkpoint = () =>
  writeFile(
    resolve(output, "report.json"),
    JSON.stringify(report, null, 2) + "\n",
  );
await writeFile(
  resolve(output, "report.json"),
  JSON.stringify(report, null, 2) + "\n",
  { flag: "wx" },
);
try {
  report.packages = Object.fromEntries(
    await Promise.all(
      [
        "yjs",
        "@automerge/automerge",
        "playwright",
        "prosemirror-view",
        "prosemirror-state",
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
  );
  const browser = await chromium.launch({ headless: true });
  try {
    report.environment.browser = {
      name: "Chromium",
      version: browser.version(),
      method: "same pinned Playwright executable, separate metadata launch",
    };
  } finally {
    await browser.close();
  }
  const npmCli = process.env.npm_execpath;
  const npm = npmCli
    ? process.execPath
    : process.platform === "win32"
      ? "npm.cmd"
      : "npm";
  // The child streams both channels directly to disk. An externally terminated
  // parent can leave a running report, but earlier completed raw rows survive.
  const browserLog = resolve(output, "browser.log");
  const logDescriptor = openSync(browserLog, "wx");
  let execution;
  try {
    execution = spawnSync(
      npm,
      [
        ...(npmCli ? [npmCli] : []),
        "run",
        "test:browser",
        "--",
        "qualification/step3/comparison/browserReference.browser.test.ts",
      ],
      {
        stdio: ["ignore", logDescriptor, logDescriptor],
        shell: !npmCli && process.platform === "win32",
      },
    );
  } finally {
    closeSync(logDescriptor);
  }
  const parsed = parseBrowserReference(
    await readFile(browserLog, "utf8"),
    profile,
  );
  report.browser = {
    status:
      execution.status === 0 && !execution.error && !parsed.errors.length
        ? "complete"
        : "error",
    exitCode: execution.status,
    signal: execution.signal,
    error: execution.error?.message ?? null,
    ...parsed,
  };
  if (report.browser.status !== "complete")
    report.errors.push(
      "Browser execution or observation manifest is incomplete; inspect browser.log and browser.errors.",
    );
  else report.summaries = summarizeBrowserReference(parsed.rows);
  await checkpoint();

  const reference = spawnSync(
    process.execPath,
    ["scripts/step3-loro.mjs", resolve(output, "loro-reference.json")],
    { encoding: "utf8", maxBuffer: 32 * 1024 * 1024 },
  );
  await writeFile(
    resolve(output, "loro.log"),
    (reference.stdout ?? "") + (reference.stderr ?? ""),
  );
  report.loro = {
    exitCode: reference.status,
    error: reference.error?.message ?? null,
  };
  if (reference.status !== 0 || reference.error)
    report.errors.push(
      "Loro reference execution is incomplete; inspect loro.log and loro-reference.json.",
    );
  else {
    const nativeReport = JSON.parse(
      await readFile(resolve(output, "loro-reference.json"), "utf8"),
    );
    report.loro.report = nativeReport;
    if (
      nativeReport.status !== "complete" ||
      nativeReport.selectable !== false ||
      nativeReport.version !== "1.16.4" ||
      nativeReport.rows?.length !== 3
    )
      report.errors.push(
        "Loro reference report does not establish completed pinned reference execution.",
      );
  }
  report.status = report.errors.length ? "error" : "complete";
  await checkpoint();
} catch (error) {
  report.status = "error";
  report.errors.push(error instanceof Error ? error.stack : String(error));
  await checkpoint();
}
console.log("STEP3_BROWSER_REFERENCE_REPORT=" + JSON.stringify(report));
console.log(`Browser/reference evidence ${report.status}: ${output}`);
if (report.status !== "complete") process.exitCode = 1;
