import * as Y from "yjs";

import type {
  ContentItem,
  FormattingMark,
  InlineContentValue,
  OriginRecord,
} from "../domain/content.js";
import { validateInlineContentValue } from "../domain/content.js";
import type { BlockId } from "../domain/ids.js";
import {
  parseBlockId,
  parseContributionId,
  parseContributorId,
  parseInlineContentId,
  parseOriginId,
} from "../domain/ids.js";
import type { ContentCarrierOperation } from "./contentCarrier.js";
import {
  assertRuntimeUtf16Offset,
  validateContentCarrierOperations,
} from "./contentOperationValidation.js";
import type {
  CollaborativeDocumentCarrier,
  CollaborativeDocumentCarrierChange,
  CollaborativeDocumentCarrierFactory,
  CollaborativeDocumentCarrierSnapshot,
} from "./collaborativeDocumentCarrier.js";
import { decodeMarkKey, encodeMarkKey } from "./markCodec.js";
import type { StructuralPositionCodec } from "./position.js";
import type {
  StructuralCarrierEntrySnapshot,
  StructuralCarrierSnapshot,
} from "./structuralCarrier.js";
import {
  decodeStructuralPlacement,
  encodeStructuralPlacement,
} from "./structuralCarrier.js";
import { YjsTextFormattingCache } from "./yjsTextFormattingCache.js";

const ROOT_ID_NAME = "rootId";
const BLOCKS_NAME = "blocks";
const INLINE_CONTENTS_NAME = "inlineContents";
const CONTRIBUTIONS_NAME = "contributions";
const PLACEMENT_KEY = "placement";
const PAYLOAD_KEY = "payload";
const LIVENESS_KEY = "liveness";
const INLINE_TEXT_KEY = "text";
const INLINE_ORIGINS_KEY = "origins";
const ORIGIN_ATTRIBUTE = "coedit:origin";
const ROOT_TOKEN = "__root__";

interface YTextDeltaOperation {
  readonly insert: string;
  readonly attributes?: Readonly<Record<string, unknown>>;
}

/** Yjs v13 candidate for one complete logical collaborative Coedit document. */
export class YjsCollaborativeDocumentCarrier<
  Position,
> implements CollaborativeDocumentCarrier<Position> {
  public readonly candidate = "yjs" as const;

  private readonly positionCodec: StructuralPositionCodec<Position>;
  private readonly document: Y.Doc;
  private readonly metadata: Y.Map<string>;
  private readonly blocks: Y.Map<Y.Map<unknown>>;
  private readonly inlineContents: Y.Map<Y.Map<unknown>>;
  private readonly contributions: Y.Map<string>;
  private readonly formattingCaches = new WeakMap<
    Y.Text,
    YjsTextFormattingCache
  >();

  /** Creates logical-document genesis or reloads one complete encoded state. */
  public constructor(
    positionCodec: StructuralPositionCodec<Position>,
    rootId?: BlockId,
    encoded?: Uint8Array,
  ) {
    this.positionCodec = positionCodec;
    this.document = new Y.Doc();
    this.metadata = this.document.getMap<string>(ROOT_ID_NAME);
    this.blocks = this.document.getMap<Y.Map<unknown>>(BLOCKS_NAME);
    this.inlineContents =
      this.document.getMap<Y.Map<unknown>>(INLINE_CONTENTS_NAME);
    this.contributions = this.document.getMap<string>(CONTRIBUTIONS_NAME);
    if (encoded !== undefined) {
      Y.applyUpdate(this.document, encoded);
    }
    if (rootId !== undefined) {
      this.initializeRoot(rootId);
    }
    if (this.metadata.get(ROOT_ID_NAME) === undefined) {
      throw new TypeError("Collaborative carrier state has no root identity.");
    }
  }

  /** Applies one prevalidated Yjs transaction across structure, content, Origins, and metadata. */
  public applyChange(
    change: CollaborativeDocumentCarrierChange<Position>,
  ): void {
    this.validateChange(change);
    this.document.transact(() => {
      const structural = change.structural;
      for (const blockId of structural?.deletes ?? []) {
        this.retireObservedTokens(blockId);
      }
      for (const update of structural?.normalizations ?? []) {
        const entry = this.requireBlockEntry(update.blockId);
        entry.set(
          PLACEMENT_KEY,
          encodeStructuralPlacement(update.placement, this.positionCodec),
        );
      }
      for (const update of structural?.placements ?? []) {
        const entry = this.requireOrCreateBlockEntry(update.blockId);
        entry.set(
          PLACEMENT_KEY,
          encodeStructuralPlacement(update.placement, this.positionCodec),
        );
        this.liveness(entry).set(update.liveToken, true);
      }
      for (const update of structural?.payloads ?? []) {
        const entry = this.requireBlockEntry(update.blockId);
        this.payload(entry).set(update.key, update.value);
        this.liveness(entry).set(update.liveToken, true);
      }
      for (const initialization of change.inlineContents ?? []) {
        this.initializeInlineContent(
          initialization.inlineContentId,
          initialization.content,
        );
      }
      for (const mutation of change.inlineContentMutations ?? []) {
        this.applyInlineContentOperations(
          mutation.inlineContentId,
          mutation.operations,
        );
      }
      for (const contribution of change.contributions ?? []) {
        this.contributions.set(
          contribution.contributionId,
          contribution.metadata,
        );
      }
    });
  }

  /** Projects a detached snapshot from the one shared Yjs document. */
  public snapshot(): CollaborativeDocumentCarrierSnapshot<Position> {
    const inlineContents = [...this.inlineContents.entries()]
      .map(([rawInlineContentId, entry]) => ({
        inlineContentId: parseInlineContentId(rawInlineContentId),
        content: this.projectInlineContent(entry),
      }))
      .sort((left, right) =>
        left.inlineContentId.localeCompare(right.inlineContentId),
      );
    const contributions = [...this.contributions.entries()]
      .map(([rawContributionId, metadata]) => ({
        contributionId: parseContributionId(rawContributionId),
        metadata,
      }))
      .sort((left, right) =>
        left.contributionId.localeCompare(right.contributionId),
      );
    return {
      structural: this.snapshotStructural(),
      inlineContents,
      contributions,
    };
  }

  /** Projects one actual InlineContent from the shared Yjs document. */
  public snapshotInlineContent(
    inlineContentId: ReturnType<typeof parseInlineContentId>,
  ): InlineContentValue | undefined {
    const entry = this.inlineContents.get(inlineContentId);
    return entry === undefined ? undefined : this.projectInlineContent(entry);
  }

  /** Creates one serialized Yjs relative position inside an InlineContent. */
  public createInlineContentCursor(
    inlineContentId: ReturnType<typeof parseInlineContentId>,
    runtimeUtf16Offset: number,
    affinity: "before" | "after",
  ): string {
    const entry = this.requireInlineContentEntry(inlineContentId);
    const text = this.inlineText(entry);
    assertRuntimeUtf16Offset(runtimeUtf16Offset, text.length);
    const relative = Y.createRelativePositionFromTypeIndex(
      text,
      runtimeUtf16Offset,
      affinity === "before" ? -1 : 0,
    );
    return bytesToBase64(Y.encodeRelativePosition(relative));
  }

  /** Resolves one serialized cursor only when it belongs to the expected InlineContent. */
  public resolveInlineContentCursor(
    inlineContentId: ReturnType<typeof parseInlineContentId>,
    cursor: string,
  ): number | undefined {
    const entry = this.inlineContents.get(inlineContentId);
    if (entry === undefined) {
      return undefined;
    }
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
    return absolute?.type === this.inlineText(entry)
      ? absolute.index
      : undefined;
  }

  /** Encodes all replicated Yjs state for this logical document. */
  public encode(): Uint8Array {
    return Y.encodeStateAsUpdate(this.document);
  }

  /** Applies one complete or incremental Yjs update to this logical document. */
  public mergeEncoded(encoded: Uint8Array): void {
    Y.applyUpdate(this.document, encoded);
  }

  private validateChange(
    change: CollaborativeDocumentCarrierChange<Position>,
  ): void {
    const rootId = this.metadata.get(ROOT_ID_NAME)!;
    const structural = change.structural;
    const existingBlocks = new Set(this.blocks.keys());
    const newBlocks = new Set<string>();

    for (const blockId of structural?.deletes ?? []) {
      if (blockId === rootId) {
        throw new TypeError("The structural root cannot be moved or deleted.");
      }
      if (!existingBlocks.has(blockId)) {
        throw new TypeError(
          "Structural update requires an existing Block namespace.",
        );
      }
    }
    for (const update of structural?.normalizations ?? []) {
      if (update.blockId === rootId) {
        throw new TypeError("The structural root cannot be moved or deleted.");
      }
      if (!existingBlocks.has(update.blockId)) {
        throw new TypeError(
          "Structural update requires an existing Block namespace.",
        );
      }
      encodeStructuralPlacement(update.placement, this.positionCodec);
    }
    for (const update of structural?.placements ?? []) {
      if (update.blockId === rootId) {
        throw new TypeError("The structural root cannot be moved or deleted.");
      }
      encodeStructuralPlacement(update.placement, this.positionCodec);
      newBlocks.add(update.blockId);
    }
    for (const update of structural?.payloads ?? []) {
      if (
        !existingBlocks.has(update.blockId) &&
        !newBlocks.has(update.blockId)
      ) {
        throw new TypeError(
          "Structural update requires an existing Block namespace.",
        );
      }
    }

    const inlineIds = new Set(this.inlineContents.keys());
    const initializedContents = new Map<string, InlineContentValue>();
    for (const initialization of change.inlineContents ?? []) {
      parseInlineContentId(initialization.inlineContentId);
      if (inlineIds.has(initialization.inlineContentId)) {
        throw new TypeError(
          "InlineContent identity already exists in the carrier.",
        );
      }
      inlineIds.add(initialization.inlineContentId);
      const validation = validateInlineContentValue(initialization.content);
      if (!validation.ok) {
        throw new TypeError(validation.error.message);
      }
      initializedContents.set(
        initialization.inlineContentId,
        initialization.content,
      );
    }

    const mutatedInlineIds = new Set<string>();
    for (const mutation of change.inlineContentMutations ?? []) {
      parseInlineContentId(mutation.inlineContentId);
      if (mutatedInlineIds.has(mutation.inlineContentId)) {
        throw new TypeError(
          "One logical change can contain only one mutation batch per InlineContent.",
        );
      }
      mutatedInlineIds.add(mutation.inlineContentId);

      const existingEntry = this.inlineContents.get(mutation.inlineContentId);
      if (existingEntry !== undefined) {
        validateContentCarrierOperations(
          mutation.operations,
          this.inlineText(existingEntry).length,
          this.inlineOrigins(existingEntry).entries(),
        );
        continue;
      }
      const initialized = initializedContents.get(mutation.inlineContentId);
      if (initialized === undefined) {
        throw new TypeError(
          "InlineContent mutation requires an existing or same-change initialized namespace.",
        );
      }
      validateContentCarrierOperations(
        mutation.operations,
        inlineContentRuntimeUtf16Length(initialized),
        initialized.origins.map(
          (origin) => [origin.id, JSON.stringify(origin)] as const,
        ),
      );
    }

    const contributionIds = new Set(this.contributions.keys());
    for (const contribution of change.contributions ?? []) {
      parseContributionId(contribution.contributionId);
      if (contributionIds.has(contribution.contributionId)) {
        throw new TypeError(
          "Contribution identity already exists in the carrier.",
        );
      }
      contributionIds.add(contribution.contributionId);
    }
  }

  private initializeRoot(rootId: BlockId): void {
    this.document.transact(() => {
      const existingRoot = this.metadata.get(ROOT_ID_NAME);
      if (existingRoot !== undefined && existingRoot !== rootId) {
        throw new TypeError(
          "Collaborative carrier root identity cannot change.",
        );
      }
      this.metadata.set(ROOT_ID_NAME, rootId);
      const entry = this.requireOrCreateBlockEntry(rootId);
      this.liveness(entry).set(ROOT_TOKEN, true);
    });
  }

  private initializeInlineContent(
    inlineContentId: string,
    content: InlineContentValue,
  ): void {
    const entry = new Y.Map<unknown>();
    const text = new Y.Text();
    const origins = new Y.Map<string>();
    entry.set(INLINE_TEXT_KEY, text);
    entry.set(INLINE_ORIGINS_KEY, origins);
    this.inlineContents.set(inlineContentId, entry);

    for (const origin of content.origins) {
      origins.set(origin.id, JSON.stringify(origin));
    }
    for (const item of content.items) {
      const attributes: Record<string, string | boolean> = {
        [ORIGIN_ATTRIBUTE]: item.originId,
      };
      for (const mark of item.marks) {
        attributes[encodeMarkKey(mark)] = true;
      }
      text.insert(
        text.length,
        item.kind === "text" ? item.text : "\n",
        attributes,
      );
    }
  }

  private applyInlineContentOperations(
    inlineContentId: string,
    operations: readonly ContentCarrierOperation[],
  ): void {
    const entry = this.requireInlineContentEntry(inlineContentId);
    const text = this.inlineText(entry);
    const origins = this.inlineOrigins(entry);
    for (const operation of operations) {
      switch (operation.kind) {
        case "insertText":
          this.insertInlineString(
            text,
            origins,
            operation.runtimeUtf16Offset,
            operation.text,
            operation.origin,
          );
          break;
        case "insertHardBreak":
          this.insertInlineString(
            text,
            origins,
            operation.runtimeUtf16Offset,
            "\n",
            operation.origin,
          );
          break;
        case "deleteRange":
          if (
            operation.startRuntimeUtf16Offset !==
            operation.endRuntimeUtf16Offset
          ) {
            text.delete(
              operation.startRuntimeUtf16Offset,
              operation.endRuntimeUtf16Offset -
                operation.startRuntimeUtf16Offset,
            );
          }
          break;
        case "addMark":
          text.format(
            operation.startRuntimeUtf16Offset,
            operation.endRuntimeUtf16Offset - operation.startRuntimeUtf16Offset,
            { [encodeMarkKey(operation.mark)]: true },
          );
          break;
        case "removeMark":
          if (
            operation.startRuntimeUtf16Offset !==
            operation.endRuntimeUtf16Offset
          ) {
            text.format(
              operation.startRuntimeUtf16Offset,
              operation.endRuntimeUtf16Offset -
                operation.startRuntimeUtf16Offset,
              { [encodeMarkKey(operation.mark)]: null },
            );
          }
          break;
      }
    }
  }

  private insertInlineString(
    text: Y.Text,
    origins: Y.Map<string>,
    runtimeUtf16Offset: number,
    inserted: string,
    origin: OriginRecord,
  ): void {
    if (origins.get(origin.id) === undefined) {
      origins.set(origin.id, JSON.stringify(origin));
    }
    text.insert(runtimeUtf16Offset, inserted, {
      [ORIGIN_ATTRIBUTE]: origin.id,
      ...this.formattingCache(text).attributesAtInsertion(runtimeUtf16Offset),
    });
  }

  private formattingCache(text: Y.Text): YjsTextFormattingCache {
    const existing = this.formattingCaches.get(text);
    if (existing !== undefined) {
      return existing;
    }
    const created = new YjsTextFormattingCache(text, ORIGIN_ATTRIBUTE);
    this.formattingCaches.set(text, created);
    return created;
  }

  private snapshotStructural(): StructuralCarrierSnapshot<Position> {
    const entries: StructuralCarrierEntrySnapshot<Position>[] = [];
    for (const [rawBlockId, entry] of this.blocks.entries()) {
      const blockId = parseBlockId(rawBlockId);
      const placementValue = entry.get(PLACEMENT_KEY);
      const placement =
        typeof placementValue === "string"
          ? decodeStructuralPlacement(placementValue, this.positionCodec)
          : undefined;
      entries.push({
        blockId,
        ...(placement === undefined ? {} : { placement }),
        payload: Object.fromEntries(this.payload(entry).entries()),
        live: [...this.liveness(entry).values()].some(
          (value) => value === true,
        ),
      });
    }
    entries.sort((left, right) => left.blockId.localeCompare(right.blockId));
    return {
      rootId: parseBlockId(this.metadata.get(ROOT_ID_NAME)!),
      entries,
    };
  }

  private projectInlineContent(entry: Y.Map<unknown>): InlineContentValue {
    const text = this.inlineText(entry);
    const items: ContentItem[] = [];
    const delta = text.toDelta() as unknown as readonly YTextDeltaOperation[];
    for (const operation of delta) {
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
    const origins = [...this.inlineOrigins(entry).values()]
      .map(parseStoredOrigin)
      .sort((left, right) => left.id.localeCompare(right.id));
    return structuredClone({ items, origins });
  }

  private retireObservedTokens(blockId: BlockId): void {
    const entry = this.requireBlockEntry(blockId);
    const liveness = this.liveness(entry);
    for (const [token, live] of liveness.entries()) {
      if (live) {
        liveness.set(token, false);
      }
    }
  }

  private requireOrCreateBlockEntry(blockId: BlockId): Y.Map<unknown> {
    const existing = this.blocks.get(blockId);
    if (existing !== undefined) {
      return existing;
    }
    const entry = new Y.Map<unknown>();
    entry.set(PAYLOAD_KEY, new Y.Map<string>());
    entry.set(LIVENESS_KEY, new Y.Map<boolean>());
    this.blocks.set(blockId, entry);
    return entry;
  }

  private requireBlockEntry(blockId: BlockId): Y.Map<unknown> {
    const entry = this.blocks.get(blockId);
    if (entry === undefined) {
      throw new TypeError(
        "Structural update requires an existing Block namespace.",
      );
    }
    return entry;
  }

  private payload(entry: Y.Map<unknown>): Y.Map<string> {
    const value = entry.get(PAYLOAD_KEY);
    if (!(value instanceof Y.Map)) {
      throw new TypeError("Structural Block payload namespace is invalid.");
    }
    return value as Y.Map<string>;
  }

  private liveness(entry: Y.Map<unknown>): Y.Map<boolean> {
    const value = entry.get(LIVENESS_KEY);
    if (!(value instanceof Y.Map)) {
      throw new TypeError("Structural Block liveness namespace is invalid.");
    }
    return value as Y.Map<boolean>;
  }

  private requireInlineContentEntry(inlineContentId: string): Y.Map<unknown> {
    const entry = this.inlineContents.get(inlineContentId);
    if (entry === undefined) {
      throw new TypeError("InlineContent namespace is unavailable.");
    }
    return entry;
  }

  private inlineText(entry: Y.Map<unknown>): Y.Text {
    const value = entry.get(INLINE_TEXT_KEY);
    if (!(value instanceof Y.Text)) {
      throw new TypeError("InlineContent text namespace is invalid.");
    }
    return value;
  }

  private inlineOrigins(entry: Y.Map<unknown>): Y.Map<string> {
    const value = entry.get(INLINE_ORIGINS_KEY);
    if (!(value instanceof Y.Map)) {
      throw new TypeError("InlineContent Origin namespace is invalid.");
    }
    return value as Y.Map<string>;
  }
}

/** Creates a Yjs logical-document carrier factory for one opaque position codec. */
export function createYjsCollaborativeDocumentCarrierFactory<Position>(
  positionCodec: StructuralPositionCodec<Position>,
): CollaborativeDocumentCarrierFactory<Position> {
  return {
    candidate: "yjs",
    create: (rootId) =>
      new YjsCollaborativeDocumentCarrier(positionCodec, rootId),
    load: (encoded) =>
      new YjsCollaborativeDocumentCarrier(positionCodec, undefined, encoded),
  };
}

function inlineContentRuntimeUtf16Length(value: InlineContentValue): number {
  return value.items.reduce(
    (total, item) => total + (item.kind === "text" ? item.text.length : 1),
    0,
  );
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
  items.push({
    kind: "text",
    text,
    originId,
    marks: structuredClone(marks),
  });
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
