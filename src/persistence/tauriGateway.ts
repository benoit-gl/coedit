import { invoke } from "@tauri-apps/api/core";
import type {
  Contribution,
  ContributionContext,
  ContributionQuery,
  Contributor,
  DocumentOperation,
  DocumentView,
  ExportResult,
} from "../domain/types";
import type { DocumentGateway } from "./gateway";

export class TauriDocumentGateway implements DocumentGateway {
  readonly mode = "desktop" as const;

  createDocument(path: string | null, title: string, contributor: Contributor): Promise<DocumentView> {
    if (!path) throw new Error("A file path is required in the desktop application.");
    return invoke("create_document", { path, title, contributor });
  }

  openDocument(path: string): Promise<DocumentView> {
    return invoke("open_document", { path });
  }

  closeDocument(): Promise<void> {
    return invoke("close_document");
  }

  getDocument(): Promise<DocumentView> {
    return invoke("get_document");
  }

  applyOperation(operation: DocumentOperation, context: ContributionContext): Promise<DocumentView> {
    return invoke("apply_operation", { operation, context });
  }

  listContributions(query: ContributionQuery = {}): Promise<Contribution[]> {
    return invoke("list_contributions", { query });
  }

  restoreRevision(revision: number, context: ContributionContext): Promise<DocumentView> {
    return invoke("restore_revision", { revision, context });
  }

  backupDocument(path: string): Promise<ExportResult> {
    return invoke("backup_document", { path });
  }

  exportDocument(format: "json" | "markdown", path: string | null): Promise<ExportResult> {
    if (!path) throw new Error("An export path is required in the desktop application.");
    return invoke("export_document", { format, path });
  }
}

