# UI and UX specification

This document records the current reachable interface. Proposed navigation-shell behavior is kept in `docs/proposals` and is explicitly marked there as future work.

## Current information architecture

```text
Coedit Local
├── Welcome
│   ├── contributor name
│   ├── document title
│   ├── create document
│   └── open .coedit                 desktop only
└── Workspace
    ├── Header
    │   ├── document title
    │   ├── persistence/status
    │   ├── History toggle + raw loaded count
    │   ├── export/backup actions
    │   └── close
    ├── Continuous document canvas
    │   └── visible NodeBlock rows
    │       ├── disclosure/depth
    │       ├── title/tags          live only
    │       ├── sanitized body preview
    │       ├── one transferable rich-text editor owner
    │       └── structural actions live only
    └── History panel               optional
        ├── search and selected-node filter
        ├── raw contribution count + visible row count
        ├── ordinary contribution rows
        └── collapsed semantic body-edit groups
```

The former outline-plus-selected-editor master/detail layout is retired. `DocumentCanvas` is the only document editing surface.

## Continuous canvas behavior

Nodes are displayed in visible pre-order with indentation and disclosure. Deleted nodes are absent. A collapsed parent remains visible while descendants are hidden.

Exactly one live node may own `RichTextEditor`. Other live nodes show sanitized body previews and an **Edit body** action. Transferring or hiding the editor owner first freezes and drains pending drafts; failure cancels the transition and leaves the old owner available for retry.

Historical mode uses the same canvas but is read-only: no title/tag inputs, rich-text editor, toolbar, create/move/delete actions, or draft participants are mounted. Local disclosure remains available.

## Keyboard and focus contract

These bindings are current interaction behavior, not incidental implementation details. Structural shortcuts are scoped to block controls so they do not steal normal rich-text editing keys.

| Context | Input | Required behavior |
|---|---|---|
| Block title | plain `Enter` | Create a following sibling. Modified Enter or IME-composition Enter does not take this title shortcut. |
| Any live block | `Mod+Enter` | Create a following sibling. |
| Any live block | `Mod+Shift+Enter` | Create the last child. |
| Block handle or disclosure | `ArrowUp` / `ArrowDown` | Focus the previous / next visible block control. |
| Disclosure | `ArrowLeft` | Collapse an expanded block; otherwise focus its visible parent. |
| Disclosure | `ArrowRight` | Expand a collapsed block; otherwise focus its first visible child. |
| Block handle | `Alt+Shift+ArrowUp/Down` | Move the block up/down among siblings. |
| Block handle | `Alt+Shift+ArrowRight/Left` | Indent / outdent the block. |
| Block handle | `Delete` | Invoke the confirmed subtree-delete action. Text-editor Delete remains text editing. |
| Inline block control | `Escape` | Return focus to that block's structural handle without discarding drafts. |
| General navigation | `Tab` / `Shift+Tab` | Follow native DOM focus order; there is no structural Tab override. |

Handled structural keys prevent their ordinary browser action only when a structural command is actually recognized. Structural key handling is suppressed during IME composition. Tiptap retains ownership of rich-text editing behavior, including its Yjs-backed undo/redo commands.

The **Edit body** action is the explicit cross-block editor-ownership transfer. A successful transfer drains the old owner before focusing/mounting the new editor; a failed drain leaves the old owner in place.

## History behavior

History is backed by immutable physical contribution rows but presents body checkpoint groups semantically.

### Raw versus visible counts

The header count reports raw contributions loaded, with `+` when older raw pages remain. Inside History, the UI separately reports:

- raw contributions loaded; and
- visible History rows after semantic grouping.

These counts intentionally differ when body checkpoints collapse.

### Grouping rule

Only contiguous `updateBody` contributions with the same non-null `groupId` collapse into one row. A non-body contribution, null group, or different group ends the run.

The collapsed row:

- uses the newest/final checkpoint as its canonical revision;
- shows a revision range when multiple checkpoints are loaded;
- reports the checkpoint count;
- exposes **Expand/Collapse**;
- uses the canonical checkpoint for the top-level View/Restore state.

Expanded groups expose each exact checkpoint revision and its individual View/Restore action as permitted by the host.

### Page-spanning groups

History pages raw contributions. When older pages are loaded, the full accumulated raw list is reprojected, so a group split across an ordinary page boundary becomes one row.

If the oldest currently loaded group may continue into unloaded History, the row is marked partial and reports `at least N safety checkpoints` plus an explicit notice that older checkpoints are not loaded.

On standalone, expanding such a row performs an exact `groupId` query across the complete in-memory ledger and updates the row to an exact count/range. On Tauri, exact group queries are host-deferred; expansion shows loaded checkpoints plus a visible message that full expansion is unavailable in this host.

Ordinary search/node filtering does not constrain exact group expansion: once a user explicitly expands a known group, the UI asks for that group's physical members.

### Revision actions

Standalone has revision materialization queries, so History exposes **View**. The current revision is labeled **Current**, the active historical revision **Viewing**, and a pending request **Loading…**. Viewing never mutates the ledger.

Tauri revision queries are still host-deferred, so it temporarily retains row-level **Restore** instead of pretending View is available. Native View and exact group expansion belong to WP-10.

## Historical banner

Historical mode keeps a persistent banner outside the scrolling canvas:

```text
Viewing revision R · Read only · current revision is C
[Back to current] [Restore as new revision…]
```

Back is non-mutating and returns to the retained live projection. Restore requires confirmation and appends one compensating live revision while preserving later history.

## Rich-text checkpoint UX

Body edits remain local until semantic/threshold/idle boundaries. The editor captures sanitized HTML plus Yjs state/update and persists checkpoints in order. Slow or failed persistence can freeze further body changes at the bounded queue limit and exposes a retry state.

Users should think in writing episodes, not physical safety checkpoints. WP-5's grouped History is the presentation layer that makes that distinction visible.

## Responsive behavior

At widths at or below the current 900 px breakpoint, History becomes a fixed right-side overlay. The canvas remains the same continuous document surface. There is no separate narrow-screen outline/editor mode.

The optional Navigator/History modal-drawer shell described in `docs/proposals/CONTINUOUS_BLOCK_OUTLINE.md` is not yet implemented.

## Accessibility and interaction status

Current canvas structure has named keyboard alternatives for core hierarchy actions and explicit focus handling, but full browser/screen-reader/touch qualification is still incomplete.

Current concrete gaps include:

- formatting toggles show active state visually but do not expose `aria-pressed`;
- History search relies on placeholder text rather than an explicit accessible label;
- the compact History overlay has no complete modal focus-trap/focus-return contract;
- hover/focus-dependent action discoverability and drag/reparent behavior remain weakly qualified for touch/magnification;
- there is no full real-browser screen-reader, touch, or accessibility-engine qualification suite.

Do not describe WP-8 as complete until those behaviors have been qualified on real browser/assistive-technology paths.

## Presentation-only state

Canvas disclosure/context, History filters/pages/group expansion, viewed/loading indicators, future navigator state, and current focus are UI/application state. They do not belong in `.coedit`, document hashes, snapshots, contribution payloads, recovery JSON, or Markdown.
