import { expect, it } from "vitest";
import { TextSelection } from "prosemirror-state";
import {
  parseBlockId,
  parseInlineContentId,
} from "../../../src/domain/index.js";
import { createYjsIntegratedDocumentCarrierFactory } from "../integrated/yjsIntegratedDocumentCarrier.js";
import { createAutomergeIntegratedDocumentCarrierFactory } from "../integrated/automergeIntegratedDocumentCarrier.js";
import { localDensePositionAllocator } from "../structure/localDensePosition.js";
import { mountIncrementalProseMirrorEditor } from "./incrementalProsemirror.js";

const root = parseBlockId("8c000000-0000-4000-8000-000000000001");
const target = parseInlineContentId("8c000000-0000-4000-8000-000000000002");
const origin = { id: "editor", kind: "human" as const };

for (const create of [
  createYjsIntegratedDocumentCarrierFactory,
  createAutomergeIntegratedDocumentCarrierFactory,
]) {
  it(`${create.name} retains the mounted state after a rejected publication`, () => {
    const carrier = create(
      localDensePositionAllocator,
      localDensePositionAllocator,
      {
        ordinaryEditVariant: "incremental",
        purePositionDecoder: true,
      },
    ).create(root);
    carrier.applyChange({
      inlineContents: [{ inlineContentId: target, blockId: root }],
      payloads: [
        {
          kind: "replace-text",
          inlineContentId: target,
          mediaType: "text/plain",
          text: "abc",
          origin,
        },
      ],
    });
    const element = document.createElement("div");
    document.body.append(element);
    const mounted = mountIncrementalProseMirrorEditor({
      element,
      carrier,
      inlineContentId: target,
      origin,
      nextContext: () => ({ actorId: "editor", effectId: "same" }),
    });
    try {
      mounted.view.dispatch(mounted.view.state.tr.insertText("x", 1));
      mounted.view.dispatch(
        mounted.view.state.tr.setSelection(
          TextSelection.create(mounted.view.state.doc, 2),
        ),
      );
      const before = mounted.view.state;
      const encoded = carrier.encode();
      expect(() =>
        mounted.view.dispatch(before.tr.insertText("!", 2)),
      ).toThrow();
      expect(mounted.view.state).toBe(before);
      expect(carrier.encode()).toEqual(encoded);
    } finally {
      mounted.unmount();
      element.remove();
    }
  });
}
