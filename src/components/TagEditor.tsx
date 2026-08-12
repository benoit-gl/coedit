import { useCallback, useEffect, useId, useLayoutEffect, useMemo, useRef, useState, type KeyboardEvent } from "react";
import type { DraftParticipant } from "../application/draftTransition";
import { hasTag, MAX_TAG_CODE_POINTS, normalizeTag, normalizeTags } from "../domain/tags";

interface TagEditorProps {
  tags: string[];
  suggestions: string[];
  disabled: boolean;
  onChange: (tags: string[]) => void;
  registerDraftParticipant: (participant: DraftParticipant) => () => void;
}

interface TagOption {
  value: string;
  create: boolean;
}

function sameTags(left: readonly string[], right: readonly string[]): boolean {
  return left.length === right.length && left.every((tag, index) => tag === right[index]);
}

export function TagEditor({ tags, suggestions, disabled, onChange, registerDraftParticipant }: TagEditorProps) {
  const id = useId();
  const listboxId = `${id}-tag-options`;
  const errorId = `${id}-tag-error`;
  const inputRef = useRef<HTMLInputElement>(null);
  const tagsRef = useRef(tags);
  const suggestionsRef = useRef(suggestions);
  const onChangeRef = useRef(onChange);
  const queryRef = useRef("");
  const [query, setQuery] = useState("");
  const [focused, setFocused] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);
  const [frozen, setFrozen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [announcement, setAnnouncement] = useState("");

  useLayoutEffect(() => { tagsRef.current = tags; }, [tags]);
  useLayoutEffect(() => { suggestionsRef.current = suggestions; }, [suggestions]);
  useLayoutEffect(() => { onChangeRef.current = onChange; }, [onChange]);

  const options = useMemo<TagOption[]>(() => {
    const normalizedQuery = query.normalize("NFKC").trim().toLowerCase();
    const reusable = suggestions
      .filter((tag) => !hasTag(tags, tag))
      .filter((tag) => !normalizedQuery || tag.toLowerCase().includes(normalizedQuery))
      .map((value) => ({ value, create: false }));
    let candidate = "";
    try { candidate = normalizeTag(query); } catch { /* The validation message appears on commit. */ }
    if (candidate && !hasTag(tags, candidate) && !suggestions.some((tag) => tag.toLowerCase() === candidate.toLowerCase())) {
      reusable.push({ value: candidate, create: true });
    }
    return reusable;
  }, [query, suggestions, tags]);

  useEffect(() => {
    if (activeIndex >= options.length) setActiveIndex(Math.max(0, options.length - 1));
  }, [activeIndex, options.length]);

  const setInput = useCallback((value: string) => {
    queryRef.current = value;
    setQuery(value);
  }, []);

  const addTag = useCallback((raw: string): boolean => {
    try {
      const normalized = normalizeTag(raw);
      if (!normalized) return false;
      const reusable = suggestionsRef.current.find((tag) => tag.toLowerCase() === normalized.toLowerCase());
      const displayValue = reusable ?? normalized;
      const next = normalizeTags([...tagsRef.current, displayValue]);
      if (!sameTags(next, tagsRef.current)) {
        tagsRef.current = next;
        onChangeRef.current(next);
        setAnnouncement(`Added tag ${displayValue}.`);
      }
      setInput("");
      setError(null);
      setExpanded(false);
      setActiveIndex(0);
      return true;
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught));
      return false;
    }
  }, [setInput]);

  const removeTag = useCallback((index: number) => {
    const removed = tagsRef.current[index];
    const next = tagsRef.current.filter((_tag, candidate) => candidate !== index);
    tagsRef.current = next;
    onChangeRef.current(next);
    setAnnouncement(`Removed tag ${removed}.`);
    inputRef.current?.focus();
  }, []);

  const flush = useCallback(async () => {
    if (queryRef.current.trim() && !addTag(queryRef.current)) {
      throw new Error("The pending tag is invalid.");
    }
  }, [addTag]);

  const participant = useMemo<DraftParticipant>(() => ({
    freeze: () => setFrozen(true),
    flush,
    unfreeze: () => setFrozen(false),
  }), [flush]);
  useLayoutEffect(
    () => registerDraftParticipant(participant),
    [participant, registerDraftParticipant],
  );

  const locked = disabled || frozen;
  const popupVisible = focused && expanded && options.length > 0;
  const onKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.nativeEvent.isComposing) return;
    if (event.key === "ArrowDown" && options.length > 0) {
      event.preventDefault();
      setExpanded(true);
      setActiveIndex((index) => popupVisible ? (index + 1) % options.length : 0);
    } else if (event.key === "ArrowUp" && options.length > 0) {
      event.preventDefault();
      setExpanded(true);
      setActiveIndex((index) => popupVisible ? (index - 1 + options.length) % options.length : options.length - 1);
    } else if (event.key === "Enter") {
      event.preventDefault();
      const option = popupVisible ? options[activeIndex] : undefined;
      addTag(option?.value ?? queryRef.current);
    } else if (event.key === "Escape") {
      setExpanded(false);
    } else if (event.key === "Backspace" && !queryRef.current && tagsRef.current.length > 0) {
      event.preventDefault();
      removeTag(tagsRef.current.length - 1);
    }
  };

  return (
    <div className="tags-field">
      <span className="eyebrow" id={`${id}-tag-label`}>Tags (optional)</span>
      <div className={`tag-editor ${focused ? "focused" : ""} ${locked ? "disabled" : ""}`}>
        {tags.length > 0 && (
          <ul className="tag-list" aria-label="Selected tags">
            {tags.map((tag, index) => (
              <li className="tag-chip" key={tag.toLowerCase()}>
                <span>{tag}</span>
                <button type="button" disabled={locked} aria-label={`Remove tag ${tag}`} onClick={() => removeTag(index)}>×</button>
              </li>
            ))}
          </ul>
        )}
        <div className="tag-input-row">
          <input
            ref={inputRef}
            type="text"
            role="combobox"
            aria-labelledby={`${id}-tag-label`}
            aria-autocomplete="list"
            aria-haspopup="listbox"
            aria-expanded={popupVisible}
            aria-controls={listboxId}
            aria-activedescendant={popupVisible ? `${listboxId}-${activeIndex}` : undefined}
            aria-invalid={error ? true : undefined}
            aria-describedby={error ? errorId : undefined}
            value={query}
            disabled={locked}
            placeholder={tags.length ? "Add another tag…" : "Add or select a tag…"}
            onFocus={() => { setFocused(true); setExpanded(true); }}
            onBlur={() => {
              setFocused(false);
              if (queryRef.current.trim()) void flush().catch(() => undefined);
            }}
            onChange={(event) => {
              setInput(event.target.value);
              setError(null);
              setExpanded(true);
              setActiveIndex(0);
            }}
            onKeyDown={onKeyDown}
          />
          <button
            className="tag-popup-toggle"
            type="button"
            disabled={locked || options.length === 0}
            aria-label="Show tag suggestions"
            aria-expanded={popupVisible}
            onPointerDown={(event) => event.preventDefault()}
            onClick={() => {
              const nextExpanded = !popupVisible;
              inputRef.current?.focus();
              setFocused(true);
              setExpanded(nextExpanded);
            }}
          >▾</button>
        </div>
        {popupVisible && (
          <ul className="tag-options" id={listboxId} role="listbox" aria-label="Tag suggestions">
            {options.map((option, index) => (
              <li
                id={`${listboxId}-${index}`}
                key={`${option.create ? "create" : "reuse"}-${option.value.toLowerCase()}`}
                role="option"
                aria-selected={index === activeIndex}
                className={index === activeIndex ? "active" : ""}
                onPointerDown={(event) => event.preventDefault()}
                onPointerMove={() => setActiveIndex(index)}
                onClick={() => addTag(option.value)}
              >{option.create ? <>Add “{option.value}”</> : option.value}</li>
            ))}
          </ul>
        )}
      </div>
      <span className="tag-help">Press Enter to add. Suggestions come from this document.</span>
      {error && <span className="tag-error" id={errorId}>{error}</span>}
      <span className="sr-only" aria-live="polite">{announcement}</span>
      <span className="sr-only">Tags are limited to {MAX_TAG_CODE_POINTS} characters each.</span>
    </div>
  );
}
