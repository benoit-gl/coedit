import { isCanonicalUuidV4 } from "./ids.js";
import type { BlockId, DocumentId, InlineContentId } from "./ids.js";
import type {
  Block,
  ChildrenPresentation,
  InlineContentValue,
  StructuralDocument,
} from "./model.js";
import { normalizeTags } from "./tags.js";
import type { TagSet } from "./tags.js";

/** One atomic structural mutation in the Step 2 domain. */
export type StructuralOperation =
  | {
      /** Selects Block creation. */
      readonly kind: "CreateBlock";
      /** Identity for the new non-root Block. */
      readonly blockId: BlockId;
      /** Live parent that will own the new Block. */
      readonly parentId: BlockId;
      /** Insertion index in the parent vector before insertion. */
      readonly index: number;
      /** Tags to normalize and assign to the new Block. */
      readonly tags: readonly string[];
      /** Presentation policy for the new Block's direct children. */
      readonly childrenPresentation: ChildrenPresentation;
    }
  | {
      /** Selects Block movement. */
      readonly kind: "MoveBlock";
      /** Live non-root Block to move. */
      readonly blockId: BlockId;
      /** Live destination parent Block. */
      readonly parentId: BlockId;
      /** Destination index after removal from the source parent. */
      readonly index: number;
    }
  | {
      /** Selects Block subtree deletion. */
      readonly kind: "DeleteBlock";
      /** Live non-root Block whose subtree will be deleted. */
      readonly blockId: BlockId;
    }
  | {
      /** Selects InlineContent creation. */
      readonly kind: "CreateInlineContent";
      /** Live Block that will own the new InlineContent. */
      readonly blockId: BlockId;
      /** Identity for the new InlineContent. */
      readonly inlineContentId: InlineContentId;
      /** Insertion index in the owner vector before insertion. */
      readonly index: number;
      /** Tags to normalize and assign to the new InlineContent. */
      readonly tags: readonly string[];
      /** Typed opaque empty content value required by Step 2. */
      readonly content: InlineContentValue;
    }
  | {
      /** Selects InlineContent reordering within its current owner. */
      readonly kind: "MoveInlineContent";
      /** Live InlineContent to reorder. */
      readonly inlineContentId: InlineContentId;
      /** Destination index after removal from the owner vector. */
      readonly index: number;
    }
  | {
      /** Selects InlineContent deletion. */
      readonly kind: "DeleteInlineContent";
      /** Live InlineContent to delete. */
      readonly inlineContentId: InlineContentId;
    }
  | {
      /** Selects Block tag replacement. */
      readonly kind: "SetBlockTags";
      /** Live Block whose tags will change. */
      readonly blockId: BlockId;
      /** Complete replacement tag input. */
      readonly tags: readonly string[];
    }
  | {
      /** Selects InlineContent tag replacement. */
      readonly kind: "SetInlineContentTags";
      /** Live InlineContent whose tags will change. */
      readonly inlineContentId: InlineContentId;
      /** Complete replacement tag input. */
      readonly tags: readonly string[];
    }
  | {
      /** Selects child-presentation replacement. */
      readonly kind: "SetChildrenPresentation";
      /** Live Block whose child presentation will change. */
      readonly blockId: BlockId;
      /** Complete replacement child-presentation value. */
      readonly value: ChildrenPresentation;
    };

/** Stable classification for an expected structural-domain rejection. */
export type StructuralErrorKind =
  | "EmptyOperationGroup"
  | "InvalidId"
  | "DuplicateId"
  | "InvalidTags"
  | "InvalidIndex"
  | "NotFound"
  | "RootMutation"
  | "Cycle"
  | "NoEffect";

/** Expected structural-domain failure. */
export interface StructuralError {
  /** Stable machine-readable failure kind. */
  readonly kind: StructuralErrorKind;
  /** Human-readable diagnostic detail. */
  readonly message: string;
}

/** Result of structural construction or mutation. */
export type StructuralResult<T> =
  | {
      /** Indicates successful construction, validation, or mutation. */
      readonly ok: true;
      /** Successful result value. */
      readonly value: T;
    }
  | {
      /** Indicates an expected domain rejection. */
      readonly ok: false;
      /** Stable structural-domain failure detail. */
      readonly error: StructuralError;
    };

/** Parameters for trusted genesis construction. */
export interface CreateEmptyDocumentParameters {
  /** Already allocated document identity. */
  readonly documentId: DocumentId;
  /** Already allocated identity for the one real root Block. */
  readonly rootId: BlockId;
  /** Structural presentation policy for children that can be added later. */
  readonly childrenPresentation: ChildrenPresentation;
}

/**
 * Creates genesis with exactly one real, completely empty root Block.
 *
 * @remarks
 * Trusted code supplies already allocated IDs and the structural child
 * presentation policy. The factory does not add tags, InlineContents, children,
 * title material, or any other application-level content. Root construction is
 * not a structural operation.
 */
export function createEmptyDocument(
  parameters: CreateEmptyDocumentParameters,
): StructuralResult<StructuralDocument> {
  const document: StructuralDocument = {
    id: parameters.documentId,
    root: {
      id: parameters.rootId,
      tags: [],
      childrenPresentation: parameters.childrenPresentation,
      contents: [],
      children: [],
    },
  };
  const validation = validateDocument(document);
  return validation.ok ? { ok: true, value: document } : validation;
}

/**
 * Applies a non-empty operation group atomically to a detached candidate.
 *
 * @remarks
 * Each operation sees the preceding result. A rejection returns no candidate
 * state and never mutates the input document. The reducer generates no IDs,
 * clocks, or lifetime identity registry.
 */
export function applyStructuralOperations(
  document: StructuralDocument,
  operations: readonly StructuralOperation[],
): StructuralResult<StructuralDocument> {
  if (operations.length === 0) {
    return failure(
      "EmptyOperationGroup",
      "A structural operation group cannot be empty.",
    );
  }

  const initialValidation = validateDocument(document);
  if (!initialValidation.ok) {
    return initialValidation;
  }

  const candidate = cloneDocument(document);
  for (const operation of operations) {
    const result = applyOperation(candidate, operation);
    if (!result.ok) {
      return result;
    }
    const validation = validateDocument(candidate);
    if (!validation.ok) {
      return validation;
    }
  }

  return { ok: true, value: candidate };
}

/** Validates all Step 2 live structural invariants. */
export function validateDocument(
  document: StructuralDocument,
): StructuralResult<StructuralDocument> {
  if (!isCanonicalUuidV4(document.id) || !isCanonicalUuidV4(document.root.id)) {
    return failure(
      "InvalidId",
      "Document and Block IDs must use canonical lowercase UUID-v4 text.",
    );
  }

  const durableIds = new Set<string>([document.id]);
  const stack: Block[] = [document.root];

  while (stack.length > 0) {
    const block = stack.pop();
    if (block === undefined) {
      break;
    }
    if (!isCanonicalUuidV4(block.id)) {
      return failure(
        "InvalidId",
        "Block IDs must use canonical lowercase UUID-v4 text.",
      );
    }
    if (durableIds.has(block.id)) {
      return failure(
        "DuplicateId",
        "Durable UUID text must be globally unique in the live document.",
      );
    }
    durableIds.add(block.id);

    const blockTags = normalizeTags(block.tags);
    if (!blockTags.ok || !sameStrings(block.tags, blockTags.value)) {
      return failure(
        "InvalidTags",
        "Stored Block tags must already be normalized and valid.",
      );
    }

    for (const content of block.contents) {
      if (!isCanonicalUuidV4(content.id)) {
        return failure(
          "InvalidId",
          "InlineContent IDs must use canonical lowercase UUID-v4 text.",
        );
      }
      if (durableIds.has(content.id)) {
        return failure(
          "DuplicateId",
          "Durable UUID text must be globally unique in the live document.",
        );
      }
      durableIds.add(content.id);
      const contentTags = normalizeTags(content.tags);
      if (!contentTags.ok || !sameStrings(content.tags, contentTags.value)) {
        return failure(
          "InvalidTags",
          "Stored InlineContent tags must already be normalized and valid.",
        );
      }
    }

    for (let index = block.children.length - 1; index >= 0; index -= 1) {
      const child = block.children[index];
      if (child !== undefined) {
        stack.push(child);
      }
    }
  }

  return { ok: true, value: document };
}

function applyOperation(
  document: MutableStructuralDocument,
  operation: StructuralOperation,
): StructuralResult<MutableStructuralDocument> {
  switch (operation.kind) {
    case "CreateBlock":
      return createBlock(document, operation);
    case "MoveBlock":
      return moveBlock(document, operation);
    case "DeleteBlock":
      return deleteBlock(document, operation.blockId);
    case "CreateInlineContent":
      return createInlineContent(document, operation);
    case "MoveInlineContent":
      return moveInlineContent(
        document,
        operation.inlineContentId,
        operation.index,
      );
    case "DeleteInlineContent":
      return deleteInlineContent(document, operation.inlineContentId);
    case "SetBlockTags":
      return setBlockTags(document, operation.blockId, operation.tags);
    case "SetInlineContentTags":
      return setInlineContentTags(
        document,
        operation.inlineContentId,
        operation.tags,
      );
    case "SetChildrenPresentation":
      return setChildrenPresentation(
        document,
        operation.blockId,
        operation.value,
      );
  }
}

type CreateBlockOperation = Extract<
  StructuralOperation,
  { readonly kind: "CreateBlock" }
>;
type MoveBlockOperation = Extract<
  StructuralOperation,
  { readonly kind: "MoveBlock" }
>;
type CreateInlineContentOperation = Extract<
  StructuralOperation,
  { readonly kind: "CreateInlineContent" }
>;

interface MutableInlineContent {
  id: InlineContentId;
  tags: string[];
  content: InlineContentValue;
}

interface MutableBlock {
  id: BlockId;
  tags: string[];
  childrenPresentation: ChildrenPresentation;
  contents: MutableInlineContent[];
  children: MutableBlock[];
}

interface MutableStructuralDocument {
  id: DocumentId;
  root: MutableBlock;
}

interface BlockLocation {
  readonly block: MutableBlock;
  readonly parent: MutableBlock | undefined;
  readonly index: number | undefined;
}

interface InlineLocation {
  readonly content: MutableInlineContent;
  readonly owner: MutableBlock;
  readonly index: number;
}

function createBlock(
  document: MutableStructuralDocument,
  operation: CreateBlockOperation,
): StructuralResult<MutableStructuralDocument> {
  if (!isCanonicalUuidV4(operation.blockId)) {
    return failure(
      "InvalidId",
      "Block IDs must use canonical lowercase UUID-v4 text.",
    );
  }
  if (hasDurableId(document, operation.blockId)) {
    return failure(
      "DuplicateId",
      "Durable UUID text must be globally unique in the live document.",
    );
  }
  const parent = findBlock(document.root, operation.parentId)?.block;
  if (parent === undefined) {
    return failure("NotFound", "CreateBlock requires a live parent Block.");
  }
  if (!isInsertionIndex(operation.index, parent.children.length)) {
    return failure(
      "InvalidIndex",
      "CreateBlock index is outside the insertion vector.",
    );
  }
  const tags = normalizeForOperation(operation.tags);
  if (!tags.ok) {
    return failure("InvalidTags", tags.error.message);
  }
  parent.children.splice(operation.index, 0, {
    id: operation.blockId,
    tags: [...tags.value],
    childrenPresentation: operation.childrenPresentation,
    contents: [],
    children: [],
  });
  return { ok: true, value: document };
}

function moveBlock(
  document: MutableStructuralDocument,
  operation: MoveBlockOperation,
): StructuralResult<MutableStructuralDocument> {
  const source = findBlock(document.root, operation.blockId);
  if (source === undefined) {
    return failure("NotFound", "MoveBlock requires a live Block.");
  }
  if (source.parent === undefined || source.index === undefined) {
    return failure("RootMutation", "The root Block cannot be moved.");
  }
  const destination = findBlock(document.root, operation.parentId)?.block;
  if (destination === undefined) {
    return failure("NotFound", "MoveBlock requires a live destination parent.");
  }
  if (
    source.block === destination ||
    containsBlock(source.block, destination.id)
  ) {
    return failure(
      "Cycle",
      "A Block cannot move into itself or one of its descendants.",
    );
  }

  const postRemovalLength =
    source.parent === destination
      ? destination.children.length - 1
      : destination.children.length;
  if (!isInsertionIndex(operation.index, postRemovalLength)) {
    return failure(
      "InvalidIndex",
      "MoveBlock index is outside the post-removal destination vector.",
    );
  }
  if (source.parent === destination && source.index === operation.index) {
    return failure(
      "NoEffect",
      "MoveBlock would preserve the existing sibling order.",
    );
  }

  source.parent.children.splice(source.index, 1);
  destination.children.splice(operation.index, 0, source.block);
  return { ok: true, value: document };
}

function deleteBlock(
  document: MutableStructuralDocument,
  blockId: BlockId,
): StructuralResult<MutableStructuralDocument> {
  const source = findBlock(document.root, blockId);
  if (source === undefined) {
    return failure("NotFound", "DeleteBlock requires a live Block.");
  }
  if (source.parent === undefined || source.index === undefined) {
    return failure("RootMutation", "The root Block cannot be deleted.");
  }
  source.parent.children.splice(source.index, 1);
  return { ok: true, value: document };
}

function createInlineContent(
  document: MutableStructuralDocument,
  operation: CreateInlineContentOperation,
): StructuralResult<MutableStructuralDocument> {
  if (!isCanonicalUuidV4(operation.inlineContentId)) {
    return failure(
      "InvalidId",
      "InlineContent IDs must use canonical lowercase UUID-v4 text.",
    );
  }
  if (hasDurableId(document, operation.inlineContentId)) {
    return failure(
      "DuplicateId",
      "Durable UUID text must be globally unique in the live document.",
    );
  }
  const block = findBlock(document.root, operation.blockId)?.block;
  if (block === undefined) {
    return failure(
      "NotFound",
      "CreateInlineContent requires a live owner Block.",
    );
  }
  if (!isInsertionIndex(operation.index, block.contents.length)) {
    return failure(
      "InvalidIndex",
      "CreateInlineContent index is outside the insertion vector.",
    );
  }
  const tags = normalizeForOperation(operation.tags);
  if (!tags.ok) {
    return failure("InvalidTags", tags.error.message);
  }
  block.contents.splice(operation.index, 0, {
    id: operation.inlineContentId,
    tags: [...tags.value],
    content: operation.content,
  });
  return { ok: true, value: document };
}

function moveInlineContent(
  document: MutableStructuralDocument,
  inlineContentId: InlineContentId,
  index: number,
): StructuralResult<MutableStructuralDocument> {
  const source = findInlineContent(document.root, inlineContentId);
  if (source === undefined) {
    return failure(
      "NotFound",
      "MoveInlineContent requires a live InlineContent.",
    );
  }
  const postRemovalLength = source.owner.contents.length - 1;
  if (!isInsertionIndex(index, postRemovalLength)) {
    return failure(
      "InvalidIndex",
      "MoveInlineContent index is outside the post-removal owner vector.",
    );
  }
  if (source.index === index) {
    return failure(
      "NoEffect",
      "MoveInlineContent would preserve the existing content order.",
    );
  }
  source.owner.contents.splice(source.index, 1);
  source.owner.contents.splice(index, 0, source.content);
  return { ok: true, value: document };
}

function deleteInlineContent(
  document: MutableStructuralDocument,
  inlineContentId: InlineContentId,
): StructuralResult<MutableStructuralDocument> {
  const source = findInlineContent(document.root, inlineContentId);
  if (source === undefined) {
    return failure(
      "NotFound",
      "DeleteInlineContent requires a live InlineContent.",
    );
  }
  source.owner.contents.splice(source.index, 1);
  return { ok: true, value: document };
}

function setBlockTags(
  document: MutableStructuralDocument,
  blockId: BlockId,
  values: readonly string[],
): StructuralResult<MutableStructuralDocument> {
  const block = findBlock(document.root, blockId)?.block;
  if (block === undefined) {
    return failure("NotFound", "SetBlockTags requires a live Block.");
  }
  const tags = normalizeForOperation(values);
  if (!tags.ok) {
    return failure("InvalidTags", tags.error.message);
  }
  if (sameStrings(block.tags, tags.value)) {
    return failure(
      "NoEffect",
      "SetBlockTags would preserve the existing tags.",
    );
  }
  block.tags = [...tags.value];
  return { ok: true, value: document };
}

function setInlineContentTags(
  document: MutableStructuralDocument,
  inlineContentId: InlineContentId,
  values: readonly string[],
): StructuralResult<MutableStructuralDocument> {
  const content = findInlineContent(document.root, inlineContentId)?.content;
  if (content === undefined) {
    return failure(
      "NotFound",
      "SetInlineContentTags requires a live InlineContent.",
    );
  }
  const tags = normalizeForOperation(values);
  if (!tags.ok) {
    return failure("InvalidTags", tags.error.message);
  }
  if (sameStrings(content.tags, tags.value)) {
    return failure(
      "NoEffect",
      "SetInlineContentTags would preserve the existing tags.",
    );
  }
  content.tags = [...tags.value];
  return { ok: true, value: document };
}

function setChildrenPresentation(
  document: MutableStructuralDocument,
  blockId: BlockId,
  value: ChildrenPresentation,
): StructuralResult<MutableStructuralDocument> {
  const block = findBlock(document.root, blockId)?.block;
  if (block === undefined) {
    return failure(
      "NotFound",
      "SetChildrenPresentation requires a live Block.",
    );
  }
  if (block.childrenPresentation === value) {
    return failure(
      "NoEffect",
      "SetChildrenPresentation would preserve the existing value.",
    );
  }
  block.childrenPresentation = value;
  return { ok: true, value: document };
}

function normalizeForOperation(
  values: readonly string[],
): StructuralResult<TagSet> {
  const result = normalizeTags(values);
  return result.ok
    ? { ok: true, value: result.value }
    : failure("InvalidTags", result.error.message);
}

function cloneDocument(
  document: StructuralDocument,
): MutableStructuralDocument {
  const root = cloneBlockShell(document.root);
  const stack: Array<{
    readonly source: Block;
    readonly target: MutableBlock;
  }> = [{ source: document.root, target: root }];

  while (stack.length > 0) {
    const entry = stack.pop();
    if (entry === undefined) {
      break;
    }
    for (const child of entry.source.children) {
      const targetChild = cloneBlockShell(child);
      entry.target.children.push(targetChild);
      stack.push({ source: child, target: targetChild });
    }
  }

  return { id: document.id, root };
}

function cloneBlockShell(block: Block): MutableBlock {
  return {
    id: block.id,
    tags: [...block.tags],
    childrenPresentation: block.childrenPresentation,
    contents: block.contents.map((content) => ({
      id: content.id,
      tags: [...content.tags],
      content: content.content,
    })),
    children: [],
  };
}

function findBlock(
  root: MutableBlock,
  blockId: BlockId,
): BlockLocation | undefined {
  const stack: BlockLocation[] = [
    { block: root, parent: undefined, index: undefined },
  ];
  while (stack.length > 0) {
    const location = stack.pop();
    if (location === undefined) {
      break;
    }
    if (location.block.id === blockId) {
      return location;
    }
    for (
      let index = location.block.children.length - 1;
      index >= 0;
      index -= 1
    ) {
      const child = location.block.children[index];
      if (child !== undefined) {
        stack.push({ block: child, parent: location.block, index });
      }
    }
  }
  return undefined;
}

function findInlineContent(
  root: MutableBlock,
  id: InlineContentId,
): InlineLocation | undefined {
  const stack: MutableBlock[] = [root];
  while (stack.length > 0) {
    const block = stack.pop();
    if (block === undefined) {
      break;
    }
    const index = block.contents.findIndex((content) => content.id === id);
    const content = block.contents[index];
    if (index >= 0 && content !== undefined) {
      return { content, owner: block, index };
    }
    for (
      let childIndex = block.children.length - 1;
      childIndex >= 0;
      childIndex -= 1
    ) {
      const child = block.children[childIndex];
      if (child !== undefined) {
        stack.push(child);
      }
    }
  }
  return undefined;
}

function containsBlock(root: MutableBlock, id: BlockId): boolean {
  const stack = [...root.children];
  while (stack.length > 0) {
    const block = stack.pop();
    if (block === undefined) {
      break;
    }
    if (block.id === id) {
      return true;
    }
    for (const child of block.children) {
      stack.push(child);
    }
  }
  return false;
}

function hasDurableId(
  document: MutableStructuralDocument,
  id: string,
): boolean {
  if (document.id === id) {
    return true;
  }
  const stack: MutableBlock[] = [document.root];
  while (stack.length > 0) {
    const block = stack.pop();
    if (block === undefined) {
      break;
    }
    if (
      block.id === id ||
      block.contents.some((content) => content.id === id)
    ) {
      return true;
    }
    for (const child of block.children) {
      stack.push(child);
    }
  }
  return false;
}

function isInsertionIndex(index: number, length: number): boolean {
  return Number.isInteger(index) && index >= 0 && index <= length;
}

function sameStrings(
  left: readonly string[],
  right: readonly string[],
): boolean {
  return (
    left.length === right.length &&
    left.every((value, index) => value === right[index])
  );
}

function failure<T>(
  kind: StructuralErrorKind,
  message: string,
): StructuralResult<T> {
  return { ok: false, error: { kind, message } };
}
