import type { BlockId } from "../domain/ids.js";
import type {
  StructuralPositionCodec,
  StructuralPositionOrdering,
} from "./position.js";

/** Atomic carrier-private structural placement. */
export interface StructuralPlacement<Position> {
  /** Opaque allocator-private preorder position. */
  readonly position: Position;
  /** Flat preorder depth. Root depth is zero. */
  readonly depth: number;
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

/** One Block-local payload update with a fresh liveness token. */
export interface StructuralPayloadUpdate {
  /** Existing Block whose payload changes. */
  readonly blockId: BlockId;
  /** Carrier-neutral qualification payload key. */
  readonly key: string;
  /** Opaque qualification payload value. */
  readonly value: string;
  /** Fresh token proving semantic activity for this Block. */
  readonly liveToken: string;
}

/** One atomic logical carrier change used by structural qualification. */
export interface StructuralCarrierChange<Position> {
  /** Semantic placement mutations that publish in this carrier transaction/change. */
  readonly placements?: readonly StructuralPlacementUpdate<Position>[];
  /** Carrier-private collision normalization that must not refresh liveness. */
  readonly normalizations?: readonly StructuralNormalizationUpdate<Position>[];
  /** Payload mutations that publish in this carrier transaction/change. */
  readonly payloads?: readonly StructuralPayloadUpdate[];
  /** Blocks whose currently observed live tokens are retired. */
  readonly deletes?: readonly BlockId[];
}

/** Detached snapshot of one Block carrier namespace. */
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

/** Detached complete structural carrier state. */
export interface StructuralCarrierSnapshot<Position> {
  /** Immutable root identity. */
  readonly rootId: BlockId;
  /** All physical Block namespaces, including tombstoned entries. */
  readonly entries: readonly StructuralCarrierEntrySnapshot<Position>[];
}

/** One projected live Block in deterministic preorder. */
export interface ProjectedStructuralBlock {
  /** Durable Block identity. */
  readonly blockId: BlockId;
  /** Projected parent identity. Root has no parent. */
  readonly parentId?: BlockId;
  /** Effective flat depth from carrier placement. */
  readonly depth: number;
  /** Block-local payload. */
  readonly payload: Readonly<Record<string, string>>;
}

/** Common headless contract used to qualify the flat structural carrier. */
export interface StructuralCarrier<Position> {
  /** Candidate name used in qualification output. */
  readonly candidate: "yjs" | "automerge";

  /** Applies one all-or-none carrier change. */
  applyChange(change: StructuralCarrierChange<Position>): void;

  /** Projects a detached complete carrier snapshot. */
  snapshot(): StructuralCarrierSnapshot<Position>;

  /** Encodes all replicated structural state. */
  encode(): Uint8Array;

  /** Merges complete or incremental state from another replica. */
  mergeEncoded(encoded: Uint8Array): void;
}

/** Factory used by the common structural carrier qualification suite. */
export interface StructuralCarrierFactory<Position> {
  /** Candidate name. */
  readonly candidate: StructuralCarrier<Position>["candidate"];

  /** Creates genesis with one immutable live root. */
  create(rootId: BlockId): StructuralCarrier<Position>;

  /** Reloads complete carrier state. */
  load(encoded: Uint8Array): StructuralCarrier<Position>;
}

/** Serializes one placement without inspecting allocator-private position data. */
export function encodeStructuralPlacement<Position>(
  placement: StructuralPlacement<Position>,
  codec: StructuralPositionCodec<Position>,
): string {
  if (!Number.isSafeInteger(placement.depth) || placement.depth < 0) {
    throw new TypeError(
      "Structural placement depth must be a non-negative integer.",
    );
  }
  return JSON.stringify({
    position: codec.encode(placement.position),
    depth: placement.depth,
  });
}

/** Parses one placement without binding the structural carrier to a position encoding. */
export function decodeStructuralPlacement<Position>(
  value: string,
  codec: StructuralPositionCodec<Position>,
): StructuralPlacement<Position> {
  const parsed: unknown = JSON.parse(value);
  if (!isRecord(parsed)) {
    throw new TypeError("Structural placement must be an object.");
  }
  const depth = parsed.depth;
  const position = parsed.position;
  if (!Number.isSafeInteger(depth) || typeof depth !== "number" || depth < 0) {
    throw new TypeError("Structural placement depth is invalid.");
  }
  if (typeof position !== "string") {
    throw new TypeError("Structural placement position encoding is invalid.");
  }
  return { position: codec.decode(position), depth };
}

/** Projects the accepted deterministic tree from one complete carrier snapshot. */
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

  const live = snapshot.entries
    .filter(
      (
        entry,
      ): entry is StructuralCarrierEntrySnapshot<Position> & {
        readonly placement: StructuralPlacement<Position>;
      } =>
        entry.live &&
        entry.blockId !== snapshot.rootId &&
        entry.placement !== undefined,
    )
    .sort((left, right) => {
      const order = ordering.compare(
        left.placement.position,
        right.placement.position,
      );
      return order === 0 ? left.blockId.localeCompare(right.blockId) : order;
    });

  const projected: ProjectedStructuralBlock[] = [
    { blockId: snapshot.rootId, depth: 0, payload: root.payload },
  ];
  const stack: Array<{ readonly blockId: BlockId; readonly depth: number }> = [
    { blockId: snapshot.rootId, depth: 0 },
  ];

  for (const entry of live) {
    while (
      (stack.at(-1)?.depth ?? 0) >= entry.placement.depth &&
      stack.length > 1
    ) {
      stack.pop();
    }
    const parent = stack.at(-1) ?? { blockId: snapshot.rootId, depth: 0 };
    projected.push({
      blockId: entry.blockId,
      parentId: parent.blockId,
      depth: entry.placement.depth,
      payload: entry.payload,
    });
    stack.push({ blockId: entry.blockId, depth: entry.placement.depth });
  }
  return projected;
}

function isRecord(value: unknown): value is Readonly<Record<string, unknown>> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
