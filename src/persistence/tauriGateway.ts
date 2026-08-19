import { invoke } from "@tauri-apps/api/core";
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
import {
  contributionPage,
  contributionPageSize,
  contributionCursor,
  HOST_DEFERRED_CONTRIBUTION_GROUP_QUERIES,
  HOST_DEFERRED_REVISION_QUERIES,
  type ContributionGroupQueryCapability,
  type DocumentGateway,
  type NativeDocumentStorage,
  type RevisionQueryCapability,
} from "./gateway";

export class TauriDocumentGateway implements DocumentGateway, NativeDocumentStorage {
  readonly kind = "native-file" as const;
  readonly storage: NativeDocumentStorage = this;
  readonly revisionQueryCapability: RevisionQueryCapability = HOST_DEFERRED_REVISION_QUERIES;
  readonly contributionGroupQueryCapability: ContributionGroupQueryCapability = HOST_DEFERRED_CONTRIBUTION_GROUP_QUERIES;

  createDocument(path: string, title: string, contributor: Contributor): Promise<DocumentView> {
    return invoke("create_document", { path, title, contributor });
  }

  openDocument(path: string): Promise<DocumentView> {
    return invoke("open_document", { path });
  }

  closeDocument(): Promise<void> {
    return invoke("close_document");
  }

  applyOperation(operation: DocumentOperation, context: ContributionContext): Promise<DocumentView> {
    return invoke("apply_operation", { operation, context });
  }

  async listContributions(query: ContributionQuery = {}): Promise<ContributionPage> {
    const limit = contributionPageSize(query.limit);
    const beforeRevision = contributionCursor(query.beforeRevision);
    const items = await invoke<Contribution[]>("list_contributions", {
      query: { ...query, beforeRevision, limit: limit + 1 },
    });
    return contributionPage(items, limit);
  }

  restoreRevision(revision: number, context: ContributionContext): Promise<DocumentView> {
    return invoke("restore_revision", { revision, context });
  }

  backupDocument(path: string): Promise<ExportResult> {
    return invoke("backup_document", { path });
  }

  exportDocument(format: ExportFormat, path: string): Promise<ExportResult> {
    return invoke("export_document", { format, path });
  }
}
