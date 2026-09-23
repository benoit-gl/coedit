# Step 3 payload carrier qualification

This directory contains qualification-only code for the first Step 3 merge unit.
It compares Yjs 13.6.32 and Automerge 3.4.1 through one carrier-neutral payload
surface. Production modules do not import these candidate adapters.

The common tests currently cover fixed RFC 9110/RFC 6838 Media Type syntax
validation before mutation, including malformed names, empty parameter slots,
duplicate case-insensitive parameters, and trailing material; exact Media Type
spelling preservation; and initial fine-grained type/subtype dispatch.
They also cover native-string editing and Origin projection, complete reload,
opaque bytes and payload-level Origin, explicit text/opaque replacement,
detached opaque buffers, incompatible-operation rejection, and exact-or-atomic-
reject behavior for a lone surrogate.

The qualification-only representative raw/coarse codec boundary proves exact
supported conversion and atomic failure for unsupported profiles, invalid input
or decode, and exact-encoding failure without relabelling, ignored parameters,
or opaque fallback. It is deliberately not a production codec or supported-
profile choice.

The same whole-payload replacement suite runs against both candidates. It
records causally later replacement, concurrent text/text, text/opaque,
opaque/opaque, and three-way complete-branch convergence under opposite and
repeated delivery plus reload. It establishes candidate-native convergence
evidence without selecting the Gate B observable winner rule or mixed
replacement/text-edit semantics.

Later Step 3 merge units add the structural fork, integrated document/editor
qualification, comparative measurements and resource evidence, and the Gate B
decision. The validation/dispatch helper and representative codec here are
qualification scaffolding only. They do not select the Step 4 production Media
Type parser or raw-media processor.
