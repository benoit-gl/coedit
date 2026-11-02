// Reproducible, bounded qualification experiment; timings are descriptive.
import { createServer } from "vite";
import { performance } from "node:perf_hooks";
import os from "node:os";

const server = await createServer({
  appType: "custom",
  server: { middlewareMode: true, hmr: false, ws: false },
  logLevel: "error",
});
const load = (path) => server.ssrLoadModule("/" + path);
const [domain, positions, yjs, automerge, evidence] = await Promise.all([
  load("src/domain/index.ts"),
  load("qualification/step3/structure/localDensePosition.ts"),
  load("qualification/step3/integrated/yjsIntegratedDocumentCarrier.ts"),
  load("qualification/step3/integrated/automergeIntegratedDocumentCarrier.ts"),
  load("qualification/step3/integrated/replacementEvidence.ts"),
]);
await server.close();
const { localDensePositionAllocator: allocator } = positions;
const factories = [
  yjs.createYjsIntegratedDocumentCarrierFactory(allocator, allocator),
  automerge.createAutomergeIntegratedDocumentCarrierFactory(
    allocator,
    allocator,
  ),
];
const root = domain.parseBlockId("72000000-0000-4000-8000-000000000001");
const content = domain.parseInlineContentId(
  "72000000-0000-4000-8000-000000000002",
);
const origin = { kind: "human", id: "author" };
const timed = (fn) => {
  const start = performance.now();
  const value = fn();
  return { value, ms: performance.now() - start };
};
const rows = [];
for (const factory of factories)
  for (const count of [2, 4, 8, 16, 32])
    for (let sample = 0; sample < 3; sample++) {
      const base = factory.create(root);
      base.applyChange({
        inlineContents: [{ inlineContentId: content, blockId: root }],
        payloads: [
          {
            kind: "replace-text",
            inlineContentId: content,
            mediaType: "text/plain",
            text: "base",
            origin,
          },
        ],
        context: { actorId: "owner", effectId: "base" },
      });
      const genesis = base.encode();
      const branches = Array.from({ length: count }, (_, i) => {
        const branch = factory.load(genesis);
        branch.applyChange({
          payloads: [
            i % 2 === 0
              ? {
                  kind: "replace-text",
                  inlineContentId: content,
                  mediaType: "text/plain",
                  text: `branch-${i}`,
                  origin,
                }
              : {
                  kind: "replace-opaque",
                  inlineContentId: content,
                  mediaType: "application/example",
                  bytes: Uint8Array.of(i, 255 - i),
                  origin,
                },
          ],
          context: { actorId: `actor-${i}`, effectId: "replace" },
        });
        const token = branch.captureHistoricalState();
        return { encoded: branch.encode(), token, expected: branch.snapshot() };
      });
      const joined = factory.load(genesis);
      const merges = branches.map(
        ({ encoded }) => timed(() => joined.mergeEncoded(encoded)).ms,
      );
      const projection = timed(() => joined.snapshot());
      const records = timed(() => joined.recordedPayloadEffects());
      const alternatives = timed(() =>
        evidence.replacementAlternatives(records.value, content),
      );
      if (alternatives.value.length !== count)
        throw Error("Replacement frontier mismatch");
      const materialize = timed(() =>
        branches.map(({ token }) => joined.materializeHistoricalState(token)),
      );
      for (let i = 0; i < count; i++) {
        // Snapshots contain Maps; compare exact detached values in a stable representation.
        const normalize = (s) =>
          JSON.stringify({
            ...s,
            blockLiveness: [...s.blockLiveness],
            placements: [...s.placements],
            inlineContentOwners: [...s.inlineContentOwners],
            payloads: [...s.payloads],
          });
        if (normalize(materialize.value[i]) !== normalize(branches[i].expected))
          throw Error("Historical branch mismatch");
      }
      const encoded = timed(() => joined.encode());
      const reopened = timed(() => factory.load(encoded.value));
      if (
        evidence.replacementAlternatives(
          reopened.value.recordedPayloadEffects(),
          content,
        ).length !== count
      )
        throw Error("Reload frontier mismatch");
      rows.push({
        candidate: factory.candidate,
        count,
        sample,
        mergesMs: merges,
        mergeTotalMs: merges.reduce((a, b) => a + b, 0),
        projectionMs: projection.ms,
        evidenceReadMs: records.ms,
        alternativesMs: alternatives.ms,
        materializeAllMs: materialize.ms,
        encodeMs: encoded.ms,
        reopenMs: reopened.ms,
        encodedBytes: encoded.value.length,
        retainedEffects: records.value.length,
        processMaxRssKiB: process.resourceUsage().maxRSS,
      });
    }
console.log(
  JSON.stringify(
    {
      schema: 1,
      description:
        "Mixed text/opaque concurrent replacement fan-in; three sequential samples, no warmup; complete encoded branch merges include candidate staging and validation; process max RSS is cumulative, not per sample.",
      revision: process.env.STEP3_REVISION ?? "unspecified",
      dirty: process.env.STEP3_DIRTY ?? "unspecified",
      node: process.version,
      platform: process.platform,
      arch: process.arch,
      cpu: os.cpus()[0]?.model,
      rows,
    },
    null,
    2,
  ),
);
