import type { BlockId, InlineContentId } from "../../../src/domain/index.js";
import type {
  StructuralPlacement,
  StructuralPositionCodec,
  StructuralPositionOrdering,
} from "../../../src/carrier/index.js";
import type { QualificationEffectContext } from "./effectContext.js";
import type { RecordedPayloadEffect } from "./replacementEvidence.js";
import type {
  QualificationOrigin,
  QualificationPayloadSnapshot,
  QualificationTextSpan,
} from "../payload/carrier.js";

/** Work visible in the private indexed text cache. */
export interface QualificationIndexedWork {
  /** UTF-16 units processed while building or rebuilding indexes. */
  rebuildUnits: number;
  /** UTF-16 units returned by localized reads. */
  readUnits: number;
  /** Indexed pieces visited to return localized text. */
  readPieces: number;
  /** Tree nodes visited by indexed reads and edits. */
  pathVisits: number;
  /** Existing live target proofs used for ordinary batches. */
  cacheHits: number;
}

/** Detached localized text and the carrier revision that it describes. */
export interface QualificationOrdinaryRange {
  /** Opaque instance-local receipt; never serialized or shared between carriers. */
  readonly revision: symbol;
  /** Current target length in UTF-16 units. */
  readonly length: number;
  /** Detached attributed contents of the requested range. */
  readonly spans: readonly QualificationTextSpan[];
}

/** Optional counters for qualification-visible projection work. */
export interface QualificationWorkCounters {
  /** Optional incremental cache work, initialized on first cache build. */
  indexed?: QualificationIndexedWork;
  /** Full snapshot calls. */
  snapshots: number;
  /** Position placement decode calls. */
  placementDecodes: number;
  /** Projected payload calls by InlineContent ID. */
  payloads: Record<string, number>;
  /** UTF-16 text units in successfully projected payloads, by InlineContent ID. */
  textUnits: Record<string, number>;
  /** Origin spans in successfully projected payloads, by InlineContent ID. */
  textSpans: Record<string, number>;
  /** Copied opaque bytes by InlineContent ID. */
  opaqueBytes: Record<string, number>;
  /** UTF-16 input units for attempted Yjs temporary edit preflights, by InlineContent ID. */
  temporaryTextUnits: Record<string, number>;
  /** Materialized liveness token values by entity ID. */
  livenessTokens: Record<string, number>;
}

/** Diagnostic-only ordinary-edit preflight variants; neither selects a carrier. */
export interface IntegratedCarrierQualificationOptions {
  /** Optional passive counters; native library internals are not observed. */
  readonly workCounters?: QualificationWorkCounters;
  /** Targeted is the qualification default; snapshot retains the reference path. */
  readonly ordinaryEditVariant?: "snapshot" | "targeted" | "incremental";
  /** Experimental editor target projection; snapshot is the reference and default. */
  readonly editorProjectionVariant?: "snapshot" | "targeted";
  /** Yjs-only qualification experiment; the native preflight is the default. */
  readonly yjsTextPreflightVariant?: "native" | "ascii";
  /** Opt in only if position decode is pure, deterministic and stable for the carrier lifetime. */
  readonly purePositionDecoder?: boolean;
}

/** Candidate names used by integrated Step 3 qualification. */
export type IntegratedCarrierCandidate = "yjs" | "automerge";

/**
 * Opaque candidate-native live text position used only for Step 3
 * qualification. It is not a portable Range representation or public API.
 */
export type QualificationStableTextPosition =
  | {
      /** Candidate that owns this opaque position. */
      readonly candidate: "yjs";
      /** Allowlisted text payload to which the position belongs. */
      readonly inlineContentId: InlineContentId;
      /** Yjs relative-position bytes; never a portable document value. */
      readonly encoded: Uint8Array;
    }
  | {
      /** Candidate that owns this opaque position. */
      readonly candidate: "automerge";
      /** Allowlisted text payload to which the position belongs. */
      readonly inlineContentId: InlineContentId;
      /** Automerge cursor token; never a portable document value. */
      readonly cursor: string;
      /** Native text object identity at capture, to reject replacement lineages. */
      readonly textObjectId: string;
    };

/** Candidate-defined insertion affinity at an editor text boundary. */
export type QualificationTextAffinity = "before" | "after";

/** Complete fine-grained text replacement inside one integrated transaction. */
export interface IntegratedTextReplacement {
  /** Operation discriminator. */
  readonly kind: "replace-text";
  /** InlineContent whose payload changes. */
  readonly inlineContentId: InlineContentId;
  /** Exact allowlisted Media Type spelling. */
  readonly mediaType: string;
  /** Complete replacement native string. */
  readonly text: string;
  /** Origin assigned to replacement material. */
  readonly origin: QualificationOrigin;
}

/** Complete opaque payload replacement inside one integrated transaction. */
export interface IntegratedOpaqueReplacement {
  /** Operation discriminator. */
  readonly kind: "replace-opaque";
  /** InlineContent whose payload changes. */
  readonly inlineContentId: InlineContentId;
  /** Exact non-fine-grained Media Type spelling. */
  readonly mediaType: string;
  /** Complete replacement bytes. */
  readonly bytes: Uint8Array;
  /** Payload-level replacement Origin. */
  readonly origin: QualificationOrigin;
}

/** Fine-grained text insertion inside one integrated transaction. */
export interface IntegratedTextInsertion {
  /** Operation discriminator. */
  readonly kind: "insert-text";
  /** InlineContent whose text changes. */
  readonly inlineContentId: InlineContentId;
  /** Native-string UTF-16 insertion offset. */
  readonly offset: number;
  /** Nonempty inserted native string; empty insertion is invalid. */
  readonly text: string;
  /** Origin assigned to inserted material. */
  readonly origin: QualificationOrigin;
}

/** Fine-grained text deletion inside one integrated transaction. */
export interface IntegratedTextDeletion {
  /** Operation discriminator. */
  readonly kind: "delete-text";
  /** InlineContent whose text changes. */
  readonly inlineContentId: InlineContentId;
  /** Inclusive native-string UTF-16 start offset. */
  readonly start: number;
  /** Exclusive native-string UTF-16 end offset. */
  readonly end: number;
}

/** One payload mutation inside an integrated document transaction. */
export type IntegratedPayloadChange =
  | IntegratedTextReplacement
  | IntegratedOpaqueReplacement
  | IntegratedTextInsertion
  | IntegratedTextDeletion;

/** One structural mutation inside an integrated document transaction. */
export interface IntegratedPlacementChange<Position> {
  /** Block whose placement changes. */
  readonly blockId: BlockId;
  /** Complete replacement structural placement. */
  readonly placement: StructuralPlacement<Position>;
}

/** Creates one immutable InlineContent-to-Block ownership relationship. */
export interface IntegratedInlineContentCreation {
  /** Newly created InlineContent identity. */
  readonly inlineContentId: InlineContentId;
  /** Live Block that owns the new InlineContent. */
  readonly blockId: BlockId;
}

/** One all-or-none integrated qualification transaction. */
export interface IntegratedDocumentChange<Position> {
  /** Structural placement replacements in this transaction. */
  readonly placements?: readonly IntegratedPlacementChange<Position>[];
  /** InlineContents created against their immutable owning Blocks. */
  readonly inlineContents?: readonly IntegratedInlineContentCreation[];
  /** Payload operations in this transaction. */
  readonly payloads?: readonly IntegratedPayloadChange[];
  /**
   * Blocks whose observed liveness effects this transaction retires.
   *
   * @remarks
   * The list is one atomic application command. Surviving descendants receive
   * their parent from normal projection; this change emits no re-parenting
   * operations.
   */
  readonly deleteBlockIds?: readonly BlockId[];
  /** Optional actor/effect attribution, published with this semantic change. */
  readonly context?: QualificationEffectContext;
}

/** Detached integrated document projection. */
export interface IntegratedDocumentSnapshot<Position> {
  /** Immutable document root identity. */
  readonly rootId: BlockId;
  /** Liveness by known Block identity, including the immutable root. */
  readonly blockLiveness: ReadonlyMap<BlockId, boolean>;
  /** Current non-root structural placements by Block identity. */
  readonly placements: ReadonlyMap<BlockId, StructuralPlacement<Position>>;
  /** Owning Block for each visible InlineContent payload. */
  readonly inlineContentOwners: ReadonlyMap<InlineContentId, BlockId>;
  /** Current detached payload projections by InlineContent identity. */
  readonly payloads: ReadonlyMap<InlineContentId, QualificationPayloadSnapshot>;
}

/** Common Step 3 integrated carrier surface. */
export interface IntegratedDocumentCarrier<Position> {
  /** Candidate implementation name. */
  readonly candidate: IntegratedCarrierCandidate;
  /** Applies one all-or-none integrated transaction. */
  applyChange(change: IntegratedDocumentChange<Position>): void;
  /** Retains a detached qualification state and returns its opaque local token. */
  captureHistoricalState(): string;
  /** Materializes one retained qualification state without changing the tip. */
  materializeHistoricalState(
    token: string,
  ): IntegratedDocumentSnapshot<Position>;
  /** Restores one retained state as one carrier change, preserving entity identities. */
  restoreHistoricalState(
    token: string,
    context?: QualificationEffectContext,
  ): void;
  /** Detached, replicated semantic-effect context (not product Contributions). */
  effects(): ReadonlyMap<string, QualificationEffectContext>;
  /** Immutable candidate-native payload effect evidence for Gate B alternatives. */
  recordedPayloadEffects(): readonly RecordedPayloadEffect[];
  /** Native lifecycle capability exposed by this pinned candidate. */
  nativeLifecycle(): IntegratedNativeLifecycleCapability;
  /** Projects detached carrier-neutral state. */
  snapshot(): IntegratedDocumentSnapshot<Position>;
  /** Projects an editor target using the selected qualification-only read path. */
  projectEditorPayload(
    inlineContentId: InlineContentId,
  ): QualificationPayloadSnapshot | undefined;
  /** Read a local indexed range when the incremental proof is available. */
  readOrdinaryTextRange(
    inlineContentId: InlineContentId,
    start: number,
    end: number,
  ): QualificationOrdinaryRange | undefined;
  /** Revalidate and rebuild the local indexed proof without a native mutation. */
  prepareOrdinaryText(): boolean;
  /** Apply an ordinary change against exactly the read revision and return its new revision. */
  applyOrdinaryChange(
    change: IntegratedDocumentChange<Position>,
    revision: symbol,
  ): symbol;
  /** Creates one carrier-native live text position from an editor UTF-16 offset. */
  createStableTextPosition(
    inlineContentId: InlineContentId,
    editorUtf16Offset: number,
    affinity: QualificationTextAffinity,
  ): QualificationStableTextPosition;
  /** Resolves one carrier-native live text position to an editor UTF-16 offset. */
  resolveStableTextPosition(
    position: QualificationStableTextPosition,
  ): number | undefined;
  /** Encodes complete candidate state for reload or merge qualification. */
  encode(): Uint8Array;
  /**
   * Merges complete encoded state from another replica.
   *
   * @remarks
   * Both replicas must descend from the same encoded native genesis. Matching
   * root identity alone does not establish candidate merge compatibility.
   */
  mergeEncoded(encoded: Uint8Array): void;
}

/** Native lifecycle capability recorded without synthesizing a compactor. */
export type IntegratedNativeLifecycleCapability =
  | {
      /** Candidate performs collection automatically as part of native updates. */
      readonly kind: "automatic-garbage-collection";
      /** The fixture can exercise this native behavior. */
      readonly availability: "supported";
    }
  | {
      /** Pinned candidate exposes no native garbage-collection or compaction operation. */
      readonly kind: "none";
      /** No equivalent behavior is synthesized for qualification. */
      readonly availability: "unavailable";
    };

/** Factory for one integrated candidate and structural position representation. */
export interface IntegratedDocumentCarrierFactory<Position> {
  /** Candidate implementation name. */
  readonly candidate: IntegratedCarrierCandidate;
  /** Creates a fresh integrated document and native replica lineage. */
  create(rootId: BlockId): IntegratedDocumentCarrier<Position>;
  /** Reloads candidate state; branch replicas by loading the same encoded state. */
  load(encoded: Uint8Array): IntegratedDocumentCarrier<Position>;
  /** Structural position codec used by this integrated fixture. */
  readonly positionCodec: StructuralPositionCodec<Position>;
  /** Structural position ordering used by this integrated fixture. */
  readonly positionOrdering: StructuralPositionOrdering<Position>;
}
