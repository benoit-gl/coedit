import type { InlineContentId } from "../../../src/domain/index.js";
import type { QualificationOrigin } from "../payload/carrier.js";
import type {
  IntegratedDocumentSnapshot,
  IntegratedPayloadChange,
  QualificationWorkCounters,
  QualificationOrdinaryRange,
} from "./carrier.js";
import { IndexedText } from "./indexedText.js";

/** Private, detached proof of visible live text at one validated carrier tip. */
export class IndexedOrdinary {
  private constructor(
    private readonly texts: Map<InlineContentId, IndexedText>,
    private readonly counters:
      NonNullable<QualificationWorkCounters["indexed"]> | undefined,
  ) {}

  /** Build only after the complete reference projection and retained-ID validation succeed. */
  public static fromSnapshot<Position>(
    snapshot: IntegratedDocumentSnapshot<Position>,
    candidate: "yjs" | "automerge",
    work?: QualificationWorkCounters,
  ): IndexedOrdinary {
    const counters = work
      ? (work.indexed ??= {
          rebuildUnits: 0,
          readUnits: 0,
          readPieces: 0,
          pathVisits: 0,
          cacheHits: 0,
        })
      : undefined;
    const texts = new Map<InlineContentId, IndexedText>();
    for (const [id, payload] of snapshot.payloads) {
      if (payload.kind !== "text") continue;
      assertExact(payload.text, candidate);
      for (const span of payload.spans) assertExact(span.text, candidate);
      if (counters) counters.rebuildUnits += payload.text.length;
      texts.set(id, new IndexedText(payload.spans, counters));
    }
    return new IndexedOrdinary(texts, counters);
  }

  /** Read one live target without touching other targets or materializing it. */
  public read(
    id: InlineContentId,
    start: number,
    end: number,
  ): Omit<QualificationOrdinaryRange, "revision"> | undefined {
    const text = this.texts.get(id);
    if (!text) return undefined;
    return {
      length: text.length,
      spans: text.read(start, end),
    };
  }

  /** Stage an ordinary batch; undefined requests the original reference path. */
  public stage(
    changes: readonly IntegratedPayloadChange[],
    candidate: "yjs" | "automerge",
  ): Map<InlineContentId, IndexedText> | undefined {
    const staged = new Map<InlineContentId, IndexedText>();
    const deferredOrigins: QualificationOrigin[] = [];
    for (const change of changes) {
      if (change.kind !== "insert-text" && change.kind !== "delete-text")
        return undefined;
      let text = staged.get(change.inlineContentId);
      if (!text) {
        const current = this.texts.get(change.inlineContentId);
        if (!current) return undefined;
        if (this.counters) this.counters.cacheHits += 1;
        text = current.fork();
        staged.set(change.inlineContentId, text);
      }
      const start =
        change.kind === "insert-text" ? change.offset : change.start;
      const end = change.kind === "insert-text" ? change.offset : change.end;
      for (const offset of [start, end])
        if (!Number.isSafeInteger(offset) || offset < 0 || offset > text.length)
          throw new RangeError(
            "Text offset is outside the current native string.",
          );
      if (start > end)
        throw new RangeError("Text range start must not follow its end.");
      const inserted = change.kind === "insert-text" ? change.text : "";
      if (change.kind === "insert-text" && inserted.length === 0)
        throw new TypeError("Text insertion requires nonempty text.");
      assertExact(inserted, candidate);
      // Current text is well formed. Only the two cut boundaries can make
      // the result ill formed after replacing with a well-formed string.
      if (splitsPair(text, start) || splitsPair(text, end)) {
        if (!(start === end && inserted.length === 0))
          throw new TypeError(
            `${candidate === "yjs" ? "Yjs" : "Automerge"} cannot preserve this ECMAScript string exactly.`,
          );
      }
      // Native encoding retains only these two fields. The index must expose
      // the same attributed value even if the caller supplies extra fields.
      const origin =
        change.kind === "insert-text"
          ? { id: change.origin.id, kind: change.origin.kind }
          : { id: "", kind: "unknown" as const };
      if (change.kind === "insert-text") {
        if (candidate === "automerge") deferredOrigins.push(origin);
        else assertOrigin(origin);
      }
      text.replace(start, end, inserted, origin, text.revision);
    }
    // Automerge's reference validates every text operation before it encodes
    // Origins during mutation, so a later invalid range takes precedence.
    for (const origin of deferredOrigins) assertOrigin(origin);
    return staged;
  }

  /** Publish staged cache versions only after the native mutation succeeds. */
  public publish(staged: Map<InlineContentId, IndexedText>): void {
    for (const [id, text] of staged) this.texts.set(id, text);
  }
}

function assertOrigin(origin: QualificationOrigin): void {
  if (
    typeof origin.id !== "string" ||
    !["human", "imported", "automation", "ai", "unknown"].includes(origin.kind)
  )
    throw new TypeError("Integrated payload Origin is invalid.");
}

function splitsPair(text: IndexedText, offset: number): boolean {
  if (offset === 0 || offset === text.length) return false;
  const pair = text
    .read(offset - 1, offset + 1)
    .map((span) => span.text)
    .join("");
  const a = pair.charCodeAt(0),
    b = pair.charCodeAt(1);
  return a >= 0xd800 && a <= 0xdbff && b >= 0xdc00 && b <= 0xdfff;
}

function assertExact(text: string, candidate: "yjs" | "automerge"): void {
  for (let i = 0; i < text.length; i++) {
    const a = text.charCodeAt(i);
    if (a >= 0xd800 && a <= 0xdbff) {
      const b = text.charCodeAt(++i);
      if (b >= 0xdc00 && b <= 0xdfff) continue;
    } else if (a < 0xdc00 || a > 0xdfff) continue;
    throw new TypeError(
      `${candidate === "yjs" ? "Yjs" : "Automerge"} cannot preserve this ECMAScript string exactly.`,
    );
  }
}
