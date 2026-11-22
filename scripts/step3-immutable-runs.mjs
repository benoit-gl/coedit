/**
 * Source-bound immutable-run qualification profile. Timings and invasive work
 * observations run separately; results are experimental, never acceptance limits.
 */
import { createHash } from "node:crypto";
import { appendFile, mkdir, readFile, stat, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { execFileSync } from "node:child_process";
import os from "node:os";
import { performance } from "node:perf_hooks";
import { TextEncoder } from "node:util";
const av = process.argv.slice(2),
  opt = (n, d) => {
    let i = av.indexOf(n);
    return i < 0 ? d : av[i + 1];
  },
  has = (n) => av.includes(n);
const here = dirname(fileURLToPath(import.meta.url)),
  root = resolve(opt("--root", resolve(here, ".."))),
  out = opt("--out");
if (!out) throw Error("--out required");
if (existsSync(out)) throw Error("refusing to overwrite " + out);
const B = {
  text: 1024,
  blocks: 0,
  unrelatedText: 0,
  opaque: 0,
  origins: 1,
  boundaries: 1,
  history: 0,
};
let cases = has("--small")
  ? [{ name: "baseline", ...B }]
  : [
      { name: "baseline", ...B },
      { name: "text-10k", ...B, text: 10000 },
      { name: "text-100k", ...B, text: 100000 },
      { name: "blocks-20", ...B, blocks: 20 },
      { name: "unrelated-text-20", ...B, unrelatedText: 20 },
      { name: "opaque-1", ...B, opaque: 1 },
      { name: "opaque-20", ...B, opaque: 20 },
      { name: "origins-20", ...B, origins: 20, boundaries: 20 },
      { name: "source-boundaries-20", ...B, boundaries: 20 },
      { name: "same-gap-history-500", ...B, history: 500 },
      ...(has("--full-history") || opt("--case") === "same-gap-history-5000"
        ? [{ name: "same-gap-history-5000", ...B, history: 5000 }]
        : []),
    ];
if (opt("--case")) {
  cases = cases.filter((shape) => shape.name === opt("--case"));
  if (cases.length === 0) throw Error("Unknown --case value.");
}
const WARMUPS = 3,
  SAMPLES = 5,
  sha = async (p) =>
    createHash("sha256")
      .update(await readFile(p))
      .digest("hex");
const files = execFileSync(
  "git",
  ["-C", root, "ls-files", "--cached", "--others", "--exclude-standard"],
  { encoding: "utf8" },
)
  .split("\n")
  .filter(Boolean)
  .filter((p) => !/(\.test\.ts|\.browser\.test\.ts)$/.test(p))
  .filter(
    (p) =>
      !/(^|\/)(__screenshots__|browser-traces|\.vitest-attachments|evidence|node_modules)(\/|$)/.test(
        p,
      ),
  )
  .filter(
    (p) =>
      /\.(ts|tsx|js|mjs|cjs)$/.test(p) ||
      /(^|\/)(package\.json|pnpm-lock\.yaml|tsconfig.*\.json)$/.test(p),
  )
  .filter(
    (p) =>
      /^(src|qualification|scripts)\//.test(p) ||
      /(^|\/)(package\.json|pnpm-lock\.yaml|vite\.config\.(ts|mjs)|tsconfig.*\.json)$/.test(
        p,
      ),
  );
const sourceManifest = await Promise.all(
  files.map(async (relative) => ({
    relative,
    bytes: (await stat(resolve(root, relative))).size,
    sha256: await sha(resolve(root, relative)),
  })),
);
const pkg = JSON.parse(await readFile(resolve(root, "package.json"), "utf8"));
const env = {
  os: process.platform,
  cpu: os.cpus()[0]?.model,
  logicalCpus: os.cpus().length,
  ramBytes: os.totalmem(),
  release: os.release(),
  node: process.version,
  nativePin:
    pkg.dependencies?.["@automerge/automerge"] ??
    pkg.devDependencies?.["@automerge/automerge"] ??
    "unreported",
  browser: "not run",
};
await mkdir(dirname(resolve(out)), { recursive: true });
await writeFile(out, "", { flag: "wx" });
const emit = (row) => appendFile(out, JSON.stringify(row) + "\n");
// Observers are enabled only in observation(). time() refuses to run under them.
let active;
const seen = (k, n = 1) => {
  if (active) active[k] = (active[k] || 0) + n;
};
const publicRestores = [];
const O = {
  stringify: JSON.stringify,
  keys: Object.keys,
  entries: Object.entries,
  values: Object.values,
  assign: Object.assign,
  encode: TextEncoder.prototype.encode,
  encodeInto: TextEncoder.prototype.encodeInto,
};
function wrap(o, n, f, undo) {
  let d = Object.getOwnPropertyDescriptor(o, n);
  if (!d || typeof d.value !== "function")
    throw Error("missing diagnostic " + n);
  Object.defineProperty(o, n, { ...d, value: f(d.value) });
  undo.push(() => Object.defineProperty(o, n, d));
}
function install(Index, Native, Protocol) {
  let undo = [];
  for (let [n, k] of [
    ["visit", "indexPathVisits"],
    ["leaf", "indexLeafAllocations"],
    ["build", "indexBuildCalls"],
    ["range", "indexRangeReturnedUnits"],
    ["read", "indexReadCalls"],
  ]) {
    if (typeof Reflect.get(Index.prototype, n) !== "function")
      throw Error("missing source index " + n);
    wrap(
      Index.prototype,
      n,
      (fn) =>
        function (...a) {
          let r = fn.apply(this, a);
          seen(k, n === "range" && Array.isArray(r) ? r.length : 1);
          if (active && n === "build")
            active.indexLargestBuildRange = Math.max(
              active.indexLargestBuildRange ?? 0,
              a[2] - a[1],
            );
          return r;
        },
      undo,
    );
  }
  for (let [p, n, k] of [
    [Native.prototype, "activate", "nativeActivate"],
    [Protocol.prototype, "projectGeneration", "protocolProjectGeneration"],
  ]) {
    if (typeof Reflect.get(p, n) !== "function")
      throw Error("missing diagnostic " + n);
    wrap(
      p,
      n,
      (fn) =>
        function (...a) {
          seen(k);
          return fn.apply(this, a);
        },
      undo,
    );
  }
  JSON.stringify = function (...a) {
    let r = O.stringify.apply(this, a);
    seen("jsonStringifyCalls");
    if (typeof r === "string") seen("jsonOutputUnits", r.length);
    return r;
  };
  Object.keys = (x) => {
    let r = O.keys(x);
    seen("objectKeysWidth", r.length);
    return r;
  };
  Object.entries = (x) => {
    let r = O.entries(x);
    seen("objectEntriesWidth", r.length);
    return r;
  };
  Object.values = (x) => {
    let r = O.values(x);
    seen("objectValuesWidth", r.length);
    return r;
  };
  Object.assign = function (t, ...s) {
    seen(
      "assignSourceWidths",
      s.reduce((n, x) => n + (x == null ? 0 : O.keys(x).length), 0),
    );
    return O.assign(t, ...s);
  };
  TextEncoder.prototype.encode = function (x = "") {
    let r = O.encode.call(this, x);
    seen("encoderInputUnits", String(x).length);
    seen("encoderOutputUnits", r.length);
    return r;
  };
  TextEncoder.prototype.encodeInto = function (x = "", d) {
    let r = O.encodeInto.call(this, x, d);
    seen("encoderIntoInputUnits", String(x).length);
    seen("encoderIntoWrittenUnits", r.written);
    return r;
  };
  return () => {
    JSON.stringify = O.stringify;
    Object.keys = O.keys;
    Object.entries = O.entries;
    Object.values = O.values;
    Object.assign = O.assign;
    TextEncoder.prototype.encode = O.encode;
    TextEncoder.prototype.encodeInto = O.encodeInto;
    for (let f of undo.reverse()) f();
  };
}
function instrument(c, codec) {
  for (let [n, k] of [
    ["snapshot", "publicSnapshot"],
    ["projectEditorPayload", "targetFullProjection"],
    ["recordedPayloadEffects", "effectInspection"],
    ["prepareOrdinaryText", "coldRecovery"],
  ])
    if (typeof c[n] === "function") {
      let d = Object.getOwnPropertyDescriptor(c, n),
        f = c[n].bind(c);
      c[n] = (...a) => {
        seen(k);
        return f(...a);
      };
      publicRestores.push(() =>
        d ? Object.defineProperty(c, n, d) : delete c[n],
      );
    }
  let d = Object.getOwnPropertyDescriptor(codec, "decode"),
    f = codec.decode;
  codec.decode = (x) => {
    seen("positionDecoder");
    return f(x);
  };
  publicRestores.push(() =>
    d ? Object.defineProperty(codec, "decode", d) : delete codec.decode,
  );
  return c;
}
const time = (label, fn) => {
    if (active) throw Error("timing while observing");
    let s = performance.now(),
      result = fn();
    return { label, ms: performance.now() - s, result };
  },
  observation = (label, fn) => {
    if (active) throw Error("nested observation");
    active = {};
    try {
      fn();
      return { label, counters: active };
    } finally {
      active = undefined;
    }
  },
  med = (x) => [...x].sort((a, b) => a - b)[Math.floor(x.length / 2)],
  p95 = (x) => {
    let y = [...x].sort((a, b) => a - b);
    return y[Math.min(y.length - 1, Math.ceil(y.length * 0.95) - 1)];
  },
  uid = (n) => "d1000000-0000-4000-8000-" + n.toString(16).padStart(12, "0");
const { createServer } = await import(
  pathToFileURL(resolve(root, "node_modules/vite/dist/node/index.js")).href
);
const server = await createServer({
  configFile: false,
  root,
  appType: "custom",
  optimizeDeps: { noDiscovery: true, include: [] },
  server: { middlewareMode: true, hmr: false },
  logLevel: "error",
});
try {
  const [CM, IM, EM, NM, PM, D] = await Promise.all(
    [
      "automergeCarrier",
      "sourceIndex",
      "../editor/incrementalEditor",
      "nativeDocument",
      "protocol",
    ]
      .map((x) =>
        server
          .ssrLoadModule("/qualification/step3/immutableRuns/" + x + ".ts")
          .catch(() =>
            server.ssrLoadModule(
              "/qualification/step3/immutableRuns/" + x + ".ts",
            ),
          ),
      )
      .concat(server.ssrLoadModule("/src/domain/index.ts")),
  );

  await emit({
    kind: "header",
    complete: false,
    sourceManifest,
    sourceRevision: execFileSync("git", ["-C", root, "rev-parse", "HEAD"], {
      encoding: "utf8",
    }).trim(),
    workingTree: execFileSync("git", ["-C", root, "status", "--porcelain"], {
      encoding: "utf8",
    }),
    harness: {
      path: fileURLToPath(import.meta.url),
      sha256: await sha(fileURLToPath(import.meta.url)),
    },
    environment: env,
    runNote: opt("--note", null),
    configuration: {
      warmups: WARMUPS,
      samples: SAMPLES,
      cases,
      timing: "diagnostic wrappers absent",
      observations: "separate post-warm commands",
      loads:
        "one initial load and explicit lifecycle loads, reported separately",
      source:
        "ASCII target; Unicode covered by separate semantic/browser qualification",
    },
    limitations: [
      "n=5 p95 is the maximum, not a reliable tail estimate",
      "native/WASM work requires separate diagnostic",
      "Origins and source boundaries necessarily add records",
      "indexBuildCalls includes operation-sized insertion subtree construction; inspect indexLargestBuildRange",
      "one-peer inbound merge only; N-way fan-in is a separate semantic suite",
    ],
  });
  const key = (origin) => [origin.kind, origin.id];
  function check(c, target, oracle) {
    const p = c.snapshot().payloads.get(target);
    if (p?.kind !== "text" || p.text !== oracle.map((u) => u.text).join(""))
      throw Error("independent text oracle mismatch");
    const actual = p.spans.flatMap((s) =>
      Array.from({ length: s.text.length }, (_, i) => [
        s.text[i],
        ...key(s.origin),
      ]),
    );
    const wanted = oracle.map((u) => [u.text, ...key(u.origin)]);
    if (JSON.stringify(actual) !== JSON.stringify(wanted))
      throw Error("independent Origin oracle mismatch");
  }
  for (const shape of cases) {
    await emit({ kind: "case-start", complete: false, shape });
    const setupStarted = performance.now();
    const rootId = D.parseBlockId(uid(1)),
      target = D.parseInlineContentId(uid(2)),
      codec = { encode: (x) => x, decode: (x) => x },
      cmp = (a, b) => (a < b ? -1 : a > b ? 1 : 0);
    const factory = CM.createAutomergeImmutableRunCarrierFactory(
      codec,
      { compare: cmp, comparePrimary: cmp },
      { purePositionDecoder: true },
    );
    const boot = factory.create(rootId),
      origins = Array.from({ length: shape.origins }, (_, i) => ({
        kind: "human",
        id: "o" + i,
      }));
    const blocks = Array.from({ length: shape.blocks }, (_, i) =>
      D.parseBlockId(uid(100 + i)),
    );
    const texts = Array.from({ length: shape.unrelatedText }, (_, i) =>
      D.parseInlineContentId(uid(1000 + i)),
    );
    const opaque = Array.from({ length: shape.opaque }, (_, i) =>
      D.parseInlineContentId(uid(2000 + i)),
    );
    const pieces = Array.from({ length: shape.boundaries }, (_, i) =>
      "a".repeat(
        Math.floor(shape.text / shape.boundaries) +
          (i < shape.text % shape.boundaries ? 1 : 0),
      ),
    );
    const payloads = [
      {
        kind: "replace-text",
        inlineContentId: target,
        mediaType: "text/plain",
        text: pieces[0],
        origin: origins[0],
      },
    ];
    let offset = pieces[0].length;
    for (let i = 1; i < pieces.length; i++) {
      payloads.push({
        kind: "insert-text",
        inlineContentId: target,
        offset,
        text: pieces[i],
        origin: origins[i % origins.length],
      });
      offset += pieces[i].length;
    }
    payloads.push(
      ...texts.map((inlineContentId) => ({
        kind: "replace-text",
        inlineContentId,
        mediaType: "text/plain",
        text: "u".repeat(17),
        origin: origins[0],
      })),
      ...opaque.map((inlineContentId) => ({
        kind: "replace-opaque",
        inlineContentId,
        mediaType: "application/octet-stream",
        bytes: new Uint8Array(256),
        origin: origins[0],
      })),
    );
    boot.applyChange({
      context: { actorId: "seed", effectId: "seed" },
      placements: blocks.map((blockId, i) => ({
        blockId,
        placement: { depth: 1, position: "p" + i },
      })),
      inlineContents: [target, ...texts, ...opaque].map(
        (inlineContentId, i) => ({
          inlineContentId,
          blockId:
            i === 0 ? rootId : (blocks[(i - 1) % blocks.length] ?? rootId),
        }),
      ),
      payloads,
    });
    let oracle = pieces.flatMap((piece, i) =>
      Array.from(piece, (text) => ({
        text,
        origin: origins[i % origins.length],
      })),
    );
    let receipt = boot.readOrdinaryTextRange(target, 0, 0).revision;
    for (let i = 0; i < shape.history; i++) {
      const insert = i % 2 === 0;
      receipt = boot.applyOrdinaryChange(
        {
          context: { actorId: "history", effectId: String(i) },
          payloads: [
            insert
              ? {
                  kind: "insert-text",
                  inlineContentId: target,
                  offset: 1,
                  text: "h",
                  origin: origins[0],
                }
              : {
                  kind: "delete-text",
                  inlineContentId: target,
                  start: 1,
                  end: 2,
                },
          ],
        },
        receipt,
      );
      if (insert) oracle.splice(1, 0, { text: "h", origin: origins[0] });
      else oracle.splice(1, 1);
    }
    check(boot, target, oracle);
    const bytes = boot.encode();
    await emit({
      kind: "setup",
      complete: false,
      case: shape.name,
      setupMs: performance.now() - setupStarted,
      encodedBytes: bytes.length,
      memory: process.memoryUsage(),
    });
    const cold = time("initial-load", () => factory.load(bytes)),
      c = cold.result;
    await emit({
      kind: "initial-load",
      complete: false,
      case: shape.name,
      ms: cold.ms,
      memory: process.memoryUsage(),
    });
    receipt = c.readOrdinaryTextRange(target, 0, 0).revision;
    let serial = 0;
    const profiles = [];
    for (const mode of ["bare-canonical", "incremental-editor"]) {
      const activation =
        mode === "incremental-editor"
          ? time(
              "editor-activation",
              () => new EM.QualificationIncrementalEditor(c, target),
            )
          : undefined;
      const editor = activation?.result,
        origin = { kind: "human", id: mode };
      const action = () => {
        const context = { actorId: "warm", effectId: String(serial++) };
        if (editor)
          editor.apply(
            [{ start: 1, end: 1, insertion: [{ text: "x", origin }] }],
            context,
          );
        else
          receipt = c.applyOrdinaryChange(
            {
              context,
              payloads: [
                {
                  kind: "insert-text",
                  inlineContentId: target,
                  offset: 1,
                  text: "x",
                  origin,
                },
              ],
            },
            receipt,
          );
      };
      const update = () => oracle.splice(1, 0, { text: "x", origin });
      for (let i = 0; i < WARMUPS; i++) {
        action();
        update();
      }
      const raw = [];
      for (let i = 0; i < SAMPLES; i++) {
        const t = time("warm-edit", action);
        update();
        raw.push(t.ms);
        check(c, target, oracle);
      }
      // Install all diagnostic shims only for this additional, separately reported command.
      const undo = install(
        IM.ImmutableRunSourceIndex,
        NM.AutomergeImmutableRunDocument,
        PM.ImmutableRunProtocolV1,
      );
      instrument(c, codec);
      let observed;
      try {
        observed = observation("additional-post-warm-edit", action);
        update();
      } finally {
        for (const restore of publicRestores.splice(0).reverse()) restore();
        undo();
      }
      check(c, target, oracle);
      for (const field of [
        "nativeActivate",
        "protocolProjectGeneration",
        "publicSnapshot",
        "targetFullProjection",
        "effectInspection",
        "coldRecovery",
        "positionDecoder",
      ])
        observed.counters[field] ??= 0;
      profiles.push({
        mode,
        editorActivationMs: activation?.ms,
        rawMs: raw,
        medianMs: med(raw),
        p95Ms: p95(raw),
        observation: observed,
        priorWarmCommands: serial - SAMPLES - 1,
      });
    }
    await emit({
      kind: "warm",
      complete: false,
      case: shape.name,
      profiles,
      semanticsVerified: true,
    });
    const save = time("save", () => c.encode()),
      load = time("lifecycle-load", () => factory.load(save.result)),
      life = load.result;
    check(life, target, oracle);
    const capture = time("capture", () => life.captureHistoricalState()),
      materialize = time("materialize", () =>
        life.materializeHistoricalState(capture.result),
      ),
      restore = time("restore", () =>
        life.restoreHistoricalState(capture.result, {
          actorId: "restore",
          effectId: "lifecycle",
        }),
      );
    check(life, target, oracle);
    const peer = factory.load(life.encode());
    peer.applyChange({
      context: { actorId: "peer", effectId: "merge" },
      payloads: [
        {
          kind: "insert-text",
          inlineContentId: target,
          offset: 0,
          text: "m",
          origin: { kind: "human", id: "peer" },
        },
      ],
    });
    const peerBytes = peer.encode(),
      merge = time("merge", () => life.mergeEncoded(peerBytes));
    oracle.unshift({ text: "m", origin: { kind: "human", id: "peer" } });
    check(life, target, oracle);
    const e = new EM.QualificationIncrementalEditor(life, target),
      following = [];
    for (let i = 0; i < 2; i++) {
      const origin = { kind: "human", id: "following" };
      const t = time(i ? "following-edit" : "first-after-transition", () =>
        e.apply([{ start: 1, end: 1, insertion: [{ text: "z", origin }] }], {
          actorId: "following",
          effectId: String(i),
        }),
      );
      oracle.splice(1, 0, { text: "z", origin });
      following.push({ label: t.label, ms: t.ms });
      check(life, target, oracle);
    }
    const retained = materialize.result.payloads.get(target),
      capturedPayload = c.snapshot().payloads.get(target);
    if (
      JSON.stringify([
        retained?.mediaType,
        retained?.text,
        retained?.spans.map((s) => [s.text, s.origin.kind, s.origin.id]),
      ]) !==
      JSON.stringify([
        capturedPayload?.mediaType,
        capturedPayload?.text,
        capturedPayload?.spans.map((s) => [s.text, s.origin.kind, s.origin.id]),
      ])
    )
      throw Error("retained material mismatch");
    await emit({
      kind: "case",
      complete: false,
      shape,
      runSourceUnits: Reflect.get(Reflect.get(c, "native"), "runSourceUnits"),
      initialLoadMs: cold.ms,
      profiles,
      lifecycle: {
        saveMs: save.ms,
        loadMs: load.ms,
        captureMs: capture.ms,
        materializeMs: materialize.ms,
        restoreMs: restore.ms,
        mergeMs: merge.ms,
        following,
        encodedBytes: save.result.length,
        memory: process.memoryUsage(),
        samples: 1,
      },
      semanticsVerified: true,
    });
  }
  await emit({ kind: "complete", complete: true, semanticsVerified: true });
} catch (error) {
  await emit({
    kind: "failure",
    complete: false,
    error: error instanceof Error ? error.stack : String(error),
  });
  throw error;
} finally {
  await server.close();
}
