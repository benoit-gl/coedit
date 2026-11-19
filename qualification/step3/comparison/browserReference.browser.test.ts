import { describe, expect, it } from "vitest";
import { userEvent } from "@vitest/browser/context";
import { TextSelection } from "prosemirror-state";
import {
  parseBlockId,
  parseInlineContentId,
} from "../../../src/domain/index.js";
import { createYjsIntegratedDocumentCarrierFactory } from "../integrated/yjsIntegratedDocumentCarrier.js";
import { createAutomergeIntegratedDocumentCarrierFactory } from "../integrated/automergeIntegratedDocumentCarrier.js";
import type {
  IntegratedPayloadChange,
  IntegratedPlacementChange,
} from "../integrated/carrier.js";
import {
  localDensePositionAllocator,
  type LocalDensePosition,
} from "../structure/localDensePosition.js";
import {
  mountProseMirrorEditor,
  nativeTextFromProseMirror,
} from "../editor/prosemirrorAdapter.js";
import { readEditorText } from "../editor/semanticText.js";
import type {
  QualificationOrigin,
  QualificationTextSpan,
} from "../payload/carrier.js";
import profile from "./browser-reference-profile.json";

const root = parseBlockId("9a000000-0000-4000-8000-000000000001");
const target = parseInlineContentId("9a000000-0000-4000-8000-000000000002");

const factories = [
  createYjsIntegratedDocumentCarrierFactory,
  createAutomergeIntegratedDocumentCarrierFactory,
];

function gate() {
  let release!: () => void;
  const closed = new Promise<void>((resolve) => {
    release = resolve;
  });
  return { closed, release };
}

function fixtureText(units: number): string {
  const unit =
    "# café" +
    String.fromCharCode(13, 10) +
    "漢字 e\u0301 👩‍💻️ **markdown** [link](x)\n";
  const result = unit.repeat(Math.ceil(units / unit.length)).slice(0, units);
  return result.charCodeAt(result.length - 1) >= 0xd800 &&
    result.charCodeAt(result.length - 1) <= 0xdbff
    ? result.slice(0, -1) + "x"
    : result;
}

function id(n: number): string {
  return `9a000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
}

function origin(n: number): QualificationOrigin {
  return { id: `browser-reference-origin-${n}`, kind: "human" };
}

function attributed(text: string, runs: number) {
  const result: { text: string; origin: ReturnType<typeof origin> }[] = [];
  for (let n = 0, at = 0; n < runs; n++) {
    let end =
      n === runs - 1 ? text.length : Math.floor(((n + 1) * text.length) / runs);
    if (
      end < text.length &&
      text.charCodeAt(end) >= 0xdc00 &&
      text.charCodeAt(end) <= 0xdfff
    )
      end--;
    result.push({ text: text.slice(at, end), origin: origin(n) });
    at = end;
  }
  return result;
}

function equalOrigins(
  actual: ReturnType<typeof readEditorText<LocalDensePosition>>,
  expected: readonly QualificationTextSpan[],
): void {
  expect(actual.text).toBe(expected.map((span) => span.text).join(""));
  // The oracle is independent of carrier segmentation: only adjacent equal
  // Origin runs may coalesce during projection.
  const coalesce = (spans: readonly QualificationTextSpan[]) =>
    spans
      .filter((span) => span.text.length > 0)
      .reduce<{ text: string; origin: ReturnType<typeof origin> }[]>(
        (result, span) => {
          const previous = result.at(-1);
          if (
            previous?.origin.id === span.origin.id &&
            previous.origin.kind === span.origin.kind
          )
            previous.text += span.text;
          else result.push({ text: span.text, origin: span.origin });
          return result;
        },
        [],
      );
  const normalized = coalesce(actual.spans);
  expect(
    normalized.map((span) => ({ text: span.text, origin: span.origin })),
  ).toEqual(coalesce(expected));
}

function replaceOrigins(
  spans: readonly QualificationTextSpan[],
  start: number,
  end: number,
  text: string,
) {
  const before: { text: string; origin: ReturnType<typeof origin> }[] = [];
  const after: { text: string; origin: ReturnType<typeof origin> }[] = [];
  let offset = 0;
  for (const span of spans) {
    const next = offset + span.text.length;
    if (offset < start)
      before.push({
        text: span.text.slice(0, Math.min(span.text.length, start - offset)),
        origin: span.origin,
      });
    if (next > end)
      after.push({
        text: span.text.slice(Math.max(0, end - offset)),
        origin: span.origin,
      });
    offset = next;
  }
  return [
    ...before.filter((span) => span.text.length > 0),
    ...(text.length === 0
      ? []
      : [
          {
            text,
            origin: { id: "browser-reference-edit", kind: "human" as const },
          },
        ]),
    ...after.filter((span) => span.text.length > 0),
  ];
}

function genesis(
  create: (typeof factories)[number],
  units: number,
  runs: number,
  unrelated: number,
  unrelatedTextUnits = 4096,
  opaqueBytes = 4096,
) {
  const factory = create(
    localDensePositionAllocator,
    localDensePositionAllocator,
    {
      ordinaryEditVariant: "targeted",
      editorProjectionVariant: "targeted",
      purePositionDecoder: true,
    },
  );
  const carrier = factory.create(root);
  const text = fixtureText(units);
  const inlineContents = [{ inlineContentId: target, blockId: root }];
  const placements: IntegratedPlacementChange<LocalDensePosition>[] = [];
  const initialRuns = attributed(text, runs);
  const payloads: IntegratedPayloadChange[] = [
    {
      kind: "replace-text",
      inlineContentId: target,
      mediaType: "text/markdown",
      text: initialRuns[0]!.text,
      origin: initialRuns[0]!.origin,
    },
  ];
  for (let n = 0; n < unrelated; n++) {
    const blockId = parseBlockId(id(10 + n));
    const textId = parseInlineContentId(id(100 + n * 2));
    const opaqueId = parseInlineContentId(id(101 + n * 2));
    placements.push({
      blockId,
      placement: {
        depth: 1,
        position: { digits: [n + 1], run: root, member: n + 1 },
      },
    });
    inlineContents.push(
      { inlineContentId: textId, blockId },
      { inlineContentId: opaqueId, blockId },
    );
    payloads.push(
      {
        kind: "replace-text",
        inlineContentId: textId,
        mediaType: "text/plain",
        text: "u".repeat(unrelatedTextUnits),
        origin: origin(90 + n),
      },
      {
        kind: "replace-opaque",
        inlineContentId: opaqueId,
        mediaType: "application/octet-stream",
        bytes: new Uint8Array(opaqueBytes).fill(n),
        origin: origin(190 + n),
      },
    );
  }
  carrier.applyChange({ placements, inlineContents, payloads });
  let offset = initialRuns[0]!.text.length;
  for (const span of initialRuns.slice(1)) {
    carrier.applyChange({
      payloads: [
        {
          kind: "insert-text",
          inlineContentId: target,
          offset,
          text: span.text,
          origin: span.origin,
        },
      ],
    });
    offset += span.text.length;
  }
  return {
    factory,
    bytes: carrier.encode(),
    text,
    expected: attributed(text, runs),
    unrelatedIds: inlineContents.slice(1),
    unrelatedPayloads: carrier.snapshot().payloads,
    originalSnapshot: carrier.snapshot(),
  };
}

function assertUnrelated(
  carrier: ReturnType<ReturnType<(typeof factories)[number]>["create"]>,
  seed: ReturnType<typeof genesis>,
): void {
  const current = carrier.snapshot();
  expect(current.rootId).toBe(seed.originalSnapshot.rootId);
  expect(current.placements).toEqual(seed.originalSnapshot.placements);
  expect(current.blockLiveness).toEqual(seed.originalSnapshot.blockLiveness);
  expect(current.inlineContentOwners).toEqual(
    seed.originalSnapshot.inlineContentOwners,
  );
  for (const item of seed.unrelatedIds)
    expect(current.payloads.get(item.inlineContentId)).toEqual(
      seed.unrelatedPayloads.get(item.inlineContentId),
    );
}

function mounted(
  carrier: ReturnType<ReturnType<(typeof factories)[number]>["create"]>,
  actorId = "browser-reference",
) {
  const element = document.createElement("div");
  document.body.append(element);
  let publications = 0;
  let effect = 0;
  let publicationMs = -1;
  const editor = mountProseMirrorEditor<LocalDensePosition>({
    element,
    inlineContentId: target,
    buffer: readEditorText(carrier, target),
    readCurrentBuffer: () => readEditorText(carrier, target),
    origin: { id: "browser-reference-edit", kind: "human" },
    pasteOrigin: { id: "browser-reference-import", kind: "imported" },
    nextContext: () => ({
      actorId,
      effectId: String(effect++),
    }),
    textPositions: {
      create: (offset, affinity) =>
        carrier.createStableTextPosition(target, offset, affinity),
      resolve: (position) => carrier.resolveStableTextPosition(position),
    },
    publish: (change) => {
      const begin = performance.now();
      carrier.applyChange(change);
      publicationMs = performance.now() - begin;
      publications++;
    },
  });
  return {
    editor,
    publications: () => publications,
    publicationMs: () => publicationMs,
    reset: () => {
      publications = 0;
      publicationMs = -1;
    },
    dispose: () => {
      editor.unmount();
      element.remove();
    },
  };
}

describe("Step 3 Merge 9 browser reference qualification", () => {
  it("records all profile shapes through the mounted targeted editor", async () => {
    for (
      let pass = -profile.method.warmups;
      pass < profile.method.samples;
      pass++
    ) {
      const order = pass % 2 === 0 ? factories : [...factories].reverse();
      for (const create of order)
        for (const shape of profile.shapes) {
          const seed = genesis(
            create,
            shape.targetUnits,
            shape.originRuns,
            shape.unrelatedBlocks,
            shape.unrelatedTextUnits,
            shape.opaqueBytes,
          );
          const carrier = seed.factory.load(seed.bytes);
          const view = mounted(carrier);
          let expected = seed.text;
          let expectedOrigins = [...seed.expected];
          const operations: {
            name: string;
            driverOrDispatchMs: number;
            publicationMs: number;
          }[] = [];
          try {
            const act = async (
              name: string,
              action: () => void | Promise<void>,
              next: () => void,
            ) => {
              view.reset();
              const begin = performance.now();
              const completion = action();
              if (completion !== undefined) await completion;
              const driverOrDispatchMs = performance.now() - begin;
              next();
              expect(view.publications(), name).toBe(1);
              expect(view.publicationMs(), name).toBeGreaterThanOrEqual(0);
              expect(
                nativeTextFromProseMirror(view.editor.view.state.doc),
                name,
              ).toBe(expected);
              expect(readEditorText(carrier, target).text, name).toBe(expected);
              equalOrigins(readEditorText(carrier, target), expectedOrigins);
              assertUnrelated(carrier, seed);
              if (pass >= 0)
                operations.push({
                  name,
                  driverOrDispatchMs,
                  publicationMs: view.publicationMs(),
                });
            };
            await act(
              "selection-source",
              () =>
                view.editor.view.dispatch(
                  view.editor.view.state.tr.insertText("##", 0, 1),
                ),
              () => {
                expected = "##" + expected.slice(1);
                expectedOrigins = replaceOrigins(expectedOrigins, 0, 1, "##");
              },
            );
            let middle = Math.floor(expected.length / 2);
            if (
              expected.charCodeAt(middle) >= 0xdc00 &&
              expected.charCodeAt(middle) <= 0xdfff
            )
              middle--;
            await act(
              "unicode-insert",
              () =>
                view.editor.view.dispatch(
                  view.editor.view.state.tr.insertText("e\u0301👩‍💻️\r\n", middle),
                ),
              () => {
                const inserted = "e\u0301👩‍💻️\r\n";
                expected =
                  expected.slice(0, middle) + inserted + expected.slice(middle);
                expectedOrigins = replaceOrigins(
                  expectedOrigins,
                  middle,
                  middle,
                  inserted,
                );
              },
            );
            view.editor.view.dispatch(
              view.editor.view.state.tr.setSelection(
                TextSelection.atEnd(view.editor.view.state.doc),
              ),
            );
            view.editor.view.focus();
            await act(
              "keyboard-end",
              () => userEvent.keyboard("!"),
              () => {
                expected += "!";
                expectedOrigins = replaceOrigins(
                  expectedOrigins,
                  expected.length - 1,
                  expected.length - 1,
                  "!",
                );
              },
            );
            // Independently assert the expected current attribution after every
            // source edit; carrier output never supplies this oracle.
            equalOrigins(readEditorText(carrier, target), expectedOrigins);
            assertUnrelated(carrier, seed);
            if (pass >= 0)
              console.info(
                "STEP3_BROWSER_REFERENCE_ROW=" +
                  JSON.stringify({
                    kind: "editing",
                    candidate: carrier.candidate,
                    profile: shape.id,
                    iteration: pass,
                    operations,
                  }),
              );
          } finally {
            view.dispose();
          }
        }
    }
  }, 600000);

  it("observes delayed downstream, reload, retained restore, and replacement", async () => {
    for (
      let iteration = -profile.method.warmups;
      iteration < profile.method.samples;
      iteration++
    ) {
      for (const create of iteration % 2
        ? [...factories].reverse()
        : factories) {
        const shape = profile.lifecycle;
        const seed = genesis(
          create,
          shape.targetUnits,
          shape.originRuns,
          shape.unrelatedBlocks,
          shape.unrelatedTextUnits,
          shape.opaqueBytes,
        );
        let carrier = seed.factory.load(seed.bytes);
        const retained = carrier.captureHistoricalState();
        const anchor = carrier.createStableTextPosition(target, 1, "after");
        const remote = seed.factory.load(seed.bytes);
        const inboundSource = seed.factory.load(seed.bytes);
        inboundSource.applyChange({
          payloads: [
            {
              kind: "insert-text",
              inlineContentId: target,
              offset: 0,
              text: "R",
              origin: origin(280),
            },
          ],
        });
        let view = mounted(carrier, "browser-reference-live");
        let expected: readonly QualificationTextSpan[] = seed.expected;
        const observations: Record<string, unknown>[] = [];
        const persistenceGate = gate();
        const outboundGate = gate();
        const inboundGate = gate();
        let persisted = seed.bytes;
        let writes = 0;
        let deliveries = 0;
        let received = false;
        const pendingPersistence = persistenceGate.closed.then(() => {
          persisted = carrier.encode();
          writes++;
        });
        const pendingOutbound = outboundGate.closed.then(async () => {
          await pendingPersistence;
          remote.mergeEncoded(persisted);
          deliveries++;
        });
        const pendingInbound = inboundGate.closed.then(() => {
          carrier.mergeEncoded(inboundSource.encode());
          received = true;
        });
        const selection = () => {
          const { from, to } = view.editor.view.state.selection;
          expect(from).toBeGreaterThanOrEqual(0);
          expect(to).toBeGreaterThanOrEqual(from);
          expect(to).toBeLessThanOrEqual(
            readEditorText(carrier, target).text.length,
          );
          return { from, to };
        };
        const assertView = () => {
          equalOrigins(readEditorText(carrier, target), expected);
          expect(nativeTextFromProseMirror(view.editor.view.state.doc)).toBe(
            expected.map((span) => span.text).join(""),
          );
          assertUnrelated(carrier, seed);
        };
        const append = async (text: string) => {
          const end = expected.map((span) => span.text).join("").length;
          view.editor.view.dispatch(
            view.editor.view.state.tr.setSelection(
              TextSelection.atEnd(view.editor.view.state.doc),
            ),
          );
          view.editor.view.focus();
          await userEvent.keyboard(text);
          expected = replaceOrigins(expected, end, end, text);
          assertView();
          return selection();
        };
        const staleReset = () => {
          const before = carrier.encode();
          const snapshot = carrier.snapshot();
          const effects = structuredClone(carrier.effects());
          const payloadEffects = carrier.recordedPayloadEffects();
          expect(() =>
            view.editor.view.dispatch(
              view.editor.view.state.tr.insertText("?", 0),
            ),
          ).toThrow(/stale canonical/u);
          expect(carrier.encode()).toEqual(before);
          expect(carrier.snapshot()).toEqual(snapshot);
          expect(carrier.effects()).toEqual(effects);
          expect(carrier.recordedPayloadEffects()).toEqual(payloadEffects);
          assertView();
          return selection();
        };
        try {
          // Pending continuations span a real browser task boundary before any
          // local input. These are controlled in-memory stand-ins for I/O.
          await new Promise<void>((resolve) => setTimeout(resolve, 0));
          await append("x");
          await append("y");
          expect(view.publications()).toBe(2);
          expect(writes).toBe(0);
          expect(deliveries).toBe(0);
          expect(received).toBe(false);
          expect(persisted).toEqual(seed.bytes);
          observations.push({
            name: "pending-downstream",
            localEdits: 2,
            taskBoundaryPassed: true,
            writesWhileTyping: writes,
            deliveriesWhileTyping: deliveries,
            receivedWhileTyping: received,
            selection: selection(),
          });
          persistenceGate.release();
          outboundGate.release();
          await Promise.all([pendingPersistence, pendingOutbound]);
          expect(writes).toBe(1);
          expect(deliveries).toBe(1);
          equalOrigins(
            readEditorText(seed.factory.load(persisted), target),
            expected,
          );
          equalOrigins(readEditorText(remote, target), expected);
          inboundGate.release();
          await pendingInbound;
          expect(received).toBe(true);
          remote.mergeEncoded(inboundSource.encode());
          expected = [{ text: "R", origin: origin(280) }, ...expected];
          equalOrigins(readEditorText(carrier, target), expected);
          equalOrigins(readEditorText(remote, target), expected);
          expect(carrier.resolveStableTextPosition(anchor)).toBe(2);
          const inboundSelection = staleReset();
          await append("z");
          observations.push({
            name: "inbound-recovery",
            converged: true,
            staleRefusal: true,
            selectionAfterReset: inboundSelection,
            positionAfterInbound: 2,
            followingEdit: true,
            selection: selection(),
          });

          persisted = carrier.encode();
          view.dispose();
          carrier = seed.factory.load(persisted);
          view = mounted(carrier, "browser-reference-reloaded");
          assertView();
          expect(carrier.resolveStableTextPosition(anchor)).toBe(2);
          const reloadedSelection = selection();
          await append("q");
          observations.push({
            name: "reload",
            exact: true,
            positionAfterReload: 2,
            selectionAtMount: reloadedSelection,
            followingEdit: true,
            selection: selection(),
          });

          carrier.restoreHistoricalState(retained, {
            actorId: "browser-reference-restorer",
            effectId: "restore",
          });
          expected = seed.expected;
          equalOrigins(readEditorText(carrier, target), expected);
          expect(carrier.resolveStableTextPosition(anchor)).toBeUndefined();
          const restoredSelection = staleReset();
          await append("r");
          observations.push({
            name: "restore",
            staleRefusal: true,
            oldPosition: "invalidated",
            selectionAfterReset: restoredSelection,
            followingEdit: true,
            selection: selection(),
          });

          const old = carrier.createStableTextPosition(target, 1, "after");
          carrier.applyChange({
            payloads: [
              {
                kind: "replace-text",
                inlineContentId: target,
                mediaType: "text/markdown",
                text: "replacement\n😀",
                origin: origin(301),
              },
            ],
            context: {
              actorId: "browser-reference-replacer",
              effectId: "replacement",
            },
          });
          expected = [{ text: "replacement\n😀", origin: origin(301) }];
          expect(carrier.resolveStableTextPosition(old)).toBeUndefined();
          const replacementSelection = staleReset();
          await append("!");
          persisted = carrier.encode();
          remote.mergeEncoded(persisted);
          equalOrigins(readEditorText(remote, target), expected);
          equalOrigins(
            readEditorText(seed.factory.load(persisted), target),
            expected,
          );
          observations.push({
            name: "replacement",
            oldPosition: "invalidated",
            staleRefusal: true,
            selectionAfterReset: replacementSelection,
            followingEdit: true,
            selection: selection(),
            finalReloadAndConvergence: true,
          });
          if (iteration >= 0)
            console.info(
              "STEP3_BROWSER_REFERENCE_ROW=" +
                JSON.stringify({
                  kind: "lifecycle",
                  candidate: carrier.candidate,
                  iteration,
                  observations,
                }),
            );
        } finally {
          persistenceGate.release();
          outboundGate.release();
          inboundGate.release();
          await Promise.allSettled([
            pendingPersistence,
            pendingOutbound,
            pendingInbound,
          ]);
          view.dispose();
        }
      }
    }
  }, 600000);

  it("characterizes native surrogate boundaries atomically", () => {
    for (const create of factories)
      for (const edge of profile.edgeCases) {
        const seed = genesis(
          create,
          profile.lifecycle.targetUnits,
          1,
          profile.lifecycle.unrelatedBlocks,
          profile.lifecycle.unrelatedTextUnits,
          profile.lifecycle.opaqueBytes,
        );
        const carrier = seed.factory.load(seed.bytes);
        carrier.applyChange({
          payloads: [
            {
              kind: "replace-text",
              inlineContentId: target,
              mediaType: "text/markdown",
              text: edge === "cross-pair-deletion" ? "😀😁" : "ab",
              origin: origin(399),
            },
          ],
        });
        const view = mounted(carrier);
        try {
          const before = carrier.encode();
          const effects = structuredClone(carrier.effects());
          const beforeSnapshot = carrier.snapshot();
          const beforePayloadEffects = carrier.recordedPayloadEffects();
          const beforeText = readEditorText(carrier, target);
          const input =
            edge === "isolated-high-surrogate"
              ? "\ud800"
              : edge === "isolated-low-surrogate"
                ? "\udc00"
                : undefined;
          let outcome: "exact" | "atomic-refusal" = "exact";
          let message: string | undefined;
          try {
            // The only caught operation is the mounted adapter dispatch.
            view.editor.view.dispatch(
              input === undefined
                ? view.editor.view.state.tr.delete(1, 3)
                : view.editor.view.state.tr.insertText(input, 1),
            );
          } catch (error) {
            outcome = "atomic-refusal";
            message =
              error instanceof Error
                ? `${error.name}:${error.message}`
                : String(error);
            expect(error).toBeInstanceOf(TypeError);
            expect(message).toMatch(
              /cannot preserve this ECMAScript string exactly/iu,
            );
            expect(carrier.encode()).toEqual(before);
            expect(carrier.effects()).toEqual(effects);
            expect(carrier.snapshot()).toEqual(beforeSnapshot);
            expect(carrier.recordedPayloadEffects()).toEqual(
              beforePayloadEffects,
            );
            expect(nativeTextFromProseMirror(view.editor.view.state.doc)).toBe(
              beforeText.text,
            );
          }
          if (outcome === "exact") {
            const expected =
              input === undefined
                ? replaceOrigins(
                    [{ text: "😀😁", origin: origin(399) }],
                    1,
                    3,
                    "",
                  )
                : replaceOrigins(
                    [{ text: "ab", origin: origin(399) }],
                    1,
                    1,
                    input,
                  );
            equalOrigins(readEditorText(carrier, target), expected);
            expect(nativeTextFromProseMirror(view.editor.view.state.doc)).toBe(
              expected.map((span) => span.text).join(""),
            );
            expect(
              readEditorText(seed.factory.load(carrier.encode()), target),
            ).toEqual(readEditorText(carrier, target));
          }
          console.info(
            "STEP3_BROWSER_REFERENCE_ROW=" +
              JSON.stringify({
                kind: "edge",
                candidate: carrier.candidate,
                case: edge,
                outcome,
                selection: {
                  from: view.editor.view.state.selection.from,
                  to: view.editor.view.state.selection.to,
                },
                ...(message === undefined ? {} : { message }),
              }),
          );
        } finally {
          view.dispose();
        }
      }
  }, 600000);
});
