import { createServer } from "vite";
import { deepStrictEqual } from "node:assert";
import { spawnSync } from "node:child_process";
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
      n > 2 * 36 ** 4 ||
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
  let expectedText = "base";
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
              text: (completed / 2).toString(36).padStart(4, "0"),
              origin,
            }
          : { kind: "delete-text", inlineContentId: id, start: 0, end: 4 };
      carrier.applyChange({
        payloads: [payload],
        context: { actorId: "lifecycle", effectId: `effect-${completed}` },
      });
      if (completed % 2 === 1)
        expectedText = ((completed - 1) / 2).toString(36).padStart(4, "0");
      completed++;
      if (completed % 10 === 0) {
        const expected = carrier.snapshot();
        const payload = expected.payloads.get(id);
        if (payload?.kind !== "text" || payload.text !== expectedText)
          throw new Error("Capture state mismatch");
        tokens.push({ token: carrier.captureHistoricalState(), expected });
      }
    }
    const editAndCaptureMs = performance.now() - editStart;
    const expectedLive = carrier.snapshot();
    const encodeStart = performance.now();
    const encoded = carrier.encode();
    const encodeMs = performance.now() - encodeStart;
    const loadStart = performance.now();
    const reloaded = factory.load(encoded);
    const loadMs = performance.now() - loadStart;
    const materializeStart = performance.now();
    for (const { token, expected } of tokens) {
      deepStrictEqual(reloaded.materializeHistoricalState(token), expected);
    }
    const materializeAllMs = performance.now() - materializeStart;
    const liveSnapshot = reloaded.snapshot();
    deepStrictEqual(liveSnapshot, expectedLive);
    const live = liveSnapshot.payloads.get(id);
    if (
      live?.kind !== "text" ||
      live.text !== expectedText ||
      reloaded.effects().size !== target
    )
      throw new Error("Reload mismatch");
    const sample = {
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
    };
    samples.push(sample);
    console.error(JSON.stringify({ candidate, sample }));
    carrier = reloaded;
  }
  const git = (...args) => {
    const result = spawnSync("git", args, { encoding: "utf8" });
    return result.status === 0 ? result.stdout.trim() : null;
  };
  const status = git("status", "--porcelain");
  console.log(
    JSON.stringify(
      {
        candidate,
        revision: {
          githubSha: process.env.GITHUB_SHA ?? null,
          head: git("rev-parse", "HEAD"),
          dirty: status === null ? null : status.length > 0,
        },
        profile: {
          checkpoints,
          snapshotEvery: 10,
          workload:
            "alternating four-unit insert/delete, encode and reload at each checkpoint",
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
