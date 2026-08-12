import { useCallback, useLayoutEffect, useMemo, useRef, useState } from "react";
import type { DraftParticipant, RegisterDraftParticipant } from "../application/draftTransition";
import type { DocumentNode, NodeKind } from "../domain/types";
import { RichTextEditor } from "../editor/RichTextEditor";

type NodeMetadataDraft = Pick<DocumentNode, "title" | "summary" | "kind">;
type MetadataChanges = Partial<NodeMetadataDraft>;

interface NodeEditorProps {
  node: DocumentNode;
  readOnly: boolean;
  onMetadataChange: (changes: MetadataChanges) => Promise<void>;
  onContentChange: (contentHtml: string, yjsUpdate: string, yjsState: string) => Promise<void>;
  registerDraftParticipant: RegisterDraftParticipant;
}

const kinds: Array<{ value: NodeKind; label: string }> = [
  { value: "idea", label: "Idea" },
  { value: "section", label: "Section" },
  { value: "scene", label: "Scene" },
  { value: "beat", label: "Story beat" },
  { value: "text", label: "Final text" },
];

function metadataOf(node: DocumentNode): NodeMetadataDraft {
  return { title: node.title, summary: node.summary, kind: node.kind };
}

export function NodeEditor({ node, readOnly, onMetadataChange, onContentChange, registerDraftParticipant }: NodeEditorProps) {
  const [draft, setDraft] = useState<NodeMetadataDraft>(() => metadataOf(node));
  const [frozen, setFrozen] = useState(false);
  const draftRef = useRef(draft);
  const nodeRef = useRef(node);
  const commitRef = useRef(onMetadataChange);
  const dirty = useRef(new Set<keyof NodeMetadataDraft>());
  const metadataDrain = useRef<Promise<void> | null>(null);
  const richTextParticipant = useRef<DraftParticipant | null>(null);
  const mounted = useRef(false);

  useLayoutEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; };
  }, []);

  useLayoutEffect(() => { commitRef.current = onMetadataChange; }, [onMetadataChange]);

  useLayoutEffect(() => {
    nodeRef.current = node;
    setDraft((current) => {
      const next = { ...current };
      if (!dirty.current.has("title")) next.title = node.title;
      if (!dirty.current.has("summary")) next.summary = node.summary;
      if (!dirty.current.has("kind")) next.kind = node.kind;
      draftRef.current = next;
      return next;
    });
  }, [node]);

  const changeDraft = useCallback(<K extends keyof NodeMetadataDraft>(key: K, value: NodeMetadataDraft[K]) => {
    const next = { ...draftRef.current, [key]: value };
    draftRef.current = next;
    dirty.current.add(key);
    setDraft(next);
  }, []);

  const flushMetadata = useCallback((): Promise<void> => {
    if (metadataDrain.current) return metadataDrain.current;

    const run = async () => {
      while (dirty.current.size > 0) {
        const captured = { ...draftRef.current };
        const baseline = nodeRef.current;
        const fields = [...dirty.current];
        const changes: MetadataChanges = {};
        for (const field of fields) {
          if (captured[field] !== baseline[field]) {
            (changes as Record<keyof NodeMetadataDraft, string>)[field] = captured[field];
          }
        }

        if (Object.keys(changes).length > 0) {
          await commitRef.current(changes);
          const accepted = {
            ...changes,
            ...(changes.title !== undefined
              ? { title: changes.title.trim() || "Untitled idea" }
              : {}),
          };
          nodeRef.current = { ...nodeRef.current, ...accepted };
          if (draftRef.current.title === captured.title && accepted.title !== undefined) {
            const next = { ...draftRef.current, title: accepted.title };
            draftRef.current = next;
            // Keep React's state synchronized even if persistence synchronously
            // rendered the accepted prop while this field was still marked dirty.
            setDraft(next);
          }
        }
        for (const field of fields) {
          if (draftRef.current[field] === captured[field]) dirty.current.delete(field);
        }
      }
    };

    const pending = run();
    metadataDrain.current = pending;
    pending.then(
      () => { if (metadataDrain.current === pending) metadataDrain.current = null; },
      () => { if (metadataDrain.current === pending) metadataDrain.current = null; },
    );
    return pending;
  }, []);

  const registerRichTextParticipant = useCallback((participant: DraftParticipant): (() => void) => {
    richTextParticipant.current = participant;
    return () => {
      if (richTextParticipant.current === participant) richTextParticipant.current = null;
    };
  }, []);

  const participant = useMemo<DraftParticipant>(() => ({
    freeze: () => {
      if (mounted.current) setFrozen(true);
      richTextParticipant.current?.freeze();
    },
    flush: async () => {
      await flushMetadata();
      await richTextParticipant.current?.flush();
    },
    unfreeze: () => {
      richTextParticipant.current?.unfreeze();
      if (mounted.current) setFrozen(false);
    },
  }), [flushMetadata]);

  useLayoutEffect(
    () => registerDraftParticipant("node-editor", participant),
    [participant, registerDraftParticipant],
  );

  const disabled = readOnly || frozen;
  return (
    <article className="node-editor">
      <div className="node-meta">
        <label>
          <span className="eyebrow">Idea title</span>
          <input
            className="title-input"
            value={draft.title}
            disabled={disabled}
            onChange={(event) => changeDraft("title", event.target.value)}
            onBlur={() => { void flushMetadata().catch(() => undefined); }}
          />
        </label>
        <label className="kind-select">
          <span className="eyebrow">Kind</span>
          <select
            value={draft.kind}
            disabled={disabled}
            onChange={(event) => {
              changeDraft("kind", event.target.value as NodeKind);
              void flushMetadata().catch(() => undefined);
            }}
          >
            {kinds.map((kind) => <option key={kind.value} value={kind.value}>{kind.label}</option>)}
          </select>
        </label>
      </div>
      <label className="summary-field">
        <span className="eyebrow">Working summary</span>
        <textarea
          value={draft.summary}
          disabled={disabled}
          rows={3}
          placeholder="What must this idea accomplish?"
          onChange={(event) => changeDraft("summary", event.target.value)}
          onBlur={() => { void flushMetadata().catch(() => undefined); }}
        />
      </label>
      <div className="text-heading">
        <div><span className="eyebrow">Developed text</span><h2>Write and refine</h2></div>
        <span className="save-hint">Typing is grouped after 1.2 seconds of rest</span>
      </div>
      <RichTextEditor
        node={node}
        readOnly={disabled}
        onCommit={onContentChange}
        registerDraftParticipant={registerRichTextParticipant}
      />
    </article>
  );
}
