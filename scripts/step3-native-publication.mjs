/** Source-bound native publication diagnostic, separate from uninstrumented timing. */
import { spawn } from "node:child_process";
import { mkdirSync, writeFileSync, appendFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath, URL } from "node:url";
import { createInterface } from "node:readline";
import os from "node:os";
import { createTraceCounter } from "./step3-native-trace-counter.mjs";
import { root, sourceIdentity } from "./step3-native-publication-worker.mjs";

const args = process.argv.slice(2);
const option = (name, fallback) => {
  const index = args.indexOf(name);
  if (index < 0) return fallback;
  if (!args[index + 1] || args[index + 1].startsWith("--"))
    throw new Error(`${name} requires a value`);
  return args[index + 1];
};
const out = option("--out");
if (!out) throw new Error("--out directory is required");
const mode = option("--mode", args.includes("--smoke") ? "smoke" : "calls");
if (!["calls", "memory", "smoke"].includes(mode))
  throw new Error("--mode must be calls, memory, or smoke");
const sizes = option("--sizes", mode === "smoke" ? "0,1" : "4,32")
  .split(",")
  .map(Number);
if (
  !sizes.length ||
  sizes.some((value) => !Number.isSafeInteger(value) || value < 0) ||
  new Set(sizes).size !== sizes.length
)
  throw new Error("--sizes requires distinct nonnegative safe integers");
const output = resolve(out);
// Exclusive directory creation prevents mixing output from different runs.
mkdirSync(output);
const journal = resolve(output, "results.jsonl");
const record = (row) => appendFileSync(journal, JSON.stringify(row) + "\n");
const worker = fileURLToPath(
  new URL("./step3-native-publication-worker.mjs", import.meta.url),
);
const flags =
  mode === "calls"
    ? ["--liftoff-only", "--trace-wasm"]
    : mode === "memory"
      ? ["--liftoff-only", "--trace-wasm-memory"]
      : [];
const identity = sourceIdentity();
record({
  phase: "start",
  startedAt: new Date().toISOString(),
  complete: false,
  mode,
  sizes,
  flags,
  sourceManifest: identity,
  runtime: {
    node: process.version,
    v8: process.versions.v8,
    nodeOptions: process.env.NODE_OPTIONS ?? null,
    platform: process.platform,
    arch: process.arch,
    release: os.release(),
    cpu: os.cpus()[0]?.model,
    logicalCpus: os.cpus().length,
    ramBytes: os.totalmem(),
  },
  note: option("--note", null),
  scope:
    "native-publication-only; diagnostic reconstruction and source-index replay stub; no latency or eligibility verdict",
});
let activeCounter;
async function run(phase, size, fixture, after) {
  const measured = phase === "measure";
  const counter = measured ? createTraceCounter() : null;
  activeCounter = counter;
  const phaseFlags = measured ? flags : [];
  record({
    phase: `${phase}-start`,
    unrelatedCommands: size,
    complete: false,
    flags: phaseFlags,
  });
  const child = spawn(
    process.execPath,
    [
      ...phaseFlags,
      worker,
      phase,
      fixture,
      phase === "build" ? String(size) : after,
    ],
    { cwd: root, stdio: ["ignore", "pipe", "pipe"] },
  );
  const stderrPath = resolve(output, `${size}-${phase}.stderr.log`);
  let parserError;
  child.stderr.on("data", (chunk) => appendFileSync(stderrPath, chunk));
  const reader = createInterface({ input: child.stdout, crlfDelay: Infinity });
  reader.on("line", (line) => {
    try {
      counter?.consume(line);
    } catch (error) {
      parserError ??= error;
      child.kill();
    }
  });
  const closed = new Promise((accept, reject) => {
    child.once("error", reject);
    child.once("close", (code, signal) =>
      code === 0
        ? accept()
        : reject(
            new Error(
              `${phase} child failed: code=${code} signal=${signal}; see ${stderrPath}`,
            ),
          ),
    );
  });
  await closed;
  if (parserError) throw parserError;
  const counts = counter?.finish();
  if (mode === "calls" && measured && counts.calls === 0)
    throw new Error("call trace produced no recognized events");
  if (mode === "memory" && measured && counts.memoryEvents === 0)
    throw new Error("memory trace produced no recognized events");
  if (JSON.stringify(sourceIdentity()) !== JSON.stringify(identity))
    throw new Error("source identity changed during run");
  record({
    phase: `${phase}-complete`,
    unrelatedCommands: size,
    complete: false,
    ...(counts ? { counts, instrumented: mode !== "smoke" } : {}),
  });
  activeCounter = null;
}
try {
  for (const size of sizes) {
    const fixture = resolve(output, `${size}-fixture.json`);
    const after = resolve(output, `${size}-after.am`);
    await run("build", size, fixture, after);
    await run("measure", size, fixture, after);
    await run("verify", size, fixture, after);
  }
  record({ phase: "complete", complete: true, mode, sizes });
} catch (error) {
  record({
    phase: "error",
    complete: false,
    error: String(error),
    partialCounts: activeCounter?.snapshot() ?? null,
  });
  throw error;
}
writeFileSync(
  resolve(output, "README.txt"),
  "See results.jsonl. Only a final complete:true row certifies requested completion. Smoke has no native trace. Tracing is not a timing measurement.\n",
  { flag: "wx" },
);
