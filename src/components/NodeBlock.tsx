import {
  useCallback,
  useId,
  useMemo,
  useState,
  type CSSProperties,
  type DragEvent,
  type KeyboardEvent,
} from "react";
import type { BodyCheckpointCommitRequest } from "../application/bodyCheckpoint";
import type { DraftParticipant, RegisterDraftParticipant } from "../application/draftTransition";
import type { VisibleNodeBlock } from "../domain/visibleNodes";
import type { BodyCheckpointPolicy } from "../editor/bodyCheckpointPolicy";
import { RichTextEditor } from "../editor/RichTextEditor";
import { sanitizeRichText } from "../editor/sanitizeRichText";
import { NodeMetadataFields, type NodeMetadataChanges } from "./NodeMetadataFields";

export type NodeBlockCommand =
  | "focusPrevious"
  | "focusNext"
  | "focusParent"
  | "focusFirstChild"
  | "toggle"
  | "createSibling"
  | "createChild"
  | "moveUp"
  | "moveDown"
  | "indent"
  | "outdent"
  | "delete";

interface NodeBlockBaseProps {
  block: Readonly<VisibleNodeBlock>;
  contextNodeId?: string | null;
  onSetContext?: (nodeId: string) => void;
  onCommand?: (nodeId: string, command: NodeBlockCommand) => void;
}

interface ReadOnlyNodeBlockProps extends NodeBlockBaseProps {
  readOnly: true;
}

interface EditableNodeBlockProps extends NodeBlockBaseProps {
  readOnly: false;
  disabled: boolean;
  editorOwner: boolean;
  editorGeneration: number;
  siblingPosition: number;
  siblingCount: number;
  canIndent: boolean;
  canOutdent: boolean;
  tagSuggestions: string[];
  onCommitMetadata: (nodeId: string, changes: NodeMetadataChanges) => Promise<void>;
  onRequestEditorOwner: (nodeId: string) => Promise<boolean>;
  onCommitBody: (checkpoint: BodyCheckpointCommitRequest) => Promise<void>;
  registerDraftParticipant: RegisterDraftParticipant;
  checkpointPolicy?: BodyCheckpointPolicy;
  onDragStart: (nodeId: string, event: DragEvent<HTMLElement>) => void;
  onDropInto: (nodeId: string, event: DragEvent<HTMLElement>) => void;
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
      dangerouslySetInnerHTML={{ __html: sanitizedBodyHtml }}
    />
  );
}

function isComposing(event: KeyboardEvent): boolean {
  return event.nativeEvent.isComposing;
}

/** One projected document block; only the designated live owner mounts editor machinery. */
export function NodeBlock(props: NodeBlockProps) {
  const { block } = props;
  const { node } = block;
  const headingId = useId();
  const displayTitle = node.title || "Untitled idea";
  const indentation = { "--node-depth": block.depth } as CSSProperties;
  const [activatingEditor, setActivatingEditor] = useState(false);
  const editable = props.readOnly ? null : props;
  const registerDraftParticipant = editable?.registerDraftParticipant ?? null;

  const registerBodyParticipant = useCallback((participant: DraftParticipant) => {
    if (!registerDraftParticipant) return () => undefined;
    return registerDraftParticipant(`canvas-body:${node.id}`, participant);
  }, [node.id, registerDraftParticipant]);

  const activateEditor = useCallback(async () => {
    if (!editable || activatingEditor || editable.disabled) return;
    setActivatingEditor(true);
    try {
      await editable.onRequestEditorOwner(node.id);
    } catch {
      // The controller exposes transition failures and keeps the old owner.
    } finally {
      setActivatingEditor(false);
    }
  }, [activatingEditor, editable, node.id]);

  const command = (next: NodeBlockCommand) => props.onCommand?.(node.id, next);
  const handleKeyDown = (event: KeyboardEvent<HTMLButtonElement>) => {
    if (isComposing(event)) return;
    let next: NodeBlockCommand | null = null;
    if (event.altKey && event.shiftKey && event.key === "ArrowUp") next = "moveUp";
    else if (event.altKey && event.shiftKey && event.key === "ArrowDown") next = "moveDown";
    else if (event.altKey && event.shiftKey && event.key === "ArrowRight") next = "indent";
    else if (event.altKey && event.shiftKey && event.key === "ArrowLeft") next = "outdent";
    else if (event.key === "ArrowUp") next = "focusPrevious";
    else if (event.key === "ArrowDown") next = "focusNext";
    else if (event.key === "Delete" && editable) next = "delete";
    if (!next) return;
    event.preventDefault();
    command(next);
  };

  const disclosureKeyDown = (event: KeyboardEvent<HTMLButtonElement>) => {
    if (isComposing(event)) return;
    let next: NodeBlockCommand | null = null;
    if (event.key === "ArrowLeft") next = block.expanded ? "toggle" : "focusParent";
    if (event.key === "ArrowRight") next = block.expanded ? "focusFirstChild" : "toggle";
    if (event.key === "ArrowUp") next = "focusPrevious";
    if (event.key === "ArrowDown") next = "focusNext";
    if (!next) return;
    event.preventDefault();
    command(next);
  };

  const blockKeyDown = (event: KeyboardEvent<HTMLElement>) => {
    if (!editable || editable.disabled || isComposing(event)) return;
    const mod = event.ctrlKey || event.metaKey;
    if (mod && event.key === "Enter") {
      event.preventDefault();
      command(event.shiftKey ? "createChild" : "createSibling");
      return;
    }
    if (event.key !== "Escape") return;
    const target = event.target as HTMLElement;
    if (!target.closest("input, button, [contenteditable=true]") || target.dataset.nodeControl === "handle") return;
    event.preventDefault();
    target.closest(".node-block")?.querySelector<HTMLElement>('[data-node-control="handle"]')?.focus();
  };

  return (
    <li
      className={`node-block ${props.contextNodeId === node.id ? "context-node" : ""}`}
      data-node-id={node.id}
      data-depth={block.depth}
      data-read-only={String(props.readOnly)}
      data-editor-owner={String(editable?.editorOwner === true)}
      style={indentation}
      onFocusCapture={() => props.onSetContext?.(node.id)}
      onDragOver={(event) => { if (editable && !editable.disabled) event.preventDefault(); }}
      onDrop={(event) => { if (editable && !editable.disabled) editable.onDropInto(node.id, event); }}
    >
      <article aria-labelledby={headingId} onKeyDown={blockKeyDown}>
        <header className="node-block-header">
          <div className="node-block-leading">
            <button
              type="button"
              className="node-block-disclosure"
              data-node-control="disclosure"
              aria-label={`${block.expanded ? "Collapse" : "Expand"} ${displayTitle}`}
              aria-expanded={block.hasActiveChildren ? block.expanded : undefined}
              disabled={!block.hasActiveChildren}
              onClick={() => command("toggle")}
              onKeyDown={disclosureKeyDown}
            >
              {block.hasActiveChildren ? (block.expanded ? "▾" : "▸") : "·"}
            </button>
            {editable && (
              <button
                type="button"
                className="node-block-handle"
                data-node-control="handle"
                aria-label={`${displayTitle}, level ${block.depth + 1}, position ${editable.siblingPosition} of ${editable.siblingCount}. Structural actions`}
                title="Block actions. Arrow keys navigate; Alt+Shift+arrows move; Delete removes."
                disabled={editable.disabled}
                draggable={!editable.disabled}
                onDragStart={(event) => editable.onDragStart(node.id, event)}
                onKeyDown={handleKeyDown}
              >
                ⋮⋮
              </button>
            )}
          </div>
          <div className="node-block-heading">
            <span className="sr-only">
              Level {block.depth + 1}. {block.hasActiveChildren ? (block.expanded ? "Expanded." : "Collapsed.") : ""}
            </span>
            {editable ? (
              <NodeMetadataFields
                node={node}
                titleId={headingId}
                tagSuggestions={editable.tagSuggestions}
                disabled={editable.disabled}
                onCommit={(changes) => editable.onCommitMetadata(node.id, changes)}
                onCreateSibling={async () => { command("createSibling"); }}
                onContext={() => props.onSetContext?.(node.id)}
                registerDraftParticipant={editable.registerDraftParticipant}
              />
            ) : (
              <>
                <h2 id={headingId}>{displayTitle}</h2>
                {node.tags.length > 0 && (
                  <ul className="node-block-tags" aria-label={`Tags for ${displayTitle}`}>
                    {node.tags.map((tag) => <li key={tag}>{tag}</li>)}
                  </ul>
                )}
              </>
            )}
          </div>
        </header>
        {editable?.editorOwner ? (
          <RichTextEditor
            key={`${node.id}:${editable.editorGeneration}`}
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
                disabled={editable.disabled || activatingEditor}
                onClick={() => void activateEditor()}
              >
                {activatingEditor ? "Switching editor…" : "Edit body"}
              </button>
            )}
          </div>
        )}
        {editable && (
          <div className="node-block-actions" aria-label={`Actions for ${displayTitle}`}>
            <button type="button" disabled={editable.disabled} onClick={() => command("createSibling")}>Add below</button>
            <button type="button" disabled={editable.disabled} onClick={() => command("createChild")}>Add child</button>
            <button type="button" disabled={editable.disabled || editable.siblingPosition === 1} onClick={() => command("moveUp")}>Move up</button>
            <button type="button" disabled={editable.disabled || editable.siblingPosition === editable.siblingCount} onClick={() => command("moveDown")}>Move down</button>
            <button type="button" disabled={editable.disabled || !editable.canIndent} onClick={() => command("indent")}>Indent</button>
            <button type="button" disabled={editable.disabled || !editable.canOutdent} onClick={() => command("outdent")}>Outdent</button>
            <button type="button" disabled={editable.disabled} onClick={() => command("delete")}>Delete</button>
          </div>
        )}
      </article>
    </li>
  );
}
