# Step 3 comparative qualification work plan

This is an execution aid for the remaining Step 3, merge unit 8 work. The
[scaffolding plan](../../../SCAFFOLDING_PLAN.md) owns work order and exit gates;
the [verification plan](../../../docs/MVP_VERIFICATION_PLAN.md) and focused
specifications own the requirements. This checklist does not change their
authority, promote performance targets, or make every proposed experiment a
new correctness gate. Existing fixtures and results are starting evidence, not
proof that comparative qualification is complete. Reassess each item against
the current revision before implementation.

For each item, identify the governing requirement or selection question, inspect
existing evidence, and close it with a reproducible result or a documented,
justified limitation. Mark mandatory failures and inconclusive evidence
explicitly. A limitation does not waive an applicable mandatory invariant.
Choose bounded workloads that distinguish alternatives; expand them when
results leave a decision-relevant question unresolved. Record what was tried,
what was observed, and what remains unknown. Do not imply that every suggested
dimension requires a separate benchmark or that an unmeasured case passed.

## Execution order

1. Record the shared fixture profile, timing boundaries, execution method and
   environment before running comparable measurements. Keep exploratory runs
   separate from final same-profile evidence.
2. Resolve ordinary-edit whole-document work and its applicability to the
   intended production path. Retain the snapshot implementation as a reference
   until matched semantic and cost comparisons are complete.
3. Extend carrier history, replacement, and Range evidence, then structural,
   allocator, and resource evidence. Independent fixtures can proceed in
   parallel when their shared profile and interfaces are coordinated.
4. Complete browser and Loro characterization using the recorded methodology.
5. Run and reconcile the final comparison; prepare the evidence for Gate B.

These are work packages, not a fixed number of pull requests. Split them into
coherent reviewable changes as evidence and dependencies require. AI agents
should use existing fixtures and specifications, preserve findings and exact
revisions in durable records, and ask for a decision when a material choice
would change architecture, interfaces, or accepted behavior.

## Reproducibility and measurement

- [ ] Define or record the effective shared fixture profile, including relevant
      text, history, structure, Origin, opaque payload, concurrency, Range and
      resource dimensions. Include constants outside the profile in the recorded
      configuration. Record independent and combined dimensions.
- [ ] Compare equivalent logical fixtures and starting histories on the same
      recorded environment. Check semantic equivalence, record candidate order,
      warm-ups, process policy, sample counts and raw distributions. Use enough
      samples for any tail claim; otherwise state the statistical limits.
- [ ] Define timing boundaries for setup, preparation, mutation, projection,
      encoding, reload, materialization and verification as applicable. Record
      hardware, OS, runtime, browser and dependency versions, configuration,
      checked-out revision and, where relevant, PR head and test-merge revisions.
- [ ] Preserve partial results and distinguish timeout, resource exhaustion,
      explicit refusal and unknown failure. Consider an evidence manifest to
      identify expected outputs, completion state and profile. An incomplete run
      must not appear complete. Record the intended device/browser envelope and
      whether further environments are needed; do not generalize a Linux runner
      result to all devices.

## Ordinary edits and feedback

- [ ] Investigate retained placements with arbitrary stateful position decoders,
      which currently fall back to full preflight, and determine which decoder
      semantics the production-compatible path requires. Resolve the normal-typing
      whole-document-work criterion without silently narrowing the allocator
      interface. Escalate any material design choice.
- [ ] Instrument snapshots, unrelated payload and placement traversal, position
      decoding, opaque copying, full validation and Range-holder enumeration as
      relevant. Test that qualified ordinary edits do not perform prohibited
      document-wide work; timing alone cannot establish its absence.
- [ ] Vary unrelated Blocks, placements, text and opaque contents independently
      of target size. Compare target length and Origin fragmentation, including
      boundaries. Investigate full target reconstruction and temporary validation
      costs. Separate liveness-token, carrier-history and payload-effect-history
      growth where feasible.
- [ ] Compare snapshot and targeted variants on matched fixtures and outcomes,
      including rejection and atomicity. Measure load, merge, restore, replacement,
      first following edit and warm edits; account for work moved to transitions.
      Characterize fallback paths and their occurrence in representative workflows.
- [ ] Separate editor-local update, synchronous canonical publication,
      projection and driver completion where observable. Measure the specified
      experimental calibration interval and investigate slow local publication.
      Animation-frame callbacks are not physical paint. Any decoupling design
      requires a decision; a fixture must not disguise synchronous work.

## Carrier history, replacement and lifecycle

- [ ] Extend history-size and shape coverage beyond sequential single-character
      appends: consider deletes, replacements, multiple contents, structural and
      mixed opaque/text effects. Separate visible content size from history length,
      and record larger practical points or explicit resource/time outcomes.
- [ ] Characterize wide causal frontiers, merge fan-in and ancestry lookup;
      repeated Block and InlineContent activity and liveness-token growth; and
      retained replacement alternatives, losing-branch edits and ancestry chains.
      Attribute costs where feasible rather than assuming one cause.
- [ ] Compare text/text, opaque/opaque and mixed-type replacements, including
      two and more concurrent alternatives and concurrent insert, delete and
      fine-grained replacement. Exercise causal precedence across unrelated effects,
      delivery faults and reload; verify convergence, attribution, identities and
      retained evidence. Measure merge, validation, projection, reconstruction and
      encoded growth where selection-relevant.
- [ ] Compare already exercised winner and mixed-operation alternatives by
      metadata, reconstructibility, complexity and contract compatibility.
      Record evidence without selecting the Gate B policy.
- [ ] Separate capture, historical materialization, restore, serialization and
      reopen costs across relevant sizes and repeat representative edits after
      lifecycle transitions. Record supported native garbage collection or
      compaction and unsupported operations; do not invent an equivalent operation.
      Capture resource observations and collection limitations for relevant
      workloads beyond the isolated history loop.

## Structure, allocators and Ranges

- [ ] Measure Block create, move, subtree move, delete and repeated moves,
      including mixed structure and multiple text/opaque payload transactions.
      Vary relevant Block and sibling counts, depth, subtree size and placement
      history; check atomic publication and equivalent projection. Measure
      convergence and serialized carrier growth under structural stress.
- [ ] Compare allocator allocation, ordered runs, comparison, sorting,
      encoding/decoding and narrow-gap growth. Record position-length distributions,
      collisions, collision runs, normalization, concurrent-run interleaving,
      parentage and practical exhaustion behavior. Identify invariant failures,
      explicit failure behavior, repair needs and cost for each candidate.
- [ ] Extend Range construction and lazy-resolution scaling across holder
      counts and document shapes. Measure representative move, deletion, split,
      merge and replacement lineage, multiple members, and retained-state growth.
      Check behavior after edits, reload, historical materialization and supported
      lifecycle operations. Unresolved members must not attach merely to equal
      content. Instrument edits and moves to detect scans of unrelated holders.
      This is feasibility evidence, not the final Range representation.

## Admission, clipboard and media boundary

- [ ] Characterize fine-grained text and opaque admission over relevant sizes,
      operation counts, Origin fragmentation, payload distributions and concurrent
      alternatives. Measure decoding, copying, publication and encoding as useful.
      Record practical completed points and failures as observations, not semantic
      maxima.
- [ ] Exercise candidate admission and guard mechanisms, including controlled
      failure, and verify explicit rejection and unchanged committed state. Compare
      fixed, adaptive, operation-specific and normal-runtime safe-failure options
      where applicable. An uncontrolled out-of-memory crash does not prove atomic
      refusal. Gate B selects the behavior and any values.
- [ ] Expand private clipboard guard and malformed-input cases across independent
      dimensions and realistic fragments. Measure actual retained-source resolution
      where applicable, including unresolved and post-reload cases. Verify atomic
      failure and plain-text fallback with imported/unknown Origin. Preserve
      self-contained clipboard data; fixture limits are not production selections.
- [ ] Summarize supported, unsupported, invalid and non-exact raw/coarse
      conversion outcomes and carrier independence. Exercise malformed carrier
      state, retained metadata and position or codec failures for explicit,
      atomic outcomes. Do not select the Step 4 production parser or processor.

## Browser and reference workloads

- [ ] Extend representative editor operations across target sizes, Origin
      distributions, realistic Markdown-like and Unicode content, and larger
      unrelated multi-Block state. Record exact-preservation or atomic-rejection
      behavior for relevant native-string edge cases, including surrogate boundaries.
- [ ] Exercise delayed downstream work across an asynchronous scheduling
      boundary and verify local editing and eventual reload/convergence. Record
      what is simulated. Observe editing after inbound changes, reload, restore and
      replacement, including selection and position behavior.
- [ ] Document synthetic keyboard, transaction, composition and clipboard
      methods and the limits of OS input, IME, storage, network and paint evidence.
      Do not require a full product editor or OS automation unless an unresolved
      requirement needs it.
- [ ] Run and summarize the pinned Loro cursor/movable-tree reference. Describe
      operation and interval differences before comparing numbers. Keep Loro
      outside the selectable candidates, common correctness gate and production
      dependencies.

## Final comparative record

- [ ] Run the common verification and comparative qualification on the final
      implementation revision under the recorded profile. Preserve machine-readable
      raw results and logs as Actions artifacts; link runs and distinguish revision
      identities. Artifacts can expire: commit the profile, method and summarized
      evidence needed for a durable record.
- [ ] Map mandatory requirements to tests, measurements and results, with
      pass/fail/unsupported/inconclusive status and limitations. Reconcile earlier
      partial runs and incomparable timing intervals. Record failures and unresolved
      questions without claiming qualification from a clean benchmark alone.
- [ ] Summarize candidate and allocator capabilities, growth, safe failure,
      lifecycle support, adapter complexity, dependency versions, licenses,
      maintenance and integration risks. Include relevant distribution obligations.
      Explain eligible and ineligible alternatives and their tradeoffs, including
      structural interleaving and replacement evidence.
- [ ] Prepare the evidence for carrier, allocator, winner rule, mixed operations,
      string domain, admission and clipboard decisions. State whether the proposed
      options already have exercised mechanisms and fixtures. Do not make those
      selections in this unit.
- [ ] Close the unit only when the applicable requirements and selection
      questions are auditable from the committed record, including profile, method,
      environment, revision, results and limitations. Gate B remains a separate
      decision; later production core, History, final Range representation,
      portable format and full editor work retain their planned ownership.
