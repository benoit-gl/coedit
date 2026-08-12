import { describe, expect, it } from "vitest";
import { LOCAL_CONTRIBUTOR_KEY, loadLocalContributor } from "./localContributor";

function storageWith(value: string | null): Pick<Storage, "getItem"> {
  return { getItem: (key) => key === LOCAL_CONTRIBUTOR_KEY ? value : null };
}

describe("loadLocalContributor", () => {
  it("accepts a structurally valid stored contributor", () => {
    const contributor = {
      id: "author",
      displayName: "Author",
      kind: "human",
      createdAt: "2026-01-01T00:00:00.000Z",
    };
    expect(loadLocalContributor(storageWith(JSON.stringify(contributor)))).toEqual(contributor);
  });

  it.each([
    "not json",
    "null",
    JSON.stringify({ id: "author" }),
    JSON.stringify({ id: "", displayName: "Author", kind: "human", createdAt: "2026-01-01T00:00:00.000Z" }),
    JSON.stringify({ id: "author", displayName: "", kind: "human", createdAt: "2026-01-01T00:00:00.000Z" }),
    JSON.stringify({ id: "author", displayName: "Author", kind: "unknown", createdAt: "2026-01-01T00:00:00.000Z" }),
    JSON.stringify({ id: "author", displayName: "Author", kind: "human", createdAt: "not-a-date" }),
  ])("falls back safely for invalid stored data: %s", (stored) => {
    const contributor = loadLocalContributor(storageWith(stored));
    expect(contributor).toMatchObject({ displayName: "Local author", kind: "human" });
    expect(contributor.id).not.toBe("");
    expect(Number.isFinite(Date.parse(contributor.createdAt))).toBe(true);
  });

  it("falls back when storage is unavailable", () => {
    const contributor = loadLocalContributor({ getItem: () => { throw new Error("blocked"); } });
    expect(contributor.displayName).toBe("Local author");
  });
});
