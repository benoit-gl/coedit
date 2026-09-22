# Step 3 payload carrier qualification

This directory contains qualification-only code for the first Step 3 merge unit.
It compares Yjs 13.6.32 and Automerge 3.4.1 through one carrier-neutral payload
surface. Production modules do not import these candidate adapters.

The common tests currently cover exact Media Type spelling, initial fine-grained
type/subtype dispatch, native-string editing and Origin projection, complete
reload, opaque bytes and payload-level Origin, explicit text/opaque replacement,
detached opaque buffers, incompatible-operation rejection, and exact-or-atomic-
reject behavior for a lone surrogate.

Later Step 3 merge units add the structural fork, integrated document/editor
qualification, comparative measurements and resource evidence, and the Gate B
decision. The parser helper here is only qualification dispatch scaffolding. It
does not select the Step 4 production Media Type parser or raw-media processor.
