import type { BlockId } from "../../../src/domain/ids.js";
import type {
  StructuralPositionAllocator,
  StructuralPositionOrdering,
} from "../../../src/carrier/position.js";
import type {
  ProjectedStructuralBlock,
  StructuralPlacement,
} from "../../../src/carrier/structuralCarrier.js";
import { projectStructuralSnapshot as projectCarrierStructuralSnapshot } from "../../../src/carrier/structuralCarrier.js";

/** Qualification-only allocator surface with an evidence label. */
export interface QualificationPositionAllocator<
  Position,
  AllocationContext,
> extends StructuralPositionAllocator<Position, AllocationContext> {
  /** Candidate name used in qualification evidence. */
  readonly candidate: string;
}

/** One semantic placement update with a fresh liveness token. */
export interface StructuralPlacementUpdate<Position> {
  /** Existing or newly created Block. */
  readonly blockId: BlockId;
  /** Complete replacement placement. */
  readonly placement: StructuralPlacement<Position>;
  /** Fresh token proving semantic activity for this Block. */
  readonly liveToken: string;
}

/** One carrier-private placement rewrite that is not semantic Block activity. */
export interface StructuralNormalizationUpdate<Position> {
  /** Existing Block whose collision position is normalized. */
  readonly blockId: BlockId;
  /** Fresh complete placement that preserves projected meaning. */
  readonly placement: StructuralPlacement<Position>;
}

/** One qualification payload update with a fresh Block-liveness token. */
export interface StructuralPayloadUpdate {
  /** Existing Block whose payload changes. */
  readonly blockId: BlockId;
  /** Qualification payload key. */
  readonly key: string;
  /** Opaque qualification payload value. */
  readonly value: string;
  /** Fresh token proving semantic activity for this Block. */
  readonly liveToken: string;
}

/** One atomic logical carrier change used only by structural qualification. */
export interface StructuralCarrierChange<Position> {
  /** Semantic placement mutations published by this carrier change. */
  readonly placements?: readonly StructuralPlacementUpdate<Position>[];
  /** Collision normalization that must not refresh liveness. */
  readonly normalizations?: readonly StructuralNormalizationUpdate<Position>[];
  /** Qualification payload mutations published by this carrier change. */
  readonly payloads?: readonly StructuralPayloadUpdate[];
  /** Blocks whose currently observed live tokens are retired. */
  readonly deletes?: readonly BlockId[];
}

/** Detached qualification snapshot of one Block carrier namespace. */
export interface StructuralCarrierEntrySnapshot<Position> {
  /** Durable Block identity. */
  readonly blockId: BlockId;
  /** Current complete placement when one has been published. */
  readonly placement?: StructuralPlacement<Position>;
  /** Detached Block-local qualification payload. */
  readonly payload: Readonly<Record<string, string>>;
  /** True when at least one replicated liveness token remains live. */
  readonly live: boolean;
}

/** Detached complete structural carrier qualification state. */
export interface StructuralCarrierSnapshot<Position> {
  /** Immutable root identity. */
  readonly rootId: BlockId;
  /** All physical Block namespaces, including tombstoned entries. */
  readonly entries: readonly StructuralCarrierEntrySnapshot<Position>[];
}

/** Common qualification-only contract for one flat structural carrier candidate. */
export interface StructuralCarrier<Position> {
  /** Candidate name used in qualification evidence. */
  readonly candidate: string;

  /** Applies one all-or-none carrier change. */
  applyChange(change: StructuralCarrierChange<Position>): void;

  /** Returns one detached complete carrier snapshot. */
  snapshot(): StructuralCarrierSnapshot<Position>;

  /** Encodes all replicated structural state. */
  encode(): Uint8Array;

  /** Merges complete encoded state from another replica. */
  mergeEncoded(encoded: Uint8Array): void;
}

/** Qualification-only factory used by the common structural carrier suite. */
export interface StructuralCarrierFactory<Position> {
  /** Candidate name. */
  readonly candidate: StructuralCarrier<Position>["candidate"];

  /** Creates genesis with one immutable live root. */
  create(rootId: BlockId): StructuralCarrier<Position>;

  /** Reloads complete carrier state. */
  load(encoded: Uint8Array): StructuralCarrier<Position>;
}

/** Projects only live qualification entries through the accepted structural projection. */
export function projectStructuralSnapshot<Position>(
  snapshot: StructuralCarrierSnapshot<Position>,
  ordering: StructuralPositionOrdering<Position>,
): readonly ProjectedStructuralBlock[] {
  const root = snapshot.entries.find(
    (entry) => entry.blockId === snapshot.rootId,
  );
  if (root === undefined || !root.live) {
    throw new TypeError("Structural carrier root must remain live.");
  }
  return projectCarrierStructuralSnapshot(
    {
      rootId: snapshot.rootId,
      entries: snapshot.entries
        .filter(
          (entry) =>
            entry.live &&
            (entry.blockId === snapshot.rootId ||
              entry.placement !== undefined),
        )
        .map((entry) => ({
          blockId: entry.blockId,
          ...(entry.placement === undefined
            ? {}
            : { placement: entry.placement }),
        })),
    },
    ordering,
  );
}
