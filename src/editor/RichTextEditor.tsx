import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import type { Editor } from "@tiptap/core";
import { EditorContent, useEditor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Collaboration from "@tiptap/extension-collaboration";
import * as Y from "yjs";
import type { BodyCheckpointCommitRequest } from "../application/bodyCheckpoint";
import type { DraftParticipant } from "../application/draftTransition";
import type { DocumentNode } from "../domain/types";
import {
  BodyEditBatchCoordinator,
  type BodyChangeResult,
} from "./BodyEditBatchCoordinator";
import {
  bodyTransactionExtension,
  dispatchObservedBodyTransaction,
  observeBodyEditorTransaction,
  type BodyBeforeInputContext,
} from "./bodyEditorTransaction";
import {
  DEFAULT_BODY_CHECKPOINT_POLICY,
  type BodyCheckpointPolicy,
} from "./bodyCheckpointPolicy";
import { sanitizeRichText } from "./sanitizeRichText";
import { bytesToBase64, createYDoc } from "./yjsEncoding";

export interface RichTextEditorProps {
  node: DocumentNode;
  readOnly: boolean;
  onCommit: (checkpoint: BodyCheckpointCommitRequest) => Promise<void>;
  registerDraftParticipant: (participant: DraftParticipant) => () => void;
  checkpointPolicy?: BodyCheckpointPolicy;
  autoFocus?: boolean;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error ?? "Body checkpoint failed.");
}

export function RichTextEditor({
  node,
  readOnly,
  onCommit,
  registerDraftParticipant,
  checkpointPolicy = DEFAULT_BODY_CHECKPOINT_POLICY,
  autoFocus = false,
}: RichTextEditorProps) {
  // The parent key defines the authoritative editor generation. A Y.Doc is
  // intentionally never reused across a restore of older state.
  const [document] = useState(() => createYDoc(node.yjsState));
  const editorRef = useRef<Editor | null>(null);
  const pendingUpdates = useRef<Uint8Array[]>([]);
  const commitRef = useRef(onCommit);
  const readOnlyRef = useRef(readOnly);
  const hydratingRef = useRef(false);
  const beforeInputRef = useRef<BodyBeforeInputContext | null>(null);
  const mountedRef = useRef(false);
  const [capacityBlocked, setCapacityBlocked] = useState(false);

  const [coordinator] = useState(() => new BodyEditBatchCoordinator({
    nodeId: node.id,
    policy: checkpointPolicy,
    captureCheckpoint: () => {
      if (pendingUpdates.current.length === 0) return null;
      const activeEditor = editorRef.current;
      if (!activeEditor) throw new Error("The text editor is unavailable while changes are pending.");
      const updates = pendingUpdates.current;
      try {
        const mergedUpdate = Y.mergeUpdates(updates);
        const content = {
          bodyHtml: sanitizeRichText(activeEditor.getHTML()),
          yjsUpdate: bytesToBase64(mergedUpdate),
          yjsState: bytesToBase64(Y.encodeStateAsUpdate(document)),
        };
        pendingUpdates.current = [];
        return content;
      } catch (error) {
        pendingUpdates.current = updates;
        throw error;
      }
    },
    commitCheckpoint: (checkpoint) => commitRef.current(checkpoint),
  }));

  const waitForCheckpointCapacity = useCallback(() => {
    setCapacityBlocked(true);
    void coordinator.retry().then(
      () => { if (mountedRef.current) setCapacityBlocked(false); },
      () => undefined,
    );
  }, [coordinator]);

  const [transactionExtension] = useState(() => bodyTransactionExtension(
    (transaction, next, editor) => {
      const beforeInput = beforeInputRef.current;
      beforeInputRef.current = null;
      const observation = observeBodyEditorTransaction(transaction, editor.state, {
        beforeInput,
        persistenceLoad: hydratingRef.current,
        isComposing: editor.view.composing,
      });
      const result = dispatchObservedBodyTransaction(
        coordinator,
        observation,
        () => next(transaction),
      );
      if (!result.accepted && result.reason === "capacity") {
        waitForCheckpointCapacity();
      }
    },
  ));

  const editor = useEditor({
    editable: !readOnly,
    extensions: [
      StarterKit.configure({ undoRedo: false }),
      Collaboration.configure({ document, field: "content" }),
      transactionExtension,
    ],
    editorProps: {
      attributes: { class: "editor-surface", "aria-label": "Node body" },
      transformPastedHTML: sanitizeRichText,
      handleDOMEvents: {
        beforeinput: (_view, rawEvent) => {
          const event = rawEvent as InputEvent;
          const captured = {
            inputType: event.inputType || null,
            data: event.data,
            isComposing: event.isComposing,
          };
          beforeInputRef.current = captured;
          queueMicrotask(() => {
            if (beforeInputRef.current === captured) beforeInputRef.current = null;
          });
          return false;
        },
        compositionstart: () => {
          let result: BodyChangeResult;
          try {
            result = coordinator.beginComposition();
          } catch {
            editorRef.current?.setEditable(false);
            return true;
          }
          if (result.accepted) return false;
          if (result.reason === "capacity") waitForCheckpointCapacity();
          editorRef.current?.setEditable(false);
          return true;
        },
        compositionend: () => {
          try {
            coordinator.endComposition();
          } catch {
            // The coordinator snapshot retains capture failure for retry.
          }
          return false;
        },
      },
    },
    onBlur: () => {
      try {
        coordinator.focusChanged();
      } catch {
        // The coordinator snapshot retains capture failure for retry.
      }
    },
  }, [document, transactionExtension, waitForCheckpointCapacity]);

  useLayoutEffect(() => { commitRef.current = onCommit; }, [onCommit]);
  useLayoutEffect(() => { readOnlyRef.current = readOnly; }, [readOnly]);
  useLayoutEffect(() => {
    editorRef.current = editor;
    return () => {
      if (editorRef.current === editor) editorRef.current = null;
    };
  }, [editor]);
  useLayoutEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      queueMicrotask(() => {
        if (!mountedRef.current) coordinator.dispose();
      });
    };
  }, [coordinator]);

  const subscribe = useCallback(
    (listener: () => void) => coordinator.subscribe(listener),
    [coordinator],
  );
  const getSnapshot = useCallback(() => coordinator.getSnapshot(), [coordinator]);
  const checkpoint = useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
  const editorBlocked = readOnly || capacityBlocked || checkpoint.bodyChangesBlocked;

  useEffect(() => { editor?.setEditable(!editorBlocked); }, [editor, editorBlocked]);

  useEffect(() => {
    if (!editor || node.yjsState || !node.bodyHtml) return;
    hydratingRef.current = true;
    try {
      editor.commands.setContent(sanitizeRichText(node.bodyHtml));
    } finally {
      hydratingRef.current = false;
    }
  }, [editor, node.bodyHtml, node.yjsState]);

  useEffect(() => {
    if (!editor || !autoFocus || editorBlocked) return;
    editor.commands.focus("end");
  }, [autoFocus, editor, editorBlocked]);

  const participant = useMemo<DraftParticipant>(() => ({
    freeze: () => {
      editorRef.current?.setEditable(false);
      coordinator.freeze();
    },
    flush: () => coordinator.flush(),
    unfreeze: () => {
      coordinator.unfreeze();
      editorRef.current?.setEditable(!readOnlyRef.current && !coordinator.getSnapshot().bodyChangesBlocked);
    },
  }), [coordinator]);

  useLayoutEffect(
    () => registerDraftParticipant(participant),
    [participant, registerDraftParticipant],
  );

  useEffect(() => {
    const handleUpdate = (update: Uint8Array, origin: unknown) => {
      if (origin === "persistence-load" || hydratingRef.current) return;
      pendingUpdates.current.push(update);
    };
    document.on("update", handleUpdate);
    return () => {
      document.off("update", handleUpdate);
      // Controlled navigation flushes before unmount. Do not destroy this
      // Y.Doc from replayable effect cleanup under React StrictMode.
    };
  }, [document]);

  const retryCheckpoint = useCallback(() => {
    setCapacityBlocked(false);
    void coordinator.retry().catch(() => undefined);
  }, [coordinator]);

  if (!editor) return <div className="editor-loading">Preparing editor…</div>;

  return (
    <div className="rich-editor" data-checkpoint-state={checkpoint.persistenceState}>
      <div className="editor-toolbar" role="toolbar" aria-label="Text formatting">
        <button type="button" className={editor.isActive("bold") ? "active" : ""} onClick={() => editor.chain().focus().toggleBold().run()} disabled={editorBlocked}>Bold</button>
        <button type="button" className={editor.isActive("italic") ? "active" : ""} onClick={() => editor.chain().focus().toggleItalic().run()} disabled={editorBlocked}>Italic</button>
        <button type="button" className={editor.isActive("heading", { level: 2 }) ? "active" : ""} onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()} disabled={editorBlocked}>Heading</button>
        <button type="button" onClick={() => editor.chain().focus().toggleBulletList().run()} disabled={editorBlocked}>Bullets</button>
        <button type="button" onClick={() => editor.chain().focus().toggleOrderedList().run()} disabled={editorBlocked}>Numbered</button>
        <button type="button" onClick={() => editor.chain().focus().toggleBlockquote().run()} disabled={editorBlocked}>Quote</button>
        <button type="button" onClick={() => editor.chain().focus().undo().run()} disabled={editorBlocked || !editor.can().undo()}>Undo</button>
        <button type="button" onClick={() => editor.chain().focus().redo().run()} disabled={editorBlocked || !editor.can().redo()}>Redo</button>
      </div>
      <EditorContent editor={editor} />
      {checkpoint.failure !== null ? (
        <div className="body-checkpoint-error" role="alert">
          <span>{errorMessage(checkpoint.failure)}</span>
          <button type="button" onClick={retryCheckpoint}>Retry save</button>
        </div>
      ) : (checkpoint.persistenceState === "persisting" || capacityBlocked) ? (
        <div className="body-checkpoint-status" role="status">
          {capacityBlocked ? "Waiting for checkpoint capacity…" : "Saving body checkpoint…"}
        </div>
      ) : null}
    </div>
  );
}
