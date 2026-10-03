# Step 3 integrated structural and payload semantics qualification

This directory contains the integrated Step 3 qualification adapters, one per candidate and backed by one native Yjs or
Automerge document. The focused structural adapters remain unchanged. The foundation also tightens focused payload
adapters' UTF-16 splice validation and Yjs exact-string validation so the focused and integrated qualification surfaces
enforce the same exact-or-atomic-reject text domain.

The common suite qualifies one all-or-none change across structural placement, immutable Block-local InlineContent
creation, allowlisted fine-grained text, and opaque payloads. It also qualifies per-Block liveness effects, an atomic
application-selected BlockId deletion list, update-over-delete for real payload changes, and projection of surviving
children without re-parenting operations. Snapshots expose only live placements and their owned payloads.

This directory does not yet qualify History or Range feasibility, carrier cursor behavior, Tiptap/ProseMirror
integration, IME, cut/paste, undo/redo, private clipboard behavior, portable-format surrogates, or garbage collection
and compaction. Separate carrier-lifecycle and application/editor qualification units follow before comparative
evidence and Gate B.
