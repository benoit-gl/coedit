import * as Automerge from "@automerge/automerge";

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
} from "./carrier.js";
import { decodeEffectContext, encodeEffectContext } from "./effectContext.js";
import { decodePayloadEffect, encodePayloadEffect } from "./replacementEvidence.js";
import type { RecordedPayloadEffect } from "./replacementEvidence.js";
import type { QualificationEffectContext } from "./effectContext.js";
import {
  captureHistoricalState,
  decodeHistoricalState,
} from "./historicalState.js";

const ORIGIN_MARK = "__coedit_origin";

interface TextState extends Record<string, unknown> {
  kind: "text";
  mediaType: string;
  text: string;
}
interface OpaqueState extends Record<string, unknown> {
  kind: "opaque";
  mediaType: string;
  bytes: number[];
  origin: string;
}
interface State extends Record<string, unknown> {
  rootId: string;
  lineageId: string;
  blocks: Record<string, string>;
  liveness: Record<string, Record<string, boolean>>;
  inlineContentOwners: Record<string, string>;
  inlineContentLiveness: Record<string, Record<string, boolean>>;
  payloads: Record<string, TextState | OpaqueState>;
  historicalStates: Record<string, string>;
  effectContexts: Record<string, string>;
  payloadEffects: Record<string, string>;
}

/** Automerge candidate backed by one native document for integrated qualification. */
class AutomergeIntegratedDocumentCarrier<
  Position,
> implements IntegratedDocumentCarrier<Position> {
  public readonly candidate = "automerge" as const;
  private document: Automerge.Doc<State>;

  public constructor(
    private readonly positionCodec: StructuralPositionCodec<Position>,
    rootId?: BlockId,
    encoded?: Uint8Array,
  ) {
    if (encoded !== undefined) this.document = Automerge.load<State>(encoded);
    else if (rootId !== undefined)
      this.document = Automerge.from<State>({
        rootId,
        lineageId: crypto.randomUUID(),
        blocks: {},
        liveness: {},
        inlineContentOwners: {},
        inlineContentLiveness: {},
        payloads: {},
        historicalStates: {},
        effectContexts: {},
        payloadEffects: {},
      });
    else
      throw new TypeError(
        "Integrated carrier creation requires a root identity.",
      );
    parseBlockId(this.document.rootId);
    requireLineageId(this.document.lineageId);
  }

  public applyChange(change: IntegratedDocumentChange<Position>): void {
    const snapshot = this.snapshot();
    validateChange(
      change,
      snapshot,
      new Set(Object.keys(this.document.inlineContentOwners)),
    );
    const inlineContents = prepareInlineContentCreations(
      change,
      snapshot,
      new Set(
        Object.keys(this.document.inlineContentOwners).map(
          parseInlineContentId,
        ),
      ),
      new Set([this.document.rootId, ...Object.keys(this.document.liveness)]),
    );
    const context = this.prepareContext(change.context);
    const evidence = context === undefined || (change.payloads?.length ?? 0) === 0
      ? undefined : {id: context.id, encoded: encodePayloadEffect(context.id,
        Object.keys(this.document.payloadEffects), change.payloads ?? [])};
    const deletes = prepareDeletes(change.deleteBlockIds ?? [], snapshot);
    this.document = Automerge.change(this.document, (draft) => {
      if (context !== undefined) draft.effectContexts[context.id] = context.encoded;
      if (evidence !== undefined) draft.payloadEffects[evidence.id] = evidence.encoded;
      for (const blockId of deletes)
        retireObservedTokens(draft.liveness, blockId);
      for (const update of change.placements ?? []) {
        if (update.blockId === draft.rootId)
          throw new TypeError("The integrated root cannot have a placement.");
        draft.blocks[update.blockId] = encodeStructuralPlacement(
          update.placement,
          this.positionCodec,
        );
        addLiveToken(draft.liveness, update.blockId);
      }
      for (const creation of inlineContents) {
        draft.inlineContentOwners[creation.inlineContentId] = creation.blockId;
        addLiveToken(draft.inlineContentLiveness, creation.inlineContentId);
      }
      for (const update of change.payloads ?? []) {
        const ownerId = draft.inlineContentOwners[update.inlineContentId];
        if (ownerId === undefined)
          throw new TypeError("Integrated InlineContent owner is missing.");
        if (update.kind === "replace-text") {
          addLiveToken(draft.liveness, parseBlockId(ownerId));
          addLiveToken(draft.inlineContentLiveness, update.inlineContentId);
          draft.payloads[update.inlineContentId] = {
            kind: "text",
            mediaType: update.mediaType,
            text: "",
          };
          if (update.text.length > 0) {
            Automerge.splice(
              draft,
              ["payloads", update.inlineContentId, "text"],
              0,
              0,
              update.text,
            );
            Automerge.mark(
              draft,
              ["payloads", update.inlineContentId, "text"],
              { start: 0, end: update.text.length, expand: "none" },
              ORIGIN_MARK,
              encodeOrigin(update.origin),
            );
          }
        } else if (update.kind === "replace-opaque") {
          addLiveToken(draft.liveness, parseBlockId(ownerId));
          addLiveToken(draft.inlineContentLiveness, update.inlineContentId);
          draft.payloads[update.inlineContentId] = {
            kind: "opaque",
            mediaType: update.mediaType,
            bytes: [...update.bytes],
            origin: encodeOrigin(update.origin),
          };
        } else {
          const payload = draft.payloads[update.inlineContentId];
          if (payload?.kind !== "text")
            throw new TypeError(
              "Fine-grained operations require an existing text payload.",
            );
          if (update.kind === "insert-text") {
            if (update.text.length > 0) {
              addLiveToken(draft.liveness, parseBlockId(ownerId));
              addLiveToken(draft.inlineContentLiveness, update.inlineContentId);
              Automerge.splice(
                draft,
                ["payloads", update.inlineContentId, "text"],
                update.offset,
                0,
                update.text,
              );
              Automerge.mark(
                draft,
                ["payloads", update.inlineContentId, "text"],
                {
                  start: update.offset,
                  end: update.offset + update.text.length,
                  expand: "none",
                },
                ORIGIN_MARK,
                encodeOrigin(update.origin),
              );
            }
          } else if (update.start !== update.end) {
            addLiveToken(draft.liveness, parseBlockId(ownerId));
            addLiveToken(draft.inlineContentLiveness, update.inlineContentId);
            Automerge.splice(
              draft,
              ["payloads", update.inlineContentId, "text"],
              update.start,
              update.end - update.start,
            );
          }
        }
      }
    });
  }

  public snapshot(): IntegratedDocumentSnapshot<Position> {
    const placements = new Map<BlockId, StructuralPlacement<Position>>();
    const liveBlocks = liveBlockIds(this.document);
    const blockLiveness = new Map<BlockId, boolean>([
      [parseBlockId(this.document.rootId), true],
    ]);
    for (const [rawId, tokens] of Object.entries(this.document.liveness))
      blockLiveness.set(
        parseBlockId(rawId),
        Object.values(tokens).some((value) => value === true),
      );
    blockLiveness.set(parseBlockId(this.document.rootId), true);
    for (const [rawId, encoded] of Object.entries(this.document.blocks)) {
      if (!liveBlocks.has(rawId)) continue;
      placements.set(
        parseBlockId(rawId),
        decodeStructuralPlacement(encoded, this.positionCodec),
      );
    }
    const payloads = new Map<InlineContentId, QualificationPayloadSnapshot>();
    const inlineContentOwners = new Map<InlineContentId, BlockId>();
    for (const [rawId, rawOwnerId] of Object.entries(
      this.document.inlineContentOwners,
    )) {
      if (!isLive(this.document.inlineContentLiveness, rawId)) continue;
      if (!liveBlocks.has(rawOwnerId)) continue;
      const payload = this.document.payloads[rawId];
      if (payload === undefined)
        throw new TypeError("Integrated InlineContent payload is missing.");
      const inlineContentId = parseInlineContentId(rawId);
      inlineContentOwners.set(inlineContentId, parseBlockId(rawOwnerId));
      payloads.set(
        inlineContentId,
        projectPayload(this.document, rawId, payload),
      );
    }
    return {
      rootId: parseBlockId(this.document.rootId),
      blockLiveness,
      placements,
      inlineContentOwners,
      payloads,
    };
  }

  public captureHistoricalState(): string {
    const token = crypto.randomUUID();
    const state = captureHistoricalState(this.snapshot(), this.positionCodec);
    this.document = Automerge.change(this.document, (draft) => {
      draft.historicalStates[token] = state;
    });
    return token;
  }

  public materializeHistoricalState(
    token: string,
  ): IntegratedDocumentSnapshot<Position> {
    const state = this.document.historicalStates[token];
    if (state === undefined)
      throw new TypeError("Historical qualification state is unknown.");
    const snapshot = decodeHistoricalState(state, this.positionCodec);
    if (snapshot.rootId !== this.document.rootId)
      throw new TypeError("Historical qualification root is invalid.");
    return snapshot;
  }

  public restoreHistoricalState(token: string, context?: QualificationEffectContext): void {
    const target = this.materializeHistoricalState(token);
    const effect = this.prepareContext(context);
    for (const [id, owner] of target.inlineContentOwners)
      if (this.document.inlineContentOwners[id] !== owner)
        throw new TypeError("Historical InlineContent ownership is invalid.");
    for (const id of target.placements.keys())
      if (
        this.document.blocks[id] === undefined ||
        this.document.liveness[id] === undefined
      )
        throw new TypeError("Historical Block lifetime is missing.");
    for (const id of target.inlineContentOwners.keys())
      if (this.document.inlineContentLiveness[id] === undefined)
        throw new TypeError("Historical InlineContent lifetime is missing.");
    const placements = [...target.placements].map(([id, placement]) => ({
      id,
      encoded: encodeStructuralPlacement(placement, this.positionCodec),
      livenessToken: crypto.randomUUID(),
    }));
    const inlineContentLiveness = [...target.inlineContentOwners.keys()].map(
      (id) => ({ id, livenessToken: crypto.randomUUID() }),
    );
    this.document = Automerge.change(this.document, (draft) => {
      if (effect !== undefined) draft.effectContexts[effect.id] = effect.encoded;
      for (const id of Object.keys(draft.liveness))
        if (id !== draft.rootId) retireObservedTokens(draft.liveness, id);
      for (const id of Object.keys(draft.inlineContentLiveness))
        retireObservedTokens(draft.inlineContentLiveness, id);
      for (const { id, encoded, livenessToken } of placements) {
        draft.blocks[id] = encoded;
        addLiveToken(draft.liveness, id, livenessToken);
      }
      for (const { id, livenessToken } of inlineContentLiveness)
        addLiveToken(draft.inlineContentLiveness, id, livenessToken);
      for (const [id, payload] of target.payloads) {
        if (payload.kind === "opaque") {
          draft.payloads[id] = {
            kind: "opaque",
            mediaType: payload.mediaType,
            bytes: [...payload.bytes],
            origin: encodeOrigin(payload.origin),
          };
        } else {
          draft.payloads[id] = {
            kind: "text",
            mediaType: payload.mediaType,
            text: "",
          };
          let offset = 0;
          for (const span of payload.spans) {
            Automerge.splice(
              draft,
              ["payloads", id, "text"],
              offset,
              0,
              span.text,
            );
            Automerge.mark(
              draft,
              ["payloads", id, "text"],
              { start: offset, end: offset + span.text.length, expand: "none" },
              ORIGIN_MARK,
              encodeOrigin(span.origin),
            );
            offset += span.text.length;
          }
        }
      }
    });
  }

  public recordedPayloadEffects(): readonly RecordedPayloadEffect[] {
    return Object.entries(this.document.payloadEffects).sort(([left], [right]) => left.localeCompare(right))
      .map(([, encoded]) => decodePayloadEffect(encoded));
  }

  public effects(): ReadonlyMap<string, QualificationEffectContext> {
    return new Map(Object.entries(this.document.effectContexts).sort(([left], [right]) => left.localeCompare(right)).map(
      ([id, encoded]) => [id, decodeEffectContext(encoded)],
    ));
  }

  private prepareContext(context?: QualificationEffectContext): { id: string; encoded: string } | undefined {
    if (context === undefined) return undefined;
    const encoded = encodeEffectContext(context);
    const id = JSON.parse(encoded) as { effectId: string };
    if (this.document.effectContexts[id.effectId] !== undefined)
      throw new TypeError("Qualification effect identity cannot be reused.");
    return { id: id.effectId, encoded };
  }

  public encode(): Uint8Array {
    return Automerge.save(this.document);
  }

  public mergeEncoded(encoded: Uint8Array): void {
    const remote = Automerge.load<State>(encoded);
    if (remote.rootId !== this.document.rootId)
      throw new TypeError("Integrated replicas must share one root identity.");
    const currentLineage = requireLineageId(this.document.lineageId);
    const remoteLineage = requireLineageId(remote.lineageId);
    if (remoteLineage !== currentLineage)
      throw new TypeError(
        "Integrated replicas must share one replica lineage.",
      );
    this.document = Automerge.merge(this.document, remote);
  }
}

/** Creates the Automerge integrated qualification factory. */
export function createAutomergeIntegratedDocumentCarrierFactory<Position>(
  positionCodec: StructuralPositionCodec<Position>,
  positionOrdering: StructuralPositionOrdering<Position>,
): IntegratedDocumentCarrierFactory<Position> {
  return {
    candidate: "automerge",
    positionCodec,
    positionOrdering,
    create: (rootId) =>
      new AutomergeIntegratedDocumentCarrier(positionCodec, rootId),
    load: (encoded) =>
      new AutomergeIntegratedDocumentCarrier(positionCodec, undefined, encoded),
  };
}

function validateChange<Position>(
  change: IntegratedDocumentChange<Position>,
  snapshot: IntegratedDocumentSnapshot<Position>,
  retainedInlineIds: ReadonlySet<string>,
): void {
  for (const placement of change.placements ?? [])
    if (placement.blockId === snapshot.rootId)
      throw new TypeError("The integrated root cannot have a placement.");
    else if (snapshot.blockLiveness.get(placement.blockId) === false)
      throw new TypeError("Integrated Block identity cannot be reused.");
    else if (retainedInlineIds.has(placement.blockId))
      throw new TypeError("Integrated durable identity is already used.");
  const working = new Map(snapshot.payloads);
  for (const update of change.payloads ?? []) {
    if (update.kind === "replace-text") {
      if (!isQualificationFineGrainedMediaType(update.mediaType))
        throw new TypeError(
          "Text replacement requires an allowlisted Media Type.",
        );
      assertAutomergeExactText(update.text);
      working.set(update.inlineContentId, {
        kind: "text",
        mediaType: update.mediaType,
        text: update.text,
        spans:
          update.text.length === 0
            ? []
            : [{ text: update.text, origin: update.origin }],
      });
    } else if (update.kind === "replace-opaque") {
      if (isQualificationFineGrainedMediaType(update.mediaType))
        throw new TypeError("Allowlisted Media Types require text payloads.");
      working.set(update.inlineContentId, {
        kind: "opaque",
        mediaType: update.mediaType,
        bytes: update.bytes.slice(),
        origin: update.origin,
      });
    } else {
      const payload = working.get(update.inlineContentId);
      if (payload?.kind !== "text")
        throw new TypeError(
          "Fine-grained operations require an existing text payload.",
        );
      if (update.kind === "insert-text") {
        assertTextOffset(update.offset, payload.text);
        assertAutomergeExactText(update.text);
        const text =
          payload.text.slice(0, update.offset) +
          update.text +
          payload.text.slice(update.offset);
        assertAutomergeExactText(text);
        working.set(update.inlineContentId, {
          ...payload,
          text,
        });
      } else {
        assertTextRange(update.start, update.end, payload.text);
        const text =
          payload.text.slice(0, update.start) + payload.text.slice(update.end);
        assertAutomergeExactText(text);
        working.set(update.inlineContentId, {
          ...payload,
          text,
        });
      }
    }
  }
}

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
  snapshot: IntegratedDocumentSnapshot<Position>,
): readonly BlockId[] {
  const unique = new Set<BlockId>();
  for (const blockId of deletes) {
    if (blockId === snapshot.rootId)
      throw new TypeError("The integrated root cannot be deleted.");
    if (!snapshot.placements.has(blockId))
      throw new TypeError("Integrated deletion requires a live Block.");
    unique.add(blockId);
  }
  return [...unique];
}

function addLiveToken(
  liveness: Record<string, Record<string, boolean>>,
  id: string,
  token = crypto.randomUUID(),
): void {
  if (liveness[id] === undefined) {
    liveness[id] = { [token]: true };
    return;
  }
  liveness[id][token] = true;
}

function retireObservedTokens(
  liveness: Record<string, Record<string, boolean>>,
  id: string,
): void {
  const tokens = liveness[id];
  if (tokens === undefined) return;
  for (const token of Object.keys(tokens)) tokens[token] = false;
}

function isLive(
  liveness: Record<string, Record<string, boolean>> | undefined,
  id: string,
): boolean {
  if (liveness === undefined) return true;
  return Object.values(liveness[id] ?? {}).some((value) => value === true);
}

function liveBlockIds(document: Automerge.Doc<State>): ReadonlySet<string> {
  const live = new Set<string>([document.rootId]);
  for (const [blockId, tokens] of Object.entries(document.liveness ?? {}))
    if (Object.values(tokens).some((value) => value === true))
      live.add(blockId);
  return live;
}

function projectPayload(
  document: Automerge.Doc<State>,
  rawId: string,
  payload: TextState | OpaqueState,
): QualificationPayloadSnapshot {
  if (payload.kind === "opaque")
    return {
      kind: "opaque",
      mediaType: payload.mediaType,
      bytes: Uint8Array.from(payload.bytes),
      origin: parseOrigin(payload.origin),
    };
  const spans: QualificationTextSpan[] = [];
  const originMarks = Automerge.marks(document, ["payloads", rawId, "text"])
    .filter(
      (mark) => mark.name === ORIGIN_MARK && typeof mark.value === "string",
    )
    .sort((left, right) => left.start - right.start || left.end - right.end);
  let offset = 0;
  for (const mark of originMarks) {
    if (mark.start !== offset || typeof mark.value !== "string") {
      throw new TypeError("Integrated text Origin projection has a gap.");
    }
    const text = payload.text.slice(mark.start, mark.end);
    if (text.length > 0) {
      spans.push({ text, origin: parseOrigin(mark.value) });
    }
    offset = mark.end;
  }
  if (offset !== payload.text.length) {
    throw new TypeError("Integrated text is missing Origin.");
  }
  return {
    kind: "text",
    mediaType: payload.mediaType,
    text: payload.text,
    spans,
  };
}
function parseOrigin(value: string): QualificationOrigin {
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

function assertOrigin(origin: QualificationOrigin): void {
  const id = origin.id;
  const kind = origin.kind;
  if (
    typeof id !== "string" ||
    !["human", "imported", "automation", "ai", "unknown"].includes(kind)
  )
    throw new TypeError("Integrated payload Origin is invalid.");
}

function encodeOrigin(origin: QualificationOrigin): string {
  const id = origin.id;
  const kind = origin.kind;
  assertOrigin({ id, kind });
  return JSON.stringify({ id, kind });
}

function assertAutomergeExactText(text: string): void {
  for (let index = 0; index < text.length; index += 1) {
    const codeUnit = text.charCodeAt(index);
    if (codeUnit >= 0xd800 && codeUnit <= 0xdbff) {
      const next = text.charCodeAt(index + 1);
      if (index + 1 >= text.length || next < 0xdc00 || next > 0xdfff) {
        throw new TypeError(
          "Automerge cannot preserve this ECMAScript string exactly.",
        );
      }
      index += 1;
      continue;
    }
    if (codeUnit >= 0xdc00 && codeUnit <= 0xdfff) {
      throw new TypeError(
        "Automerge cannot preserve this ECMAScript string exactly.",
      );
    }
  }
}

function requireLineageId(value: unknown): string {
  if (typeof value !== "string" || value.length === 0)
    throw new TypeError("Integrated replica lineage is missing.");
  return value;
}
