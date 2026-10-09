import * as Automerge from "@automerge/automerge";
import * as Y from "yjs";
import { describe, expect, it } from "vitest";

/**
 * Candidate-native cursors are qualification evidence, not portable Ranges.
 *
 * Insertion affinity is characterized per candidate instead of forcing an
 * application-selected uniform behavior ahead of Gate B.
 */
describe("pinned native cursor qualification", () => {
  it("keeps Yjs positions stable through insertion, encoding, and reload", () => {
    const document = new Y.Doc({ gc: true });
    const text = document.getText("content");
    text.insert(0, "ac");
    const preceding = Y.encodeRelativePosition(
      Y.createRelativePositionFromTypeIndex(text, 1, -1),
    );
    const following = Y.encodeRelativePosition(
      Y.createRelativePositionFromTypeIndex(text, 1, 0),
    );
    text.insert(1, "b");
    expect(text.toJSON()).toBe("abc");

    const resolve = (doc: Y.Doc, encoded: Uint8Array) => {
      const position = Y.createAbsolutePositionFromRelativePosition(
        Y.decodeRelativePosition(encoded),
        doc,
      );
      expect(position?.type).toBe(doc.getText("content"));
      return position?.index;
    };
    expect(resolve(document, preceding)).toBe(1);
    expect(resolve(document, following)).toBe(2);

    const reopened = new Y.Doc({ gc: true });
    Y.applyUpdate(reopened, Y.encodeStateAsUpdate(document));
    expect(resolve(reopened, preceding)).toBe(1);
    expect(resolve(reopened, following)).toBe(2);
  });

  it("characterizes pinned Automerge cursors through insertion and reload", () => {
    const original = Automerge.from({ text: "ac" });
    const before = Automerge.getCursor(original, ["text"], 1, "before");
    const after = Automerge.getCursor(original, ["text"], 1, "after");
    const changed = Automerge.change(original, (draft) => {
      Automerge.splice(draft, ["text"], 1, 0, "b");
    });
    expect(changed.text).toBe("abc");

    const beforeIndex = Automerge.getCursorPosition(changed, ["text"], before);
    const afterIndex = Automerge.getCursorPosition(changed, ["text"], after);
    // The candidate decides its insertion affinity. Characterize both values
    // without adopting them as a product Range or editor-selection policy.
    expect([1, 2]).toContain(beforeIndex);
    expect([1, 2]).toContain(afterIndex);

    const reloaded = Automerge.load<{ text: string }>(Automerge.save(changed));
    expect(Automerge.getCursorPosition(reloaded, ["text"], before)).toBe(
      beforeIndex,
    );
    expect(Automerge.getCursorPosition(reloaded, ["text"], after)).toBe(
      afterIndex,
    );
  });
});
