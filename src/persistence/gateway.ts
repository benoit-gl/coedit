import type {
  Contribution,
  ContributionContext,
  ContributionQuery,
  Contributor,
  DocumentOperation,
  DocumentView,
  ExportResult,
} from "../domain/types";

export interface DocumentGateway {
  readonly mode: "desktop" | "browser-preview";
  createDocument(path: string | null, title: string, contributor: Contributor): Promise<DocumentView>;
  openDocument(path: string): Promise<DocumentView>;
  closeDocument(): Promise<void>;
  getDocument(): Promise<DocumentView>;
  applyOperation(operation: DocumentOperation, context: ContributionContext): Promise<DocumentView>;
  listContributions(query?: ContributionQuery): Promise<Contribution[]>;
  restoreRevision(revision: number, context: ContributionContext): Promise<DocumentView>;
  backupDocument(path: string): Promise<ExportResult>;
  exportDocument(format: "json" | "markdown", path: string | null): Promise<ExportResult>;
}

