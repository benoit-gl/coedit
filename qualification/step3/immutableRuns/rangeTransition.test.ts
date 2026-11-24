import * as A from "@automerge/automerge";
import { describe, expect, it } from "vitest";

import {
  parseBlockId,
  parseInlineContentId,
} from "../../../src/domain/index.js";
import type { IntegratedDocumentCarrier } from "../integrated/carrier.js";
import {
  createProbeRange,
  resolveProbeRange,
  resolveProbeText,
  type ProbeTransition,
} from "../integrated/rangeProbe.js";
import {
  applyAutomergeImmutableRunFixtureTransitionV1,
  createAutomergeImmutableRunCarrierFactory,
} from "./automergeCarrier.js";
import {
  ImmutableRunProtocolV1,
  type ImmutableRunGenerationProjectionV1,
} from "./protocol.js";
import {
  decodeRecordKeyV1,
  type CanonicalRecordEntry,
  type RecordRef,
  type TransitionBody,
} from "./record.js";

const uuid = (n: number): string =>
  `ec000000-0000-4000-8000-${n.toString(16).padStart(12, "0")}`;
const root = parseBlockId(uuid(1));
const leftBlock = parseBlockId(uuid(2));
const rightBlock = parseBlockId(uuid(3));
const left = parseInlineContentId(uuid(4));
const right = parseInlineContentId(uuid(5));
const copied = parseInlineContentId(uuid(6));
const human = { id: "human", kind: "human" } as const;
const automation = { id: "automation", kind: "automation" } as const;
const spans = [
  { text: "ab", origin: human },
  { text: "CDef", origin: automation },
];
const codec = {
  encode: (value: string): string => value,
  decode: (value: string): string => value,
};
const compare = (a: string, b: string): -1 | 0 | 1 =>
  a < b ? -1 : a > b ? 1 : 0;
const factory = createAutomergeImmutableRunCarrierFactory(
  codec,
  { compare, comparePrimary: compare },
  { purePositionDecoder: true },
);

function seed(): IntegratedDocumentCarrier<string> {
  const carrier = factory.create(root);
  carrier.applyChange({
    context: { actorId: "actor", effectId: "seed" },
    placements: [
      { blockId: leftBlock, placement: { depth: 1, position: "b" } },
    ],
    inlineContents: [{ inlineContentId: left, blockId: leftBlock }],
    payloads: [
      {
        kind: "replace-text",
        inlineContentId: left,
        mediaType: "text/plain",
        text: "ab",
        origin: human,
      },
      {
        kind: "insert-text",
        inlineContentId: left,
        offset: 2,
        text: "CDef",
        origin: automation,
      },
    ],
  });
  return carrier;
}

function sameRef(a: RecordRef, b: RecordRef): boolean {
  return a[0] === b[0] && a[1] === b[1];
}

function interval(
  projection: ImmutableRunGenerationProjectionV1,
  run: RecordRef,
  start: number,
  end: number,
): readonly [number, number] {
  const first = projection.units.findIndex(
    (unit) => sameRef(unit.run, run) && unit.offset === start,
  );
  const last = projection.units.findIndex(
    (unit) => sameRef(unit.run, run) && unit.offset === end - 1,
  );
  expect(first).toBeGreaterThanOrEqual(0);
  expect(last - first + 1).toBe(end - start);
  for (let offset = start; offset < end; offset++) {
    const unit = projection.units[first + offset - start]!;
    expect(sameRef(unit.run, run)).toBe(true);
    expect(unit.offset).toBe(offset);
  }
  return [first, last + 1];
}

/**
 * Test-only bridge from validated persisted source mappings to the existing
 * Range probe's explicitly supplied span-lineage edges. It selects no public
 * Range encoding, continuing identity or positional split-boundary policy.
 */
function persistedEdge(
  carrier: IntegratedDocumentCarrier<string>,
  kind: TransitionBody[1],
  from: string,
  to: string,
): ProbeTransition {
  const entries = new Map<string, CanonicalRecordEntry>();
  for (const change of A.getAllChanges(A.load(carrier.encode())))
    for (const op of A.decodeChange(change).ops)
      if (
        op.action === "set" &&
        op.value === true &&
        /^[0-9a-f]{64}:\[/.test(op.key)
      ) {
        const entry = decodeRecordKeyV1(op.key, true);
        entries.set(entry.key, entry);
      }
  const records = [...entries.values()];
  const model = ImmutableRunProtocolV1.validate(records);
  const transitionEntry = records.find(
    (entry) =>
      entry.record[3] === "transition-v1" && entry.record[10][1] === kind,
  );
  if (transitionEntry?.record[3] !== "transition-v1")
    throw new TypeError("Fixture transition was not retained.");
  const body = transitionEntry.record[10] as TransitionBody;
  const manifest = records.find(
    (entry) =>
      entry.record[3] === "manifest" &&
      entry.record[2] === transitionEntry.record[8],
  );
  if (manifest === undefined)
    throw new TypeError("Fixture transition manifest was not retained.");
  return {
    from,
    to,
    lineage: body[5]
      .filter((mapping) => mapping[8] === "lineage")
      .map((mapping) => {
        const source = model.projectGeneration(body[2], mapping[0][2]);
        const destination = model.projectGeneration(
          manifest.ref,
          mapping[4][2],
        );
        const [sourceStart, sourceEnd] = interval(
          source,
          mapping[1],
          mapping[2],
          mapping[3],
        );
        const [targetStart] = interval(
          destination,
          mapping[5],
          mapping[6],
          mapping[7],
        );
        return {
          sourceInlineContentId: parseInlineContentId(mapping[0][1]),
          sourceStart,
          sourceEnd,
          targetBlockId: parseBlockId(mapping[4][0]),
          targetInlineContentId: parseInlineContentId(mapping[4][1]),
          targetStart,
        };
      }),
  };
}

describe(
  "immutable-run persisted Range feasibility",
  { timeout: 120_000 },
  () => {
    it("resolves a retained span through reopened split and merge facts in lineage order", () => {
      let carrier = seed();
      const before = carrier.captureHistoricalState();
      const range = createProbeRange(carrier, before, "span", [
        { blockId: leftBlock, inlineContentId: left, start: 1, end: 5 },
      ]);
      applyAutomergeImmutableRunFixtureTransitionV1(carrier, {
        kind: "split",
        sources: [{ blockId: leftBlock, inlineContentId: left }],
        destinations: [
          {
            blockId: leftBlock,
            inlineContentId: left,
            mediaType: "text/plain",
            spans: [spans[0]!],
          },
          {
            blockId: rightBlock,
            inlineContentId: right,
            mediaType: "text/plain",
            spans: [spans[1]!],
          },
        ],
        // Current tree order is right then left; lineage remains left then right.
        placements: [
          { blockId: rightBlock, placement: { depth: 1, position: "a" } },
        ],
        context: { actorId: "actor", effectId: "split" },
      });
      const splitToken = carrier.captureHistoricalState();
      carrier = factory.load(carrier.encode());
      const split = persistedEdge(carrier, "split", before, splitToken);
      expect(
        [...carrier.snapshot().placements]
          .sort(([, a], [, b]) => compare(a.position, b.position))
          .map(([id]) => id),
      ).toEqual([rightBlock, leftBlock]);
      expect(resolveProbeRange(carrier, range, splitToken, [split])).toEqual([
        {
          blockId: leftBlock,
          inlineContentId: left,
          start: 1,
          end: 2,
          text: "b",
        },
        {
          blockId: rightBlock,
          inlineContentId: right,
          start: 0,
          end: 3,
          text: "CDe",
        },
      ]);
      applyAutomergeImmutableRunFixtureTransitionV1(carrier, {
        kind: "merge",
        sources: [
          { blockId: leftBlock, inlineContentId: left },
          { blockId: rightBlock, inlineContentId: right },
        ],
        destinations: [
          {
            blockId: leftBlock,
            inlineContentId: left,
            mediaType: "text/plain",
            spans,
          },
        ],
        context: { actorId: "actor", effectId: "merge" },
      });
      const mergedToken = carrier.captureHistoricalState();
      carrier = factory.load(carrier.encode());
      const merged = persistedEdge(carrier, "merge", splitToken, mergedToken);
      expect(
        resolveProbeRange(carrier, range, mergedToken, [split, merged]),
      ).toEqual([
        {
          blockId: leftBlock,
          inlineContentId: left,
          start: 1,
          end: 2,
          text: "b",
        },
        {
          blockId: leftBlock,
          inlineContentId: left,
          start: 2,
          end: 5,
          text: "CDe",
        },
      ]);
      expect(
        resolveProbeText(carrier, range, mergedToken, [split, merged]),
      ).toBe("bCDe");
      expect(carrier.snapshot().payloads.get(left)).toMatchObject({
        text: "abCDef",
        spans,
      });
    });

    it("retains copy derivation without following it after source deletion", () => {
      let carrier = seed();
      const before = carrier.captureHistoricalState();
      const range = createProbeRange(carrier, before, "span", [
        { blockId: leftBlock, inlineContentId: left, start: 1, end: 5 },
      ]);
      applyAutomergeImmutableRunFixtureTransitionV1(carrier, {
        kind: "copy",
        sourceReference: before,
        sources: [{ blockId: leftBlock, inlineContentId: left }],
        destinations: [
          {
            blockId: rightBlock,
            inlineContentId: copied,
            mediaType: "text/plain",
            spans,
          },
        ],
        placements: [
          { blockId: rightBlock, placement: { depth: 1, position: "a" } },
        ],
        context: { actorId: "actor", effectId: "copy" },
      });
      const copiedToken = carrier.captureHistoricalState();
      carrier = factory.load(carrier.encode());
      const copy = persistedEdge(carrier, "copy", before, copiedToken);
      expect(copy.lineage).toEqual([]);
      expect(resolveProbeRange(carrier, range, copiedToken, [copy])).toEqual([
        {
          blockId: leftBlock,
          inlineContentId: left,
          start: 1,
          end: 5,
          text: "bCDe",
        },
      ]);
      carrier.applyChange({
        deleteBlockIds: [leftBlock],
        context: { actorId: "actor", effectId: "delete-source" },
      });
      const deletedToken = carrier.captureHistoricalState();
      carrier = factory.load(carrier.encode());
      expect(carrier.snapshot().payloads.get(copied)).toMatchObject({
        text: "abCDef",
        spans,
      });
      expect(
        resolveProbeRange(carrier, range, deletedToken, [
          copy,
          { from: copiedToken, to: deletedToken },
        ]),
      ).toEqual([]);
    });
  },
);
