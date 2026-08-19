import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import {
  useDocumentController,
  type DraftParticipant,
  type RegisterDraftParticipant,
} from "./application/useDocumentController";
import { loadLocalContributor, LOCAL_CONTRIBUTOR_KEY } from "./application/localContributor";
import { HistoryPanel } from "./components/HistoryPanel";
import { HistoricalNodeView } from "./components/HistoricalNodeView";
import { HistoricalWorkspaceBanner } from "./components/HistoricalWorkspaceBanner";
import { NodeEditor } from "./components/NodeEditor";
import { Outline } from "./components/Outline";
import { newId } from "./domain/ids";
import { collectActiveTags } from "./domain/tags";
import type { DocumentFileDialogs } from "./persistence/fileDialogs";
import type { DocumentGateway, RevisionQueryCapability } from "./persistence/gateway";

interface DocumentTitleInputProps {
  title: string;
  readOnly: boolean;
  onCommit: (title: string) => Promise<void>;
  registerDraftParticipant: RegisterDraftParticipant;
}

function DocumentTitleInput({ title, readOnly, onCommit, registerDraftParticipant }: DocumentTitleInputProps) {
  const [draft, setDraft] = useState(title);
  const [frozen, setFrozen] = useState(false);
  const draftRef = useRef(title);
  const persistedRef = useRef(title);
  const dirtyRef = useRef(false);
  const drain = useRef<Promise<void> | null>(null);
  const commitRef = useRef(onCommit);
  const mounted = useRef(false);

  useLayoutEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; };
  }, []);
  useLayoutEffect(() => { commitRef.current = onCommit; }, [onCommit]);
  useLayoutEffect(() => {
    persistedRef.current = title;
    if (!dirtyRef.current) {
      draftRef.current = title;
      setDraft(title);
    }
  }, [title]);

  const flush = useCallback((): Promise<void> => {
    if (drain.current) return drain.current;
    const run = async () => {
      while (dirtyRef.current) {
        const captured = draftRef.current;
        if (captured !== persistedRef.current) {
          await commitRef.current(captured);
          const accepted = captured.trim() || "Untitled document";
          persistedRef.current = accepted;
          if (draftRef.current === captured && accepted !== captured) {
            draftRef.current = accepted;
            if (mounted.current) setDraft(accepted);
          }
        }
        if (draftRef.current === captured) dirtyRef.current = false;
      }
    };
    const pending = run();
    drain.current = pending;
    pending.then(
      () => { if (drain.current === pending) drain.current = null; },
      () => { if (drain.current === pending) drain.current = null; },
    );
    return pending;
  }, []);

  const participant = useMemo<DraftParticipant>(() => ({
    freeze: () => { if (mounted.current) setFrozen(true); },
    flush,
    unfreeze: () => { if (mounted.current) setFrozen(false); },
  }), [flush]);
  useLayoutEffect(
    () => registerDraftParticipant("document-title", participant),
    [participant, registerDraftParticipant],
  );

  return (
    <input
      className="document-title"
      aria-label="Document title"
      value={draft}
      disabled={readOnly || frozen}
      onChange={(event) => {
        draftRef.current = event.target.value;
        dirtyRef.current = true;
        setDraft(event.target.value);
      }}
      onBlur={() => { void flush().catch(() => undefined); }}
    />
  );
}

interface AppProps {
  documentGateway: DocumentGateway;
  revisionQueryCapability: RevisionQueryCapability;
  fileDialogs?: DocumentFileDialogs;
}

export function App({ documentGateway, revisionQueryCapability, fileDialogs }: AppProps) {
  const [newTitle, setNewTitle] = useState("Untitled document");
  const [profile, setProfile] = useState(loadLocalContributor);
  const controller = useDocumentController({
    documentGateway,
    revisionQueryCapability,
    fileDialogs,
    profile,
  });
  const { view, selectedNode } = controller;
  const historicalProjection = controller.workspaceProjection?.kind === "historical"
    ? controller.workspaceProjection
    : null;
  const viewedRevision = historicalProjection?.displayed.materialized.revision ?? null;
  const loadingRevision = controller.revisionRequest.kind === "loading"
    ? controller.revisionRequest.requestedRevision
    : null;
  const tagSuggestions = useMemo(() => collectActiveTags(view?.nodes ?? []), [view?.nodes]);

  useEffect(() => {
    try {
      localStorage.setItem(LOCAL_CONTRIBUTOR_KEY, JSON.stringify(profile));
    } catch {
      // Some file:// browsers restrict local storage. The in-memory profile remains usable.
    }
  }, [profile]);

  const addNode = async (parentId: string | null) => {
    const id = newId();
    const added = await controller.applyOperation(
      { type: "createNode", node: { id, parentId, title: "New idea" } },
      parentId ? "Added sub-idea" : "Added root idea",
    );
    if (added) await controller.selectNode(id);
  };

  const deleteNode = (nodeId: string) => {
    const node = view?.nodes.find((item) => item.id === nodeId);
    if (node && window.confirm(`Move “${node.title}” and its sub-ideas to the document history?`)) {
      void controller.applyOperation({ type: "softDeleteNode", nodeId }, `Deleted ${node.title}`);
    }
  };

  const restoreRevision = (revision: number) => {
    if (window.confirm(
      `Restore revision ${revision} as a new current revision? A new revision will be appended and later history will be retained.`,
    )) {
      void controller.restoreRevision(revision);
    }
  };

  if (!view) {
    return (
      <main className="welcome-shell">
        <section className="welcome-card">
          <div className="brand-mark">C</div>
          <span className="eyebrow">Local-first writing</span>
          <h1>Ideas become structure.<br />Structure becomes text.</h1>
          <p>Create a private hierarchical document whose edits remain attributable and replayable. Nothing leaves this computer.</p>
          {!controller.nativeFilesAvailable && <div className="standalone-notice">Standalone HTML mode: documents are kept in memory and disappear when this page closes. JSON and Markdown exports remain available.</div>}
          <label><span>Your contributor name</span><input value={profile.displayName} onChange={(event) => setProfile({ ...profile, displayName: event.target.value || "Local author" })} /></label>
          <label><span>Document title</span><input value={newTitle} onChange={(event) => setNewTitle(event.target.value)} onKeyDown={(event) => event.key === "Enter" && void controller.createDocument(newTitle)} /></label>
          <div className="welcome-actions">
            <button className="primary" type="button" disabled={controller.transitioning} onClick={() => void controller.createDocument(newTitle)}>Create document</button>
            {controller.nativeFilesAvailable && <button type="button" disabled={controller.transitioning} onClick={() => void controller.openDocument()}>Open .coedit file</button>}
          </div>
          {controller.error && <div className="error-banner">{controller.error}</div>}
        </section>
      </main>
    );
  }

  const controlsLocked = view.readOnly
    || controller.transitioning
    || controller.revisionRequest.kind === "loading";
  const revisionLoading = controller.revisionRequest.kind === "loading";
  return (
    <div
      className={`app-shell ${historicalProjection ? "historical-mode" : ""}`}
      aria-busy={controller.transitioning}
    >
      <header className="topbar">
        <div className="brand"><span className="brand-mark small">C</span><span>Coedit</span></div>
        {historicalProjection ? (
          <div className="document-title historical-document-title" aria-label="Document title">
            {view.document.title}
          </div>
        ) : (
          <DocumentTitleInput
            title={view.document.title}
            readOnly={controlsLocked}
            onCommit={controller.commitDocumentTitle}
            registerDraftParticipant={controller.registerDraftParticipant}
          />
        )}
        <div className="top-actions">
          <span className="status">
            <i className={controller.busy ? "saving" : ""} />
            {controller.transitioning
              ? "Finishing changes…"
              : loadingRevision !== null
                ? `Loading revision ${loadingRevision}…`
                : controller.busy ? "Saving…" : controller.status}
          </span>
          <button type="button" disabled={controller.transitioning} onClick={() => controller.setHistoryOpen(!controller.historyOpen)}>
            History{controller.historyOpen && <span className="count">{controller.contributions.length}{controller.historyHasMore ? "+" : ""} loaded</span>}
          </button>
          <details className="menu">
            <summary
              aria-disabled={controlsLocked}
              onClick={(event) => { if (controlsLocked) event.preventDefault(); }}
            >
              Export
            </summary>
            <div>
              <button type="button" disabled={controlsLocked} onClick={() => void controller.exportDocument("markdown")}>Markdown</button>
              <button type="button" disabled={controlsLocked} onClick={() => void controller.exportDocument("json")}>JSON recovery file</button>
              {controller.nativeFilesAvailable && <button type="button" disabled={controlsLocked} onClick={() => void controller.backupDocument()}>SQLite backup</button>}
            </div>
          </details>
          <button type="button" disabled={controller.transitioning} onClick={() => void controller.closeDocument()}>Close</button>
        </div>
      </header>
      {historicalProjection && viewedRevision !== null && controller.currentRevision !== null && (
        <HistoricalWorkspaceBanner
          viewedRevision={viewedRevision}
          currentRevision={controller.currentRevision}
          backDisabled={controller.transitioning}
          restoreDisabled={controller.transitioning || revisionLoading}
          onBack={() => { controller.backToCurrent(); }}
          onRestore={() => restoreRevision(viewedRevision)}
        />
      )}
      {view.readOnly && !historicalProjection && <div className="warning-banner">This document uses a newer format and is open read-only.</div>}
      {view.recoveryWarning && <div className="warning-banner">{view.recoveryWarning}</div>}
      {controller.error && <div className="error-banner global">{controller.error}<button onClick={controller.clearError}>×</button></div>}
      <div className={`workspace ${controller.historyOpen ? "with-history" : ""}`}>
        <Outline
          nodes={view.nodes}
          selectedId={controller.selectedId}
          readOnly={controlsLocked}
          onSelect={(nodeId) => void controller.selectNode(nodeId)}
          onAdd={(parentId) => void addNode(parentId)}
          onMove={(nodeId, parentId, index) => void controller.applyOperation({ type: "moveNode", nodeId, parentId, index }, "Moved idea")}
          onDelete={deleteNode}
        />
        <main className="editor-pane">
          {historicalProjection && selectedNode ? (
            <HistoricalNodeView node={selectedNode} />
          ) : selectedNode ? (
            <NodeEditor
              key={`${selectedNode.id}:${controller.editorGeneration}`}
              node={selectedNode}
              tagSuggestions={tagSuggestions}
              readOnly={controlsLocked}
              registerDraftParticipant={controller.registerDraftParticipant}
              onMetadataChange={(changes) => controller.commitNodeMetadata(selectedNode.id, changes)}
              onBodyChange={controller.commitBody}
            />
          ) : historicalProjection ? (
            <div className="empty-editor historical-empty-state">
              <h2>No ideas at this revision</h2>
              <p>Select another revision or return to the current document.</p>
            </div>
          ) : (
            <div className="empty-editor">
              <h2>Start with an idea</h2>
              <p>Add a root idea in the outline, then refine it here.</p>
              <button className="primary" disabled={controlsLocked} onClick={() => void addNode(null)}>Create the first idea</button>
            </div>
          )}
        </main>
        {controller.historyOpen && (
          <HistoryPanel
            contributions={controller.contributions}
            query={controller.historyQuery}
            selectedNodeId={controller.selectedId}
            currentRevision={controller.currentRevision ?? view.document.revision}
            viewedRevision={viewedRevision}
            loadingRevision={loadingRevision}
            revisionViewingAvailable={revisionQueryCapability.kind === "available"}
            viewDisabled={controller.transitioning}
            restoreDisabled={controlsLocked}
            hasMore={controller.historyHasMore}
            loading={controller.historyLoading}
            stale={controller.historyStale}
            loadError={controller.historyError}
            onQueryChange={controller.updateHistoryQuery}
            onLoadOlder={controller.loadOlderHistory}
            onView={(revision) => { void controller.viewRevision(revision); }}
            onRestore={restoreRevision}
            onClose={() => controller.setHistoryOpen(false)}
          />
        )}
      </div>
    </div>
  );
}
