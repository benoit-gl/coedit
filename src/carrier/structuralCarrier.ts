import type { BlockId } from "../domain/ids.js";
import type {
  StructuralPositionCodec,
  StructuralPositionOrdering,
} from "./position.js";

/** Atomic carrier-private structural placement. */
export interface StructuralPlacement<Position> {
  /** Opaque allocator-private preorder position. */
  readonly position: Position;
  /** Positive flat preorder depth for one non-root Block. */
  readonly depth: number;
}

/** One live structural entry used for deterministic tree projection. */
export interface StructuralProjectionEntry<Position> {
  /** Durable Block identity. */
  readonly blockId: BlockId;
  /** Current complete placement for a non-root Block. */
  readonly placement?: StructuralPlacement<Position>;
}

/** Carrier-neutral live structural state used for deterministic projection. */
export interface StructuralProjectionSnapshot<Position> {
  /** Immutable root identity. */
  readonly rootId: BlockId;
  /** Root and live non-root structural entries. */
  readonly entries: readonly StructuralProjectionEntry<Position>[];
}

/** One projected live Block in deterministic preorder. */
export interface ProjectedStructuralBlock {
  /** Durable Block identity. */
  readonly blockId: BlockId;
  /** Projected parent identity. Root has no parent. */
  readonly parentId?: BlockId;
  /** Effective flat depth from carrier placement. */
  readonly depth: number;
}

/** Serializes one non-root placement without inspecting allocator-private position data. */
export function encodeStructuralPlacement<Position>(
  placement: StructuralPlacement<Position>,
  codec: StructuralPositionCodec<Position>,
): string {
  if (!Number.isSafeInteger(placement.depth) || placement.depth < 1) {
    throw new TypeError(
      "Non-root structural placement depth must be a positive integer.",
    );
  }
  return JSON.stringify({
    position: codec.encode(placement.position),
    depth: placement.depth,
  });
}

/** Parses one non-root placement without binding the structural carrier to a position encoding. */
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
  if (!Number.isSafeInteger(depth) || typeof depth !== "number" || depth < 1) {
    throw new TypeError(
      "Non-root structural placement depth must be a positive integer.",
    );
  }
  if (typeof position !== "string") {
    throw new TypeError("Structural placement position encoding is invalid.");
  }
  return { position: codec.decode(position), depth };
}

/** Projects one live carrier-neutral structural snapshot deterministically. */
export function projectStructuralSnapshot<Position>(
  snapshot: StructuralProjectionSnapshot<Position>,
  ordering: StructuralPositionOrdering<Position>,
): readonly ProjectedStructuralBlock[] {
  const root = snapshot.entries.find(
    (entry) => entry.blockId === snapshot.rootId,
  );
  if (root === undefined) {
    throw new TypeError("Structural projection requires the root entry.");
  }

  const live = snapshot.entries
    .filter(
      (
        entry,
      ): entry is StructuralProjectionEntry<Position> & {
        readonly placement: StructuralPlacement<Position>;
      } =>
        entry.blockId !== snapshot.rootId && entry.placement !== undefined,
    )
    .sort((left, right) => {
      const order = ordering.compare(
        left.placement.position,
        right.placement.position,
      );
      return order === 0 ? left.blockId.localeCompare(right.blockId) : order;
    });

  const projected: ProjectedStructuralBlock[] = [
    { blockId: snapshot.rootId, depth: 0 },
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
    });
    stack.push({ blockId: entry.blockId, depth: entry.placement.depth });
  }
  return projected;
}

function isRecord(value: unknown): value is Readonly<Record<string, unknown>> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
