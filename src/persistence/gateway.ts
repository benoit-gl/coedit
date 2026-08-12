import type {
  Contribution,
  ContributionPage,
  ContributionContext,
  ContributionQuery,
  Contributor,
  DocumentOperation,
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

export interface DocumentSession {
  closeDocument(): Promise<void>;
  applyOperation(operation: DocumentOperation, context: ContributionContext): Promise<DocumentView>;
  restoreRevision(revision: number, context: ContributionContext): Promise<DocumentView>;
}

export interface ContributionHistory {
  listContributions(query?: ContributionQuery): Promise<ContributionPage>;
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
