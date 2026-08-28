import {
  parseBlockId,
  parseDocumentId,
  parseInlineContentId,
} from "../domain/index.js";
import type { BlockId, DocumentId, InlineContentId } from "../domain/index.js";

/** Allocates durable IDs before trusted code invokes pure domain behavior. */
export interface DurableIdAllocator {
  /** Allocates one document identity. */
  createDocumentId(): DocumentId;
  /** Allocates one Block identity. */
  createBlockId(): BlockId;
  /** Allocates one InlineContent identity. */
  createInlineContentId(): InlineContentId;
}

/**
 * Creates the production durable-ID allocator backed by Web Crypto.
 *
 * @remarks
 * The generated UUID text contains no Coedit type discriminator. The selected
 * allocator method only supplies the TypeScript brand at the trusted boundary.
 */
export function createWebCryptoDurableIdAllocator(): DurableIdAllocator {
  return {
    createDocumentId: () => parseDocumentId(globalThis.crypto.randomUUID()),
    createBlockId: () => parseBlockId(globalThis.crypto.randomUUID()),
    createInlineContentId: () =>
      parseInlineContentId(globalThis.crypto.randomUUID()),
  };
}
