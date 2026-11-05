# Admission and boundary qualification profile

This bounded experiment compares the existing integrated Yjs and Automerge candidates and their payload-only raw
media adapters. It selects no carrier, production admission policy, clipboard limit or Step 4 codec. Run
`node scripts/step3-admission-boundary.mjs OUTPUT.json` on a quiet host. Set `STEP3_ADMISSION_SMOKE=1` only for a
short fixture check, not comparative evidence. The runner checkpoints completed rows and records its head, dirty
status, host, dependencies, errors and completion status. The Actions job retains its output, including partial
output on failure, and separately identifies its PR head and checked-out revision.

The main workload pairs candidates with alternating order, one warmup and three samples. It starts from text of
1,024, 16,384 or 65,536 UTF-16 units in one or eight Origin runs, then applies one or eight full replacements of
either text or opaque bytes of the corresponding size. It reports copying, a UTF-8 encode-and-decode interval for
text (an additional byte copy for opaque), integrated publication, and state encoding separately. Input construction,
setup, snapshot verification and reload are outside the reported intervals. String `slice` need not copy its backing
storage. Repeated operations are in one transaction; these results are not equivalent to independent transactions.
Three samples are descriptive, not tail estimates or resource limits.

Fixed, adaptive and operation-specific guards are small deterministic fixture functions evaluated before publication;
they refuse one deliberately oversized request with explicit errors and check snapshot, effect records and encoded
state. The normal-runtime fixture admits that request but does not deliberately exhaust memory. Consequently it does
not establish safe allocation failure or a practical limit. The separate concurrent case exchanges one text and one
opaque replacement from the same genesis, checks convergence and reload, and is not a concurrency stress test.

Clipboard experiments use the actual historical materializer and search for a matching attributed fragment, including
unresolved and reloaded history. Reloaded cases also vary retained text size and Origin runs, with three observations
per shape. They include JSON decode, guard checking, materialization and attributed search; they are not OS clipboard
measurements. Missing or invalid private metadata and each independent guard fall back to plain text with imported
Origin. A valid private fragment with an unresolved source keeps its validated Origin but omits the derivation. The
raw-media cases cover exact UTF-8 and opaque round trips, unsupported text profiles, malformed UTF-8 and invalid Media
Types. Malformed carrier bytes and positions are checked for explicit rejection without changing state or effects.

The measurements do not characterize peak allocation, all payload distributions, very large payloads, real memory
exhaustion, every malformed retained-state or codec representation, untrusted OS clipboard behavior, or production
policy. Later final comparison work must reconcile remaining limits with the shared final profile. Experimental sizes
and thresholds are observations, never semantic maxima.
