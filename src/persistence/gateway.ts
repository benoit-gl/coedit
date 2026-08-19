import type {
  Contribution,
  ContributionPage,
  ContributionContext,
  ContributionQuery,
  Contributor,
  DocumentOperation,
  DocumentState,
  DocumentView,
  ExportFormat,
  ExportResult,
} from "../domain/types";

export const DEFAULT_CONTRIBUTION_PAGE_SIZE = 100;
export const MAX_CONTRIBUTION_PAGE_SIZE = 500;

export function contributionPageSize(limit?: number): number {
  if (limit === undefined) return DEFAULT_CONTRIBUTION_PAGE_SIZE;
  if (!Number.isSafeInteger(limit) || limit < 1) {
    throw new Error("Contribution page size must be a positive safe integer.");
  }
  return Math.min(limit, MAX_CONTRIBUTION_PAGE_SIZE);
}

export function contributionCursor(beforeRevision?: number): number | undefined {
  if (beforeRevision === undefined) return undefined;
  if (!Number.isSafeInteger(beforeRevision) || beforeRevision < 0) {
    throw new Error("The contribution cursor must be a non-negative safe integer.");
  }
  return beforeRevision;
}

export function contributionPage(items: Contribution[], limit: number): ContributionPage {
  const hasMore = items.length > limit;
  const pageItems = items.slice(0, limit);
  return {
    items: pageItems,
    nextBeforeRevision: hasMore ? pageItems[pageItems.length - 1]?.revision ?? null : null,
    hasMore,
  };
}

export interface MaterializedRevision {
  revision: number;
  state: DocumentState;
  stateHash: string;
  hashVerification: "verified";
}

export interface DocumentRevisionQueries {
  materializeRevision(revision: number): Promise<MaterializedRevision>;
}

export type RevisionQueryCapability =
  | { readonly kind: "available"; readonly queries: DocumentRevisionQueries }
  | { readonly kind: "unavailable"; readonly reason: "host-deferred" };

export const HOST_DEFERRED_REVISION_QUERIES: RevisionQueryCapability = Object.freeze({
  kind: "unavailable",
  reason: "host-deferred",
});

export interface ContributionGroupQuery {
  groupId: string;
  beforeRevision?: number;
  limit?: number;
}

export interface ContributionGroupQueries {
  listContributionGroup(query: ContributionGroupQuery): Promise<ContributionPage>;
}

export type ContributionGroupQueryCapability =
  | { readonly kind: "available"; readonly queries: ContributionGroupQueries }
  | { readonly kind: "unavailable"; readonly reason: "host-deferred" };

export const HOST_DEFERRED_CONTRIBUTION_GROUP_QUERIES: ContributionGroupQueryCapability = Object.freeze({
  kind: "unavailable",
  reason: "host-deferred",
});

export class RevisionNotFoundError extends Error {
  readonly revision: number;

  constructor(revision: number) {
    super(`Revision ${revision} is unavailable.`);
    this.name = "RevisionNotFoundError";
    this.revision = revision;
  }
}

export class RevisionIntegrityError extends Error {
  readonly revision: number;

  constructor(revision: number, reason: string) {
    super(`Revision ${revision} failed integrity validation: ${reason}`);
    this.name = "RevisionIntegrityError";
    this.revision = revision;
  }
}

export interface DocumentSession {
  closeDocument(): Promise<void>;
  applyOperation(operation: DocumentOperation, context: ContributionContext): Promise<DocumentView>;
  restoreRevision(revision: number, context: ContributionContext): Promise<DocumentView>;
}

export interface ContributionHistory {
  listContributions(query?: ContributionQuery): Promise<ContributionPage>;
  readonly contributionGroupQueryCapability: ContributionGroupQueryCapability;
}

export interface VolatileDocumentStorage {
  readonly kind: "volatile";
  createDocument(title: string, contributor: Contributor): Promise<DocumentView>;
  exportDocument(format: ExportFormat): Promise<ExportResult>;
}

export interface NativeDocumentStorage {
  readonly kind: "native-file";
  createDocument(path: string, title: string, contributor: Contributor): Promise<DocumentView>;
  openDocument(path: string): Promise<DocumentView>;
  backupDocument(path: string): Promise<ExportResult>;
  exportDocument(format: ExportFormat, path: string): Promise<ExportResult>;
}

export type DocumentStorage = VolatileDocumentStorage | NativeDocumentStorage;

export interface DocumentGateway extends DocumentSession, ContributionHistory {
  readonly storage: DocumentStorage;
}
