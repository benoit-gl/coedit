import * as Automerge from "@automerge/automerge";

import type {
  ContentItem,
  FormattingMark,
  InlineContentValue,
  OriginRecord,
} from "../domain/content.js";
import {
  parseContributionId,
  parseContributorId,
  parseOriginId,
} from "../domain/ids.js";
import type {
  ContentCarrier,
  ContentCarrierFactory,
  ContentCarrierOperation,
} from "./contentCarrier.js";
import { decodeMarkKey, encodeMarkKey } from "./markCodec.js";
import {
  assertRuntimeUtf16Offset,
  validateContentCarrierOperations,
} from "./contentOperationValidation.js";

const TEXT_PATH = ["text"] as const;
const ORIGIN_MARK = "__coedit_origin";

interface AutomergeContentState extends Record<string, unknown> {
  text: string;
  origins: Record<string, string>;
}

type AutomergeContentDraft =
  Automerge.ChangeFn<AutomergeContentState> extends (
    value: infer Draft,
  ) => unknown
    ? Draft
    : never;

/** Headless Automerge v3 qualification adapter for one CollaborativeContent value. */
export class AutomergeContentCarrier implements ContentCarrier {
  public readonly candidate = "automerge" as const;

  private document: Automerge.Doc<AutomergeContentState>;

  /** Creates an empty adapter or reloads one complete Automerge state. */
  public constructor(encoded?: Uint8Array) {
    this.document =
      encoded === undefined
        ? Automerge.from<AutomergeContentState>({ text: "", origins: {} })
        : Automerge.load<AutomergeContentState>(encoded);
  }

  /** Applies one ordered operation batch in one prevalidated Automerge change. */
  public applyOperations(operations: readonly ContentCarrierOperation[]): void {
    validateContentCarrierOperations(
      operations,
      this.document.text.length,
      Object.entries(this.document.origins),
    );
    this.document = Automerge.change(this.document, (draft) => {
      for (const operation of operations) {
        applyOperation(draft, operation);
      }
    });
  }

  /** Inserts visible text and overrides inherited Origin with the explicit Origin. */
  public insertText(
    runtimeUtf16Offset: number,
    text: string,
    origin: OriginRecord,
  ): void {
    this.applyOperations([
      { kind: "insertText", runtimeUtf16Offset, text, origin },
    ]);
  }

  /** Inserts one hard break and gives it the explicit Origin. */
  public insertHardBreak(
    runtimeUtf16Offset: number,
    origin: OriginRecord,
  ): void {
    this.applyOperations([
      { kind: "insertHardBreak", runtimeUtf16Offset, origin },
    ]);
  }

  /** Deletes one candidate-runtime UTF-16 range. */
  public deleteRange(
    startRuntimeUtf16Offset: number,
    endRuntimeUtf16Offset: number,
  ): void {
    this.applyOperations([
      { kind: "deleteRange", startRuntimeUtf16Offset, endRuntimeUtf16Offset },
    ]);
  }

  /** Adds one native Automerge rich-text mark with the canonical boundary policy. */
  public addMark(
    startRuntimeUtf16Offset: number,
    endRuntimeUtf16Offset: number,
    mark: FormattingMark,
  ): void {
    this.applyOperations([
      {
        kind: "addMark",
        startRuntimeUtf16Offset,
        endRuntimeUtf16Offset,
        mark,
      },
    ]);
  }

  /** Removes one native Automerge rich-text mark without changing Origin. */
  public removeMark(
    startRuntimeUtf16Offset: number,
    endRuntimeUtf16Offset: number,
    mark: FormattingMark,
  ): void {
    this.applyOperations([
      {
        kind: "removeMark",
        startRuntimeUtf16Offset,
        endRuntimeUtf16Offset,
        mark,
      },
    ]);
  }

  /** Projects detached range-free content from Automerge text and marks. */
  public snapshot(): InlineContentValue {
    const rawMarks = Automerge.marks(this.document, [...TEXT_PATH]);
    const originMarks = rawMarks
      .filter(
        (mark) => mark.name === ORIGIN_MARK && typeof mark.value === "string",
      )
      .sort((left, right) => left.start - right.start || left.end - right.end);
    const formattingMarks = rawMarks
      .filter((mark) => mark.name !== ORIGIN_MARK && mark.value === true)
      .map((mark) => ({ mark, descriptor: decodeMarkKey(mark.name) }))
      .filter(
        (
          entry,
        ): entry is {
          readonly mark: Automerge.Mark;
          readonly descriptor: FormattingMark;
        } => entry.descriptor !== undefined,
      );
    const items = projectItems(
      this.document.text,
      originMarks,
      formattingMarks,
    );

    const origins = Object.values(this.document.origins)
      .map(parseStoredOrigin)
      .sort((left, right) => left.id.localeCompare(right.id));
    return structuredClone({ items, origins });
  }

  /** Saves complete Automerge state. */
  public encode(): Uint8Array {
    return Automerge.save(this.document);
  }

  /** Loads and merges complete Automerge state from another replica. */
  public mergeEncoded(encoded: Uint8Array): void {
    const remote = Automerge.load<AutomergeContentState>(encoded);
    this.document = Automerge.merge(this.document, remote);
  }

  /** Creates one Automerge cursor at a candidate-runtime UTF-16 offset. */
  public createCursor(
    runtimeUtf16Offset: number,
    affinity: "before" | "after",
  ): string {
    assertRuntimeUtf16Offset(runtimeUtf16Offset, this.document.text.length);
    return Automerge.getCursor(
      this.document,
      [...TEXT_PATH],
      runtimeUtf16Offset,
      affinity,
    );
  }

  /** Resolves one Automerge cursor to a candidate-runtime UTF-16 offset. */
  public resolveCursor(cursor: string): number | undefined {
    try {
      return Automerge.getCursorPosition(this.document, [...TEXT_PATH], cursor);
    } catch {
      return undefined;
    }
  }
}

function applyOperation(
  draft: AutomergeContentDraft,
  operation: ContentCarrierOperation,
): void {
  switch (operation.kind) {
    case "insertText":
      insertString(
        draft,
        operation.runtimeUtf16Offset,
        operation.text,
        operation.origin,
      );
      return;
    case "insertHardBreak":
      insertString(draft, operation.runtimeUtf16Offset, "\n", operation.origin);
      return;
    case "deleteRange":
      if (
        operation.startRuntimeUtf16Offset !== operation.endRuntimeUtf16Offset
      ) {
        Automerge.splice(
          draft,
          [...TEXT_PATH],
          operation.startRuntimeUtf16Offset,
          operation.endRuntimeUtf16Offset - operation.startRuntimeUtf16Offset,
        );
      }
      return;
    case "addMark":
      Automerge.mark(
        draft,
        [...TEXT_PATH],
        {
          start: operation.startRuntimeUtf16Offset,
          end: operation.endRuntimeUtf16Offset,
          expand: toAutomergeExpansion(operation.mark.boundaryPolicy),
        },
        encodeMarkKey(operation.mark),
        true,
      );
      return;
    case "removeMark":
      if (
        operation.startRuntimeUtf16Offset !== operation.endRuntimeUtf16Offset
      ) {
        Automerge.unmark(
          draft,
          [...TEXT_PATH],
          {
            start: operation.startRuntimeUtf16Offset,
            end: operation.endRuntimeUtf16Offset,
            expand: "none",
          },
          encodeMarkKey(operation.mark),
        );
      }
      return;
  }
}

function insertString(
  draft: AutomergeContentDraft,
  runtimeUtf16Offset: number,
  inserted: string,
  origin: OriginRecord,
): void {
  if (draft.origins[origin.id] === undefined) {
    draft.origins[origin.id] = JSON.stringify(origin);
  }
  Automerge.splice(draft, [...TEXT_PATH], runtimeUtf16Offset, 0, inserted);
  Automerge.mark(
    draft,
    [...TEXT_PATH],
    {
      start: runtimeUtf16Offset,
      end: runtimeUtf16Offset + inserted.length,
      expand: "none",
    },
    ORIGIN_MARK,
    origin.id,
  );
}

/** Factory for the common Automerge qualification suite. */
export const automergeContentCarrierFactory: ContentCarrierFactory = {
  candidate: "automerge",
  create: () => new AutomergeContentCarrier(),
  load: (encoded) => new AutomergeContentCarrier(encoded),
};

interface DecodedAutomergeFormattingMark {
  readonly mark: Automerge.Mark;
  readonly descriptor: FormattingMark;
}

function projectItems(
  text: string,
  originMarks: readonly Automerge.Mark[],
  formattingMarks: readonly DecodedAutomergeFormattingMark[],
): ContentItem[] {
  const items: ContentItem[] = [];
  let originIndex = 0;

  for (
    let runtimeUtf16Offset = 0;
    runtimeUtf16Offset < text.length;
    runtimeUtf16Offset += 1
  ) {
    while (
      originIndex < originMarks.length &&
      (originMarks[originIndex]?.end ?? 0) <= runtimeUtf16Offset
    ) {
      originIndex += 1;
    }
    const originMark = originMarks[originIndex];
    if (
      originMark === undefined ||
      originMark.start > runtimeUtf16Offset ||
      originMark.end <= runtimeUtf16Offset ||
      typeof originMark.value !== "string"
    ) {
      throw new TypeError(
        "Every live Automerge text unit must carry one Origin.",
      );
    }
    const nextOrigin = originMarks[originIndex + 1];
    if (
      nextOrigin !== undefined &&
      nextOrigin.start <= runtimeUtf16Offset &&
      nextOrigin.end > runtimeUtf16Offset
    ) {
      throw new TypeError(
        "A live Automerge text unit must not carry conflicting Origins.",
      );
    }

    const marks = formattingMarks
      .filter(
        (entry) =>
          entry.mark.start <= runtimeUtf16Offset &&
          entry.mark.end > runtimeUtf16Offset,
      )
      .map((entry) => entry.descriptor)
      .sort((left, right) =>
        encodeMarkKey(left).localeCompare(encodeMarkKey(right)),
      );
    const originId = parseOriginId(originMark.value);
    const codeUnit = text.slice(runtimeUtf16Offset, runtimeUtf16Offset + 1);
    if (codeUnit === "\n") {
      items.push({ kind: "hardBreak", originId, marks });
    } else {
      appendText(items, codeUnit, originId, marks);
    }
  }
  return items;
}

function appendText(
  items: ContentItem[],
  text: string,
  originId: ReturnType<typeof parseOriginId>,
  marks: readonly FormattingMark[],
): void {
  const previous = items.at(-1);
  if (
    previous?.kind === "text" &&
    previous.originId === originId &&
    JSON.stringify(previous.marks) === JSON.stringify(marks)
  ) {
    items[items.length - 1] = {
      kind: "text",
      text: previous.text + text,
      originId,
      marks: previous.marks,
    };
    return;
  }
  items.push({ kind: "text", text, originId, marks });
}

function toAutomergeExpansion(
  policy: FormattingMark["boundaryPolicy"],
): "none" | "before" | "after" | "both" {
  if (policy === "start") {
    return "before";
  }
  if (policy === "end") {
    return "after";
  }
  return policy;
}

function parseStoredOrigin(serialized: string): OriginRecord {
  const value: unknown = JSON.parse(serialized);
  if (!isRecord(value)) {
    throw new TypeError("Stored Origin must be an object.");
  }
  const id = value.id;
  const agentId = value.agentId;
  const kind = value.kind;
  const createdBy = value.createdBy;
  if (
    typeof id !== "string" ||
    typeof agentId !== "string" ||
    typeof createdBy !== "string" ||
    (kind !== "human" &&
      kind !== "imported" &&
      kind !== "automation" &&
      kind !== "ai" &&
      kind !== "unknown")
  ) {
    throw new TypeError("Stored Origin fields are invalid.");
  }
  return {
    id: parseOriginId(id),
    agentId: parseContributorId(agentId),
    kind,
    createdBy: parseContributionId(createdBy),
  };
}

function isRecord(value: unknown): value is Readonly<Record<string, unknown>> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
