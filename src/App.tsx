import { useEffect, useMemo, useRef, useState } from "react";
import { newId } from "./domain/ids";
import type { Contribution, ContributionContext, Contributor, DocumentOperation, DocumentView } from "./domain/types";
import type { DocumentFileDialogs } from "./persistence/fileDialogs";
import type { DocumentGateway } from "./persistence/gateway";
import { Outline } from "./components/Outline";
import { NodeEditor } from "./components/NodeEditor";
import { HistoryPanel } from "./components/HistoryPanel";

const PROFILE_KEY = "coedit-local-contributor";

function loadContributor(): Contributor {
  try {
    const stored = localStorage.getItem(PROFILE_KEY);
    if (stored) return JSON.parse(stored) as Contributor;
  } catch {
    // A corrupt non-secret preference should not prevent the application opening.
  }
  return { id: newId(), displayName: "Local author", kind: "human", createdAt: new Date().toISOString() };
}

interface AppProps {
  documentGateway: DocumentGateway;
  fileDialogs?: DocumentFileDialogs;
}

export function App({ documentGateway, fileDialogs }: AppProps) {
  const [view, setView] = useState<DocumentView | null>(null);
  const [contributions, setContributions] = useState<Contribution[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState("Offline and ready");
  const [newTitle, setNewTitle] = useState("Untitled document");
  const [profile, setProfile] = useState(loadContributor);
  const sessionId = useRef(newId());

  const contributor = useMemo(() => view?.contributors.find((item) => item.id === profile.id) ?? view?.contributors[0] ?? profile, [profile, view]);
  const selectedNode = view?.nodes.find((node) => node.id === selectedId && node.deletedAt === null) ?? null;

  useEffect(() => {
    try {
      localStorage.setItem(PROFILE_KEY, JSON.stringify(profile));
    } catch {
      // Some browsers restrict local storage for file:// documents. The editor
      // remains usable because contributor state also lives in React memory.
    }
  }, [profile]);

  useEffect(() => {
    if (view && (!selectedId || !view.nodes.some((node) => node.id === selectedId && node.deletedAt === null))) {
      setSelectedId(view.nodes.find((node) => node.deletedAt === null)?.id ?? null);
    }
  }, [selectedId, view]);

  const context = (message: string, groupId: string | null = null): ContributionContext => ({
    contributorId: contributor.id,
    sessionId: sessionId.current,
    groupId,
    message,
  });

  const refreshHistory = async () => setContributions(await documentGateway.listContributions({ limit: 500 }));

  const run = async <T,>(action: () => Promise<T>, success?: string): Promise<T | undefined> => {
    setBusy(true);
    setError(null);
    try {
      const result = await action();
      if (success) setStatus(success);
      return result;
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught));
      return undefined;
    } finally {
      setBusy(false);
    }
  };

  const createDocument = async () => {
    let path: string | null = null;
    if (documentGateway.mode === "desktop") {
      if (!fileDialogs) throw new Error("Desktop file dialogs are not configured.");
      path = await fileDialogs.chooseDocumentToCreate(newTitle);
      if (!path) return;
    }
    const created = await run(() => documentGateway.createDocument(path, newTitle, profile), "Document created");
    if (created) { setView(created); await refreshHistory(); }
  };

  const openDocument = async () => {
    if (documentGateway.mode !== "desktop" || !fileDialogs) return;
    const path = await fileDialogs.chooseDocumentToOpen();
    if (!path) return;
    const opened = await run(() => documentGateway.openDocument(path), "Document opened");
    if (opened) { setView(opened); await refreshHistory(); }
  };

  const apply = async (operation: DocumentOperation, message: string, groupId: string | null = null) => {
    const updated = await run(() => documentGateway.applyOperation(operation, context(message, groupId)), "All changes saved locally");
    if (updated) { setView(updated); await refreshHistory(); }
  };

  const addNode = (parentId: string | null) => {
    const id = newId();
    void apply({ type: "createNode", node: { id, parentId, kind: "idea", title: "New idea" } }, parentId ? "Added sub-idea" : "Added root idea").then(() => setSelectedId(id));
  };

  const deleteNode = (nodeId: string) => {
    const node = view?.nodes.find((item) => item.id === nodeId);
    if (node && window.confirm(`Move “${node.title}” and its sub-ideas to the document history?`)) {
      void apply({ type: "softDeleteNode", nodeId }, `Deleted ${node.title}`);
    }
  };

  const restore = async (revision: number) => {
    if (!window.confirm(`Restore the document to revision ${revision}? The current state remains in history.`)) return;
    const restored = await run(() => documentGateway.restoreRevision(revision, context(`Restored revision ${revision}`)), `Restored revision ${revision}`);
    if (restored) { setView(restored); await refreshHistory(); }
  };

  const exportFile = async (format: "json" | "markdown") => {
    if (!view) return;
    let path: string | null = null;
    if (documentGateway.mode === "desktop") {
      if (!fileDialogs) throw new Error("Desktop file dialogs are not configured.");
      path = await fileDialogs.chooseExportPath(format, view.document.title);
      if (!path) return;
    }
    await run(() => documentGateway.exportDocument(format, path), `Exported ${format}`);
  };

  const backup = async () => {
    if (!view || documentGateway.mode !== "desktop" || !fileDialogs) return;
    const path = await fileDialogs.chooseBackupPath(view.document.title);
    if (path) await run(() => documentGateway.backupDocument(path), "Backup created");
  };

  const close = async () => {
    await run(() => documentGateway.closeDocument());
    setView(null); setContributions([]); setSelectedId(null); setHistoryOpen(false);
  };

  if (!view) {
    return (
      <main className="welcome-shell">
        <section className="welcome-card">
          <div className="brand-mark">C</div>
          <span className="eyebrow">Local-first writing</span>
          <h1>Ideas become structure.<br />Structure becomes text.</h1>
          <p>Create a private hierarchical document whose edits remain attributable and replayable. Nothing leaves this computer.</p>
          {documentGateway.mode === "standalone" && <div className="standalone-notice">Standalone HTML mode: documents are kept in memory and disappear when this page closes. JSON and Markdown exports remain available.</div>}
          <label><span>Your contributor name</span><input value={profile.displayName} onChange={(event) => setProfile({ ...profile, displayName: event.target.value || "Local author" })} /></label>
          <label><span>Document title</span><input value={newTitle} onChange={(event) => setNewTitle(event.target.value)} onKeyDown={(event) => event.key === "Enter" && void createDocument()} /></label>
          <div className="welcome-actions">
            <button className="primary" type="button" disabled={busy} onClick={() => void createDocument()}>Create document</button>
            {documentGateway.mode === "desktop" && <button type="button" disabled={busy} onClick={() => void openDocument()}>Open .coedit file</button>}
          </div>
          {error && <div className="error-banner">{error}</div>}
        </section>
      </main>
    );
  }

  return (
    <div className="app-shell">
      <header className="topbar">
        <div className="brand"><span className="brand-mark small">C</span><span>Coedit</span></div>
        <input className="document-title" aria-label="Document title" defaultValue={view.document.title} key={view.document.title} disabled={view.readOnly} onBlur={(event) => event.target.value !== view.document.title && void apply({ type: "renameDocument", title: event.target.value }, "Renamed document")} />
        <div className="top-actions">
          <span className="status"><i className={busy ? "saving" : ""} />{busy ? "Saving…" : status}</span>
          <button type="button" onClick={() => setHistoryOpen((open) => !open)}>History <span className="count">{contributions.length}</span></button>
          <details className="menu"><summary>Export</summary><div><button type="button" onClick={() => void exportFile("markdown")}>Markdown</button><button type="button" onClick={() => void exportFile("json")}>JSON recovery file</button>{documentGateway.mode === "desktop" && <button type="button" onClick={() => void backup()}>SQLite backup</button>}</div></details>
          <button type="button" onClick={() => void close()}>Close</button>
        </div>
      </header>
      {view.readOnly && <div className="warning-banner">This document uses a newer format and is open read-only.</div>}
      {view.recoveryWarning && <div className="warning-banner">{view.recoveryWarning}</div>}
      {error && <div className="error-banner global">{error}<button onClick={() => setError(null)}>×</button></div>}
      <div className={`workspace ${historyOpen ? "with-history" : ""}`}>
        <Outline
          nodes={view.nodes}
          selectedId={selectedId}
          readOnly={view.readOnly || busy}
          onSelect={setSelectedId}
          onAdd={addNode}
          onMove={(nodeId, parentId, index) => void apply({ type: "moveNode", nodeId, parentId, index }, "Moved idea")}
          onDelete={deleteNode}
        />
        <main className="editor-pane">
          {selectedNode ? (
            <NodeEditor
              key={selectedNode.id}
              node={selectedNode}
              readOnly={view.readOnly}
              onMetadataChange={(changes) => apply({ type: "updateNode", nodeId: selectedNode.id, changes }, "Refined idea")}
              onContentChange={(contentHtml, yjsUpdate, yjsState) => apply({ type: "updateContent", nodeId: selectedNode.id, contentHtml, yjsUpdate, yjsState }, "Writing contribution", newId())}
            />
          ) : <div className="empty-editor"><h2>Start with an idea</h2><p>Add a root idea in the outline, then refine it here.</p><button className="primary" onClick={() => addNode(null)}>Create the first idea</button></div>}
        </main>
        {historyOpen && <HistoryPanel contributions={contributions} selectedNodeId={selectedId} readOnly={view.readOnly || busy} onRestore={(revision) => void restore(revision)} onClose={() => setHistoryOpen(false)} />}
      </div>
    </div>
  );
}
