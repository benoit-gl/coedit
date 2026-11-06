// Bounded, qualification-only admission and boundary comparison.
import { writeFileSync, readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { performance } from "node:perf_hooks";
import { arch, cpus, platform, release, totalmem } from "node:os";
import { isDeepStrictEqual, TextDecoder, TextEncoder } from "node:util";
import { createServer } from "vite";

const output = process.argv[2];
if (!output || process.argv.length !== 3)
  throw new Error(
    "Usage: node scripts/step3-admission-boundary.mjs OUTPUT.json",
  );
const git = (...args) => {
  const r = spawnSync("git", args, { encoding: "utf8" });
  return r.status === 0 ? r.stdout.trim() : null;
};
const smoke = process.env.STEP3_ADMISSION_SMOKE === "1";
const result = {
  metadata: {
    revision: git("rev-parse", "HEAD"),
    githubSha: process.env.GITHUB_SHA ?? null,
    githubHeadSha: process.env.GITHUB_HEAD_SHA ?? null,
    workingTree: git("status", "--porcelain"),
    environment: {
      node: process.version,
      platform: platform(),
      release: release(),
      arch: arch(),
      cpu: cpus()[0]?.model,
      cpus: cpus().length,
      memory: totalmem(),
      packages: Object.fromEntries(
        ["yjs", "@automerge/automerge", "vite"].map((p) => [
          p,
          JSON.parse(readFileSync(`node_modules/${p}/package.json`, "utf8"))
            .version,
        ]),
      ),
    },
    profile: {
      smoke,
      sizes: smoke ? [1024] : [1024, 16384, 65536],
      fragments: [1, 8],
      operations: smoke ? [1] : [1, 8],
      warmups: smoke ? 0 : 1,
      samples: smoke ? 1 : 3,
      order: "paired, alternating by iteration",
      timing:
        "individual synchronous operations; assertions outside timed interval",
    },
    limitations: [
      "Qualification fixtures only; guards and limits are not product policy.",
      "No attempt to trigger out-of-memory; ordinary runtime failure is not a proven safe allocation strategy.",
      "Elapsed times include native implementation work, not OS clipboard or production parser; three samples do not estimate tails.",
    ],
  },
  status: "running",
  rows: [],
  boundaries: [],
  clipboard: [],
  errors: [],
};
const save = () =>
  writeFileSync(output, JSON.stringify(result, null, 2) + "\n");
const assert = (condition, message) => {
  if (!condition) throw new Error(message);
};
const equal = (a, b, message) => assert(isDeepStrictEqual(a, b), message);
const time = (fn) => {
  const start = performance.now();
  const value = fn();
  return [value, performance.now() - start];
};
const server = await createServer({
  appType: "custom",
  server: { middlewareMode: true, hmr: false, ws: false },
  logLevel: "error",
});
const load = (p) => server.ssrLoadModule("/" + p);
try {
  const [domain, pos, y, a, clip, semantic, raw, py, pa] = await Promise.all([
    load("src/domain/index.ts"),
    load("qualification/step3/structure/localDensePosition.ts"),
    load("qualification/step3/integrated/yjsIntegratedDocumentCarrier.ts"),
    load(
      "qualification/step3/integrated/automergeIntegratedDocumentCarrier.ts",
    ),
    load("qualification/step3/editor/clipboard.ts"),
    load("qualification/step3/editor/semanticText.ts"),
    load("qualification/step3/payload/rawMediaBoundary.ts"),
    load("qualification/step3/payload/yjsPayloadCarrier.ts"),
    load("qualification/step3/payload/automergePayloadCarrier.ts"),
  ]);
  await server.close();
  const allocator = pos.localDensePositionAllocator;
  const factories = [
    y.createYjsIntegratedDocumentCarrierFactory(allocator, allocator),
    a.createAutomergeIntegratedDocumentCarrierFactory(allocator, allocator),
  ];
  const payloadFactories = [
    py.yjsPayloadCarrierFactory,
    pa.automergePayloadCarrierFactory,
  ];
  const root = domain.parseBlockId("92000000-0000-4000-8000-000000000001");
  const id = domain.parseInlineContentId(
    "92000000-0000-4000-8000-000000000002",
  );
  const doc = domain.parseDocumentId("92000000-0000-4000-8000-000000000003");
  const origins = Array.from({ length: 8 }, (_, i) => ({
    id: `author-${i}`,
    kind: "human",
  }));
  const imported = { id: "imported", kind: "imported" };
  const limits = {
    maxEncodedLength: 1000000,
    maxSpans: 100,
    maxTextLength: 100000,
  };
  const make = (factory, size, fragments) => {
    const c = factory.create(root);
    const text = "x".repeat(size);
    c.applyChange({
      inlineContents: [{ inlineContentId: id, blockId: root }],
      payloads: [
        {
          kind: "replace-text",
          inlineContentId: id,
          mediaType: "text/plain",
          text: "",
          origin: origins[0],
        },
      ],
    });
    for (let i = 0; i < fragments; i++) {
      const start = Math.floor((size * i) / fragments),
        end = Math.floor((size * (i + 1)) / fragments);
      c.applyChange({
        payloads: [
          {
            kind: "insert-text",
            inlineContentId: id,
            offset: start,
            text: text.slice(start, end),
            origin: origins[i],
          },
        ],
      });
    }
    return c;
  };
  // Build the expected attributed text from fixture coordinates, independent
  // of either candidate's projected spans and their harmless segmentation.
  const expectedText = (size, fragments, offset = size, insertion = "") => {
    const spans = [];
    const add = (text, origin) => {
      if (text.length) spans.push({ text, origin });
    };
    for (let i = 0; i < fragments; i++) {
      const start = Math.floor((size * i) / fragments);
      const end = Math.floor((size * (i + 1)) / fragments);
      add("x".repeat(Math.max(0, Math.min(end, offset) - start)), origins[i]);
      if (offset >= start && offset < end) add(insertion, origins[0]);
      add("x".repeat(Math.max(0, end - Math.max(start, offset))), origins[i]);
    }
    if (offset === size) add(insertion, origins[0]);
    return {
      text: "x".repeat(offset) + insertion + "x".repeat(size - offset),
      spans,
    };
  };
  const checkText = (actual, expected, label) => {
    assert(
      actual?.kind === "text" && actual.mediaType === "text/plain",
      `${label}: text metadata`,
    );
    assert(
      semantic.sameAttributedRange(
        actual,
        0,
        actual.text.length,
        expected,
        0,
        expected.text.length,
      ),
      `${label}: text or Origin mismatch`,
    );
  };
  // Independent test oracle for unchanged state, bytes and effect records.
  const unchangedOnError = (carrier, fn, label) => {
    const before = carrier.encode();
    const snapshot = carrier.snapshot();
    const effects = carrier.recordedPayloadEffects();
    let rejected = false;
    try {
      fn();
    } catch {
      rejected = true;
    }
    assert(rejected, `${label}: did not reject`);
    equal(carrier.snapshot(), snapshot, `${label}: state changed`);
    equal(
      carrier.recordedPayloadEffects(),
      effects,
      `${label}: effects changed`,
    );
    equal(carrier.encode(), before, `${label}: encoded state changed`);
  };
  const cases = [];
  for (const size of result.metadata.profile.sizes)
    for (const fragments of result.metadata.profile.fragments)
      for (const operations of result.metadata.profile.operations)
        for (const kind of ["text", "opaque"])
          cases.push({ size, fragments, operations, kind });
  for (const shape of cases) {
    for (
      let iteration = -result.metadata.profile.warmups;
      iteration < result.metadata.profile.samples;
      iteration++
    ) {
      for (const factory of iteration % 2 === 0
        ? factories
        : [...factories].reverse()) {
        const c = make(factory, shape.size, shape.fragments);
        const input =
          shape.kind === "text"
            ? "z".repeat(shape.size)
            : new Uint8Array(shape.size).fill(123);
        const [copy, copyMs] = time(() =>
          typeof input === "string" ? input.slice(0) : input.slice(),
        );
        const [decoded, decodeMs] = time(() =>
          shape.kind === "text"
            ? new TextDecoder("utf-8", { fatal: true }).decode(
                new TextEncoder().encode(copy),
              )
            : copy.slice(),
        );
        const change = {
          payloads: Array.from({ length: shape.operations }, (_, n) =>
            shape.kind === "text"
              ? {
                  kind: "replace-text",
                  inlineContentId: id,
                  mediaType: "text/plain",
                  text: decoded,
                  origin: origins[n % shape.fragments],
                }
              : {
                  kind: "replace-opaque",
                  inlineContentId: id,
                  mediaType: "application/example",
                  bytes: decoded,
                  origin: origins[n % shape.fragments],
                },
          ),
        };
        const [, publishMs] = time(() => c.applyChange(change));
        const [encoded, encodeMs] = time(() => c.encode());
        const projected = c.snapshot().payloads.get(id);
        const expectedOrigin =
          origins[(shape.operations - 1) % shape.fragments];
        const checkPayload = (actual) => {
          if (shape.kind === "text")
            checkText(
              actual,
              {
                text: decoded,
                spans: [{ text: decoded, origin: expectedOrigin }],
              },
              "replacement",
            );
          else
            equal(
              actual,
              {
                kind: "opaque",
                mediaType: "application/example",
                bytes: decoded,
                origin: expectedOrigin,
              },
              "opaque replacement payload",
            );
        };
        checkPayload(projected);
        const reloaded = factory.load(encoded).snapshot();
        checkPayload(reloaded.payloads.get(id));
        equal(reloaded, c.snapshot(), "reload mismatch");
        if (iteration >= 0)
          result.rows.push({
            candidate: factory.candidate,
            ...shape,
            iteration,
            copyMs,
            decodeMs,
            publishMs,
            encodeMs,
            encodedBytes: encoded.length,
          });
        save();
      }
    }
  }
  // Independently exercise fine-grained Unicode/Markdown-like insertions and
  // deletions, rather than inferring their cost from replacement transactions.
  for (const size of result.metadata.profile.sizes) {
    for (const fragments of result.metadata.profile.fragments) {
      for (const operations of result.metadata.profile.operations) {
        for (
          let iteration = -result.metadata.profile.warmups;
          iteration < result.metadata.profile.samples;
          iteration++
        ) {
          for (const factory of iteration % 2 === 0
            ? factories
            : [...factories].reverse()) {
            const c = make(factory, size, fragments);
            const unit = "# Hé😀\n";
            const text = unit.repeat(
              Math.max(1, Math.floor(size / operations / unit.length)),
            );
            const offset = Math.floor(size / 2);
            const insertions = Array.from({ length: operations }, () => ({
              kind: "insert-text",
              inlineContentId: id,
              offset,
              text,
              origin: origins[0],
            }));
            const [bytes, encodeInputMs] = time(() =>
              new TextEncoder().encode(text),
            );
            const [decoded, decodeMs] = time(() =>
              new TextDecoder("utf-8", { fatal: true }).decode(bytes),
            );
            equal(decoded, text, "Unicode fixture round trip");
            const [, insertMs] = time(() =>
              c.applyChange({ payloads: insertions }),
            );
            const inserted = c.snapshot().payloads.get(id);
            checkText(
              inserted,
              expectedText(size, fragments, offset, text.repeat(operations)),
              "fine-grained insertion",
            );
            const deletions = Array.from({ length: operations }, () => ({
              kind: "delete-text",
              inlineContentId: id,
              start: offset,
              end: offset + text.length,
            }));
            const [, deleteMs] = time(() =>
              c.applyChange({ payloads: deletions }),
            );
            const [encoded, encodeMs] = time(() => c.encode());
            const final = c.snapshot().payloads.get(id);
            const expectedFinal = expectedText(size, fragments);
            checkText(final, expectedFinal, "fine-grained deletion");
            const reopened = factory.load(encoded).snapshot();
            checkText(
              reopened.payloads.get(id),
              expectedFinal,
              "fine-grained reload",
            );
            equal(reopened, c.snapshot(), "fine-grained reload mismatch");
            if (iteration >= 0)
              result.rows.push({
                candidate: factory.candidate,
                kind: "text-edit",
                distribution: "Unicode Markdown-like",
                size,
                fragments,
                operations,
                insertedUnitsPerOperation: text.length,
                iteration,
                encodeInputMs,
                decodeMs,
                insertMs,
                deleteMs,
                encodeMs,
                encodedBytes: encoded.length,
              });
            save();
          }
        }
      }
    }
  }
  // Policies are candidate fixtures, not proposals. Evaluation precedes mutation.
  for (const factory of factories) {
    const c = make(factory, 128, 2);
    const before = c.encode(),
      snapshot = c.snapshot(),
      effects = c.recordedPayloadEffects();
    for (const kind of ["text", "opaque"]) {
      const request = { bytes: 2048, operations: 4, kind };
      const policies = {
        fixed: () => request.bytes <= 1024,
        adaptive: () =>
          request.bytes <= Math.floor(4096 / (request.operations + 1)),
        operationSpecific: () => request.bytes * request.operations <= 4096,
        normalRuntime: () => true,
      };
      const requestChange = {
        payloads: Array.from({ length: request.operations }, () =>
          kind === "text"
            ? {
                kind: "insert-text",
                inlineContentId: id,
                offset: 0,
                text: "z".repeat(request.bytes),
                origin: origins[0],
              }
            : {
                kind: "replace-opaque",
                inlineContentId: id,
                mediaType: "application/example",
                bytes: new Uint8Array(request.bytes).fill(123),
                origin: origins[0],
              },
        ),
      };
      for (const [policy, admit] of Object.entries(policies)) {
        const accepted = admit();
        if (!accepted) {
          unchangedOnError(
            c,
            () => {
              if (!admit())
                throw new RangeError(`Fixture ${policy} refused admission`);
              c.applyChange(requestChange);
            },
            `${policy} guard`,
          );
          equal(c.snapshot(), snapshot, `${policy}: state changed on refusal`);
          equal(
            c.encode(),
            before,
            `${policy}: encoded state changed on refusal`,
          );
          equal(
            c.recordedPayloadEffects(),
            effects,
            `${policy}: effects changed on refusal`,
          );
        } else {
          const admitted = factory.load(before);
          admitted.applyChange(requestChange);
          const actual = admitted.snapshot().payloads.get(id);
          if (kind === "text") {
            checkText(
              actual,
              expectedText(
                128,
                2,
                0,
                "z".repeat(request.bytes * request.operations),
              ),
              `${policy}: admitted text`,
            );
          } else {
            equal(
              actual,
              {
                kind: "opaque",
                mediaType: "application/example",
                bytes: new Uint8Array(request.bytes).fill(123),
                origin: origins[0],
              },
              `${policy}: admitted opaque payload`,
            );
          }
        }
        result.boundaries.push({
          candidate: factory.candidate,
          policy,
          request,
          outcome: accepted
            ? "admitted to runtime (no safe-allocation guarantee)"
            : "controlled refusal before publication",
        });
      }
    }
    unchangedOnError(
      c,
      () =>
        c.applyChange({
          payloads: [
            {
              kind: "insert-text",
              inlineContentId: id,
              offset: 9999,
              text: "x",
              origin: origins[0],
            },
          ],
        }),
      "invalid position",
    );
    unchangedOnError(
      c,
      () => c.mergeEncoded(new Uint8Array([1, 2, 3])),
      "malformed carrier",
    );
    result.boundaries.push({
      candidate: factory.candidate,
      invalidPosition: "rejected unchanged",
      malformedCarrier: "rejected unchanged",
    });
    // Two concurrent alternatives from one genesis, merged both ways and reloaded.
    const base = c.encode(),
      left = factory.load(base),
      right = factory.load(base);
    left.applyChange({
      payloads: [
        {
          kind: "replace-text",
          inlineContentId: id,
          mediaType: "text/plain",
          text: "left",
          origin: origins[0],
        },
      ],
    });
    right.applyChange({
      payloads: [
        {
          kind: "replace-opaque",
          inlineContentId: id,
          mediaType: "application/example",
          bytes: Uint8Array.of(1, 2),
          origin: origins[1],
        },
      ],
    });
    const expectedLeft = {
      text: "left",
      spans: [{ text: "left", origin: origins[0] }],
    };
    const expectedRight = {
      kind: "opaque",
      mediaType: "application/example",
      bytes: Uint8Array.of(1, 2),
      origin: origins[1],
    };
    checkText(
      left.snapshot().payloads.get(id),
      expectedLeft,
      "concurrent text branch",
    );
    equal(
      right.snapshot().payloads.get(id),
      expectedRight,
      "concurrent opaque branch",
    );
    const l = left.encode(),
      r = right.encode();
    left.mergeEncoded(r);
    right.mergeEncoded(l);
    equal(
      left.snapshot(),
      right.snapshot(),
      "concurrent alternatives did not converge",
    );
    equal(
      factory.load(left.encode()).snapshot(),
      left.snapshot(),
      "concurrent reload mismatch",
    );
    const winner = left.snapshot().payloads.get(id);
    if (winner?.kind === "text")
      checkText(winner, expectedLeft, "concurrent winner");
    else equal(winner, expectedRight, "concurrent winner");
    result.boundaries.push({
      candidate: factory.candidate,
      concurrentAlternatives: "converged to intact branch and reloaded",
      winner: left.snapshot().payloads.get(id).kind,
    });
    // Resolve source by actual retained materialization and attributed substring.
    const token = c.captureHistoricalState();
    const payload = c.snapshot().payloads.get(id);
    const fragment = clip.encodePrivateClipboard(payload, 0, 32, doc, token);
    const catalog = new Map(origins.map((o) => [o.id, o]));
    const resolve = (carrier) => (reference, spans) => {
      const retained = carrier
        .materializeHistoricalState(reference)
        .payloads.get(id);
      if (retained?.kind !== "text") return false;
      const needle = spans.map((s) => s.text).join("");
      for (
        let start = retained.text.indexOf(needle);
        start !== -1;
        start = retained.text.indexOf(needle, start + 1)
      ) {
        if (
          isDeepStrictEqual(
            semantic.sliceAttributedText(
              retained,
              start,
              start + needle.length,
            ),
            spans,
          )
        )
          return true;
      }
      return false;
    };
    const changed = factory.load(c.encode());
    changed.applyChange({
      payloads: [
        {
          kind: "replace-text",
          inlineContentId: id,
          mediaType: "text/plain",
          text: "different",
          origin: origins[0],
        },
      ],
    });
    const wrongReference = changed.captureHistoricalState();
    for (const [name, carrier, reference, expectedSource] of [
      ["wrong-retained-content", changed, wrongReference, false],
      ["retained", c, token, true],
      ["reload", factory.load(c.encode()), token, true],
      ["unresolved", c, "missing", false],
    ]) {
      const privateText = JSON.stringify({
        ...JSON.parse(fragment.privateText),
        sourceReference: reference,
      });
      const [value, ms] = time(() =>
        clip.decodePrivateClipboard(
          privateText,
          fragment.plainText,
          doc,
          catalog,
          imported,
          limits,
          resolve(carrier),
        ),
      );
      assert(
        value.privateOriginPreserved &&
          (expectedSource
            ? value.source?.reference === reference
            : value.source === undefined),
        `${name}: source outcome`,
      );
      assert(
        semantic.sameAttributedRange(
          value,
          0,
          value.text.length,
          {
            text: "x".repeat(32),
            spans: [{ text: "x".repeat(32), origin: origins[0] }],
          },
          0,
          32,
        ),
        `${name}: attributed fragment differs from fixture`,
      );
      result.clipboard.push({
        candidate: factory.candidate,
        name,
        ms,
        outcome: expectedSource
          ? "validated derivation"
          : "valid origin; no derivation",
      });
    }
    // Equal attributed content in another InlineContent cannot authenticate a
    // copy's actual source: the callback identifies only the searched content.
    const otherId = domain.parseInlineContentId(
      "92000000-0000-4000-8000-000000000004",
    );
    const ambiguous = factory.load(c.encode());
    ambiguous.applyChange({
      inlineContents: [{ inlineContentId: otherId, blockId: root }],
      payloads: [
        {
          kind: "replace-text",
          inlineContentId: otherId,
          mediaType: "text/plain",
          text: "x".repeat(32),
          origin: origins[0],
        },
      ],
    });
    const ambiguousToken = ambiguous.captureHistoricalState();
    const other = ambiguous.snapshot().payloads.get(otherId);
    const otherCopy = clip.encodePrivateClipboard(
      other,
      0,
      32,
      doc,
      ambiguousToken,
    );
    const ambiguity = clip.decodePrivateClipboard(
      otherCopy.privateText,
      otherCopy.plainText,
      doc,
      catalog,
      imported,
      limits,
      resolve(ambiguous),
    );
    assert(
      ambiguity.source?.reference === ambiguousToken,
      "equal-content ambiguity fixture did not match",
    );
    result.clipboard.push({
      candidate: factory.candidate,
      name: "equal-content-other-inline",
      outcome:
        "matching fragment cannot authenticate which InlineContent was copied",
    });
    // Additional retained-source cases vary retained text and attributed runs.
    // The matched fragment crosses an Origin boundary when fragmentation is 8.
    for (const size of smoke ? [1024] : [1024, 16384, 65536]) {
      for (const fragments of [1, 8]) {
        const source = make(factory, size, fragments);
        const reference = source.captureHistoricalState();
        const sourcePayload = source.snapshot().payloads.get(id);
        const boundary = Math.floor(size / fragments);
        const start = Math.min(size - 32, Math.max(0, boundary - 16));
        const copy = clip.encodePrivateClipboard(
          sourcePayload,
          start,
          start + 32,
          doc,
          reference,
        );
        const reloaded = factory.load(source.encode());
        if (fragments === 8) {
          const parts = JSON.parse(copy.privateText).spans;
          assert(
            parts.length === 2,
            "expected a fragment spanning two Origins",
          );
          for (const [name, guard] of Object.entries({
            encoded: {
              ...limits,
              maxEncodedLength: copy.privateText.length - 1,
            },
            spans: { ...limits, maxSpans: 1 },
            text: { ...limits, maxTextLength: 31 },
          })) {
            let calls = 0;
            const value = clip.decodePrivateClipboard(
              copy.privateText,
              copy.plainText,
              doc,
              catalog,
              imported,
              guard,
              (ref, spans) => {
                calls++;
                return resolve(reloaded)(ref, spans);
              },
            );
            assert(
              !value.privateOriginPreserved &&
                value.text === copy.plainText &&
                value.spans[0].origin.id === imported.id &&
                calls === 0,
              `fragmented ${name} guard failed`,
            );
            result.clipboard.push({
              candidate: factory.candidate,
              name: `fragmented-${name}-guard`,
              size,
              outcome: "fallback before retained lookup",
            });
          }
        }
        for (let i = 0; i < (smoke ? 1 : 3); i++) {
          const [value, ms] = time(() =>
            clip.decodePrivateClipboard(
              copy.privateText,
              copy.plainText,
              doc,
              catalog,
              imported,
              limits,
              resolve(reloaded),
            ),
          );
          assert(
            value.privateOriginPreserved &&
              value.source?.reference === reference,
            "scaled retained-source resolution failed",
          );
          const expectedSource = expectedText(size, fragments);
          assert(
            semantic.sameAttributedRange(
              value,
              0,
              value.text.length,
              expectedSource,
              start,
              start + 32,
            ),
            "scaled clipboard text or Origin mismatch",
          );
          result.clipboard.push({
            candidate: factory.candidate,
            name: "scaled-reload",
            size,
            fragments,
            iteration: i,
            ms,
            outcome: "validated derivation",
          });
        }
      }
    }
    const variants = [
      ["missing-private", undefined],
      [
        "cross-document",
        JSON.stringify({
          ...JSON.parse(fragment.privateText),
          documentId: "92000000-0000-4000-8000-000000000099",
        }),
      ],
      [
        "missing-reference",
        JSON.stringify({
          ...JSON.parse(fragment.privateText),
          sourceReference: "",
        }),
      ],
      [
        "empty-span",
        JSON.stringify({
          ...JSON.parse(fragment.privateText),
          spans: [{ text: "", origin: origins[0] }],
        }),
      ],
      ["malformed-json", "{"],
      [
        "wrong-version",
        JSON.stringify({
          ...JSON.parse(fragment.privateText),
          formatVersion: 2,
        }),
      ],
      [
        "unknown-origin",
        JSON.stringify({
          ...JSON.parse(fragment.privateText),
          spans: [
            {
              text: fragment.plainText,
              origin: { id: "unknown", kind: "human" },
            },
          ],
        }),
      ],
      ["mismatch", fragment.privateText.replace('"text":"x', '"text":"y')],
    ];
    for (const [name, privateText] of variants) {
      const value = clip.decodePrivateClipboard(
        privateText,
        fragment.plainText,
        doc,
        catalog,
        imported,
        limits,
        resolve(c),
      );
      assert(
        !value.privateOriginPreserved &&
          value.text === fragment.plainText &&
          value.spans[0].origin.id === imported.id,
        `${name}: bad fallback`,
      );
      result.clipboard.push({
        candidate: factory.candidate,
        name,
        outcome: "plain fallback with imported Origin",
      });
    }
    for (const [name, guard] of Object.entries({
      encoded: { ...limits, maxEncodedLength: fragment.privateText.length - 1 },
      spans: { ...limits, maxSpans: 0 },
      text: { ...limits, maxTextLength: fragment.plainText.length - 1 },
    })) {
      const value = clip.decodePrivateClipboard(
        fragment.privateText,
        fragment.plainText,
        doc,
        catalog,
        imported,
        guard,
        resolve(c),
      );
      assert(
        !value.privateOriginPreserved &&
          value.text === fragment.plainText &&
          value.spans[0].origin.id === imported.id,
        `${name}: guard fallback`,
      );
      result.clipboard.push({
        candidate: factory.candidate,
        name: `${name}-guard`,
        outcome: "plain fallback with imported Origin",
      });
    }
    save();
  }
  for (const factory of payloadFactories) {
    const c = factory.createText("text/plain; charset=UTF-8", origins[0]);
    raw.replaceQualificationRawMedia(
      c,
      "text/plain; charset=UTF-8",
      new TextEncoder().encode("Aé😀"),
      origins[0],
    );
    equal(
      [...raw.readQualificationRawMedia(c)],
      [...new TextEncoder().encode("Aé😀")],
      "UTF-8 round trip",
    );
    for (const [name, type, bytes] of [
      ["invalid-utf8", "text/plain; charset=UTF-8", Uint8Array.of(255)],
      ["unsupported-text-profile", "text/plain", Uint8Array.of(65)],
      ["invalid-media-type", "not a media type", Uint8Array.of(65)],
    ]) {
      const before = c.encode(),
        state = c.snapshot();
      let rejected = false;
      try {
        raw.replaceQualificationRawMedia(c, type, bytes, origins[0]);
      } catch {
        rejected = true;
      }
      assert(rejected, `${name}: accepted`);
      equal(c.snapshot(), state, `${name}: changed state`);
      equal(c.encode(), before, `${name}: changed encoding`);
      result.boundaries.push({
        candidate: factory.candidate,
        raw: name,
        outcome: "rejected unchanged",
      });
    }
    raw.replaceQualificationRawMedia(
      c,
      "application/example",
      Uint8Array.of(0, 255),
      origins[0],
    );
    equal(
      [...raw.readQualificationRawMedia(c)],
      [0, 255],
      "opaque bytes changed",
    );
    result.boundaries.push({
      candidate: factory.candidate,
      raw: "supported UTF-8 and opaque",
      outcome: "exact round-trip",
    });
  }
  result.status = "complete";
} catch (error) {
  result.status = "failed";
  result.errors.push(error instanceof Error ? error.stack : String(error));
  process.exitCode = 1;
} finally {
  await server.close();
  save();
}
