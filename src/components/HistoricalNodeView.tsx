import { useMemo } from "react";
import type { DocumentNode } from "../domain/types";
import { sanitizeRichText } from "../editor/sanitizeRichText";

interface HistoricalNodeViewProps {
  node: DocumentNode;
}

export function HistoricalNodeView({ node }: HistoricalNodeViewProps) {
  const bodyHtml = useMemo(() => sanitizeRichText(node.bodyHtml), [node.bodyHtml]);

  return (
    <article className="node-editor historical-node-view" aria-label="Historical idea">
      <span className="eyebrow">Idea title</span>
      <h1 className="historical-node-title">{node.title}</h1>
      {node.tags.length > 0 && (
        <div className="historical-tags" aria-label="Tags">
          {node.tags.map((tag) => <span key={tag}>{tag}</span>)}
        </div>
      )}
      <div className="text-heading">
        <div><span className="eyebrow">Text</span><h2>Read-only text</h2></div>
      </div>
      {bodyHtml ? (
        <div
          className="historical-body editor-surface"
          // Historical HTML crosses the same rendering sanitizer as live fallback content.
          dangerouslySetInnerHTML={{ __html: bodyHtml }}
        />
      ) : (
        <p className="historical-empty-body">No text at this revision.</p>
      )}
    </article>
  );
}
