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
import {
  mountProseMirrorEditor,
  nativeTextFromProseMirror,
  qualificationProseMirrorSchema,
} from "../editor/prosemirrorAdapter.js";
import { readEditorText } from "../editor/semanticText.js";

const root = parseBlockId("84000000-0000-4000-8000-000000000001");
const firstBlock = parseBlockId("84000000-0000-4000-8000-000000000002");
const secondBlock = parseBlockId("84000000-0000-4000-8000-000000000003");
const content = parseInlineContentId("84000000-0000-4000-8000-000000000004");
const other = parseInlineContentId("84000000-0000-4000-8000-000000000005");
const third = parseInlineContentId("84000000-0000-4000-8000-000000000006");
const original = { id: "workload-original", kind: "human" as const };
const editing = { id: "workload-edit", kind: "human" as const };
const imported = { id: "workload-import", kind: "imported" as const };
const initial = "alpha😀*beta";
const factories = [
  createYjsIntegratedDocumentCarrierFactory(
    localDensePositionAllocator,
    localDensePositionAllocator,
    { purePositionDecoder: true },
  ),
  createAutomergeIntegratedDocumentCarrierFactory(
    localDensePositionAllocator,
    localDensePositionAllocator,
    { purePositionDecoder: true },
  ),
];

// Explicit offsets are UTF-16 positions in this flat InlineContent schema.
const cases = [
  {
    name: "insert-start",
    from: 0,
    to: 0,
    action: "keyboard",
    input: "X",
    expected: "X" + initial,
  },
  {
    name: "insert-middle",
    from: 5,
    to: 5,
    action: "keyboard",
    input: "X",
    expected: "alphaX😀*beta",
  },
  {
    name: "insert-end",
    from: initial.length,
    to: initial.length,
    action: "keyboard",
    input: "X",
    expected: initial + "X",
  },
  {
    name: "backspace",
    from: 5,
    to: 5,
    action: "keyboard",
    input: "{Backspace}",
    expected: "alph😀*beta",
  },
  {
    name: "delete-forward",
    from: 0,
    to: 0,
    action: "keyboard",
    input: "{Delete}",
    expected: "lpha😀*beta",
  },
  {
    name: "selection-replacement",
    from: 0,
    to: 5,
    action: "keyboard",
    input: "Z",
    expected: "Z😀*beta",
  },
  {
    name: "markdown-source",
    from: 0,
    to: 0,
    action: "keyboard",
    input: "*",
    expected: "*" + initial,
  },
  {
    name: "unicode-transaction",
    from: 7,
    to: 7,
    action: "unicode",
    input: "é",
    expected: "alpha😀é*beta",
  },
  {
    name: "line-feed-transaction",
    from: 5,
    to: 5,
    action: "linefeed",
    input: "\n",
    expected: "alpha\n😀*beta",
  },
] as const;

describe("representative experimental browser edit workloads", () => {
  it("captures paired cases in a multi-Block multi-InlineContent fixture", async () => {
    const samples: {
      case: string;
      candidate: string;
      iteration: number;
      warmup: boolean;
      sequence: number;
      actionMs: number;
      synchronousApplyMs: number;
    }[] = [];
    let sequence = 0;
    for (const fixture of cases) {
      for (let iteration = 0; iteration < 7; iteration++) {
        const order = iteration % 2 ? [...factories].reverse() : factories;
        for (const factory of order) {
          const carrier = factory.create(root);
          carrier.applyChange({
            placements: [firstBlock, secondBlock].map((blockId, i) => ({
              blockId,
              placement: {
                depth: 1,
                position: { digits: [i + 1], run: root, member: i + 1 },
              },
            })),
            inlineContents: [
              { inlineContentId: content, blockId: firstBlock },
              { inlineContentId: other, blockId: firstBlock },
              { inlineContentId: third, blockId: secondBlock },
            ],
            payloads: [content, other, third].map((inlineContentId) => ({
              kind: "replace-text" as const,
              inlineContentId,
              mediaType: "text/plain",
              text: inlineContentId === content ? initial : "unrelated text",
              origin: original,
            })),
            context: { actorId: "workload", effectId: "seed" },
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
              resolve: (position) =>
                carrier.resolveStableTextPosition(position),
            },
            origin: editing,
            pasteOrigin: imported,
            nextContext: () => ({ actorId: "workload", effectId: "edit" }),
            publish: (change) => {
              const start = performance.now();
              carrier.applyChange(change);
              applyMs = performance.now() - start;
              publications++;
            },
          });
          try {
            editor.view.focus();
            editor.view.dispatch(
              editor.view.state.tr.setSelection(
                TextSelection.create(
                  editor.view.state.doc,
                  fixture.from,
                  fixture.to,
                ),
              ),
            );
            const start = performance.now();
            if (fixture.action === "keyboard")
              await userEvent.keyboard(fixture.input);
            else if (fixture.action === "unicode")
              editor.view.dispatch(
                editor.view.state.tr.insertText(fixture.input),
              );
            else
              editor.view.dispatch(
                editor.view.state.tr.replaceSelectionWith(
                  qualificationProseMirrorSchema.nodes.hard_break.create(),
                ),
              );
            const actionMs = performance.now() - start;
            expect(
              nativeTextFromProseMirror(editor.view.state.doc),
              fixture.name,
            ).toBe(fixture.expected);
            expect(readEditorText(carrier, content).text, fixture.name).toBe(
              fixture.expected,
            );
            expect(readEditorText(carrier, other).text).toBe("unrelated text");
            expect(readEditorText(carrier, third).text).toBe("unrelated text");
            expect(publications, fixture.name).toBe(1);
            expect(applyMs).toBeGreaterThanOrEqual(0);
            samples.push({
              case: fixture.name,
              candidate: factory.candidate,
              iteration,
              warmup: iteration < 2,
              sequence: ++sequence,
              actionMs,
              synchronousApplyMs: applyMs,
            });
          } finally {
            editor.unmount();
            element.remove();
          }
        }
      }
    }
    const summaries = cases.flatMap((fixture) =>
      factories.map(({ candidate }) => {
        const selected = samples.filter(
          (sample) =>
            sample.case === fixture.name &&
            sample.candidate === candidate &&
            !sample.warmup,
        );
        const stats = (values: number[]) => {
          const sorted = [...values].sort((a, b) => a - b);
          return { medianMs: sorted[2], p95Ms: sorted[4] };
        };
        return {
          case: fixture.name,
          candidate,
          action: stats(selected.map((sample) => sample.actionMs)),
          synchronousApply: stats(
            selected.map((sample) => sample.synchronousApplyMs),
          ),
        };
      }),
    );
    console.info(
      "STEP3_EDITOR_WORKLOADS_JSON=" +
        JSON.stringify({
          version: 1,
          profile: {
            cases,
            warmups: 2,
            samplesPerCandidateAndCase: 5,
            freshFixturePerSample: true,
            alternatingOrder: true,
            blockCount: 2,
            inlineContentCount: 3,
            decoder: "pure local-dense opt-in",
          },
          intervals: {
            actionMs:
              "keyboard cases time synthetic driver invocation to resolution; Unicode and line-feed cases time direct ProseMirror transaction dispatch; setup and assertions excluded; includes synchronous publication, not paint",
            synchronousApplyMs:
              "nested synchronous carrier.applyChange; excludes editor translation, projection and driver",
          },
          userAgent: navigator.userAgent,
          samples,
          summaries,
        }),
    );
  }, 240000);
});
