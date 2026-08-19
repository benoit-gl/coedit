import { useCallback, useId, useMemo, useState, type CSSProperties } from "react";
import type { BodyCheckpointCommitRequest } from "../application/bodyCheckpoint";
import type { DraftParticipant, RegisterDraftParticipant } from "../application/draftTransition";
import type { VisibleNodeBlock } from "../domain/visibleNodes";
import type { BodyCheckpointPolicy } from "../editor/bodyCheckpointPolicy";
import { RichTextEditor } from "../editor/RichTextEditor";
import { sanitizeRichText } from "../editor/sanitizeRichText";

interface NodeBlockBaseProps {
  block: Readonly<VisibleNodeBlock>;
}

interface ReadOnlyNodeBlockProps extends NodeBlockBaseProps {
  readOnly: true;
}

interface EditableNodeBlockProps extends NodeBlockBaseProps {
  readOnly: false;
  editorOwner: boolean;
  onRequestEditorOwner: (nodeId: string) => Promise<boolean>;
  onCommitBody: (checkpoint: BodyCheckpointCommitRequest) => Promise<void>;
  registerDraftParticipant: RegisterDraftParticipant;
  checkpointPolicy?: BodyCheckpointPolicy;
}

export type NodeBlockProps = ReadOnlyNodeBlockProps | EditableNodeBlockProps;

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

/** One projected block; only the designated live owner mounts editor machinery. */
export function NodeBlock(props: NodeBlockProps) {
  const { block } = props;
  const { node } = block;
  const headingId = useId();
  const displayTitle = node.title || "Untitled idea";
  const indentation = { "--node-depth": block.depth } as CSSProperties;
  const [activatingEditor, setActivatingEditor] = useState(false);
  const editable = props.readOnly ? null : props;
  const registerDraftParticipant = editable?.registerDraftParticipant ?? null;
  const requestEditorOwner = editable?.onRequestEditorOwner ?? null;

  const registerBodyParticipant = useCallback((participant: DraftParticipant) => {
    if (!registerDraftParticipant) return () => undefined;
    return registerDraftParticipant(`canvas-body:${node.id}`, participant);
  }, [node.id, registerDraftParticipant]);

  const activateEditor = useCallback(async () => {
    if (!requestEditorOwner || activatingEditor) return;
    setActivatingEditor(true);
    try {
      await requestEditorOwner(node.id);
    } catch {
      // The owner remains unchanged. Controller implementations report their
      // own transition error; keep this event handler from leaking rejection.
    } finally {
      setActivatingEditor(false);
    }
  }, [activatingEditor, node.id, requestEditorOwner]);

  return (
    <li
      className="node-block"
      data-node-id={node.id}
      data-depth={block.depth}
      data-read-only={String(props.readOnly)}
      data-editor-owner={String(editable?.editorOwner === true)}
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
        {editable?.editorOwner ? (
          <RichTextEditor
            node={node}
            readOnly={false}
            onCommit={editable.onCommitBody}
            registerDraftParticipant={registerBodyParticipant}
            checkpointPolicy={editable.checkpointPolicy}
            autoFocus
          />
        ) : (
          <div className="node-block-inactive-body">
            <NodeBodyPreview bodyHtml={node.bodyHtml} title={node.title} />
            {editable && (
              <button
                type="button"
                className="node-block-edit-body"
                aria-label={`Edit body for ${displayTitle}`}
                disabled={activatingEditor}
                onClick={() => void activateEditor()}
              >
                {activatingEditor ? "Switching editor…" : "Edit body"}
              </button>
            )}
          </div>
        )}
      </article>
    </li>
  );
}
