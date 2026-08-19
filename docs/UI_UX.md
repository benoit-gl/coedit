# UI and UX specification

This document records the current Coedit Local interface and gives new contributors a file-level map for changing it. Statements under **Implemented** describe the current code. Statements under **Recommendation** are design guidance and are not promises about the present application.

Related documents:

- [Documentation index](README.md)
- [Repository overview](../README.md)
- [Architecture](ARCHITECTURE.md)
- [Frontend design](FRONTEND_DESIGN.md)
- [Sequence diagrams](SEQUENCE_DIAGRAMS.md)
- [Feature-to-code traceability](TRACEABILITY.md)
- [Known limitations](KNOWN_LIMITATIONS.md)
- [Proposed continuous-workspace change package](proposals/README.md)

## UX intent

The implemented interface supports one local hierarchical writing document at a time. Its primary loop is:

1. create or open a document;
2. create and arrange ideas in an outline;
3. refine one idea's metadata and body text;
4. inspect attributed history;
5. restore, export, back up, or close.

The standalone build emphasizes fast inspection and debugging. It is visibly labeled as volatile and omits desktop-only file actions. The Tauri build adds `.coedit` open/create, native export paths, and SQLite backup without changing the central editing workspace.

## Information architecture

```text
Coedit Local
├── Welcome
│   ├── contributor name
│   ├── document title
│   ├── create document
│   └── open .coedit file                 desktop only
└── Workspace
    ├── Header
    │   ├── document title
    │   ├── persistence status
    │   ├── history toggle and loaded count (+ when more exists)
    │   ├── export menu
    │   │   ├── Markdown
    │   │   ├── JSON recovery file
    │   │   └── SQLite backup             desktop only
    │   └── close
    ├── Outline
    │   ├── add root
    │   ├── select/collapse/expand
    │   ├── move/reparent
    │   ├── add child
    │   └── delete subtree
    ├── Editor
    │   ├── title
    │   ├── freeform tags
    │   └── rich-text body
    └── History                            optional panel
        ├── search
        ├── selected-idea filter
        ├── contribution metadata
        ├── load older contributions
        └── view revision (available host) / restore (host-deferred)
```

## UI state model

The state names below describe rendered states; they are not explicit TypeScript enum values.

```plantuml
@startuml
title User-interface states
hide empty description

[*] --> Welcome

state Welcome {
  [*] --> ReadyToCreate
  ReadyToCreate --> ChoosingCreatePath : Create [desktop]
  ChoosingCreatePath --> ReadyToCreate : cancel
  ReadyToCreate --> ChoosingOpenPath : Open [desktop]
  ChoosingOpenPath --> ReadyToCreate : cancel
}

Welcome --> Busy : create [standalone]
Welcome --> Busy : path selected [desktop]
Busy --> Welcome : error
Busy --> Workspace : document returned

state Workspace {
  [*] --> EmptyEditor
  EmptyEditor --> NodeSelected : add/select node
  NodeSelected --> EmptyEditor : selected node deleted / no active nodes
  NodeSelected --> HistoryOpen : History
  EmptyEditor --> HistoryOpen : History
  HistoryOpen --> NodeSelected : close history [node selected]
  HistoryOpen --> EmptyEditor : close history [no node]
  NodeSelected --> NodeSelected : metadata/content/tree operation
  HistoryOpen --> HistoryOpen : search/filter/view another revision
  HistoryOpen --> Historical : View [available host]
  Historical --> NodeSelected : Back to current
  Historical --> NodeSelected : confirmed Restore succeeds
  Historical --> HistoryOpen : History remains open
}

Workspace --> Busy : lifecycle/mutation/export request
Busy --> Workspace : success or error
Workspace --> Welcome : Close
@enduml
```

`App` renders orthogonal conditions owned by `useDocumentController` and the current view:

- `workspaceProjection.kind === "historical"` renders a persistent revision banner and static sanitized node detail; mutation/export controls are disabled while History navigation, Back, confirmed restore, and Close remain available.
- `view.readOnly` outside historical mode shows a newer-format warning and disables mutation controls.
- `view.recoveryWarning` shows a recovery warning.
- `busy` changes the status dot/text and disables selected controls.
- `error` shows a dismissible fixed error banner.
- `historyOpen` changes the wide layout from two columns to three.

## Current screen mockups

The mockups are schematic. Exact dimensions and colors come from `src/styles.css`.

### Welcome — standalone

```text
┌──────────────────────────────────────────────────────────────────────┐
│                                                                      │
│             ┌──────────────────────────────────────────┐             │
│             │  [ C ]                                   │             │
│             │  LOCAL-FIRST WRITING                     │             │
│             │                                          │             │
│             │  Ideas become structure.                 │             │
│             │  Structure becomes text.                 │             │
│             │                                          │             │
│             │  Create a private hierarchical document… │             │
│             │                                          │             │
│             │  ! Standalone HTML mode: documents are   │             │
│             │    kept in memory and disappear…         │             │
│             │                                          │             │
│             │  YOUR CONTRIBUTOR NAME                   │             │
│             │  [ Local author_______________________ ] │             │
│             │  DOCUMENT TITLE                          │             │
│             │  [ Untitled document__________________ ] │             │
│             │                                          │             │
│             │  [ Create document ]                     │             │
│             └──────────────────────────────────────────┘             │
│                                                                      │
└──────────────────────────────────────────────────────────────────────┘
```

Implementation: the standalone notice and absence of Open are selected by `controller.nativeFilesAvailable`, which derives from `documentGateway.storage.kind === "native-file"` rather than a Tauri/environment check in the component.

### Welcome — desktop difference

```text
Actions:  [ Create document ]  [ Open .coedit file ]
```

Implementation: both actions call `DocumentFileDialogs` before invoking the desktop gateway. Canceling a native dialog leaves the welcome screen unchanged.

### Main workspace

```text
┌──────────────────────────────────────────────────────────────────────────────┐
│ [C] Coedit │        Document title        │ ● All changes saved locally     │
│            │                              │ [History 12] [Export ▾] [Close] │
├────────────┴──────────────────────────────┴──────────────────────────────────┤
│ OUTLINE              │                                                       │
│          [+ Root idea]│ IDEA TITLE                                             │
│ ▾ Chapter one    ↑↓+× │ The opening                                            │
│   · Arrival      ↑↓+× │ TAGS [scene ×] [draft ×] [Add or select a tag…]       │
│   ▸ Discovery    ↑↓+× │                                                       │
│ ▸ Chapter two    ↑↓+× │ TEXT                                   grouped 1.2 s   │
│ Drag onto an idea…    │ [Bold][Italic][Heading][Bullets][Numbered][Quote]…    │
│                       │ ────────────────────────────────────────────────────  │
│                       │ Write and refine here…                                │
│                       │                                                       │
└───────────────────────┴───────────────────────────────────────────────────────┘
```

Implementation ownership:

- Header and workspace switching: `src/App.tsx`.
- Workspace/use-case state, sequencing, paging, and status: `src/application/useDocumentController.ts`.
- Outline and recursive rows: `src/components/Outline.tsx`.
- Metadata fields: `src/components/NodeEditor.tsx`.
- Tag tokens, suggestions, and freeform entry: `src/components/TagEditor.tsx` and `src/domain/tags.ts`.
- Node body and toolbar: `src/editor/RichTextEditor.tsx`.
- Layout and visual styling: `src/styles.css`.

### Workspace with history

```text
┌──────────────────┬──────────────────────────────────┬────────────────────────┐
│ OUTLINE          │ EDITOR                           │ IMMUTABLE LEDGER       ×│
│                  │                                  │ History                 │
│ ▾ Chapter one    │ The opening                      │ [Search contributions] │
│   · Arrival      │                                  │ [ ] Selected idea only │
│   ▸ Discovery    │                                  │ ────────────────────── │
│                  │ Text                             │ r12 Writing contribution│
│                  │                                  │ Local author · time    │
│                  │                                  │ 62bf…          [View]  │
│                  │                                  │ ────────────────────── │
│                  │                                  │ r11 Refined idea       │
└──────────────────┴──────────────────────────────────┴────────────────────────┘
```

Implementation: history is a third 340 px grid column on viewports wider than 900 px. The list is newest-first as returned by the gateway. Search and selected-node changes are debounced for 250 ms and sent to the adapter before pagination. A **Load older contributions** button appears when the current page reports `hasMore`.

On a host with revision queries, a row is labeled **Current**, **Loading…**, or **Viewing** as appropriate and other historical rows expose **View**. Host-deferred Tauri omits View and retains its row-level Restore fallback until WP-10.

### Historical workspace — standalone

```text
┌──────────────────────────────────────────────────────────────────────┐
│ Viewing revision 7 · Read only · current revision is 12             │
│                         [Back to current] [Restore as new revision…] │
├──────────────────────┬───────────────────────────────────────────────┤
│ HISTORICAL OUTLINE   │ Earlier idea title                            │
│ select/expand only   │ [research] [draft]                            │
│ no add/move/delete   │                                               │
│                      │ READ-ONLY TEXT                                │
│                      │ Sanitized static historical content…          │
└──────────────────────┴───────────────────────────────────────────────┘
```

Implementation: `App` unmounts `DocumentTitleInput` and `NodeEditor` in historical mode and renders plain document-title text plus `HistoricalNodeView`. The static renderer uses `sanitizeRichText` and mounts no form field, contenteditable region, toolbar, Tiptap/Yjs instance, timer, or draft participant. The banner is outside the scrolling workspace, announces both revisions through a polite status, makes **Back to current** primary, and explains the append/retention consequence before restore. Export cannot open and its actions are disabled; Outline mutation/drop paths are disabled while selection and disclosure remain local navigation.

### Narrow layout

```text
┌──────────────────────────────────────────────────────────┐
│ [C] │ Document title │ [History] [Export] [Close]       │
├──────────────────┬───────────────────────────────────────┤
│ OUTLINE 230 px   │ EDITOR                                │
│                  │                                       │
│ ▾ Chapter one    │ The opening                           │
│   · Arrival      │                                       │
│                  │ Text…                                 │
│                  │                                       │
│                  │              ┌───────────────────────┐│
│                  │              │ HISTORY OVERLAY      ×││
│                  │              │ Search / entries      ││
└──────────────────┴──────────────┴───────────────────────┴┘
```

Implementation: at `max-width: 900px`, the brand text and save-status text are hidden, the outline becomes 230 px, the editor narrows its margins, and history becomes a fixed right-side overlay of at most 360 px/90 viewport width. There is no smaller-screen pane switcher.

## Interaction specification

### Welcome and document lifecycle

| Action | Trigger | Implemented response | Code |
|---|---|---|---|
| Edit contributor name | Input change | Updates `profile`; an empty value becomes `Local author`; preference is written to local storage. | `loadContributor` and `App` in `src/App.tsx` |
| Edit initial title | Input change | Updates `newTitle`. | `src/App.tsx` |
| Create | Button click or Enter in document-title input | Standalone creates immediately; native-file hosts first ask for a `.coedit` path. Successful creation opens the workspace; History fetches its first page only when opened. | `controller.createDocument`, `src/App.tsx` |
| Open | Native-files button | Native `.coedit` selection followed by narrowed `storage.openDocument`; success opens workspace and marks history ready to load when opened. | `controller.openDocument`, `src/persistence/tauriFiles.ts` |
| Close | Header button | Synchronously freezes and awaits registered document-title, pending tag-input, node-metadata, and rich-text drafts; then queues gateway close and returns to welcome. A failed drain/close retains the workspace and dirty drafts and shows an error. | `controller.closeDocument`, `DraftTransitionCoordinator` |

### Header

| Control | Commit behavior | Notes |
|---|---|---|
| Document title | `renameDocument` on blur if changed | Replaced by static text in historical mode; otherwise disabled when `view.readOnly`. Empty/whitespace is normalized to `Untitled document` by domain logic. |
| Status | Shows transition, revision-loading, saving, or last-success text in that priority order | The dot pulses in the saving state. |
| History | Toggles panel | Count is the number currently loaded. A `+` suffix means another page is reachable; no suffix does not claim a separately queried lifetime total. |
| Export → Markdown | Immediate download in standalone; path dialog then write in desktop | Presentation/interchange export; disabled in historical/loading/read-only mode. |
| Export → JSON recovery file | Flush then immediate download in standalone; flush, path dialog, then write in desktop | Standalone emits the marked `coedit-recovery` version-2 envelope with hash and explicit history completeness. Desktop's legacy version-1 envelope lacks those fields and remains capped. Neither has an importer. Disabled outside an idle live workspace. |
| Export → SQLite backup | Desktop only | Uses a `.coedit-backup` save dialog. |

### Outline

| Action | Trigger | Result |
|---|---|---|
| Select | Click node title | Sets `selectedId`; editor displays that active node. |
| Expand/collapse | Disclosure button or left/right keyboard handling | Changes local `expanded` set only. |
| Add root | Outline header or empty-outline button | Dispatches `createNode` with `parentId: null`, empty `tags`, and title `New idea`. |
| Add child | Row plus button | Dispatches `createNode` under the row node. |
| Reorder | Up/down row buttons | Dispatches `moveNode` with same parent and adjacent sibling index. |
| Reparent | Drag one row and drop it onto another | Makes the dragged node the last child of the drop target. |
| Delete | Row × then confirmation | Dispatches `softDeleteNode`; domain logic also deletes active descendants. |

Deleted nodes do not appear in `buildTree()`. There is no current trash view or `restoreNode` control; whole-document revision restore is available from History.

### Node metadata

| Field | Local behavior | Persistence trigger |
|---|---|---|
| Title | Controlled local `title` state | Blur, when different from `node.title`. |
| Tags | Removable chips plus editable combobox; suggestions are distinct tags on active nodes | Enter, suggestion selection, removal, blur, or controlled-transition flush. |

Tags are optional and freeform. Input is Unicode-normalized, whitespace-collapsed, case-insensitively deduplicated, and limited to 20 tags per node and 64 code points/256 UTF-8 bytes per tag. New values grow the reusable document vocabulary; a value shrinks away when its last active-node use is removed or deleted. Selected tags are excluded from suggestions. Arrow keys navigate suggestions, Enter adds, Escape closes, and Backspace in an empty input removes the last tag. Each chip exposes an explicitly named removal button, and additions/removals are announced through a polite live region.

When the selected node or accepted metadata changes, the metadata component synchronizes clean local drafts from props.

### Node body

Tiptap commands apply immediately to the Yjs-backed editor. Yjs updates are grouped after 1.2 seconds without a new update, then HTML, an incremental Yjs update, and the complete Yjs state are committed together. Controlled node changes, document operations, restore, export, backup, and Close synchronously freeze and drain document title, node metadata, and the pending rich-text batch first. An authoritative restore increments the editor generation and remounts the selected editor even when its node ID is unchanged. The save hint tells the user about quiet-period grouping.

Pasted, legacy/fallback, and committed HTML use the centralized `coedit-rich-text-v1` tag/attribute policy in `src/editor/sanitizeRichText.ts`. Read-only mode disables toolbar buttons and makes Tiptap non-editable.

### History

| Action | Implemented behavior |
|---|---|
| Search | Case-insensitive substring match over operation type, contributor name, and message. |
| Selected idea only | Excludes contributions whose `affectedNodeIds` do not contain the current selected ID. Disabled when no node is selected. |
| Inspect | Shows revision, message/operation, contributor, localized time, and first 12 hash characters; full hash is the code element's title. |
| Load older contributions | Requests the next page using the exclusive `nextBeforeRevision` cursor and appends unseen entries. Shown only while `hasMore`. |
| View (available host) | Flushes live drafts, materializes the revision through the query capability, and swaps the selected detail to static historical content without changing live state or the ledger. |
| Current / Loading… / Viewing | Non-command row states distinguish the retained live revision, active query, and displayed materialization. Other View rows remain available during query loading so a newer request can supersede it. |
| Back to current | Banner action that invalidates a pending query if necessary and restores retained live state without a gateway call. |
| Restore as new revision… | Banner action with explicit confirmation that one new revision will be appended and later history retained. Success returns live; failure retains the historical view. |
| Restore (host-deferred) | Until native revision queries exist, Tauri retains confirmation followed by row-level `restoreRevision`. |

The current live revision is not viewable/restorable from its row. A materialization request has row-local loading state and may be superseded by choosing another revision; query failures preserve the exact live or historical origin and use the global error banner. Contribution-list loading/errors remain independent, so a committed mutation is not represented as failed solely because a visible-panel refresh failed.

## Keyboard behavior

### Implemented

- `Enter` in the welcome document-title field creates a document.
- Normal Tab/Shift+Tab browser order reaches form fields, buttons, details/summary, and the focusable outline navigation region.
- With an outline selection and a key event reaching the outline navigation:
  - `ArrowUp` selects the previous visible node;
  - `ArrowDown` selects the next visible node;
  - `ArrowRight` expands the selected node;
  - `ArrowLeft` collapses an expanded selected node, otherwise selects its parent.
- Arrow navigation prevents the browser's default scrolling behavior after it handles a supported key.
- Tiptap supplies editing and Yjs-backed undo/redo behavior; toolbar buttons expose Undo and Redo.
- `:focus-visible` gives buttons, inputs, textareas, selects, and focusable containers a two-pixel outline.

### Recommendation

- Add documented shortcuts only after resolving conflicts with editor/browser/platform conventions.
- Add a dedicated keyboard mechanism for reordering/reparenting, not only selection traversal.
- Move focus predictably when creating/deleting a node and when opening/closing History.
- Test the actual bubbling/focus behavior of outline arrow keys with screen readers and all interactive row controls.

## Accessibility inventory

### Implemented

- The outline is a `<nav aria-label="Document hierarchy">`.
- The rich editor surface has `aria-label="Node text"`.
- The formatting group has `role="toolbar"` and an accessible label.
- Disclosure buttons announce Collapse or Expand.
- History close has `aria-label="Close history"`.
- The document-title input has an accessible label.
- Native labels wrap the welcome, node metadata, and filter controls.
- Read-only controls are disabled rather than merely styled.
- Focus-visible styling has sufficient visual prominence against the light surface.

### Current gaps

- Formatting toggles visually use `.active` but do not expose `aria-pressed`.
- History search has a placeholder but no explicit label.
- Symbol-only row commands use visible symbols and `title`, but do not have explicit `aria-label` values.
- Status, warning, and error content do not declare live-region semantics.
- The history overlay does not trap focus or restore focus when closed.
- Drag-to-reparent has no equivalent fully featured keyboard command or announced drop state.
- Row actions are revealed by hover or selection, which is awkward for touch and some magnification workflows.
- The UI has no skip link or pane landmarks beyond the outline navigation and main editor.

### Recommendation

Treat accessibility changes as behavior changes: add component tests for names, roles, pressed/expanded state, focus movement, and disabled/read-only behavior. Verify with keyboard-only use and at least one desktop and one mobile screen reader before claiming conformance.

## Feedback, confirmation, and error behavior

### Implemented

- Controller `executeMutation()` clears the prior command error, tracks queued/running work with `busyCount`, catches gateway exceptions, and displays their messages; `runTransition()` also catches draft/transition failures.
- `SerializedTaskQueue` preserves command order and remains usable after a failed task.
- Successful actions replace the status string with a use-case-specific message.
- The busy state changes the header to a pulsing amber dot and `Saving…`.
- Standalone volatility, newer-format read-only state, and recovery warnings use persistent banners.
- Errors use a fixed dismissible banner near the top of the workspace.
- Delete and restore require `window.confirm`.
- Canceling a native file dialog is silent and non-destructive.

### Recommendation

- Give asynchronous status and error regions appropriate live-region behavior.
- Distinguish saving document mutations from exporting or opening instead of describing every busy operation as `Saving…`.
- Replace native confirmations only if a custom dialog also implements correct focus management and keyboard behavior.
- Add live-region semantics for the already separate history-refresh error and command-status channels.

## Visual system and CSS ownership

All current presentation is in `src/styles.css`; there is no component library or CSS-module boundary.

Root custom properties:

| Token | Current value | Use |
|---|---|---|
| `--ink` | `#24251f` | Primary text. |
| `--muted` | `#717267` | Secondary text. |
| `--paper` | `#fffefa` | Main surfaces. |
| `--line` | `#dcd9cd` | Borders and separators. |
| `--accent` | `#365d4d` | Brand, primary action, active state. |
| `--accent-soft` | `#e3ede7` | Selected/count background. |

Typography uses system sans-serif for application chrome and Georgia for editorial headings/content. The visual structure is a warm paper-like workspace with a green accent, compact outline controls, and a centered maximum-width editor column.

Important CSS ownership:

| Area/state | Selectors |
|---|---|
| Welcome | `.welcome-shell`, `.welcome-card`, `.welcome-actions`, `.standalone-notice` |
| Header | `.topbar`, `.brand`, `.document-title`, `.top-actions`, `.status`, `.menu` |
| Main layout | `.workspace`, `.workspace.with-history` |
| Outline | `.outline`, `.outline-row`, `.disclosure`, `.row-actions` |
| Node metadata | `.node-editor`, `.node-meta`, `.title-input` |
| Node tags | `.tags-field`, `.tag-editor`, `.tag-chip`, `.tag-options` |
| Rich text | `.rich-editor`, `.editor-toolbar`, `.editor-surface` |
| History | `.history-panel`, `.history-list`, `.history-copy` |
| Feedback | `.warning-banner`, `.error-banner`, `.saving` |
| Narrow layout | `@media (max-width: 900px)` |

## Responsive and touch behavior

### Implemented

- Wide layout: 300 px outline plus flexible editor; History adds a 340 px third column.
- At 900 px and below: 230 px outline plus editor; History overlays from the right.
- Editor content width is capped at 860 px and its side margins shrink at the breakpoint.
- Toolbar buttons wrap.

### Current gaps

- There is no phone-specific mode that switches between outline and editor.
- The outline remains fixed at 230 px on all viewports below 900 px.
- Hover-revealed row actions and HTML drag/drop are not a complete touch interaction.
- No safe-area-inset or virtual-keyboard-specific behavior is defined.

### Recommendation

Before describing iPadOS or phone support as complete, add a touch-first outline reordering design, pane navigation for narrow widths, safe-area handling, and manual coverage for software keyboard, selection, paste, download, and browser tab lifecycle.

## Workspace UX — partially implemented

The current information architecture, mockups, and interaction tables above describe the executable master/detail interface. The agreed product direction is specified in a separate resumable package:

WP-1 through WP-3 now provide the standalone historical slice beneath this section: verified memory materialization, explicit live/historical projections, origin/stale-request handling and command guards, View-first History rows, a sanitizer-backed static historical detail, and a persistent banner with **Back to current** plus separately confirmed restore. The current path still uses `Outline` plus one selected detail; continuous-canvas, navigator, responsive-drawer, and checkpoint UX below remain proposed.

- [Continuous block-outline](proposals/CONTINUOUS_BLOCK_OUTLINE.md): one scrolling projection, indented blocks, contextual controls, separate canvas-context/focus-region/editor-owner state, drain-before-hide collapse, one Tiptap editor, normal Tab navigation, handle-scoped structural shortcuts, live/historical reuse, and an optional navigation-only tree sidebar.
- [Query-first historical views](proposals/QUERY_FIRST_HISTORY.md): History **View** as the primary action, verified detached snapshots, origin-aware loading, persistent read-only revision banner, **Back to current**, and separately confirmed **Restore as new revision**.
- [Body checkpoint strategy](proposals/BODY_CHECKPOINT_STRATEGY.md): semantic insertion/deletion/cursor/focus/tree boundaries, bounded FIFO backpressure, page-aware grouped checkpoints, and centralized configurable `batchCharacterThreshold`/`idleTimeoutMs` defaults.

The optional navigator defaults closed and is a runtime visibility preference, not an editing mode. Where available container width preserves the canvas minimum, it docks beside the canvas; at compact/touch widths it becomes an explicitly opened drawer that is mutually exclusive with a History drawer. A saved dock preference never auto-opens that modal; History has a separate page-session dock request, and compact drawers use one transient active-panel state. Effective History visibility is derived from those layout states: its first reveal without a valid page queries once, hide/reveal with a valid non-stale page is silent, relevant accepted changes while hidden advance a data generation and mark it stale, and the next reveal performs one guarded refresh while older responses are rejected. Navigator rows browse/reveal blocks from the active live or historical projection, while an explicit **Focus in document** action transfers focus to the canvas through the same safety boundary as any cross-block transition. Navigator expansion never hides canvas content, arrow-key browsing never changes canvas context or editor ownership, and the panel contains no body/metadata editor or structural mutation controls. Successful drawer activation closes and focuses the target; failure keeps the row available. A breakpoint-forced departure from a dirty body captures exactly one ordinary checkpoint, while outside-app focus is never pulled back. Manual closing returns focus to its toggle, and historical mode keeps the navigator read-only and sourced from the historical snapshot. Restore expands any changed required ancestry before mounting a surviving editor-resume target, so no hidden block owns the editor.

The proposal documents contain target wireframes, state/sequence diagrams, interaction contracts, accessibility requirements, failure behavior, rollout steps, and acceptance criteria. The versioned browser preference may remember preferred Navigator dock visibility; the page-session History dock request, navigator selection/expansion, compact drawer visibility, one-shot resume candidate, and that preference are presentation state excluded from `.coedit`, document hashes, snapshots, History, and exports. Do not replace the current mockups in this as-built document until the corresponding UI is reachable and tested.

## UX extension guide

### Add a workspace panel

1. Decide whether the panel is mutually exclusive, overlay, or another persistent column.
2. Keep document/use-case state in `useDocumentController` when it affects persistence or sibling components; keep purely presentational panel state local when possible.
3. Add a clear accessible name, focus entry/return behavior, empty/loading/error states, and a narrow-layout behavior.
4. Update `.workspace` grid rules and the 900 px media query.
5. Add the corresponding sequence and state transitions to [Sequence diagrams](SEQUENCE_DIAGRAMS.md) and this document.

### Add an outline command

1. Add a callback to `OutlineProps` and pass it through `OutlineRow` only if row-scoped.
2. Dispatch an attributed operation through `useDocumentController`; do not mutate `view.nodes` in the component.
3. Define mouse, keyboard, and touch triggers together.
4. Specify selection/focus after success and behavior during `readOnly`/`busy`.
5. Add domain tests for hierarchy invariants and component tests for interaction semantics.

### Add editor toolbar functionality

1. Add the Tiptap extension and command in `RichTextEditor.tsx`.
2. Expose toggle state with both styling and `aria-pressed` where appropriate.
3. Keep browser and Rust sanitization policies aligned.
4. Test keyboard editing, paste, undo/redo, state reload, read-only mode, and exports.

### Change save behavior

The current save boundary is eager title/tag drains plus the 1.2-second Yjs body quiet period, all backed by an explicit controller-visible draft registry. Controlled node switching, operations, revision restoration, document close, export, and backup freeze and await document-title, tag-input, node-metadata, and rich-text participants; page/process exit and forced suspension remain unawaitable. Changes must cover failure/retry, updates arriving during a drain, authoritative editor remount, status feedback, and both gateway implementations. See [Sequence diagrams](SEQUENCE_DIAGRAMS.md).

The intended replacement is the proposed [body checkpoint and commit strategy](proposals/BODY_CHECKPOINT_STRATEGY.md). Its policy requires both `batchCharacterThreshold` and `idleTimeoutMs` to be easily modifiable in one injectable code module; implementation must retain the existing controlled-transition safety while replacing the timer behavior.

## UX acceptance checklist

**Recommendation:** every user-visible contribution should be checked in these states:

- standalone and Tauri composition;
- new/empty and populated document;
- selected and unselected node;
- writable, busy, and read-only;
- History closed and open;
- wide and ≤900 px viewport;
- pointer, keyboard-only, and touch where claimed;
- normal result, cancel, validation failure, and gateway failure;
- long title/content, deep hierarchy, and long contribution list;
- focus visibility, accessible name, announced state, and logical focus destination.

Record implementation ownership in [Traceability](TRACEABILITY.md) and unresolved behavior in [Known limitations](KNOWN_LIMITATIONS.md).
