import { Extension, type Editor } from "@tiptap/core";
import type { EditorState, Transaction } from "@tiptap/pm/state";
import type { BodyChangeResult, BodyEditBatchCoordinator } from "./BodyEditBatchCoordinator";
import {
  classifyBodyTransaction,
  type BodyTransactionObservation,
} from "./bodyEditTransaction";

export interface BodyBeforeInputContext {
  inputType: string | null;
  data: string | null;
  isComposing: boolean;
}

export interface BodyTransactionContext {
  beforeInput?: Readonly<BodyBeforeInputContext> | null;
  persistenceLoad?: boolean;
  isComposing?: boolean;
}

interface StepChangeSummary {
  insertedText: string;
  deletedContent: boolean;
}

function summarizeSteps(transaction: Transaction): StepChangeSummary {
  let insertedText = "";
  let deletedContent = false;

  transaction.steps.forEach((step, index) => {
    const before = transaction.docs[index];
    const applied = step.apply(before);
    const after = applied.doc;
    if (!after) return;
    step.getMap().forEach((oldStart, oldEnd, newStart, newEnd) => {
      if (oldEnd > oldStart) deletedContent = true;
      if (newEnd > newStart) {
        insertedText += after.textBetween(newStart, newEnd, "\n", "\n");
      }
    });
  });

  return { insertedText, deletedContent };
}

function transactionInputType(transaction: Transaction): string | null {
  const uiEvent = transaction.getMeta("uiEvent");
  if (uiEvent === "paste") return "insertFromPaste";
  if (uiEvent === "drop") return "insertFromDrop";
  if (uiEvent === "cut") return "deleteByCut";
  return null;
}

export function observeBodyEditorTransaction(
  transaction: Transaction,
  previousState: EditorState,
  context: BodyTransactionContext = {},
): BodyTransactionObservation {
  const changes = transaction.docChanged
    ? summarizeSteps(transaction)
    : { insertedText: "", deletedContent: false };
  return {
    origin: context.persistenceLoad ? "persistence-load" : "user",
    docChanged: transaction.docChanged,
    selectionChanged: !previousState.selection.eq(transaction.selection),
    insertedText: changes.insertedText || context.beforeInput?.data || "",
    deletedContent: changes.deletedContent,
    inputType: context.beforeInput?.inputType ?? transactionInputType(transaction),
    isComposing: context.isComposing === true || context.beforeInput?.isComposing === true,
  };
}

export function dispatchObservedBodyTransaction(
  coordinator: BodyEditBatchCoordinator,
  observation: BodyTransactionObservation,
  applyTransaction: () => void,
): BodyChangeResult {
  const classified = classifyBodyTransaction(observation);
  if (classified.kind === "none") {
    applyTransaction();
    return { accepted: true };
  }
  if (classified.kind === "selection-boundary") {
    applyTransaction();
    try {
      coordinator.selectionChanged();
    } catch {
      // The coordinator snapshot retains capture failure for explicit retry.
    }
    return { accepted: true };
  }
  if (classified.kind === "composition-update") {
    if (!coordinator.getSnapshot().compositionActive) {
      let started: BodyChangeResult;
      try {
        started = coordinator.beginComposition();
      } catch (error) {
        if (coordinator.getSnapshot().failure !== null) {
          return { accepted: false, reason: "blocked" };
        }
        throw error;
      }
      if (!started.accepted) return started;
    }
    return coordinator.acceptCompositionChange(applyTransaction);
  }
  if (coordinator.getSnapshot().compositionActive) {
    try {
      coordinator.endComposition();
    } catch {
      return { accepted: false, reason: "blocked" };
    }
  }
  try {
    return coordinator.acceptChange(classified, applyTransaction);
  } catch (error) {
    // Synchronous checkpoint capture may fail after the transaction was
    // applied. Keep the editor mounted/frozen and surface the retained failure
    // through the coordinator snapshot instead of throwing through the DOM.
    if (coordinator.getSnapshot().failure !== null) {
      return { accepted: false, reason: "blocked" };
    }
    throw error;
  }
}

interface BodyTransactionExtensionOptions {
  dispatch: (
    transaction: Transaction,
    next: (transaction: Transaction) => void,
    editor: Editor,
  ) => void;
}

export function bodyTransactionExtension(
  dispatch: BodyTransactionExtensionOptions["dispatch"],
) {
  return Extension.create<BodyTransactionExtensionOptions>({
    name: "coeditBodyTransactions",
    addOptions: () => ({ dispatch }),
    dispatchTransaction({ transaction, next }) {
      this.options.dispatch(transaction, next, this.editor);
    },
  });
}
