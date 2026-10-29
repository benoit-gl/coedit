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
