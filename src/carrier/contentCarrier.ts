import type {
  FormattingMark,
  InlineContentValue,
  OriginRecord,
} from "../domain/content.js";

/** One candidate-runtime CollaborativeContent mutation. */
export type ContentCarrierOperation =
  | {
      /** Inserts visible text. */
      readonly kind: "insertText";
      /** Candidate-runtime UTF-16 insertion boundary. */
      readonly runtimeUtf16Offset: number;
      /** Non-empty visible text without hard breaks. */
      readonly text: string;
      /** Protected Origin assigned to the inserted material. */
      readonly origin: OriginRecord;
    }
  | {
      /** Inserts one hard break. */
      readonly kind: "insertHardBreak";
      /** Candidate-runtime UTF-16 insertion boundary. */
      readonly runtimeUtf16Offset: number;
      /** Protected Origin assigned to the hard break. */
      readonly origin: OriginRecord;
    }
  | {
      /** Deletes one visible range. */
      readonly kind: "deleteRange";
      /** Candidate-runtime UTF-16 start boundary. */
      readonly startRuntimeUtf16Offset: number;
      /** Candidate-runtime UTF-16 end boundary. */
      readonly endRuntimeUtf16Offset: number;
    }
  | {
      /** Adds one exact intrinsic formatting descriptor. */
      readonly kind: "addMark";
      /** Candidate-runtime UTF-16 start boundary. */
      readonly startRuntimeUtf16Offset: number;
      /** Candidate-runtime UTF-16 end boundary. */
      readonly endRuntimeUtf16Offset: number;
      /** Exact range-free semantic mark descriptor. */
      readonly mark: FormattingMark;
    }
  | {
      /** Removes one exact intrinsic formatting descriptor. */
      readonly kind: "removeMark";
      /** Candidate-runtime UTF-16 start boundary. */
      readonly startRuntimeUtf16Offset: number;
      /** Candidate-runtime UTF-16 end boundary. */
      readonly endRuntimeUtf16Offset: number;
      /** Exact range-free semantic mark descriptor. */
      readonly mark: FormattingMark;
    };

/** Common headless contract used to qualify CollaborativeContent carriers. */
export interface ContentCarrier {
  /** Candidate name used in qualification output. */
  readonly candidate: "yjs" | "automerge";

  /** Applies an ordered all-or-none native carrier transaction/change. */
  applyOperations(operations: readonly ContentCarrierOperation[]): void;

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

  /** Removes one exact intrinsic mark from one transient candidate-runtime UTF-16 range. */
  removeMark(
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
