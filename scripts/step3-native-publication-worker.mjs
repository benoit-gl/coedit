/** Diagnostic-only phases; reflection never enters the production carrier API. */
import { createHash } from "node:crypto";
import * as fs from "node:fs";
import { Buffer } from "node:buffer";
import { dirname, relative, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { createRequire } from "node:module";
import { createServer } from "vite";

const require = createRequire(import.meta.url);
/** Repository root resolved from this script, independent of the current directory. */
export const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const sha256 = (value) => createHash("sha256").update(value).digest("hex");
/** Hashes current runtime inputs and the exact Node-bound Automerge WASM binary. */
export function sourceIdentity() {
  const files = [
    "package.json",
    "pnpm-lock.yaml",
    "tsconfig.json",
    "vite.config.mjs",
  ];
  function visit(directory) {
    for (const entry of fs.readdirSync(resolve(root, directory), {
      withFileTypes: true,
    })) {
      const path = `${directory}/${entry.name}`;
      if (
        entry.isDirectory() &&
        !/^(node_modules|evidence|__screenshots__|browser-traces|\.vitest-attachments)$/.test(
          entry.name,
        )
      )
        visit(path);
      else if (
        entry.isFile() &&
        /\.(ts|tsx|js|mjs|cjs)$/.test(path) &&
        !/\.(test|browser\.test)\.(ts|mjs)$/.test(path)
      )
        files.push(path);
    }
  }
  for (const directory of ["src", "qualification", "scripts"]) visit(directory);
  const packageWasm = require.resolve("@automerge/automerge/automerge.wasm");
  const nativePath = resolve(
    dirname(packageWasm),
    "mjs/wasm_bindgen_output/nodejs/automerge_wasm_bg.wasm",
  );
  const packageRoot = resolve(dirname(packageWasm), "..");
  const nativePackage = JSON.parse(
    fs.readFileSync(resolve(packageRoot, "package.json"), "utf8"),
  );
  const nativeJavaScript = [];
  function visitBindings(directory) {
    for (const entry of fs.readdirSync(resolve(packageRoot, directory), {
      withFileTypes: true,
    })) {
      const path = `${directory}/${entry.name}`;
      if (entry.isDirectory()) visitBindings(path);
      else if (entry.isFile() && /\.(js|cjs)$/.test(path))
        nativeJavaScript.push(path);
    }
  }
  visitBindings("dist/mjs");
  return {
    schema: "merge10-native-publication-sources-v2",
    sources: files.sort().map((path) => ({
      path,
      sha256: sha256(fs.readFileSync(resolve(root, path))),
    })),
    automergeVersion: nativePackage.version,
    nativeJavaScript: ["package.json", ...nativeJavaScript.sort()].map(
      (path) => ({
        path,
        sha256: sha256(fs.readFileSync(resolve(packageRoot, path))),
      }),
    ),
    nativeWasm: {
      path: relative(dirname(dirname(packageWasm)), nativePath)
        .split("\\")
        .join("/"),
      sha256: sha256(fs.readFileSync(nativePath)),
    },
  };
}
function assertSources(fixture) {
  if (
    fixture.schema !== "merge10-native-publication-fixture-v2" ||
    JSON.stringify(fixture.sourceManifest) !== JSON.stringify(sourceIdentity())
  )
    throw new Error("fixture schema or source identity mismatch");
}
const compare = (left, right) => (left < right ? -1 : left > right ? 1 : 0);
const codec = Object.freeze({
  encode(value) {
    return value;
  },
  decode(value) {
    return value;
  },
});
const ordering = Object.freeze({ comparePrimary: compare, compare });
const id = (number) =>
  `a1000000-0000-4000-8000-${number.toString(16).padStart(12, "0")}`;
function normalizeSnapshot(snapshot) {
  const sorted = (map) => [...map].sort(([a], [b]) => compare(a, b));
  return {
    rootId: snapshot.rootId,
    blockLiveness: sorted(snapshot.blockLiveness),
    placements: sorted(snapshot.placements),
    inlineContentOwners: sorted(snapshot.inlineContentOwners),
    payloads: sorted(snapshot.payloads),
  };
}
async function withServer(action) {
  const server = await createServer({
    configFile: false,
    root,
    appType: "custom",
    optimizeDeps: { noDiscovery: true, include: [] },
    server: { middlewareMode: true, hmr: false },
    logLevel: "error",
  });
  try {
    await action(server);
  } finally {
    await server.close();
  }
}
async function build(server, size, output) {
  const { createAutomergeImmutableRunCarrierFactory } =
    await server.ssrLoadModule(
      "/qualification/step3/immutableRuns/automergeCarrier.ts",
    );
  const { parseBlockId, parseInlineContentId } = await server.ssrLoadModule(
    "/src/domain/index.ts",
  );
  const root = parseBlockId(id(1));
  const targetBlock = parseBlockId(id(2));
  const targetInline = parseInlineContentId(id(3));
  const origin = Object.freeze({ kind: "human", id: "probe" });
  const factory = createAutomergeImmutableRunCarrierFactory(codec, ordering, {
    purePositionDecoder: true,
  });
  const carrier = factory.create(root);
  carrier.applyChange({
    context: { actorId: "probe", effectId: "target-create" },
    placements: [
      { blockId: targetBlock, placement: { position: "a", depth: 1 } },
    ],
    inlineContents: [{ inlineContentId: targetInline, blockId: targetBlock }],
    payloads: [
      {
        kind: "replace-text",
        inlineContentId: targetInline,
        mediaType: "text/plain",
        text: "seed",
        origin,
      },
    ],
  });
  for (let index = 0; index < size; index++) {
    const blockId = parseBlockId(id(100 + index * 2));
    const inlineContentId = parseInlineContentId(id(101 + index * 2));
    carrier.applyChange({
      context: { actorId: "history", effectId: `unrelated-${index}` },
      placements: [
        {
          blockId,
          placement: {
            position: `u${index.toString().padStart(4, "0")}`,
            depth: 1,
          },
        },
      ],
      inlineContents: [{ inlineContentId, blockId }],
      payloads: [
        {
          kind: "replace-text",
          inlineContentId,
          mediaType: "text/plain",
          text: "u",
          origin,
        },
      ],
    });
  }
  const range = carrier.readOrdinaryTextRange(targetInline, 0, 4);
  if (range === undefined) throw new Error("target range is unavailable");
  const native = Reflect.get(carrier, "native");
  const originalPublish = native.publish.bind(native);
  let captured;
  native.publish = (command) => {
    // Both cache and bytes are captured before the real publication mutates either.
    captured = Object.freeze({
      baseline: native.encode(),
      canonicalByUuid: [...Reflect.get(native, "canonicalByUuid")],
      command,
    });
    originalPublish(command);
  };
  try {
    carrier.applyOrdinaryChange(
      {
        context: { actorId: "probe", effectId: "measured-ordinary" },
        payloads: [
          {
            kind: "insert-text",
            inlineContentId: targetInline,
            offset: 2,
            text: "X",
            origin,
          },
        ],
      },
      range.revision,
    );
  } finally {
    native.publish = originalPublish;
  }
  if (captured === undefined)
    throw new Error("real ordinary publication was not captured");
  const expectedTarget = carrier.snapshot().payloads.get(targetInline);
  if (expectedTarget?.kind !== "text" || expectedTarget.text !== "seXed")
    throw new Error("actual publication material mismatch");
  const command = captured.command;
  const fixture = Object.freeze({
    schema: "merge10-native-publication-fixture-v2",
    sourceManifest: sourceIdentity(),
    layout: native.layout,
    runSourceUnits: native.runSourceUnits,
    unrelatedCommands: size,
    targetInline,
    baselineBase64: Buffer.from(captured.baseline).toString("base64"),
    canonicalByUuid: captured.canonicalByUuid,
    command: Object.freeze({
      batchUuid: command.batchUuid,
      manifest: command.manifest,
      entries: command.entries,
      nativeDelta: command.nativeDelta,
    }),
    expectedTarget,
    expectedSnapshot: normalizeSnapshot(carrier.snapshot()),
  });
  fs.writeFileSync(output, JSON.stringify(fixture), { flag: "wx" });
  console.error(
    JSON.stringify({
      built: output,
      unrelatedCommands: size,
      entries: command.entries.length,
      layout: native.layout,
      runSourceUnits: native.runSourceUnits,
    }),
  );
}
async function measure(server, fixture, afterPath) {
  const A = await import("@automerge/automerge");
  const { AutomergeImmutableRunDocument } = await server.ssrLoadModule(
    "/qualification/step3/immutableRuns/nativeDocument.ts",
  );
  // Public native load is outside the observed interval. No cold activation or
  // carrier setup runs in this process; the builder already validated both.
  const rawBaseline = A.load(Buffer.from(fixture.baselineBase64, "base64"));
  const document = Reflect.construct(AutomergeImmutableRunDocument, [
    rawBaseline,
  ]);
  Reflect.set(document, "canonicalByUuid", new Map(fixture.canonicalByUuid));
  if (
    document.layout !== fixture.layout ||
    document.runSourceUnits !== fixture.runSourceUnits
  )
    throw new Error("fixture native layout or source-unit setting mismatch");
  // The original command's source-index replay was consumed by actual carrier
  // publication. This receipt is intentionally a native-publication-only stub.
  const command = Object.freeze({
    ...fixture.command,
    cacheReplay: Object.freeze({
      indexUpdates: new Map(),
      retiredGenerations: new Set(),
      assertCurrent() {},
      commit() {},
    }),
  });
  const label = `ordinary-native-publication-${fixture.unrelatedCommands}`;
  fs.writeSync(1, `TRACE_BEGIN ${label}\n`);
  document.publish(command);
  fs.writeSync(1, `TRACE_END ${label}\n`);
  fs.writeFileSync(afterPath, document.encode(), { flag: "wx" });
  console.error(
    JSON.stringify({
      label,
      after: afterPath,
      nativePublication: "real-AutomergeImmutableRunDocument.publish",
    }),
  );
}
async function verify(server, fixture, afterPath) {
  const { createAutomergeImmutableRunCarrierFactory } =
    await server.ssrLoadModule(
      "/qualification/step3/immutableRuns/automergeCarrier.ts",
    );
  const { parseInlineContentId } = await server.ssrLoadModule(
    "/src/domain/index.ts",
  );
  const carrier = createAutomergeImmutableRunCarrierFactory(codec, ordering, {
    purePositionDecoder: true,
  }).load(new Uint8Array(fs.readFileSync(afterPath)));
  const target = carrier
    .snapshot()
    .payloads.get(parseInlineContentId(fixture.targetInline));
  const snapshot = normalizeSnapshot(carrier.snapshot());
  if (JSON.stringify(target) !== JSON.stringify(fixture.expectedTarget))
    throw new Error("measured publication changed exact target text or Origin");
  if (JSON.stringify(snapshot) !== JSON.stringify(fixture.expectedSnapshot))
    throw new Error("measured publication changed normal carrier snapshot");
  console.error(
    JSON.stringify({
      validation: "normal-factory-load-exact-target-and-full-snapshot-match",
      target,
    }),
  );
}
function configureTraceOutput() {
  if (
    !process.execArgv.some(
      (flag) => flag === "--trace-wasm" || flag === "--trace-wasm-memory",
    )
  )
    return;
  // V8 writes directly to stdout through native stdio, outside Node's stream
  // backpressure. A nonblocking pipe can lose native trace bytes as well as
  // reject synchronous interval markers with EAGAIN. This private Node hook is
  // diagnostic-only, checked before any native module is loaded, and never used
  // by a carrier. Unsupported runtimes must fail instead of claiming counts.
  const handle = Reflect.get(process.stdout, "_handle");
  if (typeof handle?.setBlocking !== "function")
    throw new Error(
      "native tracing requires a Node stdout handle with setBlocking support",
    );
  handle.setBlocking(true);
}
async function main() {
  configureTraceOutput();
  const [phase, fixturePath, value] = process.argv.slice(2);
  if (
    !fixturePath ||
    value === undefined ||
    !["build", "measure", "verify"].includes(phase)
  )
    throw new Error(
      "expected build fixture.json count | measure fixture.json after.am | verify fixture.json after.am",
    );
  if (phase === "build") {
    const size = Number(value);
    if (!Number.isSafeInteger(size) || size < 0)
      throw new Error(
        "unrelated command count must be a nonnegative safe integer",
      );
    await withServer((server) => build(server, size, fixturePath));
  } else {
    const fixture = JSON.parse(fs.readFileSync(fixturePath, "utf8"));
    assertSources(fixture);
    await withServer((server) =>
      phase === "measure"
        ? measure(server, fixture, value)
        : verify(server, fixture, value),
    );
    assertSources(fixture);
  }
}
if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(resolve(process.argv[1])).href
)
  await main();
