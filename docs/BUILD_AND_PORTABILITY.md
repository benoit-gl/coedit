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

## Artifact contracts

The build commands above are not interchangeable evidence.

### Standalone

`corepack pnpm build` must produce a self-contained `dist/index.html` that can be opened directly through `file://`. The standalone build contract is:

- generated JavaScript and CSS are inlined into the one distributable HTML artifact;
- the build rejects unexpected external application assets/imports rather than silently producing a server-dependent bundle;
- the generated CSP permits only the local resources required by the artifact and denies ordinary network connections (`connect-src 'none'`);
- the runtime composition is `src/main.tsx` + `MemoryDocumentGateway` and has no Tauri IPC or native file capability;
- source-root `index.html` is a Vite development entry, not the distributable artifact.

### Tauri

`corepack pnpm build:tauri` builds the frontend intended to run inside Tauri. It is not a standalone browser artifact and may rely on Tauri IPC. `corepack pnpm tauri:build` is the release/package evidence because it runs the Tauri frontend build and native Rust/package pipeline together.

A raw `cargo build --release` is not equivalent: it does not prove that the correct frontend composition was built and embedded.

### Development topology

`corepack pnpm dev` and `corepack pnpm tauri:dev` intentionally use Vite on loopback for development/hot reload. Production Coedit does not use a local HTTP application server. A release artifact that attempts to load `127.0.0.1` is misbuilt.

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

### Platform qualification constraints

These are durable constraints behind the table rather than claims of current support:

- **Standalone/browser:** verify `file://` launch, Web Crypto/random APIs, Blob/download behavior, Tiptap/ProseMirror/Yjs interaction, CSP behavior, and any browser version named in support claims. A transpilation target is not runtime qualification.
- **Linux native:** build on the target distro family and verify required WebKit/system libraries, dialogs, Unicode/space paths, packaging format and display-server behavior as applicable.
- **macOS native:** build on macOS and verify WebView/dialog/path behavior plus signing/notarization/release assumptions before distribution claims.
- **iPadOS/browser:** treat as a separate qualification project. Files/Safari launch semantics, downloads/import absence, touch interactions, dynamic viewport/software keyboard, safe areas, IME, scrolling/reveal and assistive technology require real-device evidence.
- **iPadOS native:** requires a deliberate mobile host/document-picker/security-scoped-access design; desktop path-string assumptions are not a native iPad file model.

## Current release gaps

There is no repository CI or automated multi-platform release matrix. Important remaining evidence includes:

- browser E2E with real Tiptap/Yjs;
- accessibility/touch qualification;
- native IPC and package E2E;
- Rust/TypeScript protocol parity;
- migrations/old-format fixtures;
- long-history SQL behavior;
- platform-native package verification.

## Operational troubleshooting

These checks preserve topology knowledge that is easy to lose during build refactors.

| Symptom | Likely cause | Correct action |
|---|---|---|
| Browser/native window tries `127.0.0.1` and fails | Development entry/configuration was launched as though it were a release artifact | For browser use, rebuild/open generated `dist/index.html`; for desktop release, use `tauri:build`; use loopback only via `dev`/`tauri:dev`. |
| Direct browser launch shows source/module CORS errors | Source-root `index.html` or non-inlined output was opened instead of the generated standalone artifact | Open only generated `dist/index.html` for serverless standalone use; a successful standalone build should not depend on external application JS chunks. |
| `tauri.html` opens but document commands fail in a normal browser | The Tauri frontend was launched without the Tauri IPC host | Use the standalone entry in a browser or launch the frontend through Tauri. |
| Standalone has no Open/SQLite backup | Expected volatile-host capability boundary | Export JSON/Markdown before closing; do not add rejecting native stubs or runtime host probing to “fix” this. |
| Raw Cargo release behaves unlike packaged app | Native binary was built without proving the correct frontend/package integration | Use `corepack pnpm tauri:build` for distributable/release evidence. |

If a build-system change alters any row above, update the artifact contract and qualification tests in the same change rather than treating the symptom as local setup trivia.

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
