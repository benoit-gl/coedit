import { describe, expect, it } from "vitest";

import type { PayloadCarrierFactory, QualificationOrigin } from "./carrier.js";
import {
  assertTextRange,
  isQualificationFineGrainedMediaType,
} from "./carrier.js";
import { automergePayloadCarrierFactory } from "./automergePayloadCarrier.js";
import {
  readQualificationRawMedia,
  replaceQualificationRawMedia,
} from "./rawMediaBoundary.js";
import { yjsPayloadCarrierFactory } from "./yjsPayloadCarrier.js";

const human: QualificationOrigin = {
  id: "10000000-0000-4000-8000-000000000001",
  kind: "human",
};
const imported: QualificationOrigin = {
  id: "10000000-0000-4000-8000-000000000002",
  kind: "imported",
};

const factories: readonly PayloadCarrierFactory[] = [
  yjsPayloadCarrierFactory,
  automergePayloadCarrierFactory,
];

describe("qualification Media Type dispatch", () => {
  it("matches only the initial allowlist by case-insensitive type/subtype", () => {
    expect(isQualificationFineGrainedMediaType("text/plain")).toBe(true);
    expect(
      isQualificationFineGrainedMediaType(
        'Text/Markdown; charset="UTF-8"; profile=source',
      ),
    ).toBe(true);
    expect(isQualificationFineGrainedMediaType("application/json")).toBe(false);
    expect(isQualificationFineGrainedMediaType("text/html")).toBe(false);
  });

  it("accepts the fixed syntax without changing its exact spelling", () => {
    expect(
      isQualificationFineGrainedMediaType(
        'Text/Plain; charset="UTF-8"; variant=CommonMark',
      ),
    ).toBe(true);
    expect(
      isQualificationFineGrainedMediaType(
        "application/vnd.example+json; version=1",
      ),
    ).toBe(false);
  });
});

describe("qualification UTF-16 splice validation", () => {
  it("validates UTF-16 ranges without imposing Unicode splice boundaries", () => {
    expect(() => assertTextRange(0, 0, "😀")).not.toThrow();
    expect(() => assertTextRange(2, 2, "😀")).not.toThrow();
    expect(() => assertTextRange(0, 2, "😀")).not.toThrow();
    expect(() => assertTextRange(1, 1, "😀")).not.toThrow();
    expect(() => assertTextRange(0, 1, "😀")).not.toThrow();
  });
});

for (const factory of factories) {
  describe(`${factory.candidate} payload qualification`, () => {
    it("preserves exact Media Type spelling and native text", () => {
      const carrier = factory.createText('Text/Plain; charset="UTF-8"', human);
      carrier.insertText(0, "A\r\n😀é", human);

      expect(carrier.snapshot()).toEqual({
        kind: "text",
        mediaType: 'Text/Plain; charset="UTF-8"',
        text: "A\r\n😀é",
        spans: [{ text: "A\r\n😀é", origin: human }],
      });
    });

    it("rejects lossily represented splice results atomically", () => {
      const carrier = factory.createText("text/plain", human);
      carrier.insertText(0, "😀", human);
      const before = carrier.snapshot();

      expect(() => carrier.insertText(1, "X", imported)).toThrow(
        /cannot preserve/u,
      );
      expect(carrier.snapshot()).toEqual(before);

      expect(() => carrier.deleteText(0, 1)).toThrow(/cannot preserve/u);
      expect(carrier.snapshot()).toEqual(before);

      carrier.deleteText(0, 2);
      expect(carrier.snapshot()).toEqual({
        kind: "text",
        mediaType: "text/plain",
        text: "",
        spans: [],
      });
    });

    it("preserves an exact surrogate-crossing result or rejects atomically", () => {
      const carrier = factory.createText("text/plain", human);
      carrier.insertText(0, "😀😀", human);
      const before = carrier.snapshot();
      const encodedBefore = carrier.encode();

      try {
        carrier.deleteText(1, 3);
      } catch {
        expect(carrier.snapshot()).toEqual(before);
        expect(carrier.encode()).toEqual(encodedBefore);
        return;
      }

      expect(carrier.snapshot()).toEqual({
        kind: "text",
        mediaType: "text/plain",
        text: "😀",
        spans: [{ text: "😀", origin: human }],
      });
    });

    it("keeps inserted Origin separate at fine-grained boundaries", () => {
      const carrier = factory.createText("text/markdown", human);
      carrier.insertText(0, "ac", human);
      carrier.insertText(1, "b", imported);

      expect(carrier.snapshot()).toEqual({
        kind: "text",
        mediaType: "text/markdown",
        text: "abc",
        spans: [
          { text: "a", origin: human },
          { text: "b", origin: imported },
          { text: "c", origin: human },
        ],
      });
    });

    it("keeps distinct Origins with the same ID through reload and merge", () => {
      const sameIdHuman: QualificationOrigin = { id: "shared", kind: "human" };
      const sameIdAi: QualificationOrigin = { id: "shared", kind: "ai" };
      const carrier = factory.createText("text/plain", sameIdHuman);
      carrier.insertText(0, "a", sameIdHuman);
      const reopened = factory.load(carrier.encode());
      reopened.insertText(1, "b", sameIdAi);

      carrier.mergeEncoded(reopened.encode());

      expect(carrier.snapshot()).toEqual({
        kind: "text",
        mediaType: "text/plain",
        text: "ab",
        spans: [
          { text: "a", origin: sameIdHuman },
          { text: "b", origin: sameIdAi },
        ],
      });
    });

    it("serializes validated Origin fields instead of caller serialization hooks", () => {
      const origin = {
        id: "canonical-origin",
        kind: "automation" as const,
        toJSON: () => ({ id: "rewritten", kind: "ai" }),
      };
      const carrier = factory.createText("text/plain", human);
      carrier.replaceText("text/plain", "replacement", origin);
      carrier.insertText(11, "!", origin);

      expect(carrier.snapshot()).toMatchObject({
        kind: "text",
        text: "replacement!",
        spans: [{ origin: { id: "canonical-origin", kind: "automation" } }],
      });

      carrier.replaceOpaque("application/example", Uint8Array.of(1), origin);
      expect(carrier.snapshot()).toMatchObject({
        kind: "opaque",
        origin: { id: "canonical-origin", kind: "automation" },
      });
    });

    it("reloads complete candidate state without changing projection", () => {
      const carrier = factory.createText("text/plain", human);
      carrier.insertText(0, "reload", human);
      const loaded = factory.load(carrier.encode());

      expect(loaded.snapshot()).toEqual(carrier.snapshot());
    });

    it("replaces text with detached opaque bytes and payload-level Origin", () => {
      const carrier = factory.createText("text/plain", human);
      carrier.insertText(0, "discarded", human);
      const source = Uint8Array.of(0, 1, 127, 255);
      carrier.replaceOpaque(
        "application/vnd.example.binary; version=1",
        source,
        imported,
      );
      source[0] = 99;

      const first = carrier.snapshot();
      expect(first).toEqual({
        kind: "opaque",
        mediaType: "application/vnd.example.binary; version=1",
        bytes: Uint8Array.of(0, 1, 127, 255),
        origin: imported,
      });

      if (first.kind !== "opaque") {
        throw new Error("Expected opaque qualification payload.");
      }
      first.bytes[1] = 88;
      expect(carrier.snapshot()).toEqual({
        kind: "opaque",
        mediaType: "application/vnd.example.binary; version=1",
        bytes: Uint8Array.of(0, 1, 127, 255),
        origin: imported,
      });
    });

    it("returns from opaque handling only through an explicit allowlisted replacement", () => {
      const carrier = factory.createText("text/plain", human);
      carrier.replaceOpaque(
        "application/octet-stream",
        Uint8Array.of(1),
        imported,
      );
      carrier.replaceText("text/markdown; charset=UTF-8", "# title", human);

      expect(carrier.snapshot()).toEqual({
        kind: "text",
        mediaType: "text/markdown; charset=UTF-8",
        text: "# title",
        spans: [{ text: "# title", origin: human }],
      });
    });

    it("rejects malformed Media Types atomically for either replacement path", () => {
      const malformed = [
        " text/plain",
        "text/plain;",
        "text/plain;; charset=UTF-8",
        "text/plain; charset=UTF-8; CHARSET=iso-8859-1",
        "text/plain; =UTF-8",
        "text/plain extra",
        "text//plain",
      ];
      const textCarrier = factory.createText("text/plain", human);
      textCarrier.insertText(0, "before", human);
      const opaqueCarrier = factory.createText("text/plain", human);
      opaqueCarrier.replaceOpaque(
        "application/octet-stream",
        Uint8Array.of(4),
        imported,
      );
      const textBefore = textCarrier.snapshot();
      const opaqueBefore = opaqueCarrier.snapshot();

      for (const mediaType of malformed) {
        expect(() =>
          textCarrier.replaceText(mediaType, "after", imported),
        ).toThrow();
        expect(textCarrier.snapshot()).toEqual(textBefore);
        expect(() =>
          opaqueCarrier.replaceOpaque(mediaType, Uint8Array.of(9), human),
        ).toThrow();
        expect(opaqueCarrier.snapshot()).toEqual(opaqueBefore);
      }
    });

    it("rejects malformed Origins atomically before any payload mutation", () => {
      const invalidOrigin = { id: "invalid", kind: "invalid" } as never;
      const textCarrier = factory.createText("text/plain", human);
      textCarrier.insertText(0, "before", human);
      const opaqueCarrier = factory.createText("text/plain", human);
      opaqueCarrier.replaceOpaque(
        "application/octet-stream",
        Uint8Array.of(4),
        imported,
      );
      const textBefore = textCarrier.snapshot();
      const opaqueBefore = opaqueCarrier.snapshot();

      expect(() => textCarrier.insertText(0, "after", invalidOrigin)).toThrow(
        /Origin is invalid/u,
      );
      expect(textCarrier.snapshot()).toEqual(textBefore);
      expect(() => textCarrier.insertText(0, "", invalidOrigin)).toThrow(
        /Origin is invalid/u,
      );
      expect(textCarrier.snapshot()).toEqual(textBefore);
      expect(() =>
        textCarrier.replaceText("text/markdown", "after", invalidOrigin),
      ).toThrow(/Origin is invalid/u);
      expect(textCarrier.snapshot()).toEqual(textBefore);
      expect(() =>
        textCarrier.replaceText("text/markdown", "", invalidOrigin),
      ).toThrow(/Origin is invalid/u);
      expect(textCarrier.snapshot()).toEqual(textBefore);
      expect(() =>
        opaqueCarrier.replaceOpaque(
          "application/example",
          Uint8Array.of(9),
          invalidOrigin,
        ),
      ).toThrow(/Origin is invalid/u);
      expect(opaqueCarrier.snapshot()).toEqual(opaqueBefore);
    });

    it("uses the carrier-neutral representative raw media boundary", () => {
      const carrier = factory.createText("text/plain", human);
      replaceQualificationRawMedia(
        carrier,
        "text/plain; charset=UTF-8",
        Uint8Array.of(99, 97, 102, 195, 169),
        imported,
      );
      expect(readQualificationRawMedia(carrier)).toEqual(
        Uint8Array.of(99, 97, 102, 195, 169),
      );
      expect(carrier.snapshot()).toEqual({
        kind: "text",
        mediaType: "text/plain; charset=UTF-8",
        text: "café",
        spans: [{ text: "café", origin: imported }],
      });
    });

    it("rejects raw-media profile, decoding, and exact-encoding failures atomically", () => {
      const carrier = factory.createText("text/plain", human);
      carrier.insertText(0, "before", human);
      const before = carrier.snapshot();
      expect(() =>
        replaceQualificationRawMedia(
          carrier,
          "text/plain; charset=ISO-8859-1",
          Uint8Array.of(98, 97, 100),
          imported,
        ),
      ).toThrow(/profile/u);
      expect(carrier.snapshot()).toEqual(before);
      expect(() =>
        replaceQualificationRawMedia(
          carrier,
          "text/plain; charset=UTF-8",
          Uint8Array.of(0xc3, 0x28),
          imported,
        ),
      ).toThrow(/decode/u);
      expect(carrier.snapshot()).toEqual(before);

      try {
        carrier.replaceText(
          "text/plain; charset=UTF-8",
          String.fromCharCode(0xd800),
          human,
        );
      } catch {
        expect(carrier.snapshot()).toEqual(before);
        return;
      }
      const unencodable = carrier.snapshot();
      expect(() => readQualificationRawMedia(carrier)).toThrow(/exactly/u);
      expect(carrier.snapshot()).toEqual(unencodable);
    });

    it("either preserves a lone surrogate exactly or rejects atomically", () => {
      const carrier = factory.createText("text/plain", human);
      const before = carrier.snapshot();

      const loneSurrogate = String.fromCharCode(0xd800);
      let operationFailed = false;
      try {
        carrier.insertText(0, loneSurrogate, human);
      } catch {
        operationFailed = true;
      }

      if (operationFailed) {
        expect(carrier.snapshot()).toEqual(before);
        return;
      }

      const after = carrier.snapshot();
      expect(after.kind).toBe("text");
      if (after.kind === "text") {
        expect(after.text).toBe(loneSurrogate);
      }
    });

    it("rejects fine-grained mutation of opaque payloads", () => {
      const carrier = factory.createText("text/plain", human);
      carrier.replaceOpaque(
        "application/octet-stream",
        Uint8Array.of(7),
        imported,
      );

      expect(() => carrier.insertText(0, "x", human)).toThrow(/text payload/u);
      expect(() => carrier.deleteText(0, 0)).toThrow(/text payload/u);
    });
  });
}

for (const factory of factories) {
  describe(`${factory.candidate} whole-payload replacement qualification`, () => {
    it("makes a causally later complete replacement supersede its predecessor", () => {
      const first = factory.createText("text/plain", human);
      first.replaceText("text/markdown", "first", human);
      const later = factory.load(first.encode());
      later.replaceOpaque(
        "application/octet-stream",
        Uint8Array.of(2),
        imported,
      );
      first.mergeEncoded(later.encode());

      expect(first.snapshot()).toEqual(later.snapshot());
    });

    it("converges concurrent text and opaque replacements as complete branch values", () => {
      const base = factory.createText("text/plain", human);
      const textBranch = factory.load(base.encode());
      const opaqueBranch = factory.load(base.encode());
      textBranch.replaceText("Text/Markdown", "branch text", human);
      opaqueBranch.replaceOpaque(
        "application/vnd.example.binary; version=2",
        Uint8Array.of(8, 6),
        imported,
      );
      const textInput = textBranch.encode();
      const opaqueInput = opaqueBranch.encode();
      const candidates = [textBranch.snapshot(), opaqueBranch.snapshot()];
      const left = factory.load(textInput);
      const right = factory.load(opaqueInput);

      left.mergeEncoded(opaqueInput);
      right.mergeEncoded(textInput);
      left.mergeEncoded(opaqueInput);
      right.mergeEncoded(textInput);

      expect(left.snapshot()).toEqual(right.snapshot());
      expect(candidates).toContainEqual(left.snapshot());
      expect(factory.load(left.encode()).snapshot()).toEqual(left.snapshot());
    });

    it("converges opposite-delivery text replacements without hybridizing content", () => {
      const base = factory.createText("text/plain", human);
      const empty = factory.load(base.encode());
      const nonempty = factory.load(base.encode());
      empty.replaceText("text/plain", "", imported);
      nonempty.replaceText("text/markdown", "entire branch", human);
      const emptyInput = empty.encode();
      const nonemptyInput = nonempty.encode();
      const candidates = [empty.snapshot(), nonempty.snapshot()];

      empty.mergeEncoded(nonemptyInput);
      nonempty.mergeEncoded(emptyInput);

      expect(empty.snapshot()).toEqual(nonempty.snapshot());
      expect(candidates).toContainEqual(empty.snapshot());
    });

    it("converges concurrent opaque replacements as one complete opaque branch", () => {
      const base = factory.createText("text/plain", human);
      const first = factory.load(base.encode());
      const second = factory.load(base.encode());
      first.replaceOpaque("application/example-a", Uint8Array.of(1, 2), human);
      second.replaceOpaque(
        "application/example-b; version=2",
        Uint8Array.of(3, 4),
        imported,
      );
      const firstInput = first.encode();
      const secondInput = second.encode();
      const candidates = [first.snapshot(), second.snapshot()];

      first.mergeEncoded(secondInput);
      second.mergeEncoded(firstInput);

      expect(first.snapshot()).toEqual(second.snapshot());
      expect(candidates).toContainEqual(first.snapshot());
    });

    it("converges three concurrent replacements as one independently reconstructible branch", () => {
      const base = factory.createText("text/plain", human);
      const one = factory.load(base.encode());
      const two = factory.load(base.encode());
      const three = factory.load(base.encode());
      one.replaceOpaque("application/a", Uint8Array.of(1), human);
      two.replaceOpaque("application/b", Uint8Array.of(2), imported);
      three.replaceText("text/markdown", "third", human);
      const oneInput = one.encode();
      const twoInput = two.encode();
      const threeInput = three.encode();
      const candidates = [one.snapshot(), two.snapshot(), three.snapshot()];
      const replicaOne = factory.load(oneInput);
      const replicaTwo = factory.load(twoInput);
      const replicaThree = factory.load(threeInput);

      replicaOne.mergeEncoded(twoInput);
      replicaOne.mergeEncoded(threeInput);
      replicaTwo.mergeEncoded(threeInput);
      replicaTwo.mergeEncoded(oneInput);
      replicaThree.mergeEncoded(oneInput);
      replicaThree.mergeEncoded(twoInput);

      expect(replicaOne.snapshot()).toEqual(replicaTwo.snapshot());
      expect(replicaTwo.snapshot()).toEqual(replicaThree.snapshot());
      expect(candidates).toContainEqual(replicaOne.snapshot());
      expect(factory.load(replicaOne.encode()).snapshot()).toEqual(
        replicaOne.snapshot(),
      );
    });
  });
}
