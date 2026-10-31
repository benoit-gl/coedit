import { describe, expect, it, vi } from "vitest";
import { userEvent } from "@vitest/browser/context";
import { TextSelection } from "prosemirror-state";
import {
  parseBlockId,
  parseInlineContentId,
} from "../../../src/domain/index.js";
import { createAutomergeIntegratedDocumentCarrierFactory } from "../integrated/automergeIntegratedDocumentCarrier.js";
import { createYjsIntegratedDocumentCarrierFactory } from "../integrated/yjsIntegratedDocumentCarrier.js";
import {
  localDensePositionAllocator,
  type LocalDensePosition,
} from "../structure/localDensePosition.js";
import { mountProseMirrorEditor } from "../editor/prosemirrorAdapter.js";
import { readEditorText } from "../editor/semanticText.js";

const root = parseBlockId("88000000-0000-4000-8000-000000000001");
const target = parseInlineContentId("88000000-0000-4000-8000-000000000002");
const blockId = (i: number) =>
  parseBlockId(`88000001-0000-4000-8000-${String(i).padStart(12, "0")}`);
const contentId = (i: number) =>
  parseInlineContentId(
    `88000002-0000-4000-8000-${String(i).padStart(12, "0")}`,
  );
const origin = { id: "browser-traversal", kind: "human" as const };
const imported = { id: "browser-import", kind: "imported" as const };

for (const createFactory of [
  createYjsIntegratedDocumentCarrierFactory,
  createAutomergeIntegratedDocumentCarrierFactory,
]) {
  for (const variant of ["snapshot", "targeted"] as const) {
    describe(`${createFactory.name} ${variant} browser traversal`, () => {
      it.each([0, 4])(
        "observes an actual synthetic keystroke with %i unrelated payloads",
        async (count) => {
          let decodes = 0;
          const codec = {
            ...localDensePositionAllocator,
            decode(encoded: string) {
              decodes++;
              return localDensePositionAllocator.decode(encoded);
            },
          };
          const carrier = createFactory(codec, localDensePositionAllocator, {
            ordinaryEditVariant: variant,
            purePositionDecoder: true,
          }).create(root);
          carrier.applyChange({
            placements: Array.from({ length: count }, (_, i) => ({
              blockId: blockId(i + 1),
              placement: {
                depth: 1,
                position: { digits: [i + 1], run: root, member: i + 1 },
              },
            })),
            inlineContents: [
              { inlineContentId: target, blockId: root },
              ...Array.from({ length: count }, (_, i) => ({
                inlineContentId: contentId(i + 1),
                blockId: blockId(i + 1),
              })),
            ],
            payloads: [
              {
                kind: "replace-text",
                inlineContentId: target,
                mediaType: "text/plain",
                text: "abc",
                origin,
              },
              ...Array.from({ length: count }, (_, i) =>
                i % 2 === 0
                  ? {
                      kind: "replace-text" as const,
                      inlineContentId: contentId(i + 1),
                      mediaType: "text/plain",
                      text: "unrelated",
                      origin,
                    }
                  : {
                      kind: "replace-opaque" as const,
                      inlineContentId: contentId(i + 1),
                      mediaType: "application/octet-stream",
                      bytes: Uint8Array.of(1, 2),
                      origin,
                    },
              ),
            ],
          });
          const initial = readEditorText(carrier, target);
          const originalSnapshot = carrier.snapshot.bind(carrier);
          let phase = "other";
          const snapshots: {
            phase: string;
            payloads: number;
            placements: number;
          }[] = [];
          vi.spyOn(carrier, "snapshot").mockImplementation(() => {
            const snapshot = originalSnapshot();
            snapshots.push({
              phase,
              payloads: snapshot.payloads.size,
              placements: snapshot.placements.size,
            });
            return snapshot;
          });
          const element = document.createElement("div");
          document.body.append(element);
          const editor = mountProseMirrorEditor<LocalDensePosition>({
            element,
            inlineContentId: target,
            buffer: initial,
            readCurrentBuffer: () => {
              phase = "read";
              try {
                return readEditorText(carrier, target);
              } finally {
                phase = "other";
              }
            },
            textPositions: {
              create: (offset, affinity) => {
                phase = "position";
                try {
                  return carrier.createStableTextPosition(
                    target,
                    offset,
                    affinity,
                  );
                } finally {
                  phase = "other";
                }
              },
              resolve: (position) =>
                carrier.resolveStableTextPosition(position),
            },
            origin,
            pasteOrigin: imported,
            nextContext: () => ({ actorId: "traversal", effectId: "edit" }),
            publish: (change) => {
              phase = "publish";
              try {
                carrier.applyChange(change);
              } finally {
                phase = "other";
              }
            },
          });
          try {
            editor.view.dispatch(
              editor.view.state.tr.setSelection(
                TextSelection.atEnd(editor.view.state.doc),
              ),
            );
            editor.view.focus();
            snapshots.length = 0;
            decodes = 0;
            await userEvent.keyboard("X");
            const editDecodes = decodes;
            expect(editor.view.dom.textContent).toBe("abcX");
            expect(
              snapshots.every(
                (s) => s.payloads === count + 1 && s.placements === count,
              ),
            ).toBe(true);
            // Persist the observed route and fixture shape in the browser report.
            console.info(
              "STEP3_EDITOR_TRAVERSAL_JSON=" +
                JSON.stringify({
                  candidate: carrier.candidate,
                  userAgent: navigator.userAgent,
                  variant,
                  unrelatedBlocks: count,
                  unrelatedPayloads: count,
                  decoderCalls: editDecodes,
                  snapshots,
                }),
            );
            expect(readEditorText(carrier, target).text).toBe("abcX");
          } finally {
            editor.unmount();
            element.remove();
          }
        },
      );
    });
  }
}
