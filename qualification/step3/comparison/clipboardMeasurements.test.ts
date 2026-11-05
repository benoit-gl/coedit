import { describe, expect, it } from "vitest";
import {
  clipboardMeasurementCases,
  clipboardMeasurementLimits,
} from "./clipboardMeasurements.js";

describe("clipboard measurement fixture", () => {
  it("isolates boundary cases and preserves private or fallback Origin", () => {
    const cases = clipboardMeasurementCases();
    expect(cases).toHaveLength(10);
    expect(
      cases
        .filter((c) => c.name.startsWith("encoded-"))
        .map((c) => c.encodedLength),
    ).toEqual([
      clipboardMeasurementLimits.maxEncodedLength - 1,
      clipboardMeasurementLimits.maxEncodedLength,
      clipboardMeasurementLimits.maxEncodedLength + 1,
    ]);
    for (const fixture of cases) {
      const value = fixture.setup()();
      expect(value.privateOriginPreserved, fixture.name).toBe(
        fixture.expectedPrivate,
      );
      expect(value.text.length, fixture.name).toBe(fixture.textLength);
      expect(value.spans.map((span) => span.text).join(""), fixture.name).toBe(
        value.text,
      );
      expect(
        value.spans.every(
          (span) =>
            span.origin.id ===
            (fixture.expectedPrivate
              ? "benchmark-original"
              : "benchmark-imported"),
        ),
        fixture.name,
      ).toBe(true);
      expect(value.source, fixture.name).toEqual(
        fixture.expectedPrivate
          ? { kind: "copy", reference: "retained" }
          : undefined,
      );
    }
  });
});

it("preserves unknown fallback Origin for malformed private data", async () => {
  const { parseDocumentId } = await import("../../../src/domain/index.js");
  const { decodePrivateClipboard } = await import("../editor/clipboard.js");
  const origin = { id: "unknown-source", kind: "unknown" } as const;
  const result = decodePrivateClipboard(
    "{",
    "plain text",
    parseDocumentId("83000000-0000-4000-8000-000000000003"),
    new Map(),
    origin,
    clipboardMeasurementLimits,
    () => {
      throw new Error("malformed private input must not resolve a source");
    },
  );
  expect(result).toEqual({
    text: "plain text",
    spans: [{ text: "plain text", origin }],
    privateOriginPreserved: false,
  });
});
