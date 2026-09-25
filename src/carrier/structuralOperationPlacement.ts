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
 * Effective document depth is used only to identify logical subtree runs.
 * Existing indicated placement depths are preserved unless a minimal change is
 * required to realize the requested parentage after the run is spliced.
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
  let projected: readonly ProjectedStructuralBlock[];
  try {
    projected = projectStructuralSnapshot(snapshot, allocator);
  } catch (cause: unknown) {
    return failure(
      "SnapshotMismatch",
      cause instanceof Error
        ? `Structural carrier snapshot is invalid: ${cause.message}`
        : "Structural carrier snapshot is invalid.",
    );
  }
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

  const runDepth = target[runStart]!.effectiveDepth;
  let runEnd = runStart + 1;
  while (runEnd < target.length && target[runEnd]!.effectiveDepth > runDepth) {
    runEnd += 1;
  }
  const run = target.slice(runStart, runEnd);
  const runBlockIds = new Set(run.map((entry) => entry.blockId));

  const currentPlacements = new Map<BlockId, StructuralPlacement<Position>>();
  for (const entry of snapshot.entries) {
    if (entry.blockId !== snapshot.rootId && entry.placement !== undefined) {
      currentPlacements.set(entry.blockId, entry.placement);
    }
  }

  const plannedDepths = planRunDepths(
    target,
    runStart,
    runEnd,
    snapshot.rootId,
    currentPlacements,
  );
  if (plannedDepths === undefined) {
    return failure(
      "SnapshotMismatch",
      "The requested logical structure cannot be represented by minimal valid indicated-depth changes.",
    );
  }

  const predecessor = target[runStart - 1]!;
  const successor = target[runEnd];
  let lower =
    predecessor.blockId === snapshot.rootId
      ? undefined
      : currentPlacements.get(predecessor.blockId)?.position;
  if (predecessor.blockId !== snapshot.rootId && lower === undefined) {
    return failure(
      "SnapshotMismatch",
      "The destination predecessor has no current structural position.",
    );
  }

  let upper =
    successor === undefined
      ? undefined
      : currentPlacements.get(successor.blockId)?.position;
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
      const position = currentPlacements.get(entry.blockId)?.position;
      if (position === undefined) {
        return failure(
          "SnapshotMismatch",
          "A stationary destination Block has no current structural position.",
        );
      }
      orderedPositions.push(position);
    }
    if (successor === undefined) {
      return failure(
        "SnapshotMismatch",
        "A collided destination boundary requires a successor Block.",
      );
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
      const currentPlacement = currentPlacements.get(entry.blockId);
      if (currentPlacement === undefined) {
        throw new TypeError(
          "A normalized structural Block has no current placement.",
        );
      }
      return {
        blockId: entry.blockId,
        placement: {
          position: update.position,
          depth: currentPlacement.depth,
        },
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
          depth: plannedDepths[index]!,
        },
      })),
    },
  };
}

interface FlatStructuralBlock {
  readonly blockId: BlockId;
  readonly parentId?: BlockId;
  readonly effectiveDepth: number;
}

function flattenDocument(
  document: StructuralDocument,
): readonly FlatStructuralBlock[] {
  const result: FlatStructuralBlock[] = [];
  const stack: Array<{
    readonly block: Block;
    readonly parentId?: BlockId;
    readonly effectiveDepth: number;
  }> = [{ block: document.root, effectiveDepth: 0 }];
  while (stack.length > 0) {
    const current = stack.pop()!;
    result.push({
      blockId: current.block.id,
      ...(current.parentId === undefined ? {} : { parentId: current.parentId }),
      effectiveDepth: current.effectiveDepth,
    });
    for (
      let index = current.block.children.length - 1;
      index >= 0;
      index -= 1
    ) {
      const child = current.block.children[index];
      if (child !== undefined) {
        stack.push({
          block: child,
          parentId: current.block.id,
          effectiveDepth: current.effectiveDepth + 1,
        });
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
        entry.parentId === projected[index]?.parentId,
    )
  );
}

function planRunDepths<Position>(
  target: readonly FlatStructuralBlock[],
  runStart: number,
  runEnd: number,
  rootId: BlockId,
  currentPlacements: ReadonlyMap<BlockId, StructuralPlacement<Position>>,
): readonly number[] | undefined {
  const root = target[runStart];
  if (
    root === undefined ||
    root.blockId === rootId ||
    root.parentId === undefined
  ) {
    return undefined;
  }

  const parentIndex = target.findIndex(
    (entry) => entry.blockId === root.parentId,
  );
  const parentDepth = indicatedDepth(root.parentId, rootId, currentPlacements);
  if (
    parentIndex < 0 ||
    parentIndex >= runStart ||
    parentDepth === undefined ||
    parentDepth >= Number.MAX_SAFE_INTEGER
  ) {
    return undefined;
  }

  let minimumRootDepth = parentDepth + 1;
  const successor = target[runEnd];
  if (successor !== undefined) {
    const successorDepth = indicatedDepth(
      successor.blockId,
      rootId,
      currentPlacements,
    );
    if (successorDepth === undefined) {
      return undefined;
    }
    minimumRootDepth = Math.max(minimumRootDepth, successorDepth);
  }

  let maximumRootDepth = Number.MAX_SAFE_INTEGER;
  for (let index = parentIndex + 1; index < runStart; index += 1) {
    const preceding = target[index];
    if (preceding === undefined) {
      return undefined;
    }
    const precedingDepth = indicatedDepth(
      preceding.blockId,
      rootId,
      currentPlacements,
    );
    if (precedingDepth === undefined) {
      return undefined;
    }
    maximumRootDepth = Math.min(maximumRootDepth, precedingDepth);
  }
  if (
    !Number.isSafeInteger(minimumRootDepth) ||
    minimumRootDepth > maximumRootDepth
  ) {
    return undefined;
  }

  const planned = new Map<BlockId, number>();
  const currentRootDepth = currentPlacements.get(root.blockId)?.depth;
  const rootDepth =
    currentRootDepth === undefined
      ? minimumRootDepth
      : Math.min(
          maximumRootDepth,
          Math.max(minimumRootDepth, currentRootDepth),
        );
  planned.set(root.blockId, rootDepth);

  for (let index = runStart + 1; index < runEnd; index += 1) {
    const entry = target[index];
    if (entry?.parentId === undefined) {
      return undefined;
    }
    const plannedParentDepth = planned.get(entry.parentId);
    const currentDepth = currentPlacements.get(entry.blockId)?.depth;
    if (plannedParentDepth === undefined || currentDepth === undefined) {
      return undefined;
    }
    const depth = Math.max(currentDepth, plannedParentDepth + 1);
    if (!Number.isSafeInteger(depth)) {
      return undefined;
    }
    planned.set(entry.blockId, depth);
  }

  if (!depthsProjectTarget(target, rootId, currentPlacements, planned)) {
    return undefined;
  }
  return target
    .slice(runStart, runEnd)
    .map((entry) => planned.get(entry.blockId)!);
}

function indicatedDepth<Position>(
  blockId: BlockId,
  rootId: BlockId,
  currentPlacements: ReadonlyMap<BlockId, StructuralPlacement<Position>>,
): number | undefined {
  return blockId === rootId ? 0 : currentPlacements.get(blockId)?.depth;
}

function depthsProjectTarget<Position>(
  target: readonly FlatStructuralBlock[],
  rootId: BlockId,
  currentPlacements: ReadonlyMap<BlockId, StructuralPlacement<Position>>,
  planned: ReadonlyMap<BlockId, number>,
): boolean {
  if (target[0]?.blockId !== rootId || target[0].parentId !== undefined) {
    return false;
  }
  const stack: Array<{ readonly blockId: BlockId; readonly depth: number }> = [
    { blockId: rootId, depth: 0 },
  ];
  for (let index = 1; index < target.length; index += 1) {
    const entry = target[index];
    if (entry === undefined) {
      return false;
    }
    const depth =
      planned.get(entry.blockId) ?? currentPlacements.get(entry.blockId)?.depth;
    if (depth === undefined) {
      return false;
    }
    while ((stack.at(-1)?.depth ?? 0) >= depth && stack.length > 1) {
      stack.pop();
    }
    const parent = stack.at(-1);
    if (parent?.blockId !== entry.parentId) {
      return false;
    }
    stack.push({ blockId: entry.blockId, depth });
  }
  return true;
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
    if (index > 0 && allocator.compare(positions[index - 1]!, position) >= 0) {
      return false;
    }
  }
  return true;
}

function failure(
  kind: StructuralOperationPlacementError["kind"],
  message: string,
): Extract<StructuralOperationPlacementResult<never>, { readonly ok: false }> {
  return { ok: false, error: { kind, message } };
}
