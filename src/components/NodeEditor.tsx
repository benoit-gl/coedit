import { useCallback, useLayoutEffect, useMemo, useRef, useState } from "react";
import type { DraftParticipant, RegisterDraftParticipant } from "../application/draftTransition";
import type { DocumentNode } from "../domain/types";
import { normalizeTags } from "../domain/tags";
import { RichTextEditor } from "../editor/RichTextEditor";
import { TagEditor } from "./TagEditor";

type NodeMetadataDraft = Pick<DocumentNode, "title" | "tags">;
type MetadataChanges = Partial<NodeMetadataDraft>;

interface NodeEditorProps {
  node: DocumentNode;
  tagSuggestions: string[];
  readOnly: boolean;
  onMetadataChange: (changes: MetadataChanges) => Promise<void>;
  onBodyChange: (bodyHtml: string, yjsUpdate: string, yjsState: string) => Promise<void>;
  registerDraftParticipant: RegisterDraftParticipant;
}

function metadataOf(node: DocumentNode): NodeMetadataDraft {
  return { title: node.title, tags: node.tags };
}

export function NodeEditor({ node, tagSuggestions, readOnly, onMetadataChange, onBodyChange, registerDraftParticipant }: NodeEditorProps) {
  const [draft, setDraft] = useState<NodeMetadataDraft>(() => metadataOf(node));
  const [frozen, setFrozen] = useState(false);
  const draftRef = useRef(draft);
  const nodeRef = useRef(node);
  const commitRef = useRef(onMetadataChange);
  const dirty = useRef(new Set<keyof NodeMetadataDraft>());
  const metadataDrain = useRef<Promise<void> | null>(null);
  const tagParticipant = useRef<DraftParticipant | null>(null);
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
      if (!dirty.current.has("tags")) next.tags = node.tags;
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
        if (fields.includes("title") && captured.title !== baseline.title) changes.title = captured.title;
        if (fields.includes("tags") && (captured.tags.length !== baseline.tags.length || captured.tags.some((tag, index) => tag !== baseline.tags[index]))) {
          changes.tags = captured.tags;
        }

        if (Object.keys(changes).length > 0) {
          await commitRef.current(changes);
          const accepted = {
            ...changes,
            ...(changes.title !== undefined
              ? { title: changes.title.trim() || "Untitled idea" }
              : {}),
            ...(changes.tags !== undefined ? { tags: normalizeTags(changes.tags) } : {}),
          };
          nodeRef.current = { ...nodeRef.current, ...accepted };
          if (draftRef.current.title === captured.title && accepted.title !== undefined) {
            const next = { ...draftRef.current, title: accepted.title };
            draftRef.current = next;
            // Keep React's state synchronized even if persistence synchronously
            // rendered the accepted prop while this field was still marked dirty.
            setDraft(next);
          }
          if (draftRef.current.tags === captured.tags && accepted.tags !== undefined) {
            const next = { ...draftRef.current, tags: accepted.tags };
            draftRef.current = next;
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

  const registerTagParticipant = useCallback((participant: DraftParticipant): (() => void) => {
    tagParticipant.current = participant;
    return () => {
      if (tagParticipant.current === participant) tagParticipant.current = null;
    };
  }, []);

  const participant = useMemo<DraftParticipant>(() => ({
    freeze: () => {
      if (mounted.current) setFrozen(true);
      tagParticipant.current?.freeze();
      richTextParticipant.current?.freeze();
    },
    flush: async () => {
      await tagParticipant.current?.flush();
      await flushMetadata();
      await richTextParticipant.current?.flush();
    },
    unfreeze: () => {
      richTextParticipant.current?.unfreeze();
      tagParticipant.current?.unfreeze();
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
      </div>
      <TagEditor
        tags={draft.tags}
        suggestions={tagSuggestions}
        disabled={disabled}
        registerDraftParticipant={registerTagParticipant}
        onChange={(tags) => {
          changeDraft("tags", tags);
          void flushMetadata().catch(() => undefined);
        }}
      />
      <div className="text-heading">
        <div><span className="eyebrow">Text</span><h2>Write and refine</h2></div>
        <span className="save-hint">Typing is grouped after 1.2 seconds of rest</span>
      </div>
      <RichTextEditor
        node={node}
        readOnly={disabled}
        onCommit={onBodyChange}
        registerDraftParticipant={registerRichTextParticipant}
      />
    </article>
  );
}
