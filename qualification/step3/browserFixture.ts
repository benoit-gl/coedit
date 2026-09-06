import { baseKeymap } from "@tiptap/pm/commands";
import { history, redo, undo } from "@tiptap/pm/history";
import { keymap } from "@tiptap/pm/keymap";
import { EditorState, TextSelection, type Transaction } from "@tiptap/pm/state";
import { EditorView } from "@tiptap/pm/view";

import type { OriginRecord } from "../../src/domain/content.js";
import {
  parseContributionId,
  parseContributorId,
  parseOriginId,
} from "../../src/domain/ids.js";
import { automergeContentCarrierFactory } from "../../src/carrier/automergeContentCarrier.js";
import type {
  ContentCarrier,
  ContentCarrierFactory,
} from "../../src/carrier/contentCarrier.js";
import { yjsContentCarrierFactory } from "../../src/carrier/yjsContentCarrier.js";
import {
  applyProseMirrorTransaction,
  type EditorOriginContext,
} from "../../src/editor/contentTransactionBridge.js";
import {
  inlineContentSchema,
  proseMirrorDocFromInlineContent,
  proseMirrorMarkFromFormatting,
} from "../../src/editor/inlineContentSchema.js";

interface BrowserQualificationApi {
  snapshot(): ReturnType<ContentCarrier["snapshot"]>;
  select(from: number, to: number): void;
  addBold(): void;
  undo(): boolean;
  redo(): boolean;
}

declare global {
  interface Window {
    coeditQualification: BrowserQualificationApi;
  }
}

const factories: Readonly<Record<string, ContentCarrierFactory>> = {
  yjs: yjsContentCarrierFactory,
  automerge: automergeContentCarrierFactory,
};
const candidate =
  new URLSearchParams(window.location.search).get("candidate") ?? "yjs";
const factory = factories[candidate];
if (factory === undefined) {
  throw new Error(`Unknown Step 3 browser candidate: ${candidate}.`);
}

const origin = qualificationOrigin();
const carrier = factory.create();
const originContext: EditorOriginContext = {
  defaultOrigin: origin,
  insertedOriginMode: "new",
  resolveOrigin: (originId) => (originId === origin.id ? origin : undefined),
};
let preserveNextInsertion = false;
let state = EditorState.create({
  schema: inlineContentSchema,
  doc: proseMirrorDocFromInlineContent({ items: [], origins: [] }),
  plugins: [
    history(),
    keymap({
      Enter: (currentState, dispatch) => {
        const hardBreak = inlineContentSchema.nodes.hardBreak;
        if (hardBreak === undefined) {
          return false;
        }
        dispatch?.(currentState.tr.replaceSelectionWith(hardBreak.create()));
        return true;
      },
      "Mod-z": () => runHistoryCommand(undo),
      "Mod-y": () => runHistoryCommand(redo),
      "Shift-Mod-z": () => runHistoryCommand(redo),
    }),
    keymap(baseKeymap),
  ],
});

const editorElement = document.querySelector<HTMLDivElement>("#editor");
const snapshotElement = document.querySelector<HTMLPreElement>("#snapshot");
if (editorElement === null || snapshotElement === null) {
  throw new Error("Step 3 browser qualification fixture is incomplete.");
}

const view = new EditorView(editorElement, {
  state,
  dispatchTransaction(transaction) {
    publishTransaction(transaction);
  },
});

window.coeditQualification = {
  snapshot: () => carrier.snapshot(),
  select(from, to) {
    const transaction = state.tr.setSelection(
      TextSelection.create(state.doc, from, to),
    );
    state = state.apply(transaction);
    view.updateState(state);
    view.focus();
  },
  addBold() {
    const mark = proseMirrorMarkFromFormatting({
      kind: "bold",
      boundaryPolicy: "both",
    });
    publishTransaction(
      state.tr.addMark(state.selection.from, state.selection.to, mark),
    );
  },
  undo: () => runHistoryCommand(undo),
  redo: () => runHistoryCommand(redo),
};

renderSnapshot();
view.focus();

function publishTransaction(transaction: Transaction): void {
  applyProseMirrorTransaction(carrier, transaction, {
    ...originContext,
    insertedOriginMode: preserveNextInsertion ? "preserve" : "new",
  });
  preserveNextInsertion = false;
  state = state.apply(transaction);
  view.updateState(state);
  renderSnapshot();
}

function runHistoryCommand(command: typeof undo): boolean {
  preserveNextInsertion = true;
  const handled = command(state, (transaction) =>
    publishTransaction(transaction),
  );
  if (!handled) {
    preserveNextInsertion = false;
  }
  return handled;
}

function renderSnapshot(): void {
  snapshotElement.textContent = JSON.stringify(carrier.snapshot(), null, 2);
}

function qualificationOrigin(): OriginRecord {
  return {
    id: parseOriginId("6b000000-0000-4000-8000-000000000001"),
    agentId: parseContributorId("6c000000-0000-4000-8000-000000000001"),
    kind: "human",
    createdBy: parseContributionId("6d000000-0000-4000-8000-000000000001"),
  };
}
