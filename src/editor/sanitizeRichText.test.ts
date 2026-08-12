import { describe, expect, it } from "vitest";
import fixtures from "../../fixtures/protocol/rich-text-v1.json";
import { RICH_TEXT_POLICY, sanitizeRichText } from "./sanitizeRichText";

describe("rich-text sanitization contract", () => {
  it("matches the versioned standalone fixtures", () => {
    expect(fixtures.policy).toBe(RICH_TEXT_POLICY);
    for (const fixture of fixtures.cases) {
      const sanitized = sanitizeRichText(fixture.input);
      expect(sanitized, fixture.name).toBe(fixture.expected);
      for (const forbidden of fixture.forbidden) {
        expect(sanitized.toLocaleLowerCase(), fixture.name).not.toContain(forbidden.toLocaleLowerCase());
      }
    }
  });

  it("is idempotent", () => {
    for (const fixture of fixtures.cases) {
      const sanitized = sanitizeRichText(fixture.input);
      expect(sanitizeRichText(sanitized), fixture.name).toBe(sanitized);
    }
  });
});
