import { Editor } from "@tiptap/core";
import Collaboration from "@tiptap/extension-collaboration";
import { Schema } from "@tiptap/pm/model";
import { EditorState, TextSelection } from "@tiptap/pm/state";
import StarterKit from "@tiptap/starter-kit";
import { describe, expect, it } from "vitest";
import * as Y from "yjs";
import type { BodyCheckpointCommitRequest } from "../application/bodyCheckpoint";
import { BodyEditBatchCoordinator } from "./BodyEditBatchCoordinator";
import { classifyBodyTransaction } from "./bodyEditTransaction";
import {
  bodyTransactionExtension,
  dispatchObservedBodyTransaction,
  observeBodyEditorTransaction,
} from "./bodyEditorTransaction";
import { sanitizeRichText } from "./sanitizeRichText";
import { bytesToBase64 } from "./yjsEncoding";

const schema = new Schema({
  nodes: {
    doc: { content: "block+" },
    paragraph: { content: "text*", group: "block" },
    text: { group: "inline" },
  },
  marks: {
    strong: {},
  },
});

function stateWithText(text: string): EditorState {
  return EditorState.create({
    schema,
    doc: schema.node("doc", null, [schema.node("paragraph", null, text ? [schema.text(text)] : [])]),
  });
}

describe("ProseMirror body transaction observation", () => {
  it("derives inserted graphemes and deletion facts from transaction steps", () => {
    const insertionState = stateWithText("a");
    const insertion = insertionState.tr.insertText("🙂", 2);
    expect(classifyBodyTransaction(observeBodyEditorTransaction(insertion, insertionState)))
      .toEqual({ kind: "insertion", graphemeCount: 1 });

    const deletionState = stateWithText("ab");
    const deletion = deletionState.tr.delete(1, 2);
    expect(classifyBodyTransaction(observeBodyEditorTransaction(deletion, deletionState)))
      .toEqual({ kind: "deletion" });
  });

  it("distinguishes selection-only and formatting transactions", () => {
    const state = stateWithText("ab");
    const selection = state.tr.setSelection(TextSelection.create(state.doc, 2));
    expect(classifyBodyTransaction(observeBodyEditorTransaction(selection, state)))
      .toEqual({ kind: "selection-boundary" });

    const formatting = state.tr.addMark(1, 2, schema.marks.strong.create());
    expect(classifyBodyTransaction(observeBodyEditorTransaction(formatting, state)))
      .toEqual({ kind: "atomic" });
  });

  it("uses beforeinput context for atomic paste and composition updates", () => {
    const state = stateWithText("");
    const paste = state.tr.insertText("pasted", 1);
    expect(classifyBodyTransaction(observeBodyEditorTransaction(paste, state, {
      beforeInput: { inputType: "insertFromPaste", data: "pasted", isComposing: false },
    }))).toEqual({ kind: "atomic" });

    const composition = state.tr.insertText("に", 1);
    expect(classifyBodyTransaction(observeBodyEditorTransaction(composition, state, {
      beforeInput: { inputType: "insertCompositionText", data: "に", isComposing: true },
    }))).toEqual({ kind: "composition-update" });
  });

  it("marks hydration transactions as persistence loads", () => {
    const state = stateWithText("");
    const hydration = state.tr.insertText("stored", 1);
    expect(classifyBodyTransaction(observeBodyEditorTransaction(hydration, state, {
      persistenceLoad: true,
    }))).toEqual({ kind: "none" });
  });

  it("retains synchronous capture failure without throwing through the editor dispatch", () => {
    const failure = new Error("checkpoint too large");
    let applied = false;
    const coordinator = new BodyEditBatchCoordinator({
      nodeId: "node",
      policy: { batchCharacterThreshold: 1, idleTimeoutMs: 30_000 },
      captureCheckpoint: () => { throw failure; },
      commitCheckpoint: async () => undefined,
    });

    expect(dispatchObservedBodyTransaction(
      coordinator,
      { docChanged: true, insertedText: "x" },
      () => { applied = true; },
    )).toEqual({ accepted: false, reason: "blocked" });
    expect(applied).toBe(true);
    expect(coordinator.getSnapshot()).toMatchObject({
      failure,
      failurePhase: "capture",
      bodyChangesBlocked: true,
    });
    coordinator.dispose();
  });

  it("captures the Yjs update and matching editor state synchronously through Tiptap", async () => {
    const yDocument = new Y.Doc();
    const pendingUpdates: Uint8Array[] = [];
    const commits: BodyCheckpointCommitRequest[] = [];
    yDocument.on("update", (update) => pendingUpdates.push(update));

    let editor!: Editor;
    const coordinator = new BodyEditBatchCoordinator({
      nodeId: "node",
      policy: { batchCharacterThreshold: 1, idleTimeoutMs: 30_000 },
      allocateGroupId: () => "group",
      captureCheckpoint: () => {
        if (pendingUpdates.length === 0) return null;
        const content = {
          bodyHtml: sanitizeRichText(editor.getHTML()),
          yjsUpdate: bytesToBase64(Y.mergeUpdates(pendingUpdates)),
          yjsState: bytesToBase64(Y.encodeStateAsUpdate(yDocument)),
        };
        pendingUpdates.length = 0;
        return content;
      },
      commitCheckpoint: async (checkpoint) => { commits.push(checkpoint); },
    });
    const transactionExtension = bodyTransactionExtension((transaction, next, activeEditor) => {
      const observation = observeBodyEditorTransaction(transaction, activeEditor.state, {
        isComposing: activeEditor.view.composing,
      });
      dispatchObservedBodyTransaction(coordinator, observation, () => next(transaction));
    });
    const element = document.createElement("div");
    document.body.append(element);
    editor = new Editor({
      element,
      extensions: [
        StarterKit.configure({ undoRedo: false }),
        Collaboration.configure({ document: yDocument, field: "content" }),
        transactionExtension,
      ],
    });
    pendingUpdates.length = 0;

    expect(editor.commands.insertContent("x")).toBe(true);
    await coordinator.flush();

    expect(commits).toHaveLength(1);
    expect(commits[0]).toMatchObject({
      nodeId: "node",
      groupId: "group",
      reason: "character-threshold",
      bodyHtml: "<p>x</p>",
    });
    expect(commits[0].yjsUpdate).not.toBe("");
    expect(commits[0].yjsState).not.toBe("");

    editor.destroy();
    coordinator.dispose();
    yDocument.destroy();
    element.remove();
  });
});
