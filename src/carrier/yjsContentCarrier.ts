import * as Y from "yjs";

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

const CONTENT_NAME = "content";
const ORIGINS_NAME = "origins";
const ORIGIN_ATTRIBUTE = "coedit:origin";

interface YTextDeltaOperation {
  readonly insert: string;
  readonly attributes?: Readonly<Record<string, unknown>>;
}

/** Headless Yjs v13 qualification adapter for one CollaborativeContent value. */
export class YjsContentCarrier implements ContentCarrier {
  public readonly candidate = "yjs" as const;

  private readonly document: Y.Doc;
  private readonly text: Y.Text;
  private readonly origins: Y.Map<string>;

  /** Creates an empty adapter or reloads one complete encoded Yjs state. */
  public constructor(encoded?: Uint8Array) {
    this.document = new Y.Doc();
    this.text = this.document.getText(CONTENT_NAME);
    this.origins = this.document.getMap<string>(ORIGINS_NAME);
    if (encoded !== undefined) {
      Y.applyUpdate(this.document, encoded);
    }
  }

  /** Inserts visible text with explicit Origin and explicit active formatting. */
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

  /** Inserts one hard break with explicit Origin and explicit active formatting. */
  public insertHardBreak(
    runtimeUtf16Offset: number,
    origin: OriginRecord,
  ): void {
    this.insertString(runtimeUtf16Offset, "\n", origin);
  }

  /** Deletes a candidate-runtime UTF-16 range. */
  public deleteRange(
    startRuntimeUtf16Offset: number,
    endRuntimeUtf16Offset: number,
  ): void {
    assertRange(
      startRuntimeUtf16Offset,
      endRuntimeUtf16Offset,
      this.text.length,
    );
    if (startRuntimeUtf16Offset === endRuntimeUtf16Offset) {
      return;
    }
    this.text.delete(
      startRuntimeUtf16Offset,
      endRuntimeUtf16Offset - startRuntimeUtf16Offset,
    );
  }

  /** Adds one intrinsic mark without touching the protected Origin attribute. */
  public addMark(
    startRuntimeUtf16Offset: number,
    endRuntimeUtf16Offset: number,
    mark: FormattingMark,
  ): void {
    assertRange(
      startRuntimeUtf16Offset,
      endRuntimeUtf16Offset,
      this.text.length,
    );
    if (startRuntimeUtf16Offset === endRuntimeUtf16Offset) {
      throw new RangeError("A formatting mark must cover visible content.");
    }
    this.text.format(
      startRuntimeUtf16Offset,
      endRuntimeUtf16Offset - startRuntimeUtf16Offset,
      { [encodeMarkKey(mark)]: true },
    );
  }

  /** Projects detached range-free content from Y.Text attributes. */
  public snapshot(): InlineContentValue {
    const items: ContentItem[] = [];
    const delta =
      this.text.toDelta() as unknown as readonly YTextDeltaOperation[];
    for (const operation of delta) {
      if (typeof operation.insert !== "string") {
        throw new TypeError(
          "The Step 3 Yjs carrier accepts text and hard breaks only.",
        );
      }
      const attributes = operation.attributes ?? {};
      const originValue = attributes[ORIGIN_ATTRIBUTE];
      if (typeof originValue !== "string") {
        throw new TypeError("Every live Yjs text unit must carry one Origin.");
      }
      appendItems(
        items,
        operation.insert,
        parseOriginId(originValue),
        formattingFromAttributes(attributes),
      );
    }

    const origins = [...this.origins.values()]
      .map(parseStoredOrigin)
      .sort((left, right) => left.id.localeCompare(right.id));
    return structuredClone({ items, origins });
  }

  /** Encodes complete Yjs state. */
  public encode(): Uint8Array {
    return Y.encodeStateAsUpdate(this.document);
  }

  /** Applies one complete or incremental Yjs update. */
  public mergeEncoded(encoded: Uint8Array): void {
    Y.applyUpdate(this.document, encoded);
  }

  /** Creates a serialized Yjs relative position. */
  public createCursor(
    runtimeUtf16Offset: number,
    affinity: "before" | "after",
  ): string {
    assertOffset(runtimeUtf16Offset, this.text.length);
    const relative = Y.createRelativePositionFromTypeIndex(
      this.text,
      runtimeUtf16Offset,
      affinity === "before" ? -1 : 0,
    );
    return bytesToBase64(Y.encodeRelativePosition(relative));
  }

  /** Resolves a serialized Yjs relative position. */
  public resolveCursor(cursor: string): number | undefined {
    let relative: Y.RelativePosition;
    try {
      relative = Y.decodeRelativePosition(base64ToBytes(cursor));
    } catch {
      return undefined;
    }
    const absolute = Y.createAbsolutePositionFromRelativePosition(
      relative,
      this.document,
    );
    return absolute?.type === this.text ? absolute.index : undefined;
  }

  private insertString(
    runtimeUtf16Offset: number,
    inserted: string,
    origin: OriginRecord,
  ): void {
    assertOffset(runtimeUtf16Offset, this.text.length);
    if (inserted.length === 0) {
      throw new TypeError("Inserted carrier text must not be empty.");
    }
    const attributes: Record<string, string | boolean> = {
      [ORIGIN_ATTRIBUTE]: origin.id,
      ...this.markAttributesAtInsertion(runtimeUtf16Offset),
    };

    const serializedOrigin = JSON.stringify(origin);
    const existing = this.origins.get(origin.id);
    if (existing !== undefined && existing !== serializedOrigin) {
      throw new TypeError(
        "An OriginId cannot identify conflicting attribution.",
      );
    }

    this.document.transact(() => {
      if (existing === undefined) {
        this.origins.set(origin.id, serializedOrigin);
      }
      this.text.insert(runtimeUtf16Offset, inserted, attributes);
    });
  }

  private markAttributesAtInsertion(
    runtimeUtf16Offset: number,
  ): Readonly<Record<string, boolean>> {
    const delta =
      this.text.toDelta() as unknown as readonly YTextDeltaOperation[];
    const left =
      runtimeUtf16Offset === 0
        ? new Set<string>()
        : markKeysAtRuntimeOffset(delta, runtimeUtf16Offset - 1);
    const right =
      runtimeUtf16Offset === this.text.length
        ? new Set<string>()
        : markKeysAtRuntimeOffset(delta, runtimeUtf16Offset);
    const result: Record<string, boolean> = {};

    for (const key of new Set([...left, ...right])) {
      const descriptor = decodeMarkKey(key);
      if (descriptor === undefined) {
        continue;
      }
      if (left.has(key) && right.has(key)) {
        result[key] = true;
        continue;
      }
      if (
        right.has(key) &&
        (descriptor.boundaryPolicy === "start" ||
          descriptor.boundaryPolicy === "both")
      ) {
        result[key] = true;
        continue;
      }
      if (
        left.has(key) &&
        (descriptor.boundaryPolicy === "end" ||
          descriptor.boundaryPolicy === "both")
      ) {
        result[key] = true;
      }
    }
    return result;
  }
}

/** Factory for the common Yjs qualification suite. */
export const yjsContentCarrierFactory: ContentCarrierFactory = {
  candidate: "yjs",
  create: () => new YjsContentCarrier(),
  load: (encoded) => new YjsContentCarrier(encoded),
};

function formattingFromAttributes(
  attributes: Readonly<Record<string, unknown>>,
): FormattingMark[] {
  const marks: FormattingMark[] = [];
  for (const [key, value] of Object.entries(attributes)) {
    if (key === ORIGIN_ATTRIBUTE || value !== true) {
      continue;
    }
    const mark = decodeMarkKey(key);
    if (mark !== undefined) {
      marks.push(mark);
    }
  }
  return marks.sort((left, right) =>
    encodeMarkKey(left).localeCompare(encodeMarkKey(right)),
  );
}

function markKeysAtRuntimeOffset(
  delta: readonly YTextDeltaOperation[],
  runtimeUtf16Offset: number,
): Set<string> {
  let current = 0;
  for (const operation of delta) {
    const end = current + operation.insert.length;
    if (runtimeUtf16Offset >= current && runtimeUtf16Offset < end) {
      return new Set(
        Object.entries(operation.attributes ?? {})
          .filter(
            ([key, value]) =>
              key !== ORIGIN_ATTRIBUTE &&
              value === true &&
              decodeMarkKey(key) !== undefined,
          )
          .map(([key]) => key),
      );
    }
    current = end;
  }
  return new Set<string>();
}

function appendItems(
  items: ContentItem[],
  inserted: string,
  originId: ReturnType<typeof parseOriginId>,
  marks: readonly FormattingMark[],
): void {
  let textStart = 0;
  for (let index = 0; index <= inserted.length; index += 1) {
    if (index < inserted.length && inserted[index] !== "\n") {
      continue;
    }
    if (index > textStart) {
      appendText(items, inserted.slice(textStart, index), originId, marks);
    }
    if (index < inserted.length) {
      items.push({
        kind: "hardBreak",
        originId,
        marks: structuredClone(marks),
      });
    }
    textStart = index + 1;
  }
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
    sameFormatting(previous.marks, marks)
  ) {
    items[items.length - 1] = {
      kind: "text",
      text: previous.text + text,
      originId,
      marks: previous.marks,
    };
    return;
  }
  items.push({
    kind: "text",
    text,
    originId,
    marks: structuredClone(marks),
  });
}

function sameFormatting(
  left: readonly FormattingMark[],
  right: readonly FormattingMark[],
): boolean {
  return JSON.stringify(left) === JSON.stringify(right);
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

function bytesToBase64(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }
  return btoa(binary);
}

function base64ToBytes(value: string): Uint8Array {
  const binary = atob(value);
  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
}
