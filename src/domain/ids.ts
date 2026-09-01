const UUID_V4_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u;

declare const documentIdBrand: unique symbol;
declare const blockIdBrand: unique symbol;
declare const inlineContentIdBrand: unique symbol;
declare const contributorIdBrand: unique symbol;
declare const contributionIdBrand: unique symbol;
declare const originIdBrand: unique symbol;

/** Canonical durable identity for one Coedit document. */
export type DocumentId = string & {
  /** Nominal brand for a validated DocumentId. */
  readonly [documentIdBrand]: "DocumentId";
};
/** Canonical durable identity for one Block. */
export type BlockId = string & {
  /** Nominal brand for a validated BlockId. */
  readonly [blockIdBrand]: "BlockId";
};
/** Canonical durable identity for one InlineContent. */
export type InlineContentId = string & {
  /** Nominal brand for a validated InlineContentId. */
  readonly [inlineContentIdBrand]: "InlineContentId";
};
/** Canonical durable identity for one Contributor. */
export type ContributorId = string & {
  /** Nominal brand for a validated ContributorId. */
  readonly [contributorIdBrand]: "ContributorId";
};
/** Canonical durable identity for one Contribution. */
export type ContributionId = string & {
  /** Nominal brand for a validated ContributionId. */
  readonly [contributionIdBrand]: "ContributionId";
};
/** Canonical document-scoped identity for one Origin record. */
export type OriginId = string & {
  /** Nominal brand for a validated OriginId. */
  readonly [originIdBrand]: "OriginId";
};

/** Tests whether text is a canonical lowercase UUID-v4 value. */
export function isCanonicalUuidV4(value: string): boolean {
  return UUID_V4_PATTERN.test(value);
}

/** Validates and brands a document identity supplied by trusted code. */
export function parseDocumentId(value: string): DocumentId {
  return parseId<DocumentId>(value);
}
/** Validates and brands a Block identity supplied by trusted code. */
export function parseBlockId(value: string): BlockId {
  return parseId<BlockId>(value);
}
/** Validates and brands an InlineContent identity supplied by trusted code. */
export function parseInlineContentId(value: string): InlineContentId {
  return parseId<InlineContentId>(value);
}
/** Validates and brands a Contributor identity supplied by trusted code. */
export function parseContributorId(value: string): ContributorId {
  return parseId<ContributorId>(value);
}
/** Validates and brands a Contribution identity supplied by trusted code. */
export function parseContributionId(value: string): ContributionId {
  return parseId<ContributionId>(value);
}
/** Validates and brands an Origin identity supplied by trusted code. */
export function parseOriginId(value: string): OriginId {
  return parseId<OriginId>(value);
}

function parseId<T extends string>(value: string): T {
  if (!isCanonicalUuidV4(value)) {
    throw new TypeError(
      "Durable IDs must use canonical lowercase UUID-v4 text.",
    );
  }
  return value as T;
}
