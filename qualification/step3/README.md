# Step 3 editor and clipboard qualification

This harness qualifies both carrier candidates through the same flat editor schema and transaction bridge. It does not implement the selected production carrier or select Gate B winners.

Run `npm run qualify:step3:headless` for private clipboard validation and fallback tests. The guard values in those tests exercise configurable failure boundaries; they do not select document limits or production resource guards.

Run `npm exec -- playwright install chromium` once, then `npm run qualify:step3:browser` for Chromium editor qualification. Browser reports and measurement samples are written to `artifacts/step3`.

The editor boundary pins `@tiptap/core` and `@tiptap/pm` 3.30.5. External HTML sanitization uses `dompurify` 3.4.14. Browser verification uses development-only `@playwright/test` 1.62.1 and `@types/node` 24.10.1. Both carriers use the same fixtures. Automerge uses its official base64 WebAssembly entrypoint in Vite.

The private fragment codec is qualification-only. Same-document Origin preservation requires a matching document and a conflict-free Origin catalog. Invalid private data retains sanitized HTML and plain-text fallback. The following evidence and decision change selects resource guards from profiling and records Gate B.
