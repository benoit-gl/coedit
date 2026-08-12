import { useEffect, useState } from "react";
import type { DocumentNode, NodeKind } from "../domain/types";
import { RichTextEditor } from "../editor/RichTextEditor";

interface NodeEditorProps {
  node: DocumentNode;
  readOnly: boolean;
  onMetadataChange: (changes: Partial<Pick<DocumentNode, "title" | "summary" | "kind">>) => Promise<void>;
  onContentChange: (contentHtml: string, yjsUpdate: string, yjsState: string) => Promise<void>;
}

const kinds: Array<{ value: NodeKind; label: string }> = [
  { value: "idea", label: "Idea" },
  { value: "section", label: "Section" },
  { value: "scene", label: "Scene" },
  { value: "beat", label: "Story beat" },
  { value: "text", label: "Final text" },
];

export function NodeEditor({ node, readOnly, onMetadataChange, onContentChange }: NodeEditorProps) {
  const [title, setTitle] = useState(node.title);
  const [summary, setSummary] = useState(node.summary);
  useEffect(() => { setTitle(node.title); setSummary(node.summary); }, [node.summary, node.title]);

  return (
    <article className="node-editor">
      <div className="node-meta">
        <label>
          <span className="eyebrow">Idea title</span>
          <input className="title-input" value={title} disabled={readOnly} onChange={(event) => setTitle(event.target.value)} onBlur={() => title !== node.title && void onMetadataChange({ title })} />
        </label>
        <label className="kind-select">
          <span className="eyebrow">Kind</span>
          <select value={node.kind} disabled={readOnly} onChange={(event) => void onMetadataChange({ kind: event.target.value as NodeKind })}>
            {kinds.map((kind) => <option key={kind.value} value={kind.value}>{kind.label}</option>)}
          </select>
        </label>
      </div>
      <label className="summary-field">
        <span className="eyebrow">Working summary</span>
        <textarea value={summary} disabled={readOnly} rows={3} placeholder="What must this idea accomplish?" onChange={(event) => setSummary(event.target.value)} onBlur={() => summary !== node.summary && void onMetadataChange({ summary })} />
      </label>
      <div className="text-heading">
        <div><span className="eyebrow">Developed text</span><h2>Write and refine</h2></div>
        <span className="save-hint">Typing is grouped after 1.2 seconds of rest</span>
      </div>
      <RichTextEditor node={node} readOnly={readOnly} onCommit={onContentChange} />
    </article>
  );
}
