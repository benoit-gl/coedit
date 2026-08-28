import type { BlockId, DocumentId, InlineContentId } from "./ids.js";
import type { TagSet } from "./tags.js";

const emptyInlineContentValueBrand: unique symbol = Symbol("emptyInlineContentValue");

/** Controls how a Block projects its direct children. */
export type ChildrenPresentation = "sections" | "flow" | "bullets" | "numbers";

/**
 * Canonical CollaborativeContent value carried by InlineContent.
 *
 * @remarks
 * Step 2 exposes only a valid empty value created by
 * {@link createEmptyInlineContentValue}. Structural code treats this value as
 * opaque. Step 3 expands this same domain type behind the carrier-neutral
 * boundary.
 */
export interface InlineContentValue {
  /** Internal nominal marker. It is not a wire-format or public type discriminator. */
  readonly [emptyInlineContentValueBrand]: true;
}

/** One independently addressable content value owned by a Block. */
export interface InlineContent {
  /** Durable identity. */
  readonly id: InlineContentId;
  /** Tags owned by this InlineContent. */
  readonly tags: TagSet;
  /** Canonical content value. */
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

/** Step 2 structural state for one Coedit document. */
export interface StructuralDocument {
  /** Durable document identity. */
  readonly id: DocumentId;
  /** The document's one real root Block. */
  readonly root: Block;
}

/** Creates the only valid Step 2 CollaborativeContent value. */
export function createEmptyInlineContentValue(): InlineContentValue {
  return Object.freeze({ [emptyInlineContentValueBrand]: true as const });
}
