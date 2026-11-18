// Bounded, non-selectable native Loro reference evidence for Step 3 unit 9.
import { spawnSync } from "node:child_process";
import { createRequire } from "node:module";
import { arch, cpus, platform, release, totalmem } from "node:os";
import { performance } from "node:perf_hooks";
import { dirname, resolve } from "node:path";
import { readFile, mkdir, writeFile } from "node:fs/promises";
import { pathToFileURL, URL } from "node:url";

const [output = "step3-evidence/loro-reference.json"] = process.argv.slice(2);
if (process.argv.length > 3)
  throw new Error("Usage: node scripts/step3-loro.mjs [output.json]");
const resolvedOutput = resolve(output);
const prefix = resolve(
  process.env.LORO_REFERENCE_ROOT ?? ".step3-loro-reference",
);
const packagePath = resolve(prefix, "node_modules/loro-crdt/package.json");
const profile = JSON.parse(
  await readFile(
    new URL("../qualification/step3/comparison/profile.json", import.meta.url),
    "utf8",
  ),
);
const git = (...args) => {
  const result = spawnSync("git", args, { encoding: "utf8" });
  if (result.error)
    return { value: null, error: result.error.code ?? "git spawn failed" };
  if (result.status !== 0)
    return { value: null, error: `git exited ${result.status}` };
  return { value: result.stdout.trim(), error: null };
};
const head = git("rev-parse", "HEAD");
const workingTree = git("status", "--porcelain");
const rows = [];
const report = {
  schemaVersion: 2,
  status: "running",
  generatedAt: new Date().toISOString(),
  selectable: false,
  version: "1.16.4",
  revision: {
    localHead: head.value,
    workingTree: workingTree.value,
    dirty: workingTree.value === null ? null : workingTree.value.length > 0,
    githubSha: process.env.GITHUB_SHA ?? null,
    githubHeadSha: process.env.GITHUB_HEAD_SHA ?? null,
    githubRef: process.env.GITHUB_REF ?? null,
    githubRepository: process.env.GITHUB_REPOSITORY ?? null,
    githubRunId: process.env.GITHUB_RUN_ID ?? null,
    gitErrors: { head: head.error, workingTree: workingTree.error },
  },
  environment: {
    runtime: {
      node: process.version,
      versions: process.versions,
    },
    platform: platform(),
    release: release(),
    arch: arch(),
    cpu: cpus()[0]?.model ?? null,
    logicalCpus: cpus().length,
    totalMemoryBytes: totalmem(),
  },
  dependency: {
    package: "loro-crdt",
    requiredVersion: "1.16.4",
    installedVersion: null,
    isolationRoot: prefix,
    productionDependency: false,
    selectable: false,
  },
  profile,
  method: {
    samples: profile.method.samples,
    warmupRuns: profile.method.warmupRuns,
    clock: "performance.now",
    cursor: {
      fixture:
        "fresh LoroDoc with one native text container of 1024 ASCII UTF-16 units",
      interval:
        "Starts immediately before text.insert(512, 'x') and ends after native cursor resolution and independent text/offset assertions; fixture setup and cursor creation are excluded.",
    },
    movableTree: {
      fixture:
        "fresh LoroDoc with parent, left/right child parents, and one movable child",
      interval:
        "Starts immediately before alternating child.move calls and ends after doc.commit(), native tree projection, and independent final-parent assertion; fixture setup is excluded.",
    },
  },
  comparisonLimits: [
    "This is a native Loro cursor/movable-tree reference only, not a selectable candidate or common correctness gate.",
    "Native Loro operations are not equivalent to Coedit integrated carrier adapter operations.",
    "The intervals above differ from integrated-carrier setup, publication, projection, encoding, reload, merge, and verification intervals; numbers must not be compared as equivalent timings.",
    "Five measured samples and nearest-rank p95 are descriptive only; no timing threshold or pass/fail performance claim is applied.",
  ],
  rows,
};
const checkpoint = async () =>
  writeFile(resolvedOutput, JSON.stringify(report, null, 2) + "\n");

await mkdir(dirname(resolvedOutput), { recursive: true });
await writeFile(resolvedOutput, JSON.stringify(report, null, 2) + "\n", {
  flag: "wx",
});

try {
  let installedVersion;
  try {
    installedVersion = JSON.parse(await readFile(packagePath, "utf8")).version;
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
  }
  if (installedVersion !== "1.16.4") {
    const npmCli = process.env.npm_execpath;
    const npm = npmCli
      ? process.execPath
      : process.platform === "win32"
        ? "npm.cmd"
        : "npm";
    console.log(`Installing isolated loro-crdt@1.16.4 in ${prefix}`);
    const installation = spawnSync(
      npm,
      [
        ...(npmCli ? [npmCli] : []),
        "install",
        "--prefix",
        prefix,
        "--no-package-lock",
        "--no-save",
        "loro-crdt@1.16.4",
      ],
      { stdio: "inherit", shell: !npmCli && process.platform === "win32" },
    );
    if (installation.error || installation.status !== 0)
      throw Error(
        `Isolated Loro installation failed: ${installation.error?.message ?? installation.status}`,
      );
  }
  const packageInfo = JSON.parse(await readFile(packagePath, "utf8"));
  if (packageInfo.version !== "1.16.4")
    throw Error("Isolated Loro reference version differs");
  report.dependency.installedVersion = packageInfo.version;
  await checkpoint();

  const requireFromPrefix = createRequire(resolve(prefix, "package.json"));
  const entry = requireFromPrefix.resolve("loro-crdt");
  const { LoroDoc } = await import(pathToFileURL(entry).href);
  const sortedPercentile = (data, fraction) =>
    [...data].sort((a, b) => a - b)[Math.ceil(data.length * fraction) - 1];
  const record = async (workload, input, timingInterval, prepare) => {
    const samplesMs = [];
    let detail;
    for (
      let index = 0;
      index < profile.method.samples + profile.method.warmupRuns;
      index++
    ) {
      const execute = prepare();
      const started = performance.now();
      detail = execute();
      const elapsed = performance.now() - started;
      if (index >= profile.method.warmupRuns) samplesMs.push(elapsed);
    }
    rows.push({
      status: "completed",
      candidate: "loro-reference-only",
      workload,
      input,
      timingInterval,
      samplesMs,
      medianMs: sortedPercentile(samplesMs, 0.5),
      p95Ms: sortedPercentile(samplesMs, 0.95),
      detail,
    });
    await checkpoint();
  };

  const cursorFixtureLength = 1024;
  const cursorInsertionOffset = 512;
  const cursorExpectedOffset = 513;
  const cursorExpectedText =
    "a".repeat(cursorInsertionOffset) +
    "x" +
    "a".repeat(cursorFixtureLength - cursorInsertionOffset);
  await record(
    "native-text-cursor-insert",
    cursorFixtureLength,
    report.method.cursor.interval,
    () => {
      const doc = new LoroDoc();
      const text = doc.getText("text");
      text.insert(0, "a".repeat(cursorFixtureLength));
      const cursor = text.getCursor(cursorInsertionOffset, 1);
      if (!cursor) throw Error("Loro native cursor unavailable");
      return () => {
        text.insert(cursorInsertionOffset, "x");
        const result = doc.getCursorPos(cursor);
        if (result.offset !== cursorExpectedOffset)
          throw Error(
            `Loro native cursor offset ${result.offset} differs from expected ${cursorExpectedOffset}`,
          );
        if (text.toString() !== cursorExpectedText)
          throw Error(
            "Loro native text differs from the independent cursor fixture expectation",
          );
        return {
          expectedOffset: cursorExpectedOffset,
          resolvedOffset: result.offset,
        };
      };
    },
  );
  for (const count of [16, 128]) {
    await record(
      "native-movable-tree",
      count,
      report.method.movableTree.interval,
      () => {
        const doc = new LoroDoc();
        const tree = doc.getTree("tree");
        const parent = tree.createNode();
        const left = parent.createNode();
        const right = parent.createNode();
        const child = left.createNode();
        const expectedParent = count % 2 ? right : left;
        return () => {
          for (let index = 0; index < count; index++)
            child.move(index % 2 ? left : right, 0);
          doc.commit();
          const projected = tree.toJSON();
          if (projected.length < 1) throw Error("Loro tree projection missing");
          const resolvedParent = child.parent();
          if (resolvedParent?.id !== expectedParent.id)
            throw Error(
              "Loro native movable-tree parent differs from alternating-move expectation",
            );
          return {
            moves: count,
            expectedFinalParent: count % 2 ? "right" : "left",
            resolvedParentId: resolvedParent.id,
          };
        };
      },
    );
  }
  report.status = "complete";
  await checkpoint();
  for (const row of rows)
    console.log("STEP3_LORO_REFERENCE " + JSON.stringify(row));
  console.log(`Wrote ${output}`);
} catch (error) {
  report.status = "error";
  report.error = error instanceof Error ? error.stack : String(error);
  await checkpoint();
  throw error;
}
