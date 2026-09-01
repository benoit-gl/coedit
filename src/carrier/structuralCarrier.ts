import type { BlockId } from "../domain/ids.js";
import type { CarrierPosition } from "./position.js";
import { compareCarrierPositions } from "./position.js";

/** Atomic carrier-private structural placement. */
export interface StructuralPlacement {
  /** Dense carrier-private preorder position. */
  readonly position: CarrierPosition;
  /** Flat preorder depth. Root depth is zero. */
  readonly depth: number;
}

/** One semantic placement update with a fresh liveness token. */
export interface StructuralPlacementUpdate {
  /** Existing or newly created Block. */
  readonly blockId: BlockId;
  /** Complete replacement placement. */
  readonly placement: StructuralPlacement;
  /** Fresh token proving semantic activity for this Block. */
  readonly liveToken: string;
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
export interface StructuralCarrierChange {
  /** Placement mutations that publish in this carrier transaction/change. */
  readonly placements?: readonly StructuralPlacementUpdate[];
  /** Payload mutations that publish in this carrier transaction/change. */
  readonly payloads?: readonly StructuralPayloadUpdate[];
  /** Blocks whose currently observed live tokens are retired. */
  readonly deletes?: readonly BlockId[];
}

/** Detached snapshot of one Block carrier namespace. */
export interface StructuralCarrierEntrySnapshot {
  /** Durable Block identity. */
  readonly blockId: BlockId;
  /** Current complete placement when one has been published. */
  readonly placement?: StructuralPlacement;
  /** Detached Block-local qualification payload. */
  readonly payload: Readonly<Record<string, string>>;
  /** True when at least one replicated liveness token remains live. */
  readonly live: boolean;
}

/** Detached complete structural carrier state. */
export interface StructuralCarrierSnapshot {
  /** Immutable root identity. */
  readonly rootId: BlockId;
  /** All physical Block namespaces, including tombstoned entries. */
  readonly entries: readonly StructuralCarrierEntrySnapshot[];
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
export interface StructuralCarrier {
  /** Candidate name used in qualification output. */
  readonly candidate: "yjs" | "automerge";

  /** Applies one all-or-none carrier change. */
  applyChange(change: StructuralCarrierChange): void;

  /** Projects a detached complete carrier snapshot. */
  snapshot(): StructuralCarrierSnapshot;

  /** Encodes all replicated structural state. */
  encode(): Uint8Array;

  /** Merges complete or incremental state from another replica. */
  mergeEncoded(encoded: Uint8Array): void;
}

/** Factory used by the common structural carrier qualification suite. */
export interface StructuralCarrierFactory {
  /** Candidate name. */
  readonly candidate: StructuralCarrier["candidate"];

  /** Creates genesis with one immutable live root. */
  create(rootId: BlockId): StructuralCarrier;

  /** Reloads complete carrier state. */
  load(encoded: Uint8Array): StructuralCarrier;
}

/** Serializes one placement as one scalar carrier register value. */
export function encodeStructuralPlacement(placement: StructuralPlacement): string {
  if (!Number.isSafeInteger(placement.depth) || placement.depth < 0) {
    throw new TypeError("Structural placement depth must be a non-negative integer.");
  }
  return JSON.stringify(placement);
}

/** Parses one complete scalar placement register. */
export function decodeStructuralPlacement(value: string): StructuralPlacement {
  const parsed: unknown = JSON.parse(value);
  if (!isRecord(parsed)) {
    throw new TypeError("Structural placement must be an object.");
  }
  const depth = parsed.depth;
  const position = parsed.position;
  if (!Number.isSafeInteger(depth) || typeof depth !== "number" || depth < 0) {
    throw new TypeError("Structural placement depth is invalid.");
  }
  if (!isRecord(position) || !Array.isArray(position.digits)) {
    throw new TypeError("Structural placement position is invalid.");
  }
  const digits = position.digits;
  const run = position.run;
  const member = position.member;
  if (
    !digits.every((digit) => Number.isSafeInteger(digit) && digit >= 0 && digit < 65_536) ||
    typeof run !== "string" ||
    run.length === 0 ||
    !Number.isSafeInteger(member) ||
    typeof member !== "number" ||
    member < 0
  ) {
    throw new TypeError("Structural placement position fields are invalid.");
  }
  return { position: { digits, run, member }, depth };
}

/** Projects the accepted deterministic tree from one complete carrier snapshot. */
export function projectStructuralSnapshot(
  snapshot: StructuralCarrierSnapshot,
): readonly ProjectedStructuralBlock[] {
  const root = snapshot.entries.find((entry) => entry.blockId === snapshot.rootId);
  if (root === undefined || !root.live) {
    throw new TypeError("Structural carrier root must remain live.");
  }

  const live = snapshot.entries
    .filter(
      (entry): entry is StructuralCarrierEntrySnapshot & { readonly placement: StructuralPlacement } =>
        entry.live && entry.blockId !== snapshot.rootId && entry.placement !== undefined,
    )
    .sort((left, right) => {
      const order = compareCarrierPositions(left.placement.position, right.placement.position);
      return order === 0 ? left.blockId.localeCompare(right.blockId) : order;
    });

  const projected: ProjectedStructuralBlock[] = [
    { blockId: snapshot.rootId, depth: 0, payload: root.payload },
  ];
  const stack: Array<{ readonly blockId: BlockId; readonly depth: number }> = [
    { blockId: snapshot.rootId, depth: 0 },
  ];

  for (const entry of live) {
    while ((stack.at(-1)?.depth ?? 0) >= entry.placement.depth && stack.length > 1) {
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
