/** Supported entry point for the pure Step 2 document domain. */
export {
  isCanonicalUuidV4,
  parseBlockId,
  parseDocumentId,
  parseInlineContentId,
} from "./ids.js";
/** Durable identity types used by the structural domain. */
export type { BlockId, DocumentId, InlineContentId } from "./ids.js";
/** Pure structural domain entity and presentation types. */
export type {
  Block,
  ChildrenPresentation,
  InlineContent,
  InlineContentValue,
  StructuralDocument,
} from "./model.js";
export { createEmptyInlineContentValue } from "./model.js";
/** Structural construction, mutation, validation, and failure contracts. */
export {
  applyStructuralOperations,
  createEmptyDocument,
  validateDocument,
} from "./structural.js";
export type {
  CreateEmptyDocumentParameters,
  StructuralError,
  StructuralErrorKind,
  StructuralOperation,
  StructuralResult,
} from "./structural.js";
/** Shared tag normalization used by Block and InlineContent ownership. */
export { normalizeTags } from "./tags.js";
export type {
  TagNormalizationResult,
  TagSet,
  TagValidationError,
} from "./tags.js";
