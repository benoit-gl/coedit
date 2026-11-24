import { digest } from "lib0/hash/sha256";

import {
  decodeStructuralPlacement,
  encodeStructuralPlacement,
  type StructuralPositionCodec,
} from "../../../src/carrier/index.js";
import {
  isCanonicalUuidV4,
  parseBlockId,
  parseInlineContentId,
} from "../../../src/domain/index.js";
import type { BlockId, InlineContentId } from "../../../src/domain/index.js";
import type {
  IntegratedDocumentSnapshot,
  IntegratedPayloadChange,
} from "../integrated/carrier.js";
import {
  encodeEffectContext,
  qualificationEffectIdentity,
} from "../integrated/effectContext.js";
import {
  encodeAppliedEffectEnvelope,
  encodeRestoreEffectEnvelope,
} from "../integrated/effectEnvelope.js";
import { encodePayloadEffect } from "../integrated/replacementEvidence.js";
import {
  assertQualificationOrigin,
  encodeQualificationOrigin,
} from "../payload/carrier.js";
import type {
  QualificationOrigin,
  QualificationPayloadSnapshot,
  QualificationTextSpan,
} from "../payload/carrier.js";

const RECORD_TAG = "coedit-step3-record";
const RECORD_VERSION = 1;
const DIGEST_PATTERN = /^[0-9a-f]{64}$/u;
const COUNTER_PATTERN = /^(?:0|[1-9][0-9]*)$/u;

/** Closed version-one immutable record discriminators. */
export type RecordKind =
  | "manifest"
  | "join"
  | "generation"
  | "run"
  | "erase"
  | "live"
  | "retire"
  | "context"
  | "envelope"
  | "payload-effect-v2"
  | "transition-v1";

/** Authored operation or reserved metadata category in a closed command. */
export type OperationCategory =
  | "context"
  | "envelope"
  | "payload-evidence"
  | "block-delete"
  | "placement"
  | "inline-create"
  | "payload"
  | "transition"
  | "restore";

/** Content commitment to one exact canonical immutable-run record body. */
export type RecordRef = readonly [recordUuid: string, sha256Hex: string];

/** Logical text generation owning a source record. */
export type TextScope = readonly [
  kind: "text",
  inlineContentUuid: string,
  generationUuid: string,
];
/** Block or InlineContent identity owning a liveness fact. */
export type EntityScope = readonly [
  kind: "block" | "inline",
  entityUuid: string,
];
/** Document-wide command, root, or metadata scope. */
export type DocumentScope = readonly [kind: "document"];
/** Closed target scope carried by an immutable record. */
export type RecordScope = TextScope | EntityScope | DocumentScope;
/** Exact decimal source counter and private replica identity. */
export type RecordClock = readonly [
  counterDecimal: string,
  replicaUuid: string,
];
/** Accepted causal root and immediately preceding same-generation member. */
export type RecordBase = readonly [
  acceptedRoot: RecordRef,
  previousSourceMember: RecordRef | null,
];
/** Actor/effect pair identifying one authored semantic command. */
export type RecordEffect = readonly [actorId: string, effectId: string];
/** Exact operation row and member position committed by a manifest. */
export type RecordOrdinal = readonly [
  category: OperationCategory,
  operationIndex: number,
  memberIndex: number,
];
/** Fixed qualification Origin of committed source or opaque material. */
export type RecordOrigin = readonly [
  kind: QualificationOrigin["kind"],
  id: string,
];
/** Start sentinel or preceding source-unit end in an exact run. */
export type RecordAnchor =
  readonly [run: RecordRef, sourceEndOffset: number] | null;
/** Half-open source interval observed by an erase author. */
export type ObservedInterval = readonly [
  run: RecordRef,
  start: number,
  end: number,
];
/** Ordered member Refs belonging to one canonical authored operation. */
export type OperationRow = readonly [
  category: OperationCategory,
  operationIndex: number,
  members: readonly RecordRef[],
];
/** Exact structural delta committed by a command manifest. */
export type StructuralOutput =
  | readonly [kind: "placement", blockUuid: string, encodedPlacement: string]
  | readonly [
      kind: "inline-create",
      inlineContentUuid: string,
      blockUuid: string,
    ]
  | readonly [kind: "block-delete", blockUuid: string];
/** Exact final text-generation or opaque descriptor delta. */
export type DescriptorOutput =
  | readonly [
      kind: "text",
      inlineContentUuid: string,
      mediaType: string,
      generation: RecordRef,
    ]
  | readonly [
      kind: "opaque",
      inlineContentUuid: string,
      mediaType: string,
      bytes: readonly number[],
      origin: RecordOrigin,
    ];
/** Trusted bootstrap root, experimental run parameter, and attribution. */
export type GenesisBody = readonly [
  kind: "genesis",
  rootBlockUuid: string,
  settings: readonly [kind: "settings", version: 1, runSourceUnits: number],
  encodedBootstrapContext: string,
];
/** Closed authored command with exact metadata, members, and output deltas. */
export type CommandBody = readonly [
  kind: "apply" | "restore",
  acceptedBase: RecordRef,
  context: RecordRef,
  envelope: RecordRef,
  payloadEvidence: RecordRef | null,
  operations: readonly OperationRow[],
  structuralOutputs: readonly StructuralOutput[],
  descriptorOutputs: readonly DescriptorOutput[],
];
/** Bootstrap or semantic-command root body. */
export type ManifestBody = GenesisBody | CommandBody;
/** Logical Block, InlineContent, and generation participating in a fixture transition. */
export type TransitionScope = readonly [
  blockUuid: string,
  inlineContentUuid: string,
  generation: RecordRef,
];
/** Lineage continuation or separate copy/restore derivation. */
export type TransitionRelation = "lineage" | "copy" | "restore";
/** Exact source-to-destination interval evidence for a fixture transition. */
export type SpanMapping = readonly [
  sourceScope: TransitionScope,
  sourceRun: RecordRef,
  sourceStart: number,
  sourceEnd: number,
  destinationScope: TransitionScope,
  destinationRun: RecordRef,
  destinationStart: number,
  destinationEnd: number,
  relation: TransitionRelation,
];
/** Source-unit boundary or explicit empty generation boundary. */
export type TransitionBoundary =
  | readonly [kind: "at", run: RecordRef, offset: number]
  | readonly [kind: "empty", generation: RecordRef];
/** Exact fixture boundary correspondence with its relation. */
export type BoundaryMapping = readonly [
  sourceScope: TransitionScope,
  sourceBoundary: TransitionBoundary,
  destinationScope: TransitionScope,
  destinationBoundary: TransitionBoundary,
  relation: TransitionRelation,
];
/** Versioned qualification-private split, merge, copy, or restore evidence. */
export type TransitionBody = readonly [
  version: 1,
  kind: "split" | "merge" | "copy" | "restore",
  sourceRoot: RecordRef,
  sourceScopes: readonly TransitionScope[],
  destinationScopes: readonly TransitionScope[],
  spanMappings: readonly SpanMapping[],
  boundaryMappings: readonly BoundaryMapping[],
];

/** Closed version-one bodies; record kind determines the permitted tuple. */
export type RecordBody =
  | ManifestBody
  | readonly [inputs: readonly RecordRef[]]
  | readonly [mediaType: string]
  | readonly [anchor: RecordAnchor, exactSource: string, origin: RecordOrigin]
  | readonly [intervals: readonly ObservedInterval[]]
  | readonly []
  | readonly [liveRefs: readonly RecordRef[]]
  | readonly [encodedContext: string]
  | readonly [kind: "apply" | "restore", encodedEnvelope: string]
  | readonly [
      effectIdentity: string,
      acceptedAncestryRoot: RecordRef,
      encodedOperations: string,
    ]
  | TransitionBody;

/**
 * Closed canonical tuple stored by the Step 3 immutable-run qualification.
 *
 * @remarks
 * Values returned by this module are recursively frozen fresh tuples. The
 * type is qualification-private protocol data, not a portable Coedit format.
 */
export type CanonicalRecordV1 = readonly [
  tag: "coedit-step3-record",
  version: 1,
  id: string,
  kind: RecordKind,
  scope: RecordScope,
  clock: RecordClock | null,
  base: RecordBase | null,
  effect: RecordEffect | null,
  batch: string | null,
  ordinal: RecordOrdinal | null,
  body: RecordBody,
];

/** A verified native key, commitment, Ref, and decoded immutable record. */
export interface CanonicalRecordEntry {
  /** Exact canonical JSON committed by the entry. */
  readonly canonical: string;
  /** Lowercase SHA-256 of the UTF-8 canonical JSON. */
  readonly commitment: string;
  /** Canonical Ref derived from the verified record and commitment. */
  readonly ref: RecordRef;
  /** Native storage key, containing both commitment and canonical JSON. */
  readonly key: string;
  /** Closed, recursively frozen record tuple. */
  readonly record: CanonicalRecordV1;
}

/** Canonically decoded apply envelope used by command replay validation. */
export interface ImmutableRunApplyEnvelopeV1 {
  /** Fresh command batch UUID, also used as the envelope nonce. */
  readonly authoringNonce: string;
  /** Ordered structural placement writes. */
  readonly placements: readonly {
    /** Placed Block identity. */
    readonly blockId: BlockId;
    /** Canonical structural placement encoding. */
    readonly encoded: string;
  }[];
  /** Ordered immutable InlineContent ownership creations. */
  readonly inlineContents: readonly {
    /** Created InlineContent identity. */
    readonly inlineContentId: InlineContentId;
    /** Owning Block identity. */
    readonly blockId: BlockId;
  }[];
  /** Canonically sorted observed Block deletions. */
  readonly deleteBlockIds: readonly BlockId[];
  /** Canonical actor/effect identity when payload evidence is present. */
  readonly payloadEffectId: string | undefined;
}

/** One decoded canonical v2 payload operation and its replacement base. */
export interface ImmutableRunPayloadOperationV1 {
  /** Existing integrated qualification payload operation. */
  readonly operation: IntegratedPayloadChange;
  /** Winning replacement effect observed for a fine-grained edit, if any. */
  readonly replacementBase: string | undefined;
}

/**
 * Validate and serialize an immutable-run record without invoking JSON hooks.
 *
 * @throws TypeError when a tuple, primitive, embedded codec value, ordering,
 * or kind-specific invariant is outside the closed version-one grammar.
 */
export function encodeRecordV1(record: unknown): string {
  return JSON.stringify(normalizeRecord(record));
}

/**
 * Parse exact canonical version-one record JSON.
 *
 * @remarks
 * Whitespace, alternative escaping, duplicate or unknown embedded object
 * fields, and any JSON that does not exactly re-encode are rejected.
 *
 * @throws TypeError or SyntaxError when input is malformed or noncanonical.
 */
export function decodeRecordV1(canonical: string): CanonicalRecordV1 {
  if (typeof canonical !== "string")
    throw new TypeError("Canonical record JSON must be a string.");
  const parsed: unknown = JSON.parse(canonical);
  const record = normalizeRecord(parsed);
  if (JSON.stringify(record) !== canonical)
    throw new TypeError("Immutable-run record JSON is not canonical.");
  return record;
}

/**
 * Commit a validated record to its exact canonical JSON and native key.
 *
 * @remarks
 * The result owns frozen tuple copies; later mutation of caller input cannot
 * alter its source, Ref, commitment, or storage key.
 */
export function commitRecordV1(record: unknown): CanonicalRecordEntry {
  return entryFromRecord(decodeRecordV1(encodeRecordV1(record)));
}

/**
 * Verify a native immutable-record key and its scalar marker.
 *
 * @throws TypeError when the marker is not exactly `true`, the key grammar or
 * digest is wrong, or the embedded canonical JSON is invalid.
 */
export function decodeRecordKeyV1(
  key: string,
  marker: unknown,
): CanonicalRecordEntry {
  if (marker !== true)
    throw new TypeError("Immutable-run record markers must be exactly true.");
  if (
    typeof key !== "string" ||
    key.length <= 65 ||
    key[64] !== ":" ||
    !DIGEST_PATTERN.test(key.slice(0, 64))
  )
    throw new TypeError("Immutable-run record storage key is invalid.");
  const commitment = key.slice(0, 64);
  const canonical = key.slice(65);
  const record = decodeRecordV1(canonical);
  if (sha256Hex(canonical) !== commitment)
    throw new TypeError(
      "Immutable-run record commitment does not match its key.",
    );
  return freezeEntry({
    canonical,
    commitment,
    ref: freezeTuple2(record[2], commitment),
    key,
    record,
  });
}

/**
 * Validate native record entries and enforce one canonical body per UUID.
 *
 * @remarks
 * Exact duplicate entries deduplicate. A repeated UUID with a different
 * canonical record is equivocation and rejects the complete candidate.
 */
export function decodeRecordSetV1(
  entries: Iterable<readonly [key: string, marker: unknown]>,
): readonly CanonicalRecordEntry[] {
  const byKey = new Map<string, CanonicalRecordEntry>();
  const byUuid = new Map<string, CanonicalRecordEntry>();
  for (const pair of entries) {
    const tuple = exactTuple(pair, 2, "Native record entry");
    const key = requireString(tuple[0], "Native record key");
    const entry = decodeRecordKeyV1(key, tuple[1]);
    const priorForUuid = byUuid.get(entry.record[2]);
    if (
      priorForUuid !== undefined &&
      priorForUuid.canonical !== entry.canonical
    )
      throw new TypeError("Immutable-run record UUID equivocation detected.");
    const priorForKey = byKey.get(entry.key);
    if (priorForKey !== undefined && priorForKey.canonical !== entry.canonical)
      throw new TypeError("Immutable-run storage-key collision detected.");
    byUuid.set(entry.record[2], entry);
    byKey.set(entry.key, entry);
  }
  return Object.freeze([...byKey.values()]);
}

/**
 * Verify that a supplied Ref names one already verified record entry.
 *
 * @returns A fresh frozen Ref rather than caller-owned tuple storage.
 * @throws TypeError when the Ref grammar or exact UUID/commitment differs.
 */
export function matchRecordRefV1(
  reference: unknown,
  entry: CanonicalRecordEntry,
): RecordRef {
  const normalized = normalizeRef(reference, "Record Ref");
  const verified = decodeRecordKeyV1(
    requireString(entry.key, "Committed record key"),
    true,
  );
  if (
    normalized[0] !== verified.record[2] ||
    normalized[1] !== verified.commitment
  )
    throw new TypeError("Record Ref does not match the committed record.");
  return normalized;
}

/**
 * Decode an already canonical apply envelope through the closed record grammar.
 *
 * @throws TypeError when the envelope is noncanonical or its nonce differs from
 * the supplied command batch.
 */
export function decodeImmutableRunApplyEnvelopeV1(
  encoded: string,
  batchUuid: string,
): ImmutableRunApplyEnvelopeV1 {
  const canonical = canonicalEnvelope(encoded, "apply", batchUuid);
  const parsed: unknown = JSON.parse(canonical);
  const object = exactObject(parsed, [
    "kind",
    "authoringNonce",
    "placements",
    "inlineContents",
    "deleteBlockIds",
    "payloadEffectId",
  ]);
  const payloadEffectId = own(object, "payloadEffectId");
  return Object.freeze({
    authoringNonce: requireUuid(
      own(object, "authoringNonce"),
      "Envelope nonce",
    ),
    placements: Object.freeze(
      decodeEnvelopePlacements(own(object, "placements")),
    ),
    inlineContents: Object.freeze(
      decodeEnvelopeInlineContents(own(object, "inlineContents")),
    ),
    deleteBlockIds: Object.freeze(
      decodeEnvelopeBlockIds(own(object, "deleteBlockIds")),
    ),
    payloadEffectId:
      payloadEffectId === null
        ? undefined
        : requireNonemptyString(payloadEffectId, "Envelope payload-effect ID"),
  });
}

/**
 * Decode the canonical operations array carried by v2 payload evidence.
 *
 * @remarks Returned byte arrays and Origins are detached by the record codec.
 */
export function decodeImmutableRunPayloadOperationsV1(
  encoded: string,
): readonly ImmutableRunPayloadOperationV1[] {
  const canonical = canonicalPayloadOperations(encoded);
  const parsed: unknown = JSON.parse(canonical);
  const input = requireArray(parsed, "Payload operations");
  return Object.freeze(
    input.map((candidate) => {
      const decoded = decodePayloadOperation(candidate);
      return Object.freeze({
        operation: decoded.operation,
        replacementBase: decoded.base,
      });
    }),
  );
}

function normalizeRecord(value: unknown): CanonicalRecordV1 {
  const tuple = exactTuple(value, 11, "Immutable-run record");
  const tag = requireString(tuple[0], "Record tag");
  const version = tuple[1];
  const id = requireUuid(tuple[2], "Record UUID");
  const kind = normalizeKind(tuple[3]);
  const scope = normalizeScope(tuple[4]);
  const clock = tuple[5] === null ? null : normalizeClock(tuple[5]);
  const base = tuple[6] === null ? null : normalizeBase(tuple[6]);
  const effect = tuple[7] === null ? null : normalizeEffect(tuple[7]);
  const batch =
    tuple[8] === null ? null : requireUuid(tuple[8], "Record batch UUID");
  const ordinal =
    tuple[9] === null ? null : normalizeOrdinal(tuple[9], "Record ordinal");
  if (tag !== RECORD_TAG || version !== RECORD_VERSION)
    throw new TypeError("Immutable-run record tag or version is invalid.");

  const body = normalizeBody(kind, tuple[10], {
    id,
    scope,
    clock,
    base,
    effect,
    batch,
    ordinal,
  });
  assertKindFields(kind, { id, scope, clock, base, effect, batch, ordinal });
  const record: CanonicalRecordV1 = [
    RECORD_TAG,
    RECORD_VERSION,
    id,
    kind,
    scope,
    clock,
    base,
    effect,
    batch,
    ordinal,
    body,
  ];
  return Object.freeze(record);
}

interface RecordFields {
  readonly id: string;
  readonly scope: RecordScope;
  readonly clock: RecordClock | null;
  readonly base: RecordBase | null;
  readonly effect: RecordEffect | null;
  readonly batch: string | null;
  readonly ordinal: RecordOrdinal | null;
}

function normalizeBody(
  kind: RecordKind,
  body: unknown,
  fields: RecordFields,
): RecordBody {
  switch (kind) {
    case "manifest":
      return normalizeManifestBody(body, fields.effect);
    case "join":
      return normalizeJoinBody(body);
    case "generation":
      return normalizeGenerationBody(body);
    case "run":
      return normalizeRunBody(body);
    case "erase":
      return normalizeEraseBody(body);
    case "live":
      exactTuple(body, 0, "Live body");
      return Object.freeze([]);
    case "retire":
      return normalizeRetireBody(body);
    case "context":
      return normalizeContextBody(body, fields.effect);
    case "envelope":
      return normalizeEnvelopeBody(body, fields.batch);
    case "payload-effect-v2":
      return normalizePayloadEffectBody(body, fields.effect);
    case "transition-v1":
      return normalizeTransitionBody(body);
  }
}

function assertKindFields(kind: RecordKind, fields: RecordFields): void {
  const documentScope = fields.scope[0] === "document";
  if (kind === "join") {
    if (
      !documentScope ||
      fields.clock !== null ||
      fields.base !== null ||
      fields.effect !== null ||
      fields.batch !== null ||
      fields.ordinal !== null
    )
      throw new TypeError("Join record fields are invalid.");
    return;
  }
  if (kind === "manifest") {
    if (
      !documentScope ||
      fields.clock !== null ||
      fields.base !== null ||
      fields.effect === null ||
      fields.batch !== fields.id ||
      fields.ordinal !== null
    )
      throw new TypeError("Manifest record fields are invalid.");
    return;
  }
  if (
    fields.effect === null ||
    fields.batch === null ||
    fields.ordinal === null
  )
    throw new TypeError("Non-root records require effect, batch, and ordinal.");

  if (kind === "generation" || kind === "run" || kind === "erase") {
    if (
      fields.scope[0] !== "text" ||
      fields.clock === null ||
      fields.base === null
    )
      throw new TypeError("Source record fields are invalid.");
    if (
      kind === "generation" &&
      (fields.clock[0] !== "0" || fields.id !== fields.scope[2])
    )
      throw new TypeError("Generation identity or initial clock is invalid.");
    if ((kind === "run" || kind === "erase") && fields.clock[0] === "0")
      throw new TypeError(
        "Run and erase counters must follow generation zero.",
      );
    return;
  }
  if (fields.clock !== null || fields.base !== null)
    throw new TypeError("Non-source member clocks and bases must be null.");
  if (
    (kind === "live" || kind === "retire") &&
    !(fields.scope[0] === "block" || fields.scope[0] === "inline")
  )
    throw new TypeError("Liveness records require an entity scope.");
  if (
    (kind === "context" ||
      kind === "envelope" ||
      kind === "payload-effect-v2" ||
      kind === "transition-v1") &&
    !documentScope
  )
    throw new TypeError("Metadata records require document scope.");
  if (kind === "context") assertMetadataOrdinal(fields.ordinal, "context");
  if (kind === "envelope") assertMetadataOrdinal(fields.ordinal, "envelope");
  if (kind === "payload-effect-v2")
    assertMetadataOrdinal(fields.ordinal, "payload-evidence");
  if (
    kind === "transition-v1" &&
    !(fields.ordinal[0] === "transition" || fields.ordinal[0] === "restore")
  )
    throw new TypeError("Transition record ordinal is invalid.");
}

function assertMetadataOrdinal(
  ordinal: RecordOrdinal,
  category: "context" | "envelope" | "payload-evidence",
): void {
  if (ordinal[0] !== category || ordinal[1] !== 0 || ordinal[2] !== 0)
    throw new TypeError("Metadata record ordinal is invalid.");
}

function normalizeManifestBody(
  value: unknown,
  effect: RecordEffect | null,
): ManifestBody {
  const input = requireArray(value, "Manifest body");
  if (input.length === 0) throw new TypeError("Manifest body is invalid.");
  const discriminator = input[0];
  if (discriminator === "genesis") {
    const tuple = exactTuple(input, 4, "Genesis body");
    const root = requireUuid(tuple[1], "Genesis root Block UUID");
    const settings = exactTuple(tuple[2], 3, "Genesis settings");
    const units = requirePositiveSafeInteger(
      settings[2],
      "Genesis run-source units",
    );
    if (settings[0] !== "settings" || settings[1] !== 1)
      throw new TypeError("Genesis settings are invalid.");
    const context = canonicalContext(tuple[3]);
    if (effect === null || !effectMatchesContext(effect, context))
      throw new TypeError("Genesis context does not match its effect.");
    const normalizedSettings: GenesisBody[2] = Object.freeze([
      "settings",
      1,
      units,
    ]);
    const body: GenesisBody = ["genesis", root, normalizedSettings, context];
    return Object.freeze(body);
  }
  if (discriminator === "apply" || discriminator === "restore")
    return normalizeCommandBody(input, discriminator);
  throw new TypeError("Manifest body discriminator is invalid.");
}

function normalizeCommandBody(
  value: unknown,
  commandKind: "apply" | "restore",
): CommandBody {
  const tuple = exactTuple(value, 8, "Command body");
  const acceptedBase = normalizeRef(tuple[1], "Command accepted-base Ref");
  const context = normalizeRef(tuple[2], "Command context Ref");
  const envelope = normalizeRef(tuple[3], "Command envelope Ref");
  const payloadEvidence =
    tuple[4] === null
      ? null
      : normalizeRef(tuple[4], "Command payload-evidence Ref");
  if (commandKind === "restore" && payloadEvidence !== null)
    throw new TypeError(
      "Restore manifests cannot carry payload-effect evidence.",
    );
  const operations = normalizeOperationRows(tuple[5], commandKind);
  const structuralOutputs = normalizeStructuralOutputs(tuple[6]);
  const descriptorOutputs = normalizeDescriptorOutputs(tuple[7]);
  const refs = [context, envelope];
  if (payloadEvidence !== null) refs.push(payloadEvidence);
  for (const row of operations) refs.push(...row[2]);
  assertUniqueRefs(refs, "Command member Refs");
  const body: CommandBody = [
    commandKind,
    acceptedBase,
    context,
    envelope,
    payloadEvidence,
    operations,
    structuralOutputs,
    descriptorOutputs,
  ];
  return Object.freeze(body);
}

function normalizeOperationRows(
  value: unknown,
  commandKind: "apply" | "restore",
): readonly OperationRow[] {
  const input = requireArray(value, "Command operation rows");
  const rows: OperationRow[] = [];
  for (const candidate of input) {
    const tuple = exactTuple(candidate, 3, "Command operation row");
    const category = normalizeOperationCategory(tuple[0]);
    const index = requireNonnegativeSafeInteger(
      tuple[1],
      "Operation-row index",
    );
    const refs = normalizeRefArray(
      tuple[2],
      "Operation-row member Refs",
      false,
    );
    rows.push(Object.freeze([category, index, refs]));
  }
  if (commandKind === "restore") {
    if (rows.length !== 1 || rows[0]?.[0] !== "restore" || rows[0][1] !== 0)
      throw new TypeError(
        "Restore manifests require one restore operation row.",
      );
    return Object.freeze(rows);
  }
  const order: readonly OperationCategory[] = [
    "block-delete",
    "placement",
    "inline-create",
    "payload",
    "transition",
  ];
  const nextIndex = new Map<OperationCategory, number>();
  let priorOrder = -1;
  for (const row of rows) {
    const categoryOrder = order.indexOf(row[0]);
    if (categoryOrder < 0 || categoryOrder < priorOrder)
      throw new TypeError("Apply operation rows are not in canonical order.");
    const expected = nextIndex.get(row[0]) ?? 0;
    if (row[1] !== expected)
      throw new TypeError("Apply operation-row indices must be dense.");
    if (row[0] === "transition" && row[1] !== 0)
      throw new TypeError("Apply manifests allow at most one transition row.");
    nextIndex.set(row[0], expected + 1);
    priorOrder = categoryOrder;
  }
  return Object.freeze(rows);
}

function normalizeStructuralOutputs(
  value: unknown,
): readonly StructuralOutput[] {
  const input = requireArray(value, "Structural outputs");
  const outputs: StructuralOutput[] = [];
  for (const candidate of input) {
    const fields = requireArray(candidate, "Structural output");
    if (fields.length === 0)
      throw new TypeError("Structural output is invalid.");
    if (fields[0] === "placement") {
      const tuple = exactTuple(fields, 3, "Placement output");
      outputs.push(
        Object.freeze([
          "placement",
          requireUuid(tuple[1], "Placement Block UUID"),
          canonicalEncodedPlacement(tuple[2]),
        ]),
      );
    } else if (fields[0] === "inline-create") {
      const tuple = exactTuple(fields, 3, "Inline-create output");
      outputs.push(
        Object.freeze([
          "inline-create",
          requireUuid(tuple[1], "InlineContent UUID"),
          requireUuid(tuple[2], "Owning Block UUID"),
        ]),
      );
    } else if (fields[0] === "block-delete") {
      const tuple = exactTuple(fields, 2, "Block-delete output");
      outputs.push(
        Object.freeze([
          "block-delete",
          requireUuid(tuple[1], "Deleted Block UUID"),
        ]),
      );
    } else {
      throw new TypeError("Structural output kind is invalid.");
    }
  }
  return Object.freeze(outputs);
}

function normalizeDescriptorOutputs(
  value: unknown,
): readonly DescriptorOutput[] {
  const input = requireArray(value, "Descriptor outputs");
  const outputs: DescriptorOutput[] = [];
  let priorId: string | undefined;
  for (const candidate of input) {
    const fields = requireArray(candidate, "Descriptor output");
    if (fields.length === 0)
      throw new TypeError("Descriptor output is invalid.");
    const id = requireUuid(fields[1], "Descriptor InlineContent UUID");
    if (priorId !== undefined && compareStrings(priorId, id) >= 0)
      throw new TypeError("Descriptor outputs must be ordered by unique UUID.");
    priorId = id;
    if (fields[0] === "text") {
      const tuple = exactTuple(fields, 4, "Text descriptor output");
      outputs.push(
        Object.freeze([
          "text",
          id,
          requireString(tuple[2], "Text descriptor Media Type"),
          normalizeRef(tuple[3], "Text generation Ref"),
        ]),
      );
    } else if (fields[0] === "opaque") {
      const tuple = exactTuple(fields, 5, "Opaque descriptor output");
      outputs.push(
        Object.freeze([
          "opaque",
          id,
          requireString(tuple[2], "Opaque descriptor Media Type"),
          normalizeBytes(tuple[3], "Opaque descriptor bytes"),
          normalizeOrigin(tuple[4]),
        ]),
      );
    } else {
      throw new TypeError("Descriptor output kind is invalid.");
    }
  }
  return Object.freeze(outputs);
}

function normalizeJoinBody(value: unknown): readonly [readonly RecordRef[]] {
  const tuple = exactTuple(value, 1, "Join body");
  const refs = normalizeRefArray(tuple[0], "Join input RootRefs", true);
  const body: readonly [readonly RecordRef[]] = [refs];
  return Object.freeze(body);
}

function normalizeGenerationBody(value: unknown): readonly [string] {
  const tuple = exactTuple(value, 1, "Generation body");
  return Object.freeze([requireString(tuple[0], "Generation Media Type")]);
}

function normalizeRunBody(
  value: unknown,
): readonly [RecordAnchor, string, RecordOrigin] {
  const tuple = exactTuple(value, 3, "Run body");
  const anchor =
    tuple[0] === null ? null : normalizeAnchor(tuple[0], "Run anchor");
  const source = requireString(tuple[1], "Run source");
  if (source.length === 0) throw new TypeError("Run source must be nonempty.");
  return Object.freeze([anchor, source, normalizeOrigin(tuple[2])]);
}

function normalizeEraseBody(
  value: unknown,
): readonly [readonly ObservedInterval[]] {
  const tuple = exactTuple(value, 1, "Erase body");
  const input = requireArray(tuple[0], "Observed intervals");
  if (input.length === 0)
    throw new TypeError("Observed interval list must be nonempty.");
  const intervals: ObservedInterval[] = [];
  let prior: ObservedInterval | undefined;
  for (const candidate of input) {
    const fields = exactTuple(candidate, 3, "Observed interval");
    const interval: ObservedInterval = Object.freeze([
      normalizeRef(fields[0], "Observed interval run Ref"),
      requireNonnegativeSafeInteger(fields[1], "Observed interval start"),
      requireNonnegativeSafeInteger(fields[2], "Observed interval end"),
    ]);
    if (interval[1] >= interval[2])
      throw new TypeError("Observed intervals must have positive length.");
    if (prior !== undefined) {
      const order = compareRefs(prior[0], interval[0]);
      if (order > 0 || (order === 0 && prior[1] > interval[1]))
        throw new TypeError("Observed intervals are not canonically sorted.");
      if (order === 0 && prior[2] >= interval[1])
        throw new TypeError("Observed intervals must be unioned canonically.");
    }
    intervals.push(interval);
    prior = interval;
  }
  return Object.freeze([Object.freeze(intervals)]);
}

function normalizeRetireBody(value: unknown): readonly [readonly RecordRef[]] {
  const tuple = exactTuple(value, 1, "Retire body");
  const refs = normalizeRefArray(tuple[0], "Retired live Refs", true);
  return Object.freeze([refs]);
}

function normalizeContextBody(
  value: unknown,
  effect: RecordEffect | null,
): readonly [string] {
  const tuple = exactTuple(value, 1, "Context body");
  const context = canonicalContext(tuple[0]);
  if (effect === null || !effectMatchesContext(effect, context))
    throw new TypeError("Context body does not match the record effect.");
  return Object.freeze([context]);
}

function normalizeEnvelopeBody(
  value: unknown,
  batch: string | null,
): readonly ["apply" | "restore", string] {
  const tuple = exactTuple(value, 2, "Envelope body");
  if (!(tuple[0] === "apply" || tuple[0] === "restore"))
    throw new TypeError("Envelope kind is invalid.");
  if (batch === null)
    throw new TypeError("Envelope record requires a batch UUID.");
  const encoded = canonicalEnvelope(tuple[1], tuple[0], batch);
  return Object.freeze([tuple[0], encoded]);
}

function normalizePayloadEffectBody(
  value: unknown,
  effect: RecordEffect | null,
): readonly [string, RecordRef, string] {
  const tuple = exactTuple(value, 3, "Payload-effect-v2 body");
  const identity = canonicalEffectIdentity(tuple[0]);
  if (
    effect === null ||
    identity !==
      qualificationEffectIdentity({
        actorId: effect[0],
        effectId: effect[1],
      })
  )
    throw new TypeError("Payload-effect identity does not match its record.");
  return Object.freeze([
    identity,
    normalizeRef(tuple[1], "Payload-effect ancestry RootRef"),
    canonicalPayloadOperations(tuple[2]),
  ]);
}

function normalizeTransitionBody(value: unknown): TransitionBody {
  const tuple = exactTuple(value, 7, "Transition body");
  if (tuple[0] !== 1) throw new TypeError("Transition version is invalid.");
  const kind = normalizeTransitionKind(tuple[1]);
  const sourceRoot = normalizeRef(tuple[2], "Transition source RootRef");
  const sources = normalizeTransitionScopes(tuple[3], "source");
  const destinations = normalizeTransitionScopes(tuple[4], "destination");
  if (
    (kind === "split" && !(sources.length === 1 && destinations.length >= 2)) ||
    (kind === "merge" && !(sources.length >= 2 && destinations.length === 1)) ||
    ((kind === "copy" || kind === "restore") &&
      (sources.length === 0 || destinations.length === 0))
  )
    throw new TypeError("Transition source/destination arity is invalid.");
  const spans = normalizeSpanMappings(tuple[5], kind);
  const boundaries = normalizeBoundaryMappings(tuple[6], kind);
  const body: TransitionBody = [
    1,
    kind,
    sourceRoot,
    sources,
    destinations,
    spans,
    boundaries,
  ];
  return Object.freeze(body);
}

function normalizeTransitionScopes(
  value: unknown,
  label: string,
): readonly TransitionScope[] {
  const input = requireArray(value, `Transition ${label} scopes`);
  const scopes: TransitionScope[] = [];
  const seen = new Set<string>();
  for (const candidate of input) {
    const tuple = exactTuple(candidate, 3, `Transition ${label} scope`);
    const scope: TransitionScope = Object.freeze([
      requireUuid(tuple[0], "Transition Block UUID"),
      requireUuid(tuple[1], "Transition InlineContent UUID"),
      normalizeRef(tuple[2], "Transition generation Ref"),
    ]);
    const key = JSON.stringify(scope);
    if (seen.has(key))
      throw new TypeError("Transition scopes must be duplicate-free.");
    seen.add(key);
    scopes.push(scope);
  }
  return Object.freeze(scopes);
}

function normalizeSpanMappings(
  value: unknown,
  kind: TransitionBody[1],
): readonly SpanMapping[] {
  const input = requireArray(value, "Transition span mappings");
  const mappings: SpanMapping[] = [];
  for (const candidate of input) {
    const tuple = exactTuple(candidate, 9, "Transition span mapping");
    const sourceStart = requireNonnegativeSafeInteger(
      tuple[2],
      "Transition source start",
    );
    const sourceEnd = requireNonnegativeSafeInteger(
      tuple[3],
      "Transition source end",
    );
    const destinationStart = requireNonnegativeSafeInteger(
      tuple[6],
      "Transition destination start",
    );
    const destinationEnd = requireNonnegativeSafeInteger(
      tuple[7],
      "Transition destination end",
    );
    if (
      sourceStart >= sourceEnd ||
      destinationStart >= destinationEnd ||
      sourceEnd - sourceStart !== destinationEnd - destinationStart
    )
      throw new TypeError("Transition spans require equal positive lengths.");
    const relation = normalizeRelation(tuple[8], kind);
    mappings.push(
      Object.freeze([
        normalizeTransitionScope(tuple[0]),
        normalizeRef(tuple[1], "Transition source run Ref"),
        sourceStart,
        sourceEnd,
        normalizeTransitionScope(tuple[4]),
        normalizeRef(tuple[5], "Transition destination run Ref"),
        destinationStart,
        destinationEnd,
        relation,
      ]),
    );
  }
  return Object.freeze(mappings);
}

function normalizeBoundaryMappings(
  value: unknown,
  kind: TransitionBody[1],
): readonly BoundaryMapping[] {
  const input = requireArray(value, "Transition boundary mappings");
  const mappings: BoundaryMapping[] = [];
  for (const candidate of input) {
    const tuple = exactTuple(candidate, 5, "Transition boundary mapping");
    mappings.push(
      Object.freeze([
        normalizeTransitionScope(tuple[0]),
        normalizeBoundary(tuple[1]),
        normalizeTransitionScope(tuple[2]),
        normalizeBoundary(tuple[3]),
        normalizeRelation(tuple[4], kind),
      ]),
    );
  }
  return Object.freeze(mappings);
}

function normalizeTransitionScope(value: unknown): TransitionScope {
  const tuple = exactTuple(value, 3, "Transition mapping scope");
  return Object.freeze([
    requireUuid(tuple[0], "Transition Block UUID"),
    requireUuid(tuple[1], "Transition InlineContent UUID"),
    normalizeRef(tuple[2], "Transition generation Ref"),
  ]);
}

function normalizeBoundary(value: unknown): TransitionBoundary {
  const input = requireArray(value, "Transition boundary");
  if (input.length === 0)
    throw new TypeError("Transition boundary is invalid.");
  if (input[0] === "at") {
    const tuple = exactTuple(input, 3, "Transition source boundary");
    return Object.freeze([
      "at",
      normalizeRef(tuple[1], "Transition boundary run Ref"),
      requireNonnegativeSafeInteger(tuple[2], "Transition boundary offset"),
    ]);
  }
  if (input[0] === "empty") {
    const tuple = exactTuple(input, 2, "Empty transition boundary");
    return Object.freeze([
      "empty",
      normalizeRef(tuple[1], "Empty-boundary generation Ref"),
    ]);
  }
  throw new TypeError("Transition boundary kind is invalid.");
}

function normalizeRelation(
  value: unknown,
  kind: TransitionBody[1],
): TransitionRelation {
  const expected: TransitionRelation =
    kind === "split" || kind === "merge" ? "lineage" : kind;
  if (value !== expected)
    throw new TypeError("Transition mapping relation is invalid.");
  return expected;
}

function canonicalContext(value: unknown): string {
  const encoded = requireString(value, "Encoded effect context");
  const parsed: unknown = JSON.parse(encoded);
  const object = exactObject(parsed, ["effectId", "actorId"], ["source"]);
  const effectId = requireNonemptyString(
    own(object, "effectId"),
    "Context effect ID",
  );
  const actorId = requireNonemptyString(
    own(object, "actorId"),
    "Context actor ID",
  );
  const sourceValue = ownOptional(object, "source");
  let canonical: string;
  if (sourceValue === undefined) {
    canonical = encodeEffectContext({ effectId, actorId });
  } else {
    const source = exactObject(sourceValue, ["kind", "reference"], []);
    const sourceKind = own(source, "kind");
    if (!(sourceKind === "copy" || sourceKind === "restore"))
      throw new TypeError("Context derivation kind is invalid.");
    canonical = encodeEffectContext({
      effectId,
      actorId,
      source: {
        kind: sourceKind,
        reference: requireNonemptyString(
          own(source, "reference"),
          "Context source reference",
        ),
      },
    });
  }
  if (canonical !== encoded)
    throw new TypeError("Effect context is not canonically encoded.");
  return canonical;
}

function effectMatchesContext(effect: RecordEffect, context: string): boolean {
  const parsed: unknown = JSON.parse(context);
  if (!isObject(parsed)) return false;
  return (
    own(parsed, "actorId") === effect[0] &&
    own(parsed, "effectId") === effect[1]
  );
}

function canonicalEffectIdentity(value: unknown): string {
  const encoded = requireString(value, "Encoded effect identity");
  const parsed: unknown = JSON.parse(encoded);
  const tuple = exactTuple(parsed, 2, "Effect identity");
  const actorId = requireNonemptyString(tuple[0], "Effect actor ID");
  const effectId = requireNonemptyString(tuple[1], "Effect ID");
  const canonical = qualificationEffectIdentity({ actorId, effectId });
  if (canonical !== encoded)
    throw new TypeError("Effect identity is not canonically encoded.");
  return canonical;
}

function canonicalEnvelope(
  value: unknown,
  kind: "apply" | "restore",
  batch: string,
): string {
  const encoded = requireString(value, "Encoded effect envelope");
  const parsed: unknown = JSON.parse(encoded);
  if (kind === "apply") {
    const object = exactObject(parsed, [
      "kind",
      "authoringNonce",
      "placements",
      "inlineContents",
      "deleteBlockIds",
      "payloadEffectId",
    ]);
    if (own(object, "kind") !== "apply")
      throw new TypeError("Applied envelope kind is invalid.");
    const nonce = requireUuid(own(object, "authoringNonce"), "Envelope nonce");
    if (nonce !== batch)
      throw new TypeError("Envelope nonce must equal its batch UUID.");
    const placements = decodeEnvelopePlacements(own(object, "placements"));
    const inlineContents = decodeEnvelopeInlineContents(
      own(object, "inlineContents"),
    );
    const deleteBlockIds = decodeEnvelopeBlockIds(
      own(object, "deleteBlockIds"),
    );
    const rawPayloadId = own(object, "payloadEffectId");
    const payloadId =
      rawPayloadId === null
        ? undefined
        : requireNonemptyString(rawPayloadId, "Envelope payload-effect ID");
    const canonical = encodeAppliedEffectEnvelope(
      nonce,
      placements,
      inlineContents,
      deleteBlockIds,
      payloadId,
    );
    if (canonical !== encoded)
      throw new TypeError("Applied effect envelope is not canonical.");
    return canonical;
  }
  const object = exactObject(parsed, ["kind", "authoringNonce", "target"]);
  if (own(object, "kind") !== "restore")
    throw new TypeError("Restore envelope kind is invalid.");
  const nonce = requireUuid(own(object, "authoringNonce"), "Envelope nonce");
  if (nonce !== batch)
    throw new TypeError("Envelope nonce must equal its batch UUID.");
  const target = decodeHistoricalTarget(own(object, "target"));
  const canonical = encodeRestoreEffectEnvelope(
    nonce,
    target,
    STRING_POSITION_CODEC,
  );
  if (canonical !== encoded)
    throw new TypeError("Restore effect envelope is not canonical.");
  return canonical;
}

function decodeEnvelopePlacements(
  value: unknown,
): readonly { readonly blockId: BlockId; readonly encoded: string }[] {
  const input = requireArray(value, "Envelope placements");
  return input.map((candidate) => {
    const tuple = exactTuple(candidate, 2, "Envelope placement");
    return Object.freeze({
      blockId: parseBlockId(requireUuid(tuple[0], "Placement Block UUID")),
      encoded: canonicalEncodedPlacement(tuple[1]),
    });
  });
}

function decodeEnvelopeInlineContents(value: unknown): readonly {
  readonly inlineContentId: InlineContentId;
  readonly blockId: BlockId;
}[] {
  const input = requireArray(value, "Envelope InlineContent creations");
  return input.map((candidate) => {
    const tuple = exactTuple(candidate, 2, "Envelope InlineContent creation");
    return Object.freeze({
      inlineContentId: parseInlineContentId(
        requireUuid(tuple[0], "Envelope InlineContent UUID"),
      ),
      blockId: parseBlockId(requireUuid(tuple[1], "Envelope owner Block UUID")),
    });
  });
}

function decodeEnvelopeBlockIds(value: unknown): readonly BlockId[] {
  const input = requireArray(value, "Envelope deleted Block IDs");
  return input.map((candidate) =>
    parseBlockId(requireUuid(candidate, "Envelope deleted Block UUID")),
  );
}

const STRING_POSITION_CODEC: StructuralPositionCodec<string> = Object.freeze({
  encode(position: string): string {
    return position;
  },
  decode(encoded: string): string {
    return encoded;
  },
});

function canonicalEncodedPlacement(value: unknown): string {
  const encoded = requireString(value, "Encoded structural placement");
  const placement = decodeStructuralPlacement(encoded, STRING_POSITION_CODEC);
  if (encodeStructuralPlacement(placement, STRING_POSITION_CODEC) !== encoded)
    throw new TypeError("Structural placement is not canonically encoded.");
  return encoded;
}

function decodeHistoricalTarget(
  value: unknown,
): IntegratedDocumentSnapshot<string> {
  const encoded = requireString(value, "Restore historical target");
  const parsed: unknown = JSON.parse(encoded);
  const object = exactObject(parsed, [
    "rootId",
    "blockLiveness",
    "placements",
    "inlineContentOwners",
    "payloads",
  ]);
  const rootId = parseBlockId(
    requireUuid(own(object, "rootId"), "Historical root Block UUID"),
  );
  const blockLiveness = decodeHistoricalBlockLiveness(
    own(object, "blockLiveness"),
  );
  const placements = decodeHistoricalPlacements(own(object, "placements"));
  const owners = decodeHistoricalOwners(own(object, "inlineContentOwners"));
  const payloads = decodeHistoricalPayloads(own(object, "payloads"));
  return {
    rootId,
    blockLiveness,
    placements,
    inlineContentOwners: owners,
    payloads,
  };
}

function decodeHistoricalBlockLiveness(
  value: unknown,
): ReadonlyMap<BlockId, boolean> {
  const result = new Map<BlockId, boolean>();
  for (const candidate of requireArray(value, "Historical Block liveness")) {
    const tuple = exactTuple(candidate, 2, "Historical Block liveness entry");
    const id = parseBlockId(
      requireUuid(tuple[0], "Historical liveness Block UUID"),
    );
    if (typeof tuple[1] !== "boolean" || result.has(id))
      throw new TypeError("Historical Block liveness entry is invalid.");
    result.set(id, tuple[1]);
  }
  return result;
}

function decodeHistoricalPlacements(
  value: unknown,
): IntegratedDocumentSnapshot<string>["placements"] {
  const result = new Map<
    BlockId,
    ReturnType<typeof decodeStructuralPlacement<string>>
  >();
  for (const candidate of requireArray(value, "Historical placements")) {
    const tuple = exactTuple(candidate, 2, "Historical placement entry");
    const id = parseBlockId(
      requireUuid(tuple[0], "Historical placement Block UUID"),
    );
    if (result.has(id))
      throw new TypeError("Historical placement IDs must be unique.");
    result.set(
      id,
      decodeStructuralPlacement(
        requireString(tuple[1], "Historical encoded placement"),
        STRING_POSITION_CODEC,
      ),
    );
  }
  return result;
}

function decodeHistoricalOwners(
  value: unknown,
): ReadonlyMap<InlineContentId, BlockId> {
  const result = new Map<InlineContentId, BlockId>();
  for (const candidate of requireArray(
    value,
    "Historical InlineContent owners",
  )) {
    const tuple = exactTuple(candidate, 2, "Historical owner entry");
    const id = parseInlineContentId(
      requireUuid(tuple[0], "Historical InlineContent UUID"),
    );
    if (result.has(id))
      throw new TypeError("Historical InlineContent IDs must be unique.");
    result.set(
      id,
      parseBlockId(requireUuid(tuple[1], "Historical owner Block UUID")),
    );
  }
  return result;
}

function decodeHistoricalPayloads(
  value: unknown,
): ReadonlyMap<InlineContentId, QualificationPayloadSnapshot> {
  const result = new Map<InlineContentId, QualificationPayloadSnapshot>();
  for (const candidate of requireArray(value, "Historical payloads")) {
    const object = exactObject(candidate, ["id", "value"]);
    const id = parseInlineContentId(
      requireUuid(own(object, "id"), "Historical payload InlineContent UUID"),
    );
    if (result.has(id))
      throw new TypeError("Historical payload IDs must be unique.");
    result.set(id, decodeHistoricalPayload(own(object, "value")));
  }
  return result;
}

function decodeHistoricalPayload(value: unknown): QualificationPayloadSnapshot {
  if (!isObject(value)) throw new TypeError("Historical payload is invalid.");
  const kind = own(value, "kind");
  if (kind === "text") {
    const object = exactObject(value, ["kind", "mediaType", "text", "spans"]);
    return Object.freeze({
      kind: "text",
      mediaType: requireString(
        own(object, "mediaType"),
        "Historical Media Type",
      ),
      text: requireString(own(object, "text"), "Historical text"),
      spans: decodeHistoricalSpans(own(object, "spans")),
    });
  }
  if (kind === "opaque") {
    const object = exactObject(value, ["kind", "mediaType", "bytes", "origin"]);
    return Object.freeze({
      kind: "opaque",
      mediaType: requireString(
        own(object, "mediaType"),
        "Historical Media Type",
      ),
      bytes: Uint8Array.from(
        normalizeBytes(own(object, "bytes"), "Historical bytes"),
      ),
      origin: normalizeOriginObject(own(object, "origin")),
    });
  }
  throw new TypeError("Historical payload kind is invalid.");
}

function decodeHistoricalSpans(
  value: unknown,
): readonly QualificationTextSpan[] {
  const spans: QualificationTextSpan[] = [];
  for (const candidate of requireArray(value, "Historical text spans")) {
    const object = exactObject(candidate, ["text", "origin"]);
    spans.push(
      Object.freeze({
        text: requireString(own(object, "text"), "Historical span text"),
        origin: normalizeOriginObject(own(object, "origin")),
      }),
    );
  }
  return Object.freeze(spans);
}

function canonicalPayloadOperations(value: unknown): string {
  const encoded = requireString(value, "Encoded payload operations");
  const parsed: unknown = JSON.parse(encoded);
  const input = requireArray(parsed, "Payload operations");
  if (input.length === 0)
    throw new TypeError("Payload-effect operations must be nonempty.");
  const operations: IntegratedPayloadChange[] = [];
  const bases: (string | undefined)[] = [];
  for (const candidate of input) {
    const decoded = decodePayloadOperation(candidate);
    operations.push(decoded.operation);
    bases.push(decoded.base);
  }
  const wrapper = encodePayloadEffect("record-codec", [], operations, bases);
  const wrapped: unknown = JSON.parse(wrapper);
  const object = exactObject(wrapped, ["effectId", "parents", "operations"]);
  const canonical = JSON.stringify(own(object, "operations"));
  if (canonical !== encoded)
    throw new TypeError("Payload operations are not canonically encoded.");
  return canonical;
}

function decodePayloadOperation(value: unknown): {
  readonly operation: IntegratedPayloadChange;
  readonly base: string | undefined;
} {
  if (!isObject(value)) throw new TypeError("Payload operation is invalid.");
  const kind = own(value, "kind");
  if (kind === "replace-text") {
    const object = exactObject(value, [
      "kind",
      "inlineContentId",
      "mediaType",
      "text",
      "origin",
    ]);
    return {
      operation: {
        kind,
        inlineContentId: parseInlineContentId(
          requireUuid(
            own(object, "inlineContentId"),
            "Payload InlineContent UUID",
          ),
        ),
        mediaType: requireString(
          own(object, "mediaType"),
          "Payload Media Type",
        ),
        text: requireString(own(object, "text"), "Replacement text"),
        origin: decodeEncodedOrigin(own(object, "origin")),
      },
      base: undefined,
    };
  }
  if (kind === "replace-opaque") {
    const object = exactObject(value, [
      "kind",
      "inlineContentId",
      "mediaType",
      "bytes",
      "origin",
    ]);
    return {
      operation: {
        kind,
        inlineContentId: parseInlineContentId(
          requireUuid(
            own(object, "inlineContentId"),
            "Payload InlineContent UUID",
          ),
        ),
        mediaType: requireString(
          own(object, "mediaType"),
          "Payload Media Type",
        ),
        bytes: Uint8Array.from(
          normalizeBytes(own(object, "bytes"), "Payload bytes"),
        ),
        origin: decodeEncodedOrigin(own(object, "origin")),
      },
      base: undefined,
    };
  }
  if (kind === "insert-text") {
    const object = exactObject(
      value,
      ["kind", "inlineContentId", "offset", "text", "origin"],
      ["baseReplacementEffectId"],
    );
    const base = decodeReplacementBase(object);
    return {
      operation: {
        kind,
        inlineContentId: parseInlineContentId(
          requireUuid(
            own(object, "inlineContentId"),
            "Payload InlineContent UUID",
          ),
        ),
        offset: requireNonnegativeSafeInteger(
          own(object, "offset"),
          "Insert offset",
        ),
        text: requireNonemptyString(own(object, "text"), "Inserted text"),
        origin: decodeEncodedOrigin(own(object, "origin")),
      },
      base,
    };
  }
  if (kind === "delete-text") {
    const object = exactObject(
      value,
      ["kind", "inlineContentId", "start", "end"],
      ["baseReplacementEffectId"],
    );
    const start = requireNonnegativeSafeInteger(
      own(object, "start"),
      "Delete start",
    );
    const end = requireNonnegativeSafeInteger(own(object, "end"), "Delete end");
    if (start > end) throw new TypeError("Payload deletion range is invalid.");
    return {
      operation: {
        kind,
        inlineContentId: parseInlineContentId(
          requireUuid(
            own(object, "inlineContentId"),
            "Payload InlineContent UUID",
          ),
        ),
        start,
        end,
      },
      base: decodeReplacementBase(object),
    };
  }
  throw new TypeError("Payload operation kind is invalid.");
}

function decodeReplacementBase(object: object): string | undefined {
  const value = ownOptional(object, "baseReplacementEffectId");
  return value === undefined
    ? undefined
    : requireNonemptyString(value, "Payload replacement base");
}

function decodeEncodedOrigin(value: unknown): QualificationOrigin {
  const encoded = requireString(value, "Encoded payload Origin");
  const parsed: unknown = JSON.parse(encoded);
  const origin = normalizeOriginObject(parsed);
  if (encodeQualificationOrigin(origin) !== encoded)
    throw new TypeError("Payload Origin is not canonically encoded.");
  return origin;
}

function normalizeOriginObject(value: unknown): QualificationOrigin {
  const object = exactObject(value, ["id", "kind"]);
  const origin = {
    id: requireString(own(object, "id"), "Origin ID"),
    kind: normalizeOriginKind(own(object, "kind")),
  };
  assertQualificationOrigin(origin);
  return Object.freeze(origin);
}

function normalizeOrigin(value: unknown): RecordOrigin {
  const tuple = exactTuple(value, 2, "Record Origin");
  const kind = normalizeOriginKind(tuple[0]);
  const id = requireString(tuple[1], "Origin ID");
  assertQualificationOrigin({ kind, id });
  return Object.freeze([kind, id]);
}

function normalizeOriginKind(value: unknown): QualificationOrigin["kind"] {
  if (
    value === "human" ||
    value === "imported" ||
    value === "automation" ||
    value === "ai" ||
    value === "unknown"
  )
    return value;
  throw new TypeError("Qualification Origin kind is invalid.");
}

function normalizeScope(value: unknown): RecordScope {
  const input = requireArray(value, "Record scope");
  if (input.length === 0) throw new TypeError("Record scope is invalid.");
  if (input[0] === "document") {
    exactTuple(input, 1, "Document scope");
    return Object.freeze(["document"]);
  }
  if (input[0] === "block" || input[0] === "inline") {
    const tuple = exactTuple(input, 2, "Entity scope");
    return Object.freeze([
      input[0],
      requireUuid(tuple[1], "Scoped entity UUID"),
    ]);
  }
  if (input[0] === "text") {
    const tuple = exactTuple(input, 3, "Text scope");
    return Object.freeze([
      "text",
      requireUuid(tuple[1], "Scoped InlineContent UUID"),
      requireUuid(tuple[2], "Scoped generation UUID"),
    ]);
  }
  throw new TypeError("Record scope kind is invalid.");
}

function normalizeClock(value: unknown): RecordClock {
  const tuple = exactTuple(value, 2, "Record clock");
  const counter = requireString(tuple[0], "Record counter");
  if (!COUNTER_PATTERN.test(counter))
    throw new TypeError("Record counter is not canonical decimal text.");
  return Object.freeze([counter, requireUuid(tuple[1], "Record replica UUID")]);
}

function normalizeBase(value: unknown): RecordBase {
  const tuple = exactTuple(value, 2, "Record base");
  return Object.freeze([
    normalizeRef(tuple[0], "Accepted-root Ref"),
    tuple[1] === null
      ? null
      : normalizeRef(tuple[1], "Previous source-member Ref"),
  ]);
}

function normalizeEffect(value: unknown): RecordEffect {
  const tuple = exactTuple(value, 2, "Record effect");
  return Object.freeze([
    requireNonemptyString(tuple[0], "Record actor ID"),
    requireNonemptyString(tuple[1], "Record effect ID"),
  ]);
}

function normalizeOrdinal(value: unknown, label: string): RecordOrdinal {
  const tuple = exactTuple(value, 3, label);
  return Object.freeze([
    normalizeOperationCategory(tuple[0]),
    requireNonnegativeSafeInteger(tuple[1], `${label} operation index`),
    requireNonnegativeSafeInteger(tuple[2], `${label} member index`),
  ]);
}

function normalizeAnchor(
  value: unknown,
  label: string,
): NonNullable<RecordAnchor> {
  const tuple = exactTuple(value, 2, label);
  const offset = requirePositiveSafeInteger(tuple[1], `${label} source offset`);
  return Object.freeze([normalizeRef(tuple[0], `${label} run Ref`), offset]);
}

function normalizeRef(value: unknown, label: string): RecordRef {
  const tuple = exactTuple(value, 2, label);
  const uuid = requireUuid(tuple[0], `${label} UUID`);
  const commitment = requireString(tuple[1], `${label} commitment`);
  if (!DIGEST_PATTERN.test(commitment))
    throw new TypeError(`${label} commitment is invalid.`);
  return freezeTuple2(uuid, commitment);
}

function normalizeRefArray(
  value: unknown,
  label: string,
  requireNonempty: boolean,
): readonly RecordRef[] {
  const input = requireArray(value, label);
  if (requireNonempty && input.length === 0)
    throw new TypeError(`${label} must be nonempty.`);
  const refs: RecordRef[] = [];
  let prior: RecordRef | undefined;
  for (const candidate of input) {
    const ref = normalizeRef(candidate, label);
    if (requireNonempty && prior !== undefined && compareRefs(prior, ref) >= 0)
      throw new TypeError(`${label} must be sorted and unique.`);
    refs.push(ref);
    prior = ref;
  }
  return Object.freeze(refs);
}

function assertUniqueRefs(refs: readonly RecordRef[], label: string): void {
  const seen = new Set<string>();
  for (const ref of refs) {
    const key = `${ref[0]}:${ref[1]}`;
    if (seen.has(key)) throw new TypeError(`${label} must not repeat.`);
    seen.add(key);
  }
}

function normalizeBytes(value: unknown, label: string): readonly number[] {
  const input = requireArray(value, label);
  const bytes: number[] = [];
  for (const candidate of input) {
    const byte = requireNonnegativeSafeInteger(candidate, label);
    if (byte > 255) throw new TypeError(`${label} contains a non-byte value.`);
    bytes.push(byte);
  }
  return Object.freeze(bytes);
}

function normalizeKind(value: unknown): RecordKind {
  if (
    value === "manifest" ||
    value === "join" ||
    value === "generation" ||
    value === "run" ||
    value === "erase" ||
    value === "live" ||
    value === "retire" ||
    value === "context" ||
    value === "envelope" ||
    value === "payload-effect-v2" ||
    value === "transition-v1"
  )
    return value;
  throw new TypeError("Record kind is invalid.");
}

function normalizeOperationCategory(value: unknown): OperationCategory {
  if (
    value === "context" ||
    value === "envelope" ||
    value === "payload-evidence" ||
    value === "block-delete" ||
    value === "placement" ||
    value === "inline-create" ||
    value === "payload" ||
    value === "transition" ||
    value === "restore"
  )
    return value;
  throw new TypeError("Record operation category is invalid.");
}

function normalizeTransitionKind(value: unknown): TransitionBody[1] {
  if (
    value === "split" ||
    value === "merge" ||
    value === "copy" ||
    value === "restore"
  )
    return value;
  throw new TypeError("Transition kind is invalid.");
}

function entryFromRecord(record: CanonicalRecordV1): CanonicalRecordEntry {
  const canonical = JSON.stringify(record);
  const commitment = sha256Hex(canonical);
  return freezeEntry({
    canonical,
    commitment,
    ref: freezeTuple2(record[2], commitment),
    key: `${commitment}:${canonical}`,
    record,
  });
}

function freezeEntry(entry: CanonicalRecordEntry): CanonicalRecordEntry {
  return Object.freeze(entry);
}

function sha256Hex(value: string): string {
  let result = "";
  for (const byte of digest(new TextEncoder().encode(value)))
    result += byte.toString(16).padStart(2, "0");
  return result;
}

function exactTuple(
  value: unknown,
  length: number,
  label: string,
): readonly unknown[] {
  const tuple = snapshotArray(value, label);
  if (tuple.length !== length)
    throw new TypeError(`${label} must be a tuple of arity ${length}.`);
  return tuple;
}

function requireArray(value: unknown, label: string): readonly unknown[] {
  return snapshotArray(value, label);
}

function snapshotArray(value: unknown, label: string): readonly unknown[] {
  if (!Array.isArray(value)) throw new TypeError(`${label} must be an array.`);
  const length = value.length;
  const snapshot: unknown[] = [];
  for (let index = 0; index < length; index += 1) snapshot.push(value[index]);
  return snapshot;
}

function exactObject(
  value: unknown,
  required: readonly string[],
  optional: readonly string[] = [],
): object {
  if (!isObject(value)) throw new TypeError("Embedded JSON object is invalid.");
  const keys = Object.keys(value);
  if (
    required.some((key) => !Object.hasOwn(value, key)) ||
    keys.some((key) => !required.includes(key) && !optional.includes(key))
  )
    throw new TypeError("Embedded JSON object has unknown or missing fields.");
  return value;
}

function isObject(value: unknown): value is object {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function own(value: object, key: string): unknown {
  if (!Object.hasOwn(value, key))
    throw new TypeError(`Embedded JSON field ${key} is missing.`);
  return Reflect.get(value, key);
}

function ownOptional(value: object, key: string): unknown {
  return Object.hasOwn(value, key) ? Reflect.get(value, key) : undefined;
}

function requireString(value: unknown, label: string): string {
  if (typeof value !== "string")
    throw new TypeError(`${label} must be a string.`);
  return value;
}

function requireNonemptyString(value: unknown, label: string): string {
  const result = requireString(value, label);
  if (result.length === 0) throw new TypeError(`${label} must be nonempty.`);
  return result;
}

function requireUuid(value: unknown, label: string): string {
  const result = requireString(value, label);
  if (!isCanonicalUuidV4(result))
    throw new TypeError(
      `${label} must be a canonical lowercase UUID-v4 value.`,
    );
  return result;
}

function requireNonnegativeSafeInteger(value: unknown, label: string): number {
  if (
    typeof value !== "number" ||
    !Number.isSafeInteger(value) ||
    value < 0 ||
    Object.is(value, -0)
  )
    throw new TypeError(`${label} must be a nonnegative safe integer.`);
  return value;
}

function requirePositiveSafeInteger(value: unknown, label: string): number {
  const result = requireNonnegativeSafeInteger(value, label);
  if (result === 0) throw new TypeError(`${label} must be positive.`);
  return result;
}

function compareRefs(left: RecordRef, right: RecordRef): number {
  const uuid = compareStrings(left[0], right[0]);
  return uuid === 0 ? compareStrings(left[1], right[1]) : uuid;
}

function compareStrings(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function freezeTuple2(left: string, right: string): RecordRef {
  return Object.freeze([left, right]);
}
