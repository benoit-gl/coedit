import { createServer } from "vite";
import { performance } from "node:perf_hooks";

const candidate = process.env.STEP3_HISTORY_CANDIDATE;
const count = Number(process.env.STEP3_HISTORY_COUNT);
if (
  (candidate !== "yjs" && candidate !== "automerge") ||
  !Number.isInteger(count)
)
  throw Error("STEP3_HISTORY_CANDIDATE and STEP3_HISTORY_COUNT are required");

const server = await createServer({
  appType: "custom",
  server: { middlewareMode: true, hmr: false },
  logLevel: "error",
});
let serverClosed = false;
async function closeLoader() {
  if (serverClosed) return;
  await server.close();
  serverClosed = true;
}
const load = (path) => server.ssrLoadModule("/" + path);
const uuid = (n) =>
  `70000000-0000-4000-8000-${n.toString(16).padStart(12, "0")}`;
const started = performance.now();
let lastProgress = started;
function reportProgress(completed, force = false) {
  const now = performance.now();
  if (!force && now - lastProgress < 15_000) return;
  console.error(
    "STEP3_HISTORY_PROGRESS " +
      JSON.stringify({
        candidate,
        completed,
        total: count,
        percent: Math.floor((completed / count) * 100),
        elapsedMs: Math.round(now - started),
      }),
  );
  lastProgress = now;
}

try {
  const [
    { parseBlockId, parseInlineContentId },
    { localDensePositionAllocator },
    { createYjsIntegratedDocumentCarrierFactory },
    { createAutomergeIntegratedDocumentCarrierFactory },
  ] = await Promise.all([
    load("src/domain/index.ts"),
    load("qualification/step3/structure/localDensePosition.ts"),
    load("qualification/step3/integrated/yjsIntegratedDocumentCarrier.ts"),
    load(
      "qualification/step3/integrated/automergeIntegratedDocumentCarrier.ts",
    ),
  ]);
  await closeLoader();
  const factory =
    candidate === "yjs"
      ? createYjsIntegratedDocumentCarrierFactory(
          localDensePositionAllocator,
          localDensePositionAllocator,
        )
      : createAutomergeIntegratedDocumentCarrierFactory(
          localDensePositionAllocator,
          localDensePositionAllocator,
        );
  const root = parseBlockId(uuid(1));
  const id = parseInlineContentId(uuid(2));
  const origin = { id: "benchmark-author", kind: "human" };
  const carrier = factory.create(root);
  carrier.applyChange({
    inlineContents: [{ inlineContentId: id, blockId: root }],
    payloads: [
      {
        kind: "replace-text",
        inlineContentId: id,
        mediaType: "text/plain",
        text: "a",
        origin,
      },
    ],
  });
  reportProgress(0, true);
  for (let index = 0; index < count; index++) {
    reportProgress(index);
    carrier.applyChange({
      payloads: [
        {
          kind: "insert-text",
          inlineContentId: id,
          offset: index + 1,
          text: "a",
          origin,
        },
      ],
      context: { actorId: "bench-author", effectId: "effect-" + index },
    });
  }
  if (carrier.effects().size !== count)
    throw Error("Retained effect count differs");
  console.error(
    "STEP3_HISTORY_PHASE " + JSON.stringify({ candidate, phase: "encoding" }),
  );
  const encodedBytes = carrier.encode().length;
  reportProgress(count, true);
  console.log(
    "STEP3_HISTORY " +
      JSON.stringify({
        outcome: "completed",
        encodedBytes,
      }),
  );
} finally {
  await closeLoader();
}
