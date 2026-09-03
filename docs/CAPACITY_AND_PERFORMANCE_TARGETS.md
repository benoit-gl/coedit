# Capacity and performance policy

**Status:** Accepted cross-cutting MVP implementation policy.

## 1. Purpose

This document defines how Coedit interprets capacity, resource, and performance constraints during the document-engine MVP.

Numeric implementation choices must not become document semantics only because one implementation needs finite resources. `MVP_ARCHITECTURE.md` controls the semantic boundary. This document controls the cross-cutting classification and ownership rules below.

## 2. Default rule

The Coedit document model has no application-defined finite maximum for otherwise valid text size, tag count or length, Block count, InlineContent count, Block depth, Contributor display-name length, or retained History length.

A document or value remains semantically valid unless a domain invariant says otherwise. An implementation can still fail because the runtime, parser, codec, storage system, or device cannot safely process the requested work. Report that condition as a typed capacity or resource failure. Do not report it as semantic invalidity.

Do not add a finite maximum only to make an implementation simpler. Add a finite implementation guard only when there is a concrete resource, safety, interoperability, or platform reason for it.

## 3. Constraint classes

### 3.1 Semantic invariant

A semantic invariant defines valid document meaning. It is independent of implementation capacity.

Examples include one real root Block, unique live identities, one owner per InlineContent, and acyclic live structure.

A semantic numeric bound needs an explicit product or interoperability rationale. Implementation convenience is not sufficient.

### 3.2 Implementation resource constraint

An implementation resource constraint exists when the current runtime or subsystem cannot safely complete otherwise valid work.

Use no finite application guard when the implementation can rely on its normal runtime limits safely. When a real constraint needs an explicit guard, keep it at the implementation boundary and return a capacity/resource failure without partial publication.

Revise or remove the guard when profiling, target-device measurements, interoperability work, or later usage shows that it is unnecessary or too restrictive.

### 3.3 Hostile-input resource guard

External parsers, decoders, importers, clipboard readers, and recovery paths must bound dangerous CPU, memory, stack, allocation, and graph-processing work.

A hostile-input guard protects one consuming implementation. It does not define the largest valid Coedit document. Exact values can change when evidence changes unless an explicit interoperability contract deliberately freezes them.

### 3.4 Qualification or performance target

A qualification target defines a repeatable workload or preliminary performance objective. It is evidence for implementation selection and tuning. It is not a document-validity rule or a product guarantee.

Record the measured environment, latency distributions, scaling behavior, and resource use. Do not infer throughput from a latency threshold. Measure throughput separately when it matters.

## 4. Numeric ownership

Keep each retained numeric guard or qualification constant in one direct authority:

| Concern                                                                 | Direct owner                  |
| ----------------------------------------------------------------------- | ----------------------------- |
| Step 2 structural/tag capacity behavior and Contributor scalar behavior | `MVP_IMPLEMENTATION_SPEC.md`  |
| Markdown hostile-input guards                                           | `MARKDOWN_INTERCHANGE.md`     |
| `.coedit` hostile-input and codec resource guards                       | `PORTABLE_DOCUMENT_FORMAT.md` |
| Shared carrier/storage qualification workloads and performance targets  | `MVP_VERIFICATION_PLAN.md`    |
| Browser quota, checkpoint, and storage measurements                     | `BROWSER_PERSISTENCE.md`      |

Other documents state the required behavior and refer to the direct owner. Do not copy numeric values into summaries, ADRs, plans, or secondary verification text.

## 5. Verification rule

For an actual resource guard:

- test safe behavior below and around the guard when practical;
- verify that exceeding it returns the documented capacity/resource failure;
- verify that failed work leaves committed state unchanged; and
- record evidence when the guard changes.

For a qualification or performance target:

- measure representative points below, at, and beyond the target when practical;
- record median, tail, growth, and resource behavior rather than one pass/fail number; and
- revise preliminary targets when qualification or later usage provides better evidence.

Do not use one threshold as a substitute for scaling measurements.

## 6. Freeze rule

Do not freeze a numeric value into durable wire-format compatibility or product semantics without a separate rationale.

Before a numeric maximum becomes interoperable format semantics, record why all conforming implementations need the same maximum rather than implementation-specific resource protection. If there is no such reason, keep it outside document semantics.
