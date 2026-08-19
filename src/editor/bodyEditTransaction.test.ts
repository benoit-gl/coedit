import { describe, expect, it } from "vitest";
import { classifyBodyTransaction, countGraphemeClusters } from "./bodyEditTransaction";

describe("body transaction classification", () => {
  it("counts user-visible grapheme clusters", () => {
    expect(countGraphemeClusters("abc")).toBe(3);
    expect(countGraphemeClusters("e\u0301")).toBe(1);
    expect(countGraphemeClusters("👩‍👩‍👧‍👦")).toBe(1);
    expect(countGraphemeClusters("🇨🇦")).toBe(1);
  });

  it("ignores persistence hydration and document-neutral no-ops", () => {
    expect(classifyBodyTransaction({
      origin: "persistence-load",
      docChanged: true,
      insertedText: "loaded",
    })).toEqual({ kind: "none" });
    expect(classifyBodyTransaction({ docChanged: false })).toEqual({ kind: "none" });
  });

  it("distinguishes selection-only movement from selection changes in an edit", () => {
    expect(classifyBodyTransaction({
      docChanged: false,
      selectionChanged: true,
    })).toEqual({ kind: "selection-boundary" });
    expect(classifyBodyTransaction({
      docChanged: true,
      selectionChanged: true,
      insertedText: "a",
      inputType: "insertText",
    })).toEqual({ kind: "insertion", graphemeCount: 1 });
  });

  it("classifies ordinary insertions and deletions", () => {
    expect(classifyBodyTransaction({
      docChanged: true,
      insertedText: "e\u0301🙂",
      inputType: "insertText",
    })).toEqual({ kind: "insertion", graphemeCount: 2 });
    expect(classifyBodyTransaction({
      docChanged: true,
      deletedContent: true,
      inputType: "deleteContentBackward",
    })).toEqual({ kind: "deletion" });
  });

  it.each([
    { inputType: "insertFromPaste", insertedText: "pasted" },
    { inputType: "insertFromDrop", insertedText: "dropped" },
    { inputType: "deleteByCut", deletedContent: true },
    { inputType: "historyUndo" },
    { inputType: "historyRedo" },
    { inputType: "formatBold" },
    { inputType: "insertReplacementText", insertedText: "replacement", deletedContent: true },
  ])("classifies $inputType as an atomic edit", (observation) => {
    expect(classifyBodyTransaction({ docChanged: true, ...observation })).toEqual({ kind: "atomic" });
  });

  it("defers intermediate composition updates and treats the commit atomically", () => {
    expect(classifyBodyTransaction({
      docChanged: true,
      insertedText: "に",
      inputType: "insertCompositionText",
      isComposing: true,
    })).toEqual({ kind: "composition-update" });
    expect(classifyBodyTransaction({
      docChanged: true,
      insertedText: "日本",
      inputType: "insertCompositionText",
      isComposing: false,
    })).toEqual({ kind: "atomic" });
  });

  it("keeps replacements and unknown document changes atomic", () => {
    expect(classifyBodyTransaction({
      docChanged: true,
      insertedText: "x",
      deletedContent: true,
    })).toEqual({ kind: "atomic" });
    expect(classifyBodyTransaction({ docChanged: true })).toEqual({ kind: "atomic" });
  });
});
