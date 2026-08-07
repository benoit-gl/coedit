# Coedit Local

Coedit Local is a portable, local-first hierarchical writing application. It turns ideas into nested structure and final text while preserving an immutable, attributable contribution history.

This is a new implementation inspired by TreeWriter's interaction model. It does not use TreeWriter's backend, Supabase project, MongoDB services, proxy, email integration, or remote scripts.

## Current MVP

- Typed idea hierarchy with root and child nodes
- Keyboard navigation, sibling reordering, drag-to-reparent, and soft deletion
- Tiptap rich-text editing backed by Yjs updates
- Contributor, writing-session, revision, operation, and state-hash attribution
- Searchable history and restoration through compensating contributions
- Portable `.coedit` SQLite document files
- JSON recovery, Markdown export, and SQLite backup
- Strict offline content-security policy and sanitization in both UI and persistence layers
- Browser-only in-memory preview for UI development

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
corepack pnpm build
corepack pnpm tauri:dev
```

Do not use `--no-frozen-lockfile` for routine development. Review changes to `pnpm-lock.yaml` and `src-tauri/Cargo.lock` before accepting dependency updates.

## Offline guarantee

The base application registers no HTTP client or synchronization provider. The production CSP permits Tauri IPC but denies ordinary network connections, frames, remote images, and remote scripts. File dialogs are the only enabled Tauri plugin capability.

The Vite development server binds only to `127.0.0.1`. The browser preview stores documents only in memory and is clearly labeled as non-persistent.

## Documentation

- [Architecture plan](./LOCAL_FIRST_TREE_EDITOR_PLAN.md)
- [Document format and recovery](./docs/DOCUMENT_FORMAT.md)
- [Security model](./docs/SECURITY.md)
