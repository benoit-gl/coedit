import { describe, expect, it } from "vitest";

import type { PayloadCarrierFactory, QualificationOrigin } from "./carrier.js";
import { isQualificationFineGrainedMediaType } from "./carrier.js";
import { automergePayloadCarrierFactory } from "./automergePayloadCarrier.js";
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
