import { describe, expect, it } from "vitest";
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

const root = parseBlockId("84000000-0000-4000-8000-000000000001");
const content = parseInlineContentId("84000000-0000-4000-8000-000000000002");
const origin = { id: "isolation-author", kind: "human" as const };
const imported = { id: "isolation-import", kind: "imported" as const };
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

function gate() {
  let release!: () => void;
  const closed = new Promise<void>((resolve) => {
    release = resolve;
  });
  return { closed, release };
}

/** The gates model pending downstream asynchronous work, not real I/O. */
describe("experimental downstream isolation", () => {
  it("accepts local edits while persistence and replica delivery are held", async () => {
    const samples: {
      candidate: string;
      iteration: number;
      warmup: boolean;
      edit: number;
      driverToDomCheckMs: number;
      synchronousApplyMs: number;
      nextAnimationFrameMs: number;
    }[] = [];
    for (let iteration = 0; iteration < 7; iteration++) {
      const order = iteration % 2 === 0 ? factories : [...factories].reverse();
      for (const factory of order) {
        const local = factory.create(root);
        local.applyChange({
          inlineContents: [{ inlineContentId: content, blockId: root }],
          payloads: [
            {
              kind: "replace-text",
              inlineContentId: content,
              mediaType: "text/plain",
              text: "alpha",
              origin,
            },
          ],
          context: { actorId: "seed", effectId: "seed" },
        });
        const initial = local.encode();
        const remote = factory.load(initial);
        remote.applyChange({
          payloads: [
            {
              kind: "insert-text",
              inlineContentId: content,
              offset: 0,
              text: "R",
              origin,
            },
          ],
          context: { actorId: "remote", effectId: "remote-edit" },
        });
        const inbound = remote.encode();
        const inboundGate = gate();
        let received = false;
        const pendingInbound = inboundGate.closed.then(() => {
          local.mergeEncoded(inbound);
          received = true;
        });
        const persistenceGate = gate();
        const deliveryGate = gate();
        let persisted = initial;
        let writes = 0;
        let deliveries = 0;
        const tasks: Promise<void>[] = [];
        const element = document.createElement("div");
        document.body.append(element);
        let applies = 0;
        let applyMs = -1;
        const editor = mountProseMirrorEditor<LocalDensePosition>({
          element,
          inlineContentId: content,
          buffer: readEditorText(local, content),
          readCurrentBuffer: () => readEditorText(local, content),
          textPositions: {
            create: (offset, affinity) =>
              local.createStableTextPosition(content, offset, affinity),
            resolve: (position) => local.resolveStableTextPosition(position),
          },
          origin,
          pasteOrigin: imported,
          nextContext: () => ({
            actorId: "local",
            effectId: `edit-${applies}`,
          }),
          publish: (change) => {
            const start = performance.now();
            local.applyChange(change);
            applyMs = performance.now() - start;
            applies++;
          },
        });
        try {
          editor.view.dispatch(
            editor.view.state.tr.setSelection(
              TextSelection.atEnd(editor.view.state.doc),
            ),
          );
          editor.view.focus();
          for (let edit = 0; edit < 2; edit++) {
            const start = performance.now();
            await userEvent.keyboard(edit === 0 ? "X" : "Y");
            const driverToDomCheckMs = performance.now() - start;
            const expected = edit === 0 ? "alphaX" : "alphaXY";
            expect(editor.view.dom.textContent).toBe(expected);
            expect(readEditorText(local, content).text).toBe(expected);
            expect(applies).toBe(edit + 1);
            expect(applyMs).toBeGreaterThanOrEqual(0);
            const nextAnimationFrameMs = await new Promise<number>((resolve) =>
              requestAnimationFrame(() => resolve(performance.now() - start)),
            );
            // Capture each update outside the measured interval; these queued
            // callbacks intentionally cannot execute before the gates open.
            const encoded = local.encode();
            tasks.push(
              persistenceGate.closed.then(() => {
                persisted = encoded;
                writes++;
              }),
            );
            tasks.push(
              deliveryGate.closed.then(() => {
                remote.mergeEncoded(encoded);
                deliveries++;
              }),
            );
            await Promise.resolve();
            expect(writes).toBe(0);
            expect(deliveries).toBe(0);
            expect(readEditorText(remote, content).text).toBe("Ralpha");
            expect(received).toBe(false);
            samples.push({
              candidate: factory.candidate,
              iteration,
              warmup: iteration < 2,
              edit,
              driverToDomCheckMs,
              synchronousApplyMs: applyMs,
              nextAnimationFrameMs,
            });
          }
          expect(readEditorText(factory.load(persisted), content).text).toBe(
            "alpha",
          );
          persistenceGate.release();
          deliveryGate.release();
          await Promise.all(tasks);
          expect(writes).toBe(2);
          expect(deliveries).toBe(2);
          expect(readEditorText(factory.load(persisted), content).text).toBe(
            "alphaXY",
          );
          expect(readEditorText(remote, content).text).toBe("RalphaXY");
          expect(received).toBe(false);

          inboundGate.release();
          await pendingInbound;
          expect(received).toBe(true);
          expect(readEditorText(local, content).text).toBe("RalphaXY");
          expect(readEditorText(remote, content)).toEqual(
            readEditorText(local, content),
          );
        } finally {
          editor.unmount();
          element.remove();
        }
      }
    }
    console.info(
      "STEP3_DOWNSTREAM_ISOLATION_JSON=" +
        JSON.stringify({
          version: 1,
          profile: {
            warmups: 2,
            samplesPerCandidate: 5,
            editsPerSample: 2,
            alternatingCandidateOrder: true,
            initialText: "alpha",
          },
          intervals: {
            driverToDomCheckMs:
              "Before awaiting synthetic keyboard through driver resolution; DOM and model asserted afterward. Includes driver and synchronous publication, excludes queued encode and I/O.",
            synchronousApplyMs:
              "Nested synchronous carrier.applyChange interval inside editor publish callback.",
            nextAnimationFrameMs:
              "From before synthetic keyboard until a requested animation-frame callback after driver resolution. Includes driver overhead and assertions; not physical paint.",
          },
          limitations:
            "Gated in-memory callbacks simulate pending nonblocking downstream work. They do not model actual storage or network, durability, scheduler contention, asynchronous canonical publication, or physical paint. Local encoding occurs outside the timed edit. The view and carrier publish synchronously on the same browser thread.",
          userAgent: navigator.userAgent,
          samples,
        }),
    );
  }, 120000);
});
