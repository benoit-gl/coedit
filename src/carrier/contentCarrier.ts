import type {
  FormattingMark,
  InlineContentValue,
  OriginRecord,
} from "../domain/content.js";

/** Common headless contract used to qualify CollaborativeContent carriers. */
export interface ContentCarrier {
  /** Candidate name used in qualification output. */
  readonly candidate: "yjs" | "automerge";

  /** Inserts visible text with one explicit protected Origin. */
  insertText(offset: number, text: string, origin: OriginRecord): void;

  /** Inserts one hard break with one explicit protected Origin. */
  insertHardBreak(offset: number, origin: OriginRecord): void;

  /** Deletes a logical UTF-16 offset range. */
  deleteRange(start: number, end: number): void;

  /** Adds one intrinsic formatting mark. */
  addMark(mark: FormattingMark): void;

  /** Projects a detached carrier-neutral canonical value. */
  snapshot(): InlineContentValue;

  /** Encodes all current replicated state for transport or reload. */
  encode(): Uint8Array;

  /** Merges encoded replicated state from another replica. */
  mergeEncoded(encoded: Uint8Array): void;

  /** Creates one stable carrier cursor at a UTF-16 offset. */
  createCursor(offset: number, affinity: "before" | "after"): string;

  /** Resolves one stable carrier cursor to a UTF-16 offset when possible. */
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
