import { expect, it, vi } from "vitest";

import {
  parseBlockId,
  parseInlineContentId,
} from "../../../src/domain/index.js";
import { mountIncrementalProseMirrorEditor } from "../editor/incrementalProsemirror.js";
import { localDensePositionAllocator } from "../structure/localDensePosition.js";
import { createAutomergeImmutableRunCarrierFactory } from "./automergeCarrier.js";

const root = parseBlockId("8e000000-0000-4000-8000-000000000001");
const target = parseInlineContentId("8e000000-0000-4000-8000-000000000002");
const original = { kind: "human", id: "original" } as const;
const editorOrigin = { kind: "human", id: "editor" } as const;
const remoteOrigin = { kind: "imported", id: "remote" } as const;

it(
  "keeps mounted immutable-run editing local across reload, inbound changes and restore",
  { timeout: 120_000 },
  () => {
    const factory = createAutomergeImmutableRunCarrierFactory(
      localDensePositionAllocator,
      localDensePositionAllocator,
      { purePositionDecoder: true },
    );
    const seeded = factory.create(root);
    seeded.applyChange({
      context: { actorId: "seed", effectId: "initial" },
      inlineContents: [{ inlineContentId: target, blockId: root }],
      payloads: [
        {
          kind: "replace-text",
          inlineContentId: target,
          mediaType: "text/plain",
          text: "abc",
          origin: original,
        },
      ],
    });
    // Reload is an explicit transition before mounting the incremental editor.
    const carrier = factory.load(seeded.encode());
    const remote = factory.load(seeded.encode());
    const token = carrier.captureHistoricalState();
    const element = document.createElement("div");
    document.body.append(element);
    let sequence = 0;
    const mounted = mountIncrementalProseMirrorEditor({
      element,
      carrier,
      inlineContentId: target,
      origin: editorOrigin,
      nextContext: () => ({
        actorId: "editor",
        effectId: `edit-${sequence++}`,
      }),
    });
    const snapshot = vi.spyOn(carrier, "snapshot");
    try {
      mounted.view.dispatch(mounted.view.state.tr.insertText("X", 1));
      expect(snapshot).not.toHaveBeenCalled();
      expect(carrier.projectEditorPayload(target)).toMatchObject({
        text: "aXbc",
        spans: [
          { text: "a", origin: original },
          { text: "X", origin: editorOrigin },
          { text: "bc", origin: original },
        ],
      });
      remote.applyChange({
        context: { actorId: "remote", effectId: "insert" },
        payloads: [
          {
            kind: "insert-text",
            inlineContentId: target,
            offset: 3,
            text: "!",
            origin: remoteOrigin,
          },
        ],
      });
      carrier.mergeEncoded(remote.encode());
      const afterMerge = carrier.encode();
      // A stale mounted gesture must fail without publishing; its rejection path
      // explicitly refreshes the binding from the merged carrier.
      expect(() =>
        mounted.view.dispatch(mounted.view.state.tr.insertText("?", 0)),
      ).toThrow(/stale/i);
      expect(carrier.encode()).toEqual(afterMerge);
      expect(carrier.projectEditorPayload(target)).toMatchObject({
        text: "aXbc!",
      });
      mounted.refresh();
      snapshot.mockClear();
      mounted.view.dispatch(mounted.view.state.tr.insertText("Y", 0));
      expect(snapshot).not.toHaveBeenCalled();
      expect(carrier.projectEditorPayload(target)).toMatchObject({
        text: "YaXbc!",
      });
      carrier.restoreHistoricalState(token, {
        actorId: "restore",
        effectId: "restore",
        source: { kind: "restore", reference: token },
      });
      mounted.refresh();
      snapshot.mockClear();
      mounted.view.dispatch(mounted.view.state.tr.insertText("Z", 3));
      expect(snapshot).not.toHaveBeenCalled();
      expect(carrier.projectEditorPayload(target)).toEqual({
        kind: "text",
        mediaType: "text/plain",
        text: "abcZ",
        spans: [
          { text: "abc", origin: original },
          { text: "Z", origin: editorOrigin },
        ],
      });
      expect(
        factory.load(carrier.encode()).projectEditorPayload(target),
      ).toEqual(carrier.projectEditorPayload(target));
    } finally {
      snapshot.mockRestore();
      mounted.unmount();
      element.remove();
    }
  },
);
