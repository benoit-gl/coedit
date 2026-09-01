import { readFile, writeFile } from "node:fs/promises";

async function replaceIn(path, replacements) {
  let text = await readFile(path, "utf8");
  for (const [from, to] of replacements) {
    if (!text.includes(from)) {
      if (!text.includes(to)) {
        throw new Error(`Expected text not found in ${path}: ${from.slice(0, 100)}`);
      }
      continue;
    }
    text = text.replace(from, to);
  }
  await writeFile(path, text, "utf8");
}

await replaceIn("src/carrier/markCodec.ts", [
  [
    `interface EncodedMarkDescriptor {\n  readonly kind: FormattingMarkKind;\n  readonly boundaryPolicy: MarkBoundaryPolicy;\n  readonly target?: LinkTarget;\n}\n\nexport function encodeMarkKey(mark: FormattingMark): string {`,
    `/** Carrier-private semantic descriptor encoded in one independent mark key. */\nexport interface EncodedMarkDescriptor {\n  /** Intrinsic formatting kind. */\n  readonly kind: FormattingMarkKind;\n  /** Canonical insertion-boundary behavior. */\n  readonly boundaryPolicy: MarkBoundaryPolicy;\n  /** Link target when the descriptor represents a link. */\n  readonly target?: LinkTarget;\n}\n\n/** Encodes one semantic formatting descriptor as an independent carrier key. */\nexport function encodeMarkKey(mark: FormattingMark): string {`,
  ],
  [
    `export function decodeMarkKey(key: string): EncodedMarkDescriptor | undefined {`,
    `/** Decodes and validates one private semantic formatting carrier key. */\nexport function decodeMarkKey(key: string): EncodedMarkDescriptor | undefined {`,
  ],
  [
    `export function markAppliesAtInsertion(`,
    `/** Tests whether an insertion at one offset inherits a formatting mark. */\nexport function markAppliesAtInsertion(`,
  ],
]);

await replaceIn("src/carrier/position.ts", [
  [
    `export type PositionResult =\n  | { readonly ok: true; readonly value: readonly CarrierPosition[] }\n  | { readonly ok: false; readonly error: PositionError };`,
    `export type PositionResult =\n  | {\n      /** Indicates successful position allocation. */\n      readonly ok: true;\n      /** Fresh ordered carrier positions. */\n      readonly value: readonly CarrierPosition[];\n    }\n  | {\n      /** Indicates an expected allocation rejection. */\n      readonly ok: false;\n      /** Stable allocation failure detail. */\n      readonly error: PositionError;\n    };`,
  ],
]);

await replaceIn("src/domain/content.ts", [
  [
    `export type ContentValidationResult =\n  | { readonly ok: true; readonly value: InlineContentValue }\n  | { readonly ok: false; readonly error: ContentValidationError };`,
    `export type ContentValidationResult =\n  | {\n      /** Indicates valid canonical content. */\n      readonly ok: true;\n      /** Validated detached content value. */\n      readonly value: InlineContentValue;\n    }\n  | {\n      /** Indicates an expected validation rejection. */\n      readonly ok: false;\n      /** Stable validation failure detail. */\n      readonly error: ContentValidationError;\n    };`,
  ],
]);

await replaceIn("src/domain/contentOperations.ts", [
  [
    `export interface ContentEditError {\n  readonly kind: ContentEditErrorKind;\n  readonly message: string;\n}`,
    `export interface ContentEditError {\n  /** Stable machine-readable edit failure kind. */\n  readonly kind: ContentEditErrorKind;\n  /** Human-readable edit failure detail. */\n  readonly message: string;\n}`,
  ],
  [
    `export type ContentEditResult =\n  | { readonly ok: true; readonly value: InlineContentValue }\n  | { readonly ok: false; readonly error: ContentEditError };`,
    `export type ContentEditResult =\n  | {\n      /** Indicates a successful detached edit. */\n      readonly ok: true;\n      /** New validated content value. */\n      readonly value: InlineContentValue;\n    }\n  | {\n      /** Indicates an expected edit rejection. */\n      readonly ok: false;\n      /** Stable edit failure detail. */\n      readonly error: ContentEditError;\n    };`,
  ],
]);

await replaceIn("src/domain/ids.ts", [
  [
    `export type DocumentId = string & { readonly [documentIdBrand]: "DocumentId" };`,
    `export type DocumentId = string & {\n  /** Nominal brand for a validated DocumentId. */\n  readonly [documentIdBrand]: "DocumentId";\n};`,
  ],
  [
    `export type BlockId = string & { readonly [blockIdBrand]: "BlockId" };`,
    `export type BlockId = string & {\n  /** Nominal brand for a validated BlockId. */\n  readonly [blockIdBrand]: "BlockId";\n};`,
  ],
  [
    `export type InlineContentId = string & {\n  readonly [inlineContentIdBrand]: "InlineContentId";\n};`,
    `export type InlineContentId = string & {\n  /** Nominal brand for a validated InlineContentId. */\n  readonly [inlineContentIdBrand]: "InlineContentId";\n};`,
  ],
  [
    `export type ContributorId = string & {\n  readonly [contributorIdBrand]: "ContributorId";\n};`,
    `export type ContributorId = string & {\n  /** Nominal brand for a validated ContributorId. */\n  readonly [contributorIdBrand]: "ContributorId";\n};`,
  ],
  [
    `export type ContributionId = string & {\n  readonly [contributionIdBrand]: "ContributionId";\n};`,
    `export type ContributionId = string & {\n  /** Nominal brand for a validated ContributionId. */\n  readonly [contributionIdBrand]: "ContributionId";\n};`,
  ],
  [
    `export type OriginId = string & { readonly [originIdBrand]: "OriginId" };`,
    `export type OriginId = string & {\n  /** Nominal brand for a validated OriginId. */\n  readonly [originIdBrand]: "OriginId";\n};`,
  ],
]);

await replaceIn("src/serialization/markdownImport.ts", [
  [
    `export type MarkdownImportPlanResult =\n  | { readonly ok: true; readonly value: MarkdownImportPlan }\n  | { readonly ok: false; readonly error: MarkdownImportError };`,
    `export type MarkdownImportPlanResult =\n  | {\n      /** Indicates successful pure import planning. */\n      readonly ok: true;\n      /** Complete operation and diagnostic plan. */\n      readonly value: MarkdownImportPlan;\n    }\n  | {\n      /** Indicates an expected import-planning rejection. */\n      readonly ok: false;\n      /** Stable import failure detail. */\n      readonly error: MarkdownImportError;\n    };`,
  ],
]);
