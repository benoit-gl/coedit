# Capacity and performance policy

**Status:** Accepted cross-cutting MVP policy. Subsystem-specific guards and
performance numbers retain the maturity stated by their direct owner.

## 1. Purpose

This document defines how Coedit interprets capacity, resource, and performance
constraints during the document-engine MVP. It also defines how an early
candidate becomes an enforceable contract.

Numeric implementation choices must not become document semantics only because
one implementation needs finite resources. `MVP_ARCHITECTURE.md` controls the
semantic boundary. This document controls the cross-cutting classification,
maturity, ownership, verification, and promotion rules below.
[ADR 0008](decisions/0008-capacity-contract-maturity.md) records why the
maturity model was adopted and preserves the earlier planning values.

## 2. Default rule

The Coedit document model has no application-defined finite maximum for
otherwise valid text size, tag count or length, Block count, InlineContent
count, Block depth, Contributor display-name length, or retained History
length.

A document or value remains semantically valid unless a domain invariant says
otherwise. An implementation can still fail because the runtime, parser,
codec, storage system, or device cannot safely process the requested work.
Report that condition as a typed capacity or resource failure. Do not report it
as semantic invalidity.

Do not add a finite maximum only to make an implementation simpler. Add a
finite implementation guard only when there is a concrete resource, safety,
interoperability, or platform reason for it.

## 3. Constraint classes

Constraint class describes what a rule means. Contract maturity, defined in
section 4, describes how strongly the repository currently commits to it.

### 3.1 Semantic invariant

A semantic invariant defines valid document meaning. It is independent of
implementation capacity.

Examples include one real root Block, unique live identities, one owner per
InlineContent, and acyclic live structure.

A semantic numeric bound needs an explicit product or interoperability
rationale. Implementation convenience is not sufficient.

### 3.2 Implementation resource constraint

An implementation resource constraint exists when the current runtime or
subsystem cannot safely complete otherwise valid work.

Use no finite application guard when the implementation can rely on its normal
runtime limits safely. When a real constraint needs an explicit guard, keep it
at the implementation boundary and return a capacity/resource failure without
partial publication.

### 3.3 Hostile-input resource guard

External parsers, decoders, importers, clipboard readers, and recovery paths
must bound dangerous CPU, memory, stack, allocation, and graph-processing work
before they ship.

A hostile-input guard protects one consuming implementation. It does not define
the largest valid Coedit document. Exact values can change when evidence changes
unless an explicit interoperability contract deliberately freezes them.

### 3.4 Qualification or performance target

A qualification target defines a repeatable workload or preliminary performance
objective. It is evidence for implementation selection and tuning. It is not a
document-validity rule or a product guarantee.

Record the measured environment, latency distributions, scaling behavior, and
resource use. Do not infer throughput from a latency threshold. Measure
throughput separately when it matters.

## 4. Contract maturity

Every finite capacity, resource, or performance number that affects acceptance,
rejection, compatibility, protection, or evaluation has one of these maturity
levels:

| Maturity            | Meaning                                                                                          | Enforcement                                                                                       |
| ------------------- | ------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------- |
| Accepted invariant  | Stable semantic, safety, or architectural behavior that is required now                          | Normative tests and review requirements can enforce it                                            |
| Pending selection   | The owner, evidence, and selection milestone are known, but no value or mechanism is selected    | The owning subsystem cannot pass its implementation gate until the selection is recorded          |
| Experimental target | A candidate value or workload exists to seed measurement and comparison                          | Record results; do not reject semantic input, define compatibility, or fail correctness CI on it  |
| Frozen contract     | Evidence supports an exact implementation or interoperability boundary that the project supports | Boundary tests enforce it; changes require recorded evidence and any necessary compatibility work |

An accepted invariant can require a future guard without selecting its numeric
value. For example, "hostile portable input must be bounded" is accepted while
the exact decoder bounds remain pending or experimental.

A direct authority that states a pending, experimental, or frozen number must
identify:

- **Maturity**;
- **Owner**; and
- **Promotion gate** or change rule.

Do not describe a pending or experimental number as an exact limit, supported
maximum, pass budget, or required acceptance threshold. A subsystem may freeze
its implementation guards without making them document semantics or portable
interoperability rules.

## 5. Ownership and promotion gates

Keep each current number in one direct authority. Other documents state the
required behavior and refer to that owner without copying the value.

| Concern                                          | Direct owner                         | Current maturity                              | Selection or promotion gate               |
| ------------------------------------------------ | ------------------------------------ | --------------------------------------------- | ----------------------------------------- |
| Step 2 structural and tag capacity behavior      | `MVP_IMPLEMENTATION_SPEC.md`         | Accepted invariant: no finite semantic cap    | Revisit only from implementation evidence |
| Contributor scalar behavior                      | `MVP_IMPLEMENTATION_SPEC.md`         | Accepted invariant; boundary guard pending    | Relevant UI, codec, or storage step       |
| Carrier and private-clipboard resource guards    | `ATTRIBUTED_TEXT_AND_ANNOTATIONS.md` | Pending selection                             | Step 3 carrier qualification              |
| Shared carrier performance workloads and targets | `MVP_VERIFICATION_PLAN.md`           | Experimental targets                          | Step 3 carrier qualification              |
| Markdown hostile-input guards                    | `MARKDOWN_INTERCHANGE.md`            | Experimental candidates; selection pending    | Step 5                                    |
| `.coedit` hostile-input and codec guards         | `PORTABLE_DOCUMENT_FORMAT.md`        | Experimental candidates; selection pending    | Step 6 and version-1 freeze               |
| Browser recovery, quota, and storage thresholds  | `BROWSER_PERSISTENCE.md`             | Pending selection or experimental measurement | Steps 11-12                               |
| Editor grouping and queue comparison fixtures    | `MVP_IMPLEMENTATION_SPEC.md`         | Experimental targets                          | Step 9                                    |
| Network replication capacity behavior            | `COLLABORATION_MODEL.md`             | Pending selection                             | Post-MVP network-collaboration gate       |

ADRs and explicit traceability records can reproduce an earlier value only to
preserve non-normative history. The record must identify it as a former limit
or experimental candidate, not as a second authority.

## 6. Verification rule

For an accepted invariant:

- test semantic and atomicity behavior at the lowest meaningful boundary; and
- do not infer a finite maximum where the invariant deliberately defines none.

For a pending selection:

- record the threat, resource, or interoperability concern;
- collect evidence at the owning implementation step; and
- do not close that step until the selected behavior and verification seam are
  documented.

For an experimental target:

- measure representative points below, at, and beyond the candidate when
  practical;
- record the exact fixture, environment, median, tail, growth, and resource
  behavior; and
- do not use one candidate threshold as a correctness pass/fail rule.

For a frozen implementation guard:

- test safe behavior below and around the guard when practical;
- verify that exceeding it returns the documented capacity/resource failure;
- verify that failed work leaves committed state unchanged; and
- record evidence when the guard changes.

## 7. Promotion and freeze rule

Promote a pending selection or experimental target only in its direct authority
and only when the named gate has produced the required evidence. Record the
measured environment, rationale, supported boundary, failure behavior, and
tests. A material promotion or reversal also requires an ADR.

Do not freeze a numeric value into durable wire-format compatibility or product
semantics without a separate interoperability or product rationale. If all
conforming implementations do not need the same maximum, keep the value an
implementation guard rather than format or document validity.

When evidence changes an implementation guard, revise it deliberately and keep
the previous evidence discoverable. A compatibility-visible change may require
a new format or protocol version even though the underlying capacity failure is
not semantic invalidity.
