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
They exercise direct multi-member spans, greedy and positional boundaries, deletion, movement, split/merge mappings,
whole-payload invalidation, lazy reload resolution, and retained-Range scaling construction. Step 8 measures the landed
scaling fixture under its shared comparison profile.

Payload-effect evidence retains complete same-type and cross-type replacement alternatives, their causal observations,
and each fine-grained edit's base derived from candidate-native payload branch state. It supports comparison of deferred
winner and mixed replacement/edit policies without selecting either policy. Actor/effect contexts use the actor/effect
pair as the replicated identity. Each contextual change reserves one immutable authored envelope (a fresh authoring
nonce plus its structural, payload, or restore semantics): distinct actors may share an effect component, while
conflicting reuse of a pair is rejected before a merge can combine or discard evidence. Contexts also retain copy or
restore source references without becoming Contributions, Versions, or History.

Yjs uses its pinned native automatic garbage-collection setting during ordinary updates. The fixtures confirm that this
does not destroy retained qualification state, Range evidence, or replacement evidence after reopen. Pinned Automerge
does not expose a native garbage-collection or compaction operation; its save/load path is qualified as reload only and
is not presented as a synthetic compactor. Neither result defines production compaction behavior.

This directory does not yet qualify carrier cursor behavior, Tiptap/ProseMirror integration, IME,
cut/paste, undo/redo, private clipboard behavior, or a `.coedit` portable-format contract. Application/editor
qualification and comparative evidence follow before Gate B.
