# `.coedit` document format and recovery

A `.coedit` document is a SQLite database with a fixed application ID and a versioned schema. The application checks both values and runs `PRAGMA integrity_check` before loading document content.

## Schema version 1

- `metadata` stores document identity, title, timestamps, format version, and current revision.
- `nodes` stores the current materialized hierarchy and each node's complete Yjs state.
- `contributors` and `writing_sessions` identify mutation sources.
- `contributions` is an immutable operation ledger with base revision and resulting SHA-256 state hash.
- `snapshots` stores replay checkpoints. The MVP stores every revision; future compaction may retain periodic checkpoints while preserving operations.
- `attachments` is reserved for checksum-addressed embedded files.

SQLite uses full synchronous transactions and the delete journal so a closed document is one portable file. Each visible persisted mutation and its contribution record commit in the same transaction.

## Backup and recovery

Use **Export → SQLite backup** for a byte-for-byte database backup created while the application holds the document lock. JSON recovery export contains the complete current state and contribution ledger in a human-inspectable form. Markdown export is intended for interchange, not lossless recovery.

If opening reports an integrity failure:

1. Stop editing and preserve the original file and any `-journal` file beside it.
2. Work from a copy.
3. Try the most recent `.coedit-backup` file.
4. Use a JSON recovery export to inspect content and history.
5. Do not replace the original until the recovered document has been validated.

Documents with a newer format version are opened read-only when their compatible core tables remain readable. Unsupported structures fail closed rather than being rewritten.

