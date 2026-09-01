import type {
  FormattingMark,
  InlineContentValue,
  OriginRecord,
} from "../domain/content.js";

/** Common headless contract used to qualify CollaborativeContent carriers. */
export interface ContentCarrier {
  /** Candidate name used in qualification output. */
  readonly candidate: "yjs" | "automerge";

  /** Inserts visible text at one candidate-runtime UTF-16 boundary. */
  insertText(
    runtimeUtf16Offset: number,
    text: string,
    origin: OriginRecord,
  ): void;

  /** Inserts one hard break at one candidate-runtime UTF-16 boundary. */
  insertHardBreak(runtimeUtf16Offset: number, origin: OriginRecord): void;

  /** Deletes one candidate-runtime UTF-16 range. */
  deleteRange(
    startRuntimeUtf16Offset: number,
    endRuntimeUtf16Offset: number,
  ): void;

  /** Adds one intrinsic mark over one transient candidate-runtime UTF-16 range. */
  addMark(
    startRuntimeUtf16Offset: number,
    endRuntimeUtf16Offset: number,
    mark: FormattingMark,
  ): void;

  /** Projects a detached range-free carrier-neutral canonical value. */
  snapshot(): InlineContentValue;

  /** Encodes all current replicated state for transport or reload. */
  encode(): Uint8Array;

  /** Merges encoded replicated state from another replica. */
  mergeEncoded(encoded: Uint8Array): void;

  /** Creates one stable carrier cursor from a candidate-runtime UTF-16 position. */
  createCursor(
    runtimeUtf16Offset: number,
    affinity: "before" | "after",
  ): string;

  /** Resolves one stable cursor to the candidate runtime's UTF-16 position. */
  resolveCursor(cursor: string): number | undefined;
}

/** Factory used by the carrier-neutral qualification suite. */
export interface ContentCarrierFactory {
  /** Candidate name. */
  readonly candidate: ContentCarrier["candidate"];

  /** Creates a fresh empty candidate document. */
  create(): ContentCarrier;

  /** Reloads a candidate document from its complete encoded state. */
  load(encoded: Uint8Array): ContentCarrier;
}
