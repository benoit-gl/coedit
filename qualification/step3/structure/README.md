# Step 3 structural carrier and allocator qualification

This directory contains qualification-only concrete implementations for the second Step 3 merge unit. Production source owns only the accepted carrier-neutral structural and position-allocation abstractions under `src/carrier`. Production modules do not import these candidate adapters.

The structural carrier suite runs the same flat-placement, command-to-placement, Block-local payload, liveness, convergence, collision, normalization, reload, and repeated-move cases against Yjs 13.6.32 and Automerge 3.4.1.

The allocator suite compares fractional-indexing 4.0.0, Fugue 3.0.0, and a local dense-order comparison candidate through the accepted `StructuralPositionAllocator` abstraction. It covers open-interval allocation, ordered runs, deterministic concurrent ordering, explicit run-interleaving and nested-run projection characterization, codec round trips, collision normalization, repeated moves with fresh positions, and repeated narrow-gap ordering invariants. The local candidate is a comparison baseline; its presence is not a selection. Representative growth and exhaustion measurements belong to the later comparative-evidence merge unit and are not correctness thresholds.

Fugue uses a deterministic full-width UUID-seeded random source during qualification so repeated runs are reproducible without compressing allocation identity to a smaller seed. This is qualification scaffolding, not a production randomness choice.

Plain fractional-indexing 4.0.0 is intentionally retained as a qualification candidate rather than silently modified with candidate-external jitter. Concurrent runs allocated into the same bounds generate the same primary fractional keys and then use the run UUID only as a deterministic secondary tie-break. Primary collisions and multi-item run interleaving are candidate characterization results, not common correctness assertions. The later comparative-evidence merge unit records reproducible measurements for Gate B.

This merge unit does not select a carrier or position allocator and does not expose any candidate through the public engine or domain APIs. The later integrated Step 3 merge unit composes this structural work with the payload qualification. The comparative-evidence merge unit records reproducible measurements and resource characterization before Gate B selects the production implementations.
