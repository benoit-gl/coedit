import type { BlockId, DocumentId, InlineContentId } from "./ids.js";
import type { InlineContentValue } from "./content.js";
import type { TagSet } from "./tags.js";

/** Controls how a Block projects its direct children. */
export type ChildrenPresentation = "sections" | "flow" | "bullets" | "numbers";

/** One independently addressable content value owned by a Block. */
export interface InlineContent {
  /** Durable identity. */
  readonly id: InlineContentId;
  /** Tags owned by this InlineContent. */
  readonly tags: TagSet;
  /** Canonical carrier-neutral CollaborativeContent value. */
  readonly content: InlineContentValue;
}

/** One recursive structural unit in the document spine. */
export interface Block {
  /** Durable identity. */
  readonly id: BlockId;
  /** Tags owned by this Block. */
  readonly tags: TagSet;
  /** Projection rule for direct children. */
  readonly childrenPresentation: ChildrenPresentation;
  /** Ordered InlineContents owned by this Block. */
  readonly contents: readonly InlineContent[];
  /** Ordered direct child Blocks. */
  readonly children: readonly Block[];
}

/** Live structural projection for one Coedit document. */
export interface StructuralDocument {
  /** Durable document identity. */
  readonly id: DocumentId;
  /** The document's one real root Block. */
  readonly root: Block;
}
