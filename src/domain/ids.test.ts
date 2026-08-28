import { describe, expect, it } from "vitest";

import {
  isCanonicalUuidV4,
  parseBlockId,
  parseDocumentId,
  parseInlineContentId,
} from "./ids.js";

describe("durable IDs", () => {
  it("accepts one canonical lowercase UUID-v4 spelling for every branded type", () => {
    const value = "12345678-1234-4abc-8def-1234567890ab";

    expect(isCanonicalUuidV4(value)).toBe(true);
    expect(parseDocumentId(value)).toBe(value);
    expect(parseBlockId(value)).toBe(value);
    expect(parseInlineContentId(value)).toBe(value);
  });

  it("rejects non-v4, uppercase, and malformed spellings", () => {
    expect(isCanonicalUuidV4("12345678-1234-3abc-8def-1234567890ab")).toBe(
      false,
    );
    expect(isCanonicalUuidV4("12345678-1234-4ABC-8DEF-1234567890AB")).toBe(
      false,
    );
    expect(() => parseBlockId("not-a-uuid")).toThrow(TypeError);
  });
});
