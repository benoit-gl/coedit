import * as Automerge from "@automerge/automerge";
import * as Y from "yjs";
import { describe, expect, it } from "vitest";

import {
  parseBlockId,
  parseInlineContentId,
} from "../../../src/domain/index.js";
import { projectStructuralSnapshot as projectCarrierSnapshot } from "../../../src/carrier/index.js";
import type { StructuralPlacement } from "../../../src/carrier/index.js";
import { createAutomergeIntegratedDocumentCarrierFactory } from "./automergeIntegratedDocumentCarrier.js";
import type {
  IntegratedDocumentCarrierFactory,
  IntegratedDocumentCarrier,
  IntegratedPayloadChange,
} from "./carrier.js";
import { createYjsIntegratedDocumentCarrierFactory } from "./yjsIntegratedDocumentCarrier.js";
import type { LocalDensePosition } from "../structure/localDensePosition.js";
import { localDensePositionAllocator } from "../structure/localDensePosition.js";

const rootId = parseBlockId("70000000-0000-4000-8000-000000000001");
const blockA = parseBlockId("70000000-0000-4000-8000-000000000002");
const blockB = parseBlockId("70000000-0000-4000-8000-000000000006");
const otherRootId = parseBlockId("70000000-0000-4000-8000-000000000005");
const textId = parseInlineContentId("70000000-0000-4000-8000-000000000003");
const opaqueId = parseInlineContentId("70000000-0000-4000-8000-000000000004");
const human = { id: "human-a", kind: "human" as const };
const imported = { id: "import-a", kind: "imported" as const };

const factories: readonly IntegratedDocumentCarrierFactory<LocalDensePosition>[] =
  [
    createYjsIntegratedDocumentCarrierFactory(
      localDensePositionAllocator,
      localDensePositionAllocator,
    ),
    createAutomergeIntegratedDocumentCarrierFactory(
      localDensePositionAllocator,
      localDensePositionAllocator,
    ),
  ];

for (const factory of factories) {
  describe(`${factory.candidate} integrated foundation`, () => {
    it("publishes structure, text, and opaque payloads in one atomic change", () => {
      const carrier = factory.create(rootId);
      carrier.applyChange({
        placements: [{ blockId: blockA, placement: position(1, 1) }],
        inlineContents: [
          { inlineContentId: textId, blockId: blockA },
          { inlineContentId: opaqueId, blockId: blockA },
        ],
        payloads: [
          {
            kind: "replace-text",
            inlineContentId: textId,
            mediaType: "text/plain",
            text: "alpha",
            origin: human,
          },
          {
            kind: "replace-opaque",
            inlineContentId: opaqueId,
            mediaType: "application/example",
            bytes: Uint8Array.of(1, 2, 3),
            origin: imported,
          },
        ],
      });
      const snapshot = carrier.snapshot();
      expect(snapshot.placements.get(blockA)).toEqual(position(1, 1));
      expect(snapshot.payloads.get(textId)).toMatchObject({
        kind: "text",
        text: "alpha",
      });
      expect(snapshot.payloads.get(opaqueId)).toMatchObject({
        kind: "opaque",
        bytes: Uint8Array.of(1, 2, 3),
      });

      const beforePayloadFailure = carrier.snapshot();
      expect(() =>
        carrier.applyChange({
          placements: [{ blockId: blockA, placement: position(2, 1) }],
          payloads: [
            {
              kind: "insert-text",
              inlineContentId: opaqueId,
              offset: 0,
              text: "bad",
              origin: human,
            },
          ],
        }),
      ).toThrow(/text payload/u);
      expect(carrier.snapshot()).toEqual(beforePayloadFailure);

      const beforePlacementFailure = carrier.snapshot();
      expect(() =>
        carrier.applyChange({
          placements: [
            { blockId: blockA, placement: position(2, 1) },
            { blockId: rootId, placement: position(3, 1) },
          ],
        }),
      ).toThrow(/root cannot have a placement/u);
      expect(carrier.snapshot()).toEqual(beforePlacementFailure);
    });

    it("creates immutable Block-local ownership and hides deleted Blocks atomically", () => {
      const carrier = seeded(factory);
      expect(carrier.snapshot().inlineContentOwners).toEqual(
        new Map([
          [textId, blockA],
          [opaqueId, blockA],
        ]),
      );

      const before = carrier.snapshot();
      expect(() =>
        carrier.applyChange({
          inlineContents: [{ inlineContentId: textId, blockId: blockA }],
          payloads: [
            {
              kind: "replace-text",
              inlineContentId: textId,
              mediaType: "text/plain",
              text: "replacement",
              origin: human,
            },
          ],
        }),
      ).toThrow(/ownership is immutable/u);
      expect(carrier.snapshot()).toEqual(before);

      carrier.applyChange({ deleteBlockIds: [blockA, blockA] });
      expect(carrier.snapshot()).toEqual({
        rootId,
        blockLiveness: new Map([
          [rootId, true],
          [blockA, false],
        ]),
        placements: new Map(),
        inlineContentOwners: new Map(),
        payloads: new Map(),
      });
    });

    it("keeps concurrent semantic changes live and each delivery state usable", () => {
      const base = seeded(factory).encode();
      const deletion = factory.load(base);
      const move = factory.load(base);
      deletion.applyChange({ deleteBlockIds: [blockA] });
      move.applyChange({
        placements: [{ blockId: blockA, placement: position(2, 1) }],
      });
      assertUsableSnapshot(deletion.snapshot());
      assertUsableSnapshot(move.snapshot());
      converge(deletion, move);
      expect(deletion.snapshot()).toEqual(move.snapshot());
      expect(deletion.snapshot().placements.has(blockA)).toBe(true);

      const updates: readonly IntegratedPayloadChange[] = [
        {
          kind: "insert-text",
          inlineContentId: textId,
          offset: 5,
          text: "!",
          origin: human,
        },
        {
          kind: "replace-text",
          inlineContentId: textId,
          mediaType: "text/plain",
          text: "replacement",
          origin: human,
        },
        {
          kind: "replace-opaque",
          inlineContentId: opaqueId,
          mediaType: "application/example",
          bytes: Uint8Array.of(4, 5, 6),
          origin: imported,
        },
      ];

      for (const payload of updates) {
        const deletion = factory.load(base);
        const update = factory.load(base);
        deletion.applyChange({ deleteBlockIds: [blockA] });
        update.applyChange({ payloads: [payload] });
        assertUsableSnapshot(deletion.snapshot());
        assertUsableSnapshot(update.snapshot());
        converge(deletion, update);
        expect(deletion.snapshot()).toEqual(update.snapshot());
        expect(deletion.snapshot().placements.has(blockA)).toBe(true);
        expect(deletion.snapshot().inlineContentOwners.get(textId)).toBe(
          blockA,
        );
        assertUsableSnapshot(deletion.snapshot());
      }
    });

    it("reprojects surviving children after an application-selected deletion list", () => {
      const carrier = seeded(factory);
      carrier.applyChange({
        placements: [{ blockId: blockB, placement: position(2, 2) }],
      });
      carrier.applyChange({ deleteBlockIds: [blockA] });
      const snapshot = carrier.snapshot();
      expect(snapshot.placements.has(blockA)).toBe(false);
      expect(snapshot.placements.has(blockB)).toBe(true);
      expect(
        projectIntegratedSnapshot(snapshot, factory.positionOrdering).find(
          (block) => block.blockId === blockB,
        )?.parentId,
      ).toBe(rootId);
      assertUsableSnapshot(snapshot);
    });

    it("applies sequential text operations against evolving transaction state", () => {
      const carrier = seeded(factory);
      carrier.applyChange({
        payloads: [
          {
            kind: "insert-text",
            inlineContentId: textId,
            offset: 5,
            text: " beta",
            origin: human,
          },
          {
            kind: "insert-text",
            inlineContentId: textId,
            offset: 10,
            text: "!",
            origin: human,
          },
          {
            kind: "delete-text",
            inlineContentId: textId,
            start: 5,
            end: 6,
          },
        ],
      });
      expect(text(carrier)).toBe("alphabeta!");
    });

    it("rejects lossily represented splice results against evolving transaction state atomically", () => {
      const cases: readonly (readonly IntegratedPayloadChange[])[] = [
        [
          {
            kind: "replace-text",
            inlineContentId: textId,
            mediaType: "text/plain",
            text: "😀",
            origin: human,
          },
          {
            kind: "insert-text",
            inlineContentId: textId,
            offset: 1,
            text: "X",
            origin: imported,
          },
        ],
        [
          {
            kind: "replace-text",
            inlineContentId: textId,
            mediaType: "text/plain",
            text: "😀",
            origin: human,
          },
          {
            kind: "delete-text",
            inlineContentId: textId,
            start: 0,
            end: 1,
          },
        ],
      ];

      for (const payloads of cases) {
        const carrier = seeded(factory);
        const before = carrier.snapshot();
        expect(() =>
          carrier.applyChange({
            placements: [{ blockId: blockA, placement: position(2, 1) }],
            payloads,
          }),
        ).toThrow(/cannot preserve/u);
        expect(carrier.snapshot()).toEqual(before);
      }
    });

    it("preserves an exact surrogate-crossing result or rejects the mixed change atomically", () => {
      const carrier = seeded(factory);
      carrier.applyChange({
        payloads: [
          {
            kind: "replace-text",
            inlineContentId: textId,
            mediaType: "text/plain",
            text: "😀😀",
            origin: human,
          },
        ],
      });
      const before = carrier.snapshot();
      const encodedBefore = carrier.encode();

      try {
        carrier.applyChange({
          placements: [{ blockId: blockB, placement: position(2, 1) }],
          payloads: [
            {
              kind: "delete-text",
              inlineContentId: textId,
              start: 1,
              end: 3,
            },
          ],
        });
      } catch {
        expect(carrier.snapshot()).toEqual(before);
        expect(carrier.encode()).toEqual(encodedBefore);
        return;
      }

      expect(text(carrier)).toBe("😀");
    });

    it("preserves complete Origin projection through fine-grained edits", () => {
      const carrier = seeded(factory);
      carrier.applyChange({
        payloads: [
          {
            kind: "insert-text",
            inlineContentId: textId,
            offset: 2,
            text: "X",
            origin: imported,
          },
        ],
      });

      expect(carrier.snapshot().payloads.get(textId)).toEqual({
        kind: "text",
        mediaType: "text/plain",
        text: "alXpha",
        spans: [
          { text: "al", origin: human },
          { text: "X", origin: imported },
          { text: "pha", origin: human },
        ],
      });
    });

    it("preserves edge-case text exactly or rejects the whole mixed change atomically", () => {
      const loneSurrogate = String.fromCharCode(0xd800);
      const cases: readonly IntegratedPayloadChange[] = [
        {
          kind: "replace-text",
          inlineContentId: textId,
          mediaType: "text/plain",
          text: loneSurrogate,
          origin: human,
        },
        {
          kind: "insert-text",
          inlineContentId: textId,
          offset: 5,
          text: loneSurrogate,
          origin: human,
        },
      ];

      for (const payload of cases) {
        const carrier = seeded(factory);
        const before = carrier.snapshot();
        let failed = false;
        try {
          carrier.applyChange({
            placements: [{ blockId: blockA, placement: position(2, 1) }],
            payloads: [payload],
          });
        } catch {
          failed = true;
        }

        if (failed) {
          expect(carrier.snapshot()).toEqual(before);
          continue;
        }

        expect(carrier.snapshot().placements.get(blockA)).toEqual(
          position(2, 1),
        );
        expect(text(carrier)).toBe(
          payload.kind === "replace-text"
            ? loneSurrogate
            : `alpha${loneSurrogate}`,
        );
      }
    });

    it("converges replicas from one encoded genesis and active reopens", () => {
      const base = seeded(factory);
      const left = factory.load(base.encode());
      const right = factory.load(base.encode());
      left.applyChange({
        payloads: [
          {
            kind: "insert-text",
            inlineContentId: textId,
            offset: 5,
            text: "-left",
            origin: human,
          },
        ],
      });
      right.applyChange({
        placements: [{ blockId: blockA, placement: position(3, 1) }],
      });
      const leftState = left.encode();
      const rightState = right.encode();
      left.mergeEncoded(rightState);
      right.mergeEncoded(leftState);
      expect(right.snapshot()).toEqual(left.snapshot());

      const reopened = left.encode();
      const reopenedLeft = factory.load(reopened);
      const reopenedRight = factory.load(reopened);
      reopenedLeft.applyChange({
        payloads: [
          {
            kind: "insert-text",
            inlineContentId: textId,
            offset: text(reopenedLeft).length,
            text: "-reopened-left",
            origin: human,
          },
        ],
      });
      reopenedRight.applyChange({
        placements: [{ blockId: blockA, placement: position(4, 1) }],
      });
      const reopenedLeftState = reopenedLeft.encode();
      const reopenedRightState = reopenedRight.encode();
      reopenedLeft.mergeEncoded(reopenedRightState);
      reopenedRight.mergeEncoded(reopenedLeftState);

      expect(reopenedRight.snapshot()).toEqual(reopenedLeft.snapshot());
      expect(factory.load(reopenedLeft.encode()).snapshot()).toEqual(
        reopenedLeft.snapshot(),
      );
    });

    it("rejects the same root from a different replica lineage", () => {
      const carrier = seeded(factory);
      const before = carrier.snapshot();
      const encoded = factory.create(rootId).encode();
      expect(() => carrier.mergeEncoded(encoded)).toThrow(/replica lineage/u);
      expect(carrier.snapshot()).toEqual(before);
    });

    it("rejects a foreign root before mutating a live replica", () => {
      const carrier = seeded(factory);
      const before = carrier.snapshot();
      const encoded = factory.create(otherRootId).encode();
      expect(() => carrier.mergeEncoded(encoded)).toThrow(/root identity/u);
      expect(carrier.snapshot()).toEqual(before);
    });
  });
}

describe("automerge integrated Origin validation", () => {
  const factory = createAutomergeIntegratedDocumentCarrierFactory(
    localDensePositionAllocator,
    localDensePositionAllocator,
  );

  it("rejects text that lacks complete Origin attribution", () => {
    const encoded = Automerge.save(
      Automerge.from({
        rootId,
        lineageId: "origin-validation-fixture",
        blocks: {},
        liveness: {},
        inlineContentOwners: { [textId]: rootId },
        payloads: {
          [textId]: {
            kind: "text" as const,
            mediaType: "text/plain",
            text: "unattributed",
          },
        },
      }),
    );

    expect(() => factory.load(encoded).snapshot()).toThrow(/missing Origin/u);
  });

  it("rejects invalid Origin input before publishing a mixed change", () => {
    const carrier = seeded(factory);
    const before = carrier.snapshot();
    const invalidOrigin = { id: "invalid", kind: "invalid" } as never;

    for (const payload of [
      {
        kind: "replace-text" as const,
        inlineContentId: textId,
        mediaType: "text/plain",
        text: "replacement",
        origin: invalidOrigin,
      },
      {
        kind: "insert-text" as const,
        inlineContentId: textId,
        offset: 0,
        text: "inserted",
        origin: invalidOrigin,
      },
      {
        kind: "replace-opaque" as const,
        inlineContentId: opaqueId,
        mediaType: "application/example",
        bytes: Uint8Array.of(1),
        origin: invalidOrigin,
      },
    ]) {
      expect(() =>
        carrier.applyChange({
          placements: [{ blockId: blockA, placement: position(2, 1) }],
          payloads: [payload],
        }),
      ).toThrow(/Origin is invalid/u);
      expect(carrier.snapshot()).toEqual(before);
    }
  });

  it("serializes validated Origin fields instead of caller serialization hooks", () => {
    const carrier = seeded(factory);
    const origin = {
      id: "canonical-origin",
      kind: "automation" as const,
      toJSON: () => ({ id: "rewritten", kind: "ai" }),
    };

    carrier.applyChange({
      payloads: [
        {
          kind: "replace-text",
          inlineContentId: textId,
          mediaType: "text/plain",
          text: "replacement",
          origin,
        },
        {
          kind: "insert-text",
          inlineContentId: textId,
          offset: 11,
          text: "!",
          origin,
        },
        {
          kind: "replace-opaque",
          inlineContentId: opaqueId,
          mediaType: "application/example",
          bytes: Uint8Array.of(1),
          origin,
        },
      ],
    });

    const textPayload = carrier.snapshot().payloads.get(textId);
    expect(textPayload).toMatchObject({
      kind: "text",
      text: "replacement!",
      spans: [{ origin: { id: "canonical-origin", kind: "automation" } }],
    });
    expect(carrier.snapshot().payloads.get(opaqueId)).toMatchObject({
      kind: "opaque",
      origin: { id: "canonical-origin", kind: "automation" },
    });
  });

  it("captures stateful Origin fields once before serialization", () => {
    const carrier = seeded(factory);
    let kindReads = 0;
    const origin = {
      id: "canonical-origin",
      get kind(): "automation" {
        kindReads += 1;
        return kindReads === 1 ? "automation" : ("invalid" as never);
      },
    };

    carrier.applyChange({
      payloads: [
        {
          kind: "replace-text",
          inlineContentId: textId,
          mediaType: "text/plain",
          text: "replacement",
          origin,
        },
      ],
    });

    expect(carrier.snapshot().payloads.get(textId)).toMatchObject({
      kind: "text",
      spans: [{ origin: { id: "canonical-origin", kind: "automation" } }],
    });
  });

  it("rolls back draft mutations when a later placement encoding fails", () => {
    const throwingFactory = createAutomergeIntegratedDocumentCarrierFactory(
      {
        encode(value: LocalDensePosition): string {
          if (
            localDensePositionAllocator.compare(
              value,
              position(2, 1).position,
            ) === 0
          )
            throw new TypeError("Position encode failed.");
          return localDensePositionAllocator.encode(value);
        },
        decode(value: string): LocalDensePosition {
          return localDensePositionAllocator.decode(value);
        },
      },
      localDensePositionAllocator,
    );
    const carrier = seeded(throwingFactory);
    const before = carrier.snapshot();

    expect(() =>
      carrier.applyChange({
        placements: [
          { blockId: blockA, placement: position(3, 1) },
          { blockId: blockB, placement: position(2, 1) },
        ],
      }),
    ).toThrow(/Position encode failed/u);
    expect(carrier.snapshot()).toEqual(before);
    expect(throwingFactory.load(carrier.encode()).snapshot()).toEqual(before);
  });
});

describe("yjs integrated transaction preflight", () => {
  const factory = createYjsIntegratedDocumentCarrierFactory(
    localDensePositionAllocator,
    localDensePositionAllocator,
  );

  it("authors repeated local changes with one native client identity", () => {
    const carrier = factory.create(rootId);
    carrier.applyChange({
      placements: [{ blockId: blockA, placement: position(1, 1) }],
    });
    carrier.applyChange({
      inlineContents: [{ inlineContentId: textId, blockId: blockA }],
      payloads: [
        {
          kind: "replace-text",
          inlineContentId: textId,
          mediaType: "text/plain",
          text: "alpha",
          origin: human,
        },
      ],
    });
    carrier.applyChange({
      payloads: [
        {
          kind: "insert-text",
          inlineContentId: textId,
          offset: 5,
          text: "!",
          origin: imported,
        },
      ],
    });

    const encoded = carrier.encode();
    const nativeUpdate = encoded.subarray(rootId.length + 1);
    const stateVector = Y.decodeStateVector(
      Y.encodeStateVectorFromUpdate(nativeUpdate),
    );
    expect(stateVector.size).toBe(1);
  });

  it("authors repeated reopened changes with one new native client identity", () => {
    const original = seeded(factory);
    const reopened = factory.load(original.encode());
    const baseline = yjsStateVectorSize(reopened.encode());
    reopened.applyChange({
      payloads: [
        {
          kind: "insert-text",
          inlineContentId: textId,
          offset: 5,
          text: "!",
          origin: imported,
        },
      ],
    });
    reopened.applyChange({
      placements: [{ blockId: blockA, placement: position(2, 1) }],
    });

    expect(yjsStateVectorSize(reopened.encode())).toBe(baseline + 1);
  });

  it("rejects Origin preparation failure before mutating structure", () => {
    const carrier = seeded(factory);
    const before = carrier.snapshot();
    const throwingOrigin = {
      get id(): string {
        throw new TypeError("Origin access failed.");
      },
      kind: "human" as const,
    };

    expect(() =>
      carrier.applyChange({
        placements: [{ blockId: blockA, placement: position(2, 1) }],
        payloads: [
          {
            kind: "replace-opaque",
            inlineContentId: opaqueId,
            mediaType: "application/example",
            bytes: Uint8Array.of(1, 2, 3),
            origin: throwingOrigin,
          },
        ],
      }),
    ).toThrow(/Origin access failed/u);
    expect(carrier.snapshot()).toEqual(before);
  });

  it("rejects a mixed-Origin surrogate-crossing splice before mutation", () => {
    const carrier = seeded(factory);
    carrier.applyChange({
      payloads: [
        {
          kind: "replace-text",
          inlineContentId: textId,
          mediaType: "text/plain",
          text: "😀",
          origin: human,
        },
        {
          kind: "insert-text",
          inlineContentId: textId,
          offset: 2,
          text: "😀",
          origin: imported,
        },
      ],
    });
    const before = carrier.snapshot();
    const encodedBefore = carrier.encode();

    expect(() =>
      carrier.applyChange({
        placements: [{ blockId: blockB, placement: position(2, 1) }],
        payloads: [
          {
            kind: "delete-text",
            inlineContentId: textId,
            start: 1,
            end: 3,
          },
        ],
      }),
    ).toThrow(/cannot preserve/u);
    expect(carrier.snapshot()).toEqual(before);
    expect(carrier.encode()).toEqual(encodedBefore);
  });

  it("detaches opaque input before the live transaction", () => {
    class SliceThrowsOnSecondCall extends Uint8Array {
      private calls = 0;

      public override slice(
        start?: number,
        end?: number,
      ): Uint8Array<ArrayBuffer> {
        this.calls += 1;
        if (this.calls === 2) throw new TypeError("Second slice failed.");
        return super.slice(start, end);
      }
    }

    const carrier = seeded(factory);
    const bytes = new SliceThrowsOnSecondCall([1, 2, 3]);
    carrier.applyChange({
      placements: [{ blockId: blockB, placement: position(2, 1) }],
      payloads: [
        {
          kind: "replace-opaque",
          inlineContentId: opaqueId,
          mediaType: "application/example",
          bytes,
          origin: imported,
        },
      ],
    });

    expect(carrier.snapshot().placements.get(blockB)).toEqual(position(2, 1));
    expect(carrier.snapshot().payloads.get(opaqueId)).toMatchObject({
      kind: "opaque",
      bytes: Uint8Array.of(1, 2, 3),
    });
  });
});

describe("yjs integrated root identity", () => {
  const factory = createYjsIntegratedDocumentCarrierFactory(
    localDensePositionAllocator,
    localDensePositionAllocator,
  );

  it("rejects encoded state whose envelope disagrees with native state", () => {
    const encoded = factory.create(otherRootId).encode();
    overwriteEnvelopeRoot(encoded, rootId);
    expect(() => factory.load(encoded)).toThrow(/root identity is invalid/u);
  });

  it("rejects a mismatched native root before mutating a live replica", () => {
    const carrier = seeded(factory);
    const before = carrier.snapshot();
    const encoded = factory.create(otherRootId).encode();
    overwriteEnvelopeRoot(encoded, rootId);
    expect(() => carrier.mergeEncoded(encoded)).toThrow(
      /root identity is invalid/u,
    );
    expect(carrier.snapshot()).toEqual(before);
  });
});

function seeded(factory: IntegratedDocumentCarrierFactory<LocalDensePosition>) {
  const carrier = factory.create(rootId);
  carrier.applyChange({
    placements: [{ blockId: blockA, placement: position(1, 1) }],
    inlineContents: [
      { inlineContentId: textId, blockId: blockA },
      { inlineContentId: opaqueId, blockId: blockA },
    ],
    payloads: [
      {
        kind: "replace-text",
        inlineContentId: textId,
        mediaType: "text/plain",
        text: "alpha",
        origin: human,
      },
      {
        kind: "replace-opaque",
        inlineContentId: opaqueId,
        mediaType: "application/example",
        bytes: Uint8Array.of(9),
        origin: imported,
      },
    ],
  });
  return carrier;
}

const fixturePositions = allocateFixturePositions();

function allocateFixturePositions(): readonly LocalDensePosition[] {
  const result = localDensePositionAllocator.allocateRun({
    count: 4,
    context: {
      runNonce: "70000000-0000-4000-8000-000000000099",
    },
  });
  if (!result.ok) {
    throw new TypeError(
      `Integrated fixture position allocation failed: ${result.error.message}`,
    );
  }
  return result.value;
}

function position(
  order: number,
  depth: number,
): StructuralPlacement<LocalDensePosition> {
  const allocated = fixturePositions[order - 1];
  if (allocated === undefined) {
    throw new RangeError("Integrated fixture position index is invalid.");
  }
  return { position: allocated, depth };
}

function text(
  carrier: ReturnType<
    IntegratedDocumentCarrierFactory<LocalDensePosition>["create"]
  >,
): string {
  const payload = carrier.snapshot().payloads.get(textId);
  if (payload?.kind !== "text") throw new TypeError("Expected text fixture.");
  return payload.text;
}

function overwriteEnvelopeRoot(encoded: Uint8Array, replacement: string): void {
  for (let index = 0; index < replacement.length; index += 1)
    encoded[index] = replacement.charCodeAt(index);
}

function yjsStateVectorSize(encoded: Uint8Array): number {
  const nativeUpdate = encoded.subarray(rootId.length + 1);
  return Y.decodeStateVector(Y.encodeStateVectorFromUpdate(nativeUpdate)).size;
}

function converge(
  left: IntegratedDocumentCarrier<LocalDensePosition>,
  right: IntegratedDocumentCarrier<LocalDensePosition>,
): void {
  const leftEncoded = left.encode();
  const rightEncoded = right.encode();
  left.mergeEncoded(rightEncoded);
  right.mergeEncoded(leftEncoded);
}

function assertUsableSnapshot(
  snapshot: ReturnType<
    IntegratedDocumentCarrier<LocalDensePosition>["snapshot"]
  >,
): void {
  expect(snapshot.blockLiveness.get(snapshot.rootId)).toBe(true);
  for (const blockId of snapshot.placements.keys())
    expect(snapshot.blockLiveness.get(blockId)).toBe(true);
  for (const [inlineContentId, ownerId] of snapshot.inlineContentOwners) {
    if (!snapshot.placements.has(ownerId))
      throw new TypeError("Visible InlineContent owner must be live.");
    if (!snapshot.payloads.has(inlineContentId))
      throw new TypeError("Visible InlineContent must have a payload.");
  }
  expect(
    projectIntegratedSnapshot(snapshot, localDensePositionAllocator),
  ).toHaveLength(snapshot.placements.size + 1);
}

function projectIntegratedSnapshot(
  snapshot: ReturnType<
    IntegratedDocumentCarrier<LocalDensePosition>["snapshot"]
  >,
  ordering: IntegratedDocumentCarrierFactory<LocalDensePosition>["positionOrdering"],
) {
  return projectCarrierSnapshot(
    {
      rootId: snapshot.rootId,
      entries: [
        { blockId: snapshot.rootId },
        ...[...snapshot.placements].map(([blockId, placement]) => ({
          blockId,
          placement,
        })),
      ],
    },
    ordering,
  );
}
