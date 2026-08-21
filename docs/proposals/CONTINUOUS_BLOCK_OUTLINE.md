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

The implementation must keep these concepts separate rather than overloading one `selectedNodeId`:

- `canvasContextNodeId` — last/current canvas block used for reveal/filter/focus restoration intent;
- `canvasExpandedIds` — disclosure state for the continuous canvas;
- `editorOwnerNodeId` — the sole actually mounted live Tiptap owner, or null;
- `navigatorSelectionId` — current navigator tree item;
- `navigatorExpandedIds` — navigator-only disclosure state;
- `focusRegion` — actual DOM focus region (`canvas`, `navigator`, `history`, `chrome`, `outside`);
- `navigatorDockPreferredOpen` — validated versioned browser preference for wide-layout Navigator request;
- `historyDockRequestedOpen` — page-session wide-layout History request;
- `activeCompactAuxiliary` — `none`, `navigator`, or `history`;
- `lastExplicitAuxiliary` — deterministic survivor hint for wide→compact collision;
- `resumeEditorNodeId` — one-shot retained-live candidate around historical mode.

Only validated versioned preferred wide Navigator visibility may be retained as browser presentation preference. Node IDs, document identity, compact drawer state, History data/query state, focus state and resume candidates remain transient.

## Navigator interaction contract

Navigator browsing is deliberately weaker than canvas focus/editing.

| Navigator action | Canvas/editor effect | Persistence/checkpoint effect |
|---|---|---|
| Open/close | Keep canvas/editor mounted; ordinary dismissal returns focus to the toggle | UI preference/session state only; only an actual dirty-body focus departure may seal once |
| Arrow/Home/End | Move navigator selection only | No document operation or editor transfer |
| Left/Right disclosure | Change navigator expansion only | Never changes canvas expansion or hides editor owner |
| Pointer/Space locate | Select/reveal target and expand only required canvas ancestors; focus may remain in Navigator | Reveal is UI-only; if this was the first dirty-body focus departure, that normal boundary may checkpoint once |
| Enter / **Focus in document** | Validate target, reveal it, then move focus to its canvas block; if editor ownership must change, use normal drain-before-unmount transition | No document operation by itself; failed drain cancels transfer and retains old editor owner plus navigator focus |
| Compact row activation | Validate/reveal first; close drawer only after successful transfer; failure leaves drawer/selection available | Same controlled-transfer rule |
| Historical disclosure/focus | Operates on historical projection only | No draft participant, checkpoint or mutation |

Reveal expands only the target’s missing canvas ancestors and never collapses unrelated canvas branches. It must not pretend Navigator selection equals canvas focus or editor ownership.

If a selected target disappears between browse and activation, prune/fallback by stable hierarchy identity (nearest surviving parent, then next/previous, then first root) and announce unavailability. Never silently substitute a different node by array position.

## Live/historical context contract

Navigator state follows the **displayed** `WorkspaceProjection`.

1. Entering historical mode retains the complete live canvas/navigator context and derives a fresh one-shot `resumeEditorNodeId` from the actual current editor owner.
2. Actual editor ownership becomes null before historical rendering.
3. Historical canvas/navigator IDs are initialized from compatible live IDs and pruned to the snapshot.
4. Moving among historical revisions preserves compatible historical selection/expansion and prunes missing stable IDs.
5. **Back to current** restores retained live canvas/navigator state and validates/consumes the one-shot resume candidate.
6. **Restore as new revision** rebuilds a new live context against the accepted compensating view; it does not copy historical UI context into live state.
7. If the resume ID survives Restore under changed ancestry, every required canvas ancestor must be expanded before mounting the editor. If it cannot be made active/visible, clear it and choose a visible fallback.
8. No resume candidate survives ordinary live mode; each later historical entry derives a fresh candidate from then-current ownership.

## Responsive shell requirements

On wide layouts, Navigator and History may dock only when available container width keeps the canvas at or above its named readable minimum. Requested visibility and effective visibility are distinct.

On compact layouts, an explicitly opened auxiliary panel behaves as a labeled modal drawer over an inert canvas. Navigator and History overlays are mutually exclusive; nested focus traps are forbidden.

### Wide → compact

When two wide docks can no longer fit:

1. keep the panel that currently contains focus;
2. otherwise keep `lastExplicitAuxiliary`;
3. close the loser without its ordinary focus-return;
4. set `activeCompactAuxiliary` to the survivor;
5. if focus must move from a dirty canvas body into the surviving modal, synchronously capture/seal exactly one ordinary focus-departure checkpoint before/during that handoff;
6. clean body, already-panel-focused, chrome-focused or outside-app transitions create no checkpoint;
7. if focus is outside the application, presentation may change but focus must not be stolen back into the app.

If only one dock is visible at shrink time, retain it as a compact drawer only when focus is already inside it; otherwise prefer no compact auxiliary and leave canvas/chrome/outside focus untouched.

### Compact → wide

1. clear `activeCompactAuxiliary`;
2. show Navigator iff `navigatorDockPreferredOpen` is true and width permits;
3. show History iff `historyDockRequestedOpen` is true and width permits;
4. preserve focused panel control when that panel remains requested as a dock;
5. if a compact panel is no longer requested, close it and return focus to its own invoker;
6. never rewrite requested-visibility values merely because layout changed;
7. never create an additional checkpoint merely because layout changed.

### Drawer accessibility

A compact drawer must:

- have a visible accessible heading and close action;
- expose modal semantics and make the background workspace inert;
- trap focus while open;
- close on Escape/backdrop as designed;
- return focus to its invoker on ordinary dismissal;
- suppress losing-panel focus return during atomic Navigator↔History handoff;
- use touch targets suitable for coarse input and respect safe areas/software-keyboard constraints.

## History coexistence

WP-5 grouped History is already implemented and must remain intact when the optional navigator is added.

Effective `historyVisible`, not only the wide-layout request, governs initial/refresh querying:

- first effective reveal with no valid page issues one guarded initial query;
- hiding/showing a valid non-stale page issues no query;
- accepted document changes while History is hidden mark its page stale and advance a monotonic data generation;
- a response started before that change cannot clear the newer stale state;
- the next effective reveal performs exactly one current guarded refresh;
- responsive/Navigator handoff must not rewrite `historyDockRequestedOpen` merely to match effective visibility.

Collapsed semantic groups, exact standalone expansion and native host-deferred messages render identically whether Navigator is present or absent.

## Accessibility qualification — WP-8

Qualification must cover:

- Navigator as a labeled navigation region containing an ARIA single-select tree;
- correct treeitem levels/expanded/set-size/position metadata as applicable;
- one roving tabindex with Arrow/Home/End/Left/Right behavior;
- **Focus in document** as an explicit action distinct from browse/locate;
- plain-text handling of empty, markup-like, bidirectional, combining, emoji and very-long titles;
- drawer focus trap/Escape/return and inert background semantics;
- distinguishable Navigator selection, canvas context/focus and editor ownership states;
- canvas structure/toolbar semantics and focus order;
- real browser focus with Tiptap/Yjs;
- IME and selection behavior;
- pointer/touch discoverability and non-drag alternatives;
- narrow layouts, software keyboards and scrolling/reveal;
- live/historical transitions and stale IDs;
- screen-reader announcement/focus behavior.

## Performance constraints

The first optimization remains **one active editor**, not virtualization.

- toggling/browsing Navigator must not recreate the canvas or active editor;
- navigator projection must not depend on body HTML;
- inactive body previews should avoid unnecessary rerender while another block is edited;
- measure representative canvas/navigator projection, React commit, reveal and editor-transfer latency before introducing virtualization;
- do not virtualize until browser find/text selection/focus restoration/screen-reader/historical behavior for off-screen blocks is explicitly designed.

## Error behavior

- failed body drain retains the old editor owner and cancels requested focus/structure change;
- a stale/missing Navigator target is resolved by stable-ID fallback and announced, never by coincidental array position;
- invalid/missing preference state falls back to closed without blocking document use;
- later preference-write failure keeps the in-memory choice for the session and reports non-blockingly;
- navigator projection failure disables/reports the auxiliary panel without resurrecting a second legacy editor;
- responsive handoff must never leave DOM focus in inert content;
- historical Navigator must never expose live mutation callbacks or retained-live content behind a historical canvas.

## Non-goals

- one document-wide ProseMirror/Yjs instance;
- cross-node rich-text selection;
- persisting hierarchy as headings in HTML;
- keeping a selectable legacy master/detail mode;
- making the navigator another mutation/editor surface;
- virtualizing the document before measurements justify it.

## WP-7A acceptance criteria

WP-7A is complete only when all applicable criteria hold:

1. Canvas remains the sole editing surface whether Navigator is open or closed.
2. Navigator can be toggled at runtime and is usable as an orientation/reveal/focus aid without any authored-data mutation.
3. Navigator selection/expansion are independent of canvas context/expansion and editor ownership.
4. Browsing/disclosure/locate does not mount or transfer the editor; explicit **Focus in document** uses the normal transition barrier when ownership must change.
5. Failed transfer retains old editor ownership and Navigator focus/selection with a retryable error state.
6. Reveal expands only required canvas ancestors and never hides the active editor through Navigator disclosure.
7. Historical Navigator reads only the active historical projection and exposes no mutation surface.
8. Back restores retained live Navigator/canvas context; Restore rebuilds live context against the accepted compensating state rather than copying historical UI context.
9. A surviving resume target with changed ancestry is made visible before editor mount; absent/deleted targets fall back visibly rather than creating a hidden editor owner.
10. Navigator/UI state does not enter `.coedit`, snapshots, hashes, contributions, recovery JSON or Markdown; only validated wide-layout preference may use browser presentation storage.
11. Wide/compact transitions follow the deterministic focused-panel/last-explicit survivor rules and never rewrite requested visibility merely because layout changed.
12. A responsive collision captures exactly one checkpoint only when it truly moves focus out of a dirty body; clean/already-panel/outside-app transitions create zero, and outside focus is never stolen.
13. Navigator and History overlays are mutually exclusive and ordinary/atomic focus-return behavior is deterministic.
14. History first-reveal/stale-refresh/no-redundant-query behavior remains correct with Navigator present.
15. Empty/hostile/very-long Unicode titles remain inert plain text and cannot break layout or accessible naming.

## WP-8 acceptance boundary

WP-8 is complete only after the combined canvas/Navigator/History shell is qualified on actual browser/accessibility paths rather than jsdom alone, including:

- Chromium, Firefox and Safari/WebKit desktop behavior;
- Safari/iPadOS or equivalent touch qualification where claimed;
- keyboard-only navigation and structure editing;
- screen-reader tree/dialog/current-state behavior;
- IME/composition and rich-text focus transfer;
- dynamic viewport/orientation/software-keyboard cases;
- safe-area and coarse-pointer interaction;
- no duplicate/silent checkpoints during responsive/focus handoff.
