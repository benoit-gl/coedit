import * as Y from "yjs";

import type { BlockId, InlineContentId } from "../../../src/domain/index.js";
import {
  parseBlockId,
  parseInlineContentId,
} from "../../../src/domain/index.js";
import type {
  StructuralPlacement,
  StructuralPositionCodec,
  StructuralPositionOrdering,
} from "../../../src/carrier/index.js";
import {
  decodeStructuralPlacement,
  encodeStructuralPlacement,
} from "../../../src/carrier/index.js";
import {
  assertTextOffset,
  assertTextRange,
  isQualificationFineGrainedMediaType,
} from "../payload/carrier.js";
import type {
  QualificationOrigin,
  QualificationPayloadSnapshot,
  QualificationTextSpan,
} from "../payload/carrier.js";
import type {
  IntegratedDocumentCarrier,
  IntegratedDocumentCarrierFactory,
  IntegratedDocumentChange,
  IntegratedDocumentSnapshot,
  IntegratedInlineContentCreation,
  IntegratedPayloadChange,
} from "./carrier.js";
import {
  captureHistoricalState,
  decodeHistoricalState,
} from "./historicalState.js";

const ROOT = "integrated";
const ROOT_ID = "rootId";
const LINEAGE_ID = "lineageId";
const BLOCKS = "blocks";
const PAYLOADS = "payloads";
const INLINE_CONTENT_OWNERS = "inlineContentOwners";
const INLINE_CONTENT_LIVENESS = "inlineContentLiveness";
const LIVENESS = "liveness";
const HISTORICAL_STATES = "historicalStates";
const ORIGIN = "coedit:origin";
const ENVELOPE_SEPARATOR = 0;
const ROOT_ID_BYTE_LENGTH = 36;

/** Yjs candidate backed by one native document for integrated qualification. */
class YjsIntegratedDocumentCarrier<
  Position,
> implements IntegratedDocumentCarrier<Position> {
  public readonly candidate = "yjs" as const;
  private readonly document = new Y.Doc();
  private readonly root = this.document.getMap<unknown>(ROOT);

  public constructor(
    private readonly positionCodec: StructuralPositionCodec<Position>,
    rootId?: BlockId,
    encoded?: Uint8Array,
  ) {
    if (encoded !== undefined) {
      const decoded = decodeEnvelope(encoded);
      Y.applyUpdate(this.document, decoded.update);
      if (this.requireRootId() !== decoded.rootId)
        throw new TypeError("Integrated carrier root identity is invalid.");
    } else if (rootId !== undefined) {
      this.root.set(ROOT_ID, rootId);
      this.root.set(LINEAGE_ID, crypto.randomUUID());
      this.root.set(BLOCKS, new Y.Map<string>());
      this.root.set(PAYLOADS, new Y.Map<Y.Map<unknown>>());
      this.root.set(INLINE_CONTENT_OWNERS, new Y.Map<string>());
      this.root.set(INLINE_CONTENT_LIVENESS, new Y.Map<Y.Map<boolean>>());
      this.root.set(LIVENESS, new Y.Map<Y.Map<boolean>>());
      this.root.set(HISTORICAL_STATES, new Y.Map<string>());
    } else {
      throw new TypeError(
        "Integrated carrier creation requires a root identity.",
      );
    }
    this.requireRootId();
    this.requireLineageId();
    this.blocks();
    this.payloads();
    this.inlineContentOwners();
    this.inlineContentLiveness();
    this.liveness();
    this.historicalStates();
  }

  public applyChange(change: IntegratedDocumentChange<Position>): void {
    const rootId = this.requireRootId();
    const snapshot = this.snapshot();
    const placements = (change.placements ?? []).map((update) => {
      if (update.blockId === rootId)
        throw new TypeError("The integrated root cannot have a placement.");
      if (snapshot.blockLiveness.get(update.blockId) === false)
        throw new TypeError("Integrated Block identity cannot be reused.");
      if (this.inlineContentOwners().has(update.blockId))
        throw new TypeError("Integrated durable identity is already used.");
      return {
        blockId: update.blockId,
        encoded: encodeStructuralPlacement(
          update.placement,
          this.positionCodec,
        ),
      };
    });
    const payloads = preparePayloadChanges(
      change.payloads ?? [],
      snapshot.payloads,
    );
    const inlineContents = prepareInlineContentCreations(
      change,
      snapshot,
      new Set([...this.inlineContentOwners().keys()].map(parseInlineContentId)),
      new Set([rootId, ...this.liveness().keys()]),
    );
    const deletes = prepareDeletes(
      change.deleteBlockIds ?? [],
      rootId,
      snapshot,
    );
    applyPreparedChange(
      this.document,
      placements,
      inlineContents,
      payloads,
      deletes,
    );
  }

  public snapshot(): IntegratedDocumentSnapshot<Position> {
    const placements = new Map<BlockId, StructuralPlacement<Position>>();
    const liveBlocks = this.liveBlockIds();
    const blockLiveness = new Map<BlockId, boolean>([
      [this.requireRootId(), true],
    ]);
    for (const [rawId, tokens] of this.liveness())
      blockLiveness.set(
        parseBlockId(rawId),
        [...tokens.values()].some((value) => value === true),
      );
    blockLiveness.set(this.requireRootId(), true);
    for (const [rawId, encoded] of this.blocks()) {
      const blockId = parseBlockId(rawId);
      if (!liveBlocks.has(blockId)) continue;
      placements.set(
        blockId,
        decodeStructuralPlacement(encoded, this.positionCodec),
      );
    }
    const payloads = new Map<InlineContentId, QualificationPayloadSnapshot>();
    const inlineContentOwners = new Map<InlineContentId, BlockId>();
    for (const [rawId, rawOwnerId] of this.inlineContentOwners()) {
      const inlineContentId = parseInlineContentId(rawId);
      const ownerId = parseBlockId(rawOwnerId);
      if (!isLive(this.inlineContentLiveness(), inlineContentId)) continue;
      if (!liveBlocks.has(ownerId)) continue;
      const payload = this.payloads().get(rawId);
      if (payload === undefined)
        throw new TypeError("Integrated InlineContent payload is missing.");
      inlineContentOwners.set(inlineContentId, ownerId);
      payloads.set(inlineContentId, projectPayload(payload));
    }
    return {
      rootId: this.requireRootId(),
      blockLiveness,
      placements,
      inlineContentOwners,
      payloads,
    };
  }

  public captureHistoricalState(): string {
    const token = crypto.randomUUID();
    const state = captureHistoricalState(this.snapshot(), this.positionCodec);
    this.historicalStates().set(token, state);
    return token;
  }

  public materializeHistoricalState(
    token: string,
  ): IntegratedDocumentSnapshot<Position> {
    const state = this.historicalStates().get(token);
    if (state === undefined)
      throw new TypeError("Historical qualification state is unknown.");
    const snapshot = decodeHistoricalState(state, this.positionCodec);
    if (snapshot.rootId !== this.requireRootId())
      throw new TypeError("Historical qualification root is invalid.");
    return snapshot;
  }

  public restoreHistoricalState(token: string): void {
    const target = this.materializeHistoricalState(token);
    const rootId = this.requireRootId();
    const owners = this.inlineContentOwners();
    const liveness = this.root.get(LIVENESS);
    if (!(liveness instanceof Y.Map))
      throw new TypeError("Integrated liveness namespace is missing.");
    for (const [id, owner] of target.inlineContentOwners)
      if (owners.get(id) !== owner)
        throw new TypeError("Historical InlineContent ownership is invalid.");
    for (const id of target.placements.keys())
      if (!this.blocks().has(id) || !this.liveness().has(id))
        throw new TypeError("Historical Block lifetime is missing.");
    for (const id of target.inlineContentOwners.keys())
      if (!this.inlineContentLiveness().has(id))
        throw new TypeError("Historical InlineContent lifetime is missing.");
    const placements = [...target.placements].map(([id, placement]) => ({
      id,
      encoded: encodeStructuralPlacement(placement, this.positionCodec),
      livenessToken: crypto.randomUUID(),
    }));
    const payloads = [...target.payloads].map(([id, payload]) => ({
      id,
      value: createRestoredPayload(payload),
    }));
    const inlineContentLiveness = [...target.inlineContentOwners.keys()].map(
      (id) => ({ id, livenessToken: crypto.randomUUID() }),
    );
    this.document.transact(() => {
      for (const id of liveness.keys())
        if (id !== rootId) retireObservedTokens(liveness, id);
      for (const id of this.inlineContentLiveness().keys())
        retireObservedTokens(
          this.inlineContentLiveness() as Y.Map<unknown>,
          id,
        );
      for (const { id, encoded, livenessToken } of placements) {
        this.blocks().set(id, encoded);
        addLiveToken(liveness, id, livenessToken);
      }
      for (const { id, livenessToken } of inlineContentLiveness)
        addLiveToken(
          this.inlineContentLiveness() as Y.Map<unknown>,
          id,
          livenessToken,
        );
      for (const { id, value } of payloads) {
        this.payloads().set(id, value);
      }
    });
  }

  public encode(): Uint8Array {
    return encodeEnvelope(
      this.requireRootId(),
      Y.encodeStateAsUpdate(this.document),
    );
  }

  public mergeEncoded(encoded: Uint8Array): void {
    const decoded = decodeEnvelope(encoded);
    const currentRoot = this.requireRootId();
    if (decoded.rootId !== currentRoot)
      throw new TypeError("Integrated replicas must share one root identity.");

    const remote = new Y.Doc();
    Y.applyUpdate(remote, decoded.update);
    const remoteRoot = remote.getMap<unknown>(ROOT);
    if (remoteRoot.get(ROOT_ID) !== currentRoot)
      throw new TypeError("Integrated carrier root identity is invalid.");
    if (remoteRoot.get(LINEAGE_ID) !== this.requireLineageId())
      throw new TypeError(
        "Integrated replicas must share one replica lineage.",
      );

    const staged = new Y.Doc();
    Y.applyUpdate(staged, Y.encodeStateAsUpdate(this.document));
    Y.applyUpdate(staged, decoded.update);
    if (staged.getMap<unknown>(ROOT).get(ROOT_ID) !== currentRoot)
      throw new TypeError("Integrated carrier root identity is invalid.");

    Y.applyUpdate(this.document, decoded.update);
  }

  private requireRootId(): BlockId {
    const value = this.root.get(ROOT_ID);
    if (typeof value !== "string")
      throw new TypeError("Integrated root identity is missing.");
    return parseBlockId(value);
  }
  private requireLineageId(): string {
    const value = this.root.get(LINEAGE_ID);
    if (typeof value !== "string" || value.length === 0)
      throw new TypeError("Integrated replica lineage is missing.");
    return value;
  }
  private blocks(): Y.Map<string> {
    const value = this.root.get(BLOCKS);
    if (!(value instanceof Y.Map))
      throw new TypeError("Integrated structural namespace is missing.");
    return value as Y.Map<string>;
  }
  private payloads(): Y.Map<Y.Map<unknown>> {
    const value = this.root.get(PAYLOADS);
    if (!(value instanceof Y.Map))
      throw new TypeError("Integrated payload namespace is missing.");
    return value as Y.Map<Y.Map<unknown>>;
  }
  private inlineContentOwners(): Y.Map<string> {
    const value = this.root.get(INLINE_CONTENT_OWNERS);
    if (!(value instanceof Y.Map))
      throw new TypeError("Integrated ownership namespace is missing.");
    return value as Y.Map<string>;
  }
  private inlineContentLiveness(): Y.Map<Y.Map<boolean>> {
    const value = this.root.get(INLINE_CONTENT_LIVENESS);
    if (!(value instanceof Y.Map))
      throw new TypeError(
        "Integrated InlineContent liveness namespace is missing.",
      );
    return value as Y.Map<Y.Map<boolean>>;
  }
  private liveness(): Y.Map<Y.Map<boolean>> {
    const value = this.root.get(LIVENESS);
    if (!(value instanceof Y.Map))
      throw new TypeError("Integrated liveness namespace is missing.");
    return value as Y.Map<Y.Map<boolean>>;
  }
  private historicalStates(): Y.Map<string> {
    const value = this.root.get(HISTORICAL_STATES);
    if (!(value instanceof Y.Map))
      throw new TypeError("Integrated historical namespace is missing.");
    return value as Y.Map<string>;
  }
  private liveBlockIds(): ReadonlySet<BlockId> {
    const live = new Set<BlockId>([this.requireRootId()]);
    for (const [rawId, tokens] of this.liveness()) {
      if ([...tokens.values()].some((value) => value === true))
        live.add(parseBlockId(rawId));
    }
    return live;
  }
}

function applyPreparedChange(
  document: Y.Doc,
  placements: readonly {
    readonly blockId: BlockId;
    readonly encoded: string;
  }[],
  inlineContents: readonly IntegratedInlineContentCreation[],
  payloads: readonly PreparedPayloadChange[],
  deletes: readonly BlockId[],
): void {
  const root = document.getMap<unknown>(ROOT);
  const blocks = root.get(BLOCKS);
  const payloadMap = root.get(PAYLOADS);
  const owners = root.get(INLINE_CONTENT_OWNERS);
  const inlineContentLiveness = root.get(INLINE_CONTENT_LIVENESS);
  const liveness = root.get(LIVENESS);
  if (
    !(blocks instanceof Y.Map) ||
    !(payloadMap instanceof Y.Map) ||
    !(owners instanceof Y.Map) ||
    !(inlineContentLiveness instanceof Y.Map) ||
    !(liveness instanceof Y.Map)
  )
    throw new TypeError("Integrated document is invalid.");

  document.transact(() => {
    for (const blockId of deletes) retireObservedTokens(liveness, blockId);
    for (const update of placements) {
      (blocks as Y.Map<string>).set(update.blockId, update.encoded);
      addLiveToken(liveness, update.blockId);
    }
    for (const creation of inlineContents) {
      (owners as Y.Map<string>).set(creation.inlineContentId, creation.blockId);
      addLiveToken(
        inlineContentLiveness as Y.Map<unknown>,
        creation.inlineContentId,
      );
    }
    for (const update of payloads) {
      const ownerId = (owners as Y.Map<string>).get(update.inlineContentId);
      if (ownerId === undefined)
        throw new TypeError("Integrated InlineContent owner is missing.");
      if (update.kind === "replace-text") {
        addLiveToken(liveness, parseBlockId(ownerId));
        addLiveToken(
          inlineContentLiveness as Y.Map<unknown>,
          update.inlineContentId,
        );
        const payload = new Y.Map<unknown>();
        payload.set("kind", "text");
        payload.set("mediaType", update.mediaType);
        const text = new Y.Text();
        if (update.text.length > 0)
          text.insert(0, update.text, { [ORIGIN]: update.origin });
        payload.set("text", text);
        (payloadMap as Y.Map<Y.Map<unknown>>).set(
          update.inlineContentId,
          payload,
        );
        continue;
      }
      if (update.kind === "replace-opaque") {
        addLiveToken(liveness, parseBlockId(ownerId));
        addLiveToken(
          inlineContentLiveness as Y.Map<unknown>,
          update.inlineContentId,
        );
        const payload = new Y.Map<unknown>();
        payload.set("kind", "opaque");
        payload.set("mediaType", update.mediaType);
        payload.set("bytes", update.bytes);
        payload.set("origin", update.origin);
        (payloadMap as Y.Map<Y.Map<unknown>>).set(
          update.inlineContentId,
          payload,
        );
        continue;
      }
      const payload = (payloadMap as Y.Map<Y.Map<unknown>>).get(
        update.inlineContentId,
      );
      const text = payload?.get("text");
      if (!(text instanceof Y.Text))
        throw new TypeError("Fine-grained operations require a text payload.");
      if (update.kind === "insert-text") {
        if (update.text.length > 0) {
          addLiveToken(liveness, parseBlockId(ownerId));
          addLiveToken(
            inlineContentLiveness as Y.Map<unknown>,
            update.inlineContentId,
          );
          text.insert(update.offset, update.text, { [ORIGIN]: update.origin });
        }
      } else if (update.start !== update.end) {
        addLiveToken(liveness, parseBlockId(ownerId));
        addLiveToken(
          inlineContentLiveness as Y.Map<unknown>,
          update.inlineContentId,
        );
        text.delete(update.start, update.end - update.start);
      }
    }
  });
}

/** Creates the Yjs integrated qualification factory. */
export function createYjsIntegratedDocumentCarrierFactory<Position>(
  positionCodec: StructuralPositionCodec<Position>,
  positionOrdering: StructuralPositionOrdering<Position>,
): IntegratedDocumentCarrierFactory<Position> {
  return {
    candidate: "yjs",
    positionCodec,
    positionOrdering,
    create: (rootId) => new YjsIntegratedDocumentCarrier(positionCodec, rootId),
    load: (encoded) =>
      new YjsIntegratedDocumentCarrier(positionCodec, undefined, encoded),
  };
}

type PreparedPayloadChange =
  | (Omit<
      Extract<IntegratedPayloadChange, { readonly kind: "replace-text" }>,
      "origin"
    > & { readonly origin: string })
  | (Omit<
      Extract<IntegratedPayloadChange, { readonly kind: "replace-opaque" }>,
      "origin"
    > & { readonly origin: string })
  | (Omit<
      Extract<IntegratedPayloadChange, { readonly kind: "insert-text" }>,
      "origin"
    > & { readonly origin: string })
  | Extract<IntegratedPayloadChange, { readonly kind: "delete-text" }>;

function prepareInlineContentCreations<Position>(
  change: IntegratedDocumentChange<Position>,
  snapshot: IntegratedDocumentSnapshot<Position>,
  retainedOwnershipIds: ReadonlySet<InlineContentId>,
  retainedBlockIds: ReadonlySet<string>,
): readonly IntegratedInlineContentCreation[] {
  const created = new Set<InlineContentId>();
  const availableBlocks = new Set([
    snapshot.rootId,
    ...snapshot.placements.keys(),
  ]);
  for (const placement of change.placements ?? [])
    availableBlocks.add(placement.blockId);
  const payloadIds = new Set(
    (change.payloads ?? []).map((payload) => payload.inlineContentId),
  );
  for (const creation of change.inlineContents ?? []) {
    if (retainedOwnershipIds.has(creation.inlineContentId))
      throw new TypeError("Integrated InlineContent ownership is immutable.");
    if (
      retainedBlockIds.has(creation.inlineContentId) ||
      (change.placements ?? []).some(
        (placement) => String(placement.blockId) === creation.inlineContentId,
      )
    )
      throw new TypeError("Integrated durable identity is already used.");
    if (created.has(creation.inlineContentId))
      throw new TypeError("Integrated InlineContent creation is duplicated.");
    if (!availableBlocks.has(creation.blockId))
      throw new TypeError(
        "Integrated InlineContent owner must be a live Block.",
      );
    if (!payloadIds.has(creation.inlineContentId))
      throw new TypeError(
        "Integrated InlineContent creation requires a payload.",
      );
    created.add(creation.inlineContentId);
  }
  for (const payload of change.payloads ?? []) {
    if (
      !snapshot.inlineContentOwners.has(payload.inlineContentId) &&
      !created.has(payload.inlineContentId)
    )
      throw new TypeError(
        "Integrated payload requires an owned InlineContent.",
      );
  }
  return change.inlineContents ?? [];
}

function prepareDeletes<Position>(
  deletes: readonly BlockId[],
  rootId: BlockId,
  snapshot: IntegratedDocumentSnapshot<Position>,
): readonly BlockId[] {
  const unique = new Set<BlockId>();
  for (const blockId of deletes) {
    if (blockId === rootId)
      throw new TypeError("The integrated root cannot be deleted.");
    if (!snapshot.placements.has(blockId))
      throw new TypeError("Integrated deletion requires a live Block.");
    unique.add(blockId);
  }
  return [...unique];
}

function addLiveToken(
  liveness: Y.Map<unknown>,
  id: string,
  token = crypto.randomUUID(),
): void {
  let tokens = liveness.get(id);
  if (!(tokens instanceof Y.Map)) {
    tokens = new Y.Map<boolean>();
    liveness.set(id, tokens);
  }
  (tokens as Y.Map<boolean>).set(token, true);
}

function retireObservedTokens(liveness: Y.Map<unknown>, id: string): void {
  const tokens = liveness.get(id);
  if (!(tokens instanceof Y.Map)) return;
  for (const [token, live] of tokens)
    if (live === true) tokens.set(token, false);
}

function isLive(liveness: Y.Map<Y.Map<boolean>>, id: string): boolean {
  return [...(liveness.get(id)?.values() ?? [])].some(
    (value) => value === true,
  );
}

function createRestoredPayload(
  payload: QualificationPayloadSnapshot,
): Y.Map<unknown> {
  const restored = new Y.Map<unknown>();
  restored.set("kind", payload.kind);
  restored.set("mediaType", payload.mediaType);
  if (payload.kind === "opaque") {
    restored.set("bytes", payload.bytes.slice());
    restored.set("origin", encodeOrigin(payload.origin));
    return restored;
  }
  const text = new Y.Text();
  let offset = 0;
  for (const span of payload.spans) {
    text.insert(offset, span.text, { [ORIGIN]: encodeOrigin(span.origin) });
    offset += span.text.length;
  }
  restored.set("text", text);
  return restored;
}

function preparePayloadChanges(
  changes: readonly IntegratedPayloadChange[],
  current: ReadonlyMap<InlineContentId, QualificationPayloadSnapshot>,
): readonly PreparedPayloadChange[] {
  const working = new Map(current);
  const prepared: PreparedPayloadChange[] = [];
  for (const change of changes) {
    if (change.kind === "replace-text") {
      if (!isQualificationFineGrainedMediaType(change.mediaType))
        throw new TypeError(
          "Text replacement requires an allowlisted Media Type.",
        );
      assertYjsExactText(change.text);
      const origin = encodeOrigin(change.origin);
      working.set(change.inlineContentId, {
        kind: "text",
        mediaType: change.mediaType,
        text: change.text,
        spans:
          change.text.length === 0
            ? []
            : [{ text: change.text, origin: change.origin }],
      });
      prepared.push({ ...change, origin });
    } else if (change.kind === "replace-opaque") {
      if (isQualificationFineGrainedMediaType(change.mediaType))
        throw new TypeError("Allowlisted Media Types require text payloads.");
      const origin = encodeOrigin(change.origin);
      const bytes = new Uint8Array(change.bytes);
      working.set(change.inlineContentId, {
        kind: "opaque",
        mediaType: change.mediaType,
        bytes,
        origin: change.origin,
      });
      prepared.push({ ...change, bytes, origin });
    } else {
      const payload = working.get(change.inlineContentId);
      if (payload?.kind !== "text")
        throw new TypeError(
          "Fine-grained operations require an existing text payload.",
        );
      if (change.kind === "insert-text") {
        assertTextOffset(change.offset, payload.text);
        assertYjsExactText(change.text);
        const text =
          payload.text.slice(0, change.offset) +
          change.text +
          payload.text.slice(change.offset);
        if (
          requiresYjsTextRewrite(payload.text, text, (preflight) =>
            preflight.insert(change.offset, change.text),
          )
        )
          throw new TypeError(
            "Yjs cannot preserve this ECMAScript string exactly.",
          );
        const origin = encodeOrigin(change.origin);
        working.set(change.inlineContentId, { ...payload, text });
        prepared.push({ ...change, origin });
      } else {
        assertTextRange(change.start, change.end, payload.text);
        const text =
          payload.text.slice(0, change.start) + payload.text.slice(change.end);
        if (
          requiresYjsTextRewrite(payload.text, text, (preflight) =>
            preflight.delete(change.start, change.end - change.start),
          )
        )
          throw new TypeError(
            "Yjs cannot preserve this ECMAScript string exactly.",
          );
        working.set(change.inlineContentId, { ...payload, text });
        prepared.push(change);
      }
    }
  }
  return prepared;
}

function assertYjsExactText(text: string): void {
  for (let index = 0; index < text.length; index += 1) {
    const codeUnit = text.charCodeAt(index);
    if (codeUnit >= 0xd800 && codeUnit <= 0xdbff) {
      const next = text.charCodeAt(index + 1);
      if (index + 1 >= text.length || next < 0xdc00 || next > 0xdfff)
        throw new TypeError(
          "Yjs cannot preserve this ECMAScript string exactly.",
        );
      index += 1;
      continue;
    }
    if (codeUnit >= 0xdc00 && codeUnit <= 0xdfff) {
      throw new TypeError(
        "Yjs cannot preserve this ECMAScript string exactly.",
      );
    }
  }
}

function requiresYjsTextRewrite(
  current: string,
  expected: string,
  edit: (text: Y.Text) => void,
): boolean {
  assertYjsExactText(expected);
  const document = new Y.Doc();
  const text = document.getText("text-edit-preflight");
  text.insert(0, current);
  edit(text);
  const projected = (text.toDelta() as readonly { readonly insert?: unknown }[])
    .map((operation) => {
      if (typeof operation.insert !== "string")
        throw new TypeError("Yjs text edit result is invalid.");
      return operation.insert;
    })
    .join("");
  return projected !== expected;
}

function encodeOrigin(origin: QualificationOrigin): string {
  const id = origin.id;
  const kind = origin.kind;
  if (
    typeof id !== "string" ||
    !["human", "imported", "automation", "ai", "unknown"].includes(kind)
  )
    throw new TypeError("Integrated payload Origin is invalid.");
  return JSON.stringify({ id, kind });
}

function projectPayload(payload: Y.Map<unknown>): QualificationPayloadSnapshot {
  const kind = payload.get("kind");
  const mediaType = payload.get("mediaType");
  if (typeof mediaType !== "string" || (kind !== "text" && kind !== "opaque"))
    throw new TypeError("Integrated payload metadata is invalid.");
  if (kind === "opaque") {
    const bytes = payload.get("bytes");
    const origin = parseOrigin(payload.get("origin"));
    if (!(bytes instanceof Uint8Array))
      throw new TypeError("Integrated opaque bytes are invalid.");
    return { kind, mediaType, bytes: bytes.slice(), origin };
  }
  const text = payload.get("text");
  if (!(text instanceof Y.Text))
    throw new TypeError("Integrated text payload is invalid.");
  const spans: QualificationTextSpan[] = [];
  let projected = "";
  for (const op of text.toDelta() as readonly {
    readonly insert?: unknown;
    readonly attributes?: Readonly<Record<string, unknown>>;
  }[]) {
    if (typeof op.insert !== "string")
      throw new TypeError("Integrated text must contain strings.");
    projected += op.insert;
    if (op.insert.length > 0)
      spans.push({
        text: op.insert,
        origin: parseOrigin(op.attributes?.[ORIGIN]),
      });
  }
  return { kind, mediaType, text: projected, spans };
}
function parseOrigin(value: unknown): QualificationOrigin {
  if (typeof value !== "string")
    throw new TypeError("Integrated payload Origin is missing.");
  const parsed: unknown = JSON.parse(value);
  if (
    typeof parsed !== "object" ||
    parsed === null ||
    !("id" in parsed) ||
    typeof parsed.id !== "string" ||
    !("kind" in parsed) ||
    !["human", "imported", "automation", "ai", "unknown"].includes(
      String(parsed.kind),
    )
  )
    throw new TypeError("Integrated payload Origin is invalid.");
  return parsed as QualificationOrigin;
}
function encodeEnvelope(rootId: BlockId, update: Uint8Array): Uint8Array {
  const encoded = new Uint8Array(ROOT_ID_BYTE_LENGTH + 1 + update.length);
  for (let i = 0; i < ROOT_ID_BYTE_LENGTH; i += 1)
    encoded[i] = rootId.charCodeAt(i);
  encoded[ROOT_ID_BYTE_LENGTH] = ENVELOPE_SEPARATOR;
  encoded.set(update, ROOT_ID_BYTE_LENGTH + 1);
  return encoded;
}
function decodeEnvelope(encoded: Uint8Array): {
  readonly rootId: BlockId;
  readonly update: Uint8Array;
} {
  if (
    encoded.length < ROOT_ID_BYTE_LENGTH + 1 ||
    encoded[ROOT_ID_BYTE_LENGTH] !== ENVELOPE_SEPARATOR
  )
    throw new TypeError("Integrated Yjs envelope is invalid.");
  let raw = "";
  for (let i = 0; i < ROOT_ID_BYTE_LENGTH; i += 1)
    raw += String.fromCharCode(encoded[i]!);
  return {
    rootId: parseBlockId(raw),
    update: encoded.subarray(ROOT_ID_BYTE_LENGTH + 1),
  };
}
