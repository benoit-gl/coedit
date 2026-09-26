/** Dense-order position contracts used by structural qualification. */
export type {
  StructuralPositionAllocationRequest,
  StructuralPositionAllocationResult,
  StructuralPositionAllocator,
  StructuralPositionCodec,
  StructuralPositionOrder,
  StructuralPositionOrdering,
} from "./position.js";

/** Collision-normalization planning used by structural qualification. */
export { planPositionCollisionNormalization } from "./positionNormalization.js";

/** Carrier-neutral placement encoding and projection used by qualification. */
export {
  decodeStructuralPlacement,
  encodeStructuralPlacement,
  projectStructuralSnapshot,
} from "./structuralCarrier.js";
export type {
  ProjectedStructuralBlock,
  StructuralPlacement,
  StructuralProjectionSnapshot,
} from "./structuralCarrier.js";

/** Step 2 command-to-placement planning used by structural qualification. */
export { planStructuralOperationPlacements } from "./structuralOperationPlacement.js";
