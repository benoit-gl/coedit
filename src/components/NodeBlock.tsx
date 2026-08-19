import { useId, useMemo, type CSSProperties } from "react";
import type { VisibleNodeBlock } from "../domain/visibleNodes";
import { sanitizeRichText } from "../editor/sanitizeRichText";

export interface NodeBlockProps {
  block: Readonly<VisibleNodeBlock>;
  readOnly: true;
}

interface NodeBodyPreviewProps {
  bodyHtml: string;
  title: string;
}

export function NodeBodyPreview({ bodyHtml, title }: NodeBodyPreviewProps) {
  const sanitizedBodyHtml = useMemo(() => sanitizeRichText(bodyHtml), [bodyHtml]);
  const accessibleTitle = title || "Untitled idea";

  if (!sanitizedBodyHtml) {
    return <p className="node-body-preview-empty">No text for {accessibleTitle}.</p>;
  }

  return (
    <div
      className="node-body-preview"
      aria-label={`Read-only text for ${accessibleTitle}`}
      // Preview HTML crosses the same rendering sanitizer as live and historical fallback content.
      dangerouslySetInnerHTML={{ __html: sanitizedBodyHtml }}
    />
  );
}

/**
 * Read-only WP-7 block boundary. Editable ownership and structural controls are
 * intentionally absent until the WP-4/WP-7 integration gate is complete.
 */
export function NodeBlock({ block }: NodeBlockProps) {
  const { node } = block;
  const headingId = useId();
  const displayTitle = node.title || "Untitled idea";
  const indentation = { "--node-depth": block.depth } as CSSProperties;

  return (
    <li
      className="node-block"
      data-node-id={node.id}
      data-depth={block.depth}
      data-read-only="true"
      style={indentation}
    >
      <article aria-labelledby={headingId}>
        <header className="node-block-header">
          <span className="node-block-disclosure" aria-hidden="true">
            {block.hasActiveChildren ? (block.expanded ? "▾" : "▸") : ""}
          </span>
          <div className="node-block-heading">
            <span className="sr-only">
              Level {block.depth + 1}. {block.hasActiveChildren ? (block.expanded ? "Expanded." : "Collapsed.") : ""}
            </span>
            <h2 id={headingId}>{displayTitle}</h2>
            {node.tags.length > 0 && (
              <ul className="node-block-tags" aria-label={`Tags for ${displayTitle}`}>
                {node.tags.map((tag) => <li key={tag}>{tag}</li>)}
              </ul>
            )}
          </div>
        </header>
        <NodeBodyPreview bodyHtml={node.bodyHtml} title={node.title} />
      </article>
    </li>
  );
}
