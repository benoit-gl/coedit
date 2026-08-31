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
import {
  decodeMarkKey,
  encodeMarkKey,
  markAppliesAtInsertion,
} from "./markCodec.js";

const CONTENT_NAME = "content";
const ORIGINS_NAME = "origins";
const ORIGIN_ATTRIBUTE = "coedit:origin";

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
  public insertText(offset: number, text: string, origin: OriginRecord): void {
    this.insertString(offset, text, origin);
  }

  /** Inserts one hard break with explicit Origin and explicit active formatting. */
  public insertHardBreak(offset: number, origin: OriginRecord): void {
    this.insertString(offset, "\n", origin);
  }

  /** Deletes a UTF-16 range. */
  public deleteRange(start: number, end: number): void {
    assertRange(start, end, this.text.length);
    if (start === end) {
      return;
    }
    this.text.delete(start, end - start);
  }

  /** Adds one intrinsic mark without touching the protected Origin attribute. */
  public addMark(mark: FormattingMark): void {
    assertRange(mark.start, mark.end, this.text.length);
    if (mark.start === mark.end) {
      throw new RangeError("A formatting mark must cover visible content.");
    }
    this.text.format(mark.start, mark.end - mark.start, {
      [encodeMarkKey(mark)]: true,
    });
  }

  /** Projects a detached carrier-neutral value from Y.Text attributes. */
  public snapshot(): InlineContentValue {
    const items: ContentItem[] = [];
    const marks: FormattingMark[] = [];
    const openMarks = new Map<string, number>();
    let offset = 0;

    for (const operation of this.text.toDelta()) {
      if (typeof operation.insert !== "string") {
        throw new TypeError("The Step 3 Yjs carrier accepts text and hard breaks only.");
      }
      const attributes = operation.attributes ?? {};
      const originValue = attributes[ORIGIN_ATTRIBUTE];
      if (typeof originValue !== "string") {
        throw new TypeError("Every live Yjs text unit must carry one Origin.");
      }
      const originId = parseOriginId(originValue);
      appendItems(items, operation.insert, originId);

      const activeKeys = new Set<string>();
      for (const [key, value] of Object.entries(attributes)) {
        if (key === ORIGIN_ATTRIBUTE || value !== true) {
          continue;
        }
        const descriptor = decodeMarkKey(key);
        if (descriptor === undefined) {
          continue;
        }
        activeKeys.add(key);
        const openIndex = openMarks.get(key);
        if (openIndex === undefined) {
          marks.push({
            ...descriptor,
            start: offset,
            end: offset + operation.insert.length,
          });
          openMarks.set(key, marks.length - 1);
        } else {
          marks[openIndex] = {
            ...marks[openIndex]!,
            end: offset + operation.insert.length,
          };
        }
      }

      for (const key of [...openMarks.keys()]) {
        if (!activeKeys.has(key)) {
          openMarks.delete(key);
        }
      }
      offset += operation.insert.length;
    }

    const origins = [...this.origins.values()]
      .map(parseStoredOrigin)
      .sort((left, right) => left.id.localeCompare(right.id));
    return structuredClone({ items, marks, origins });
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
  public createCursor(offset: number, affinity: "before" | "after"): string {
    assertOffset(offset, this.text.length);
    const relative = Y.createRelativePositionFromTypeIndex(
      this.text,
      offset,
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
    offset: number,
    inserted: string,
    origin: OriginRecord,
  ): void {
    assertOffset(offset, this.text.length);
    if (inserted.length === 0) {
      throw new TypeError("Inserted carrier text must not be empty.");
    }
    const snapshot = this.snapshot();
    const attributes: Record<string, string | boolean> = {
      [ORIGIN_ATTRIBUTE]: origin.id,
    };
    for (const mark of snapshot.marks) {
      if (markAppliesAtInsertion(mark, offset)) {
        attributes[encodeMarkKey(mark)] = true;
      }
    }

    const serializedOrigin = JSON.stringify(origin);
    const existing = this.origins.get(origin.id);
    if (existing !== undefined && existing !== serializedOrigin) {
      throw new TypeError("An OriginId cannot identify conflicting attribution.");
    }

    this.document.transact(() => {
      if (existing === undefined) {
        this.origins.set(origin.id, serializedOrigin);
      }
      this.text.insert(offset, inserted, attributes);
    });
  }
}

/** Factory for the common Yjs qualification suite. */
export const yjsContentCarrierFactory: ContentCarrierFactory = {
  candidate: "yjs",
  create: () => new YjsContentCarrier(),
  load: (encoded) => new YjsContentCarrier(encoded),
};

function appendItems(
  items: ContentItem[],
  inserted: string,
  originId: ReturnType<typeof parseOriginId>,
): void {
  let textStart = 0;
  for (let index = 0; index <= inserted.length; index += 1) {
    if (index < inserted.length && inserted[index] !== "\n") {
      continue;
    }
    if (index > textStart) {
      appendText(items, inserted.slice(textStart, index), originId);
    }
    if (index < inserted.length) {
      items.push({ kind: "hardBreak", originId });
    }
    textStart = index + 1;
  }
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
    throw new RangeError("Carrier offset is outside content.");
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
