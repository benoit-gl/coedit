# Structure, allocator and Range comparison profile

This experimental profile is qualification evidence for Merge 8. It sets no product limit, carrier selection,
allocator selection or Gate C Range representation. Candidate versions are pinned by the repository lockfile:
Yjs 13.6.32, Automerge 3.4.1, fractional-indexing 4.0.0 and Fugue 3.0.0. The local dense allocator is the additional
comparison candidate. The carrier fixtures use the same local dense allocator and equivalent logical input for each
carrier; the allocator fixture uses each candidate through the common allocator abstraction.

Run the three scripts sequentially on the same host with no other local benchmark, in the order below. Each runner
records its exact dimensions, candidate order, timing boundaries, runtime and host details, raw samples and completion
state. Each paired case uses one warmup and three measured samples; carrier order alternates and allocator order
rotates. Carrier fixtures make a fresh native document for each sample; allocator cases share one process and use
fresh inputs. Three samples support descriptive medians, not tail estimates. Setup, assertions and verification are
outside the named intervals except as explicitly recorded in the runner output. Where reported, process peak RSS is
cumulative for a runner and includes setup and verification, not per-document memory. The structural runner reports
encoded sizes, not RSS. No Linux runner result is a device-wide bound.

1. `node scripts/step3-structural-stress.mjs OUTPUT.json` varies sibling count 8/32/64, moved subtree size 4/16,
   depth 2/8 and prior repeated moves 2/16 in individual and combined shapes. It measures create, move, subtree move,
   repeated move, delete, mixed payload/structure, projection, encode, reload and paired merge, with independent
   fixture expectations and atomic-refusal checks. Candidate and operation intervals are specified in the output.
2. `node scripts/step3-allocator-stress.mjs OUTPUT.json` measures 16/128/512 allocations, ordered runs, comparison,
   sorting, encoding/decoding, narrow gaps and eight concurrent two-member runs with eight-holder collision
   normalization. Actual concurrent collision groups are also normalized and their resulting parentage checked.
   A separate 4,096-member practical run and explicit failures characterize observed behavior, not a maximum.
   Length, collision, interleaving and parentage observations are retained per sample.
3. `node scripts/step3-range-qualification.mjs > OUTPUT.json 2> OUTPUT.log` varies holder count 1/64/256/1,024, member
   count 1/4, unrelated Block count 0/8, prior moves 0/12 and additional retained lineage edges 0/8/32 independently.
   It measures creation, lazy resolution, edits, moves, deletion, split/merge/replacement and retained lineage growth.
   Fixture-supplied lineage and external, unregistered holders are probes, not a production Range service or permanent
   Version contract.

Each output records completion or error and preserves completed rows. The Actions job uses the checked-out test merge
and identifies the PR head separately, then uploads all raw outputs and logs. Local measurements must identify the
exact source revision, clean/dirty status, profile and installed dependencies; run-specific raw data and summaries
must say what was actually exercised and identify unsupported or unmeasured cases. Later final comparison work must
reconcile this evidence with the other qualification dimensions under the merge unit 11 final profile.
