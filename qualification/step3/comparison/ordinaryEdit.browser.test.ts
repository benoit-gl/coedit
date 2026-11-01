import { describe, expect, it, vi } from "vitest";
import { userEvent } from "@vitest/browser/context";
import { TextSelection } from "prosemirror-state";
import {
  parseBlockId,
  parseInlineContentId,
} from "../../../src/domain/index.js";
import { createYjsIntegratedDocumentCarrierFactory } from "../integrated/yjsIntegratedDocumentCarrier.js";
import { createAutomergeIntegratedDocumentCarrierFactory } from "../integrated/automergeIntegratedDocumentCarrier.js";
import {
  localDensePositionAllocator,
  type LocalDensePosition,
} from "../structure/localDensePosition.js";
import {
  mountProseMirrorEditor,
  nativeTextFromProseMirror,
} from "../editor/prosemirrorAdapter.js";
import { mountIncrementalProseMirrorEditor } from "../editor/incrementalProsemirror.js";
import { readEditorText } from "../editor/semanticText.js";
import {
  ordinarySource,
  ordinaryWork,
  resetOrdinaryWork,
} from "./ordinaryEditComparison.js";

const root = parseBlockId("8a000000-0000-4000-8000-000000000001");
const target = parseInlineContentId("8a000000-0000-4000-8000-000000000002");
const other = parseInlineContentId("8a000000-0000-4000-8000-000000000003");
const opaque = parseInlineContentId("8a000000-0000-4000-8000-000000000004");
const block = parseBlockId("8a000000-0000-4000-8000-000000000005");
const origin = { id: "ordinary-browser", kind: "human" as const };
const insertedOrigin = { id: "ordinary-browser-edit", kind: "human" as const };
const variants = ["snapshot", "targeted", "incremental"] as const;

describe("representative ordinary browser editing", () => {
  it("compares mounted bindings and separates driver, publication and projection intervals", async () => {
    const samples: Record<string, unknown>[] = [];
    const diagnostics: Record<string, unknown>[] = [];
    for (const create of [
      createYjsIntegratedDocumentCarrierFactory,
      createAutomergeIntegratedDocumentCarrierFactory,
    ]) {
      for (const units of [1024, 10000, 100000]) {
        const genesis = create(
          localDensePositionAllocator,
          localDensePositionAllocator,
        ).create(root);
        const initial = ordinarySource(units);
        genesis.applyChange({
          placements: [
            {
              blockId: block,
              placement: {
                depth: 1,
                position: { digits: [1], run: root, member: 1 },
              },
            },
          ],
          inlineContents: [
            { inlineContentId: target, blockId: root },
            { inlineContentId: other, blockId: block },
            { inlineContentId: opaque, blockId: block },
          ],
          payloads: [
            {
              kind: "replace-text",
              inlineContentId: target,
              mediaType: "text/markdown",
              text: initial,
              origin,
            },
            {
              kind: "replace-text",
              inlineContentId: other,
              mediaType: "text/plain",
              text: ordinarySource(1024),
              origin,
            },
            {
              kind: "replace-opaque",
              inlineContentId: opaque,
              mediaType: "application/octet-stream",
              bytes: new Uint8Array(4096),
              origin,
            },
          ],
        });
        const bytes = genesis.encode();
        for (let iteration = -3; iteration < 5; iteration++) {
          for (const variant of iteration % 2 === 0
            ? variants
            : [...variants].reverse()) {
            const diagnostic = iteration === -3;
            const work = ordinaryWork();
            const carrier = create(
              localDensePositionAllocator,
              localDensePositionAllocator,
              {
                ordinaryEditVariant: variant,
                editorProjectionVariant:
                  variant === "snapshot" ? "snapshot" : "targeted",
                purePositionDecoder: true,
                ...(diagnostic ? { workCounters: work } : {}),
              },
            ).load(bytes);
            const element = document.createElement("div");
            document.body.append(element);
            let effect = 0;
            const nextContext = () => ({
              actorId: "ordinary-browser",
              effectId: String(effect++),
            });
            const editor =
              variant === "incremental"
                ? mountIncrementalProseMirrorEditor({
                    element,
                    carrier,
                    inlineContentId: target,
                    origin: insertedOrigin,
                    nextContext,
                  })
                : mountProseMirrorEditor<LocalDensePosition>({
                    element,
                    inlineContentId: target,
                    buffer: readEditorText(carrier, target),
                    readCurrentBuffer: () => readEditorText(carrier, target),
                    origin: insertedOrigin,
                    pasteOrigin: { id: "paste", kind: "imported" },
                    nextContext,
                    textPositions: {
                      create: (offset, affinity) =>
                        carrier.createStableTextPosition(
                          target,
                          offset,
                          affinity,
                        ),
                      resolve: (position) =>
                        carrier.resolveStableTextPosition(position),
                    },
                    publish: (change) => carrier.applyChange(change),
                  });
            let applyMs = 0;
            let projectionMs = 0;
            let canonicalDispatchMs = 0;
            const dispatchTransaction = editor.view.props.dispatchTransaction!;
            editor.view.setProps({
              dispatchTransaction(transaction) {
                const begin = performance.now();
                dispatchTransaction.call(editor.view, transaction);
                if (transaction.docChanged)
                  canonicalDispatchMs += performance.now() - begin;
              },
            });
            const apply = carrier.applyChange.bind(carrier);
            const snapshot = carrier.projectEditorPayload.bind(carrier);
            const range = carrier.readOrdinaryTextRange.bind(carrier);
            vi.spyOn(carrier, "applyChange").mockImplementation((change) => {
              const begin = performance.now();
              try {
                apply(change);
              } finally {
                applyMs += performance.now() - begin;
              }
            });
            vi.spyOn(carrier, "projectEditorPayload").mockImplementation(
              (id) => {
                const begin = performance.now();
                try {
                  return snapshot(id);
                } finally {
                  projectionMs += performance.now() - begin;
                }
              },
            );
            vi.spyOn(carrier, "readOrdinaryTextRange").mockImplementation(
              (id, from, to) => {
                const begin = performance.now();
                try {
                  return range(id, from, to);
                } finally {
                  projectionMs += performance.now() - begin;
                }
              },
            );
            if (diagnostic) resetOrdinaryWork(work);
            let expected = initial;
            try {
              let middle = Math.floor(units / 2);
              if (
                initial.charCodeAt(middle) >= 0xdc00 &&
                initial.charCodeAt(middle) <= 0xdfff
              )
                middle--;
              for (const operation of [
                "middle-Unicode-linefeed",
                "selection-source",
                "keyboard-end",
              ] as const) {
                if (operation === "keyboard-end") {
                  editor.view.dispatch(
                    editor.view.state.tr.setSelection(
                      TextSelection.atEnd(editor.view.state.doc),
                    ),
                  );
                  editor.view.focus();
                }
                applyMs = 0;
                projectionMs = 0;
                canonicalDispatchMs = 0;
                const begin = performance.now();
                if (operation === "middle-Unicode-linefeed")
                  editor.view.dispatch(
                    editor.view.state.tr.insertText("漢😀\n", middle),
                  );
                else if (operation === "selection-source")
                  editor.view.dispatch(
                    editor.view.state.tr.insertText("**", 0, 1),
                  );
                else await userEvent.keyboard("!");
                const driverOrDispatchMs = performance.now() - begin;
                if (operation === "middle-Unicode-linefeed")
                  expected =
                    expected.slice(0, middle) +
                    "漢😀\n" +
                    expected.slice(middle);
                else if (operation === "selection-source")
                  expected = "**" + expected.slice(1);
                else expected += "!";
                if (!diagnostic && iteration >= 0)
                  samples.push({
                    candidate: carrier.candidate,
                    variant,
                    units,
                    iteration,
                    operation,
                    driverOrDispatchMs,
                    canonicalApplyMs: applyMs,
                    publicProjectionMs: projectionMs,
                    canonicalDispatchMs,
                    calibration50msExceeded: canonicalDispatchMs > 50,
                    ...("timing" in editor
                      ? { incrementalDispatch: { ...editor.timing } }
                      : {}),
                  });
              }
              const measured = diagnostic ? structuredClone(work) : undefined;
              expect(nativeTextFromProseMirror(editor.view.state.doc)).toBe(
                expected,
              );
              expect(readEditorText(carrier, target).text).toBe(expected);
              expect(carrier.effects().size).toBe(3);
              if (measured) {
                diagnostics.push({
                  candidate: carrier.candidate,
                  variant,
                  units,
                  work: measured,
                });
                if (variant === "incremental") {
                  expect(measured.snapshots).toBe(0);
                  expect(measured.placementDecodes).toBe(0);
                  expect(measured.opaqueBytes).toEqual({});
                  expect(measured.payloads).toEqual({});
                  expect(measured.livenessTokens).toEqual({});
                  expect(measured.temporaryTextUnits).toEqual({});
                  expect(measured.indexed?.rebuildUnits).toBe(0);
                  expect(measured.indexed!.readUnits).toBeLessThan(100);
                }
              }
            } finally {
              editor.unmount();
              element.remove();
              vi.restoreAllMocks();
            }
          }
        }
      }
    }
    expect(samples).toHaveLength(270);
    expect(diagnostics).toHaveLength(18);
    console.info(
      "STEP3_ORDINARY_BROWSER_JSON=" +
        JSON.stringify({
          version: 1,
          userAgent: navigator.userAgent,
          status: "complete",
          profile: {
            units: [1024, 10000, 100000],
            variants,
            warmups: 2,
            samples: 5,
            diagnosticsSeparate: true,
            text: "Unicode/Markdown source, one unrelated text and 4096-byte opaque payload in a placed Block",
            candidateOrder:
              "Yjs then Automerge; variant order alternates by iteration; shared native genesis per candidate and size",
          },
          intervals: {
            driverOrDispatchMs:
              "synthetic keyboard await or synchronous transaction dispatch, through return; includes local/model/projection/view work, not physical paint",
            canonicalDispatchMs:
              "sum of document-changing synchronous dispatch callbacks through canonical publication and view update; excludes keyboard-driver overhead; experimental 50ms calibration interval",
            canonicalApplyMs:
              "nested carrier.applyChange; includes native mutation, indexed preparation and effect work",
            publicProjectionMs:
              "public editor payload/range read calls; native internal projection inside apply is not separately observed",
            incrementalDispatch:
              "nested synchronous adapter phases; publication includes editor staging and carrier application; do not sum these with overlapping outer intervals",
          },
          samples,
          diagnostics,
          limitations: [
            "Synthetic browser input, not OS IME or physical paint.",
            "Synchronous publication is visible in the outer interval; this experiment does not claim feedback independent of a slow carrier.",
            "50ms is an experimental calibration observation only.",
            "Pure local-dense codec opt-in; no production selection.",
          ],
        }),
    );
  }, 120000);
});
