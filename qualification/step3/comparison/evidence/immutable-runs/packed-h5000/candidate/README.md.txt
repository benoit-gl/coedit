# Post-measurement review fixes

This directory contains the corrected candidate and focused tests. The measured H500 implementation at `../packed-store.mjs`, its runtime/harness, all original H500 outputs and `../artifacts-manifest.json` are unchanged. These fixes are **post-measurement** and no H500 performance/memory result has been rerun or assigned to the corrected implementation.

- `packed-store.mjs` uses one width validator in its constructor, `create`, `load`, and defensive append entry. Only 1 and 64 are accepted. Invalid load width 0/negative previously reached a non-advancing append loop; it now throws synchronously. The append guard also rejects mutation of the scratch instance's public width field.
- `correctness.mjs` checks nine invalid widths through create/load/direct construction/defensive append. Its malformed concurrent scalar test now actually checks both cold-load rejection **and merge rejection with byte-for-byte accepted-state preservation**. The identical-scalar case is accurately named as an accepted native no-op.
- `runtime.mjs` now refuses unequal canonical bodies with the same logical UUID during source extraction; a hostile duplicate-body extraction fixture verifies rejection.

Final result: 14 focused cases pass in `correctness16-with-extractor.json`. Exact command:

```sh
node /workspace/work/merge10-packed-prototype/post-review-fix/correctness.mjs /workspace/work/merge10-packed-prototype/history16.json /workspace/work/merge10-packed-prototype/post-review-fix/correctness16-with-extractor.json
```

The earlier `correctness16.json` here records the 13-case checkpoint before the additional source-extractor test. Neither run is a performance measurement. Root-level H16/H500 results remain historical evidence of their pinned code bytes. Future experimentation should explicitly import this directory's fixed `runtime.mjs`.
