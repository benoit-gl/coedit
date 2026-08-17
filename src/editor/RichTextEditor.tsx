import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { EditorContent, useEditor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Collaboration from "@tiptap/extension-collaboration";
import * as Y from "yjs";
import type { DraftParticipant } from "../application/draftTransition";
import type { DocumentNode } from "../domain/types";
import { sanitizeRichText } from "./sanitizeRichText";
import { bytesToBase64, createYDoc } from "./yjsEncoding";

interface RichTextEditorProps {
  node: DocumentNode;
  readOnly: boolean;
  onCommit: (bodyHtml: string, yjsUpdate: string, yjsState: string) => Promise<void>;
  registerDraftParticipant: (participant: DraftParticipant) => () => void;
}

export function RichTextEditor({ node, readOnly, onCommit, registerDraftParticipant }: RichTextEditorProps) {
  // The parent key defines the authoritative editor generation. A Y.Doc is
  // intentionally never reused across a restore of older state.
  const [document] = useState(() => createYDoc(node.yjsState));
  const pendingUpdates = useRef<Uint8Array[]>([]);
  const timer = useRef<number | null>(null);
  const drain = useRef<Promise<void> | null>(null);
  const commitRef = useRef(onCommit);
  const readOnlyRef = useRef(readOnly);

  const editor = useEditor({
    editable: !readOnly,
    extensions: [
      StarterKit.configure({ undoRedo: false }),
      Collaboration.configure({ document, field: "content" }),
    ],
    editorProps: {
      attributes: { class: "editor-surface", "aria-label": "Node body" },
      transformPastedHTML: sanitizeRichText,
    },
  }, [document]);
  const editorRef = useRef<typeof editor | null>(editor);

  useLayoutEffect(() => { commitRef.current = onCommit; }, [onCommit]);
  useLayoutEffect(() => { readOnlyRef.current = readOnly; }, [readOnly]);
  useLayoutEffect(() => {
    editorRef.current = editor;
    return () => {
      if (editorRef.current === editor) editorRef.current = null;
    };
  }, [editor]);

  useEffect(() => { editor?.setEditable(!readOnly); }, [editor, readOnly]);

  useEffect(() => {
    if (!editor || node.yjsState || !node.bodyHtml) return;
    editor.commands.setContent(sanitizeRichText(node.bodyHtml));
  }, [editor, node.bodyHtml, node.yjsState]);

  const flushPendingEdits = useCallback((): Promise<void> => {
    if (timer.current !== null) {
      window.clearTimeout(timer.current);
      timer.current = null;
    }
    if (pendingUpdates.current.length === 0) return drain.current ?? Promise.resolve();
    if (drain.current) return drain.current;

    const run = async () => {
      while (pendingUpdates.current.length > 0) {
        const activeEditor = editorRef.current;
        if (!activeEditor) throw new Error("The text editor is unavailable while changes are pending.");
        const updates = pendingUpdates.current;
        pendingUpdates.current = [];
        const update = Y.mergeUpdates(updates);
        const html = sanitizeRichText(activeEditor.getHTML());
        const yjsState = Y.encodeStateAsUpdate(document);
        try {
          await commitRef.current(html, bytesToBase64(update), bytesToBase64(yjsState));
        } catch (error) {
          // Preserve the delta so the transition remains blocked and a later
          // explicit flush or edit can retry it.
          pendingUpdates.current = [update, ...pendingUpdates.current];
          throw error;
        }
      }
    };

    const pending = run();
    drain.current = pending;
    pending.then(
      () => { if (drain.current === pending) drain.current = null; },
      () => { if (drain.current === pending) drain.current = null; },
    );
    return pending;
  }, [document]);

  const participant = useMemo<DraftParticipant>(() => ({
    freeze: () => { editorRef.current?.setEditable(false); },
    flush: flushPendingEdits,
    unfreeze: () => { editorRef.current?.setEditable(!readOnlyRef.current); },
  }), [flushPendingEdits]);

  useLayoutEffect(
    () => registerDraftParticipant(participant),
    [participant, registerDraftParticipant],
  );

  useEffect(() => {
    const handleUpdate = (update: Uint8Array, origin: unknown) => {
      if (origin === "persistence-load") return;
      pendingUpdates.current.push(update);
      if (timer.current !== null) window.clearTimeout(timer.current);
      timer.current = window.setTimeout(() => {
        void flushPendingEdits().catch(() => undefined);
      }, 1200);
    };
    document.on("update", handleUpdate);
    return () => {
      document.off("update", handleUpdate);
      if (timer.current !== null) {
        window.clearTimeout(timer.current);
        timer.current = null;
      }
      // Internal navigation is flushed by the controller before unmount. Do
      // not asynchronously flush or destroy this Y.Doc from effect cleanup:
      // React StrictMode intentionally replays setup/cleanup on the same doc.
    };
  }, [document, flushPendingEdits]);

  if (!editor) return <div className="editor-loading">Preparing editor…</div>;

  return (
    <div className="rich-editor">
      <div className="editor-toolbar" role="toolbar" aria-label="Text formatting">
        <button type="button" className={editor.isActive("bold") ? "active" : ""} onClick={() => editor.chain().focus().toggleBold().run()} disabled={readOnly}>Bold</button>
        <button type="button" className={editor.isActive("italic") ? "active" : ""} onClick={() => editor.chain().focus().toggleItalic().run()} disabled={readOnly}>Italic</button>
        <button type="button" className={editor.isActive("heading", { level: 2 }) ? "active" : ""} onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()} disabled={readOnly}>Heading</button>
        <button type="button" onClick={() => editor.chain().focus().toggleBulletList().run()} disabled={readOnly}>Bullets</button>
        <button type="button" onClick={() => editor.chain().focus().toggleOrderedList().run()} disabled={readOnly}>Numbered</button>
        <button type="button" onClick={() => editor.chain().focus().toggleBlockquote().run()} disabled={readOnly}>Quote</button>
        <button type="button" onClick={() => editor.chain().focus().undo().run()} disabled={readOnly || !editor.can().undo()}>Undo</button>
        <button type="button" onClick={() => editor.chain().focus().redo().run()} disabled={readOnly || !editor.can().redo()}>Redo</button>
      </div>
      <EditorContent editor={editor} />
    </div>
  );
}
