import { describe, expect, it } from "vitest";
import { userEvent } from "@vitest/browser/context";
import { TextSelection } from "prosemirror-state";
import {
  parseBlockId,
  type InlineContentId,
} from "../../../src/domain/index.js";
import { createAutomergeIntegratedDocumentCarrierFactory } from "../integrated/automergeIntegratedDocumentCarrier.js";
import { createYjsIntegratedDocumentCarrierFactory } from "../integrated/yjsIntegratedDocumentCarrier.js";
import {
  localDensePositionAllocator,
  type LocalDensePosition,
} from "../structure/localDensePosition.js";
import { mountProseMirrorEditor } from "../editor/prosemirrorAdapter.js";
import { readEditorText } from "../editor/semanticText.js";

const root = parseBlockId("83000000-0000-4000-8000-000000000001");
const content = "83000000-0000-4000-8000-000000000002" as InlineContentId;
const original = { id: "benchmark-original", kind: "human" as const };
const editing = { id: "benchmark-edit", kind: "human" as const };
const imported = { id: "benchmark-import", kind: "imported" as const };
const factories = [
  createYjsIntegratedDocumentCarrierFactory(
    localDensePositionAllocator,
    localDensePositionAllocator,
  ),
  createAutomergeIntegratedDocumentCarrierFactory(
    localDensePositionAllocator,
    localDensePositionAllocator,
  ),
];

// One fresh mounted document per observation; setup, selection, focus and validation
// are outside both measured intervals. userEvent is a browser driver simulation.
describe("experimental browser editor feedback", () => {
  it("records paired raw samples without a performance threshold", async () => {
    const samples: {
      candidate: string;
      iteration: number;
      warmup: boolean;
      driverToDomCheckMs: number;
      synchronousApplyMs: number;
    }[] = [];
    for (let iteration = 0; iteration < 7; iteration++) {
      const order = iteration % 2 === 0 ? factories : [...factories].reverse();
      for (const factory of order) {
        const carrier = factory.create(root);
        const initial = "a".repeat(1024);
        carrier.applyChange({
          inlineContents: [{ inlineContentId: content, blockId: root }],
          payloads: [
            {
              kind: "replace-text",
              inlineContentId: content,
              mediaType: "text/plain",
              text: initial,
              origin: original,
            },
          ],
          context: { actorId: "benchmark", effectId: "seed" },
        });
        const element = document.createElement("div");
        document.body.append(element);
        let applyMs = -1;
        let publications = 0;
        const editor = mountProseMirrorEditor<LocalDensePosition>({
          element,
          inlineContentId: content,
          buffer: readEditorText(carrier, content),
          readCurrentBuffer: () => readEditorText(carrier, content),
          textPositions: {
            create: (offset, affinity) =>
              carrier.createStableTextPosition(content, offset, affinity),
            resolve: (position) => carrier.resolveStableTextPosition(position),
          },
          origin: editing,
          pasteOrigin: imported,
          nextContext: () => ({ actorId: "benchmark", effectId: "edit" }),
          publish: (change) => {
            const start = performance.now();
            carrier.applyChange(change);
            applyMs = performance.now() - start;
            publications++;
          },
        });
        try {
          editor.view.dispatch(
            editor.view.state.tr.setSelection(
              TextSelection.atEnd(editor.view.state.doc),
            ),
          );
          editor.view.focus();
          const start = performance.now();
          await userEvent.keyboard("!");
          const driverToDomCheckMs = performance.now() - start;
          expect(editor.view.dom.textContent).toBe(initial + "!");
          expect(readEditorText(carrier, content).text).toBe(initial + "!");
          expect(publications).toBe(1);
          expect(applyMs).toBeGreaterThanOrEqual(0);
          samples.push({
            candidate: factory.candidate,
            iteration,
            warmup: iteration < 2,
            driverToDomCheckMs,
            synchronousApplyMs: applyMs,
          });
        } finally {
          editor.unmount();
          element.remove();
        }
      }
    }
    // One line survives ordinary Vitest stdout capture; do not treat it as a
    // committed evidence record until the external runner adds revision/host.
    console.info(
      "STEP3_EDITOR_FEEDBACK_JSON=" +
        JSON.stringify({
          version: 1,
          profile: {
            text: "1024 repeated ASCII a",
            edit: "append !",
            warmups: 2,
            samplesPerCandidate: 5,
            freshFixturePerSample: true,
            alternatingOrder: true,
          },
          intervals: {
            driverToDomCheckMs:
              "performance.now immediately before awaiting userEvent.keyboard through its resolution; DOM asserted immediately afterward; includes driver overhead and synchronous adapter/model work, not paint",
            synchronousApplyMs:
              "performance.now around carrier.applyChange inside synchronous adapter publish callback; nested in driver interval",
          },
          userAgent: navigator.userAgent,
          samples,
        }),
    );
  }, 120000);
});
