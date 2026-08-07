import { affectedNodeIds, applyOperation } from "../domain/tree";
import { hashDocument } from "../domain/hash";
import { newId } from "../domain/ids";
import type {
  Contribution,
  ContributionContext,
  ContributionQuery,
  Contributor,
  DocumentOperation,
  DocumentState,
  DocumentView,
  ExportResult,
} from "../domain/types";
import type { DocumentGateway } from "./gateway";

function clone<T>(value: T): T {
  return structuredClone(value);
}

function htmlToMarkdown(html: string): string {
  const document = new DOMParser().parseFromString(html, "text/html");
  document.querySelectorAll("script,style,iframe,object,embed").forEach((element) => element.remove());
  return (document.body.textContent ?? "").trim();
}

function markdownFor(state: DocumentState): string {
  const children = (parentId: string | null) =>
    state.nodes
      .filter((node) => node.parentId === parentId && node.deletedAt === null)
      .sort((left, right) => left.position - right.position);
  const lines: string[] = [`# ${state.document.title}`, ""];
  const visit = (parentId: string | null, depth: number) => {
    for (const node of children(parentId)) {
      lines.push(`${"#".repeat(Math.min(depth + 2, 6))} ${node.title}`, "");
      if (node.summary) lines.push(`_${node.summary}_`, "");
      const content = htmlToMarkdown(node.contentHtml);
      if (content) lines.push(content, "");
      visit(node.id, depth + 1);
    }
  };
  visit(null, 0);
  return lines.join("\n").trimEnd() + "\n";
}

export class MemoryDocumentGateway implements DocumentGateway {
  readonly mode = "browser-preview" as const;
  private current: DocumentView | null = null;
  private contributions: Contribution[] = [];
  private revisions = new Map<number, DocumentState>();

  async createDocument(_path: string | null, title: string, contributor: Contributor): Promise<DocumentView> {
    const now = new Date().toISOString();
    const state: DocumentView = {
      path: null,
      readOnly: false,
      recoveryWarning: null,
      document: { id: newId(), title: title.trim() || "Untitled document", formatVersion: 1, revision: 0, createdAt: now, updatedAt: now },
      contributors: [contributor],
      sessions: [],
      nodes: [],
    };
    const hash = await hashDocument(state);
    this.current = state;
    this.contributions = [{
      id: newId(), revision: 0, contributorId: contributor.id, contributorName: contributor.displayName,
      contributorKind: contributor.kind, sessionId: null, groupId: null, timestamp: now,
      operationType: "createDocument", affectedNodeIds: [], payload: { title: state.document.title },
      baseRevision: -1, resultingHash: hash, message: "Created document",
    }];
    this.revisions = new Map([[0, clone(state)]]);
    return clone(state);
  }

  openDocument(_path: string): Promise<DocumentView> {
    return Promise.reject(new Error("Opening SQLite files is available in the desktop build."));
  }

  async closeDocument(): Promise<void> {
    this.current = null;
    this.contributions = [];
    this.revisions.clear();
  }

  async getDocument(): Promise<DocumentView> {
    if (!this.current) throw new Error("No document is open.");
    return clone(this.current);
  }

  async applyOperation(operation: DocumentOperation, context: ContributionContext): Promise<DocumentView> {
    if (!this.current) throw new Error("No document is open.");
    if (this.current.readOnly) throw new Error("This document is read-only.");
    const baseRevision = this.current.document.revision;
    const now = new Date().toISOString();
    const updated = applyOperation(this.current, operation, now) as DocumentView;
    updated.document.revision = baseRevision + 1;
    const contributor = updated.contributors.find((item) => item.id === context.contributorId);
    if (!contributor) throw new Error("The contributor is not registered in this document.");
    const hash = await hashDocument(updated);
    this.contributions.push({
      id: newId(), revision: updated.document.revision, contributorId: contributor.id,
      contributorName: contributor.displayName, contributorKind: contributor.kind,
      sessionId: context.sessionId, groupId: context.groupId, timestamp: now,
      operationType: operation.type, affectedNodeIds: affectedNodeIds(operation), payload: operation,
      baseRevision, resultingHash: hash, message: context.message,
    });
    this.current = updated;
    this.revisions.set(updated.document.revision, clone(updated));
    return clone(updated);
  }

  async listContributions(query: ContributionQuery = {}): Promise<Contribution[]> {
    let result = [...this.contributions].reverse();
    if (query.nodeId) result = result.filter((item) => item.affectedNodeIds.includes(query.nodeId!));
    if (query.contributorId) result = result.filter((item) => item.contributorId === query.contributorId);
    if (query.beforeRevision !== undefined) result = result.filter((item) => item.revision < query.beforeRevision!);
    if (query.search) {
      const term = query.search.toLocaleLowerCase();
      result = result.filter((item) => `${item.message ?? ""} ${item.operationType} ${item.contributorName}`.toLocaleLowerCase().includes(term));
    }
    return clone(result.slice(0, query.limit ?? 200));
  }

  async restoreRevision(revision: number, context: ContributionContext): Promise<DocumentView> {
    if (!this.current) throw new Error("No document is open.");
    const target = this.revisions.get(revision);
    if (!target) throw new Error(`Revision ${revision} is unavailable.`);
    const currentRevision = this.current.document.revision;
    const contributor = this.current.contributors.find((item) => item.id === context.contributorId);
    if (!contributor) throw new Error("The contributor is not registered in this document.");
    const restored = clone(target) as DocumentView;
    restored.path = this.current.path;
    restored.readOnly = false;
    restored.recoveryWarning = null;
    restored.document.revision = currentRevision + 1;
    restored.document.updatedAt = new Date().toISOString();
    restored.contributors = clone(this.current.contributors);
    const hash = await hashDocument(restored);
    this.contributions.push({
      id: newId(), revision: restored.document.revision, contributorId: contributor.id,
      contributorName: contributor.displayName, contributorKind: contributor.kind,
      sessionId: context.sessionId, groupId: context.groupId, timestamp: restored.document.updatedAt,
      operationType: "restoreRevision", affectedNodeIds: restored.nodes.map((node) => node.id),
      payload: { restoredRevision: revision, state: restored }, baseRevision: currentRevision,
      resultingHash: hash, message: context.message ?? `Restored revision ${revision}`,
    });
    this.current = restored;
    this.revisions.set(restored.document.revision, clone(restored));
    return clone(restored);
  }

  async backupDocument(_path: string): Promise<ExportResult> {
    return this.download("coedit-backup.json", JSON.stringify(await this.getDocument(), null, 2), "application/json");
  }

  async exportDocument(format: "json" | "markdown", _path: string | null): Promise<ExportResult> {
    const state = await this.getDocument();
    return format === "json"
      ? this.download(`${state.document.title}.json`, JSON.stringify(state, null, 2), "application/json")
      : this.download(`${state.document.title}.md`, markdownFor(state), "text/markdown");
  }

  private async download(name: string, content: string, type: string): Promise<ExportResult> {
    const blob = new Blob([content], { type });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = name;
    anchor.click();
    URL.revokeObjectURL(url);
    return { path: name, bytesWritten: blob.size };
  }
}

