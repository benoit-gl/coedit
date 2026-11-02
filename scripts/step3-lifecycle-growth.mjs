import { createServer } from "vite";
import { performance } from "node:perf_hooks";
import { arch, cpus, platform, release, totalmem } from "node:os";

// This is a bounded qualification probe, not a capacity limit. Each candidate
// runs in its own process so process-lifetime peak RSS is not cross-contaminated.
const candidate = process.env.STEP3_LIFECYCLE_CANDIDATE;
const checkpoints = (process.env.STEP3_LIFECYCLE_CHECKPOINTS ?? "20,100,200")
  .split(",")
  .map(Number);
if (
  !["yjs", "automerge"].includes(candidate) ||
  checkpoints.some(
    (n, i) =>
      !Number.isSafeInteger(n) ||
      n < 2 ||
      n % 2 ||
      (i > 0 && n <= checkpoints[i - 1]),
  )
)
  throw new Error("Invalid lifecycle candidate or increasing even checkpoints");
const server = await createServer({
  configFile: false,
  appType: "custom",
  server: { middlewareMode: true, hmr: false, ws: false },
  logLevel: "error",
});
try {
  const load = (path) => server.ssrLoadModule("/" + path);
  const [domain, position, yjs, automerge] = await Promise.all([
    load("src/domain/index.ts"),
    load("qualification/step3/structure/localDensePosition.ts"),
    load("qualification/step3/integrated/yjsIntegratedDocumentCarrier.ts"),
    load(
      "qualification/step3/integrated/automergeIntegratedDocumentCarrier.ts",
    ),
  ]);
  await server.close();
  const allocator = position.localDensePositionAllocator;
  const factory =
    candidate === "yjs"
      ? yjs.createYjsIntegratedDocumentCarrierFactory(allocator, allocator)
      : automerge.createAutomergeIntegratedDocumentCarrierFactory(
          allocator,
          allocator,
        );
  const root = domain.parseBlockId("70000000-0000-4000-8000-000000000001");
  const id = domain.parseInlineContentId(
    "70000000-0000-4000-8000-000000000002",
  );
  const origin = { id: "lifecycle-author", kind: "human" };
  let carrier = factory.create(root);
  carrier.applyChange({
    inlineContents: [{ inlineContentId: id, blockId: root }],
    payloads: [
      {
        kind: "replace-text",
        inlineContentId: id,
        mediaType: "text/plain",
        text: "base",
        origin,
      },
    ],
  });
  const tokens = [];
  const samples = [];
  let completed = 0;
  for (const target of checkpoints) {
    const editStart = performance.now();
    while (completed < target) {
      const payload =
        completed % 2 === 0
          ? {
              kind: "insert-text",
              inlineContentId: id,
              offset: 4,
              text: "x",
              origin,
            }
          : { kind: "delete-text", inlineContentId: id, start: 4, end: 5 };
      carrier.applyChange({
        payloads: [payload],
        context: { actorId: "lifecycle", effectId: `effect-${completed}` },
      });
      completed++;
      if (completed % 10 === 0) tokens.push(carrier.captureHistoricalState());
    }
    const editAndCaptureMs = performance.now() - editStart;
    const encodeStart = performance.now();
    const encoded = carrier.encode();
    const encodeMs = performance.now() - encodeStart;
    const loadStart = performance.now();
    const reloaded = factory.load(encoded);
    const loadMs = performance.now() - loadStart;
    const materializeStart = performance.now();
    for (const token of tokens) {
      const historical = reloaded
        .materializeHistoricalState(token)
        .payloads.get(id);
      if (historical?.kind !== "text" || historical.text !== "base")
        throw new Error("Historical reload mismatch");
    }
    const materializeAllMs = performance.now() - materializeStart;
    const live = reloaded.snapshot().payloads.get(id);
    if (
      live?.kind !== "text" ||
      live.text !== "base" ||
      reloaded.effects().size !== target
    )
      throw new Error("Reload mismatch");
    samples.push({
      effects: target,
      retainedStates: tokens.length,
      visibleUtf16Units: live.text.length,
      encodedBytes: encoded.length,
      editAndCaptureMs,
      encodeMs,
      loadMs,
      materializeAllMs,
      memory: process.memoryUsage(),
      peakRssKiB: process.resourceUsage().maxRSS,
    });
    carrier = reloaded;
  }
  console.log(
    JSON.stringify(
      {
        candidate,
        profile: {
          checkpoints,
          snapshotEvery: 10,
          workload:
            "alternating insert/delete, encode and reload at each checkpoint",
        },
        environment: {
          platform: platform(),
          release: release(),
          arch: arch(),
          node: process.version,
          cpu: cpus()[0]?.model,
          cpus: cpus().length,
          ramBytes: totalmem(),
        },
        nativeLifecycle: carrier.nativeLifecycle(),
        samples,
      },
      null,
      2,
    ),
  );
} finally {
  await server.close();
}
