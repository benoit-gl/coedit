import { describe, expect, it } from "vitest";

import {
  parseBlockId,
  parseInlineContentId,
} from "../../../src/domain/index.js";
import { createAutomergeIntegratedDocumentCarrierFactory } from "../integrated/automergeIntegratedDocumentCarrier.js";
import type { IntegratedDocumentCarrierFactory } from "../integrated/carrier.js";
import { createYjsIntegratedDocumentCarrierFactory } from "../integrated/yjsIntegratedDocumentCarrier.js";
import { localDensePositionAllocator } from "../structure/localDensePosition.js";
import type { LocalDensePosition } from "../structure/localDensePosition.js";
import { mountProseMirrorEditor } from "./prosemirrorAdapter.js";
import { readEditorText } from "./semanticText.js";

const rootId = parseBlockId("83000000-0000-4000-8000-000000000001");
const contentId = parseInlineContentId("83000000-0000-4000-8000-000000000002");
const original = { id: "human-original", kind: "human" as const };
const editing = { id: "human-edit", kind: "human" as const };
const factories: readonly IntegratedDocumentCarrierFactory<LocalDensePosition>[] =
  [
    createYjsIntegratedDocumentCarrierFactory(
      localDensePositionAllocator,
      localDensePositionAllocator,
    ),
    createAutomergeIntegratedDocumentCarrierFactory(
      localDensePositionAllocator,
      localDensePositionAllocator,
    ),
  ];

for (const factory of factories) {
  describe(
    factory.candidate + " direct ProseMirror browser qualification",
    () => {
      it("mounts a real Chromium editor and publishes one native edit", () => {
        const carrier = factory.create(rootId);
        carrier.applyChange({
          inlineContents: [{ inlineContentId: contentId, blockId: rootId }],
          payloads: [
            {
              kind: "replace-text",
              inlineContentId: contentId,
              mediaType: "text/plain",
              text: "alpha",
              origin: original,
            },
          ],
          context: { actorId: "actor-a", effectId: "seed" },
        });
        const mount = document.createElement("div");
        document.body.append(mount);
        let effect = 0;
        const editor = mountProseMirrorEditor<LocalDensePosition>({
          element: mount,
          inlineContentId: contentId,
          buffer: readEditorText(carrier, contentId),
          origin: editing,
          nextContext: () => ({
            actorId: "actor-a",
            effectId: `browser-${effect++}`,
          }),
          publish: (change) => carrier.applyChange(change),
        });
        expect(mount.querySelector("[contenteditable='true']")).not.toBeNull();

        editor.view.dispatch(editor.view.state.tr.insertText("!", 5));
        expect(readEditorText(carrier, contentId)).toEqual({
          text: "alpha!",
          spans: [
            { text: "alpha", origin: original },
            { text: "!", origin: editing },
          ],
        });

        editor.unmount();
        expect(mount.querySelector("[contenteditable='true']")).toBeNull();
        mount.remove();
      });
    },
  );
}
