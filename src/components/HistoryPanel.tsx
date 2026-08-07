import { useMemo, useState } from "react";
import type { Contribution } from "../domain/types";

interface HistoryPanelProps {
  contributions: Contribution[];
  selectedNodeId: string | null;
  readOnly: boolean;
  onRestore: (revision: number) => void;
  onClose: () => void;
}

export function HistoryPanel({ contributions, selectedNodeId, readOnly, onRestore, onClose }: HistoryPanelProps) {
  const [search, setSearch] = useState("");
  const [nodeOnly, setNodeOnly] = useState(false);
  const filtered = useMemo(() => contributions.filter((contribution) => {
    if (nodeOnly && selectedNodeId && !contribution.affectedNodeIds.includes(selectedNodeId)) return false;
    const haystack = `${contribution.operationType} ${contribution.contributorName} ${contribution.message ?? ""}`.toLocaleLowerCase();
    return haystack.includes(search.toLocaleLowerCase());
  }), [contributions, nodeOnly, search, selectedNodeId]);

  return (
    <aside className="history-panel">
      <div className="history-header">
        <div><span className="eyebrow">Immutable ledger</span><h2>History</h2></div>
        <button type="button" onClick={onClose} aria-label="Close history">×</button>
      </div>
      <input type="search" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search contributions" />
      <label className="check-row"><input type="checkbox" checked={nodeOnly} onChange={(event) => setNodeOnly(event.target.checked)} disabled={!selectedNodeId} /> Selected idea only</label>
      <ol className="history-list">
        {filtered.map((contribution) => (
          <li key={contribution.id}>
            <div className="history-revision">r{contribution.revision}</div>
            <div className="history-copy">
              <strong>{contribution.message || contribution.operationType}</strong>
              <span>{contribution.contributorName} · {new Date(contribution.timestamp).toLocaleString()}</span>
              <code title={contribution.resultingHash}>{contribution.resultingHash.slice(0, 12)}</code>
            </div>
            <button type="button" disabled={readOnly || contribution.revision === contributions[0]?.revision} onClick={() => onRestore(contribution.revision)}>Restore</button>
          </li>
        ))}
      </ol>
      {filtered.length === 0 && <p className="empty-message">No matching contributions.</p>}
    </aside>
  );
}

