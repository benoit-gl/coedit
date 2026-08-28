const UUID_V4_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u;

declare const documentIdBrand: unique symbol;
declare const blockIdBrand: unique symbol;
declare const inlineContentIdBrand: unique symbol;

/** Canonical durable identity for one Coedit document. */
export type DocumentId = string & { readonly [documentIdBrand]: "DocumentId" };

/** Canonical durable identity for one Block. */
export type BlockId = string & { readonly [blockIdBrand]: "BlockId" };

/** Canonical durable identity for one InlineContent. */
export type InlineContentId = string & {
  readonly [inlineContentIdBrand]: "InlineContentId";
};

/**
 * Tests whether text is a canonical lowercase UUID-v4 value.
 *
 * @remarks
 * The UUID text does not encode a Coedit entity type. Durable entity UUID text
 * belongs to one global identity namespace even though TypeScript uses branded
 * types to prevent accidental API misuse.
 */
export function isCanonicalUuidV4(value: string): boolean {
  return UUID_V4_PATTERN.test(value);
}

/** Validates and brands a document identity supplied by trusted code. */
export function parseDocumentId(value: string): DocumentId {
  assertCanonicalUuidV4(value);
  return value as DocumentId;
}

/** Validates and brands a Block identity supplied by trusted code. */
export function parseBlockId(value: string): BlockId {
  assertCanonicalUuidV4(value);
  return value as BlockId;
}

/** Validates and brands an InlineContent identity supplied by trusted code. */
export function parseInlineContentId(value: string): InlineContentId {
  assertCanonicalUuidV4(value);
  return value as InlineContentId;
}

function assertCanonicalUuidV4(value: string): void {
  if (!isCanonicalUuidV4(value)) {
    throw new TypeError("Durable IDs must use canonical lowercase UUID-v4 text.");
  }
}
