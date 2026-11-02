import { describe, expect, it } from "vitest";
import { IndexedText } from "./indexedText.js";

const human = { id: "human", kind: "human" as const };
const imported = { id: "imported", kind: "imported" as const };

describe("indexed attributed text", () => {
  it("tracks sequential edits and detached localized slices", () => {
    const tree = new IndexedText([{ text: "a".repeat(700), origin: human }]);
    let reference = "a".repeat(700);
    for (let i = 0; i < 400; i++) {
      const start = (i * 73) % (reference.length + 1);
      const end = Math.min(reference.length, start + (i % 5));
      const inserted = i % 2 ? "😀" : "x";
      const previous = tree.revision;
      tree.replace(start, end, inserted, imported, previous);
      reference = reference.slice(0, start) + inserted + reference.slice(end);
      const from = Math.max(0, start - 5);
      const to = Math.min(reference.length, start + 8);
      expect(
        tree
          .read(from, to)
          .map((span) => span.text)
          .join(""),
      ).toBe(reference.slice(from, to));
      expect(tree.length).toBe(reference.length);
      expect(() => tree.replace(0, 0, "x", human, previous)).toThrow(/Stale/u);
    }
    expect(
      tree
        .read(0, tree.length)
        .map((span) => span.text)
        .join(""),
    ).toBe(reference);
  });
  it("preserves origins and rejects invalid ranges without mutation", () => {
    const tree = new IndexedText([
      { text: "ab", origin: human },
      { text: "cd", origin: imported },
    ]);
    tree.replace(1, 3, "XY", human, 0);
    expect(tree.read(0, 4)).toEqual([
      { text: "a", origin: human },
      { text: "XY", origin: human },
      { text: "d", origin: imported },
    ]);
    expect(() => tree.replace(0, 5, "z", human, 1)).toThrow(RangeError);
    expect(tree.revision).toBe(1);
  });

  it("survives repeated fragmentation at one position", () => {
    const tree = new IndexedText([{ text: "a".repeat(256), origin: human }]);
    for (let i = 0; i < 3000; i++)
      tree.replace(128, 128, "x", imported, tree.revision);
    expect(tree.length).toBe(3256);
    expect(
      tree
        .read(126, 131)
        .map((span) => span.text)
        .join(""),
    ).toBe("aaxxx");
  });
});
