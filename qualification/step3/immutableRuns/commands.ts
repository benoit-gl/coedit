import {
  encodeStructuralPlacement,
  type StructuralPositionCodec,
} from "../../../src/carrier/index.js";
import {
  isCanonicalUuidV4,
  parseBlockId,
  parseInlineContentId,
  type BlockId,
  type InlineContentId,
} from "../../../src/domain/index.js";
import type {
  IntegratedDocumentChange,
  IntegratedDocumentSnapshot,
  IntegratedPayloadChange,
} from "../integrated/carrier.js";
import {
  encodeEffectContext,
  qualificationEffectIdentity,
  type QualificationEffectContext,
} from "../integrated/effectContext.js";
import {
  encodeAppliedEffectEnvelope,
  encodeRestoreEffectEnvelope,
} from "../integrated/effectEnvelope.js";
import { encodePayloadEffect } from "../integrated/replacementEvidence.js";
import { decodeHistoricalState } from "../integrated/historicalState.js";
import {
  assertQualificationOrigin,
  isQualificationFineGrainedMediaType,
  type QualificationOrigin,
} from "../payload/carrier.js";
import {
  ImmutableRunProtocolV1,
  type ImmutableRunGenerationProjectionV1,
} from "./protocol.js";
import {
  commitRecordV1,
  decodeImmutableRunApplyEnvelopeV1,
  decodeImmutableRunPayloadOperationsV1,
  type CanonicalRecordEntry,
  type CanonicalRecordV1,
  type CommandBody,
  type DescriptorOutput,
  type ImmutableRunPayloadOperationV1,
  type ObservedInterval,
  type OperationCategory,
  type OperationRow,
  type RecordEffect,
  type RecordOrigin,
  type RecordRef,
  type StructuralOutput,
  type TextScope,
  type TransitionBody,
  type TransitionBoundary,
  type TransitionScope,
} from "./record.js";
import {
  ImmutableRunSourceIndex,
  type ImmutableRunPreparedIndexChange,
} from "./sourceIndex.js";

const RECORD_TAG = "coedit-step3-record";
const RECORD_VERSION = 1;
const DOCUMENT_SCOPE = Object.freeze(["document"] as const);

/** Selected native descriptor at one exact causal root. */
export type ImmutableRunNativeDescriptorV1 =
  | {
      /** Fine-grained immutable-run payload. */
      readonly kind: "text";
      /** Exact allowlisted Media Type. */
      readonly mediaType: string;
      /** Exact selected generation record. */
      readonly generation: RecordRef;
      /** Whole-replacement effect on which fine edits must be based. */
      readonly replacementEffectId: string | undefined;
    }
  | {
      /** Universally replaceable opaque payload. */
      readonly kind: "opaque";
      /** Exact non-fine-grained Media Type. */
      readonly mediaType: string;
      /** Detached exact bytes. */
      readonly bytes: readonly number[];
      /** Exact payload-level Origin. */
      readonly origin: QualificationOrigin;
      /** Whole-replacement effect selected by the native register. */
      readonly replacementEffectId: string | undefined;
    };

/**
 * Cached native facts admitted for warm command preparation.
 *
 * @remarks Implementations populate this DTO at activation or a controlled
 * transition. Methods must be bounded lookups. They must report the pinned
 * candidate's actual selected descriptor/placement state, not a policy
 * reimplemented by this protocol module.
 */
export interface ImmutableRunNativeViewV1 {
  /** Exact causal root described by all lookups. */
  readonly root: RecordRef;
  /** Immutable document root Block identity. */
  readonly rootBlockId: BlockId;
  /** All retained Block identities known at this root. */
  blockIdentities?(): readonly BlockId[];
  /** All retained InlineContent identities known at this root. */
  inlineIdentities?(): readonly InlineContentId[];
  /** Whether a Block identity has ever been allocated in this lineage. */
  hasBlockIdentity(blockId: string): boolean;
  /** Whether a Block is live at this exact root. */
  isBlockLive(blockId: BlockId): boolean;
  /** Whether an InlineContent identity has ever been allocated. */
  hasInlineIdentity(inlineContentId: string): boolean;
  /** Whether an InlineContent is live at this exact root. */
  isInlineLive(inlineContentId: InlineContentId): boolean;
  /** Exact immutable owner, including owners currently not visible. */
  ownerOf(inlineContentId: InlineContentId): BlockId | undefined;
  /** Candidate-native winning descriptor at this exact root. */
  descriptorOf(
    inlineContentId: InlineContentId,
  ): ImmutableRunNativeDescriptorV1 | undefined;
  /** Exact currently unretired observed-token Refs in one entity scope. */
  liveTokens(
    kind: "block" | "inline",
    entityId: BlockId | InlineContentId,
  ): readonly RecordRef[];
  /** Existing authored root for an actor/effect identity, if any. */
  effectRoot(actorId: string, effectId: string): RecordRef | undefined;
}

/** Warm, validated command-preparation state owned by one carrier instance. */
export interface ImmutableRunWarmStateV1 {
  /** Cached accepted root and native facts. */
  readonly view: ImmutableRunNativeViewV1;
  /** Fresh private replica UUID for this loaded/branched authoring instance. */
  readonly replicaUuid: string;
  /** Bootstrap-selected experimental source chunk size, at least two units. */
  readonly runSourceUnits: number;
  /** Active source index for each selected text generation UUID. */
  readonly sourceIndexes: ReadonlyMap<string, ImmutableRunSourceIndex>;
}

/** Exact native structural and descriptor writes prepared with a command. */
export interface ImmutableRunNativeDeltaV1 {
  /** Canonical records to append in the same native transaction. */
  readonly records: readonly CanonicalRecordEntry[];
  /** Exact changed structural fields, with no copied document tree. */
  readonly structural: readonly StructuralOutput[];
  /** Exact changed descriptor fields, ordered by InlineContent UUID. */
  readonly descriptors: readonly DescriptorOutput[];
}

/** One-use replay of staged private index changes after native publication. */
export interface ImmutableRunCacheReplayV1 {
  /** Checks that every source index still has its prepared version. */
  assertCurrent(): void;
  /** Replays the already prepared index assignments exactly once. */
  commit(): void;
  /** Operation-sized generation/index additions or replacements. */
  readonly indexUpdates: ReadonlyMap<string, ImmutableRunSourceIndex>;
  /** Previously selected generation UUIDs to remove after publication. */
  readonly retiredGenerations: ReadonlySet<string>;
}

/** Complete, unpublished immutable-run command preparation. */
export interface PreparedImmutableRunCommandV1 {
  /** Fresh batch UUID, equal to the envelope nonce and manifest UUID. */
  readonly batchUuid: string;
  /** Canonical command root. */
  readonly manifest: CanonicalRecordEntry;
  /** Members followed by the manifest, all ready for one native append. */
  readonly entries: readonly CanonicalRecordEntry[];
  /** Exact native writes that must accompany the record append. */
  readonly nativeDelta: ImmutableRunNativeDeltaV1;
  /** Staged local cache replay, committed only after native success. */
  readonly cacheReplay: ImmutableRunCacheReplayV1;
}

/** Injectable trusted UUID source used by deterministic qualification tests. */
export interface ImmutableRunUuidSourceV1 {
  /** Return one fresh canonical lowercase UUID-v4. */
  nextUuid(): string;
}

/** Arguments for one warm attributed apply-command preparation. */
export interface PrepareImmutableRunApplyV1<Position> {
  /** Active validated state; preparation does not mutate it. */
  readonly state: ImmutableRunWarmStateV1;
  /** Complete atomic integrated change. */
  readonly change: IntegratedDocumentChange<Position>;
  /** Required actor/effect attribution. */
  readonly context: QualificationEffectContext;
  /** Candidate structural position codec. */
  readonly positionCodec: StructuralPositionCodec<Position>;
  /** Optional trusted UUID source; Web Crypto is the default. */
  readonly uuids?: ImmutableRunUuidSourceV1;
  /** Optional qualification-private logical transition committed atomically. */
  readonly transition?: ImmutableRunPreparedTransitionV1;
}

/** One already-resolved text scope used by private transition authoring. */
export interface ImmutableRunPreparedTransitionScopeV1 {
  /** Explicit logical Block identity. */
  readonly blockId: BlockId;
  /** Explicit logical InlineContent identity. */
  readonly inlineContentId: InlineContentId;
  /** Exact selected generation at the transition source root. */
  readonly generation: RecordRef;
  /** Exact validated source projection at that root. */
  readonly projection: ImmutableRunGenerationProjectionV1;
  /** Exact source descriptor Media Type. */
  readonly mediaType: string;
}

/** Qualification-private split, merge, or copy mapping preparation. */
export interface ImmutableRunPreparedTransitionV1 {
  /** Pure mapping relation being exercised. */
  readonly kind: "split" | "merge" | "copy";
  /** Accepted base for lineage, or resolved historical root for copy. */
  readonly sourceRoot: RecordRef;
  /** Explicit ordered source scopes. */
  readonly sources: readonly ImmutableRunPreparedTransitionScopeV1[];
  /** Explicit ordered destination logical scopes. */
  readonly destinations: readonly Readonly<{
    /** Destination Block owner. */
    blockId: BlockId;
    /** Destination InlineContent identity. */
    inlineContentId: InlineContentId;
    /** Exact payload operation indices that authored the copied destination. */
    operationIndexes?: readonly number[];
  }>[];
}

/** Arguments for one retained-state restore command preparation. */
export interface PrepareImmutableRunRestoreV1<Position> {
  /** Active validated destination state; preparation does not mutate it. */
  readonly state: ImmutableRunWarmStateV1;
  /** Exact detached target material decoded from the retained token. */
  readonly target: IntegratedDocumentSnapshot<Position>;
  /** Exact local retained token named by the restore context. */
  readonly token: string;
  /** Semantic root observed by that retained token. */
  readonly sourceRoot: RecordRef;
  /** Native winners at the retained source root. */
  readonly sourceView: ImmutableRunNativeViewV1;
  /** Validated source graph used to recover exact source units. */
  readonly sourceProtocol: ImmutableRunProtocolV1;
  /** Required restore attribution naming {@link token}. */
  readonly context: QualificationEffectContext;
  /** Candidate structural position codec. */
  readonly positionCodec: StructuralPositionCodec<Position>;
  /** Optional trusted UUID source; Web Crypto is the default. */
  readonly uuids?: ImmutableRunUuidSourceV1;
}

interface OperationPlan {
  readonly category: OperationCategory;
  readonly index: number;
  readonly members: CanonicalRecordEntry[];
}

interface WorkingPayload {
  descriptor: ImmutableRunNativeDescriptorV1 | undefined;
  index: ImmutableRunSourceIndex | undefined;
  previousSource: RecordRef | null;
}

interface SourceCursor {
  previous: RecordRef | null;
}

/**
 * Prepare one closed immutable-run apply command without native publication.
 *
 * @remarks All validation, hashing, source-index edits, and output construction
 * happen before publication. Existing indexes are changed under undo journals
 * and restored before this function returns. A thrown error leaves every
 * supplied index unchanged. The caller appends {@link PreparedImmutableRunCommandV1.nativeDelta}
 * atomically, calls `cacheReplay.assertCurrent()` immediately before native
 * publication, and calls `cacheReplay.commit()` only after success.
 */
export function prepareImmutableRunApplyCommandV1<Position>(
  input: PrepareImmutableRunApplyV1<Position>,
): PreparedImmutableRunCommandV1 {
  const { state, change, context, positionCodec } = input;
  assertWarmState(state);
  if (
    context.source !== undefined &&
    !(input.transition?.kind === "copy" && context.source.kind === "copy")
  )
    throw new TypeError(
      "Copy/restore derivation authoring requires transition support.",
    );
  if (input.transition?.kind === "copy" && context.source?.kind !== "copy")
    throw new TypeError("Copy transition requires exact copy attribution.");
  const acceptedBase = copyRef(state.view.root);
  const effect = recordEffect(context);
  if (state.view.effectRoot(effect[0], effect[1]) !== undefined)
    throw new TypeError("Actor/effect identity is already authored.");
  const uuids = uniqueUuidSource(input.uuids ?? WEB_UUIDS);
  const batch = nextUuid(uuids, "Command batch UUID");
  const plans: OperationPlan[] = [];
  const placementOutputs: StructuralOutput[] = [];
  const deletionOutputs: StructuralOutput[] = [];
  const inlineOutputs: StructuralOutput[] = [];
  const descriptorById = new Map<string, DescriptorOutput>();
  const staged: ImmutableRunPreparedIndexChange<unknown>[] = [];
  const indexUpdates = new Map<string, ImmutableRunSourceIndex>();
  const retiredGenerations = new Set<string>();

  const placements = (change.placements ?? []).map((update, index) => {
    if (update.blockId === state.view.rootBlockId)
      throw new TypeError("The immutable-run root cannot have a placement.");
    if (
      state.view.hasBlockIdentity(update.blockId) &&
      !state.view.isBlockLive(update.blockId)
    )
      throw new TypeError("Immutable-run Block identity cannot be reused.");
    if (state.view.hasInlineIdentity(update.blockId))
      throw new TypeError("Immutable-run durable identity is already used.");
    const encoded = encodeStructuralPlacement(update.placement, positionCodec);
    const plan = operationPlan("placement", index);
    plan.members.push(
      liveRecord(
        nextUuid(uuids, "Block live-token UUID"),
        "block",
        update.blockId,
        effect,
        batch,
        ordinal(plan),
      ),
    );
    plans.push(plan);
    placementOutputs.push(
      Object.freeze(["placement", update.blockId, encoded]),
    );
    return Object.freeze({ blockId: update.blockId, encoded });
  });
  const placedBlocks = new Set<string>(
    placements.map((value) => value.blockId),
  );

  const deletes = prepareDeletes(change.deleteBlockIds ?? [], state.view);
  for (let index = 0; index < deletes.length; index++) {
    const blockId = deletes[index]!;
    const plan = operationPlan("block-delete", index);
    plan.members.push(
      retireRecord(
        nextUuid(uuids, "Block retirement UUID"),
        "block",
        blockId,
        canonicalRefs(state.view.liveTokens("block", blockId)),
        effect,
        batch,
        ordinal(plan),
      ),
    );
    plans.push(plan);
    deletionOutputs.push(Object.freeze(["block-delete", blockId]));
  }

  const createdOwners = new Map<InlineContentId, BlockId>();
  const payloadIds = new Set(
    (change.payloads ?? []).map((payload) => payload.inlineContentId),
  );
  for (const [index, creation] of (change.inlineContents ?? []).entries()) {
    if (
      state.view.hasInlineIdentity(creation.inlineContentId) ||
      createdOwners.has(creation.inlineContentId)
    )
      throw new TypeError(
        "Immutable-run InlineContent ownership is immutable.",
      );
    if (
      state.view.hasBlockIdentity(creation.inlineContentId) ||
      placedBlocks.has(creation.inlineContentId)
    )
      throw new TypeError("Immutable-run durable identity is already used.");
    if (
      !state.view.isBlockLive(creation.blockId) &&
      !placedBlocks.has(creation.blockId)
    )
      throw new TypeError("InlineContent owner must be a live Block.");
    if (!payloadIds.has(creation.inlineContentId))
      throw new TypeError("InlineContent creation requires a payload.");
    createdOwners.set(creation.inlineContentId, creation.blockId);
    const plan = operationPlan("inline-create", index);
    plan.members.push(
      liveRecord(
        nextUuid(uuids, "InlineContent live-token UUID"),
        "inline",
        creation.inlineContentId,
        effect,
        batch,
        ordinal(plan),
      ),
    );
    plans.push(plan);
    inlineOutputs.push(
      Object.freeze([
        "inline-create",
        creation.inlineContentId,
        creation.blockId,
      ]),
    );
  }

  const working = new Map<InlineContentId, WorkingPayload>();
  // Capture caller-owned Origin primitives once. All evidence and source
  // records below use this same detached value rather than reading getters
  // again or allowing caller-controlled serialization hooks.
  const payloads = (change.payloads ?? []).map((operation) => {
    if (!("origin" in operation)) return operation;
    const supplied = operation.origin;
    const origin = Object.freeze({ id: supplied.id, kind: supplied.kind });
    assertQualificationOrigin(origin);
    return { ...operation, origin };
  });
  const replacementBases = Array.from(
    { length: payloads.length },
    (): string | undefined => undefined,
  );
  const payloadPlans = payloads.map((_, index) =>
    operationPlan("payload", index),
  );
  for (const plan of payloadPlans) plans.push(plan);
  const targetOperations = groupPayloadOperations(payloads);
  const effectIdentity = qualificationEffectIdentity(context);

  for (const [inlineContentId, operationIndexes] of targetOperations) {
    const owner =
      createdOwners.get(inlineContentId) ?? state.view.ownerOf(inlineContentId);
    if (owner === undefined)
      throw new TypeError("Payload mutation requires an owned InlineContent.");
    if (
      !createdOwners.has(inlineContentId) &&
      (!state.view.isInlineLive(inlineContentId) ||
        (!state.view.isBlockLive(owner) && !placedBlocks.has(owner)))
    )
      throw new TypeError(
        "Payload mutation requires a live InlineContent and owner Block.",
      );
    let target = working.get(inlineContentId);
    if (target === undefined) {
      const descriptor = state.view.descriptorOf(inlineContentId);
      target = {
        descriptor,
        index:
          descriptor?.kind === "text"
            ? requireSelectedIndex(state, descriptor)
            : undefined,
        previousSource: null,
      };
      working.set(inlineContentId, target);
    }
    let cursor = 0;
    while (cursor < operationIndexes.length) {
      const operationIndex = operationIndexes[cursor]!;
      const operation = payloads[operationIndex]!;
      if (operation.kind === "replace-text") {
        if (target.descriptor?.kind === "text") {
          const oldGeneration = target.descriptor.generation[0];
          if (!indexUpdates.delete(oldGeneration))
            retiredGenerations.add(oldGeneration);
        }
        const prepared = prepareTextReplacement({
          operation,
          operationIndex,
          owner,
          acceptedBase,
          effect,
          effectIdentity,
          batch,
          replicaUuid: state.replicaUuid,
          runSourceUnits: state.runSourceUnits,
          uuids,
          plan: payloadPlans[operationIndex]!,
        });
        target.descriptor = prepared.descriptor;
        target.index = prepared.index;
        target.previousSource = prepared.previousSource;
        replacementBases[operationIndex] = undefined;
        descriptorById.set(inlineContentId, prepared.output);
        indexUpdates.set(prepared.descriptor.generation[0], prepared.index);
        cursor += 1;
        const following: number[] = [];
        while (cursor < operationIndexes.length) {
          const nextIndex = operationIndexes[cursor]!;
          const next = payloads[nextIndex]!;
          if (next.kind === "replace-text" || next.kind === "replace-opaque")
            break;
          following.push(nextIndex);
          cursor += 1;
        }
        if (following.length > 0) {
          const patch = stageFineOperations(
            target,
            following,
            payloads,
            payloadPlans,
            replacementBases,
            owner,
            acceptedBase,
            effect,
            batch,
            state.replicaUuid,
            uuids,
            state.runSourceUnits,
          );
          staged.push(patch);
        }
        continue;
      }
      if (operation.kind === "replace-opaque") {
        assertQualificationOrigin(operation.origin);
        if (isQualificationFineGrainedMediaType(operation.mediaType))
          throw new TypeError("Allowlisted Media Types require text payloads.");
        const plan = payloadPlans[operationIndex]!;
        if (target.descriptor?.kind === "text") {
          const oldGeneration = target.descriptor.generation[0];
          if (!indexUpdates.delete(oldGeneration))
            retiredGenerations.add(oldGeneration);
        }
        addPayloadLiveness(plan, owner, inlineContentId, effect, batch, uuids);
        const origin = recordOrigin(operation.origin);
        const output: DescriptorOutput = Object.freeze([
          "opaque",
          inlineContentId,
          operation.mediaType,
          Object.freeze([...operation.bytes]),
          origin,
        ]);
        descriptorById.set(inlineContentId, output);
        target.descriptor = Object.freeze({
          kind: "opaque",
          mediaType: operation.mediaType,
          bytes: Object.freeze([...operation.bytes]),
          origin: Object.freeze({ ...operation.origin }),
          replacementEffectId: effectIdentity,
        });
        target.index = undefined;
        target.previousSource = null;
        replacementBases[operationIndex] = undefined;
        cursor += 1;
        continue;
      }
      const following: number[] = [];
      while (cursor < operationIndexes.length) {
        const nextIndex = operationIndexes[cursor]!;
        const next = payloads[nextIndex]!;
        if (next.kind === "replace-text" || next.kind === "replace-opaque")
          break;
        following.push(nextIndex);
        cursor += 1;
      }
      const patch = stageFineOperations(
        target,
        following,
        payloads,
        payloadPlans,
        replacementBases,
        owner,
        acceptedBase,
        effect,
        batch,
        state.replicaUuid,
        uuids,
        state.runSourceUnits,
      );
      staged.push(patch);
    }
  }

  if (input.transition !== undefined) {
    const transitionPlan = prepareApplyTransition({
      transition: input.transition,
      state,
      payloads,
      payloadPlans,
      descriptorById,
      effect,
      batch,
      uuids,
    });
    plans.push(transitionPlan);
  }
  const orderedPlans = canonicalPlans(plans);
  const operationRows: OperationRow[] = orderedPlans.map((plan) =>
    Object.freeze([
      plan.category,
      plan.index,
      Object.freeze(plan.members.map((member) => member.ref)),
    ]),
  );
  const encodedContext = encodeEffectContext(context);
  const contextEntry = memberRecord(
    nextUuid(uuids, "Context record UUID"),
    "context",
    DOCUMENT_SCOPE,
    null,
    null,
    effect,
    batch,
    ["context", 0, 0],
    [encodedContext],
  );
  const payloadEvidence =
    payloads.length === 0
      ? null
      : memberRecord(
          nextUuid(uuids, "Payload-evidence record UUID"),
          "payload-effect-v2",
          DOCUMENT_SCOPE,
          null,
          null,
          effect,
          batch,
          ["payload-evidence", 0, 0],
          [
            effectIdentity,
            acceptedBase,
            encodePayloadOperations(effectIdentity, payloads, replacementBases),
          ],
        );
  const envelopeEntry = memberRecord(
    nextUuid(uuids, "Envelope record UUID"),
    "envelope",
    DOCUMENT_SCOPE,
    null,
    null,
    effect,
    batch,
    ["envelope", 0, 0],
    [
      "apply",
      encodeAppliedEffectEnvelope(
        batch,
        placements,
        [...createdOwners].map(([inlineContentId, blockId]) => ({
          inlineContentId,
          blockId,
        })),
        deletes,
        payloadEvidence === null ? undefined : effectIdentity,
      ),
    ],
  );
  const descriptors = Object.freeze(
    [...descriptorById.values()].sort((left, right) =>
      compareStrings(left[1], right[1]),
    ),
  );
  const structural = Object.freeze([
    ...deletionOutputs,
    ...placementOutputs,
    ...inlineOutputs,
  ]);
  const body: CommandBody = Object.freeze([
    "apply",
    acceptedBase,
    contextEntry.ref,
    envelopeEntry.ref,
    payloadEvidence?.ref ?? null,
    Object.freeze(operationRows),
    structural,
    descriptors,
  ]);
  const manifest = commitRecordV1([
    RECORD_TAG,
    RECORD_VERSION,
    batch,
    "manifest",
    DOCUMENT_SCOPE,
    null,
    null,
    effect,
    batch,
    null,
    body,
  ]);
  const semanticMembers = orderedPlans.flatMap((plan) => plan.members);
  const entries = Object.freeze([
    contextEntry,
    envelopeEntry,
    ...(payloadEvidence === null ? [] : [payloadEvidence]),
    ...semanticMembers,
    manifest,
  ]);
  const replay = compositeReplay(staged, indexUpdates, retiredGenerations);
  const nativeDelta = Object.freeze({
    records: entries,
    structural,
    descriptors,
  });
  return Object.freeze({
    batchUuid: batch,
    manifest,
    entries,
    nativeDelta,
    cacheReplay: replay,
  });
}

interface PrepareApplyTransitionInput {
  readonly transition: ImmutableRunPreparedTransitionV1;
  readonly state: ImmutableRunWarmStateV1;
  readonly payloads: readonly IntegratedPayloadChange[];
  readonly payloadPlans: readonly OperationPlan[];
  readonly descriptorById: ReadonlyMap<string, DescriptorOutput>;
  readonly effect: RecordEffect;
  readonly batch: string;
  readonly uuids: ImmutableRunUuidSourceV1;
}

interface TransitionUnit {
  readonly scope: TransitionScope;
  readonly run: RecordRef;
  readonly offset: number;
  readonly text: string;
  readonly origin: QualificationOrigin;
}

interface TransitionUnitGroup {
  readonly scope: TransitionScope;
  readonly units: readonly TransitionUnit[];
}

function prepareApplyTransition(
  input: PrepareApplyTransitionInput,
): OperationPlan {
  const { transition, state, payloads, payloadPlans, effect, batch, uuids } =
    input;
  if (
    (transition.kind === "split" &&
      !(
        transition.sources.length === 1 && transition.destinations.length >= 2
      )) ||
    (transition.kind === "merge" &&
      !(
        transition.sources.length >= 2 && transition.destinations.length === 1
      )) ||
    (transition.kind === "copy" &&
      (transition.sources.length !== 1 || transition.destinations.length === 0))
  )
    throw new TypeError(
      "Fixture transition source/destination arity is invalid.",
    );
  if (
    transition.kind !== "copy" &&
    !sameRef(transition.sourceRoot, state.view.root)
  )
    throw new TypeError("Lineage transition source must be the accepted base.");
  const sourceScopes: TransitionScope[] = [];
  const sourceGroups: TransitionUnitGroup[] = [];
  let mediaType: string | undefined;
  for (const source of transition.sources) {
    const descriptor =
      transition.kind === "copy"
        ? undefined
        : state.view.descriptorOf(source.inlineContentId);
    if (
      transition.kind !== "copy" &&
      (state.view.ownerOf(source.inlineContentId) !== source.blockId ||
        descriptor?.kind !== "text" ||
        !sameRef(descriptor.generation, source.generation))
    )
      throw new TypeError("Lineage transition source scope is not selected.");
    const sourceMediaType = source.mediaType;
    if (descriptor?.kind === "text" && descriptor.mediaType !== sourceMediaType)
      throw new TypeError("Lineage transition source Media Type differs.");
    if (mediaType !== undefined && mediaType !== sourceMediaType)
      throw new TypeError("Fixture transition Media Types differ.");
    mediaType = sourceMediaType;
    const scope: TransitionScope = Object.freeze([
      source.blockId,
      source.inlineContentId,
      source.generation,
    ]);
    sourceScopes.push(scope);
    sourceGroups.push({
      scope,
      units: source.projection.units.map((unit) => ({
        scope,
        run: unit.run,
        offset: unit.offset,
        text: unit.text,
        origin: unit.origin as QualificationOrigin,
      })),
    });
  }
  const destinationScopes: TransitionScope[] = [];
  const destinationGroups: TransitionUnitGroup[] = [];
  for (const destination of transition.destinations) {
    const destinationOwner = state.view.ownerOf(destination.inlineContentId);
    if (
      destinationOwner !== undefined &&
      destinationOwner !== destination.blockId
    )
      throw new TypeError("Fixture transition destination owner differs.");
    const allMatches = payloads
      .map((operation, index) => ({ operation, index }))
      .filter(
        ({ operation }) =>
          operation.inlineContentId === destination.inlineContentId,
      );
    const selected =
      destination.operationIndexes === undefined
        ? allMatches
        : destination.operationIndexes.map((index) => ({
            operation: payloads[index]!,
            index,
          }));
    const matches = selected.filter(
      ({ operation }) =>
        operation?.kind === "replace-text" || operation?.kind === "insert-text",
    );
    if (
      matches.length === 0 ||
      !(
        matches[0]!.operation.kind === "replace-text" ||
        matches.every(({ operation }) => operation.kind === "insert-text")
      ) ||
      (matches[0]!.operation.kind === "replace-text" &&
        matches
          .slice(1)
          .some(({ operation }) => operation.kind !== "insert-text"))
    )
      throw new TypeError(
        "Fixture transition destination requires one text replacement.",
      );
    const output = input.descriptorById.get(destination.inlineContentId);
    const selectedDescriptor = state.view.descriptorOf(
      destination.inlineContentId,
    );
    const destinationMediaType =
      output?.[0] === "text"
        ? output[2]
        : selectedDescriptor?.kind === "text"
          ? selectedDescriptor.mediaType
          : undefined;
    if (destinationMediaType !== mediaType)
      throw new TypeError("Fixture transition Media Types differ.");
    const generation =
      output?.[0] === "text"
        ? output[3]
        : selectedDescriptor?.kind === "text"
          ? selectedDescriptor.generation
          : undefined;
    if (generation === undefined)
      throw new TypeError(
        "Fixture transition destination generation is absent.",
      );
    const scope: TransitionScope = Object.freeze([
      destination.blockId,
      destination.inlineContentId,
      generation,
    ]);
    destinationScopes.push(scope);
    const units: TransitionUnit[] = [];
    for (const member of matches.flatMap(
      ({ index }) => payloadPlans[index]!.members,
    )) {
      if (member.record[3] !== "run") continue;
      const body = member.record[10];
      if (
        !Array.isArray(body) ||
        typeof body[1] !== "string" ||
        !Array.isArray(body[2]) ||
        typeof body[2][0] !== "string" ||
        typeof body[2][1] !== "string"
      )
        throw new TypeError("Fixture destination run is invalid.");
      const origin = Object.freeze({
        kind: body[2][0] as QualificationOrigin["kind"],
        id: body[2][1],
      });
      for (let offset = 0; offset < body[1].length; offset++)
        units.push({
          scope,
          run: member.ref,
          offset,
          text: body[1].slice(offset, offset + 1),
          origin,
        });
    }
    destinationGroups.push({ scope, units });
  }
  const relation = transition.kind === "copy" ? "copy" : "lineage";
  const mappings: TransitionBody[5][number][] = [];
  const boundaryMappings: TransitionBody[6][number][] = [];
  const flattenedSources = sourceGroups.flatMap((group) => group.units);
  if (transition.kind === "copy") {
    for (const destination of destinationGroups) {
      mapTransitionUnits(
        flattenedSources,
        destination.units,
        relation,
        mappings,
      );
      mapTransitionBoundaries(
        sourceGroups,
        [destination],
        relation,
        boundaryMappings,
      );
    }
  } else {
    mapTransitionUnits(
      flattenedSources,
      destinationGroups.flatMap((group) => group.units),
      relation,
      mappings,
    );
    mapTransitionBoundaries(
      sourceGroups,
      destinationGroups,
      relation,
      boundaryMappings,
    );
  }
  const plan = operationPlan("transition", 0);
  if (transition.kind !== "copy") {
    const destinations = new Set(
      transition.destinations.map((scope) => scope.inlineContentId),
    );
    for (const source of transition.sources) {
      if (destinations.has(source.inlineContentId)) continue;
      const refs = state.view.liveTokens("inline", source.inlineContentId);
      if (refs.length === 0)
        throw new TypeError("Merged-away InlineContent is not live.");
      plan.members.push(
        retireRecord(
          nextUuid(uuids, "Transition InlineContent retirement UUID"),
          "inline",
          source.inlineContentId,
          canonicalRefs(refs),
          effect,
          batch,
          ordinal(plan),
        ),
      );
    }
  }
  const body: TransitionBody = Object.freeze([
    1,
    transition.kind,
    copyRef(transition.sourceRoot),
    Object.freeze(sourceScopes),
    Object.freeze(destinationScopes),
    Object.freeze(mappings),
    Object.freeze(boundaryMappings),
  ]);
  plan.members.push(
    memberRecord(
      nextUuid(uuids, "Fixture transition UUID"),
      "transition-v1",
      DOCUMENT_SCOPE,
      null,
      null,
      effect,
      batch,
      ordinal(plan),
      body,
    ),
  );
  return plan;
}

function mapTransitionUnits(
  sources: readonly TransitionUnit[],
  destinations: readonly TransitionUnit[],
  relation: "lineage" | "copy" | "restore",
  mappings: TransitionBody[5][number][],
): void {
  if (sources.length !== destinations.length)
    throw new TypeError(
      "Fixture transition does not preserve exact text length.",
    );
  for (let index = 0; index < sources.length; index++) {
    const source = sources[index]!;
    const destination = destinations[index]!;
    if (
      source.text !== destination.text ||
      source.origin.kind !== destination.origin.kind ||
      source.origin.id !== destination.origin.id
    )
      throw new TypeError("Fixture transition text or Origin differs.");
    const prior = mappings.at(-1);
    if (
      prior !== undefined &&
      JSON.stringify(prior[0]) === JSON.stringify(source.scope) &&
      sameRef(prior[1], source.run) &&
      prior[3] === source.offset &&
      JSON.stringify(prior[4]) === JSON.stringify(destination.scope) &&
      sameRef(prior[5], destination.run) &&
      prior[7] === destination.offset &&
      prior[8] === relation
    )
      mappings[mappings.length - 1] = Object.freeze([
        prior[0],
        prior[1],
        prior[2],
        source.offset + 1,
        prior[4],
        prior[5],
        prior[6],
        destination.offset + 1,
        relation,
      ]);
    else
      mappings.push(
        Object.freeze([
          source.scope,
          source.run,
          source.offset,
          source.offset + 1,
          destination.scope,
          destination.run,
          destination.offset,
          destination.offset + 1,
          relation,
        ]),
      );
  }
}

function mapTransitionBoundaries(
  sourceGroups: readonly TransitionUnitGroup[],
  destinationGroups: readonly TransitionUnitGroup[],
  relation: "lineage" | "copy" | "restore",
  output: TransitionBody[6][number][],
): void {
  const sources = transitionBoundaryPoints(sourceGroups);
  const destinations = transitionBoundaryPoints(destinationGroups);
  const offsets = new Set([...sources.keys(), ...destinations.keys()]);
  for (const offset of offsets) {
    if (!sources.has(offset))
      sources.set(offset, internalBoundaryPoints(sourceGroups, offset));
    if (!destinations.has(offset))
      destinations.set(
        offset,
        internalBoundaryPoints(destinationGroups, offset),
      );
  }
  for (const [offset, sourcePoints] of sources)
    for (const source of sourcePoints)
      for (const destination of destinations.get(offset) ?? [])
        output.push(
          Object.freeze([
            source.scope,
            source.boundary,
            destination.scope,
            destination.boundary,
            relation,
          ]),
        );
}

function internalBoundaryPoints(
  groups: readonly TransitionUnitGroup[],
  target: number,
): {
  readonly scope: TransitionScope;
  readonly boundary: TransitionBoundary;
}[] {
  let global = 0;
  for (const group of groups) {
    const end = global + group.units.length;
    if (target > global && target < end) {
      const prior = group.units[target - global - 1]!;
      return [
        {
          scope: group.scope,
          boundary: Object.freeze(["at", prior.run, prior.offset + 1]),
        },
      ];
    }
    global = end;
  }
  throw new TypeError("Transition boundary offset is outside its material.");
}

function transitionBoundaryPoints(
  groups: readonly TransitionUnitGroup[],
): Map<
  number,
  { readonly scope: TransitionScope; readonly boundary: TransitionBoundary }[]
> {
  const result = new Map<
    number,
    { readonly scope: TransitionScope; readonly boundary: TransitionBoundary }[]
  >();
  let global = 0;
  for (const group of groups) {
    const scope = group.scope;
    const start: TransitionBoundary =
      group.units.length === 0
        ? Object.freeze(["empty", scope[2]])
        : Object.freeze(["at", group.units[0]!.run, group.units[0]!.offset]);
    const endUnit = group.units.at(-1);
    const end: TransitionBoundary =
      endUnit === undefined
        ? start
        : Object.freeze(["at", endUnit.run, endUnit.offset + 1]);
    const starts = result.get(global) ?? [];
    starts.push({ scope, boundary: start });
    result.set(global, starts);
    global += group.units.length;
    const ends = result.get(global) ?? [];
    ends.push({ scope, boundary: end });
    result.set(global, ends);
  }
  return result;
}

/** Prepare one closed restore command and its exact restore derivation. */
export function prepareImmutableRunRestoreCommandV1<Position>(
  input: PrepareImmutableRunRestoreV1<Position>,
): PreparedImmutableRunCommandV1 {
  const {
    state,
    target,
    token,
    sourceRoot,
    sourceView,
    sourceProtocol,
    context,
    positionCodec,
  } = input;
  assertWarmState(state);
  if (context.source?.kind !== "restore" || context.source.reference !== token)
    throw new TypeError("Restore context does not name its retained token.");
  if (target.rootId !== state.view.rootBlockId)
    throw new TypeError("Restore target belongs to another document root.");
  const effect = recordEffect(context);
  if (state.view.effectRoot(effect[0], effect[1]) !== undefined)
    throw new TypeError("Actor/effect identity is already authored.");
  const acceptedBase = copyRef(state.view.root);
  const uuids = uniqueUuidSource(input.uuids ?? WEB_UUIDS);
  const batch = nextUuid(uuids, "Restore batch UUID");
  const plan = operationPlan("restore", 0);
  const structural: StructuralOutput[] = [];
  const descriptors: DescriptorOutput[] = [];
  const indexes = new Map<string, ImmutableRunSourceIndex>();
  const targetBlocks = new Set<string>([target.rootId]);
  for (const [blockId, live] of target.blockLiveness)
    if (live) targetBlocks.add(blockId);
  for (const blockId of target.placements.keys()) targetBlocks.add(blockId);
  const targetInline = new Set<string>(target.inlineContentOwners.keys());

  const knownBlocks = new Set<string>(
    state.view.blockIdentities?.() ?? target.blockLiveness.keys(),
  );
  const knownInline = new Set<string>(
    state.view.inlineIdentities?.() ?? target.inlineContentOwners.keys(),
  );
  for (const id of targetInline)
    if (!knownInline.has(id))
      throw new TypeError(
        "Restore target contains an unknown InlineContent identity.",
      );
  for (const id of knownBlocks) {
    const blockId = parseBlockId(id);
    if (!state.view.hasBlockIdentity(id))
      throw new TypeError("Restore target contains an unknown Block identity.");
    const refs = state.view.liveTokens("block", blockId);
    if (refs.length > 0 && !targetBlocks.has(id)) {
      plan.members.push(
        retireRecord(
          nextUuid(uuids, "Restore Block retirement UUID"),
          "block",
          id,
          canonicalRefs(refs),
          effect,
          batch,
          ordinal(plan),
        ),
      );
      structural.push(Object.freeze(["block-delete", id]));
    }
  }
  for (const id of knownInline) {
    const inlineId = parseInlineContentId(id);
    const owner = target.inlineContentOwners.get(inlineId);
    if (owner !== undefined && state.view.ownerOf(inlineId) !== owner)
      throw new TypeError("Restore target changes immutable ownership.");
    const refs = state.view.liveTokens("inline", inlineId);
    if (refs.length > 0 && !targetInline.has(id))
      plan.members.push(
        retireRecord(
          nextUuid(uuids, "Restore InlineContent retirement UUID"),
          "inline",
          id,
          canonicalRefs(refs),
          effect,
          batch,
          ordinal(plan),
        ),
      );
  }

  for (const blockId of [...targetBlocks].sort(compareStrings)) {
    if (blockId === target.rootId) continue;
    if (!state.view.hasBlockIdentity(blockId))
      throw new TypeError("Restore target contains an unknown Block identity.");
    plan.members.push(
      liveRecord(
        nextUuid(uuids, "Restore Block live-token UUID"),
        "block",
        blockId,
        effect,
        batch,
        ordinal(plan),
      ),
    );
  }
  for (const inlineId of [...targetInline].sort(compareStrings))
    plan.members.push(
      liveRecord(
        nextUuid(uuids, "Restore InlineContent live-token UUID"),
        "inline",
        inlineId,
        effect,
        batch,
        ordinal(plan),
      ),
    );

  for (const [blockId, placement] of target.placements) {
    if (!targetBlocks.has(blockId) || blockId === target.rootId)
      throw new TypeError("Restore placement has an invalid live Block.");
    structural.push(
      Object.freeze([
        "placement",
        blockId,
        encodeStructuralPlacement(placement, positionCodec),
      ]),
    );
  }

  const sourceScopes: TransitionScope[] = [];
  const destinationScopes: TransitionScope[] = [];
  const spans: TransitionBody[5][number][] = [];
  const boundaries: TransitionBody[6][number][] = [];
  for (const [inlineContentId, payload] of target.payloads) {
    const owner = target.inlineContentOwners.get(inlineContentId);
    if (owner === undefined || !targetBlocks.has(owner))
      throw new TypeError("Restore payload lacks a live retained owner.");
    const sourceOwner = sourceView.ownerOf(inlineContentId);
    const sourceDescriptor = sourceView.descriptorOf(inlineContentId);
    if (
      sourceOwner !== owner ||
      !sourceView.isInlineLive(inlineContentId) ||
      !sourceView.isBlockLive(owner) ||
      sourceDescriptor === undefined
    )
      throw new TypeError(
        "Restore source does not contain the target payload.",
      );
    if (payload.kind === "opaque") {
      if (
        sourceDescriptor.kind !== "opaque" ||
        sourceDescriptor.mediaType !== payload.mediaType ||
        JSON.stringify(sourceDescriptor.bytes) !==
          JSON.stringify([...payload.bytes]) ||
        sourceDescriptor.origin.kind !== payload.origin.kind ||
        sourceDescriptor.origin.id !== payload.origin.id
      )
        throw new TypeError(
          "Restore opaque material differs from its capture.",
        );
      descriptors.push(
        Object.freeze([
          "opaque",
          inlineContentId,
          payload.mediaType,
          Object.freeze([...payload.bytes]),
          recordOrigin(payload.origin),
        ]),
      );
      continue;
    }
    if (
      sourceDescriptor.kind !== "text" ||
      sourceDescriptor.mediaType !== payload.mediaType
    )
      throw new TypeError("Restore text descriptor differs from its capture.");
    const source = sourceProtocol.projectGeneration(
      sourceRoot,
      sourceDescriptor.generation,
    );
    assertRestoreText(source, payload.text, payload.spans);
    const generationId = nextUuid(uuids, "Restored generation UUID");
    const scope: TextScope = Object.freeze([
      "text",
      inlineContentId,
      generationId,
    ]);
    const generation = memberRecord(
      generationId,
      "generation",
      scope,
      ["0", state.replicaUuid],
      [acceptedBase, null],
      effect,
      batch,
      ordinal(plan),
      [payload.mediaType],
    );
    plan.members.push(generation);
    const destinationIndex = emptyIndex(generation.ref);
    const destinationRuns: {
      readonly entry: CanonicalRecordEntry;
      readonly globalStart: number;
      readonly source: string;
    }[] = [];
    let previous: RecordRef = generation.ref;
    let globalOffset = 0;
    let counter = 1n;
    for (const attributed of payload.spans) {
      assertQualificationOrigin(attributed.origin);
      for (const chunk of partitionSource(
        attributed.text,
        state.runSourceUnits,
      )) {
        const anchor = destinationIndex.anchorAt(destinationIndex.length);
        const run = memberRecord(
          nextUuid(uuids, "Restored run UUID"),
          "run",
          scope,
          [counter.toString(), state.replicaUuid],
          [acceptedBase, previous],
          effect,
          batch,
          ordinal(plan),
          [recordAnchor(anchor), chunk, recordOrigin(attributed.origin)],
        );
        plan.members.push(run);
        const patch = destinationIndex.stage((preview) => {
          preview.insert(preview.length, {
            run: run.ref,
            anchor,
            source: chunk,
            origin: attributed.origin,
            counter,
            replicaUuid: state.replicaUuid,
          });
        });
        patch.commit();
        destinationRuns.push({
          entry: run,
          globalStart: globalOffset,
          source: chunk,
        });
        globalOffset += chunk.length;
        counter += 1n;
        previous = run.ref;
      }
    }
    indexes.set(generationId, destinationIndex);
    descriptors.push(
      Object.freeze([
        "text",
        inlineContentId,
        payload.mediaType,
        generation.ref,
      ]),
    );
    const sourceScope: TransitionScope = Object.freeze([
      owner,
      inlineContentId,
      sourceDescriptor.generation,
    ]);
    const destinationScope: TransitionScope = Object.freeze([
      owner,
      inlineContentId,
      generation.ref,
    ]);
    sourceScopes.push(sourceScope);
    destinationScopes.push(destinationScope);
    appendRestoreMappings(
      source,
      destinationRuns,
      sourceScope,
      destinationScope,
      spans,
      boundaries,
    );
  }
  if (targetInline.size !== target.payloads.size)
    throw new TypeError(
      "Restore target has ownership without payload material.",
    );

  if (sourceScopes.length > 0) {
    const transitionBody: TransitionBody = Object.freeze([
      1,
      "restore",
      copyRef(sourceRoot),
      Object.freeze(sourceScopes),
      Object.freeze(destinationScopes),
      Object.freeze(spans),
      Object.freeze(boundaries),
    ]);
    plan.members.push(
      memberRecord(
        nextUuid(uuids, "Restore transition UUID"),
        "transition-v1",
        DOCUMENT_SCOPE,
        null,
        null,
        effect,
        batch,
        ordinal(plan),
        transitionBody,
      ),
    );
  }
  const encodedContext = encodeEffectContext(context);
  const contextEntry = memberRecord(
    nextUuid(uuids, "Restore context UUID"),
    "context",
    DOCUMENT_SCOPE,
    null,
    null,
    effect,
    batch,
    ["context", 0, 0],
    [encodedContext],
  );
  const envelopeEntry = memberRecord(
    nextUuid(uuids, "Restore envelope UUID"),
    "envelope",
    DOCUMENT_SCOPE,
    null,
    null,
    effect,
    batch,
    ["envelope", 0, 0],
    ["restore", encodeRestoreEffectEnvelope(batch, target, positionCodec)],
  );
  const orderedStructural = Object.freeze(structural);
  const orderedDescriptors = Object.freeze(
    descriptors.sort((left, right) => compareStrings(left[1], right[1])),
  );
  const row: OperationRow = Object.freeze([
    "restore",
    0,
    Object.freeze(plan.members.map((member) => member.ref)),
  ]);
  const body: CommandBody = Object.freeze([
    "restore",
    acceptedBase,
    contextEntry.ref,
    envelopeEntry.ref,
    null,
    Object.freeze([row]),
    orderedStructural,
    orderedDescriptors,
  ]);
  const manifest = commitRecordV1([
    RECORD_TAG,
    RECORD_VERSION,
    batch,
    "manifest",
    DOCUMENT_SCOPE,
    null,
    null,
    effect,
    batch,
    null,
    body,
  ]);
  const entries = Object.freeze([
    contextEntry,
    envelopeEntry,
    ...plan.members,
    manifest,
  ]);
  return Object.freeze({
    batchUuid: batch,
    manifest,
    entries,
    nativeDelta: Object.freeze({
      records: entries,
      structural: orderedStructural,
      descriptors: orderedDescriptors,
    }),
    cacheReplay: compositeReplay(
      [],
      indexes,
      new Set(state.sourceIndexes.keys()),
    ),
  });
}

function assertRestoreText(
  source: ImmutableRunGenerationProjectionV1,
  text: string,
  spans: readonly {
    readonly text: string;
    readonly origin: QualificationOrigin;
  }[],
): void {
  assertWellFormedText(text);
  if (
    source.text !== text ||
    source.spans.length !== spans.length ||
    source.spans.some((span, index) => {
      const expected = spans[index];
      return (
        expected === undefined ||
        span.text !== expected.text ||
        span.origin.kind !== expected.origin.kind ||
        span.origin.id !== expected.origin.id
      );
    })
  )
    throw new TypeError(
      "Restore text or Origin spans differ from the capture.",
    );
}

function appendRestoreMappings(
  source: ImmutableRunGenerationProjectionV1,
  destinationRuns: readonly {
    readonly entry: CanonicalRecordEntry;
    readonly globalStart: number;
    readonly source: string;
  }[],
  sourceScope: TransitionScope,
  destinationScope: TransitionScope,
  spans: TransitionBody[5][number][],
  boundaries: TransitionBody[6][number][],
): void {
  if (source.units.length === 0) {
    const sourceBoundary: TransitionBoundary = Object.freeze([
      "empty",
      sourceScope[2],
    ]);
    const destinationBoundary: TransitionBoundary = Object.freeze([
      "empty",
      destinationScope[2],
    ]);
    boundaries.push(
      Object.freeze([
        sourceScope,
        sourceBoundary,
        destinationScope,
        destinationBoundary,
        "restore",
      ]),
    );
    return;
  }
  let destinationIndex = 0;
  for (const [globalOffset, sourceUnit] of source.units.entries()) {
    while (
      destinationIndex + 1 < destinationRuns.length &&
      globalOffset >= destinationRuns[destinationIndex + 1]!.globalStart
    )
      destinationIndex += 1;
    const destination = destinationRuns[destinationIndex];
    if (destination === undefined)
      throw new TypeError("Restore destination run coverage is incomplete.");
    const destinationOffset = globalOffset - destination.globalStart;
    if (
      destination.source.slice(destinationOffset, destinationOffset + 1) !==
      sourceUnit.text
    )
      throw new TypeError("Restore destination text differs from its source.");
    const prior = spans.at(-1);
    if (
      prior !== undefined &&
      sameRef(prior[1], sourceUnit.run) &&
      prior[3] === sourceUnit.offset &&
      sameRef(prior[5], destination.entry.ref) &&
      prior[7] === destinationOffset
    ) {
      spans[spans.length - 1] = Object.freeze([
        prior[0],
        prior[1],
        prior[2],
        sourceUnit.offset + 1,
        prior[4],
        prior[5],
        prior[6],
        destinationOffset + 1,
        "restore",
      ]);
    } else {
      spans.push(
        Object.freeze([
          sourceScope,
          sourceUnit.run,
          sourceUnit.offset,
          sourceUnit.offset + 1,
          destinationScope,
          destination.entry.ref,
          destinationOffset,
          destinationOffset + 1,
          "restore",
        ]),
      );
    }
  }
  const firstSource = source.units[0]!;
  const lastSource = source.units.at(-1)!;
  const firstDestination = destinationRuns[0]!;
  const lastDestination = destinationRuns.at(-1)!;
  const sourceStart: TransitionBoundary = Object.freeze([
    "at",
    firstSource.run,
    firstSource.offset,
  ]);
  const destinationStart: TransitionBoundary = Object.freeze([
    "at",
    firstDestination.entry.ref,
    0,
  ]);
  const sourceEnd: TransitionBoundary = Object.freeze([
    "at",
    lastSource.run,
    lastSource.offset + 1,
  ]);
  const destinationEnd: TransitionBoundary = Object.freeze([
    "at",
    lastDestination.entry.ref,
    lastDestination.source.length,
  ]);
  boundaries.push(
    Object.freeze([
      sourceScope,
      sourceStart,
      destinationScope,
      destinationStart,
      "restore",
    ]),
    Object.freeze([
      sourceScope,
      sourceEnd,
      destinationScope,
      destinationEnd,
      "restore",
    ]),
  );
}

interface TextReplacementInput {
  readonly operation: Extract<
    IntegratedPayloadChange,
    { readonly kind: "replace-text" }
  >;
  readonly operationIndex: number;
  readonly owner: BlockId;
  readonly acceptedBase: RecordRef;
  readonly effect: RecordEffect;
  readonly effectIdentity: string;
  readonly batch: string;
  readonly replicaUuid: string;
  readonly runSourceUnits: number;
  readonly uuids: ImmutableRunUuidSourceV1;
  readonly plan: OperationPlan;
}

function prepareTextReplacement(input: TextReplacementInput): {
  readonly descriptor: Extract<
    ImmutableRunNativeDescriptorV1,
    { readonly kind: "text" }
  >;
  readonly output: DescriptorOutput;
  readonly index: ImmutableRunSourceIndex;
  readonly previousSource: RecordRef;
} {
  const { operation, plan } = input;
  assertQualificationOrigin(operation.origin);
  if (!isQualificationFineGrainedMediaType(operation.mediaType))
    throw new TypeError("Text replacement requires an allowlisted Media Type.");
  assertWellFormedText(operation.text);
  const generationUuid = nextUuid(input.uuids, "Generation UUID");
  const scope: TextScope = Object.freeze([
    "text",
    operation.inlineContentId,
    generationUuid,
  ]);
  const generation = memberRecord(
    generationUuid,
    "generation",
    scope,
    ["0", input.replicaUuid],
    [input.acceptedBase, null],
    input.effect,
    input.batch,
    ordinal(plan),
    [operation.mediaType],
  );
  plan.members.push(generation);
  const index = new ImmutableRunSourceIndex({
    generation: generation.ref,
    text: "",
    units: [],
    sourceUnits: [],
    runs: [],
    erasures: [],
    spans: [],
    maximumCounter: 0n,
  });
  const source: SourceCursor = { previous: generation.ref };
  const chunks = partitionSource(operation.text, input.runSourceUnits);
  const patch = index.stage((preview) => {
    let offset = 0;
    for (const chunk of chunks) {
      const counter = preview.maximumCounter + 1n;
      const run = memberRecord(
        nextUuid(input.uuids, "Run record UUID"),
        "run",
        scope,
        [counter.toString(), input.replicaUuid],
        [input.acceptedBase, source.previous],
        input.effect,
        input.batch,
        ordinal(plan),
        [
          recordAnchor(preview.anchorAt(offset)),
          chunk,
          recordOrigin(operation.origin),
        ],
      );
      plan.members.push(run);
      source.previous = run.ref;
      preview.insert(offset, {
        run: run.ref,
        anchor: preview.anchorAt(offset),
        source: chunk,
        origin: operation.origin,
        counter,
        replicaUuid: input.replicaUuid,
      });
      offset += chunk.length;
    }
    addPayloadLiveness(
      plan,
      input.owner,
      operation.inlineContentId,
      input.effect,
      input.batch,
      input.uuids,
    );
  });
  // This index is new and unreachable from the accepted cache. Materialize its
  // prepared assignments now so later operations in this same command can use
  // them; a preparation failure simply discards the private index.
  patch.commit();
  const descriptor = Object.freeze({
    kind: "text" as const,
    mediaType: operation.mediaType,
    generation: generation.ref,
    replacementEffectId: input.effectIdentity,
  });
  return {
    descriptor,
    output: Object.freeze([
      "text",
      operation.inlineContentId,
      operation.mediaType,
      generation.ref,
    ]),
    index,
    previousSource: source.previous ?? generation.ref,
  };
}

function stageFineOperations(
  target: WorkingPayload,
  indexes: readonly number[],
  payloads: readonly IntegratedPayloadChange[],
  plans: readonly OperationPlan[],
  replacementBases: (string | undefined)[],
  owner: BlockId,
  acceptedBase: RecordRef,
  effect: RecordEffect,
  batch: string,
  replicaUuid: string,
  uuids: ImmutableRunUuidSourceV1,
  runSourceUnits: number,
): ImmutableRunPreparedIndexChange<unknown> {
  if (target.descriptor?.kind !== "text" || target.index === undefined)
    throw new TypeError(
      "Fine-grained operations require an existing text payload.",
    );
  const descriptor = target.descriptor;
  const scope: TextScope = Object.freeze([
    "text",
    payloads[indexes[0]!]!.inlineContentId,
    descriptor.generation[0],
  ]);
  const source: SourceCursor = { previous: target.previousSource };
  const patch = target.index.stage((preview) => {
    for (const operationIndex of indexes) {
      const operation = payloads[operationIndex]!;
      const plan = plans[operationIndex]!;
      replacementBases[operationIndex] = descriptor.replacementEffectId;
      if (operation.kind === "insert-text") {
        assertQualificationOrigin(operation.origin);
        if (operation.text.length === 0)
          throw new TypeError("Text insertion requires nonempty text.");
        assertWellFormedText(operation.text);
        assertBoundary(preview, operation.offset);
        let offset = operation.offset;
        for (const chunk of partitionSource(operation.text, runSourceUnits)) {
          const counter = preview.maximumCounter + 1n;
          const run = memberRecord(
            nextUuid(uuids, "Run record UUID"),
            "run",
            scope,
            [counter.toString(), replicaUuid],
            [acceptedBase, source.previous],
            effect,
            batch,
            ordinal(plan),
            [
              recordAnchor(preview.anchorAt(offset)),
              chunk,
              recordOrigin(operation.origin),
            ],
          );
          plan.members.push(run);
          source.previous = run.ref;
          preview.insert(offset, {
            run: run.ref,
            anchor: preview.anchorAt(offset),
            source: chunk,
            origin: operation.origin,
            counter,
            replicaUuid,
          });
          offset += chunk.length;
        }
        addPayloadLiveness(
          plan,
          owner,
          operation.inlineContentId,
          effect,
          batch,
          uuids,
        );
      } else if (operation.kind === "delete-text") {
        assertRange(preview, operation.start, operation.end);
        if (operation.start !== operation.end) {
          const counter = preview.maximumCounter + 1n;
          const intervals = preview.erase(
            operation.start,
            operation.end,
            counter,
          );
          const erase = memberRecord(
            nextUuid(uuids, "Erase record UUID"),
            "erase",
            scope,
            [counter.toString(), replicaUuid],
            [acceptedBase, source.previous],
            effect,
            batch,
            ordinal(plan),
            [
              intervals.map((interval): ObservedInterval =>
                Object.freeze([interval.run, interval.start, interval.end]),
              ),
            ],
          );
          plan.members.push(erase);
          source.previous = erase.ref;
          addPayloadLiveness(
            plan,
            owner,
            operation.inlineContentId,
            effect,
            batch,
            uuids,
          );
        }
      } else {
        throw new TypeError("Payload segment is not fine-grained text.");
      }
    }
  });
  target.previousSource = source.previous;
  return patch;
}

function addPayloadLiveness(
  plan: OperationPlan,
  owner: BlockId,
  inlineContentId: InlineContentId,
  effect: RecordEffect,
  batch: string,
  uuids: ImmutableRunUuidSourceV1,
): void {
  plan.members.push(
    liveRecord(
      nextUuid(uuids, "Block live-token UUID"),
      "block",
      owner,
      effect,
      batch,
      ordinal(plan),
    ),
  );
  plan.members.push(
    liveRecord(
      nextUuid(uuids, "InlineContent live-token UUID"),
      "inline",
      inlineContentId,
      effect,
      batch,
      ordinal(plan),
    ),
  );
}

function liveRecord(
  id: string,
  kind: "block" | "inline",
  entityId: string,
  effect: RecordEffect,
  batch: string,
  ordinalValue: readonly [OperationCategory, number, number],
): CanonicalRecordEntry {
  return memberRecord(
    id,
    "live",
    [kind, entityId],
    null,
    null,
    effect,
    batch,
    ordinalValue,
    [],
  );
}

function retireRecord(
  id: string,
  kind: "block" | "inline",
  entityId: string,
  refs: readonly RecordRef[],
  effect: RecordEffect,
  batch: string,
  ordinalValue: readonly [OperationCategory, number, number],
): CanonicalRecordEntry {
  if (refs.length === 0)
    throw new TypeError("Retirement requires observed live tokens.");
  return memberRecord(
    id,
    "retire",
    [kind, entityId],
    null,
    null,
    effect,
    batch,
    ordinalValue,
    [refs],
  );
}

function memberRecord(
  id: string,
  kind: CanonicalRecordV1[3],
  scope: CanonicalRecordV1[4],
  clock: CanonicalRecordV1[5],
  base: CanonicalRecordV1[6],
  effect: RecordEffect,
  batch: string,
  ordinalValue: CanonicalRecordV1[9],
  body: unknown,
): CanonicalRecordEntry {
  return commitRecordV1([
    RECORD_TAG,
    RECORD_VERSION,
    id,
    kind,
    scope,
    clock,
    base,
    effect,
    batch,
    ordinalValue,
    body,
  ]);
}

function operationPlan(
  category: OperationCategory,
  index: number,
): OperationPlan {
  return { category, index, members: [] };
}

function ordinal(
  plan: OperationPlan,
): readonly [OperationCategory, number, number] {
  return Object.freeze([plan.category, plan.index, plan.members.length]);
}

function groupPayloadOperations(
  payloads: readonly IntegratedPayloadChange[],
): ReadonlyMap<InlineContentId, readonly number[]> {
  const result = new Map<InlineContentId, number[]>();
  for (const [index, operation] of payloads.entries()) {
    const list = result.get(operation.inlineContentId) ?? [];
    list.push(index);
    result.set(operation.inlineContentId, list);
  }
  return result;
}

function canonicalPlans(plans: readonly OperationPlan[]): OperationPlan[] {
  const order: readonly OperationCategory[] = [
    "block-delete",
    "placement",
    "inline-create",
    "payload",
    "transition",
  ];
  return [...plans].sort(
    (left, right) =>
      order.indexOf(left.category) - order.indexOf(right.category) ||
      left.index - right.index,
  );
}

function prepareDeletes(
  input: readonly BlockId[],
  view: ImmutableRunNativeViewV1,
): readonly BlockId[] {
  const unique = [...new Set(input)].sort(compareStrings);
  for (const blockId of unique) {
    if (blockId === view.rootBlockId)
      throw new TypeError("The immutable-run root cannot be deleted.");
    if (!view.isBlockLive(blockId))
      throw new TypeError("Block deletion requires a live Block.");
  }
  return Object.freeze(unique);
}

function requireSelectedIndex(
  state: ImmutableRunWarmStateV1,
  descriptor: Extract<
    ImmutableRunNativeDescriptorV1,
    { readonly kind: "text" }
  >,
): ImmutableRunSourceIndex {
  const index = state.sourceIndexes.get(descriptor.generation[0]);
  if (index === undefined)
    throw new TypeError(
      "Selected text generation lacks an active source index.",
    );
  const generation = index.createPosition(0, "before").generation;
  if (!sameRef(generation, descriptor.generation))
    throw new TypeError("Source index generation commitment is stale.");
  return index;
}

function assertWarmState(state: ImmutableRunWarmStateV1): void {
  if (!isCanonicalUuidV4(state.replicaUuid))
    throw new TypeError("Private replica UUID is invalid.");
  if (!Number.isSafeInteger(state.runSourceUnits) || state.runSourceUnits < 2)
    throw new TypeError(
      "Run-source units must be a safe integer of at least two.",
    );
  copyRef(state.view.root);
}

function assertBoundary(index: ImmutableRunSourceIndex, offset: number): void {
  if (!Number.isSafeInteger(offset) || offset < 0 || offset > index.length)
    throw new RangeError("Text offset is outside the current native string.");
  if (offset === 0 || offset === index.length) return;
  const around = index
    .read(offset - 1, offset + 1)
    .map((span) => span.text)
    .join("");
  const before = around.charCodeAt(0);
  const after = around.charCodeAt(1);
  if (isHighSurrogate(before) && isLowSurrogate(after))
    throw new TypeError(
      "Immutable runs cannot preserve a splice inside a surrogate pair.",
    );
}

function assertRange(
  index: ImmutableRunSourceIndex,
  start: number,
  end: number,
): void {
  if (
    !Number.isSafeInteger(start) ||
    !Number.isSafeInteger(end) ||
    start < 0 ||
    end < 0 ||
    start > index.length ||
    end > index.length
  )
    throw new RangeError("Text range is outside the current native string.");
  if (start > end)
    throw new RangeError("Text range start must not follow its end.");
  if (start !== end) {
    assertBoundary(index, start);
    assertBoundary(index, end);
  }
}

function assertWellFormedText(text: string): void {
  for (let index = 0; index < text.length; index++) {
    const unit = text.charCodeAt(index);
    if (isHighSurrogate(unit)) {
      if (!isLowSurrogate(text.charCodeAt(index + 1)))
        throw new TypeError("Immutable-run source is not well-formed UTF-16.");
      index += 1;
    } else if (isLowSurrogate(unit)) {
      throw new TypeError("Immutable-run source is not well-formed UTF-16.");
    }
  }
}

function partitionSource(text: string, maximum: number): readonly string[] {
  const result: string[] = [];
  let start = 0;
  while (start < text.length) {
    let end = Math.min(text.length, start + maximum);
    if (
      end < text.length &&
      isHighSurrogate(text.charCodeAt(end - 1)) &&
      isLowSurrogate(text.charCodeAt(end))
    )
      end -= 1;
    if (end === start)
      throw new TypeError("Run-source units cannot preserve a surrogate pair.");
    result.push(text.slice(start, end));
    start = end;
  }
  return Object.freeze(result);
}

function isHighSurrogate(value: number): boolean {
  return value >= 0xd800 && value <= 0xdbff;
}

function isLowSurrogate(value: number): boolean {
  return value >= 0xdc00 && value <= 0xdfff;
}

function recordOrigin(origin: QualificationOrigin): RecordOrigin {
  assertQualificationOrigin(origin);
  return Object.freeze([origin.kind, origin.id]);
}

function recordEffect(context: QualificationEffectContext): RecordEffect {
  encodeEffectContext(context);
  return Object.freeze([context.actorId, context.effectId]);
}

function encodePayloadOperations(
  effectIdentity: string,
  operations: readonly IntegratedPayloadChange[],
  bases: readonly (string | undefined)[],
): string {
  const encoded = encodePayloadEffect(effectIdentity, [], operations, bases);
  const parsed: unknown = JSON.parse(encoded);
  if (
    typeof parsed !== "object" ||
    parsed === null ||
    !("operations" in parsed)
  )
    throw new TypeError("Encoded payload evidence is invalid.");
  return JSON.stringify(parsed.operations);
}

function compositeReplay(
  patches: readonly ImmutableRunPreparedIndexChange<unknown>[],
  indexUpdates: ReadonlyMap<string, ImmutableRunSourceIndex>,
  retiredGenerations: ReadonlySet<string>,
): ImmutableRunCacheReplayV1 {
  let committed = false;
  const assertCurrent = (): void => {
    if (committed)
      throw new Error("Immutable-run cache replay is already consumed.");
    for (const patch of patches) patch.assertCurrent();
  };
  return Object.freeze({
    indexUpdates,
    retiredGenerations,
    assertCurrent,
    commit(): void {
      assertCurrent();
      for (const patch of patches) patch.commit();
      committed = true;
    },
  });
}

function canonicalRefs(refs: readonly RecordRef[]): readonly RecordRef[] {
  const copies = refs.map(copyRef).sort(compareRefs);
  for (let index = 1; index < copies.length; index++)
    if (sameRef(copies[index - 1]!, copies[index]!))
      throw new TypeError("Native live-token view repeats a Ref.");
  return Object.freeze(copies);
}

function copyRef(ref: RecordRef): RecordRef {
  if (
    !Array.isArray(ref) ||
    ref.length !== 2 ||
    !isCanonicalUuidV4(ref[0]) ||
    !/^[0-9a-f]{64}$/u.test(ref[1])
  )
    throw new TypeError("Record Ref is invalid.");
  return Object.freeze([ref[0], ref[1]]);
}

function compareRefs(left: RecordRef, right: RecordRef): number {
  return compareStrings(left[0], right[0]) || compareStrings(left[1], right[1]);
}

function sameRef(left: RecordRef, right: RecordRef): boolean {
  return left[0] === right[0] && left[1] === right[1];
}

function sameRefValue(value: unknown, expected: RecordRef): boolean {
  return (
    Array.isArray(value) &&
    value.length === 2 &&
    value[0] === expected[0] &&
    value[1] === expected[1]
  );
}

function compareStrings(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function nextUuid(source: ImmutableRunUuidSourceV1, label: string): string {
  const value = source.nextUuid();
  if (!isCanonicalUuidV4(value)) throw new TypeError(`${label} is invalid.`);
  return value;
}

function uniqueUuidSource(
  source: ImmutableRunUuidSourceV1,
): ImmutableRunUuidSourceV1 {
  const seen = new Set<string>();
  return Object.freeze({
    nextUuid(): string {
      const value = source.nextUuid();
      if (!isCanonicalUuidV4(value))
        throw new TypeError("Authored record UUID is invalid.");
      if (seen.has(value))
        throw new TypeError("Authored record UUID source repeated a value.");
      seen.add(value);
      return value;
    },
  });
}

const WEB_UUIDS: ImmutableRunUuidSourceV1 = Object.freeze({
  nextUuid(): string {
    return crypto.randomUUID();
  },
});

/** Exact native writes captured for one authored manifest. */
export interface ImmutableRunAuthoredOutputsV1 {
  /** Exact structural writes performed in the manifest's native change. */
  readonly structural: readonly StructuralOutput[];
  /** Exact descriptor writes performed in the same native change. */
  readonly descriptors: readonly DescriptorOutput[];
}

/** Cold native-view seam used to validate whole received record sets. */
export interface ImmutableRunColdViewProviderV1 {
  /** Native facts selected at one exact causal root. */
  view(root: RecordRef): ImmutableRunNativeViewV1;
  /**
   * Actual native dependency view against which a manifest was authored.
   *
   * @remarks This can include observation-only capture metadata appended after
   * the semantic root without inventing a new semantic RootRef.
   */
  authoredBase(manifest: RecordRef): Readonly<{
    /** Semantic root label carried by the manifest. */
    semanticRoot: RecordRef;
    /** Candidate-native view at the manifest change's actual dependencies. */
    view: ImmutableRunNativeViewV1;
  }>;
  /** Native fields actually written by one authored command transaction. */
  authoredOutputs(manifest: RecordRef): ImmutableRunAuthoredOutputsV1;
  /** Resolve a retained capture token to its exact root, when supported. */
  captureRoot(token: string): RecordRef | undefined;
  /** Resolve copy/restore source evidence at one command's native frontier. */
  resolveReferent(
    reference: string,
    manifest: RecordRef,
  ):
    | Readonly<{
        /** Whether the reference names an authored effect or retained capture. */
        kind: "effect" | "capture";
        /** Exact semantic source root. */
        root: RecordRef;
        /** Exact retained material when the reference is a capture token. */
        material?: string;
      }>
    | undefined;
}

/** Result of whole-set command validation and cold protocol projection. */
export interface ValidatedImmutableRunCommandsV1 {
  /** Validated cold source/liveness/root model. */
  readonly protocol: ImmutableRunProtocolV1;
  /** Authored apply manifests checked against envelopes and native outputs. */
  readonly commandRoots: readonly RecordRef[];
}

interface CommandReplayCursor {
  atRoot: RecordRef;
  readonly indexes: Map<string, ImmutableRunSourceIndex>;
}

/**
 * Validate closed apply-command semantics over a complete immutable record set.
 *
 * @remarks The underlying protocol validates graph membership, exact bases,
 * source predecessors/counters, anchors, intervals, and liveness references.
 * This layer additionally binds canonical envelopes/evidence to exact operation
 * rows, deterministic ownership, source output shapes, descriptor deltas, and
 * native writes captured by the adapter. Restore/transition validation is
 * deliberately refused until its retained-capture materialization adapter is
 * supplied; it is never accepted as an apply command by omission.
 * A validated protocol input reuses its source validation and owned canonical
 * entries; complete command and native-output validation still runs. Contiguous
 * ordinary fine edits reuse invocation-private indexes at the exact accepted
 * base. Branches, joins, structural edits, replacements, restores and transitions
 * rebuild projections. Failed validation discards the private replay cursor.
 */
export function validateImmutableRunCommandsV1(
  input: readonly CanonicalRecordEntry[] | ImmutableRunProtocolV1,
  provider: ImmutableRunColdViewProviderV1,
): ValidatedImmutableRunCommandsV1 {
  return validateCommands(input, provider, "incremental");
}

/**
 * Validate every command with independent exact-base source projections.
 *
 * @remarks Qualification reference route for replay-cursor differential checks.
 * All immutable command and native provenance checks still run.
 */
export function validateImmutableRunCommandsReferenceV1(
  input: readonly CanonicalRecordEntry[] | ImmutableRunProtocolV1,
  provider: ImmutableRunColdViewProviderV1,
): ValidatedImmutableRunCommandsV1 {
  return validateCommands(input, provider, "reference");
}

function validateCommands(
  input: readonly CanonicalRecordEntry[] | ImmutableRunProtocolV1,
  provider: ImmutableRunColdViewProviderV1,
  replay: "incremental" | "reference",
): ValidatedImmutableRunCommandsV1 {
  const protocol =
    input instanceof ImmutableRunProtocolV1
      ? input
      : ImmutableRunProtocolV1.validate(input);
  const entries =
    input instanceof ImmutableRunProtocolV1 ? input.canonicalEntries : input;
  const byRef = new Map(entries.map((entry) => [refKey(entry.ref), entry]));
  const roots: RecordRef[] = [];
  // Only this abort-on-error invocation owns these mutable indexes. They never
  // escape to native views, accepted activation or the carrier's warm caches.
  let cursor: CommandReplayCursor | undefined;
  const ordered =
    replay === "incremental"
      ? protocol.causalRoots.map((ref) => byRef.get(refKey(ref))!)
      : entries;
  for (const entry of ordered) {
    if (entry.record[3] !== "manifest") {
      if (entry.record[3] === "join") cursor = undefined;
      continue;
    }
    const body = entry.record[10];
    if (body[0] === "genesis") continue;
    if (!isCommandBody(body))
      throw new TypeError("Manifest command body is invalid.");
    if (body[0] === "apply")
      cursor = validateApplyManifest(
        entry,
        body,
        byRef,
        protocol,
        provider,
        replay === "incremental" ? { cursor } : undefined,
      );
    else {
      cursor = undefined;
      validateRestoreManifest(entry, body, byRef, protocol, provider);
    }
    roots.push(entry.ref);
  }
  roots.sort(compareRefs);
  return Object.freeze({ protocol, commandRoots: Object.freeze(roots) });
}

function isCommandBody(body: CanonicalRecordV1[10]): body is CommandBody {
  return body.length === 8 && (body[0] === "apply" || body[0] === "restore");
}

function validateRestoreManifest(
  manifest: CanonicalRecordEntry,
  body: CommandBody,
  entries: ReadonlyMap<string, CanonicalRecordEntry>,
  protocol: ImmutableRunProtocolV1,
  provider: ImmutableRunColdViewProviderV1,
): void {
  if (body[0] !== "restore" || body[4] !== null)
    throw new TypeError("Restore manifest carries invalid payload evidence.");
  const authoredBase = provider.authoredBase(manifest.ref);
  if (!sameRef(authoredBase.semanticRoot, body[1]))
    throw new TypeError("Restore native base has the wrong semantic root.");
  const context = requireEntry(entries, body[2], "context");
  const contextBody = context.record[10];
  if (!Array.isArray(contextBody) || typeof contextBody[0] !== "string")
    throw new TypeError("Restore context record is invalid.");
  const decodedContext: unknown = JSON.parse(contextBody[0]);
  if (
    decodedContext === null ||
    typeof decodedContext !== "object" ||
    !("source" in decodedContext)
  )
    throw new TypeError("Restore context lacks retained source evidence.");
  const source = (decodedContext as { source?: unknown }).source;
  if (
    source === null ||
    typeof source !== "object" ||
    (source as { kind?: unknown }).kind !== "restore" ||
    typeof (source as { reference?: unknown }).reference !== "string"
  )
    throw new TypeError("Restore context source is invalid.");
  const reference = (source as { reference: string }).reference;
  const referent = provider.resolveReferent(reference, manifest.ref);
  if (referent?.kind !== "capture" || referent.material === undefined)
    throw new TypeError("Restore token does not resolve at its native base.");
  const envelope = requireEntry(entries, body[3], "envelope");
  const envelopeBody = envelope.record[10];
  if (
    !Array.isArray(envelopeBody) ||
    envelopeBody[0] !== "restore" ||
    typeof envelopeBody[1] !== "string"
  )
    throw new TypeError("Restore envelope is invalid.");
  const rawEnvelope: unknown = JSON.parse(envelopeBody[1]);
  if (
    rawEnvelope === null ||
    typeof rawEnvelope !== "object" ||
    typeof (rawEnvelope as { target?: unknown }).target !== "string"
  )
    throw new TypeError("Restore envelope target is invalid.");
  const targetMaterial = (rawEnvelope as { target: string }).target;
  if (targetMaterial !== referent.material)
    throw new TypeError("Restore envelope differs from retained material.");
  const target = decodeHistoricalState(targetMaterial, STRING_POSITION_CODEC);
  const rows = rowMap(body[5]);
  const members = rowMembers(rows, "restore", 0, entries);
  if (rows.size !== 1)
    throw new TypeError("Restore contains an extra operation row.");
  const transitions = members.filter(
    (member) => member.record[3] === "transition-v1",
  );
  const hasText = [...target.payloads.values()].some(
    (payload) => payload.kind === "text",
  );
  if (transitions.length !== (hasText ? 1 : 0))
    throw new TypeError("Restore transition presence is not exact.");
  const transitionBody = transitions[0]?.record[10];
  if (
    hasText &&
    (!Array.isArray(transitionBody) ||
      transitionBody[0] !== 1 ||
      transitionBody[1] !== "restore" ||
      !sameRefValue(transitionBody[2], referent.root))
  )
    throw new TypeError("Restore transition has the wrong captured root.");
  validateRestoreMembers(
    members,
    body,
    target,
    transitionBody as TransitionBody | undefined,
    authoredBase.view,
    provider.view(referent.root),
    protocol,
    referent.root,
    manifest.ref,
  );
  const actual = provider.authoredOutputs(manifest.ref);
  if (
    JSON.stringify(actual.structural) !== JSON.stringify(body[6]) ||
    JSON.stringify(actual.descriptors) !== JSON.stringify(body[7])
  )
    throw new TypeError("Native restore outputs differ from the manifest.");
}

function validateRestoreMembers(
  members: readonly CanonicalRecordEntry[],
  body: CommandBody,
  target: IntegratedDocumentSnapshot<string>,
  transition: TransitionBody | undefined,
  accepted: ImmutableRunNativeViewV1,
  sourceView: ImmutableRunNativeViewV1,
  protocol: ImmutableRunProtocolV1,
  sourceRoot: RecordRef,
  destinationRoot: RecordRef,
): void {
  if (target.rootId !== accepted.rootBlockId)
    throw new TypeError("Restore target has the wrong document root.");
  const transitionEntry = members.find(
    (member) => member.record[3] === "transition-v1",
  );
  const semantic = members.filter((member) => member !== transitionEntry);
  if (
    semantic.some(
      (member) =>
        !["live", "retire", "generation", "run"].includes(member.record[3]),
    )
  )
    throw new TypeError("Restore row contains an unrelated member.");
  const targetBlocks = new Set<string>([target.rootId]);
  for (const [id, live] of target.blockLiveness) if (live) targetBlocks.add(id);
  for (const id of target.placements.keys()) targetBlocks.add(id);
  const targetInline = new Set<string>(target.inlineContentOwners.keys());
  for (const id of accepted.blockIdentities?.() ??
    target.blockLiveness.keys()) {
    const refs = accepted.liveTokens("block", id);
    const lives = semantic.filter(
      (member) =>
        member.record[3] === "live" &&
        member.record[4][0] === "block" &&
        member.record[4][1] === id,
    );
    const retires = semantic.filter(
      (member) =>
        member.record[3] === "retire" &&
        member.record[4][0] === "block" &&
        member.record[4][1] === id,
    );
    if (id !== target.rootId && targetBlocks.has(id)) {
      if (lives.length !== 1 || retires.length !== 0)
        throw new TypeError("Restored Block liveness is not exact.");
    } else if (!targetBlocks.has(id) && refs.length > 0) {
      if (
        lives.length !== 0 ||
        retires.length !== 1 ||
        JSON.stringify(retires[0]!.record[10][0]) !==
          JSON.stringify(canonicalRefs(refs))
      )
        throw new TypeError("Restore Block retirement is not exact.");
    }
  }
  for (const id of accepted.inlineIdentities?.() ?? targetInline) {
    const inlineId = parseInlineContentId(id);
    const refs = accepted.liveTokens("inline", inlineId);
    const lives = semantic.filter(
      (member) =>
        member.record[3] === "live" &&
        member.record[4][0] === "inline" &&
        member.record[4][1] === id,
    );
    const retires = semantic.filter(
      (member) =>
        member.record[3] === "retire" &&
        member.record[4][0] === "inline" &&
        member.record[4][1] === id,
    );
    if (targetInline.has(id)) {
      if (lives.length !== 1 || retires.length !== 0)
        throw new TypeError("Restored InlineContent liveness is not exact.");
    } else if (refs.length > 0) {
      if (
        lives.length !== 0 ||
        retires.length !== 1 ||
        JSON.stringify(retires[0]!.record[10][0]) !==
          JSON.stringify(canonicalRefs(refs))
      )
        throw new TypeError("Restore InlineContent retirement is not exact.");
    }
  }
  const expectedDeletes = new Set<string>();
  for (const id of accepted.blockIdentities?.() ?? target.blockLiveness.keys())
    if (
      !targetBlocks.has(id) &&
      accepted.liveTokens("block", parseBlockId(id)).length > 0
    )
      expectedDeletes.add(id);
  const seenDeletes = new Set<string>();
  const seenPlacements = new Set<string>();
  for (const output of body[6]) {
    if (output[0] === "inline-create")
      throw new TypeError("Restore cannot create InlineContent ownership.");
    if (output[0] === "placement") {
      const placement = target.placements.get(parseBlockId(output[1]));
      if (
        placement === undefined ||
        encodeStructuralPlacement(placement, STRING_POSITION_CODEC) !==
          output[2]
      )
        throw new TypeError(
          "Restore placement output differs from its target.",
        );
      if (seenPlacements.has(output[1]))
        throw new TypeError("Restore repeats a placement output.");
      seenPlacements.add(output[1]);
    } else {
      if (!expectedDeletes.has(output[1]) || seenDeletes.has(output[1]))
        throw new TypeError("Restore Block-delete output is not exact.");
      seenDeletes.add(output[1]);
    }
  }
  if (
    seenDeletes.size !== expectedDeletes.size ||
    seenPlacements.size !== target.placements.size
  )
    throw new TypeError("Restore structural output set is incomplete.");
  const generations = new Map<string, CanonicalRecordEntry>();
  for (const member of semantic)
    if (member.record[3] === "generation") {
      const scope = member.record[4];
      if (scope[0] !== "text")
        throw new TypeError("Restore generation scope is invalid.");
      generations.set(scope[1], member);
    }
  if (body[7].length !== target.payloads.size)
    throw new TypeError("Restore descriptor output set is incomplete.");
  for (const output of body[7]) {
    const inlineId = parseInlineContentId(output[1]);
    const payload = target.payloads.get(inlineId);
    const owner = target.inlineContentOwners.get(inlineId);
    if (
      payload === undefined ||
      owner === undefined ||
      accepted.ownerOf(inlineId) !== owner ||
      sourceView.ownerOf(inlineId) !== owner
    )
      throw new TypeError("Restore descriptor ownership is invalid.");
    if (output[0] === "opaque") {
      if (
        payload.kind !== "opaque" ||
        output[2] !== payload.mediaType ||
        JSON.stringify(output[3]) !== JSON.stringify([...payload.bytes]) ||
        !sameOrigin(output[4], payload.origin)
      )
        throw new TypeError("Restore opaque descriptor is not exact.");
      continue;
    }
    if (payload.kind !== "text" || output[2] !== payload.mediaType)
      throw new TypeError("Restore text descriptor is not exact.");
    const generation = generations.get(output[1]);
    if (generation === undefined || !sameRef(generation.ref, output[3]))
      throw new TypeError(
        "Restore text descriptor lacks its fresh generation.",
      );
    const projected = protocol.projectGeneration(destinationRoot, output[3]);
    assertRestoreText(projected, payload.text, payload.spans);
  }
  if (transition !== undefined)
    validateTransitionCoverage(
      transition,
      sourceView,
      protocol,
      sourceRoot,
      destinationRoot,
      target,
      body,
      semantic,
    );
}

function validateTransitionCoverage(
  transition: TransitionBody,
  sourceView: ImmutableRunNativeViewV1,
  protocol: ImmutableRunProtocolV1,
  sourceRoot: RecordRef,
  destinationRoot: RecordRef,
  target: IntegratedDocumentSnapshot<string>,
  body: CommandBody,
  semanticMembers: readonly CanonicalRecordEntry[],
): void {
  const destinationDescriptors = new Map(
    body[7]
      .filter((output) => output[0] === "text")
      .map((output) => [output[1], output] as const),
  );
  const sourceProjections = new Map<
    string,
    ImmutableRunGenerationProjectionV1
  >();
  const destinationProjections = new Map<
    string,
    ImmutableRunGenerationProjectionV1
  >();
  for (const scope of transition[3]) {
    const inlineId = parseInlineContentId(scope[1]);
    const descriptor = sourceView.descriptorOf(inlineId);
    const payload = target.payloads.get(inlineId);
    if (
      sourceView.ownerOf(inlineId) !== parseBlockId(scope[0]) ||
      !sourceView.isInlineLive(inlineId) ||
      !sourceView.isBlockLive(parseBlockId(scope[0])) ||
      descriptor?.kind !== "text" ||
      !sameRef(descriptor.generation, scope[2]) ||
      payload?.kind !== "text" ||
      payload.mediaType !== descriptor.mediaType
    )
      throw new TypeError("Restore transition source scope is invalid.");
    sourceProjections.set(
      JSON.stringify(scope),
      protocol.projectGeneration(sourceRoot, scope[2]),
    );
  }
  for (const scope of transition[4]) {
    const output = destinationDescriptors.get(scope[1]);
    if (
      target.inlineContentOwners.get(parseInlineContentId(scope[1])) !==
        parseBlockId(scope[0]) ||
      output === undefined ||
      !sameRef(output[3], scope[2])
    )
      throw new TypeError("Restore transition destination scope is invalid.");
    destinationProjections.set(
      JSON.stringify(scope),
      protocol.projectGeneration(destinationRoot, scope[2]),
    );
  }
  if (
    sourceProjections.size !== destinationDescriptors.size ||
    destinationProjections.size !== destinationDescriptors.size
  )
    throw new TypeError("Restore transition scope coverage is incomplete.");
  const sourceCounts = unitCounts(sourceProjections);
  const destinationCounts = unitCounts(destinationProjections);
  const authoredRuns = new Set(
    semanticMembers
      .filter((member) => member.record[3] === "run")
      .map((member) => refKey(member.ref)),
  );
  for (const mapping of transition[5]) {
    const sourceProjection = sourceProjections.get(JSON.stringify(mapping[0]));
    const destinationProjection = destinationProjections.get(
      JSON.stringify(mapping[4]),
    );
    if (sourceProjection === undefined || destinationProjection === undefined)
      throw new TypeError("Restore span names an undeclared scope.");
    if (!authoredRuns.has(refKey(mapping[5])))
      throw new TypeError("Restore destination run is not command-authored.");
    const sourceUnits = intervalUnits(
      sourceProjection,
      mapping[1],
      mapping[2],
      mapping[3],
    );
    const destinationUnits = intervalUnits(
      destinationProjection,
      mapping[5],
      mapping[6],
      mapping[7],
    );
    if (sourceUnits.length !== destinationUnits.length)
      throw new TypeError("Restore span lengths differ.");
    for (let index = 0; index < sourceUnits.length; index++) {
      const left = sourceUnits[index]!;
      const right = destinationUnits[index]!;
      if (
        left.text !== right.text ||
        left.origin.kind !== right.origin.kind ||
        left.origin.id !== right.origin.id
      )
        throw new TypeError("Restore span text or Origin differs.");
      incrementUnit(sourceCounts, mapping[0], left.run, left.offset);
      incrementUnit(destinationCounts, mapping[4], right.run, right.offset);
    }
  }
  for (const count of [...sourceCounts.values(), ...destinationCounts.values()])
    if (count !== 1)
      throw new TypeError("Restore span mapping coverage is not exact.");
  const expectedSpans: TransitionBody[5][number][] = [];
  const expectedBoundaries: TransitionBody[6][number][] = [];
  for (let index = 0; index < transition[3].length; index++) {
    const sourceScope = transition[3][index]!;
    const destinationScope = transition[4][index];
    if (destinationScope === undefined)
      throw new TypeError("Restore transition scope order is incomplete.");
    const sourceGroup = projectedTransitionGroup(
      sourceScope,
      sourceProjections.get(JSON.stringify(sourceScope))!,
      true,
    );
    const destinationGroup = projectedTransitionGroup(
      destinationScope,
      destinationProjections.get(JSON.stringify(destinationScope))!,
      true,
    );
    mapTransitionUnits(
      sourceGroup.units,
      destinationGroup.units,
      "restore",
      expectedSpans,
    );
    appendExpectedRestoreBoundaries(
      sourceGroup,
      destinationGroup,
      expectedBoundaries,
    );
  }
  if (
    transition[3].length !== transition[4].length ||
    JSON.stringify(transition[5]) !== JSON.stringify(expectedSpans)
  )
    throw new TypeError("Restore span mapping order or coverage is invalid.");
  for (const mapping of transition[6]) {
    const sourceProjection = sourceProjections.get(JSON.stringify(mapping[0]));
    const destinationProjection = destinationProjections.get(
      JSON.stringify(mapping[2]),
    );
    if (sourceProjection === undefined || destinationProjection === undefined)
      throw new TypeError("Restore boundary names an undeclared scope.");
    validateMappedBoundary(mapping[1], mapping[0], sourceProjection);
    validateMappedBoundary(mapping[3], mapping[2], destinationProjection);
  }
  if (JSON.stringify(transition[6]) !== JSON.stringify(expectedBoundaries))
    throw new TypeError("Restore boundary mapping coverage is not exact.");
}

function appendExpectedRestoreBoundaries(
  source: TransitionUnitGroup,
  destination: TransitionUnitGroup,
  output: TransitionBody[6][number][],
): void {
  if (source.units.length === 0 || destination.units.length === 0) {
    if (source.units.length !== destination.units.length)
      throw new TypeError("Restore empty material differs from its source.");
    const sourceBoundary: TransitionBoundary = Object.freeze([
      "empty",
      source.scope[2],
    ]);
    const destinationBoundary: TransitionBoundary = Object.freeze([
      "empty",
      destination.scope[2],
    ]);
    output.push(
      Object.freeze([
        source.scope,
        sourceBoundary,
        destination.scope,
        destinationBoundary,
        "restore",
      ]),
    );
    return;
  }
  const firstSource = source.units[0]!;
  const lastSource = source.units.at(-1)!;
  const firstDestination = destination.units[0]!;
  const lastDestination = destination.units.at(-1)!;
  const sourceStart: TransitionBoundary = Object.freeze([
    "at",
    firstSource.run,
    firstSource.offset,
  ]);
  const sourceEnd: TransitionBoundary = Object.freeze([
    "at",
    lastSource.run,
    lastSource.offset + 1,
  ]);
  const destinationStart: TransitionBoundary = Object.freeze([
    "at",
    firstDestination.run,
    firstDestination.offset,
  ]);
  const destinationEnd: TransitionBoundary = Object.freeze([
    "at",
    lastDestination.run,
    lastDestination.offset + 1,
  ]);
  output.push(
    Object.freeze([
      source.scope,
      sourceStart,
      destination.scope,
      destinationStart,
      "restore",
    ]),
    Object.freeze([
      source.scope,
      sourceEnd,
      destination.scope,
      destinationEnd,
      "restore",
    ]),
  );
}

function unitCounts(
  projections: ReadonlyMap<string, ImmutableRunGenerationProjectionV1>,
): Map<string, number> {
  const result = new Map<string, number>();
  for (const [scope, projection] of projections)
    for (const unit of projection.units)
      result.set(unitCountKey(scope, unit.run, unit.offset), 0);
  return result;
}

function unitCountKey(scope: string, run: RecordRef, offset: number): string {
  return JSON.stringify([scope, run, offset]);
}

function incrementUnit(
  counts: Map<string, number>,
  scope: TransitionScope,
  run: RecordRef,
  offset: number,
): void {
  const key = unitCountKey(JSON.stringify(scope), run, offset);
  const count = counts.get(key);
  if (count === undefined)
    throw new TypeError("Restore mapping names a non-visible source unit.");
  counts.set(key, count + 1);
}

function intervalUnits(
  projection: ImmutableRunGenerationProjectionV1,
  run: RecordRef,
  start: number,
  end: number,
): ReadonlyArray<(typeof projection.units)[number]> {
  const units = projection.units.filter(
    (unit) =>
      sameRef(unit.run, run) && unit.offset >= start && unit.offset < end,
  );
  if (units.length !== end - start)
    throw new TypeError("Restore mapping interval is not exactly visible.");
  return units;
}

function validateMappedBoundary(
  boundary: TransitionBody[6][number][1],
  scope: TransitionScope,
  projection: ImmutableRunGenerationProjectionV1,
): void {
  if (boundary[0] === "empty") {
    if (projection.units.length !== 0 || !sameRef(boundary[1], scope[2]))
      throw new TypeError("Restore empty boundary is invalid.");
    return;
  }
  const run = projection.runs.find((candidate) =>
    sameRef(candidate.run, boundary[1]),
  );
  if (run === undefined || boundary[2] < 0 || boundary[2] > run.source.length)
    throw new TypeError("Restore run boundary is invalid.");
}

const STRING_POSITION_CODEC: StructuralPositionCodec<string> = Object.freeze({
  encode(position: string): string {
    return position;
  },
  decode(encoded: string): string {
    return encoded;
  },
});

function validateApplyManifest(
  manifest: CanonicalRecordEntry,
  body: CommandBody,
  entries: ReadonlyMap<string, CanonicalRecordEntry>,
  protocol: ImmutableRunProtocolV1,
  provider: ImmutableRunColdViewProviderV1,
  replay: Readonly<{ cursor: CommandReplayCursor | undefined }> | undefined,
): CommandReplayCursor | undefined {
  const authoredBase = provider.authoredBase(manifest.ref);
  if (!sameRef(authoredBase.semanticRoot, body[1]))
    throw new TypeError(
      "Native authored base has the wrong semantic root label.",
    );
  const accepted = authoredBase.view;
  const context = requireEntry(entries, body[2], "context");
  const envelope = requireEntry(entries, body[3], "envelope");
  const envelopeBody = envelope.record[10];
  if (!Array.isArray(envelopeBody) || typeof envelopeBody[1] !== "string")
    throw new TypeError("Apply envelope body is invalid.");
  const decodedEnvelope = decodeImmutableRunApplyEnvelopeV1(
    envelopeBody[1],
    manifest.record[2],
  );
  const contextBody = context.record[10];
  if (!Array.isArray(contextBody) || typeof contextBody[0] !== "string")
    throw new TypeError("Command context body is invalid.");
  const decodedContext: unknown = JSON.parse(contextBody[0]);
  if (typeof decodedContext !== "object" || decodedContext === null)
    throw new TypeError("Apply context is invalid.");
  const effect = manifest.record[7];
  if (effect === null) throw new TypeError("Command effect is missing.");
  const identity = qualificationEffectIdentity({
    actorId: effect[0],
    effectId: effect[1],
  });
  const evidence =
    body[4] === null
      ? undefined
      : requireEntry(entries, body[4], "payload-effect-v2");
  let operations: readonly ImmutableRunPayloadOperationV1[] = [];
  if (evidence !== undefined) {
    const evidenceBody = evidence.record[10];
    if (
      !Array.isArray(evidenceBody) ||
      evidenceBody[0] !== identity ||
      !sameRefValue(evidenceBody[1], body[1]) ||
      typeof evidenceBody[2] !== "string"
    )
      throw new TypeError("Payload evidence is not bound to this command.");
    operations = decodeImmutableRunPayloadOperationsV1(evidenceBody[2]);
  }
  if (
    (operations.length === 0) !== (evidence === undefined) ||
    decodedEnvelope.payloadEffectId !==
      (evidence === undefined ? undefined : identity)
  )
    throw new TypeError("Envelope payload evidence presence is incorrect.");

  const rows = rowMap(body[5]);
  // This first cursor supports only ordinary fine edits. Every other form takes
  // the unchanged projection path and ends the contiguous exact-root segment.
  const eligible =
    replay !== undefined &&
    decodedEnvelope.deleteBlockIds.length === 0 &&
    decodedEnvelope.placements.length === 0 &&
    decodedEnvelope.inlineContents.length === 0 &&
    body[6].length === 0 &&
    body[7].length === 0 &&
    !rows.has("transition:0") &&
    !("source" in decodedContext) &&
    operations.every(
      ({ operation }) =>
        operation.kind === "insert-text" || operation.kind === "delete-text",
    );
  const cursor = eligible
    ? replay.cursor !== undefined && sameRef(replay.cursor.atRoot, body[1])
      ? replay.cursor
      : { atRoot: body[1], indexes: new Map<string, ImmutableRunSourceIndex>() }
    : undefined;
  validateStructuralRows(
    decodedEnvelope,
    body,
    rows,
    entries,
    accepted,
    operations,
  );
  validatePayloadRows(
    operations,
    body,
    rows,
    entries,
    accepted,
    protocol,
    identity,
    cursor,
  );
  const transitionRow = rows.get("transition:0");
  if (transitionRow !== undefined)
    validateApplyTransition(
      transitionRow,
      decodedContext,
      manifest,
      body,
      entries,
      protocol,
      provider,
    );
  else if ("source" in decodedContext)
    throw new TypeError("Copy attribution lacks transition evidence.");
  const expectedRowCount =
    decodedEnvelope.deleteBlockIds.length +
    decodedEnvelope.placements.length +
    decodedEnvelope.inlineContents.length +
    operations.length +
    (transitionRow === undefined ? 0 : 1);
  if (rows.size !== expectedRowCount)
    throw new TypeError("Command contains an extra or missing operation row.");
  const actual = provider.authoredOutputs(manifest.ref);
  if (
    JSON.stringify(actual.structural) !== JSON.stringify(body[6]) ||
    JSON.stringify(actual.descriptors) !== JSON.stringify(body[7])
  )
    throw new TypeError("Native authored outputs differ from the manifest.");
  // Helpers stage and commit individual operation patches into private indexes.
  // A later failure aborts the entire invocation; never catch it and resume this
  // cursor. Only complete command/native validation advances its exact root.
  if (cursor !== undefined) cursor.atRoot = manifest.ref;
  return cursor;
}

function validateApplyTransition(
  row: OperationRow,
  decodedContext: object,
  manifest: CanonicalRecordEntry,
  body: CommandBody,
  entries: ReadonlyMap<string, CanonicalRecordEntry>,
  protocol: ImmutableRunProtocolV1,
  provider: ImmutableRunColdViewProviderV1,
): void {
  const members = row[2].map((reference) => requireEntry(entries, reference));
  const transitions = members.filter(
    (member) => member.record[3] === "transition-v1",
  );
  if (
    transitions.length !== 1 ||
    members.some(
      (member) =>
        member.record[3] !== "transition-v1" && member.record[3] !== "retire",
    )
  )
    throw new TypeError("Apply transition row has unrelated members.");
  const transition = transitions[0]!.record[10] as TransitionBody;
  const kind = transition[1];
  if (kind === "copy" && transition[3].length !== 1)
    throw new TypeError("Copy transition requires one source scope.");
  let sourceRoot = body[1];
  if (kind === "copy") {
    const source = (decodedContext as { source?: unknown }).source;
    if (
      source === null ||
      typeof source !== "object" ||
      (source as { kind?: unknown }).kind !== "copy" ||
      typeof (source as { reference?: unknown }).reference !== "string"
    )
      throw new TypeError("Copy transition lacks exact source attribution.");
    const referent = provider.resolveReferent(
      (source as { reference: string }).reference,
      manifest.ref,
    );
    if (referent === undefined || !sameRef(referent.root, transition[2]))
      throw new TypeError("Copy transition source reference is unresolved.");
    sourceRoot = referent.root;
  } else {
    if ("source" in decodedContext || !sameRef(transition[2], body[1]))
      throw new TypeError("Lineage transition source root is invalid.");
  }
  const sourceView = provider.view(sourceRoot);
  const destinationView = provider.view(manifest.ref);
  const sourceProjections = new Map<
    string,
    ImmutableRunGenerationProjectionV1
  >();
  const destinationProjections = new Map<
    string,
    ImmutableRunGenerationProjectionV1
  >();
  let mediaType: string | undefined;
  for (const scope of transition[3]) {
    const inlineId = parseInlineContentId(scope[1]);
    const blockId = parseBlockId(scope[0]);
    const descriptor = sourceView.descriptorOf(inlineId);
    if (
      sourceView.ownerOf(inlineId) !== blockId ||
      !sourceView.isInlineLive(inlineId) ||
      !sourceView.isBlockLive(blockId) ||
      descriptor?.kind !== "text" ||
      !sameRef(descriptor.generation, scope[2])
    )
      throw new TypeError("Transition source scope is invalid.");
    if (mediaType !== undefined && descriptor.mediaType !== mediaType)
      throw new TypeError("Transition source Media Types differ.");
    mediaType = descriptor.mediaType;
    sourceProjections.set(
      JSON.stringify(scope),
      protocol.projectGeneration(sourceRoot, scope[2]),
    );
  }
  for (const scope of transition[4]) {
    const inlineId = parseInlineContentId(scope[1]);
    const blockId = parseBlockId(scope[0]);
    const descriptor = destinationView.descriptorOf(inlineId);
    if (
      destinationView.ownerOf(inlineId) !== blockId ||
      !destinationView.isInlineLive(inlineId) ||
      !destinationView.isBlockLive(blockId) ||
      descriptor?.kind !== "text" ||
      !sameRef(descriptor.generation, scope[2]) ||
      descriptor.mediaType !== mediaType
    )
      throw new TypeError("Transition destination scope is invalid.");
    destinationProjections.set(
      JSON.stringify(scope),
      protocol.projectGeneration(manifest.ref, scope[2]),
    );
  }
  const sourceCounts = unitCounts(sourceProjections);
  const destinationCounts = unitCounts(destinationProjections);
  const destinationScopeKeys = new Set(
    transition[4].map((scope) => JSON.stringify(scope)),
  );
  const transitionRuns = new Set<string>();
  for (const operationRow of body[5])
    if (operationRow[0] === "payload")
      for (const reference of operationRow[2]) {
        const member = requireEntry(entries, reference);
        if (member.record[3] !== "run" || member.record[4][0] !== "text")
          continue;
        const inlineId = parseInlineContentId(member.record[4][1]);
        const descriptor = destinationView.descriptorOf(inlineId);
        const owner = destinationView.ownerOf(inlineId);
        if (
          descriptor?.kind === "text" &&
          owner !== undefined &&
          destinationScopeKeys.has(
            JSON.stringify([owner, inlineId, descriptor.generation]),
          )
        )
          transitionRuns.add(refKey(member.ref));
      }
  for (const mapping of transition[5]) {
    const leftProjection = sourceProjections.get(JSON.stringify(mapping[0]));
    const rightProjection = destinationProjections.get(
      JSON.stringify(mapping[4]),
    );
    if (leftProjection === undefined || rightProjection === undefined)
      throw new TypeError("Transition span names an undeclared scope.");
    if (!transitionRuns.has(refKey(mapping[5])))
      throw new TypeError(
        "Transition destination run is not command-authored.",
      );
    const left = intervalUnits(
      leftProjection,
      mapping[1],
      mapping[2],
      mapping[3],
    );
    const right = intervalUnits(
      rightProjection,
      mapping[5],
      mapping[6],
      mapping[7],
    );
    if (left.length !== right.length)
      throw new TypeError("Transition span lengths differ.");
    for (let index = 0; index < left.length; index++) {
      if (
        left[index]!.text !== right[index]!.text ||
        left[index]!.origin.kind !== right[index]!.origin.kind ||
        left[index]!.origin.id !== right[index]!.origin.id
      )
        throw new TypeError("Transition span text or Origin differs.");
      incrementUnit(
        sourceCounts,
        mapping[0],
        left[index]!.run,
        left[index]!.offset,
      );
      incrementUnit(
        destinationCounts,
        mapping[4],
        right[index]!.run,
        right[index]!.offset,
      );
    }
  }
  const expectedSourceCount = kind === "copy" ? transition[4].length : 1;
  let mappedSourceUnits = 0;
  for (const count of sourceCounts.values())
    if (
      (kind === "copy" && count !== 0 && count !== expectedSourceCount) ||
      (kind !== "copy" && count !== expectedSourceCount)
    )
      throw new TypeError("Transition source coverage is not exact.");
    else if (count !== 0) mappedSourceUnits += 1;
  for (const count of destinationCounts.values())
    if (
      (kind === "copy" && count !== 0 && count !== 1) ||
      (kind !== "copy" && count !== 1)
    )
      throw new TypeError("Transition destination coverage is not exact.");
  for (const [scopeKey, projection] of destinationProjections)
    for (const unit of projection.units)
      if (
        transitionRuns.has(refKey(unit.run)) &&
        destinationCounts.get(unitCountKey(scopeKey, unit.run, unit.offset)) !==
          1
      )
        throw new TypeError(
          "Transition command output coverage is incomplete.",
        );
  if (kind === "copy" && mappedSourceUnits === 0)
    throw new TypeError("Copy transition maps no source material.");
  const sourceGroups = transition[3].map((scope) => {
    const projection = sourceProjections.get(JSON.stringify(scope))!;
    return projectedTransitionGroup(
      scope,
      projection,
      kind !== "copy" ||
        ((unit) =>
          sourceCounts.get(
            unitCountKey(JSON.stringify(scope), unit.run, unit.offset),
          ) !== 0),
    );
  });
  const destinationGroups = transition[4].map((scope) =>
    projectedTransitionGroup(
      scope,
      destinationProjections.get(JSON.stringify(scope))!,
      (unit) => transitionRuns.has(refKey(unit.run)),
    ),
  );
  const expectedSpans: TransitionBody[5][number][] = [];
  const expectedBoundaries: TransitionBody[6][number][] = [];
  if (kind === "copy") {
    const copiedUnits = sourceGroups.flatMap((group) => group.units);
    for (const destination of destinationGroups) {
      mapTransitionUnits(copiedUnits, destination.units, "copy", expectedSpans);
      mapTransitionBoundaries(
        sourceGroups,
        [destination],
        "copy",
        expectedBoundaries,
      );
    }
  } else {
    mapTransitionUnits(
      sourceGroups.flatMap((group) => group.units),
      destinationGroups.flatMap((group) => group.units),
      "lineage",
      expectedSpans,
    );
    mapTransitionBoundaries(
      sourceGroups,
      destinationGroups,
      "lineage",
      expectedBoundaries,
    );
  }
  if (JSON.stringify(transition[5]) !== JSON.stringify(expectedSpans))
    throw new TypeError(
      "Transition span mapping order or coverage is invalid.",
    );
  const destinationIds = new Set(transition[4].map((scope) => scope[1]));
  const expectedRetired = new Set(
    kind === "copy"
      ? []
      : transition[3]
          .filter((scope) => !destinationIds.has(scope[1]))
          .map((scope) => scope[1]),
  );
  const retirements = members.filter((member) => member.record[3] === "retire");
  if (
    retirements.length !== expectedRetired.size ||
    retirements.some(
      (member) =>
        member.record[4][0] !== "inline" ||
        !expectedRetired.has(member.record[4][1]) ||
        JSON.stringify(member.record[10][0]) !==
          JSON.stringify(
            canonicalRefs(
              provider
                .authoredBase(manifest.ref)
                .view.liveTokens(
                  "inline",
                  parseInlineContentId(member.record[4][1]),
                ),
            ),
          ),
    )
  )
    throw new TypeError("Transition retirement set is not exact.");
  for (const mapping of transition[6]) {
    const left = sourceProjections.get(JSON.stringify(mapping[0]));
    const right = destinationProjections.get(JSON.stringify(mapping[2]));
    if (left === undefined || right === undefined)
      throw new TypeError("Transition boundary names an undeclared scope.");
    validateMappedBoundary(mapping[1], mapping[0], left);
    validateMappedBoundary(mapping[3], mapping[2], right);
  }
  if (JSON.stringify(transition[6]) !== JSON.stringify(expectedBoundaries))
    throw new TypeError("Transition boundary coverage is not exact.");
}

function projectedTransitionGroup(
  scope: TransitionScope,
  projection: ImmutableRunGenerationProjectionV1,
  include:
    | boolean
    | ((unit: ImmutableRunGenerationProjectionV1["units"][number]) => boolean),
): TransitionUnitGroup {
  const selected =
    typeof include === "boolean"
      ? include
        ? projection.units
        : []
      : projection.units.filter(include);
  return {
    scope,
    units: selected.map((unit) => ({
      scope,
      run: unit.run,
      offset: unit.offset,
      text: unit.text,
      origin: unit.origin as QualificationOrigin,
    })),
  };
}

function validateStructuralRows(
  envelope: ReturnType<typeof decodeImmutableRunApplyEnvelopeV1>,
  body: CommandBody,
  rows: ReadonlyMap<string, OperationRow>,
  entries: ReadonlyMap<string, CanonicalRecordEntry>,
  accepted: ImmutableRunNativeViewV1,
  operations: readonly ImmutableRunPayloadOperationV1[],
): void {
  const expected: StructuralOutput[] = [];
  const placed = new Set(envelope.placements.map((value) => value.blockId));
  const payloadIds = new Set(
    operations.map((value) => value.operation.inlineContentId),
  );
  const created = new Set<string>();
  for (const [index, blockId] of envelope.deleteBlockIds.entries()) {
    if (blockId === accepted.rootBlockId || !accepted.isBlockLive(blockId))
      throw new TypeError(
        "Block deletion does not target a live non-root Block.",
      );
    const members = rowMembers(rows, "block-delete", index, entries);
    if (members.length !== 1 || members[0]!.record[3] !== "retire")
      throw new TypeError("Block deletion outputs are not exact.");
    assertEntity(members[0]!, "block", blockId);
    const retired = members[0]!.record[10];
    if (
      !Array.isArray(retired) ||
      JSON.stringify(retired[0]) !==
        JSON.stringify(canonicalRefs(accepted.liveTokens("block", blockId)))
    )
      throw new TypeError("Block deletion retires the wrong observed tokens.");
    expected.push(Object.freeze(["block-delete", blockId]));
  }
  for (const [index, placement] of envelope.placements.entries()) {
    if (
      placement.blockId === accepted.rootBlockId ||
      (accepted.hasBlockIdentity(placement.blockId) &&
        !accepted.isBlockLive(placement.blockId)) ||
      accepted.hasInlineIdentity(placement.blockId)
    )
      throw new TypeError("Placement reuses an invalid durable identity.");
    const members = rowMembers(rows, "placement", index, entries);
    assertOneLive(members, "block", placement.blockId);
    expected.push(
      Object.freeze(["placement", placement.blockId, placement.encoded]),
    );
  }
  for (const [index, creation] of envelope.inlineContents.entries()) {
    if (
      created.has(creation.inlineContentId) ||
      accepted.hasInlineIdentity(creation.inlineContentId) ||
      accepted.hasBlockIdentity(creation.inlineContentId) ||
      (!accepted.isBlockLive(creation.blockId) &&
        !placed.has(creation.blockId)) ||
      !payloadIds.has(creation.inlineContentId)
    )
      throw new TypeError("InlineContent creation prefix is invalid.");
    created.add(creation.inlineContentId);
    const members = rowMembers(rows, "inline-create", index, entries);
    assertOneLive(members, "inline", creation.inlineContentId);
    expected.push(
      Object.freeze([
        "inline-create",
        creation.inlineContentId,
        creation.blockId,
      ]),
    );
  }
  if (JSON.stringify(expected) !== JSON.stringify(body[6]))
    throw new TypeError(
      "Structural outputs differ from the canonical envelope.",
    );
}

function validatePayloadRows(
  operations: readonly ImmutableRunPayloadOperationV1[],
  body: CommandBody,
  rows: ReadonlyMap<string, OperationRow>,
  entries: ReadonlyMap<string, CanonicalRecordEntry>,
  accepted: ImmutableRunNativeViewV1,
  protocol: ImmutableRunProtocolV1,
  effectIdentity: string,
  cursor: CommandReplayCursor | undefined,
): void {
  const created = new Map<InlineContentId, BlockId>();
  const placed = new Set<BlockId>();
  for (const output of body[6])
    if (output[0] === "inline-create")
      created.set(parseInlineContentId(output[1]), parseBlockId(output[2]));
    else if (output[0] === "placement") placed.add(parseBlockId(output[1]));
  const changed = new Map<string, DescriptorOutput>();
  const working = new Map<
    string,
    {
      descriptor: ImmutableRunNativeDescriptorV1 | undefined;
      index: ImmutableRunSourceIndex | undefined;
    }
  >();
  for (const [index, decoded] of operations.entries()) {
    const operation = decoded.operation;
    const owner =
      created.get(operation.inlineContentId) ??
      accepted.ownerOf(operation.inlineContentId);
    if (owner === undefined)
      throw new TypeError("Payload row has no deterministic prefix owner.");
    if (
      !created.has(operation.inlineContentId) &&
      (!accepted.isInlineLive(operation.inlineContentId) ||
        (!accepted.isBlockLive(owner) && !placed.has(owner)))
    )
      throw new TypeError("Payload row targets a non-live ownership prefix.");
    let target = working.get(operation.inlineContentId);
    if (target === undefined) {
      const descriptor = accepted.descriptorOf(operation.inlineContentId);
      let sourceIndex: ImmutableRunSourceIndex | undefined;
      if (descriptor?.kind === "text") {
        const key = JSON.stringify([
          operation.inlineContentId,
          descriptor.generation,
        ]);
        sourceIndex = cursor?.indexes.get(key);
        if (sourceIndex === undefined) {
          sourceIndex = new ImmutableRunSourceIndex(
            protocol.projectGeneration(body[1], descriptor.generation),
          );
          cursor?.indexes.set(key, sourceIndex);
        }
      }
      target = { descriptor, index: sourceIndex };
      working.set(operation.inlineContentId, target);
    }
    const members = rowMembers(rows, "payload", index, entries);
    const source = members.filter((member) =>
      ["generation", "run", "erase"].includes(member.record[3]),
    );
    const live = members.filter((member) => member.record[3] === "live");
    if (source.length + live.length !== members.length)
      throw new TypeError("Payload row contains an unrelated semantic fact.");
    const real =
      operation.kind !== "delete-text" || operation.start !== operation.end;
    if (real) {
      if (live.length !== 2)
        throw new TypeError("Payload mutation has extra or missing liveness.");
      assertOneLive(live, "block", owner);
      assertOneLive(live, "inline", operation.inlineContentId);
    } else if (live.length !== 0 || source.length !== 0) {
      throw new TypeError("No-op deletion emitted semantic outputs.");
    }
    if (operation.kind === "replace-opaque") {
      if (decoded.replacementBase !== undefined)
        throw new TypeError("Whole replacement carries a replacement base.");
      if (source.length !== 0)
        throw new TypeError("Opaque replacement emitted source facts.");
      changed.set(
        operation.inlineContentId,
        Object.freeze([
          "opaque",
          operation.inlineContentId,
          operation.mediaType,
          Object.freeze([...operation.bytes]),
          recordOrigin(operation.origin),
        ]),
      );
      target.descriptor = Object.freeze({
        kind: "opaque",
        mediaType: operation.mediaType,
        bytes: Object.freeze([...operation.bytes]),
        origin: Object.freeze({ ...operation.origin }),
        replacementEffectId: effectIdentity,
      });
      target.index = undefined;
      continue;
    }
    if (operation.kind === "replace-text") {
      if (decoded.replacementBase !== undefined)
        throw new TypeError("Whole replacement carries a replacement base.");
      if (source[0]?.record[3] !== "generation")
        throw new TypeError("Text replacement lacks its fresh generation.");
      const generation = source[0];
      assertGenerationRecord(generation, operation);
      if (source.slice(1).some((member) => member.record[3] !== "run"))
        throw new TypeError("Text replacement has a non-run source output.");
      const replacementIndex = emptyIndex(generation.ref);
      const runText = replayClaimedRuns(
        replacementIndex,
        source.slice(1),
        operation.inlineContentId,
        operation.text,
        0,
        operation.origin,
      );
      if (runText !== operation.text)
        throw new TypeError("Text replacement run source is not exact.");
      changed.set(
        operation.inlineContentId,
        Object.freeze([
          "text",
          operation.inlineContentId,
          operation.mediaType,
          generation.ref,
        ]),
      );
      target.descriptor = Object.freeze({
        kind: "text",
        mediaType: operation.mediaType,
        generation: generation.ref,
        replacementEffectId: effectIdentity,
      });
      target.index = replacementIndex;
      continue;
    }
    if (target.descriptor?.kind !== "text" || target.index === undefined)
      throw new TypeError(
        "Fine-grained operation lacks its selected text generation.",
      );
    if (decoded.replacementBase !== target.descriptor.replacementEffectId)
      throw new TypeError(
        "Fine-grained operation has the wrong replacement base.",
      );
    if (operation.kind === "insert-text") {
      if (source.some((member) => member.record[3] !== "run"))
        throw new TypeError("Insertion has a non-run source output.");
      const runText = replayClaimedRuns(
        target.index,
        source,
        operation.inlineContentId,
        operation.text,
        operation.offset,
        operation.origin,
      );
      if (
        runText !== operation.text ||
        source.some((m) => m.record[3] !== "run")
      )
        throw new TypeError("Insertion source output is not exact.");
    } else if (operation.start !== operation.end) {
      if (source.length !== 1 || source[0]!.record[3] !== "erase")
        throw new TypeError("Deletion output is not one exact erase fact.");
      replayClaimedErase(
        target.index,
        source[0]!,
        operation.inlineContentId,
        operation.start,
        operation.end,
      );
    } else {
      assertRange(target.index, operation.start, operation.end);
    }
  }
  const expected = [...changed.values()].sort((left, right) =>
    compareStrings(left[1], right[1]),
  );
  if (JSON.stringify(expected) !== JSON.stringify(body[7]))
    throw new TypeError(
      "Descriptor outputs are not the exact changed targets.",
    );
}

function assertGenerationRecord(
  generation: CanonicalRecordEntry,
  operation: Extract<
    IntegratedPayloadChange,
    { readonly kind: "replace-text" }
  >,
): void {
  const scope = generation.record[4];
  const generationBody = generation.record[10];
  if (
    generation.record[3] !== "generation" ||
    scope[0] !== "text" ||
    scope[1] !== operation.inlineContentId ||
    scope[2] !== generation.record[2] ||
    !Array.isArray(generationBody) ||
    generationBody[0] !== operation.mediaType
  )
    throw new TypeError("Fresh generation does not match its replacement.");
}

function emptyIndex(generation: RecordRef): ImmutableRunSourceIndex {
  return new ImmutableRunSourceIndex({
    generation,
    text: "",
    units: [],
    sourceUnits: [],
    runs: [],
    erasures: [],
    spans: [],
    maximumCounter: 0n,
  });
}

function replayClaimedRuns(
  index: ImmutableRunSourceIndex,
  records: readonly CanonicalRecordEntry[],
  inlineContentId: InlineContentId,
  exactText: string,
  insertionOffset: number,
  origin: QualificationOrigin,
): string {
  let concatenated = "";
  const patch = index.stage((preview) => {
    let offset = insertionOffset;
    assertBoundary(preview, offset);
    for (const entry of records) {
      const record = entry.record;
      const scope = record[4];
      const clock = record[5];
      const body = record[10];
      if (
        record[3] !== "run" ||
        scope[0] !== "text" ||
        scope[1] !== inlineContentId ||
        clock === null ||
        BigInt(clock[0]) !== preview.maximumCounter + 1n ||
        !Array.isArray(body) ||
        body.length !== 3 ||
        typeof body[1] !== "string" ||
        !sameOrigin(body[2], origin) ||
        !sameAnchor(body[0], recordAnchor(preview.anchorAt(offset)))
      )
        throw new TypeError(
          "Authored run differs from the exact operation prefix.",
        );
      concatenated += body[1];
      preview.insert(offset, {
        run: entry.ref,
        anchor: preview.anchorAt(offset),
        source: body[1],
        origin,
        counter: BigInt(clock[0]),
        replicaUuid: clock[1],
      });
      offset += body[1].length;
    }
  });
  if (concatenated !== exactText)
    throw new TypeError(
      "Authored runs do not concatenate to exact input text.",
    );
  patch.commit();
  return concatenated;
}

function replayClaimedErase(
  index: ImmutableRunSourceIndex,
  entry: CanonicalRecordEntry,
  inlineContentId: InlineContentId,
  start: number,
  end: number,
): void {
  const record = entry.record;
  const scope = record[4];
  const clock = record[5];
  const eraseBody = record[10];
  if (
    record[3] !== "erase" ||
    scope[0] !== "text" ||
    scope[1] !== inlineContentId ||
    clock === null ||
    !Array.isArray(eraseBody) ||
    eraseBody.length !== 1
  )
    throw new TypeError("Authored erase has the wrong generation scope.");
  const patch = index.stage((preview) => {
    assertRange(preview, start, end);
    const counter = preview.maximumCounter + 1n;
    if (BigInt(clock[0]) !== counter)
      throw new TypeError("Authored erase counter is not exact.");
    const intervals = preview
      .erase(start, end, counter)
      .map((interval) => [interval.run, interval.start, interval.end]);
    if (JSON.stringify(intervals) !== JSON.stringify(eraseBody[0]))
      throw new TypeError(
        "Authored erase intervals differ from the actual selection.",
      );
  });
  patch.commit();
}

function sameOrigin(value: unknown, origin: QualificationOrigin): boolean {
  return (
    Array.isArray(value) &&
    value.length === 2 &&
    value[0] === origin.kind &&
    value[1] === origin.id
  );
}

function sameAnchor(value: unknown, expected: unknown): boolean {
  return JSON.stringify(value) === JSON.stringify(expected);
}

function recordAnchor(
  anchor: ReturnType<ImmutableRunSourceIndex["anchorAt"]>,
): readonly [RecordRef, number] | null {
  return anchor === null
    ? null
    : Object.freeze([anchor.run, anchor.sourceEndOffset]);
}

function rowMap(
  rows: readonly OperationRow[],
): ReadonlyMap<string, OperationRow> {
  return new Map(rows.map((row) => [`${row[0]}:${row[1]}`, row]));
}

function rowMembers(
  rows: ReadonlyMap<string, OperationRow>,
  category: OperationCategory,
  index: number,
  entries: ReadonlyMap<string, CanonicalRecordEntry>,
): readonly CanonicalRecordEntry[] {
  const row = rows.get(`${category}:${index}`);
  if (row === undefined)
    throw new TypeError("Command operation row is missing.");
  return row[2].map((ref) => requireEntry(entries, ref));
}

function requireEntry(
  entries: ReadonlyMap<string, CanonicalRecordEntry>,
  ref: RecordRef,
  kind?: CanonicalRecordV1[3],
): CanonicalRecordEntry {
  const entry = entries.get(refKey(ref));
  if (entry === undefined || (kind !== undefined && entry.record[3] !== kind))
    throw new TypeError("Command member Ref is missing or has the wrong kind.");
  return entry;
}

function assertEntity(
  entry: CanonicalRecordEntry,
  kind: "block" | "inline",
  id: string,
): void {
  if (entry.record[4][0] !== kind || entry.record[4][1] !== id)
    throw new TypeError("Liveness member has the wrong entity scope.");
}

function assertOneLive(
  members: readonly CanonicalRecordEntry[],
  kind: "block" | "inline",
  id: string,
): void {
  const matches = members.filter(
    (member) =>
      member.record[3] === "live" &&
      member.record[4][0] === kind &&
      member.record[4][1] === id,
  );
  if (matches.length !== 1)
    throw new TypeError("Expected exactly one scoped liveness addition.");
}

function refKey(ref: RecordRef): string {
  return `${ref[0]}:${ref[1]}`;
}
