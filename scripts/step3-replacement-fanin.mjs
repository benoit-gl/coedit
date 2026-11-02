// Reproducible, bounded qualification experiment; timings are descriptive.
import { createServer } from "vite";
import { performance } from "node:perf_hooks";
import os from "node:os";
import { isDeepStrictEqual } from "node:util";

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
const identity = (actor, effect) => JSON.stringify([actor, effect]);
const baseId = identity("owner", "base");
const encodedOrigin = JSON.stringify({ id: origin.id, kind: origin.kind });
const replacement = (i) =>
  i % 2 === 0
    ? {
        kind: "replace-text",
        inlineContentId: content,
        mediaType: "text/plain",
        text: `branch-${i}`,
        origin: encodedOrigin,
      }
    : {
        kind: "replace-opaque",
        inlineContentId: content,
        mediaType: "application/example",
        bytes: [i, 255 - i],
        origin: encodedOrigin,
      };
const expectedBranch = (i) => ({
  rootId: root,
  blockLiveness: new Map([[root, true]]),
  placements: new Map(),
  inlineContentOwners: new Map([[content, root]]),
  payloads: new Map([
    [
      content,
      i % 2 === 0
        ? {
            kind: "text",
            mediaType: "text/plain",
            text: `branch-${i}`,
            spans: [{ text: `branch-${i}`, origin }],
          }
        : {
            kind: "opaque",
            mediaType: "application/example",
            bytes: Uint8Array.of(i, 255 - i),
            origin,
          },
    ],
  ]),
});
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
        return { encoded: branch.encode(), token, expected: expectedBranch(i) };
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
      const expectedAlternatives = branches
        .map((_, i) => ({
          effectId: identity(`actor-${i}`, "replace"),
          parents: [baseId],
          operation: replacement(i),
        }))
        .sort((a, b) => a.effectId.localeCompare(b.effectId));
      const expectedRecords = [
        {
          effectId: baseId,
          parents: [],
          operations: [
            {
              kind: "replace-text",
              inlineContentId: content,
              mediaType: "text/plain",
              text: "base",
              origin: encodedOrigin,
            },
          ],
        },
        ...expectedAlternatives.map(({ effectId, parents, operation }) => ({
          effectId,
          parents,
          operations: [operation],
        })),
      ].sort((a, b) => a.effectId.localeCompare(b.effectId));
      if (
        !isDeepStrictEqual(alternatives.value, expectedAlternatives) ||
        !isDeepStrictEqual(records.value, expectedRecords)
      )
        throw Error("Replacement evidence mismatch");
      if (
        !branches.some(({ expected }) =>
          isDeepStrictEqual(projection.value, expected),
        )
      )
        throw Error("Projected winner differs from fixture branches");
      const materialize = timed(() =>
        branches.map(({ token }) => joined.materializeHistoricalState(token)),
      );
      for (let i = 0; i < count; i++) {
        if (!isDeepStrictEqual(materialize.value[i], branches[i].expected))
          throw Error("Historical branch mismatch");
      }
      const encoded = timed(() => joined.encode());
      const reopened = timed(() => factory.load(encoded.value));
      // Convergence and reload verification are deliberately outside timing intervals.
      const reverse = factory.load(genesis);
      for (const branch of [...branches].reverse())
        reverse.mergeEncoded(branch.encoded);
      for (const replica of [reverse, reopened.value]) {
        if (!isDeepStrictEqual(replica.snapshot(), projection.value))
          throw Error("Converged projection mismatch");
        if (!isDeepStrictEqual(replica.effects(), joined.effects()))
          throw Error("Converged effect contexts mismatch");
        if (
          !isDeepStrictEqual(replica.recordedPayloadEffects(), expectedRecords)
        )
          throw Error("Converged payload effects mismatch");
        for (const branch of branches) {
          if (
            !isDeepStrictEqual(
              replica.materializeHistoricalState(branch.token),
              branch.expected,
            )
          )
            throw Error("Converged historical branch mismatch");
        }
        if (
          !isDeepStrictEqual(
            evidence.replacementAlternatives(
              replica.recordedPayloadEffects(),
              content,
            ),
            expectedAlternatives,
          )
        )
          throw Error("Converged replacement alternatives mismatch");
      }
      const row = {
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
      };
      rows.push(row);
      // Preserve completed samples if a later sample fails.
      console.error(JSON.stringify(row));
    }
console.log(
  JSON.stringify(
    {
      schema: 1,
      description:
        "Mixed text/opaque concurrent replacement fan-in; three sequential samples, no warmup; complete encoded branch merges include candidate staging and validation; process max RSS is cumulative, not per sample.",
      revision: process.env.STEP3_REVISION ?? "unspecified",
      githubHeadSha: process.env.GITHUB_HEAD_SHA ?? null,
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
