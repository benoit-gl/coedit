# Coedit Local

Coedit Local is a portable, local-first hierarchical writing application. It turns ideas into nested structure and final text while preserving an append-only, attributable contribution history through application workflows.

This is a new implementation inspired by TreeWriter's interaction model. It does not use TreeWriter's backend, Supabase project, MongoDB services, proxy, email integration, or remote scripts.

## Current MVP

- Tagged idea hierarchy with root and child nodes
- Optional freeform node tags with document-local reusable suggestions
- Keyboard navigation, sibling reordering, drag-to-reparent, and soft deletion
- One rich-text body per node, edited with Tiptap and backed by Yjs updates
- Contributor, writing-session, revision, operation, and state-hash attribution
- Cursor-paged, adapter-filtered history, standalone read-only historical viewing, and restoration through compensating contributions
- Portable `.coedit` SQLite document files
- Versioned standalone JSON recovery envelopes, Markdown export, and desktop SQLite backup
- Strict offline content-security policy and sanitization in both UI and persistence layers
- Self-contained, double-clickable HTML5 build with an in-memory document backend

The shared UI delegates use-case orchestration to `useDocumentController`. It serializes document commands, synchronously freezes and drains registered title/metadata/rich-text drafts before controlled lifecycle transitions, remounts editor state after authoritative restores, rejects stale view/history responses, narrows discriminated storage/revision-query capabilities, and owns an explicit live/historical projection with retained origins and command guards. In standalone mode, History exposes non-mutating **View**, a static sanitized historical workspace, persistent revision banner, **Back to current**, and separately confirmed compensating restore. Native historical queries remain host-deferred.

AI and real-time synchronization are intentionally not connected. The provider interface exists so they can be added later without bypassing contribution history.

## Development prerequisites

- Node.js 24
- Corepack
- Rust 1.90 with Cargo
- Platform-specific [Tauri prerequisites](https://v2.tauri.app/start/prerequisites/)

The repository pins pnpm and Rust versions. JavaScript install scripts are disabled in `.npmrc`.

```powershell
corepack pnpm install --frozen-lockfile
corepack pnpm test
```

For the standalone HTML application:

```powershell
corepack pnpm build
```

Then double-click `dist/index.html`. The generated file contains the UI, editor, styles, CSP, and in-memory gateway; it does not require Tauri or a local server. Its working document disappears when the page closes, so export the marked `coedit-recovery` version-2 JSON envelope or Markdown before leaving. JSON includes the current portable state and the complete contribution ledger accumulated during that in-memory session, but there is not yet a JSON import workflow.

For the persistent desktop application:

```powershell
corepack pnpm tauri:dev
corepack pnpm tauri:build
```

The Tauri build embeds a separate frontend entry and uses the Rust/SQLite backend. Use `tauri:build`, not a raw `cargo build --release`, for a distributable application.

Do not use `--no-frozen-lockfile` for routine development. Review changes to `pnpm-lock.yaml` and `src-tauri/Cargo.lock` before accepting dependency updates.

## Offline guarantee

The base application registers no HTTP client or synchronization provider. The standalone CSP denies all connections. The desktop production CSP permits Tauri IPC but denies ordinary network connections, frames, remote images, and remote scripts. File dialogs are the only enabled Tauri plugin capability.

The Vite development server binds only to `127.0.0.1`; production artifacts do not start or require it. The standalone application stores documents only in memory and is clearly labeled as non-persistent.

## Documentation

Start with the [engineering documentation index](./docs/README.md). It routes contributors through:

- RUP vision, actors, user stories, use cases, and supplementary requirements;
- 4+1 architecture, frontend and persistence design, class/component/data diagrams, and sequence realizations;
- UI/UX states and wireframes;
- feature-to-file traceability, extension recipes, tests, build/release portability, and known limitations;
- the `.coedit` format/recovery and security specifications.

Future work on the continuous block-outline workspace, its optional navigation-only tree sidebar, native historical-query parity, and configurable body checkpoint grouping starts at the [continuous-workspace change package](./docs/proposals/README.md). Standalone historical viewing is already reachable through the current master/detail workspace; the future sidebar is an auxiliary view of one continuous canvas, not a return to that layout.

The [original architecture plan](./LOCAL_FIRST_TREE_EDITOR_PLAN.md) remains a roadmap artifact. Where it differs from the current engineering documentation or executable code, the latter describe the current implementation.
