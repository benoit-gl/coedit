import { createServer } from "vite";

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
const load = (path) => server.ssrLoadModule("/" + path);
const uuid = (n) =>
  `70000000-0000-4000-8000-${n.toString(16).padStart(12, "0")}`;

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
  for (let index = 0; index < count; index++) {
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
  console.log(
    "STEP3_HISTORY " +
      JSON.stringify({
        outcome: "completed",
        encodedBytes: carrier.encode().length,
      }),
  );
} finally {
  await server.close();
}
