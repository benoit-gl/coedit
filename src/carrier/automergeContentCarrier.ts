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
  public insertText(offset: number, text: string, origin: OriginRecord): void {
    if (text.length === 0 || text.includes("\n") || text.includes("\r")) {
      throw new TypeError(
        "Inserted visible text must be non-empty and contain no hard break.",
      );
    }
    this.insertString(offset, text, origin);
  }

  /** Inserts one hard break and gives it the explicit Origin. */
  public insertHardBreak(offset: number, origin: OriginRecord): void {
    this.insertString(offset, "\n", origin);
  }

  /** Deletes one UTF-16 logical range after translating it to scalar offsets. */
  public deleteRange(start: number, end: number): void {
    const startScalar = utf16ToScalarIndex(this.document.text, start);
    const endScalar = utf16ToScalarIndex(this.document.text, end);
    if (endScalar < startScalar) {
      throw new RangeError("Carrier range end must not precede its start.");
    }
    if (endScalar === startScalar) {
      return;
    }
    this.document = Automerge.change(this.document, (draft) => {
      Automerge.splice(
        draft,
        [...TEXT_PATH],
        startScalar,
        endScalar - startScalar,
      );
    });
  }

  /** Adds one native Automerge rich-text mark with the canonical boundary policy. */
  public addMark(mark: FormattingMark): void {
    const start = utf16ToScalarIndex(this.document.text, mark.start);
    const end = utf16ToScalarIndex(this.document.text, mark.end);
    if (end <= start) {
      throw new RangeError("A formatting mark must cover visible content.");
    }
    this.document = Automerge.change(this.document, (draft) => {
      Automerge.mark(
        draft,
        [...TEXT_PATH],
        { start, end, expand: toAutomergeExpansion(mark.boundaryPolicy) },
        encodeMarkKey(mark),
        true,
      );
    });
  }

  /** Projects detached canonical content from Automerge text and marks. */
  public snapshot(): InlineContentValue {
    const rawMarks = Automerge.marks(this.document, [...TEXT_PATH]);
    const originMarks = rawMarks
      .filter(
        (mark) => mark.name === ORIGIN_MARK && typeof mark.value === "string",
      )
      .sort((left, right) => left.start - right.start || left.end - right.end);
    const items = projectItems(this.document.text, originMarks);
    const marks: FormattingMark[] = [];

    for (const mark of rawMarks) {
      if (mark.name === ORIGIN_MARK || mark.value !== true) {
        continue;
      }
      const descriptor = decodeMarkKey(mark.name);
      if (descriptor === undefined) {
        continue;
      }
      marks.push({
        ...descriptor,
        start: scalarToUtf16Index(this.document.text, mark.start),
        end: scalarToUtf16Index(this.document.text, mark.end),
      });
    }

    const origins = Object.values(this.document.origins)
      .map(parseStoredOrigin)
      .sort((left, right) => left.id.localeCompare(right.id));
    return structuredClone({ items, marks, origins });
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

  /** Creates one Automerge cursor after UTF-16 to scalar translation. */
  public createCursor(offset: number, affinity: "before" | "after"): string {
    const scalar = utf16ToScalarIndex(this.document.text, offset);
    return Automerge.getCursor(this.document, [...TEXT_PATH], scalar, affinity);
  }

  /** Resolves one Automerge cursor and translates it back to a UTF-16 offset. */
  public resolveCursor(cursor: string): number | undefined {
    try {
      const scalar = Automerge.getCursorPosition(
        this.document,
        [...TEXT_PATH],
        cursor,
      );
      return scalarToUtf16Index(this.document.text, scalar);
    } catch {
      return undefined;
    }
  }

  private insertString(
    offset: number,
    inserted: string,
    origin: OriginRecord,
  ): void {
    const scalarOffset = utf16ToScalarIndex(this.document.text, offset);
    const insertedScalars = [...inserted].length;
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
      Automerge.splice(draft, [...TEXT_PATH], scalarOffset, 0, inserted);
      Automerge.mark(
        draft,
        [...TEXT_PATH],
        {
          start: scalarOffset,
          end: scalarOffset + insertedScalars,
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

function projectItems(
  text: string,
  originMarks: readonly Automerge.Mark[],
): ContentItem[] {
  const characters = [...text];
  const items: ContentItem[] = [];
  let markIndex = 0;

  for (let scalar = 0; scalar < characters.length; scalar += 1) {
    while (
      markIndex < originMarks.length &&
      (originMarks[markIndex]?.end ?? 0) <= scalar
    ) {
      markIndex += 1;
    }
    const mark = originMarks[markIndex];
    if (
      mark === undefined ||
      mark.start > scalar ||
      mark.end <= scalar ||
      typeof mark.value !== "string"
    ) {
      throw new TypeError(
        "Every live Automerge text unit must carry one Origin.",
      );
    }
    const next = originMarks[markIndex + 1];
    if (next !== undefined && next.start <= scalar && next.end > scalar) {
      throw new TypeError(
        "A live Automerge text unit must not carry conflicting Origins.",
      );
    }
    const originId = parseOriginId(mark.value);
    const character = characters[scalar]!;
    if (character === "\n") {
      items.push({ kind: "hardBreak", originId });
    } else {
      appendText(items, character, originId);
    }
  }
  return items;
}

function appendText(
  items: ContentItem[],
  text: string,
  originId: ReturnType<typeof parseOriginId>,
): void {
  const previous = items.at(-1);
  if (previous?.kind === "text" && previous.originId === originId) {
    items[items.length - 1] = {
      kind: "text",
      text: previous.text + text,
      originId,
    };
    return;
  }
  items.push({ kind: "text", text, originId });
}

function utf16ToScalarIndex(text: string, offset: number): number {
  if (!Number.isSafeInteger(offset) || offset < 0 || offset > text.length) {
    throw new RangeError("UTF-16 offset is outside Automerge text.");
  }
  let utf16 = 0;
  let scalar = 0;
  for (const character of text) {
    if (utf16 === offset) {
      return scalar;
    }
    utf16 += character.length;
    scalar += 1;
    if (utf16 > offset) {
      throw new RangeError("UTF-16 offset splits one Unicode scalar value.");
    }
  }
  return scalar;
}

function scalarToUtf16Index(text: string, scalarIndex: number): number {
  if (!Number.isSafeInteger(scalarIndex) || scalarIndex < 0) {
    throw new RangeError("Scalar offset is invalid.");
  }
  let utf16 = 0;
  let scalar = 0;
  for (const character of text) {
    if (scalar === scalarIndex) {
      return utf16;
    }
    utf16 += character.length;
    scalar += 1;
  }
  if (scalar !== scalarIndex) {
    throw new RangeError("Scalar offset is outside Automerge text.");
  }
  return utf16;
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
