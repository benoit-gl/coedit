# Continuous block-outline and optional navigator — decision record

**Status:** continuous canvas implemented through WP-6/WP-7. The optional navigation-only sidebar and its responsive/focus qualification remain WP-7A/WP-8.

## Implemented canvas decisions

The former outline-plus-selected-editor master/detail workspace is retired. `DocumentCanvas` is the sole live and historical document surface.

Persisted hierarchy remains a flat node collection using `parentId` and `position`. `projectVisibleNodes` derives an immutable visible pre-order with depth, disclosure and adjacency metadata.

Each `NodeBlock` renders one visible node. Live blocks expose inline metadata/structure plus sanitized inactive-body preview; exactly one live block may own `RichTextEditor`. Historical blocks reuse the same layout but are read-only.

Actions that may transfer, hide or remove the editor owner use the existing draft-transition barrier and cancel on failed persistence. This one-editor ownership model is a binding architectural constraint unless deliberately redesigned.

## Implemented interaction baseline

Core canvas behavior includes:

- root/sibling/child insertion;
- inline title/tag editing;
- disclosure;
- reorder/indent/outdent;
- pointer reparenting;
- keyboard structure/navigation paths;
- confirmed subtree soft deletion;
- focus fallback;
- sanitized inactive/historical body previews;
- live/historical reuse of the same canvas.

Broader browser, touch and assistive-technology qualification is still pending.

## Remaining WP-7A — optional navigator

The optional navigator is an **auxiliary view**, not a second editor and not a resurrection of master/detail.

Required properties:

- `DocumentCanvas` remains mounted and is the only editing surface;
- navigator rows contain no title/tag/body editor, Tiptap, create/move/delete commands or drag editor surface;
- navigator selection/expansion are independent from canvas context/expansion;
- browsing a navigator row does not claim actual canvas focus or editor ownership;
- explicit **Focus in document** may reveal/focus a block and must use the normal drain barrier if editor ownership changes;
- historical navigator content must come from the active historical projection, never the retained live tree;
- navigator state is UI/session state and never enters `.coedit`, hashes, snapshots, contributions or exports.

## State model to preserve

The implementation should keep these concepts separate rather than overloading one `selectedNodeId`:

- canvas context node;
- canvas expanded IDs;
- actual live editor owner;
- navigator selected node;
- navigator expanded IDs;
- actual focus region;
- wide-layout requested navigator/history visibility;
- compact active auxiliary panel;
- one-shot live editor resume candidate around historical mode.

Only a validated versioned **preferred wide navigator visibility** may be retained as browser presentation preference. Node IDs, document identity, compact drawer state, History request state and focus state must remain transient.

## Responsive shell requirements

On wide layouts, Navigator and History may dock only when available width keeps the canvas usable. On compact layouts, an explicitly opened auxiliary panel should behave as a modal drawer with deterministic Navigator/History mutual exclusion, focus containment, Escape dismissal and focus return.

Responsive changes must not create document operations. If a layout transition actually moves DOM focus out of a dirty body, it should produce only the normal single focus-departure checkpoint, not a new special checkpoint category.

## History coexistence

WP-5 grouped History is already implemented and must remain intact when the optional navigator is added.

The shell must not cause hidden/stale History responses to overwrite newer data. Effective visibility should govern whether History needs an initial/refresh query; purely hiding/showing a still-valid page should not create redundant queries.

Collapsed semantic groups, exact standalone expansion and native host-deferred messages must render identically whether Navigator is present or absent.

## Accessibility qualification — WP-8

Qualification should cover:

- ARIA tree semantics for Navigator;
- keyboard browse/reveal/focus behavior;
- drawer focus trap/Escape/return;
- canvas structure and toolbar semantics;
- real browser focus with Tiptap/Yjs;
- IME and selection behavior;
- pointer/touch discoverability and non-drag alternatives;
- narrow layouts, software keyboards and scrolling/reveal;
- live/historical transitions and stale IDs;
- screen-reader announcement/focus behavior.

## Non-goals

- one document-wide ProseMirror/Yjs instance;
- cross-node rich-text selection;
- persisting hierarchy as headings in HTML;
- keeping a selectable legacy master/detail mode;
- making the navigator another mutation/editor surface;
- virtualizing the document before measurements justify it.

## Acceptance boundary

WP-7A is complete when the navigator provides orientation/reveal/focus without changing authored data or editor multiplicity. WP-8 is complete only after the combined canvas/navigator/history shell is qualified on actual browser/accessibility paths rather than jsdom alone.
