# Capacity and performance target policy

**Status:** Accepted cross-cutting MVP implementation policy.

## 1. Purpose

This document defines how Coedit uses numeric capacity and performance values during the document-engine MVP.

Numeric values are useful for bounded implementation, hostile-input handling, qualification, and repeatable tests. They must not become document semantics only because the first implementation needs finite resource budgets.

`MVP_ARCHITECTURE.md` controls the semantic boundary. Focused specifications can define their own provisional targets, but they must follow this policy unless a later explicit product or interoperability decision says otherwise.

## 2. Four kinds of limits and targets

Use these categories.

### 2.1 Semantic invariant

A semantic invariant defines valid document meaning. It is not selected from implementation capacity or performance measurements.

Examples include one real root Block, unique live identities, one owner per InlineContent, and acyclic live structure.

A semantic numeric bound requires an explicit product or interoperability rationale. Do not introduce one only because it is convenient for an implementation.

### 2.2 Minimum implementation-capacity target

A minimum implementation-capacity target defines an envelope that the current prototype must support and test. It is not a maximum size of a valid Coedit document or value.

An implementation can use a temporary resource guard near or above that target while the prototype remains bounded. Exceeding the implementation's current guard produces a typed capacity/resource failure. It does not make the input semantically invalid.

Revise these targets and guards when carrier qualification, profiling, target-device measurements, interoperability work, and later real usage data provide better evidence. Prefer increasing or removing arbitrary guards when the implementation can safely support more.

### 2.3 Hostile-input resource guard

External parsers, decoders, importers, clipboard readers, and storage recovery paths must protect CPU, memory, stack, allocation, and graph-processing resources.

A hostile-input guard is an implementation safety boundary. Exact values can differ by implementation or environment until an interoperability contract deliberately freezes one. A resource-capacity rejection must remain distinct from a semantic validation failure.

A portable format must not define an arbitrary universal document maximum only to simplify one decoder. When an implementation cannot safely process a structurally valid artifact, it reports a capacity failure without claiming that the artifact is invalid for every conforming implementation.

### 2.4 Qualification or performance target

A qualification target defines a repeatable workload or preliminary performance objective. It is evidence for implementation selection and tuning, not a document-validity rule.

Record the hardware/software environment and scaling behavior. Revisit preliminary thresholds after qualification gives better evidence about practical carrier and platform capability.

## 3. Current preliminary capacity envelope

The current documentation uses these values as first-implementation or qualification targets:

- 20 tags per owner;
- 64 Unicode code points and 256 UTF-8 bytes per tag;
- 50,000 live Blocks;
- 50,000 live InlineContents;
- Block depth 1,000;
- 128 Unicode code points and 512 UTF-8 bytes for Contributor display names;
- Markdown workloads up to 10 MiB source, 200,000 AST nodes, 50,000 generated Blocks, source nesting depth 100, and 255-code-point / 1-KiB source names;
- portable-format characterization at 64 MiB JSON, JSON depth 128, 5,000 Contributions plus genesis, 64 parent/frontier references, 250,000 operations per Contribution, 1,000,000 operations per archive, 8 MiB per decoded carrier chunk, 48 MiB decoded chunk data, and 1,000,000 code points in one InlineContent; and
- representative carrier/storage qualification workloads around 100,000 code points and 5,000 Contributions.

These values are deliberately provisional. They define minimum envelopes and stress points for the MVP. They are not promised permanent maxima, and the format/domain specifications must not depend on their exact values for semantic correctness.

The 5,000-Contribution workload is particularly not a History-retention limit. History design can require more Contributions and Versions than the first qualification fixture exercises.

## 4. Preliminary 50 ms carrier target

The current carrier qualification uses **50 ms** as a preliminary local-update target. It corresponds to a coarse objective of approximately **20 canonical local updates per second**.

This value is an initial calibration point for comparing candidate carriers and detecting obviously unsuitable hot-path behavior. It is not a product latency guarantee, a universal hardware requirement, or a permanent carrier-selection constant.

Qualification must record actual latency distributions and scaling on the measured environment. After that evidence gives a better feel for practical carrier capability and interactive behavior, revise the threshold before treating it as a mature performance budget.

Visible editor feedback remains a separate, tighter interaction concern. Persistence, History materialization, network delivery, or other non-critical work must not unnecessarily block local feedback.

## 5. Verification rule

For each provisional target:

- test behavior at representative points below and around the target;
- include larger characterization points when practical to expose scaling behavior;
- verify that an implementation capacity failure is explicit and leaves committed state unchanged;
- do not assert that exceeding a provisional target makes a document semantically invalid; and
- record evidence when a target or guard is revised.

Do not use a single threshold as a substitute for scaling measurements.

## 6. Freeze rule

Do not freeze a numeric value into a durable wire-format compatibility rule or product invariant without a separate rationale.

Before a numeric maximum becomes interoperable format semantics, record why conforming implementations need the same maximum rather than implementation-specific resource guards. If no such reason exists, keep the value outside document semantics.