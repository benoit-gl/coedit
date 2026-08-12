import { describe, expect, it } from "vitest";
import type { DocumentNode } from "./types";
import { collectActiveTags, hasTag, normalizeTag, normalizeTags } from "./tags";

const node = (id: string, tags: string[], deletedAt: string | null = null): DocumentNode => ({
  id,
  parentId: null,
  position: 0,
  tags,
  title: id,
  summary: "",
  contentHtml: "",
  yjsState: "",
  metadata: {},
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
  deletedAt,
});

describe("node tags", () => {
  it("normalizes whitespace and Unicode compatibility forms", () => {
    expect(normalizeTag("  Fullwidth Ａ   tag  ")).toBe("Fullwidth A tag");
  });

  it("deduplicates case-insensitively while preserving first spelling and order", () => {
    expect(normalizeTags(["Scene", " scene ", "Draft", ""])).toEqual(["Scene", "Draft"]);
    expect(hasTag(["Scene"], "SCENE")).toBe(true);
  });

  it("rejects unsafe or excessive values", () => {
    expect(() => normalizeTag("bad\u0000tag")).toThrow("control characters");
    expect(() => normalizeTag("x".repeat(65))).toThrow("64 characters");
    expect(() => normalizeTags(Array.from({ length: 21 }, (_, index) => `tag-${index}`))).toThrow("20 tags");
  });

  it("derives a sorted reusable vocabulary only from active nodes", () => {
    expect(collectActiveTags([
      node("one", ["Scene", "Draft"]),
      node("two", ["draft", "Character"]),
      node("deleted", ["Obsolete"], "2026-01-02T00:00:00.000Z"),
    ])).toEqual(["Character", "Draft", "Scene"]);
  });

  it("allows a document vocabulary to exceed the per-node tag limit", () => {
    const nodes = Array.from({ length: 21 }, (_, index) => node(String(index), [`tag-${index}`]));
    expect(collectActiveTags(nodes)).toHaveLength(21);
  });
});
