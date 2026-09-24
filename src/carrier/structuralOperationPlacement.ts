import { applyStructuralOperations } from "../domain/index.js";
import type {
  Block,
  BlockId,
  StructuralDocument,
  StructuralError,
  StructuralOperation,
} from "../domain/index.js";
import type {
  StructuralPositionAllocationError,
  StructuralPositionAllocator,
} from "./position.js";
import { planPositionCollisionNormalization } from "./positionNormalization.js";
import type { PositionNormalizationError } from "./positionNormalization.js";
import type {
  ProjectedStructuralBlock,
  StructuralPlacement,
  StructuralProjectionSnapshot,
} from "./structuralCarrier.js";
import { projectStructuralSnapshot } from "./structuralCarrier.js";

/** One semantic placement mutation planned from a Step 2 Block operation. */
export interface StructuralOperationPlacementUpdate<Position> {
  /** Existing or newly created Block whose complete placement changes. */
  readonly blockId: BlockId;
  /** Fresh complete placement for this operation. */
  readonly placement: StructuralPlacement<Position>;
}

/** One carrier-private rewrite needed to open a collided insertion boundary. */
export interface StructuralOperationNormalizationUpdate<Position> {
  /** Existing Block whose projected meaning must remain unchanged. */
  readonly blockId: BlockId;
  /** Fresh complete placement that preserves the Block's logical depth. */
  readonly placement: StructuralPlacement<Position>;
}

/** Successful carrier-neutral placement plan for one structural operation. */
export interface StructuralOperationPlacementPlan<Position> {
  /** Collision rewrites that must publish with the dependent semantic operation. */
  readonly normalizations: readonly StructuralOperationNormalizationUpdate<Position>[];
  /** Fresh semantic placements in projected preorder for the created or moved run. */
  readonly placements: readonly StructuralOperationPlacementUpdate<Position>[];
}

/** Opaque allocator contexts consumed by one placement-planning attempt. */
export interface StructuralOperationAllocationContexts<AllocationContext> {
  /** Fresh context reserved for collision normalization when it is required. */
  readonly normalization: AllocationContext;
  /** Fresh context for the created or moved semantic run. */
  readonly operation: AllocationContext;
}

/** Expected failure while mapping one structural operation to flat placement. */
export interface StructuralOperationPlacementError {
  /** Stable failure category owned by the structural planner. */
  readonly kind:
    | "DomainRejected"
    | "SnapshotMismatch"
    | "NormalizationFailed"
    | "AllocationFailed"
    | "InvalidAllocation";
  /** Human-readable diagnostic detail. */
  readonly message: string;
  /** Step 2 rejection when the product-level operation is invalid. */
  readonly domainError?: StructuralError;
  /** Collision-normalization rejection when a collided boundary cannot be opened. */
  readonly normalizationError?: PositionNormalizationError;
  /** Allocator rejection when the semantic run cannot be placed. */
  readonly allocationError?: StructuralPositionAllocationError;
}

/** Result of mapping one create or move operation to flat structural placement. */
export type StructuralOperationPlacementResult<Position> =
  | {
      /** Indicates successful placement planning. */
      readonly ok: true;
      /** Complete carrier changes required for the operation. */
      readonly value: StructuralOperationPlacementPlan<Position>;
    }
  | {
      /** Indicates an expected placement-planning failure. */
      readonly ok: false;
      /** Stable failure detail. */
      readonly error: StructuralOperationPlacementError;
    };

/**
 * Maps one Step 2 Block create or move to fresh flat structural placements.
 *
 * @remarks
 * The Step 2 reducer remains authoritative for parent/index, cycle, root, and
 * no-effect semantics. The planner first verifies that the current carrier
 * projection matches the logical document, then applies the operation through
 * the reducer. The resulting preorder identifies the destination open interval.
 *
 * When that boundary is a primary-position collision, the planner first plans
 * the minimum later-run normalization. The returned normalization and semantic
 * placement updates must publish atomically. Candidate-private position data
 * stays behind the allocator abstraction.
 */
export function planStructuralOperationPlacements<Position, AllocationContext>(
  document: StructuralDocument,
  snapshot: StructuralProjectionSnapshot<Position>,
  operation: Extract<
    StructuralOperation,
    { readonly kind: "CreateBlock" | "MoveBlock" }
  >,
  allocator: StructuralPositionAllocator<Position, AllocationContext>,
  contexts: StructuralOperationAllocationContexts<AllocationContext>,
): StructuralOperationPlacementResult<Position> {
  if (
    snapshot.entries.some(
      (entry) =>
        entry.blockId !== snapshot.rootId && entry.placement === undefined,
    )
  ) {
    return failure(
      "SnapshotMismatch",
      "Every live non-root structural entry must have a current placement.",
    );
  }

  const projected = projectStructuralSnapshot(snapshot, allocator);
  const currentLogical = flattenDocument(document);
  if (!sameProjectedStructure(currentLogical, projected)) {
    return failure(
      "SnapshotMismatch",
      "Structural carrier projection does not match the current logical document.",
    );
  }

  const applied = applyStructuralOperations(document, [operation]);
  if (!applied.ok) {
    return {
      ok: false,
      error: {
        kind: "DomainRejected",
        message: "The Step 2 structural operation was rejected.",
        domainError: applied.error,
      },
    };
  }

  const target = flattenDocument(applied.value);
  const runStart = target.findIndex(
    (entry) => entry.blockId === operation.blockId,
  );
  if (runStart <= 0) {
    return failure(
      "SnapshotMismatch",
      "The planned non-root Block is missing from the target logical document.",
    );
  }

  const runDepth = target[runStart]!.depth;
  let runEnd = runStart + 1;
  while (runEnd < target.length && target[runEnd]!.depth > runDepth) {
    runEnd += 1;
  }
  const run = target.slice(runStart, runEnd);
  const runBlockIds = new Set(run.map((entry) => entry.blockId));

  const positions = new Map<BlockId, Position>();
  for (const entry of snapshot.entries) {
    if (
      entry.blockId !== snapshot.rootId &&
      entry.placement !== undefined &&
      !runBlockIds.has(entry.blockId)
    ) {
      positions.set(entry.blockId, entry.placement.position);
    }
  }

  const predecessor = target[runStart - 1]!;
  const successor = target[runEnd];
  let lower =
    predecessor.blockId === snapshot.rootId
      ? undefined
      : positions.get(predecessor.blockId);
  if (predecessor.blockId !== snapshot.rootId && lower === undefined) {
    return failure(
      "SnapshotMismatch",
      "The destination predecessor has no current structural position.",
    );
  }

  let upper =
    successor === undefined ? undefined : positions.get(successor.blockId);
  if (successor !== undefined && upper === undefined) {
    return failure(
      "SnapshotMismatch",
      "The destination successor has no current structural position.",
    );
  }

  let normalizations: StructuralOperationNormalizationUpdate<Position>[] = [];
  if (
    lower !== undefined &&
    upper !== undefined &&
    allocator.comparePrimary(lower, upper) === 0
  ) {
    const stationary = target.filter(
      (entry) =>
        entry.blockId !== snapshot.rootId && !runBlockIds.has(entry.blockId),
    );
    const orderedPositions: Position[] = [];
    for (const entry of stationary) {
      const position = positions.get(entry.blockId);
      if (position === undefined) {
        return failure(
          "SnapshotMismatch",
          "A stationary destination Block has no current structural position.",
        );
      }
      orderedPositions.push(position);
    }
    const insertionIndex = stationary.findIndex(
      (entry) => entry.blockId === successor.blockId,
    );
    const normalization = planPositionCollisionNormalization(
      allocator,
      orderedPositions,
      insertionIndex,
      contexts.normalization,
    );
    if (!normalization.ok) {
      return {
        ok: false,
        error: {
          kind: "NormalizationFailed",
          message: "Could not open a collided structural insertion boundary.",
          normalizationError: normalization.error,
        },
      };
    }

    normalizations = normalization.value.updates.map((update) => {
      const entry = stationary[update.index]!;
      return {
        blockId: entry.blockId,
        placement: { position: update.position, depth: entry.depth },
      };
    });
    lower = normalization.value.insertionLower;
    upper = normalization.value.insertionUpper;
  }

  const allocation = allocator.allocateRun({
    ...(lower === undefined ? {} : { lower }),
    ...(upper === undefined ? {} : { upper }),
    count: run.length,
    context: contexts.operation,
  });
  if (!allocation.ok) {
    return {
      ok: false,
      error: {
        kind: "AllocationFailed",
        message: "Could not allocate the requested structural placement run.",
        allocationError: allocation.error,
      },
    };
  }
  if (
    !isValidAllocation(allocator, allocation.value, lower, upper, run.length)
  ) {
    return failure(
      "InvalidAllocation",
      "Structural position allocator returned an invalid ordered open-interval run.",
    );
  }

  return {
    ok: true,
    value: {
      normalizations,
      placements: run.map((entry, index) => ({
        blockId: entry.blockId,
        placement: {
          position: allocation.value[index]!,
          depth: entry.depth,
        },
      })),
    },
  };
}

interface FlatStructuralBlock {
  readonly blockId: BlockId;
  readonly depth: number;
}

function flattenDocument(
  document: StructuralDocument,
): readonly FlatStructuralBlock[] {
  const result: FlatStructuralBlock[] = [];
  const stack: Array<{ readonly block: Block; readonly depth: number }> = [
    { block: document.root, depth: 0 },
  ];
  while (stack.length > 0) {
    const current = stack.pop()!;
    result.push({ blockId: current.block.id, depth: current.depth });
    for (
      let index = current.block.children.length - 1;
      index >= 0;
      index -= 1
    ) {
      const child = current.block.children[index];
      if (child !== undefined) {
        stack.push({ block: child, depth: current.depth + 1 });
      }
    }
  }
  return result;
}

function sameProjectedStructure(
  logical: readonly FlatStructuralBlock[],
  projected: readonly ProjectedStructuralBlock[],
): boolean {
  return (
    logical.length === projected.length &&
    logical.every(
      (entry, index) =>
        entry.blockId === projected[index]?.blockId &&
        entry.depth === projected[index]?.depth,
    )
  );
}

function isValidAllocation<Position, AllocationContext>(
  allocator: StructuralPositionAllocator<Position, AllocationContext>,
  positions: readonly Position[],
  lower: Position | undefined,
  upper: Position | undefined,
  expectedCount: number,
): boolean {
  if (positions.length !== expectedCount) {
    return false;
  }
  for (let index = 0; index < positions.length; index += 1) {
    const position = positions[index]!;
    if (lower !== undefined && allocator.compare(lower, position) >= 0) {
      return false;
    }
    if (upper !== undefined && allocator.compare(position, upper) >= 0) {
      return false;
    }
    if (
      index > 0 &&
      allocator.compare(positions[index - 1]!, position) >= 0
    ) {
      return false;
    }
  }
  return true;
}

function failure(
  kind: StructuralOperationPlacementError["kind"],
  message: string,
): Extract<
  StructuralOperationPlacementResult<never>,
  { readonly ok: false }
> {
  return { ok: false, error: { kind, message } };
}
