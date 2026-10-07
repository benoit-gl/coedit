# Step 3 integrated structural and payload semantics qualification

This directory contains the integrated Step 3 qualification adapters, one per candidate and backed by one native Yjs or
Automerge document. The focused structural adapters remain unchanged. The foundation also tightens focused payload
adapters' UTF-16 splice validation and Yjs exact-string validation so the focused and integrated qualification surfaces
enforce the same exact-or-atomic-reject text domain.

The common suite qualifies one all-or-none change across structural placement, immutable Block-local InlineContent
creation, allowlisted fine-grained text, and opaque payloads. It also qualifies per-Block liveness effects, an atomic
application-selected BlockId deletion list, update-over-delete for real payload changes, and projection of surviving
children without re-parenting operations. Snapshots expose only live placements and their owned payloads.

The historical lifecycle suite retains qualification-only state tokens in each candidate document. It materializes
captured state without changing the tip and restores the same Block and InlineContent lifetimes in one native change.
Ordinary creation rejects a known-dead Block ID or retained InlineContent ID. Retained state survives candidate reopen.
These tokens are not product Versions or a selected History representation.

The common suite enforces the global durable-ID rule for locally submitted changes. It does not yet define a replicated
conflict-resolution policy for a concurrent Block and InlineContent UUID collision. Revisit that case if a later
consumer needs an untyped durable-ID lookup.

The retained-state merge unit adds private Range-feasibility probes and replicated actor/effect and payload replacement
evidence. The probes use fixture-supplied structural lineage and do not select product Range or Version representations.
Native lifecycle, mixed replacement/edit behavior, and advanced lineage scenarios remain subject to qualification
evidence.

This directory does not yet qualify carrier cursor behavior, Tiptap/ProseMirror integration, IME,
cut/paste, undo/redo, private clipboard behavior, portable-format surrogates, or garbage collection and compaction.
Application/editor qualification and comparative evidence follow before Gate B.
