import { affectedNodeIds, applyOperation } from "../domain/tree";
import { DOCUMENT_HASH_ALGORITHM, hashDocument, toDocumentState } from "../domain/hash";
import { newId } from "../domain/ids";
import { cloneJson } from "../domain/json";
import { sanitizeRichText } from "../editor/sanitizeRichText";
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
  RecoveryExport,
} from "../domain/types";
import {
  contributionCursor,
  contributionPage,
  contributionPageSize,
  type DocumentGateway,
  type VolatileDocumentStorage,
} from "./gateway";
import { safeFilenameStem } from "./fileDialogs";

function clone<T>(value: T): T {
  return cloneJson(value);
}

function portableOperation(operation: DocumentOperation): DocumentOperation {
  const detached = clone(operation);
  if (detached.type === "createNode" && detached.node.contentHtml !== undefined) {
    detached.node.contentHtml = sanitizeRichText(detached.node.contentHtml);
  } else if (detached.type === "updateContent") {
    detached.contentHtml = sanitizeRichText(detached.contentHtml);
  }
  return detached;
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

export class MemoryDocumentGateway implements DocumentGateway, VolatileDocumentStorage {
  readonly kind = "volatile" as const;
  readonly storage: VolatileDocumentStorage = this;
  private current: DocumentView | null = null;
  private contributions: Contribution[] = [];
  private revisions = new Map<number, DocumentState>();

  async createDocument(title: string, contributor: Contributor): Promise<DocumentView> {
    const now = new Date().toISOString();
    const detachedContributor = clone(contributor);
    const state: DocumentView = {
      path: null,
      readOnly: false,
      recoveryWarning: null,
      document: { id: newId(), title: title.trim() || "Untitled document", formatVersion: 1, revision: 0, createdAt: now, updatedAt: now },
      contributors: [detachedContributor],
      sessions: [],
      nodes: [],
    };
    const hash = await hashDocument(state);
    this.current = state;
    this.contributions = [{
      id: newId(), revision: 0, contributorId: detachedContributor.id, contributorName: detachedContributor.displayName,
      contributorKind: detachedContributor.kind, sessionId: null, groupId: null, timestamp: now,
      operationType: "createDocument", affectedNodeIds: [], payload: { title: state.document.title },
      baseRevision: -1, resultingHash: hash, message: "Created document",
    }];
    this.revisions = new Map([[0, clone(state)]]);
    return clone(state);
  }

  async closeDocument(): Promise<void> {
    this.current = null;
    this.contributions = [];
    this.revisions.clear();
  }

  private requireDocument(): DocumentView {
    if (!this.current) throw new Error("No document is open.");
    return clone(this.current);
  }

  async applyOperation(operation: DocumentOperation, context: ContributionContext): Promise<DocumentView> {
    if (!this.current) throw new Error("No document is open.");
    if (this.current.readOnly) throw new Error("This document is read-only.");
    const baseRevision = this.current.document.revision;
    const now = new Date().toISOString();
    const detachedOperation = portableOperation(operation);
    const detachedContext = clone(context);
    const updated = applyOperation(this.current, detachedOperation, now) as DocumentView;
    updated.document.revision = baseRevision + 1;
    const contributor = updated.contributors.find((item) => item.id === detachedContext.contributorId);
    if (!contributor) throw new Error("The contributor is not registered in this document.");
    const hash = await hashDocument(updated);
    this.contributions.push({
      id: newId(), revision: updated.document.revision, contributorId: contributor.id,
      contributorName: contributor.displayName, contributorKind: contributor.kind,
      sessionId: detachedContext.sessionId, groupId: detachedContext.groupId, timestamp: now,
      operationType: detachedOperation.type, affectedNodeIds: affectedNodeIds(detachedOperation), payload: clone(detachedOperation),
      baseRevision, resultingHash: hash, message: detachedContext.message,
    });
    this.current = updated;
    this.revisions.set(updated.document.revision, clone(updated));
    return clone(updated);
  }

  async listContributions(query: ContributionQuery = {}): Promise<ContributionPage> {
    let result = [...this.contributions].reverse();
    if (query.nodeId) result = result.filter((item) => item.affectedNodeIds.includes(query.nodeId!));
    if (query.contributorId) result = result.filter((item) => item.contributorId === query.contributorId);
    const beforeRevision = contributionCursor(query.beforeRevision);
    if (beforeRevision !== undefined) result = result.filter((item) => item.revision < beforeRevision);
    if (query.search) {
      const term = query.search.toLowerCase();
      result = result.filter((item) => `${item.message ?? ""} ${item.operationType} ${item.contributorName}`.toLowerCase().includes(term));
    }
    const limit = contributionPageSize(query.limit);
    return clone(contributionPage(result, limit));
  }

  async restoreRevision(revision: number, context: ContributionContext): Promise<DocumentView> {
    if (!this.current) throw new Error("No document is open.");
    const target = this.revisions.get(revision);
    if (!target) throw new Error(`Revision ${revision} is unavailable.`);
    const currentRevision = this.current.document.revision;
    const detachedContext = clone(context);
    const contributor = this.current.contributors.find((item) => item.id === detachedContext.contributorId);
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
      sessionId: detachedContext.sessionId, groupId: detachedContext.groupId, timestamp: restored.document.updatedAt,
      operationType: "restoreRevision", affectedNodeIds: restored.nodes.map((node) => node.id),
      payload: { restoredRevision: revision }, baseRevision: currentRevision,
      resultingHash: hash, message: detachedContext.message ?? `Restored revision ${revision}`,
    });
    this.current = restored;
    this.revisions.set(restored.document.revision, clone(restored));
    return clone(restored);
  }

  async exportDocument(format: ExportFormat): Promise<ExportResult> {
    const state = this.requireDocument();
    const filename = safeFilenameStem(state.document.title);
    if (format === "json") {
      const recovery: RecoveryExport = {
        format: "coedit-recovery",
        exportVersion: 2,
        exportedAt: new Date().toISOString(),
        hashAlgorithm: DOCUMENT_HASH_ALGORITHM,
        stateHash: await hashDocument(state),
        state: toDocumentState(state),
        history: { order: "revision-descending", complete: true },
        contributions: clone([...this.contributions].reverse()),
      };
      return this.download(`${filename}.json`, JSON.stringify(recovery, null, 2), "application/json");
    }
    return format === "markdown"
      ? this.download(`${filename}.md`, markdownFor(state), "text/markdown")
      : this.unsupportedExport(format);
  }

  private unsupportedExport(format: never): never {
    throw new Error(`Unsupported export format: ${String(format)}`);
  }

  private async download(name: string, content: string, type: string): Promise<ExportResult> {
    const blob = new Blob([content], { type });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = name;
    anchor.hidden = true;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 0);
    return { path: name, bytesWritten: blob.size };
  }
}
