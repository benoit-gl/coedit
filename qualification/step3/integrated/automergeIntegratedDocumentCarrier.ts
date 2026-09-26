import * as Automerge from "@automerge/automerge";

import type { BlockId, InlineContentId } from "../../../src/domain/index.js";
import { parseBlockId, parseInlineContentId } from "../../../src/domain/index.js";
import type { StructuralPlacement, StructuralPositionCodec, StructuralPositionOrdering } from "../../../src/carrier/index.js";
import { decodeStructuralPlacement, encodeStructuralPlacement } from "../../../src/carrier/index.js";
import { assertTextOffset, assertTextRange, isQualificationFineGrainedMediaType } from "../payload/carrier.js";
import type { QualificationOrigin, QualificationPayloadSnapshot } from "../payload/carrier.js";
import type { IntegratedDocumentCarrier, IntegratedDocumentCarrierFactory, IntegratedDocumentChange, IntegratedDocumentSnapshot, IntegratedPayloadChange } from "./carrier.js";

const ORIGIN_MARK = "__coedit_origin";

interface TextState extends Record<string, unknown> { kind: "text"; mediaType: string; text: string }
interface OpaqueState extends Record<string, unknown> { kind: "opaque"; mediaType: string; bytes: number[]; origin: string }
interface State extends Record<string, unknown> {
  rootId: string;
  blocks: Record<string, string>;
  payloads: Record<string, TextState | OpaqueState>;
}

/** Automerge candidate backed by one native document for integrated qualification. */
class AutomergeIntegratedDocumentCarrier<Position> implements IntegratedDocumentCarrier<Position> {
  public readonly candidate = "automerge" as const;
  private document: Automerge.Doc<State>;

  public constructor(
    private readonly positionCodec: StructuralPositionCodec<Position>,
    rootId?: BlockId,
    encoded?: Uint8Array,
  ) {
    if (encoded !== undefined) this.document = Automerge.load<State>(encoded);
    else if (rootId !== undefined) this.document = Automerge.from<State>({ rootId, blocks: {}, payloads: {} });
    else throw new TypeError("Integrated carrier creation requires a root identity.");
    parseBlockId(this.document.rootId);
  }

  public applyChange(change: IntegratedDocumentChange<Position>): void {
    validateChange(change, this.snapshot());
    this.document = Automerge.change(this.document, (draft) => {
      for (const update of change.placements ?? []) {
        if (update.blockId === draft.rootId) throw new TypeError("The integrated root cannot have a placement.");
        draft.blocks[update.blockId] = encodeStructuralPlacement(update.placement, this.positionCodec);
      }
      for (const update of change.payloads ?? []) applyPayloadChange(draft, update);
    });
  }

  public snapshot(): IntegratedDocumentSnapshot<Position> {
    const placements = new Map<BlockId, StructuralPlacement<Position>>();
    for (const [rawId, encoded] of Object.entries(this.document.blocks)) placements.set(parseBlockId(rawId), decodeStructuralPlacement(encoded, this.positionCodec));
    const payloads = new Map<InlineContentId, QualificationPayloadSnapshot>();
    for (const [rawId, payload] of Object.entries(this.document.payloads)) payloads.set(parseInlineContentId(rawId), projectPayload(this.document, rawId, payload));
    return { rootId: parseBlockId(this.document.rootId), placements, payloads };
  }

  public encode(): Uint8Array { return Automerge.save(this.document); }

  public mergeEncoded(encoded: Uint8Array): void {
    const remote = Automerge.load<State>(encoded);
    if (remote.rootId !== this.document.rootId) throw new TypeError("Integrated replicas must share one root identity.");
    this.document = Automerge.merge(this.document, remote);
  }
}

/** Creates the Automerge integrated qualification factory. */
export function createAutomergeIntegratedDocumentCarrierFactory<Position>(
  positionCodec: StructuralPositionCodec<Position>,
  positionOrdering: StructuralPositionOrdering<Position>,
): IntegratedDocumentCarrierFactory<Position> {
  return {
    candidate: "automerge", positionCodec, positionOrdering,
    create: (rootId) => new AutomergeIntegratedDocumentCarrier(positionCodec, rootId),
    load: (encoded) => new AutomergeIntegratedDocumentCarrier(positionCodec, undefined, encoded),
  };
}

function applyPayloadChange(draft: Automerge.ChangeFn<State> extends (value: infer Draft)=>unknown ? Draft : never, update: IntegratedPayloadChange): void {
  if (update.kind === "replace-text") {
    draft.payloads[update.inlineContentId] = { kind: "text", mediaType: update.mediaType, text: "" };
    if (update.text.length > 0) {
      Automerge.splice(draft, ["payloads", update.inlineContentId, "text"], 0, 0, update.text);
      Automerge.mark(draft, ["payloads", update.inlineContentId, "text"], { start: 0, end: update.text.length, expand: "none" }, ORIGIN_MARK, JSON.stringify(update.origin));
    }
    return;
  }
  if (update.kind === "replace-opaque") {
    draft.payloads[update.inlineContentId] = { kind: "opaque", mediaType: update.mediaType, bytes: [...update.bytes], origin: JSON.stringify(update.origin) };
    return;
  }
  const payload = draft.payloads[update.inlineContentId];
  if (payload?.kind !== "text") throw new TypeError("Fine-grained operations require an existing text payload.");
  if (update.kind === "insert-text") {
    if (update.text.length > 0) {
      Automerge.splice(draft, ["payloads", update.inlineContentId, "text"], update.offset, 0, update.text);
      Automerge.mark(draft, ["payloads", update.inlineContentId, "text"], { start: update.offset, end: update.offset + update.text.length, expand: "none" }, ORIGIN_MARK, JSON.stringify(update.origin));
    }
  } else if (update.start !== update.end) Automerge.splice(draft, ["payloads", update.inlineContentId, "text"], update.start, update.end-update.start, "");
}

function validateChange<Position>(change: IntegratedDocumentChange<Position>, snapshot: IntegratedDocumentSnapshot<Position>): void {
  for (const placement of change.placements ?? []) if (placement.blockId === snapshot.rootId) throw new TypeError("The integrated root cannot have a placement.");
  const working = new Map(snapshot.payloads);
  for (const update of change.payloads ?? []) {
    if (update.kind === "replace-text") {
      if (!isQualificationFineGrainedMediaType(update.mediaType)) throw new TypeError("Text replacement requires an allowlisted Media Type.");
      working.set(update.inlineContentId, { kind: "text", mediaType: update.mediaType, text: update.text, spans: update.text.length === 0 ? [] : [{ text: update.text, origin: update.origin }] });
    } else if (update.kind === "replace-opaque") {
      if (isQualificationFineGrainedMediaType(update.mediaType)) throw new TypeError("Allowlisted Media Types require text payloads.");
      working.set(update.inlineContentId, { kind: "opaque", mediaType: update.mediaType, bytes: update.bytes.slice(), origin: update.origin });
    } else {
      const payload = working.get(update.inlineContentId);
      if (payload?.kind !== "text") throw new TypeError("Fine-grained operations require an existing text payload.");
      if (update.kind === "insert-text") assertTextOffset(update.offset, payload.text);
      else assertTextRange(update.start, update.end, payload.text);
    }
  }
}

function projectPayload(document: Automerge.Doc<State>, rawId: string, payload: TextState | OpaqueState): QualificationPayloadSnapshot {
  if (payload.kind === "opaque") return { kind: "opaque", mediaType: payload.mediaType, bytes: Uint8Array.from(payload.bytes), origin: parseOrigin(payload.origin) };
  const marks = Automerge.marks(document, ["payloads", rawId, "text"]).filter((mark)=>mark.name===ORIGIN_MARK && typeof mark.value==="string").sort((a,b)=>a.start-b.start);
  const spans = marks.map((mark)=>({ text: payload.text.slice(mark.start, mark.end), origin: parseOrigin(String(mark.value)) })).filter((span)=>span.text.length>0);
  return { kind: "text", mediaType: payload.mediaType, text: payload.text, spans };
}
function parseOrigin(value: string): QualificationOrigin {
  const parsed: unknown = JSON.parse(value);
  if (typeof parsed !== "object" || parsed===null || !("id" in parsed) || typeof parsed.id!=="string" || !("kind" in parsed) || !["human","imported","automation","ai","unknown"].includes(String(parsed.kind))) throw new TypeError("Integrated payload Origin is invalid.");
  return parsed as QualificationOrigin;
}
