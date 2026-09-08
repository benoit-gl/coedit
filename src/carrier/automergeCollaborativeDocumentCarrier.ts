import * as Automerge from "@automerge/automerge";

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

const ROOT_TOKEN = "__root__";
const ORIGIN_MARK = "__coedit_origin";

interface AutomergeBlockEntry extends Record<string, unknown> {
  placement?: string;
  payload: Record<string, string>;
  liveness: Record<string, boolean>;
}

interface AutomergeInlineContentEntry extends Record<string, unknown> {
  text: string;
  origins: Record<string, string>;
}

interface AutomergeCollaborativeDocumentState extends Record<string, unknown> {
  rootId: string;
  blocks: Record<string, AutomergeBlockEntry>;
  inlineContents: Record<string, AutomergeInlineContentEntry>;
  contributions: Record<string, string>;
}

interface DecodedAutomergeFormattingMark {
  readonly mark: Automerge.Mark;
  readonly descriptor: FormattingMark;
}

/** Automerge v3 candidate for one complete logical collaborative Coedit document. */
export class AutomergeCollaborativeDocumentCarrier<
  Position,
> implements CollaborativeDocumentCarrier<Position> {
  public readonly candidate = "automerge" as const;

  private readonly positionCodec: StructuralPositionCodec<Position>;
  private document: Automerge.Doc<AutomergeCollaborativeDocumentState>;

  /** Creates logical-document genesis or reloads one complete encoded state. */
  public constructor(
    positionCodec: StructuralPositionCodec<Position>,
    rootId?: BlockId,
    encoded?: Uint8Array,
  ) {
    this.positionCodec = positionCodec;
    if (encoded !== undefined) {
      this.document =
        Automerge.load<AutomergeCollaborativeDocumentState>(encoded);
    } else if (rootId !== undefined) {
      this.document = Automerge.from<AutomergeCollaborativeDocumentState>({
        rootId,
        blocks: {
          [rootId]: {
            payload: {},
            liveness: { [ROOT_TOKEN]: true },
          },
        },
        inlineContents: {},
        contributions: {},
      });
    } else {
      throw new TypeError(
        "Collaborative carrier creation requires a root identity.",
      );
    }
    parseBlockId(this.document.rootId);
  }

  /** Applies one Automerge change across structure, content, Origins, and metadata. */
  public applyChange(
    change: CollaborativeDocumentCarrierChange<Position>,
  ): void {
    this.validateChange(change);
    const rootId = this.document.rootId;
    this.document = Automerge.change(this.document, (draft) => {
      const structural = change.structural;
      for (const blockId of structural?.deletes ?? []) {
        const entry = requireDraftBlockEntry(draft, blockId);
        for (const token of Object.keys(entry.liveness)) {
          if (entry.liveness[token] === true) {
            entry.liveness[token] = false;
          }
        }
      }
      for (const update of structural?.normalizations ?? []) {
        const entry = requireDraftBlockEntry(draft, update.blockId);
        entry.placement = encodeStructuralPlacement(
          update.placement,
          this.positionCodec,
        );
      }
      for (const update of structural?.placements ?? []) {
        if (update.blockId === rootId) {
          throw new TypeError(
            "The structural root cannot be moved or deleted.",
          );
        }
        const entry = requireOrCreateDraftBlockEntry(draft, update.blockId);
        entry.placement = encodeStructuralPlacement(
          update.placement,
          this.positionCodec,
        );
        entry.liveness[update.liveToken] = true;
      }
      for (const update of structural?.payloads ?? []) {
        const entry = requireDraftBlockEntry(draft, update.blockId);
        entry.payload[update.key] = update.value;
        entry.liveness[update.liveToken] = true;
      }
      for (const initialization of change.inlineContents ?? []) {
        initializeDraftInlineContent(
          draft,
          initialization.inlineContentId,
          initialization.content,
        );
      }
      for (const mutation of change.inlineContentMutations ?? []) {
        applyDraftInlineContentOperations(
          draft,
          mutation.inlineContentId,
          mutation.operations,
        );
      }
      for (const contribution of change.contributions ?? []) {
        draft.contributions[contribution.contributionId] =
          contribution.metadata;
      }
    });
  }

  /** Projects a detached snapshot from the one shared Automerge document. */
  public snapshot(): CollaborativeDocumentCarrierSnapshot<Position> {
    const inlineContents = Object.keys(this.document.inlineContents)
      .map((rawInlineContentId) => ({
        inlineContentId: parseInlineContentId(rawInlineContentId),
        content: snapshotInlineContent(this.document, rawInlineContentId),
      }))
      .sort((left, right) =>
        left.inlineContentId.localeCompare(right.inlineContentId),
      );
    const contributions = Object.entries(this.document.contributions)
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

  /** Projects one actual InlineContent from the shared Automerge document. */
  public snapshotInlineContent(
    inlineContentId: ReturnType<typeof parseInlineContentId>,
  ): InlineContentValue | undefined {
    return this.document.inlineContents[inlineContentId] === undefined
      ? undefined
      : snapshotInlineContent(this.document, inlineContentId);
  }

  /** Creates one Automerge cursor inside an InlineContent namespace. */
  public createInlineContentCursor(
    inlineContentId: ReturnType<typeof parseInlineContentId>,
    runtimeUtf16Offset: number,
    affinity: "before" | "after",
  ): string {
    const entry = this.document.inlineContents[inlineContentId];
    if (entry === undefined) {
      throw new TypeError("InlineContent namespace is unavailable.");
    }
    assertRuntimeUtf16Offset(runtimeUtf16Offset, entry.text.length);
    return Automerge.getCursor(
      this.document,
      ["inlineContents", inlineContentId, "text"],
      runtimeUtf16Offset,
      affinity,
    );
  }

  /** Resolves one Automerge cursor inside its expected InlineContent namespace. */
  public resolveInlineContentCursor(
    inlineContentId: ReturnType<typeof parseInlineContentId>,
    cursor: string,
  ): number | undefined {
    if (this.document.inlineContents[inlineContentId] === undefined) {
      return undefined;
    }
    try {
      return Automerge.getCursorPosition(
        this.document,
        ["inlineContents", inlineContentId, "text"],
        cursor,
      );
    } catch {
      return undefined;
    }
  }

  /** Saves all replicated Automerge state for this logical document. */
  public encode(): Uint8Array {
    return Automerge.save(this.document);
  }

  /** Loads and merges complete Automerge state from another logical-document replica. */
  public mergeEncoded(encoded: Uint8Array): void {
    const remote = Automerge.load<AutomergeCollaborativeDocumentState>(encoded);
    if (remote.rootId !== this.document.rootId) {
      throw new TypeError(
        "Collaborative replicas must share one root identity.",
      );
    }
    this.document = Automerge.merge(this.document, remote);
  }

  private validateChange(
    change: CollaborativeDocumentCarrierChange<Position>,
  ): void {
    const rootId = this.document.rootId;
    const structural = change.structural;
    const existingBlocks = new Set(Object.keys(this.document.blocks));
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

    const inlineIds = new Set(Object.keys(this.document.inlineContents));
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

      const existing = this.document.inlineContents[mutation.inlineContentId];
      if (existing !== undefined) {
        validateContentCarrierOperations(
          mutation.operations,
          existing.text.length,
          Object.entries(existing.origins),
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

    const contributionIds = new Set(Object.keys(this.document.contributions));
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

  private snapshotStructural(): StructuralCarrierSnapshot<Position> {
    const entries: StructuralCarrierEntrySnapshot<Position>[] = [];
    for (const [rawBlockId, entry] of Object.entries(this.document.blocks)) {
      const blockId = parseBlockId(rawBlockId);
      entries.push({
        blockId,
        ...(entry.placement === undefined
          ? {}
          : {
              placement: decodeStructuralPlacement(
                entry.placement,
                this.positionCodec,
              ),
            }),
        payload: structuredClone(entry.payload),
        live: Object.values(entry.liveness).some((value) => value === true),
      });
    }
    entries.sort((left, right) => left.blockId.localeCompare(right.blockId));
    return {
      rootId: parseBlockId(this.document.rootId),
      entries,
    };
  }
}

/** Creates an Automerge logical-document carrier factory for one opaque position codec. */
export function createAutomergeCollaborativeDocumentCarrierFactory<Position>(
  positionCodec: StructuralPositionCodec<Position>,
): CollaborativeDocumentCarrierFactory<Position> {
  return {
    candidate: "automerge",
    create: (rootId) =>
      new AutomergeCollaborativeDocumentCarrier(positionCodec, rootId),
    load: (encoded) =>
      new AutomergeCollaborativeDocumentCarrier(
        positionCodec,
        undefined,
        encoded,
      ),
  };
}

function initializeDraftInlineContent(
  draft: Automerge.ChangeFn<AutomergeCollaborativeDocumentState> extends (
    value: infer Draft,
  ) => unknown
    ? Draft
    : never,
  inlineContentId: string,
  content: InlineContentValue,
): void {
  draft.inlineContents[inlineContentId] = { text: "", origins: {} };
  const entry = draft.inlineContents[inlineContentId];
  for (const origin of content.origins) {
    entry.origins[origin.id] = JSON.stringify(origin);
  }

  const path = ["inlineContents", inlineContentId, "text"];
  const ranges: Array<{
    readonly start: number;
    readonly end: number;
    readonly originId: string;
    readonly marks: readonly FormattingMark[];
  }> = [];
  let runtimeUtf16Offset = 0;
  for (const item of content.items) {
    const inserted = item.kind === "text" ? item.text : "\n";
    const endRuntimeUtf16Offset = runtimeUtf16Offset + inserted.length;
    Automerge.splice(draft, path, runtimeUtf16Offset, 0, inserted);
    ranges.push({
      start: runtimeUtf16Offset,
      end: endRuntimeUtf16Offset,
      originId: item.originId,
      marks: item.marks,
    });
    runtimeUtf16Offset = endRuntimeUtf16Offset;
  }
  for (const range of ranges) {
    Automerge.mark(
      draft,
      path,
      { start: range.start, end: range.end, expand: "none" },
      ORIGIN_MARK,
      range.originId,
    );
    for (const mark of range.marks) {
      Automerge.mark(
        draft,
        path,
        {
          start: range.start,
          end: range.end,
          expand: toAutomergeExpansion(mark.boundaryPolicy),
        },
        encodeMarkKey(mark),
        true,
      );
    }
  }
}

function applyDraftInlineContentOperations(
  draft: Automerge.ChangeFn<AutomergeCollaborativeDocumentState> extends (
    value: infer Draft,
  ) => unknown
    ? Draft
    : never,
  inlineContentId: string,
  operations: readonly ContentCarrierOperation[],
): void {
  const entry = draft.inlineContents[inlineContentId];
  if (entry === undefined) {
    throw new TypeError("InlineContent namespace is unavailable.");
  }
  const path = ["inlineContents", inlineContentId, "text"];
  for (const operation of operations) {
    switch (operation.kind) {
      case "insertText":
        insertDraftInlineString(
          draft,
          entry,
          path,
          operation.runtimeUtf16Offset,
          operation.text,
          operation.origin,
        );
        break;
      case "insertHardBreak":
        insertDraftInlineString(
          draft,
          entry,
          path,
          operation.runtimeUtf16Offset,
          "\n",
          operation.origin,
        );
        break;
      case "deleteRange":
        if (
          operation.startRuntimeUtf16Offset !== operation.endRuntimeUtf16Offset
        ) {
          Automerge.splice(
            draft,
            path,
            operation.startRuntimeUtf16Offset,
            operation.endRuntimeUtf16Offset - operation.startRuntimeUtf16Offset,
          );
        }
        break;
      case "addMark":
        Automerge.mark(
          draft,
          path,
          {
            start: operation.startRuntimeUtf16Offset,
            end: operation.endRuntimeUtf16Offset,
            expand: toAutomergeExpansion(operation.mark.boundaryPolicy),
          },
          encodeMarkKey(operation.mark),
          true,
        );
        break;
      case "removeMark":
        if (
          operation.startRuntimeUtf16Offset !== operation.endRuntimeUtf16Offset
        ) {
          Automerge.unmark(
            draft,
            path,
            {
              start: operation.startRuntimeUtf16Offset,
              end: operation.endRuntimeUtf16Offset,
              expand: "none",
            },
            encodeMarkKey(operation.mark),
          );
        }
        break;
    }
  }
}

function insertDraftInlineString(
  draft: Automerge.ChangeFn<AutomergeCollaborativeDocumentState> extends (
    value: infer Draft,
  ) => unknown
    ? Draft
    : never,
  entry: AutomergeInlineContentEntry,
  path: readonly string[],
  runtimeUtf16Offset: number,
  inserted: string,
  origin: OriginRecord,
): void {
  if (entry.origins[origin.id] === undefined) {
    entry.origins[origin.id] = JSON.stringify(origin);
  }
  Automerge.splice(draft, [...path], runtimeUtf16Offset, 0, inserted);
  Automerge.mark(
    draft,
    [...path],
    {
      start: runtimeUtf16Offset,
      end: runtimeUtf16Offset + inserted.length,
      expand: "none",
    },
    ORIGIN_MARK,
    origin.id,
  );
}

function inlineContentRuntimeUtf16Length(value: InlineContentValue): number {
  return value.items.reduce(
    (total, item) => total + (item.kind === "text" ? item.text.length : 1),
    0,
  );
}

function snapshotInlineContent(
  document: Automerge.Doc<AutomergeCollaborativeDocumentState>,
  inlineContentId: string,
): InlineContentValue {
  const entry = document.inlineContents[inlineContentId];
  if (entry === undefined) {
    throw new TypeError("InlineContent namespace is unavailable.");
  }
  const path = ["inlineContents", inlineContentId, "text"];
  const rawMarks = Automerge.marks(document, path);
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
        value,
      ): value is {
        readonly mark: Automerge.Mark;
        readonly descriptor: FormattingMark;
      } => value.descriptor !== undefined,
    );
  const items = projectItems(entry.text, originMarks, formattingMarks);
  const origins = Object.values(entry.origins)
    .map(parseStoredOrigin)
    .sort((left, right) => left.id.localeCompare(right.id));
  return structuredClone({ items, origins });
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
        (value) =>
          value.mark.start <= runtimeUtf16Offset &&
          value.mark.end > runtimeUtf16Offset,
      )
      .map((value) => value.descriptor)
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

function requireDraftBlockEntry(
  draft: Automerge.ChangeFn<AutomergeCollaborativeDocumentState> extends (
    value: infer Draft,
  ) => unknown
    ? Draft
    : never,
  blockId: BlockId,
): AutomergeBlockEntry {
  const entry = draft.blocks[blockId];
  if (entry === undefined) {
    throw new TypeError(
      "Structural update requires an existing Block namespace.",
    );
  }
  return entry;
}

function requireOrCreateDraftBlockEntry(
  draft: Automerge.ChangeFn<AutomergeCollaborativeDocumentState> extends (
    value: infer Draft,
  ) => unknown
    ? Draft
    : never,
  blockId: BlockId,
): AutomergeBlockEntry {
  const existing = draft.blocks[blockId];
  if (existing !== undefined) {
    return existing;
  }
  draft.blocks[blockId] = { payload: {}, liveness: {} };
  return draft.blocks[blockId];
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
