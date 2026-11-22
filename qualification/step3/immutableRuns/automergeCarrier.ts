import {
  decodeStructuralPlacement,
  type StructuralPlacement,
  type StructuralPositionCodec,
  type StructuralPositionOrdering,
} from "../../../src/carrier/index.js";
import {
  parseBlockId,
  parseInlineContentId,
  type BlockId,
  type InlineContentId,
} from "../../../src/domain/index.js";
import type { QualificationPayloadSnapshot } from "../payload/carrier.js";
import type {
  QualificationOriginKind,
  QualificationTextSpan,
} from "../payload/carrier.js";
import {
  decodeEffectContext,
  type QualificationEffectContext,
} from "../integrated/effectContext.js";
import { isOrdinaryTextChange } from "../integrated/ordinaryEdit.js";
import {
  captureHistoricalState,
  decodeHistoricalState,
} from "../integrated/historicalState.js";
import type { RecordedPayloadEffect } from "../integrated/replacementEvidence.js";
import type {
  IntegratedCarrierQualificationOptions,
  IntegratedDocumentCarrier,
  IntegratedDocumentCarrierFactory,
  IntegratedDocumentChange,
  IntegratedPlacementChange,
  IntegratedPayloadChange,
  IntegratedDocumentSnapshot,
  QualificationOrdinaryRange,
  QualificationStableTextPosition,
  QualificationTextAffinity,
} from "../integrated/carrier.js";
import {
  prepareImmutableRunApplyCommandV1,
  prepareImmutableRunRestoreCommandV1,
  type ImmutableRunNativeDescriptorV1,
  type ImmutableRunNativeViewV1,
  type ImmutableRunWarmStateV1,
  type PreparedImmutableRunCommandV1,
} from "./commands.js";
import {
  AutomergeImmutableRunDocument,
  type ImmutableRunNativeActivationV1,
} from "./nativeDocument.js";
import {
  decodeImmutableRunPayloadOperationsV1,
  type CanonicalRecordEntry,
  type RecordRef,
  type TransitionBody,
} from "./record.js";
import {
  ImmutableRunSourceIndex,
  type ImmutableRunIndexPosition,
} from "./sourceIndex.js";
import type { ImmutableRunGenerationProjectionV1 } from "./protocol.js";

/** Explicit logical scope used only by immutable-run transition fixtures. */
export interface ImmutableRunFixtureScopeV1 {
  /** Logical Block identity; no continuing identity is inferred. */
  readonly blockId: BlockId;
  /** Logical InlineContent identity; no continuing identity is inferred. */
  readonly inlineContentId: InlineContentId;
}

/** Explicit destination material for a pure text-preserving fixture transition. */
export interface ImmutableRunFixtureDestinationV1 extends ImmutableRunFixtureScopeV1 {
  /** Exact shared fine-grained Media Type. */
  readonly mediaType: string;
  /** Ordered exact target text and Origin spans. */
  readonly spans: readonly QualificationTextSpan[];
}

/** Qualification-private logical split, merge, or copy request. */
export interface ImmutableRunFixtureTransitionV1<Position> {
  /** Mapping relation; copy does not establish lineage continuation. */
  readonly kind: "split" | "merge" | "copy";
  /** Explicit ordered source logical scopes. */
  readonly sources: readonly ImmutableRunFixtureScopeV1[];
  /** Explicit ordered destination scopes and exact target material. */
  readonly destinations: readonly ImmutableRunFixtureDestinationV1[];
  /** Explicit structural updates, including any newly allocated Blocks. */
  readonly placements?: readonly IntegratedPlacementChange<Position>[];
  /** Normal actor/effect attribution for this atomic command. */
  readonly context: QualificationEffectContext;
  /** Exact effect identity or retained token for copy. */
  readonly sourceReference?: string;
}

/**
 * Qualification-only integrated carrier backed by immutable source runs.
 *
 * @remarks Warm apply prepares against operation-sized caches and publishes one
 * native Automerge change. Full record/history validation is restricted to
 * creation, load, merge, and explicit recovery. Restore and fixture-transition
 * authoring are refused until their closed validators are implemented.
 */
class AutomergeImmutableRunCarrier<
  Position,
> implements IntegratedDocumentCarrier<Position> {
  public readonly candidate = "automerge" as const;
  private activation: ImmutableRunNativeActivationV1;
  private readonly view: WarmNativeView;
  private readonly sourceIndexes = new Map<string, ImmutableRunSourceIndex>();
  private readonly entries = new Map<string, CanonicalRecordEntry>();
  private readonly replicaUuid: string;
  private ordinaryRevision = Symbol("immutable-run-ordinary");

  public constructor(
    private readonly native: AutomergeImmutableRunDocument,
    private readonly positionCodec: StructuralPositionCodec<Position>,
    private readonly options: IntegratedCarrierQualificationOptions,
  ) {
    this.activation = native.activate();
    const cold = this.activation.provider.view(this.activation.root);
    this.view = new WarmNativeView(cold, this.activation.entries);
    for (const entry of this.activation.entries)
      this.entries.set(encodeRefValue(entry.ref), entry);
    this.replicaUuid = native.freshReplicaUuid();
    this.rebuildSelectedIndexes();
  }

  /** Applies one attributed or explicitly synthetic qualification command. */
  public applyChange(change: IntegratedDocumentChange<Position>): void {
    // A general position decoder can change or throw between calls. Preserve
    // its full projection preflight; only an explicit lifetime-stable pure
    // decoder qualifies for the bounded ordinary path.
    if (this.options.purePositionDecoder !== true) this.snapshot();
    const context = change.context ?? syntheticContext();
    if (context.source?.kind === "copy") {
      this.publishInferredCopy(change, context);
      return;
    }
    this.publish(change, context);
  }

  /** Publishes one qualification-private pure split, merge, or copy fixture. */
  public applyFixtureTransition(
    input: ImmutableRunFixtureTransitionV1<Position>,
  ): void {
    this.coldRefresh();
    let sourceRoot = this.activation.root;
    let sourceView = this.activation.provider.view(sourceRoot);
    let context = input.context;
    if (input.kind === "copy") {
      const reference = input.sourceReference;
      if (typeof reference !== "string" || reference.length === 0)
        throw new TypeError("Copy fixture requires an exact source reference.");
      if (
        context.source !== undefined &&
        (context.source.kind !== "copy" ||
          context.source.reference !== reference)
      )
        throw new TypeError("Copy fixture context names a different source.");
      context = Object.freeze({
        actorId: context.actorId,
        effectId: context.effectId,
        source: Object.freeze({ kind: "copy", reference }),
      });
      const capture = this.native.readCapture(reference);
      let effectRoot: RecordRef | undefined;
      try {
        const identity: unknown = JSON.parse(reference);
        if (
          Array.isArray(identity) &&
          identity.length === 2 &&
          typeof identity[0] === "string" &&
          typeof identity[1] === "string"
        )
          effectRoot = this.view.effectRoot(identity[0], identity[1]);
      } catch {
        // Exact retained tokens need not be JSON effect identities.
      }
      if (capture !== undefined && effectRoot !== undefined)
        throw new TypeError("Copy source reference is ambiguous.");
      sourceRoot = capture?.root ?? effectRoot!;
      if (sourceRoot === undefined)
        throw new TypeError("Copy source reference is unresolved.");
      sourceView = this.activation.provider.view(sourceRoot);
    } else if (context.source !== undefined) {
      throw new TypeError("Split/merge attribution cannot name copy source.");
    }
    const sources = input.sources.map((scope) => {
      const descriptor = sourceView.descriptorOf(scope.inlineContentId);
      if (
        sourceView.ownerOf(scope.inlineContentId) !== scope.blockId ||
        !sourceView.isInlineLive(scope.inlineContentId) ||
        !sourceView.isBlockLive(scope.blockId) ||
        descriptor?.kind !== "text"
      )
        throw new TypeError("Fixture source scope is not live text.");
      return Object.freeze({
        blockId: scope.blockId,
        inlineContentId: scope.inlineContentId,
        generation: descriptor.generation,
        mediaType: descriptor.mediaType,
        projection: this.activation.protocol.projectGeneration(
          sourceRoot,
          descriptor.generation,
        ),
      });
    });
    const placed = new Set(input.placements?.map((value) => value.blockId));
    const inlineContents = input.destinations
      .filter(
        (destination) =>
          !this.view.hasInlineIdentity(destination.inlineContentId),
      )
      .map((destination) => {
        if (
          !this.view.isBlockLive(destination.blockId) &&
          !placed.has(destination.blockId)
        )
          throw new TypeError("Fixture destination owner is not live.");
        return Object.freeze({
          inlineContentId: destination.inlineContentId,
          blockId: destination.blockId,
        });
      });
    for (const destination of input.destinations) {
      const owner = this.view.ownerOf(destination.inlineContentId);
      if (owner !== undefined && owner !== destination.blockId)
        throw new TypeError("Fixture destination changes immutable ownership.");
    }
    // Multiple Origins are preserved by replacing once then inserting each
    // following span at its exact boundary in the same command.
    const expandedPayloads = input.destinations.flatMap((destination) => {
      const [first, ...rest] = destination.spans;
      const operations: IntegratedPayloadChange[] = [
        {
          kind: "replace-text",
          inlineContentId: destination.inlineContentId,
          mediaType: destination.mediaType,
          text: first?.text ?? "",
          origin: first?.origin ?? { kind: "unknown" as const, id: "empty" },
        },
      ];
      let offset = first?.text.length ?? 0;
      for (const span of rest) {
        operations.push({
          kind: "insert-text",
          inlineContentId: destination.inlineContentId,
          offset,
          text: span.text,
          origin: span.origin,
        });
        offset += span.text.length;
      }
      return operations;
    });
    const change: IntegratedDocumentChange<Position> = {
      ...(input.placements === undefined
        ? {}
        : { placements: input.placements }),
      ...(inlineContents.length === 0 ? {} : { inlineContents }),
      payloads: expandedPayloads,
      context,
    };
    const command = prepareImmutableRunApplyCommandV1({
      state: {
        view: this.view,
        replicaUuid: this.replicaUuid,
        runSourceUnits: this.native.runSourceUnits,
        sourceIndexes: this.sourceIndexes,
      },
      change,
      context,
      positionCodec: this.positionCodec,
      transition: {
        kind: input.kind,
        sourceRoot,
        sources,
        destinations: input.destinations.map((destination) => ({
          blockId: destination.blockId,
          inlineContentId: destination.inlineContentId,
        })),
      },
    });
    this.native.publish(command);
    this.adopt(command);
    this.ordinaryRevision = Symbol("immutable-run-ordinary");
  }

  /** Retains exact current material and native heads as observation metadata. */
  public captureHistoricalState(): string {
    // Capture is an explicit cold transition: retain the complete committed
    // source graph and exact native winner view observed by this token.
    this.coldRefresh();
    const token = crypto.randomUUID();
    this.native.capture(
      token,
      captureHistoricalState(this.snapshot(), this.positionCodec),
    );
    return token;
  }

  /** Materializes retained exact material without changing the current tip. */
  public materializeHistoricalState(
    token: string,
  ): IntegratedDocumentSnapshot<Position> {
    const capture = this.native.readCapture(token);
    if (capture === undefined)
      throw new TypeError("Unknown retained state token is unknown.");
    return decodeHistoricalState(capture.material, this.positionCodec);
  }

  /** Restores one qualified retained observation in one native command. */
  public restoreHistoricalState(
    token: string,
    context?: QualificationEffectContext,
  ): void {
    const capture = this.native.readCapture(token);
    if (capture === undefined)
      throw new TypeError("Unknown retained state token is unknown.");
    if (
      context?.source !== undefined &&
      (context.source.kind !== "restore" || context.source.reference !== token)
    )
      throw new TypeError(
        "Immutable-run restore context must name the exact retained token.",
      );
    const baseContext = context ?? syntheticContext();
    const attributed: QualificationEffectContext = Object.freeze({
      actorId: baseContext.actorId,
      effectId: baseContext.effectId,
      source: Object.freeze({ kind: "restore", reference: token }),
    });
    const target = decodeHistoricalState(capture.material, this.positionCodec);
    const command = prepareImmutableRunRestoreCommandV1({
      state: {
        view: this.view,
        replicaUuid: this.replicaUuid,
        runSourceUnits: this.native.runSourceUnits,
        sourceIndexes: this.sourceIndexes,
      },
      target,
      token,
      sourceRoot: capture.root,
      sourceView: this.activation.provider.view(capture.root),
      sourceProtocol: this.activation.protocol,
      context: attributed,
      positionCodec: this.positionCodec,
    });
    this.native.publish(command);
    this.adopt(command);
    this.ordinaryRevision = Symbol("immutable-run-ordinary");
  }

  /** Returns detached semantic effect contexts, excluding bootstrap metadata. */
  public effects(): ReadonlyMap<string, QualificationEffectContext> {
    const result = new Map<string, QualificationEffectContext>();
    const byRef = this.entries;
    for (const entry of this.entries.values()) {
      if (entry.record[3] !== "manifest" || entry.record[10][0] === "genesis")
        continue;
      const body = entry.record[10];
      if (!Array.isArray(body) || body.length !== 8) continue;
      const context = byRef.get(encodeRefValue(body[2]));
      if (
        context === undefined ||
        context.record[3] !== "context" ||
        typeof context.record[10][0] !== "string"
      )
        throw new TypeError("Command context record is missing.");
      const decoded = decodeEffectContext(context.record[10][0]);
      result.set(JSON.stringify([decoded.actorId, decoded.effectId]), decoded);
    }
    return result;
  }

  /** Expands v2 root ancestry only for this explicit legacy inspection. */
  public recordedPayloadEffects(): readonly RecordedPayloadEffect[] {
    this.coldRefresh();
    const result: RecordedPayloadEffect[] = [];
    const byRef = this.entries;
    for (const entry of this.entries.values()) {
      if (entry.record[3] !== "payload-effect-v2") continue;
      const body = entry.record[10];
      if (
        typeof body[0] !== "string" ||
        !Array.isArray(body[1]) ||
        typeof body[2] !== "string"
      )
        throw new TypeError("Payload-effect record is invalid.");
      const operations = JSON.parse(body[2]) as readonly Record<
        string,
        string | number | readonly number[]
      >[];
      // Decode through the closed codec before exposing the legacy material.
      decodeImmutableRunPayloadOperationsV1(body[2]);
      result.push({
        effectId: body[0],
        parents: payloadParents(
          decodeRefValue(body[1]),
          this.activation,
          byRef,
        ),
        operations,
      });
    }
    return Object.freeze(
      result.sort((a, b) => a.effectId.localeCompare(b.effectId)),
    );
  }

  /** Returns detached persisted transition tuples for fixture inspection. */
  public fixtureTransitions(): readonly TransitionBody[] {
    return Object.freeze(
      [...this.entries.values()]
        .filter((entry) => entry.record[3] === "transition-v1")
        .map((entry) => entry.record[10] as TransitionBody),
    );
  }

  /** Reports the pinned Automerge lifecycle honestly. */
  public nativeLifecycle() {
    return {
      kind: "none" as const,
      availability: "unavailable" as const,
    };
  }

  /** Projects detached current native winners and indexed text material. */
  public snapshot(): IntegratedDocumentSnapshot<Position> {
    if (this.options.workCounters) this.options.workCounters.snapshots++;
    const placements = new Map<BlockId, StructuralPlacement<Position>>();
    const blockLiveness = new Map<BlockId, boolean>();
    for (const id of this.view.blockIds) {
      const blockId = parseBlockId(id);
      blockLiveness.set(blockId, this.view.isBlockLive(blockId));
    }
    for (const [id, encoded] of this.native.placements()) {
      const blockId = parseBlockId(id);
      if (!this.view.isBlockLive(blockId)) continue;
      if (this.options.workCounters)
        this.options.workCounters.placementDecodes++;
      placements.set(
        blockId,
        decodeStructuralPlacement(encoded, this.positionCodec),
      );
    }
    const inlineContentOwners = new Map<InlineContentId, BlockId>();
    const payloads = new Map<InlineContentId, QualificationPayloadSnapshot>();
    for (const id of this.view.inlineIds) {
      const inlineId = parseInlineContentId(id);
      const owner = this.view.ownerOf(inlineId);
      if (
        owner === undefined ||
        !this.view.isInlineLive(inlineId) ||
        !this.view.isBlockLive(owner)
      )
        continue;
      const payload = this.projectPayload(inlineId);
      if (payload === undefined) continue;
      inlineContentOwners.set(inlineId, owner);
      payloads.set(inlineId, payload);
    }
    return Object.freeze({
      rootId: this.view.rootBlockId,
      blockLiveness,
      placements,
      inlineContentOwners,
      payloads,
    });
  }

  /** Projects one visible payload without materializing unrelated text. */
  public projectEditorPayload(
    inlineContentId: InlineContentId,
  ): QualificationPayloadSnapshot | undefined {
    const owner = this.view.ownerOf(inlineContentId);
    if (
      owner === undefined ||
      !this.view.isInlineLive(inlineContentId) ||
      !this.view.isBlockLive(owner)
    )
      return undefined;
    return this.projectPayload(inlineContentId);
  }

  /** Reads an indexed range only under the explicit pure-decoder opt in. */
  public readOrdinaryTextRange(
    inlineContentId: InlineContentId,
    start: number,
    end: number,
  ): QualificationOrdinaryRange | undefined {
    if (this.options.purePositionDecoder !== true) return undefined;
    const descriptor = this.view.descriptorOf(inlineContentId);
    if (descriptor?.kind !== "text") return undefined;
    const index = this.sourceIndexes.get(descriptor.generation[0]);
    if (index === undefined) return undefined;
    const spans = index.read(start, end).map((span) => ({
      text: span.text,
      origin: { kind: qualificationKind(span.origin.kind), id: span.origin.id },
    }));
    return Object.freeze({
      revision: this.ordinaryRevision,
      length: index.length,
      spans: Object.freeze(spans),
    });
  }

  /** Rebuilds the explicit ordinary proof at a controlled cold boundary. */
  public prepareOrdinaryText(): boolean {
    if (this.options.purePositionDecoder !== true) return false;
    this.coldRefresh();
    return true;
  }

  /** Applies a payload-only fine edit against the exact local receipt. */
  public applyOrdinaryChange(
    change: IntegratedDocumentChange<Position>,
    revision: symbol,
  ): symbol {
    if (this.options.purePositionDecoder !== true)
      throw new TypeError(
        "Ordinary immutable-run editing requires a pure decoder opt in.",
      );
    if (revision !== this.ordinaryRevision)
      throw new TypeError("Ordinary immutable-run revision is stale.");
    if (!isOrdinaryTextChange(change))
      throw new TypeError(
        "Ordinary immutable-run change must be payload-only fine text.",
      );
    this.applyChange(change);
    return this.ordinaryRevision;
  }

  /** Captures source neighbours in a generation-qualified private cursor. */
  public createStableTextPosition(
    inlineContentId: InlineContentId,
    editorUtf16Offset: number,
    affinity: QualificationTextAffinity,
  ): QualificationStableTextPosition {
    const descriptor = this.view.descriptorOf(inlineContentId);
    if (descriptor?.kind !== "text")
      throw new TypeError("Stable position target is not text.");
    const index = this.sourceIndexes.get(descriptor.generation[0]);
    if (index === undefined)
      throw new TypeError("Text generation index is unavailable.");
    const position = index.createPosition(editorUtf16Offset, affinity);
    return Object.freeze({
      candidate: "automerge",
      inlineContentId,
      cursor: JSON.stringify(position),
      textObjectId: encodeRefValue(descriptor.generation),
    });
  }

  /** Resolves a private source cursor and refuses obsolete generations. */
  public resolveStableTextPosition(
    position: QualificationStableTextPosition,
  ): number | undefined {
    if (position.candidate !== "automerge") return undefined;
    const descriptor = this.view.descriptorOf(position.inlineContentId);
    if (
      descriptor?.kind !== "text" ||
      position.textObjectId !== encodeRefValue(descriptor.generation)
    )
      return undefined;
    const index = this.sourceIndexes.get(descriptor.generation[0]);
    if (index === undefined) return undefined;
    return index.resolvePosition(decodePosition(position.cursor));
  }

  /** Encodes complete candidate state. */
  public encode(): Uint8Array {
    return this.native.encode();
  }

  /** Merges and cold-validates same-bootstrap native state before adoption. */
  public mergeEncoded(encoded: Uint8Array): void {
    this.native.mergeEncoded(encoded);
    this.coldRefresh();
  }

  private publish(
    change: IntegratedDocumentChange<Position>,
    context: QualificationEffectContext,
  ): void {
    const state: ImmutableRunWarmStateV1 = {
      view: this.view,
      replicaUuid: this.replicaUuid,
      runSourceUnits: this.native.runSourceUnits,
      sourceIndexes: this.sourceIndexes,
    };
    const command = prepareImmutableRunApplyCommandV1({
      state,
      change,
      context,
      positionCodec: this.positionCodec,
    });
    this.native.publish(command);
    this.adopt(command);
    this.ordinaryRevision = Symbol("immutable-run-ordinary");
  }

  private publishInferredCopy(
    change: IntegratedDocumentChange<Position>,
    context: QualificationEffectContext,
  ): void {
    this.coldRefresh();
    const resolved = this.resolveCopyReferent(context.source!.reference);
    const insertions = (change.payloads ?? [])
      .map((operation, index) => ({ operation, index }))
      .filter(
        (
          value,
        ): value is {
          operation: Extract<IntegratedPayloadChange, { kind: "insert-text" }>;
          index: number;
        } => value.operation.kind === "insert-text",
      );
    if (
      insertions.length !== 1 ||
      insertions.length !== (change.payloads?.length ?? 0) ||
      (change.placements?.length ?? 0) !== 0 ||
      (change.inlineContents?.length ?? 0) !== 0 ||
      (change.deleteBlockIds?.length ?? 0) !== 0
    )
      throw new TypeError(
        "Common copy transition requires one pure destination insertion.",
      );
    const targets = new Map<InlineContentId, typeof insertions>();
    for (const insertion of insertions) {
      const values = targets.get(insertion.operation.inlineContentId) ?? [];
      values.push(insertion);
      targets.set(insertion.operation.inlineContentId, values);
    }
    if (targets.size !== 1)
      throw new TypeError(
        "Common copy transition requires one unambiguous destination fragment.",
      );
    const [destinationId, destinationInsertions] = [...targets][0]!;
    const expected = destinationInsertions.flatMap(({ operation }) =>
      [...operation.text].flatMap((character) =>
        character.length === 1
          ? [{ text: character, origin: operation.origin }]
          : [
              { text: character.slice(0, 1), origin: operation.origin },
              { text: character.slice(1), origin: operation.origin },
            ],
      ),
    );
    const candidates: {
      readonly blockId: BlockId;
      readonly inlineContentId: InlineContentId;
      readonly descriptor: Extract<
        ImmutableRunNativeDescriptorV1,
        { kind: "text" }
      >;
      readonly projection: ImmutableRunGenerationProjectionV1;
      readonly units: ImmutableRunGenerationProjectionV1["units"];
    }[] = [];
    for (const inlineContentId of resolved.view.inlineIdentities?.() ?? []) {
      const descriptor = resolved.view.descriptorOf(inlineContentId);
      const blockId = resolved.view.ownerOf(inlineContentId);
      if (
        descriptor?.kind !== "text" ||
        blockId === undefined ||
        !resolved.view.isInlineLive(inlineContentId) ||
        !resolved.view.isBlockLive(blockId)
      )
        continue;
      const projection = this.activation.protocol.projectGeneration(
        resolved.root,
        descriptor.generation,
      );
      for (
        let start = 0;
        start + expected.length <= projection.units.length;
        start++
      ) {
        const units = projection.units.slice(start, start + expected.length);
        if (
          units.every(
            (unit, index) =>
              unit.text === expected[index]!.text &&
              unit.origin.kind === expected[index]!.origin.kind &&
              unit.origin.id === expected[index]!.origin.id,
          )
        )
          candidates.push({
            blockId,
            inlineContentId,
            descriptor,
            projection,
            units,
          });
      }
    }
    if (candidates.length !== 1)
      throw new TypeError("Copy fragment source is missing or ambiguous.");
    const source = candidates[0]!;
    const destinationBlock = this.view.ownerOf(destinationId);
    const destinationDescriptor = this.view.descriptorOf(destinationId);
    if (
      destinationBlock === undefined ||
      !this.view.isInlineLive(destinationId) ||
      !this.view.isBlockLive(destinationBlock) ||
      destinationDescriptor?.kind !== "text"
    )
      throw new TypeError("Copy destination is not selected live text.");
    const selectedProjection: ImmutableRunGenerationProjectionV1 =
      Object.freeze({
        ...source.projection,
        text: source.units.map((unit) => unit.text).join(""),
        units: Object.freeze([...source.units]),
        spans: Object.freeze(
          destinationInsertions.map(({ operation }) =>
            Object.freeze({ text: operation.text, origin: operation.origin }),
          ),
        ),
      });
    const command = prepareImmutableRunApplyCommandV1({
      state: {
        view: this.view,
        replicaUuid: this.replicaUuid,
        runSourceUnits: this.native.runSourceUnits,
        sourceIndexes: this.sourceIndexes,
      },
      change,
      context,
      positionCodec: this.positionCodec,
      transition: {
        kind: "copy",
        sourceRoot: resolved.root,
        sources: [
          {
            blockId: source.blockId,
            inlineContentId: source.inlineContentId,
            generation: source.descriptor.generation,
            mediaType: source.descriptor.mediaType,
            projection: selectedProjection,
          },
        ],
        destinations: [
          {
            blockId: destinationBlock,
            inlineContentId: destinationId,
            operationIndexes: destinationInsertions.map(({ index }) => index),
          },
        ],
      },
    });
    this.native.publish(command);
    this.adopt(command);
    this.ordinaryRevision = Symbol("immutable-run-ordinary");
  }

  private resolveCopyReferent(reference: string): Readonly<{
    root: RecordRef;
    view: ImmutableRunNativeViewV1;
  }> {
    const capture = this.native.readCapture(reference);
    let effectRoot: RecordRef | undefined;
    try {
      const identity: unknown = JSON.parse(reference);
      if (
        Array.isArray(identity) &&
        identity.length === 2 &&
        typeof identity[0] === "string" &&
        typeof identity[1] === "string"
      )
        effectRoot = this.view.effectRoot(identity[0], identity[1]);
    } catch {
      // A retained token need not be a JSON effect identity.
    }
    if (capture !== undefined && effectRoot !== undefined)
      throw new TypeError("Copy source reference is ambiguous.");
    const root = capture?.root ?? effectRoot;
    if (root === undefined)
      throw new TypeError("Copy source reference is unresolved.");
    return Object.freeze({
      root,
      view: this.activation.provider.view(root),
    });
  }

  private adopt(command: PreparedImmutableRunCommandV1): void {
    for (const generation of command.cacheReplay.retiredGenerations)
      this.sourceIndexes.delete(generation);
    for (const [generation, index] of command.cacheReplay.indexUpdates)
      this.sourceIndexes.set(generation, index);
    this.view.adopt(command);
    for (const entry of command.entries)
      this.entries.set(encodeRefValue(entry.ref), entry);
  }

  private projectPayload(
    inlineContentId: InlineContentId,
  ): QualificationPayloadSnapshot | undefined {
    const descriptor = this.view.descriptorOf(inlineContentId);
    if (descriptor === undefined) return undefined;
    if (descriptor.kind === "opaque")
      return Object.freeze({
        kind: "opaque",
        mediaType: descriptor.mediaType,
        bytes: new Uint8Array(descriptor.bytes),
        origin: Object.freeze({ ...descriptor.origin }),
      });
    const index = this.sourceIndexes.get(descriptor.generation[0]);
    if (index === undefined)
      throw new TypeError("Selected text index is unavailable.");
    const spans = index.read(0, index.length).map((span) => ({
      text: span.text,
      origin: { kind: qualificationKind(span.origin.kind), id: span.origin.id },
    }));
    return Object.freeze({
      kind: "text",
      mediaType: descriptor.mediaType,
      text: spans.map((span) => span.text).join(""),
      spans: Object.freeze(spans),
    });
  }

  private rebuildSelectedIndexes(): void {
    this.sourceIndexes.clear();
    for (const descriptor of this.native.descriptors().values()) {
      if (descriptor.kind !== "text") continue;
      const projection = this.activation.protocol.projectGeneration(
        this.activation.root,
        descriptor.generation,
      );
      this.sourceIndexes.set(
        descriptor.generation[0],
        new ImmutableRunSourceIndex(projection),
      );
    }
  }

  private coldRefresh(): void {
    this.activation = this.native.activate();
    this.view.reset(
      this.activation.provider.view(this.activation.root),
      this.activation.entries,
    );
    this.entries.clear();
    for (const entry of this.activation.entries)
      this.entries.set(encodeRefValue(entry.ref), entry);
    this.rebuildSelectedIndexes();
    this.ordinaryRevision = Symbol("immutable-run-ordinary");
  }
}

class WarmNativeView implements ImmutableRunNativeViewV1 {
  public root: RecordRef;
  public rootBlockId: BlockId;
  public readonly blockIds = new Set<string>();
  public readonly inlineIds = new Set<string>();
  readonly #liveBlocks = new Set<string>();
  readonly #liveInline = new Set<string>();
  readonly #owners = new Map<string, BlockId>();
  readonly #descriptors = new Map<string, ImmutableRunNativeDescriptorV1>();
  readonly #tokens = new Map<string, RecordRef[]>();
  readonly #effects = new Map<string, RecordRef>();

  public constructor(
    cold: ImmutableRunNativeViewV1,
    entries: readonly CanonicalRecordEntry[],
  ) {
    this.root = cold.root;
    this.rootBlockId = cold.rootBlockId;
    this.reset(cold, entries);
  }

  public reset(
    cold: ImmutableRunNativeViewV1,
    entries: readonly CanonicalRecordEntry[],
  ): void {
    this.root = cold.root;
    this.rootBlockId = cold.rootBlockId;
    this.blockIds.clear();
    this.inlineIds.clear();
    this.#liveBlocks.clear();
    this.#liveInline.clear();
    this.#owners.clear();
    this.#descriptors.clear();
    this.#tokens.clear();
    this.#effects.clear();
    this.blockIds.add(cold.rootBlockId);
    this.#liveBlocks.add(cold.rootBlockId);
    for (const entry of entries) this.consumeRecord(entry);
    // Cold entry enumeration is canonical rather than causal. Replace the
    // temporary token lists with the provider's exact root projection.
    this.#tokens.clear();
    for (const id of this.blockIds) {
      const references = cold.liveTokens("block", parseBlockId(id));
      if (references.length > 0)
        this.#tokens.set(`block:${id}`, [...references]);
    }
    for (const id of this.inlineIds) {
      const references = cold.liveTokens("inline", parseInlineContentId(id));
      if (references.length > 0)
        this.#tokens.set(`inline:${id}`, [...references]);
    }
    for (const id of this.inlineIds) {
      const inlineId = parseInlineContentId(id);
      const owner = cold.ownerOf(inlineId);
      const descriptor = cold.descriptorOf(inlineId);
      if (owner !== undefined) this.#owners.set(id, owner);
      if (descriptor !== undefined) this.#descriptors.set(id, descriptor);
    }
    for (const id of this.blockIds)
      if (cold.isBlockLive(parseBlockId(id))) this.#liveBlocks.add(id);
    for (const id of this.inlineIds)
      if (cold.isInlineLive(parseInlineContentId(id))) this.#liveInline.add(id);
  }

  public hasBlockIdentity(id: string): boolean {
    return this.blockIds.has(id);
  }
  public blockIdentities(): readonly BlockId[] {
    return Object.freeze([...this.blockIds].map(parseBlockId));
  }
  public isBlockLive(id: BlockId): boolean {
    return this.#liveBlocks.has(id);
  }
  public hasInlineIdentity(id: string): boolean {
    return this.inlineIds.has(id);
  }
  public inlineIdentities(): readonly InlineContentId[] {
    return Object.freeze([...this.inlineIds].map(parseInlineContentId));
  }
  public isInlineLive(id: InlineContentId): boolean {
    return this.#liveInline.has(id);
  }
  public ownerOf(id: InlineContentId): BlockId | undefined {
    return this.#owners.get(id);
  }
  public descriptorOf(
    id: InlineContentId,
  ): ImmutableRunNativeDescriptorV1 | undefined {
    return this.#descriptors.get(id);
  }
  public liveTokens(
    kind: "block" | "inline",
    id: BlockId | InlineContentId,
  ): readonly RecordRef[] {
    return this.#tokens.get(`${kind}:${id}`) ?? [];
  }
  public effectRoot(actorId: string, effectId: string): RecordRef | undefined {
    return this.#effects.get(JSON.stringify([actorId, effectId]));
  }

  public adopt(command: PreparedImmutableRunCommandV1): void {
    const affected = new Set<string>();
    for (const entry of command.entries) {
      this.consumeRecord(entry);
      if (entry.record[3] === "live" || entry.record[3] === "retire")
        affected.add(`${entry.record[4][0]}:${entry.record[4][1]}`);
    }
    for (const output of command.nativeDelta.structural) {
      if (output[0] === "placement") {
        this.blockIds.add(output[1]);
      } else if (output[0] === "inline-create") {
        this.inlineIds.add(output[1]);
        this.#owners.set(output[1], parseBlockId(output[2]));
      }
    }
    for (const key of affected) {
      const separator = key.indexOf(":");
      const kind = key.slice(0, separator);
      const id = key.slice(separator + 1);
      const live = (this.#tokens.get(key)?.length ?? 0) > 0;
      if (kind === "block") {
        if (live || id === this.rootBlockId) this.#liveBlocks.add(id);
        else this.#liveBlocks.delete(id);
      } else if (live) this.#liveInline.add(id);
      else this.#liveInline.delete(id);
    }
    const effect = command.manifest.record[7];
    if (effect === null) throw new TypeError("Command effect is missing.");
    const effectIdentity = JSON.stringify(effect);
    const manifestBody = command.manifest.record[10];
    const replacementEffectId =
      Array.isArray(manifestBody) && manifestBody[0] === "restore"
        ? undefined
        : effectIdentity;
    for (const output of command.nativeDelta.descriptors) {
      const descriptor: ImmutableRunNativeDescriptorV1 =
        output[0] === "text"
          ? Object.freeze({
              kind: "text",
              mediaType: output[2],
              generation: output[3],
              replacementEffectId,
            })
          : Object.freeze({
              kind: "opaque",
              mediaType: output[2],
              bytes: output[3],
              origin: Object.freeze({ kind: output[4][0], id: output[4][1] }),
              replacementEffectId,
            });
      this.#descriptors.set(output[1], descriptor);
    }
    this.#effects.set(effectIdentity, command.manifest.ref);
    this.root = command.manifest.ref;
  }

  private consumeRecord(entry: CanonicalRecordEntry): void {
    const record = entry.record;
    if (record[4][0] === "block") this.blockIds.add(record[4][1]);
    if (record[4][0] === "inline") this.inlineIds.add(record[4][1]);
    if (record[3] === "live") {
      const key = `${record[4][0]}:${record[4][1]}`;
      const refs = this.#tokens.get(key);
      if (refs === undefined) this.#tokens.set(key, [entry.ref]);
      else refs.push(entry.ref);
    } else if (record[3] === "retire" && Array.isArray(record[10][0])) {
      const retired = new Set(record[10][0].map(encodeRefValue));
      const key = `${record[4][0]}:${record[4][1]}`;
      const refs = this.#tokens.get(key);
      if (refs !== undefined)
        this.#tokens.set(
          key,
          refs.filter((reference) => !retired.has(encodeRefValue(reference))),
        );
    } else if (record[3] === "manifest" && record[7] !== null)
      this.#effects.set(JSON.stringify(record[7]), entry.ref);
  }
}

/** Creates the unselected immutable-run Automerge qualification factory. */
export function createAutomergeImmutableRunCarrierFactory<Position>(
  positionCodec: StructuralPositionCodec<Position>,
  positionOrdering: StructuralPositionOrdering<Position>,
  options: IntegratedCarrierQualificationOptions = {},
): IntegratedDocumentCarrierFactory<Position> {
  return Object.freeze({
    candidate: "automerge",
    positionCodec,
    positionOrdering,
    create: (rootId: BlockId) =>
      new AutomergeImmutableRunCarrier(
        AutomergeImmutableRunDocument.create(rootId),
        positionCodec,
        options,
      ),
    load: (encoded: Uint8Array) =>
      new AutomergeImmutableRunCarrier(
        AutomergeImmutableRunDocument.load(encoded),
        positionCodec,
        options,
      ),
  });
}

/**
 * Inspects persisted qualification-only transition evidence.
 *
 * @remarks This is deliberately not a common carrier or product Range API.
 */
export function inspectAutomergeImmutableRunTransitionsV1<Position>(
  carrier: IntegratedDocumentCarrier<Position>,
): readonly TransitionBody[] {
  if (!(carrier instanceof AutomergeImmutableRunCarrier))
    throw new TypeError("Carrier is not the immutable-run fixture variant.");
  return carrier.fixtureTransitions();
}

/**
 * Applies one explicit qualification-private text transition atomically.
 *
 * @remarks The request supplies every logical source and destination identity;
 * this helper establishes no product split/merge or Range policy.
 */
export function applyAutomergeImmutableRunFixtureTransitionV1<Position>(
  carrier: IntegratedDocumentCarrier<Position>,
  input: ImmutableRunFixtureTransitionV1<Position>,
): void {
  if (!(carrier instanceof AutomergeImmutableRunCarrier))
    throw new TypeError("Carrier is not the immutable-run fixture variant.");
  carrier.applyFixtureTransition(input);
}

function payloadParents(
  root: RecordRef,
  activation: ImmutableRunNativeActivationV1,
  byRef: ReadonlyMap<string, CanonicalRecordEntry>,
): readonly string[] {
  const manifests = activation.protocol
    .closure(root)
    .filter(
      (entry) =>
        entry.record[3] === "manifest" &&
        entry.record[10][0] !== "genesis" &&
        Array.isArray(entry.record[10]) &&
        entry.record[10][4] !== null,
    );
  const maximal = manifests.filter((candidate) =>
    manifests.every(
      (other) =>
        sameRef(candidate.ref, other.ref) ||
        !activation.protocol
          .closure(other.ref)
          .some((entry) => sameRef(entry.ref, candidate.ref)),
    ),
  );
  return Object.freeze(
    maximal
      .map((manifest) => {
        const body = manifest.record[10];
        if (!Array.isArray(body) || !Array.isArray(body[4]))
          throw new TypeError("Payload ancestry manifest is invalid.");
        const evidence = byRef.get(encodeRefValue(decodeRefValue(body[4])));
        if (
          evidence === undefined ||
          evidence.record[3] !== "payload-effect-v2" ||
          typeof evidence.record[10][0] !== "string"
        )
          throw new TypeError("Payload ancestry evidence is absent.");
        return evidence.record[10][0];
      })
      .sort(),
  );
}

function syntheticContext(): QualificationEffectContext {
  return Object.freeze({
    actorId: "qualification-synthetic",
    effectId: crypto.randomUUID(),
  });
}

function decodePosition(encoded: string): ImmutableRunIndexPosition {
  const value: unknown = JSON.parse(encoded);
  if (value === null || typeof value !== "object")
    throw new TypeError("Immutable-run position is invalid.");
  const candidate = value as Partial<ImmutableRunIndexPosition>;
  if (
    !Array.isArray(candidate.generation) ||
    (candidate.affinity !== "before" && candidate.affinity !== "after") ||
    !(candidate.left === null || typeof candidate.left === "object") ||
    !(candidate.right === null || typeof candidate.right === "object")
  )
    throw new TypeError("Immutable-run position is invalid.");
  return candidate as ImmutableRunIndexPosition;
}

function qualificationKind(value: string): QualificationOriginKind {
  if (
    value !== "human" &&
    value !== "imported" &&
    value !== "automation" &&
    value !== "ai" &&
    value !== "unknown"
  )
    throw new TypeError("Immutable-run Origin kind is invalid.");
  return value;
}

function decodeRefValue(value: unknown): RecordRef {
  if (
    !Array.isArray(value) ||
    value.length !== 2 ||
    typeof value[0] !== "string" ||
    typeof value[1] !== "string"
  )
    throw new TypeError("Record Ref is invalid.");
  return Object.freeze([value[0], value[1]]);
}

function encodeRefValue(value: unknown): string {
  if (!Array.isArray(value) || value.length !== 2)
    throw new TypeError("Record Ref is invalid.");
  return JSON.stringify(value);
}

function sameRef(left: RecordRef, right: RecordRef): boolean {
  return left[0] === right[0] && left[1] === right[1];
}
