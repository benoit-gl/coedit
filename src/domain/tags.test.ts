import { describe, expect, it } from "vitest";

import { normalizeTags } from "./tags.js";

describe("tag normalization", () => {
  it("normalizes NFKC and whitespace and preserves the first case spelling", () => {
    const result = normalizeTags([
      "  Ｔopic   Alpha  ",
      "topic alpha",
      "",
      "Other",
    ]);

    expect(result).toEqual({ ok: true, value: ["Topic Alpha", "Other"] });
  });

  it("rejects control characters", () => {
    const result = normalizeTags(["line\nbreak"]);

    expect(result.ok).toBe(false);
  });

  it("does not impose the former finite tag capacity boundaries", () => {
    const twentyOne = Array.from({ length: 21 }, (_, index) => `tag-${index}`);
    expect(normalizeTags(twentyOne).ok).toBe(true);
    expect(normalizeTags(["a".repeat(65)]).ok).toBe(true);
    expect(normalizeTags(["😀".repeat(65)]).ok).toBe(true);
    expect(normalizeTags([`😀${"a".repeat(253)}`]).ok).toBe(true);
  });
});
