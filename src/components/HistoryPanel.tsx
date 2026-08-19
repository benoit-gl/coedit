import { useEffect, useState } from "react";
import type { HistoryQuery } from "../application/useDocumentController";
import type { Contribution } from "../domain/types";

interface HistoryPanelProps {
  contributions: Contribution[];
  query: HistoryQuery;
  selectedNodeId: string | null;
  currentRevision: number;
  viewedRevision: number | null;
  loadingRevision: number | null;
  revisionViewingAvailable: boolean;
  viewDisabled: boolean;
  restoreDisabled: boolean;
  hasMore: boolean;
  loading: boolean;
  stale: boolean;
  loadError: string | null;
  onQueryChange: (query: HistoryQuery) => void;
  onLoadOlder: () => void;
  onView: (revision: number) => void;
  onRestore: (revision: number) => void;
  onClose: () => void;
}

export function HistoryPanel({
  contributions,
  query,
  selectedNodeId,
  currentRevision,
  viewedRevision,
  loadingRevision,
  revisionViewingAvailable,
  viewDisabled,
  restoreDisabled,
  hasMore,
  loading,
  stale,
  loadError,
  onQueryChange,
  onLoadOlder,
  onView,
  onRestore,
  onClose,
}: HistoryPanelProps) {
  const [search, setSearch] = useState(query.search ?? "");
  const [nodeOnly, setNodeOnly] = useState(query.nodeId !== undefined);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      onQueryChange({
        ...(search ? { search } : {}),
        ...(nodeOnly && selectedNodeId ? { nodeId: selectedNodeId } : {}),
      });
    }, 250);
    return () => window.clearTimeout(timer);
  }, [nodeOnly, onQueryChange, search, selectedNodeId]);

  return (
    <aside className="history-panel">
      <div className="history-header">
        <div><span className="eyebrow">Immutable ledger</span><h2>History</h2></div>
        <button type="button" onClick={onClose} aria-label="Close history">×</button>
      </div>
      <input type="search" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search contributions" />
      <label className="check-row"><input type="checkbox" checked={nodeOnly} onChange={(event) => setNodeOnly(event.target.checked)} disabled={!selectedNodeId} /> Selected idea only</label>
      <p className="history-result-count">{contributions.length}{hasMore ? "+" : ""} matching contributions loaded</p>
      {stale && contributions.length > 0 && <div className="history-stale">Refreshing previously loaded results…</div>}
      {loadError && <div className="history-load-error">History could not be refreshed: {loadError}</div>}
      <ol className="history-list" aria-busy={loading}>
        {contributions.map((contribution) => {
          const current = contribution.revision === currentRevision;
          const viewed = contribution.revision === viewedRevision;
          const revisionLoading = contribution.revision === loadingRevision;
          return (
            <li
              key={contribution.id}
              className={viewed ? "viewing" : ""}
              aria-current={viewed ? "true" : undefined}
            >
              <div className="history-revision">r{contribution.revision}</div>
              <div className="history-copy">
                <strong>{contribution.message || contribution.operationType}</strong>
                <span>{contribution.contributorName} · {new Date(contribution.timestamp).toLocaleString()}</span>
                <code title={contribution.resultingHash}>{contribution.resultingHash.slice(0, 12)}</code>
              </div>
              <div className="history-row-action">
                {revisionViewingAvailable ? (
                  viewed ? <span className="history-state">Viewing</span>
                    : current ? <span className="history-state">Current</span>
                      : (
                        <button
                          type="button"
                          disabled={viewDisabled || revisionLoading}
                          onClick={() => onView(contribution.revision)}
                        >
                          {revisionLoading ? "Loading…" : "View"}
                        </button>
                      )
                ) : (
                  <button
                    type="button"
                    disabled={restoreDisabled || current}
                    onClick={() => onRestore(contribution.revision)}
                  >
                    Restore
                  </button>
                )}
              </div>
            </li>
          );
        })}
      </ol>
      {contributions.length === 0 && !loading && !loadError && <p className="empty-message">No matching contributions.</p>}
      {loading && <p className="history-loading">Loading history…</p>}
      {hasMore && <button className="history-load-more" type="button" disabled={loading} onClick={onLoadOlder}>Load older contributions</button>}
    </aside>
  );
}
