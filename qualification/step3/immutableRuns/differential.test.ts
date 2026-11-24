import { describe, expect, it } from "vitest";

import {
  parseBlockId,
  parseInlineContentId,
} from "../../../src/domain/index.js";
import type { IntegratedDocumentCarrier } from "../integrated/carrier.js";
import type { QualificationOrigin } from "../payload/carrier.js";
import { createAutomergeImmutableRunCarrierFactory } from "./automergeCarrier.js";
import { AutomergeImmutableRunDocument } from "./nativeDocument.js";

const root = parseBlockId("ea000000-0000-4000-8000-000000000001");
const content = parseInlineContentId("ea000000-0000-4000-8000-000000000002");
const original = { kind: "human", id: "original" } as const;
const codec = {
  encode(value: string): string {
    return value;
  },
  decode(value: string): string {
    return value;
  },
};
const compare = (left: string, right: string): -1 | 0 | 1 =>
  left < right ? -1 : left > right ? 1 : 0;
const factory = createAutomergeImmutableRunCarrierFactory(
  codec,
  { compare, comparePrimary: compare },
  { purePositionDecoder: true },
);

type Unit = readonly [text: string, originId: string, originKind: string];

function units(text: string, origin: QualificationOrigin): Unit[] {
  return Array.from({ length: text.length }, (_, index) => [
    text.charAt(index),
    origin.id,
    origin.kind,
  ]);
}

function flattened(
  spans: readonly Readonly<{ text: string; origin: QualificationOrigin }>[],
): Unit[] {
  return spans.flatMap((span) => units(span.text, span.origin));
}

function seeded() {
  const carrier = factory.create(root);
  carrier.applyChange({
    context: { actorId: "seed", effectId: "seed" },
    inlineContents: [{ inlineContentId: content, blockId: root }],
    payloads: [
      {
        kind: "replace-text",
        inlineContentId: content,
        mediaType: "text/plain",
        text: "abcdef",
        origin: original,
      },
    ],
  });
  return carrier;
}

function indexedUnits(carrier: IntegratedDocumentCarrier<string>): Unit[] {
  const metadata = carrier.readOrdinaryTextRange(content, 0, 0)!;
  return flattened(
    carrier.readOrdinaryTextRange(content, 0, metadata.length)!.spans,
  );
}

// The cold model independently sorts the source graph and subtracts observed
// erasures. It does not use the carrier's warm AVL rope or its staged replay.
function assertColdAgreement(carrier: IntegratedDocumentCarrier<string>): void {
  const native = AutomergeImmutableRunDocument.load(carrier.encode());
  const activation = native.activate();
  const descriptor = native.descriptors().get(content);
  if (descriptor?.kind !== "text") throw new Error("Expected text descriptor.");
  const projection = activation.protocol.projectGeneration(
    activation.root,
    descriptor.generation,
  );
  expect(indexedUnits(carrier)).toEqual(
    projection.units.map((unit) => [
      unit.text,
      unit.origin.id,
      unit.origin.kind,
    ]),
  );
  expect(carrier.readOrdinaryTextRange(content, 0, 0)!.length).toBe(
    projection.text.length,
  );
  const payload = carrier.snapshot().payloads.get(content);
  if (payload?.kind !== "text") throw new Error("Expected text projection.");
  expect(flattened(payload.spans)).toEqual(indexedUnits(carrier));
  expect(payload.text).toBe(projection.text);
}

function boundaries(value: readonly Unit[]): number[] {
  const text = value.map((unit) => unit[0]).join("");
  const result = [0];
  let offset = 0;
  for (const character of text) {
    offset += character.length;
    result.push(offset);
  }
  return result;
}

function permutations(values: readonly number[]): number[][] {
  if (values.length === 0) return [[]];
  return values.flatMap((first, index) =>
    permutations(values.filter((_, other) => other !== index)).map((rest) => [
      first,
      ...rest,
    ]),
  );
}

describe(
  "immutable-run warm index and independent source projection",
  { timeout: 120_000 },
  () => {
    it("agrees with an attributed-string oracle through evolving insert/delete/replace batches and reopen", () => {
      let carrier = seeded();
      const expected = units("abcdef", original);
      for (let step = 0; step < 18; step++) {
        const allowed = boundaries(expected);
        const startIndex = (step * 7 + 2) % allowed.length;
        const start = allowed[startIndex]!;
        const end = allowed[Math.min(startIndex + 1, allowed.length - 1)]!;
        const origin: QualificationOrigin = {
          kind: step % 2 ? "automation" : "human",
          id: `editor-${step % 3}`,
        };
        const inserted = ["X", "😀", "é"][step % 3]!;
        const payloads = [];
        if (step % 3 !== 0 && start !== end) {
          payloads.push({
            kind: "delete-text" as const,
            inlineContentId: content,
            start,
            end,
          });
          expected.splice(start, end - start);
        }
        if (step % 3 !== 1) {
          payloads.push({
            kind: "insert-text" as const,
            inlineContentId: content,
            offset: start,
            text: inserted,
            origin,
          });
          expected.splice(start, 0, ...units(inserted, origin));
        }
        const revision = carrier.readOrdinaryTextRange(content, 0, 0)!.revision;
        carrier.applyOrdinaryChange(
          { context: { actorId: "editor", effectId: String(step) }, payloads },
          revision,
        );
        expect(indexedUnits(carrier)).toEqual(expected);
        if (step % 6 === 5) {
          assertColdAgreement(carrier);
          carrier = factory.load(carrier.encode());
          expect(indexedUnits(carrier)).toEqual(expected);
        }
      }
      assertColdAgreement(carrier);
    });

    for (const branchCount of [2, 3]) {
      it(`agrees after every reordered ${branchCount}-way delivery, duplicates, reopen, and following edit`, () => {
        const baseline = seeded().encode();
        const origins = ["left", "right", "third"].map((id) => ({
          kind: "human" as const,
          id,
        }));
        const branches = Array.from({ length: branchCount }, () =>
          factory.load(baseline),
        );
        branches[0]!.applyChange({
          context: { actorId: "left", effectId: "branch" },
          payloads: [
            {
              kind: "insert-text",
              inlineContentId: content,
              offset: 2,
              text: "L",
              origin: origins[0]!,
            },
          ],
        });
        branches[1]!.applyChange({
          context: { actorId: "right", effectId: "branch" },
          payloads: [
            { kind: "delete-text", inlineContentId: content, start: 2, end: 4 },
            {
              kind: "insert-text",
              inlineContentId: content,
              offset: 2,
              text: "R",
              origin: origins[1]!,
            },
          ],
        });
        branches[2]?.applyChange({
          context: { actorId: "third", effectId: "branch" },
          payloads: [
            { kind: "delete-text", inlineContentId: content, start: 1, end: 3 },
            {
              kind: "insert-text",
              inlineContentId: content,
              offset: 1,
              text: "T",
              origin: origins[2]!,
            },
          ],
        });
        const encoded = branches.map((branch) => branch.encode());
        const expected = [
          ...units("a", original),
          ...(branchCount === 2
            ? units("b", original)
            : units("T", origins[2]!)),
          ...units("R", origins[1]!),
          ...units("L", origins[0]!),
          ...units("ef", original),
        ];
        for (const order of permutations(
          Array.from({ length: branchCount }, (_, i) => i),
        )) {
          let carrier = factory.load(baseline);
          for (const branch of order) {
            carrier.mergeEncoded(encoded[branch]!);
            assertColdAgreement(carrier);
          }
          expect(indexedUnits(carrier)).toEqual(expected);
          carrier.mergeEncoded(encoded[order[0]!]!);
          expect(indexedUnits(carrier)).toEqual(expected);
          expect(carrier.effects().size).toBe(branchCount + 1);
          carrier = factory.load(carrier.encode());
          assertColdAgreement(carrier);
          expect(indexedUnits(carrier)).toEqual(expected);
          const after = [...expected];
          const editing = { kind: "automation", id: "following" } as const;
          const revision = carrier.readOrdinaryTextRange(
            content,
            0,
            0,
          )!.revision;
          carrier.applyOrdinaryChange(
            {
              context: { actorId: "following", effectId: "replace" },
              payloads: [
                {
                  kind: "delete-text",
                  inlineContentId: content,
                  start: 0,
                  end: 1,
                },
                {
                  kind: "insert-text",
                  inlineContentId: content,
                  offset: 0,
                  text: "!",
                  origin: editing,
                },
              ],
            },
            revision,
          );
          after.splice(0, 1, ...units("!", editing));
          expect(indexedUnits(carrier)).toEqual(after);
          assertColdAgreement(carrier);
        }
      });
    }
  },
);
