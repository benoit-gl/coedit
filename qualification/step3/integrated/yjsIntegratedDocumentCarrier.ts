import * as Y from "yjs";

import type { BlockId, InlineContentId } from "../../../src/domain/index.js";
import { parseBlockId, parseInlineContentId } from "../../../src/domain/index.js";
import type { StructuralPositionCodec, StructuralPositionOrdering } from "../../../src/carrier/index.js";
import { decodeStructuralPlacement, encodeStructuralPlacement } from "../../../src/carrier/index.js";
import {
  assertTextOffset,
  assertTextRange,
  isQualificationFineGrainedMediaType,
} from "../payload/carrier.js";
import type { QualificationOrigin, QualificationPayloadSnapshot, QualificationTextSpan } from "../payload/carrier.js";
import type {
  IntegratedDocumentCarrier,
  IntegratedDocumentCarrierFactory,
  IntegratedDocumentChange,
  IntegratedDocumentSnapshot,
  IntegratedPayloadChange,
} from "./carrier.js";

const ROOT = "integrated";
const ROOT_ID = "rootId";
const BLOCKS = "blocks";
const PAYLOADS = "payloads";
const ORIGIN = "coedit:origin";
const ENVELOPE_SEPARATOR = 0;
const ROOT_ID_BYTE_LENGTH = 36;

/** Yjs candidate backed by one native document for integrated qualification. */
class YjsIntegratedDocumentCarrier<Position> implements IntegratedDocumentCarrier<Position> {
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
      this.root.set(ROOT_ID, decoded.rootId);
      Y.applyUpdate(this.document, decoded.update);
    } else if (rootId !== undefined) {
      this.root.set(ROOT_ID, rootId);
      this.root.set(BLOCKS, new Y.Map<string>());
      this.root.set(PAYLOADS, new Y.Map<Y.Map<unknown>>());
    } else {
      throw new TypeError("Integrated carrier creation requires a root identity.");
    }
    this.requireRootId();
    this.blocks();
    this.payloads();
  }

  public applyChange(change: IntegratedDocumentChange<Position>): void {
    validatePayloadChanges(change.payloads ?? [], this.snapshot().payloads);
    this.document.transact(() => {
      for (const update of change.placements ?? []) {
        if (update.blockId === this.requireRootId()) {
          throw new TypeError("The integrated root cannot have a placement.");
        }
        this.blocks().set(update.blockId, encodeStructuralPlacement(update.placement, this.positionCodec));
      }
      for (const update of change.payloads ?? []) this.applyPayloadChange(update);
    });
  }

  public snapshot(): IntegratedDocumentSnapshot<Position> {
    const placements = new Map<BlockId, ReturnType<typeof decodeStructuralPlacement<Position>>>();
    for (const [rawId, encoded] of this.blocks()) {
      const blockId = parseBlockId(rawId);
      placements.set(blockId, decodeStructuralPlacement(encoded, this.positionCodec));
    }
    const payloads = new Map<InlineContentId, QualificationPayloadSnapshot>();
    for (const [rawId, payload] of this.payloads()) {
      payloads.set(parseInlineContentId(rawId), projectPayload(payload));
    }
    return { rootId: this.requireRootId(), placements, payloads };
  }

  public encode(): Uint8Array {
    return encodeEnvelope(this.requireRootId(), Y.encodeStateAsUpdate(this.document));
  }

  public mergeEncoded(encoded: Uint8Array): void {
    const decoded = decodeEnvelope(encoded);
    if (decoded.rootId !== this.requireRootId()) throw new TypeError("Integrated replicas must share one root identity.");
    Y.applyUpdate(this.document, decoded.update);
  }

  private applyPayloadChange(update: IntegratedPayloadChange): void {
    if (update.kind === "replace-text") {
      const payload = new Y.Map<unknown>();
      payload.set("kind", "text"); payload.set("mediaType", update.mediaType);
      const text = new Y.Text();
      if (update.text.length > 0) text.insert(0, update.text, { [ORIGIN]: JSON.stringify(update.origin) });
      payload.set("text", text); this.payloads().set(update.inlineContentId, payload); return;
    }
    if (update.kind === "replace-opaque") {
      const payload = new Y.Map<unknown>();
      payload.set("kind", "opaque"); payload.set("mediaType", update.mediaType);
      payload.set("bytes", update.bytes.slice()); payload.set("origin", JSON.stringify(update.origin));
      this.payloads().set(update.inlineContentId, payload); return;
    }
    const payload = this.requirePayload(update.inlineContentId);
    const text = payload.get("text");
    if (!(text instanceof Y.Text)) throw new TypeError("Fine-grained operations require a text payload.");
    if (update.kind === "insert-text") {
      if (update.text.length > 0) text.insert(update.offset, update.text, { [ORIGIN]: JSON.stringify(update.origin) });
    } else if (update.start !== update.end) text.delete(update.start, update.end - update.start);
  }

  private requireRootId(): BlockId {
    const value = this.root.get(ROOT_ID);
    if (typeof value !== "string") throw new TypeError("Integrated root identity is missing.");
    return parseBlockId(value);
  }
  private blocks(): Y.Map<string> {
    const value = this.root.get(BLOCKS);
    if (!(value instanceof Y.Map)) throw new TypeError("Integrated structural namespace is missing.");
    return value as Y.Map<string>;
  }
  private payloads(): Y.Map<Y.Map<unknown>> {
    const value = this.root.get(PAYLOADS);
    if (!(value instanceof Y.Map)) throw new TypeError("Integrated payload namespace is missing.");
    return value as Y.Map<Y.Map<unknown>>;
  }
  private requirePayload(id: InlineContentId): Y.Map<unknown> {
    const value = this.payloads().get(id);
    if (value === undefined) throw new TypeError("Payload update requires an existing InlineContent.");
    return value;
  }
}

/** Creates the Yjs integrated qualification factory. */
export function createYjsIntegratedDocumentCarrierFactory<Position>(
  positionCodec: StructuralPositionCodec<Position>,
  positionOrdering: StructuralPositionOrdering<Position>,
): IntegratedDocumentCarrierFactory<Position> {
  return {
    candidate: "yjs", positionCodec, positionOrdering,
    create: (rootId) => new YjsIntegratedDocumentCarrier(positionCodec, rootId),
    load: (encoded) => new YjsIntegratedDocumentCarrier(positionCodec, undefined, encoded),
  };
}

function validatePayloadChanges(
  changes: readonly IntegratedPayloadChange[],
  current: ReadonlyMap<InlineContentId, QualificationPayloadSnapshot>,
): void {
  const working = new Map(current);
  for (const change of changes) {
    if (change.kind === "replace-text") {
      if (!isQualificationFineGrainedMediaType(change.mediaType)) throw new TypeError("Text replacement requires an allowlisted Media Type.");
      working.set(change.inlineContentId, { kind: "text", mediaType: change.mediaType, text: change.text, spans: change.text.length === 0 ? [] : [{ text: change.text, origin: change.origin }] });
    } else if (change.kind === "replace-opaque") {
      if (isQualificationFineGrainedMediaType(change.mediaType)) throw new TypeError("Allowlisted Media Types require text payloads.");
      working.set(change.inlineContentId, { kind: "opaque", mediaType: change.mediaType, bytes: change.bytes.slice(), origin: change.origin });
    } else {
      const payload = working.get(change.inlineContentId);
      if (payload?.kind !== "text") throw new TypeError("Fine-grained operations require an existing text payload.");
      if (change.kind === "insert-text") {
        assertTextOffset(change.offset, payload.text);
        const text = payload.text.slice(0, change.offset) + change.text + payload.text.slice(change.offset);
        working.set(change.inlineContentId, { ...payload, text });
      } else {
        assertTextRange(change.start, change.end, payload.text);
        const text = payload.text.slice(0, change.start) + payload.text.slice(change.end);
        working.set(change.inlineContentId, { ...payload, text });
      }
    }
  }
}

function projectPayload(payload: Y.Map<unknown>): QualificationPayloadSnapshot {
  const kind = payload.get("kind"); const mediaType = payload.get("mediaType");
  if (typeof mediaType !== "string" || (kind !== "text" && kind !== "opaque")) throw new TypeError("Integrated payload metadata is invalid.");
  if (kind === "opaque") {
    const bytes = payload.get("bytes"); const origin = parseOrigin(payload.get("origin"));
    if (!(bytes instanceof Uint8Array)) throw new TypeError("Integrated opaque bytes are invalid.");
    return { kind, mediaType, bytes: bytes.slice(), origin };
  }
  const text = payload.get("text");
  if (!(text instanceof Y.Text)) throw new TypeError("Integrated text payload is invalid.");
  const spans: QualificationTextSpan[] = []; let projected = "";
  for (const op of text.toDelta() as readonly { readonly insert?: unknown; readonly attributes?: Readonly<Record<string, unknown>> }[]) {
    if (typeof op.insert !== "string") throw new TypeError("Integrated text must contain strings.");
    projected += op.insert; if (op.insert.length > 0) spans.push({ text: op.insert, origin: parseOrigin(op.attributes?.[ORIGIN]) });
  }
  return { kind, mediaType, text: projected, spans };
}
function parseOrigin(value: unknown): QualificationOrigin {
  if (typeof value !== "string") throw new TypeError("Integrated payload Origin is missing.");
  const parsed: unknown = JSON.parse(value);
  if (typeof parsed !== "object" || parsed === null || !("id" in parsed) || typeof parsed.id !== "string" || !("kind" in parsed) || !["human","imported","automation","ai","unknown"].includes(String(parsed.kind))) throw new TypeError("Integrated payload Origin is invalid.");
  return parsed as QualificationOrigin;
}
function encodeEnvelope(rootId: BlockId, update: Uint8Array): Uint8Array {
  const encoded = new Uint8Array(ROOT_ID_BYTE_LENGTH + 1 + update.length);
  for (let i=0;i<ROOT_ID_BYTE_LENGTH;i+=1) encoded[i]=rootId.charCodeAt(i);
  encoded[ROOT_ID_BYTE_LENGTH]=ENVELOPE_SEPARATOR; encoded.set(update, ROOT_ID_BYTE_LENGTH+1); return encoded;
}
function decodeEnvelope(encoded: Uint8Array): { readonly rootId: BlockId; readonly update: Uint8Array } {
  if (encoded.length < ROOT_ID_BYTE_LENGTH+1 || encoded[ROOT_ID_BYTE_LENGTH] !== ENVELOPE_SEPARATOR) throw new TypeError("Integrated Yjs envelope is invalid.");
  let raw=""; for(let i=0;i<ROOT_ID_BYTE_LENGTH;i+=1) raw += String.fromCharCode(encoded[i]!);
  return { rootId: parseBlockId(raw), update: encoded.subarray(ROOT_ID_BYTE_LENGTH+1) };
}
