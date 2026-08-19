import { useCallback, useLayoutEffect, useMemo, useRef, useState, type KeyboardEvent } from "react";
import type { DraftParticipant, RegisterDraftParticipant } from "../application/draftTransition";
import type { DocumentNode } from "../domain/types";
import { normalizeTags } from "../domain/tags";
import { TagEditor } from "./TagEditor";

export type NodeMetadataChanges = Partial<Pick<DocumentNode, "title" | "tags">>;

interface NodeMetadataFieldsProps {
  node: DocumentNode;
  titleId?: string;
  tagSuggestions: string[];
  disabled: boolean;
  onCommit: (changes: NodeMetadataChanges) => Promise<void>;
  onCreateSibling: () => Promise<void>;
  onContext: () => void;
  registerDraftParticipant: RegisterDraftParticipant;
}

function sameTags(left: readonly string[], right: readonly string[]): boolean {
  return left.length === right.length && left.every((tag, index) => tag === right[index]);
}

/** Inline metadata draft used by each live canvas block. */
export function NodeMetadataFields({
  node,
  titleId,
  tagSuggestions,
  disabled,
  onCommit,
  onCreateSibling,
  onContext,
  registerDraftParticipant,
}: NodeMetadataFieldsProps) {
  const [draft, setDraft] = useState(() => ({ title: node.title, tags: node.tags }));
  const [frozen, setFrozen] = useState(false);
  const draftRef = useRef(draft);
  const nodeRef = useRef(node);
  const commitRef = useRef(onCommit);
  const dirty = useRef(new Set<"title" | "tags">());
  const drain = useRef<Promise<void> | null>(null);
  const tagParticipant = useRef<DraftParticipant | null>(null);
  const mounted = useRef(false);

  useLayoutEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; };
  }, []);
  useLayoutEffect(() => { commitRef.current = onCommit; }, [onCommit]);
  useLayoutEffect(() => {
    nodeRef.current = node;
    setDraft((current) => {
      const next = {
        title: dirty.current.has("title") ? current.title : node.title,
        tags: dirty.current.has("tags") ? current.tags : node.tags,
      };
      draftRef.current = next;
      return next;
    });
  }, [node]);

  const changeDraft = useCallback(<K extends "title" | "tags">(
    key: K,
    value: Pick<DocumentNode, "title" | "tags">[K],
  ) => {
    const next = { ...draftRef.current, [key]: value };
    draftRef.current = next;
    dirty.current.add(key);
    setDraft(next);
  }, []);

  const flush = useCallback((): Promise<void> => {
    if (drain.current) return drain.current;
    const run = async () => {
      while (dirty.current.size > 0) {
        const captured = { ...draftRef.current };
        const baseline = nodeRef.current;
        const fields = [...dirty.current];
        const changes: NodeMetadataChanges = {};
        if (fields.includes("title") && captured.title !== baseline.title) {
          changes.title = captured.title;
        }
        if (fields.includes("tags") && !sameTags(captured.tags, baseline.tags)) {
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
            if (mounted.current) setDraft(next);
          }
          if (draftRef.current.tags === captured.tags && accepted.tags !== undefined) {
            const next = { ...draftRef.current, tags: accepted.tags };
            draftRef.current = next;
            if (mounted.current) setDraft(next);
          }
        }
        for (const field of fields) {
          if (draftRef.current[field] === captured[field]) dirty.current.delete(field);
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
  }, []);

  const registerTagParticipant = useCallback((participant: DraftParticipant) => {
    tagParticipant.current = participant;
    return () => {
      if (tagParticipant.current === participant) tagParticipant.current = null;
    };
  }, []);

  const participant = useMemo<DraftParticipant>(() => ({
    freeze: () => {
      if (mounted.current) setFrozen(true);
      tagParticipant.current?.freeze();
    },
    flush: async () => {
      await tagParticipant.current?.flush();
      await flush();
    },
    unfreeze: () => {
      tagParticipant.current?.unfreeze();
      if (mounted.current) setFrozen(false);
    },
  }), [flush]);

  useLayoutEffect(
    () => registerDraftParticipant(`canvas-metadata:${node.id}`, participant),
    [node.id, participant, registerDraftParticipant],
  );

  const locked = disabled || frozen;
  const titleKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (
      event.nativeEvent.isComposing
      || event.key !== "Enter"
      || event.altKey
      || event.ctrlKey
      || event.metaKey
      || event.shiftKey
    ) return;
    event.preventDefault();
    void onCreateSibling();
  };

  return (
    <div className="node-block-metadata" onFocusCapture={onContext}>
      <label className="node-block-title-field">
        <span className="sr-only">Idea title</span>
        <input
          id={titleId}
          data-node-control="title"
          className="node-block-title-input"
          value={draft.title}
          disabled={locked}
          onChange={(event) => changeDraft("title", event.target.value)}
          onBlur={() => { void flush().catch(() => undefined); }}
          onKeyDown={titleKeyDown}
        />
      </label>
      <TagEditor
        tags={draft.tags}
        suggestions={tagSuggestions}
        disabled={locked}
        registerDraftParticipant={registerTagParticipant}
        onChange={(tags) => {
          changeDraft("tags", tags);
          void flush().catch(() => undefined);
        }}
      />
    </div>
  );
}
