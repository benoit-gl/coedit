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
} from "./contentCarrier.js";
import { decodeMarkKey, encodeMarkKey } from "./markCodec.js";

const TEXT_PATH = ["text"] as const;
const ORIGIN_MARK = "__coedit_origin";

interface AutomergeContentState extends Record<string, unknown> {
  text: string;
  origins: Record<string, string>;
}

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

  /** Inserts visible text and overrides inherited Origin with the explicit Origin. */
  public insertText(
    runtimeUtf16Offset: number,
    text: string,
    origin: OriginRecord,
  ): void {
    if (text.length === 0 || text.includes("\n") || text.includes("\r")) {
      throw new TypeError(
        "Inserted visible text must be non-empty and contain no hard break.",
      );
    }
    this.insertString(runtimeUtf16Offset, text, origin);
  }

  /** Inserts one hard break and gives it the explicit Origin. */
  public insertHardBreak(
    runtimeUtf16Offset: number,
    origin: OriginRecord,
  ): void {
    this.insertString(runtimeUtf16Offset, "\n", origin);
  }

  /** Deletes one candidate-runtime UTF-16 range. */
  public deleteRange(
    startRuntimeUtf16Offset: number,
    endRuntimeUtf16Offset: number,
  ): void {
    assertRange(
      startRuntimeUtf16Offset,
      endRuntimeUtf16Offset,
      this.document.text.length,
    );
    if (startRuntimeUtf16Offset === endRuntimeUtf16Offset) {
      return;
    }
    this.document = Automerge.change(this.document, (draft) => {
      Automerge.splice(
        draft,
        [...TEXT_PATH],
        startRuntimeUtf16Offset,
        endRuntimeUtf16Offset - startRuntimeUtf16Offset,
      );
    });
  }

  /** Adds one native Automerge rich-text mark with the canonical boundary policy. */
  public addMark(
    startRuntimeUtf16Offset: number,
    endRuntimeUtf16Offset: number,
    mark: FormattingMark,
  ): void {
    assertRange(
      startRuntimeUtf16Offset,
      endRuntimeUtf16Offset,
      this.document.text.length,
    );
    if (endRuntimeUtf16Offset <= startRuntimeUtf16Offset) {
      throw new RangeError("A formatting mark must cover visible content.");
    }
    this.document = Automerge.change(this.document, (draft) => {
      Automerge.mark(
        draft,
        [...TEXT_PATH],
        {
          start: startRuntimeUtf16Offset,
          end: endRuntimeUtf16Offset,
          expand: toAutomergeExpansion(mark.boundaryPolicy),
        },
        encodeMarkKey(mark),
        true,
      );
    });
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
    assertOffset(runtimeUtf16Offset, this.document.text.length);
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

  private insertString(
    runtimeUtf16Offset: number,
    inserted: string,
    origin: OriginRecord,
  ): void {
    assertOffset(runtimeUtf16Offset, this.document.text.length);
    const insertedUnits = inserted.length;
    const serializedOrigin = JSON.stringify(origin);
    const existing = this.document.origins[origin.id];
    if (existing !== undefined && existing !== serializedOrigin) {
      throw new TypeError(
        "An OriginId cannot identify conflicting attribution.",
      );
    }

    this.document = Automerge.change(this.document, (draft) => {
      if (existing === undefined) {
        draft.origins[origin.id] = serializedOrigin;
      }
      Automerge.splice(draft, [...TEXT_PATH], runtimeUtf16Offset, 0, inserted);
      Automerge.mark(
        draft,
        [...TEXT_PATH],
        {
          start: runtimeUtf16Offset,
          end: runtimeUtf16Offset + insertedUnits,
          expand: "none",
        },
        ORIGIN_MARK,
        origin.id,
      );
    });
  }
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

function assertOffset(offset: number, length: number): void {
  if (!Number.isSafeInteger(offset) || offset < 0 || offset > length) {
    throw new RangeError("Carrier runtime UTF-16 offset is outside content.");
  }
}

function assertRange(start: number, end: number, length: number): void {
  assertOffset(start, length);
  assertOffset(end, length);
  if (end < start) {
    throw new RangeError("Carrier range end must not precede its start.");
  }
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
