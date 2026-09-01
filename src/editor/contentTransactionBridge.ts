import type { Node as ProseMirrorNode } from "@tiptap/pm/model";
import type { Transaction } from "@tiptap/pm/state";
import {
  AddMarkStep,
  RemoveMarkStep,
  ReplaceStep,
  type Step,
} from "@tiptap/pm/transform";

import type { OriginRecord } from "../domain/content.js";
import type { InlineContentId } from "../domain/ids.js";
import { parseOriginId } from "../domain/ids.js";
import type { InlineContentMutation } from "../carrier/collaborativeDocumentCarrier.js";
import type {
  ContentCarrier,
  ContentCarrierOperation,
} from "../carrier/contentCarrier.js";
import {
  formattingMarksFromProseMirror,
  formattingMarkFromProseMirror,
  originMarkName,
} from "./inlineContentSchema.js";

/** Trusted Origin resolution used when an editor transaction restores existing material. */
export interface EditorOriginContext {
  /** Origin assigned to newly authored or externally imported material. */
  readonly defaultOrigin: OriginRecord;
  /** Selects whether inserted editor material can preserve a validated Origin. */
  readonly insertedOriginMode: "new" | "preserve";
  /** Resolves a protected Origin ID found in trusted preserved transaction content. */
  readonly resolveOrigin: (
    originId: OriginRecord["id"],
  ) => OriginRecord | undefined;
}

/** Applies one ProseMirror transaction as one native CollaborativeContent carrier batch. */
export function applyProseMirrorTransaction(
  carrier: ContentCarrier,
  transaction: Transaction,
  originContext: EditorOriginContext,
): void {
  const operations = contentCarrierOperationsFromTransaction(
    transaction,
    originContext,
  );
  if (operations.length > 0) {
    carrier.applyOperations(operations);
  }
}

/** Packages one ProseMirror transaction as a mutation for the shared logical carrier document. */
export function inlineContentMutationFromProseMirrorTransaction(
  inlineContentId: InlineContentId,
  transaction: Transaction,
  originContext: EditorOriginContext,
): InlineContentMutation {
  return {
    inlineContentId,
    operations: contentCarrierOperationsFromTransaction(
      transaction,
      originContext,
    ),
  };
}

/** Translates one flat ProseMirror transaction to ordered candidate-runtime UTF-16 operations. */
export function contentCarrierOperationsFromTransaction(
  transaction: Transaction,
  originContext: EditorOriginContext,
): readonly ContentCarrierOperation[] {
  const operations: ContentCarrierOperation[] = [];
  for (const step of transaction.steps) {
    appendStepOperations(operations, step, originContext);
  }
  return operations;
}

function appendStepOperations(
  operations: ContentCarrierOperation[],
  step: Step,
  originContext: EditorOriginContext,
): void {
  if (step instanceof ReplaceStep) {
    appendReplaceOperations(operations, step, originContext);
    return;
  }
  if (step instanceof AddMarkStep) {
    appendMarkOperation(operations, "addMark", step.from, step.to, step.mark);
    return;
  }
  if (step instanceof RemoveMarkStep) {
    appendMarkOperation(
      operations,
      "removeMark",
      step.from,
      step.to,
      step.mark,
    );
    return;
  }
  throw new Error(
    `Unsupported CollaborativeContent editor step: ${step.constructor.name}.`,
  );
}

function appendReplaceOperations(
  operations: ContentCarrierOperation[],
  step: ReplaceStep,
  originContext: EditorOriginContext,
): void {
  if (step.slice.openStart !== 0 || step.slice.openEnd !== 0) {
    throw new Error(
      "CollaborativeContent replacement slices must be flat and closed.",
    );
  }
  if (step.from < step.to) {
    operations.push({
      kind: "deleteRange",
      startRuntimeUtf16Offset: step.from,
      endRuntimeUtf16Offset: step.to,
    });
  }

  let insertionOffset = step.from;
  step.slice.content.forEach((node) => {
    const origin = originForInsertedNode(node, originContext);
    const length = insertedNodeLength(node);
    if (node.isText) {
      if (node.text === undefined || node.text.length === 0) {
        throw new Error(
          "CollaborativeContent editor text insertion must be non-empty.",
        );
      }
      operations.push({
        kind: "insertText",
        runtimeUtf16Offset: insertionOffset,
        text: node.text,
        origin,
      });
    } else if (node.type.name === "hardBreak") {
      operations.push({
        kind: "insertHardBreak",
        runtimeUtf16Offset: insertionOffset,
        origin,
      });
    } else {
      throw new Error(
        `Unsupported CollaborativeContent inserted node: ${node.type.name}.`,
      );
    }

    for (const mark of formattingMarksFromProseMirror(node.marks)) {
      operations.push({
        kind: "addMark",
        startRuntimeUtf16Offset: insertionOffset,
        endRuntimeUtf16Offset: insertionOffset + length,
        mark,
      });
    }
    insertionOffset += length;
  });
}

function appendMarkOperation(
  operations: ContentCarrierOperation[],
  kind: "addMark" | "removeMark",
  startRuntimeUtf16Offset: number,
  endRuntimeUtf16Offset: number,
  editorMark: AddMarkStep["mark"],
): void {
  if (editorMark.type.name === originMarkName) {
    throw new Error(
      "Editor transactions cannot modify protected Origin marks.",
    );
  }
  const mark = formattingMarkFromProseMirror(editorMark);
  if (mark === undefined) {
    throw new Error(
      `Unsupported CollaborativeContent editor mark: ${editorMark.type.name}.`,
    );
  }
  operations.push({
    kind,
    startRuntimeUtf16Offset,
    endRuntimeUtf16Offset,
    mark,
  });
}

function originForInsertedNode(
  node: ProseMirrorNode,
  originContext: EditorOriginContext,
): OriginRecord {
  if (originContext.insertedOriginMode === "new") {
    return originContext.defaultOrigin;
  }

  const originMarks = node.marks.filter(
    (mark) => mark.type.name === originMarkName,
  );
  if (originMarks.length !== 1) {
    throw new Error(
      "Trusted preserved editor material requires exactly one Origin mark.",
    );
  }
  const originIdValue: unknown = originMarks[0]?.attrs.originId;
  if (typeof originIdValue !== "string") {
    throw new Error("Inserted editor Origin mark requires an Origin ID.");
  }
  const originId = parseOriginId(originIdValue);
  const origin = originContext.resolveOrigin(originId);
  if (origin === undefined) {
    throw new Error(
      `Inserted editor material references unknown Origin ${originId}.`,
    );
  }
  return origin;
}

function insertedNodeLength(node: ProseMirrorNode): number {
  if (node.isText) {
    return node.text?.length ?? 0;
  }
  if (node.type.name === "hardBreak") {
    return 1;
  }
  throw new Error(
    `Unsupported CollaborativeContent inserted node: ${node.type.name}.`,
  );
}
