import { useEffect, useMemo, useRef } from "react";
import { EditorContent, useEditor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Collaboration from "@tiptap/extension-collaboration";
import DOMPurify from "dompurify";
import * as Y from "yjs";
import type { DocumentNode } from "../domain/types";
import { bytesToBase64, createYDoc } from "./yjsEncoding";

interface RichTextEditorProps {
  node: DocumentNode;
  readOnly: boolean;
  onCommit: (contentHtml: string, yjsUpdate: string, yjsState: string) => Promise<void>;
}

const SAFE_TAGS = ["p", "br", "strong", "em", "s", "code", "pre", "blockquote", "ul", "ol", "li", "h1", "h2", "h3", "h4", "a", "hr"];

export function RichTextEditor({ node, readOnly, onCommit }: RichTextEditorProps) {
  const document = useMemo(() => createYDoc(node.yjsState), [node.id]);
  const pendingUpdates = useRef<Uint8Array[]>([]);
  const timer = useRef<number | null>(null);
  const commitRef = useRef(onCommit);
  commitRef.current = onCommit;

  const editor = useEditor({
    editable: !readOnly,
    extensions: [
      StarterKit.configure({ undoRedo: false }),
      Collaboration.configure({ document, field: "content" }),
    ],
    editorProps: {
      attributes: { class: "editor-surface", "aria-label": "Node text" },
      transformPastedHTML: (html) => DOMPurify.sanitize(html, { ALLOWED_TAGS: SAFE_TAGS, ALLOWED_ATTR: ["href", "title"] }),
    },
  }, [document, readOnly]);

  useEffect(() => {
    if (!editor || node.yjsState || !node.contentHtml) return;
    editor.commands.setContent(DOMPurify.sanitize(node.contentHtml, { ALLOWED_TAGS: SAFE_TAGS, ALLOWED_ATTR: ["href", "title"] }));
  }, [editor, node.contentHtml, node.yjsState]);

  useEffect(() => {
    const flush = async () => {
      if (!editor || pendingUpdates.current.length === 0) return;
      const update = Y.mergeUpdates(pendingUpdates.current);
      pendingUpdates.current = [];
      const html = DOMPurify.sanitize(editor.getHTML(), { ALLOWED_TAGS: SAFE_TAGS, ALLOWED_ATTR: ["href", "title"] });
      await commitRef.current(html, bytesToBase64(update), bytesToBase64(Y.encodeStateAsUpdate(document)));
    };
    const handleUpdate = (update: Uint8Array, origin: unknown) => {
      if (origin === "persistence-load") return;
      pendingUpdates.current.push(update);
      if (timer.current !== null) window.clearTimeout(timer.current);
      timer.current = window.setTimeout(() => void flush(), 1200);
    };
    document.on("update", handleUpdate);
    return () => {
      document.off("update", handleUpdate);
      if (timer.current !== null) window.clearTimeout(timer.current);
      void flush();
      document.destroy();
    };
  }, [document, editor]);

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

