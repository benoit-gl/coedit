import { createRequire } from "node:module";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { performance } from "node:perf_hooks";
import { readFile, writeFile } from "node:fs/promises";

const prefix = process.env.LORO_REFERENCE_ROOT;
if (!prefix) throw Error("LORO_REFERENCE_ROOT must point to the isolated Loro installation");
const requireFromPrefix = createRequire(resolve(prefix, "package.json"));
const entry = requireFromPrefix.resolve("loro-crdt");
const { LoroDoc } = await import(pathToFileURL(entry).href);
const profile = JSON.parse(await readFile(new URL("../qualification/step3/comparison/profile.json", import.meta.url), "utf8"));
const samples = profile.method.samples;
const sortedPercentile = (data, fraction) =>
  [...data].sort((a, b) => a - b)[Math.ceil(data.length * fraction) - 1];
const rows = [];
function record(workload, input, prepare) {
  const samplesMs = [];
  let detail;
  for (let index = 0; index < samples + profile.method.warmupRuns; index++) {
    const execute = prepare();
    const started = performance.now();
    detail = execute();
    const elapsed = performance.now() - started;
    if (index >= profile.method.warmupRuns) samplesMs.push(elapsed);
  }
  rows.push({
    candidate: "loro-reference-only", workload, input, samplesMs,
    medianMs: sortedPercentile(samplesMs, 0.5),
    p95Ms: sortedPercentile(samplesMs, 0.95),
    detail,
  });
}
record("native-text-cursor-insert", 1024, () => {
  const doc = new LoroDoc();
  const text = doc.getText("text");
  text.insert(0, "a".repeat(1024));
  const cursor = text.getCursor(512, 1);
  if (!cursor) throw Error("Loro native cursor unavailable");
  return () => {
    text.insert(512, "x");
    const result = doc.getCursorPos(cursor);
    if (!Number.isInteger(result.offset)) throw Error("Loro native cursor failed to resolve");
    return { resolvedOffset: result.offset };
  };
});
for (const count of [16, 128]) {
  record("native-movable-tree", count, () => {
    const doc = new LoroDoc();
    const tree = doc.getTree("tree");
    const parent = tree.createNode();
    const left = parent.createNode();
    const right = parent.createNode();
    const child = left.createNode();
    return () => {
      for (let index = 0; index < count; index++) child.move(index % 2 ? left : right, 0);
      doc.commit();
      if (tree.toJSON().length < 1) throw Error("Loro tree projection missing");
      return { moves: count };
    };
  });
}
const packageInfo = JSON.parse(await readFile(resolve(prefix, "node_modules/loro-crdt/package.json"), "utf8"));
if (packageInfo.version !== "1.16.4") throw Error("Isolated Loro reference version differs");
const report = {
  schemaVersion: 1, generatedAt: new Date().toISOString(),
  revision: process.env.GITHUB_SHA ?? null,
  selectable: false, package: "loro-crdt", version: packageInfo.version,
  comparisonLimit: "Native Loro operations are not equivalent to Coedit integrated carrier adapter operations.",
  rows,
};
await writeFile("step3-evidence/loro-reference.json", JSON.stringify(report, null, 2) + "\n");
for (const row of rows) console.log("STEP3_LORO_REFERENCE " + JSON.stringify(row));
