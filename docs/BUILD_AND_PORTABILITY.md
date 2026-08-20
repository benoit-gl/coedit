# Build, release, and portability

Coedit has two intentional frontend outputs: a self-contained standalone HTML artifact and a Tauri desktop application.

## Build matrix

| Goal | Command | Composition | Persistence |
|---|---|---|---|
| Browser development | `corepack pnpm dev` | `index.html` / `src/main.tsx` | memory |
| Standalone artifact | `corepack pnpm build` | generated `dist/index.html` | memory |
| Tauri frontend | `corepack pnpm build:tauri` | `tauri.html` / `src/main-tauri.tsx` | Tauri adapter when hosted |
| Desktop development | `corepack pnpm tauri:dev` | Tauri + Vite | SQLite |
| Desktop package | `corepack pnpm tauri:build` | packaged Tauri frontend + Rust | SQLite |

Prerequisites: Node 24, Corepack, Rust 1.90/Cargo, and platform-specific Tauri 2 prerequisites.

## Standalone artifact

`corepack pnpm build` runs TypeScript compilation plus the standalone Vite build. The custom inliner requires a single self-contained `dist/index.html`, embeds generated JavaScript/CSS, inserts a script CSP hash, and rejects unexpected external build assets.

The standalone application uses `MemoryDocumentGateway`. It cannot open `.coedit` files and loses the working document on reload/close. Export recovery JSON or Markdown before leaving anything worth preserving.

Useful smoke coverage now includes grouped History:

1. create/edit a document;
2. create enough body work to produce multiple checkpoints in one semantic group;
3. open History and verify raw/visible counts and one collapsed group row;
4. expand it and verify exact checkpoints;
5. with a long fixture, load older raw pages and verify page-spanning groups merge;
6. View/Back an older revision without adding a contribution;
7. Restore and verify one compensating revision;
8. export recovery JSON before closing.

## Desktop artifact

Use `corepack pnpm tauri:build` for a distributable package. A raw `cargo build --release` is not equivalent because it does not guarantee the correct frontend was built/embedded.

The desktop host persists `.coedit` SQLite files and exposes native create/open/export/backup dialogs. The current TypeScript adapter compiles against the shared capability contracts, but native historical materialization and exact contribution-group queries remain host-deferred until WP-10.

## Responsive layout

The primary workspace is the continuous `DocumentCanvas`; the former outline-plus-detail layout is gone.

At the current narrow breakpoint, the canvas remains the same document surface and History becomes a fixed right-side overlay. There is no separate narrow-screen outline/editor mode.

The optional navigation-only sidebar and the proposed deterministic compact Navigator/History drawer shell are future WP-7A/WP-8 work.

## Portability status

| Target | Standalone | Native/Tauri |
|---|---|---|
| Windows | implemented and manually exercised | primary intended desktop target; release smoke still required per change |
| Linux desktop | source-portable, unverified | architecturally portable, unverified |
| macOS desktop | source-portable, unverified | architecturally portable, unverified |
| iPadOS browser | experimental/unsupported | n/a |
| iPadOS native | n/a | not implemented |

Configured build targets are not support evidence. Claim a platform only after building and smoking the actual artifact there.

## Current release gaps

There is no repository CI or automated multi-platform release matrix. Important remaining evidence includes:

- browser E2E with real Tiptap/Yjs;
- accessibility/touch qualification;
- native IPC and package E2E;
- Rust/TypeScript protocol parity;
- migrations/old-format fixtures;
- long-history SQL behavior;
- platform-native package verification.

## Release checklist

Before calling a change releasable:

1. install from frozen lockfiles;
2. run the TypeScript/Rust commands in [Testing](./TESTING.md);
3. build and double-click the standalone artifact;
4. smoke continuous-canvas editing, grouped History, View/Back/Restore and exports;
5. build `tauri:build` on every claimed native platform;
6. create/close/reopen/edit/restore/export/backup a desktop document;
7. verify the production artifact does not attempt ordinary outbound network access;
8. inspect CSP/capability/dependency changes;
9. review format/migration/recovery implications;
10. update [Known limitations](./KNOWN_LIMITATIONS.md) and [Traceability](./TRACEABILITY.md);
11. record platform/tool/browser versions and skipped checks.

Do not upgrade `host-deferred`, `unverified`, or `proposed` behavior to supported based only on source compatibility.
