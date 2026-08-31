/** Supported entry point for the pure document domain. */
export {
  isCanonicalUuidV4,
  parseBlockId,
  parseContributionId,
  parseContributorId,
  parseDocumentId,
  parseInlineContentId,
  parseOriginId,
} from "./ids.js";
export type {
  BlockId,
  ContributionId,
  ContributorId,
  DocumentId,
  InlineContentId,
  OriginId,
} from "./ids.js";
export {
  cloneInlineContentValue,
  contentLength,
  createEmptyInlineContentValue,
  validateInlineContentValue,
} from "./content.js";
export type {
  ContentItem,
  ContentValidationError,
  ContentValidationErrorKind,
  ContentValidationResult,
  FormattingMark,
  FormattingMarkKind,
  HardBreakContentItem,
  InlineContentValue,
  InternalBlockLinkTarget,
  InternalLinkRange,
  LinkTarget,
  MarkBoundaryPolicy,
  OpaqueLinkTarget,
  OpaqueLinkValue,
  OriginKind,
  OriginRecord,
  StableRangeCursor,
  TextContentItem,
} from "./content.js";
export type {
  Block,
  ChildrenPresentation,
  InlineContent,
  StructuralDocument,
} from "./model.js";
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
export { normalizeTags } from "./tags.js";
export type {
  TagNormalizationResult,
  TagSet,
  TagValidationError,
} from "./tags.js";
