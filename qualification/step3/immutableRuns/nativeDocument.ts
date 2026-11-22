import * as A from "@automerge/automerge";

import {
  parseBlockId,
  parseInlineContentId,
  type BlockId,
  type InlineContentId,
} from "../../../src/domain/index.js";
import {
  decodeStructuralPlacement,
  type StructuralPlacement,
  type StructuralPositionCodec,
} from "../../../src/carrier/index.js";
import {
  captureHistoricalState,
  decodeHistoricalState,
} from "../integrated/historicalState.js";
import type { IntegratedDocumentSnapshot } from "../integrated/carrier.js";
import type { QualificationPayloadSnapshot } from "../payload/carrier.js";
import type { QualificationOriginKind } from "../payload/carrier.js";
import { encodeEffectContext } from "../integrated/effectContext.js";
import {
  validateImmutableRunCommandsV1,
  type ImmutableRunAuthoredOutputsV1,
  type ImmutableRunColdViewProviderV1,
  type ImmutableRunNativeDescriptorV1,
  type ImmutableRunNativeViewV1,
  type PreparedImmutableRunCommandV1,
} from "./commands.js";
import { ImmutableRunProtocolV1 } from "./protocol.js";
import {
  commitRecordV1,
  decodeRecordKeyV1,
  type CanonicalRecordEntry,
  type CommandBody,
  type DescriptorOutput,
  type RecordOrigin,
  type RecordRef,
  type StructuralOutput,
} from "./record.js";

const LAYOUT = "step3-immutable-runs-v1";
const RUN_SOURCE_UNITS = 512;
const STRING_POSITION_CODEC: StructuralPositionCodec<string> = Object.freeze({
  encode(position: string): string {
    return position;
  },
  decode(encoded: string): string {
    return encoded;
  },
});

type Cell = Record<string, boolean>;
type Registry = Record<string, Cell>;

interface NativeMetadataSnapshot {
  readonly layout: string;
  readonly lineage: string;
  readonly rootBlock: string;
  readonly semanticRoot: string;
  readonly placements: ReadonlyMap<string, string>;
  readonly owners: ReadonlyMap<string, string>;
  readonly descriptors: ReadonlyMap<string, string>;
  readonly captures: ReadonlyMap<string, string>;
}

interface NativeState extends Record<string, unknown> {
  layout: Cell;
  lineage: Cell;
  rootBlock: Cell;
  semanticRoot: Cell;
  records: Record<string, unknown>;
  placements: Registry;
  owners: Registry;
  descriptors: Registry;
  captures: Registry;
}

/** Detached cold state returned after validating a native document. */
export interface ImmutableRunNativeActivationV1 {
  /** Current single semantic readiness root. */
  readonly root: RecordRef;
  /** Validated immutable record entries. */
  readonly entries: readonly CanonicalRecordEntry[];
  /** Cold protocol model for the complete record set. */
  readonly protocol: ImmutableRunProtocolV1;
  /** Actual native provenance provider for closed-command validation. */
  readonly provider: ImmutableRunColdViewProviderV1;
}

/** Exact observation retained in native metadata. */
export interface ImmutableRunNativeCaptureV1 {
  /** Semantic root observed by the capture. */
  readonly root: RecordRef;
  /** Exact detached carrier-neutral material encoded by the adapter. */
  readonly material: string;
  /** Exact native heads observed before the metadata-only capture change. */
  readonly heads: readonly string[];
}

/**
 * One qualification-private Automerge document for immutable-run records.
 *
 * @remarks The native layout is deliberately not selected by production code.
 * Scalar metadata is represented by a one-entry native map whose key is the
 * value and whose marker is exactly `true`. Command publication appends record
 * markers, replaces only changed registry cells, and advances the semantic-root
 * cell in one native change. Cold activation is the only path that enumerates
 * native history and the complete record graph.
 */
export class AutomergeImmutableRunDocument {
  private canonicalByUuid = new Map<string, string>();
  private activation: ImmutableRunNativeActivationV1 | undefined;
  private activeRunSourceUnits = RUN_SOURCE_UNITS;

  private constructor(private document: A.Doc<NativeState>) {}

  /** Creates one lineage with its genesis record in the native bootstrap change. */
  public static create(rootId: BlockId): AutomergeImmutableRunDocument {
    parseBlockId(rootId);
    const lineage = crypto.randomUUID();
    const genesisId = crypto.randomUUID();
    const genesis = commitRecordV1([
      "coedit-step3-record",
      1,
      genesisId,
      "manifest",
      ["document"],
      null,
      null,
      ["bootstrap", "bootstrap"],
      genesisId,
      null,
      [
        "genesis",
        rootId,
        ["settings", 1, RUN_SOURCE_UNITS],
        encodeEffectContext({ actorId: "bootstrap", effectId: "bootstrap" }),
      ],
    ]);
    const records: Record<string, unknown> = {};
    appendPlainRecord(records, genesis);
    const result = new AutomergeImmutableRunDocument(
      A.from<NativeState>({
        layout: cell(LAYOUT),
        lineage: cell(lineage),
        rootBlock: cell(rootId),
        semanticRoot: cell(encodeRef(genesis.ref)),
        records,
        placements: {},
        owners: {},
        descriptors: {},
        captures: {},
      }),
    );
    result.canonicalByUuid.set(genesis.record[2], genesis.canonical);
    return result;
  }

  /** Loads bytes without accepting them until cold activation succeeds. */
  public static load(encoded: Uint8Array): AutomergeImmutableRunDocument {
    const result = new AutomergeImmutableRunDocument(
      A.load<NativeState>(encoded),
    );
    result.rebuildUuidIndex(result.activate().entries);
    result.ensureOneNativeHead();
    return result;
  }

  /** Immutable layout identifier used by this private candidate. */
  public get layout(): string {
    return readCell(this.document.layout, "Layout");
  }

  /** Fresh private author identity for a loaded or branched carrier instance. */
  public freshReplicaUuid(): string {
    return crypto.randomUUID();
  }

  /** Bootstrap-selected experimental source chunk size. */
  public get runSourceUnits(): number {
    return this.activeRunSourceUnits;
  }

  /** Encodes complete native state. */
  public encode(): Uint8Array {
    return A.save(this.document);
  }

  /** Returns exact current native heads without exposing the document. */
  public heads(): readonly string[] {
    return Object.freeze([...A.getHeads(this.document)].sort());
  }

  /**
   * Publishes one prepared command atomically.
   *
   * @remarks The staged source-index replay is checked before native mutation
   * and committed only after the native change succeeds. No caller callback or
   * native proxy crosses this boundary.
   */
  public publish(command: PreparedImmutableRunCommandV1): void {
    command.cacheReplay.assertCurrent();
    const pending = new Map<string, string>();
    for (const entry of command.entries) {
      const id = entry.record[2];
      const prior = pending.get(id) ?? this.canonicalByUuid.get(id);
      if (prior !== undefined && prior !== entry.canonical)
        throw new TypeError("Immutable record UUID equivocation detected.");
      if (pending.has(id))
        throw new TypeError("Prepared command repeats a record UUID.");
      pending.set(id, entry.canonical);
    }
    const effect = command.manifest.record[7];
    if (effect === null) throw new TypeError("Command effect is missing.");
    const commandBody = command.manifest.record[10];
    if (!isCommandBody(commandBody))
      throw new TypeError("Command manifest body is invalid.");
    const replacementEffectId =
      commandBody[0] === "restore" ? undefined : JSON.stringify(effect);
    const next = A.change(
      this.document,
      { message: `immutable-run:${encodeRef(command.manifest.ref)}` },
      (draft) => {
        for (const entry of command.entries)
          appendNativeRecord(draft.records, entry);
        for (const output of command.nativeDelta.structural) {
          if (output[0] === "placement")
            draft.placements[output[1]] = cell(output[2]);
          else if (output[0] === "inline-create")
            draft.owners[output[1]] = cell(output[2]);
        }
        for (const output of command.nativeDelta.descriptors)
          draft.descriptors[output[1]] = cell(
            encodeDescriptor(output, replacementEffectId),
          );
        draft.semanticRoot = cell(encodeRef(command.manifest.ref));
      },
    );
    this.document = next;
    this.activation = undefined;
    for (const [id, canonical] of pending)
      this.canonicalByUuid.set(id, canonical);
    command.cacheReplay.commit();
  }

  /** Retains an observation as metadata without advancing the semantic root. */
  public capture(token: string, material: string): void {
    if (typeof token !== "string" || token.length === 0)
      throw new TypeError("Capture token is invalid.");
    if (this.readCapture(token) !== undefined)
      throw new TypeError("Capture token is already used.");
    const observation = JSON.stringify([
      decodeRef(readCell(this.document.semanticRoot, "Semantic root")),
      material,
      [...A.getHeads(this.document)].sort(),
    ]);
    this.document = A.change(
      this.document,
      { message: "immutable-run:capture" },
      (draft) => {
        draft.captures[token] = cell(observation);
      },
    );
    this.activation = undefined;
  }

  /** Resolves a retained observation through its closed native metadata cell. */
  public readCapture(token: string): ImmutableRunNativeCaptureV1 | undefined {
    const value = this.document.captures[token];
    if (value === undefined) return undefined;
    const parsed: unknown = JSON.parse(readCell(value, "Capture"));
    if (!Array.isArray(parsed) || parsed.length !== 3)
      throw new TypeError("Capture metadata is invalid.");
    const root = decodeRefValue(parsed[0]);
    if (typeof parsed[1] !== "string" || !isStringArray(parsed[2]))
      throw new TypeError("Capture metadata is invalid.");
    return Object.freeze({
      root,
      material: parsed[1],
      heads: Object.freeze([...parsed[2]]),
    });
  }

  /**
   * Merges same-bootstrap state, validates it cold, and creates a readiness join
   * when more than one semantic root remains.
   */
  public mergeEncoded(encoded: Uint8Array): void {
    const remote = A.load<NativeState>(encoded);
    assertBootstrap(this.document, remote);
    const before = collectRecords(this.document);
    let staged = A.merge(A.clone(this.document), remote);
    const merged = collectRecords(staged);
    for (const [id, entry] of before) {
      if (merged.get(id)?.canonical !== entry.canonical)
        throw new TypeError("Merge removed or changed a committed record.");
    }
    const protocol = ImmutableRunProtocolV1.validate([...merged.values()]);
    if (protocol.maximalRoots.length > 1) {
      const join = joinRecord(protocol.maximalRoots);
      staged = A.change(
        staged,
        { message: `immutable-run:${encodeRef(join.ref)}` },
        (draft) => {
          appendNativeRecord(draft.records, join);
          draft.semanticRoot = cell(encodeRef(join.ref));
        },
      );
    } else if (protocol.maximalRoots.length === 1) {
      const expected = encodeRef(protocol.maximalRoots[0]!);
      if (readCell(staged.semanticRoot, "Semantic root") !== expected)
        throw new TypeError("Native semantic root is not a maximal root.");
    }
    const candidate = new AutomergeImmutableRunDocument(staged);
    candidate.rebuildUuidIndex(candidate.activate().entries);
    candidate.ensureOneNativeHead();
    this.document = candidate.document;
    this.canonicalByUuid = candidate.canonicalByUuid;
    this.activeRunSourceUnits = candidate.activeRunSourceUnits;
    this.activation = undefined;
  }

  /** Performs complete layout, record, command, and native-provenance validation. */
  public activate(): ImmutableRunNativeActivationV1 {
    if (this.activation !== undefined) return this.activation;
    assertHeader(this.document);
    const namespace = collectRecordNamespace(this.document);
    const entries = Object.freeze([...namespace.records.values()]);
    const protocol = ImmutableRunProtocolV1.validate(entries);
    validateIdentityFacts(
      entries,
      readCell(this.document.rootBlock, "Root Block"),
    );
    const root = decodeRef(
      readCell(this.document.semanticRoot, "Semantic root"),
    );
    if (
      protocol.maximalRoots.length !== 1 ||
      !sameRef(protocol.maximalRoots[0]!, root)
    )
      throw new TypeError(
        "Native document is not at one exact readiness root.",
      );
    const provider = new NativeProvider(
      this.document,
      entries,
      protocol,
      namespace.objectDepths,
    );
    // Semantic outputs must be checked before a staged load/merge can become
    // the accepted native document, including writes hidden by later winners.
    validateImmutableRunCommandsV1(entries, provider);
    this.activation = Object.freeze({ root, entries, protocol, provider });
    this.activeRunSourceUnits = protocol.runSourceUnits;
    return this.activation;
  }

  /** Returns the current winning placement encodings after header validation. */
  public placements(): ReadonlyMap<string, string> {
    assertHeader(this.document);
    return readRegistry(this.document.placements, "Placement");
  }

  /** Returns current immutable owner winners after header validation. */
  public owners(): ReadonlyMap<string, string> {
    assertHeader(this.document);
    return readRegistry(this.document.owners, "Owner");
  }

  /** Returns current descriptor winners after header validation. */
  public descriptors(): ReadonlyMap<string, ImmutableRunNativeDescriptorV1> {
    const result = new Map<string, ImmutableRunNativeDescriptorV1>();
    for (const [id, encoded] of readRegistry(
      this.document.descriptors,
      "Descriptor",
    ))
      result.set(id, decodeDescriptor(encoded));
    return result;
  }

  private ensureOneNativeHead(): void {
    if (A.getHeads(this.document).length > 1) {
      this.document = A.emptyChange(this.document, {
        message: "immutable-run:native-head-join",
      });
      this.activation = undefined;
    }
  }

  private rebuildUuidIndex(entries: readonly CanonicalRecordEntry[]): void {
    this.canonicalByUuid = new Map(
      entries.map((entry) => [entry.record[2], entry.canonical]),
    );
  }
}

function validateIdentityFacts(
  entries: readonly CanonicalRecordEntry[],
  rootBlock: string,
): void {
  const blockIds = new Set<string>([rootBlock]);
  const inlineIds = new Set<string>();
  const createdInlineIds = new Set<string>();
  for (const entry of entries) {
    const scope = entry.record[4];
    if (scope[0] === "block") blockIds.add(scope[1]);
    else if (scope[0] === "inline") inlineIds.add(scope[1]);
    if (entry.record[3] !== "manifest") continue;
    const body = entry.record[10];
    if (!isCommandBody(body)) continue;
    for (const output of body[6]) {
      if (output[0] === "placement") blockIds.add(output[1]);
      else if (output[0] === "inline-create") {
        if (createdInlineIds.has(output[1]))
          throw new TypeError(
            "InlineContent identity has multiple creation facts.",
          );
        createdInlineIds.add(output[1]);
        inlineIds.add(output[1]);
        blockIds.add(output[2]);
      }
    }
  }
  for (const id of inlineIds)
    if (blockIds.has(id))
      throw new TypeError(
        "Durable identity is used as both Block and InlineContent.",
      );
}

class NativeProvider implements ImmutableRunColdViewProviderV1 {
  readonly #rootMetadata = new Map<string, NativeMetadataSnapshot>();
  readonly #metadataByChange = new Map<string, NativeMetadataSnapshot>();
  readonly #dependencyMetadata = new Map<string, NativeMetadataSnapshot>();
  readonly #rootVersions = new Map<string, readonly string[] | null>();
  readonly #commandChanges = new Map<string, A.DecodedChange>();
  readonly #authoredBases = new Map<string, RecordRef>();
  readonly #recordDepths: ReadonlyMap<string, number>;
  readonly #entryByKey: ReadonlyMap<string, CanonicalRecordEntry>;
  readonly #entryByRef: ReadonlyMap<string, CanonicalRecordEntry>;
  readonly #captureExpectedByRoot = new Map<
    string,
    IntegratedDocumentSnapshot<string>
  >();

  public constructor(
    private readonly document: A.Doc<NativeState>,
    private readonly entries: readonly CanonicalRecordEntry[],
    private readonly protocol: ImmutableRunProtocolV1,
    recordDepths: ReadonlyMap<string, number>,
  ) {
    this.#recordDepths = recordDepths;
    this.#entryByKey = new Map(entries.map((entry) => [entry.key, entry]));
    this.#entryByRef = new Map(
      entries.map((entry) => [encodeRef(entry.ref), entry]),
    );
    const labels = new Map<string, readonly RecordRef[]>();
    const captureTokens = new Set<string>();
    for (const bytes of A.getAllChanges(document)) {
      const change = A.decodeChange(bytes);
      rejectHeaderMutation(change, labels.size === 0);
      const metadata = this.projectMetadata(change);
      const dependencyMetadata = this.#dependencyMetadata.get(change.hash);
      if (dependencyMetadata === undefined)
        throw new Error("Native dependency metadata projection is missing.");
      const dependencyLabels = maximalLabels(
        change.deps.flatMap((dependency) => {
          const values = labels.get(dependency);
          if (values === undefined)
            throw new TypeError("Native change dependency label is missing.");
          return values;
        }),
        protocol,
      );
      const manifests = this.entriesAuthoredBy(change);
      const roots = manifests.filter(
        (entry) => entry.record[3] === "manifest" || entry.record[3] === "join",
      );
      if (roots.length > 1)
        throw new TypeError(
          "One native change authored multiple semantic roots.",
        );
      let nextLabels = dependencyLabels;
      if (roots.length === 1) {
        const root = roots[0]!;
        requireRootWrite(change, document, encodeRef(root.ref));
        if (root.record[3] === "manifest") {
          const body = root.record[10];
          if (body[0] === "genesis") {
            if (change.deps.length !== 0 || dependencyLabels.length !== 0)
              throw new TypeError("Native genesis has dependencies.");
          } else {
            if (!isCommandBody(body) || dependencyLabels.length !== 1)
              throw new TypeError(
                "Command native dependencies lack one semantic label.",
              );
            if (!sameRef(body[1], dependencyLabels[0]!))
              throw new TypeError(
                "Command body rewinds its actual native dependency label.",
              );
            this.#authoredBases.set(encodeRef(root.ref), dependencyLabels[0]!);
            this.#commandChanges.set(encodeRef(root.ref), change);
          }
        } else {
          const inputs = joinInputs(root);
          if (!sameRefSets(inputs, dependencyLabels))
            throw new TypeError(
              "Join inputs differ from maximal native dependency labels.",
            );
          validateCommandOps(
            change,
            document,
            [root],
            this.#recordDepths,
            false,
          );
        }
        nextLabels = Object.freeze([root.ref]);
      } else {
        const tokens = validateRootlessChange(
          change,
          document,
          dependencyLabels,
        );
        for (const token of tokens) {
          if (captureTokens.has(token))
            throw new TypeError(
              "Native capture token was written more than once.",
            );
          captureTokens.add(token);
          const encoded = metadata.captures.get(token);
          if (encoded === undefined)
            throw new TypeError("Native capture metadata is missing.");
          const parsed: unknown = JSON.parse(encoded);
          if (!Array.isArray(parsed) || parsed.length !== 3)
            throw new TypeError("Capture metadata is invalid.");
          this.validateCaptureMaterial(
            parsed[1],
            decodeRefValue(parsed[0]),
            dependencyMetadata,
          );
        }
      }
      labels.set(change.hash, nextLabels);
      if (nextLabels.length !== 1)
        throw new TypeError(
          "Native change does not carry one readiness label.",
        );
      const selected = decodeRef(metadata.semanticRoot);
      if (!sameRef(selected, nextLabels[0]!))
        throw new TypeError(
          "Native semantic-root cell differs from its causal label.",
        );
      this.#rootMetadata.set(encodeRef(nextLabels[0]!), metadata);
    }
    const authored = new Set([
      ...this.#commandChanges.keys(),
      encodeRef(protocol.genesisRoot),
      ...protocol.maximalRoots.map(encodeRef),
    ]);
    for (const entry of entries)
      if (
        (entry.record[3] === "manifest" || entry.record[3] === "join") &&
        !authored.has(encodeRef(entry.ref)) &&
        !this.#rootMetadata.has(encodeRef(entry.ref))
      )
        throw new TypeError("Semantic root record lacks native provenance.");
  }

  public view(root: RecordRef): ImmutableRunNativeViewV1 {
    const metadata = this.#rootMetadata.get(encodeRef(root));
    if (metadata === undefined)
      throw new TypeError("Native root has no change.");
    return this.viewAt(root, metadata);
  }

  public authoredBase(manifest: RecordRef): Readonly<{
    semanticRoot: RecordRef;
    view: ImmutableRunNativeViewV1;
  }> {
    const change = this.requireChange(manifest);
    const dependencyMetadata = this.#dependencyMetadata.get(change.hash);
    if (dependencyMetadata === undefined)
      throw new TypeError("Command native dependency metadata is absent.");
    const semanticRoot = this.#authoredBases.get(encodeRef(manifest));
    if (semanticRoot === undefined)
      throw new TypeError("Command native base label is absent.");
    if (!sameRef(decodeRef(dependencyMetadata.semanticRoot), semanticRoot))
      throw new TypeError("Command dependency view has a different root cell.");
    return Object.freeze({
      semanticRoot,
      view: this.viewAt(semanticRoot, dependencyMetadata),
    });
  }

  public authoredOutputs(manifest: RecordRef): ImmutableRunAuthoredOutputsV1 {
    const entry = this.#entryByRef.get(encodeRef(manifest));
    if (entry === undefined || entry.record[3] !== "manifest")
      throw new TypeError("Native provenance manifest is absent.");
    const body = entry.record[10];
    if (body[0] === "genesis")
      return Object.freeze({ structural: [], descriptors: [] });
    if (!isCommandBody(body))
      throw new TypeError("Native command manifest body is invalid.");
    const change = this.requireChange(manifest);
    const authored = this.entriesAuthoredBy(change);
    const expectedRecords = commandEntries(entry, this.#entryByRef);
    if (!sameEntries(authored, expectedRecords))
      throw new TypeError(
        "Command members and manifest were not authored in one native change.",
      );
    const placementWrites = extractCellWriteSequence(
      change,
      this.document.placements,
      "placement",
    );
    const ownerWrites = extractCellWrites(
      change,
      this.document.owners,
      "owner",
    );
    const descriptorWrites = extractCellWrites(
      change,
      this.document.descriptors,
      "descriptor",
    );
    const structural: StructuralOutput[] = [];
    let placementIndex = 0;
    for (const output of body[6]) {
      if (output[0] === "block-delete") {
        const hasRetire = authored.some(
          (candidate) =>
            candidate.record[3] === "retire" &&
            candidate.record[4][0] === "block" &&
            candidate.record[4][1] === output[1],
        );
        if (!hasRetire)
          throw new TypeError("Block deletion lacks native retire fact.");
        structural.push(Object.freeze(["block-delete", output[1]]));
      } else if (output[0] === "placement") {
        const write = placementWrites[placementIndex++];
        if (write === undefined || write[0] !== output[1])
          throw new TypeError("Native placement output order is not exact.");
        structural.push(Object.freeze(["placement", write[0], write[1]]));
      } else {
        requireCellWrite(change, this.document.owners, output[1], output[2]);
        structural.push(
          Object.freeze([
            "inline-create",
            output[1],
            ownerWrites.get(output[1])!,
          ]),
        );
      }
    }
    const expectedPlacements = body[6]
      .filter((output) => output[0] === "placement")
      .map((output) => [output[1], output[2]]);

    const expectedOwners = new Map(
      body[6]
        .filter((output) => output[0] === "inline-create")
        .map((output) => [output[1], output[2]]),
    );
    if (
      JSON.stringify(placementWrites) !== JSON.stringify(expectedPlacements) ||
      !sameStringMaps(ownerWrites, expectedOwners)
    )
      throw new TypeError(
        "Native structural writes contain an extra or missing field.",
      );
    const effect = entry.record[7];
    if (effect === null) throw new TypeError("Command effect is missing.");
    const replacementEffectId =
      body[0] === "restore" ? undefined : JSON.stringify(effect);
    for (const output of body[7])
      requireCellWrite(
        change,
        this.document.descriptors,
        output[1],
        encodeDescriptor(output, replacementEffectId),
      );
    const expectedDescriptors = new Map(
      body[7].map((output) => [
        output[1],
        encodeDescriptor(output, replacementEffectId),
      ]),
    );
    if (!sameStringMaps(descriptorWrites, expectedDescriptors))
      throw new TypeError(
        "Native descriptor writes contain an extra or missing field.",
      );
    const descriptors = Object.freeze(
      body[7].map((output) =>
        descriptorOutputFromEncoded(
          output[1],
          descriptorWrites.get(output[1])!,
        ),
      ),
    );
    requireRootWrite(change, this.document, encodeRef(manifest));
    validateCommandOps(
      change,
      this.document,
      expectedRecords,
      this.#recordDepths,
    );
    return Object.freeze({
      structural: Object.freeze(structural),
      descriptors,
    });
  }

  public captureRoot(token: string): RecordRef | undefined {
    const value = this.#metadataByChange
      .get(A.getHeads(this.document)[0] ?? "")
      ?.captures.get(token);
    if (value === undefined) return undefined;
    const parsed: unknown = JSON.parse(value);
    if (!Array.isArray(parsed)) throw new TypeError("Capture is invalid.");
    return decodeRefValue(parsed[0]);
  }

  public resolveReferent(
    reference: string,
    manifest: RecordRef,
  ):
    | Readonly<{
        kind: "effect" | "capture";
        root: RecordRef;
        material?: string;
      }>
    | undefined {
    const change = this.requireChange(manifest);
    const dependencyMetadata = this.#dependencyMetadata.get(change.hash);
    if (dependencyMetadata === undefined)
      throw new TypeError("Command native dependency metadata is absent.");
    const matches: {
      kind: "effect" | "capture";
      root: RecordRef;
      material?: string;
    }[] = [];
    const capture = dependencyMetadata.captures.get(reference);
    if (capture !== undefined) {
      const parsed: unknown = JSON.parse(capture);
      if (
        !Array.isArray(parsed) ||
        parsed.length !== 3 ||
        typeof parsed[1] !== "string"
      )
        throw new TypeError("Capture referent is invalid.");
      matches.push({
        kind: "capture",
        root: decodeRefValue(parsed[0]),
        material: parsed[1],
      });
    }
    try {
      const identity: unknown = JSON.parse(reference);
      if (
        Array.isArray(identity) &&
        identity.length === 2 &&
        typeof identity[0] === "string" &&
        typeof identity[1] === "string"
      ) {
        const base = this.authoredBase(manifest).view;
        const root = base.effectRoot(identity[0], identity[1]);
        if (root !== undefined) matches.push({ kind: "effect", root });
      }
    } catch {
      // A non-JSON string can still be an exact capture token.
    }
    if (matches.length > 1)
      throw new TypeError("Derivation reference is ambiguous.");
    const match = matches[0];
    return match === undefined ? undefined : Object.freeze(match);
  }

  private requireChange(manifest: RecordRef): A.DecodedChange {
    const change = this.#commandChanges.get(encodeRef(manifest));
    if (change === undefined)
      throw new TypeError("Manifest is not authored by one native change.");
    return change;
  }

  private entriesAuthoredBy(
    change: A.DecodedChange,
  ): readonly CanonicalRecordEntry[] {
    return recordKeysAuthoredBy(change)
      .map((key) => this.#entryByKey.get(key))
      .filter((entry): entry is CanonicalRecordEntry => entry !== undefined);
  }

  /**
   * Projects only metadata through public diff patches. Record patches remain
   * subject to decoded-operation and record-graph validation, but are never
   * materialized into a historical native document view.
   */
  private projectMetadata(change: A.DecodedChange): NativeMetadataSnapshot {
    const existing = this.#metadataByChange.get(change.hash);
    if (existing !== undefined) return existing;
    let dependency: NativeMetadataSnapshot;
    if (change.deps.length === 0) {
      dependency = emptyMetadataSnapshot();
    } else {
      const first = this.#metadataByChange.get(change.deps[0]!);
      if (first === undefined)
        throw new TypeError("Native metadata parent is missing.");
      dependency =
        change.deps.length === 1
          ? first
          : applyMetadataPatches(
              first,
              A.diff(this.document, [change.deps[0]!], [...change.deps]),
            );
    }
    const previousVersions =
      change.deps.length === 0
        ? []
        : change.deps.length === 1
          ? (this.#rootVersions.get(change.deps[0]!) ?? null)
          : null;
    const rootOnly =
      previousVersions === null
        ? undefined
        : projectCompleteRootOverwrite(
            change,
            dependency,
            previousVersions,
            this.#recordDepths,
          );
    const projected =
      rootOnly ??
      applyMetadataPatches(
        dependency,
        A.diff(this.document, [...change.deps], [change.hash]),
      );
    this.#rootVersions.set(
      change.hash,
      nextRootVersions(change, previousVersions),
    );
    assertMetadataSnapshot(projected);
    this.#dependencyMetadata.set(change.hash, dependency);
    this.#metadataByChange.set(change.hash, projected);
    return projected;
  }

  private validateCaptureMaterial(
    material: unknown,
    root: RecordRef,
    metadata: NativeMetadataSnapshot,
  ): void {
    if (typeof material !== "string")
      throw new TypeError("Capture material is invalid.");
    const actual = decodeHistoricalState(material, STRING_POSITION_CODEC);
    if (captureHistoricalState(actual, STRING_POSITION_CODEC) !== material)
      throw new TypeError("Capture material is not canonical.");
    const key = encodeRef(root);
    let expected = this.#captureExpectedByRoot.get(key);
    if (expected === undefined) {
      expected = captureSnapshot(
        root,
        metadata,
        this.protocol,
        this.viewAt(root, metadata),
      );
      this.#captureExpectedByRoot.set(key, expected);
    }
    if (!sameCaptureSnapshot(actual, expected))
      throw new TypeError("Capture material differs from its native root.");
  }

  private viewAt(
    root: RecordRef,
    metadata: NativeMetadataSnapshot,
  ): ImmutableRunNativeViewV1 {
    const rootBlockId = parseBlockId(metadata.rootBlock);
    const owners = metadata.owners;
    const descriptors = new Map<string, ImmutableRunNativeDescriptorV1>();
    for (const [id, encoded] of metadata.descriptors)
      descriptors.set(id, decodeDescriptor(encoded));
    const closure = this.protocol.closure(root);
    const blockIds = new Set<string>([rootBlockId]);
    const inlineIds = new Set<string>();
    const lives = new Map<string, RecordRef[]>();
    const retired = new Set<string>();
    const effects = new Map<string, RecordRef>();
    for (const entry of closure) {
      const record = entry.record;
      if (record[3] === "manifest" && record[7] !== null)
        effects.set(JSON.stringify(record[7]), entry.ref);
      if (record[4][0] === "block") blockIds.add(record[4][1]);
      if (record[4][0] === "inline") inlineIds.add(record[4][1]);
      if (record[3] === "live") {
        const key = `${record[4][0]}:${record[4][1]}`;
        const current = lives.get(key);
        if (current === undefined) lives.set(key, [entry.ref]);
        else current.push(entry.ref);
      } else if (record[3] === "retire") {
        const references = retireRefs(record[10]);
        for (const reference of references) retired.add(encodeRef(reference));
      }
    }
    return Object.freeze({
      root,
      rootBlockId,
      blockIdentities: () =>
        Object.freeze([...blockIds].map((id) => parseBlockId(id))),
      inlineIdentities: () =>
        Object.freeze([...inlineIds].map((id) => parseInlineContentId(id))),
      hasBlockIdentity: (id: string): boolean => blockIds.has(id),
      isBlockLive: (id: BlockId): boolean =>
        id === rootBlockId || this.protocol.isEntityLive(root, "block", id),
      hasInlineIdentity: (id: string): boolean => inlineIds.has(id),
      isInlineLive: (id: InlineContentId): boolean =>
        this.protocol.isEntityLive(root, "inline", id),
      ownerOf: (id: InlineContentId) => {
        const owner = owners.get(id);
        return owner === undefined ? undefined : parseBlockId(owner);
      },
      descriptorOf: (id: InlineContentId) => descriptors.get(id),
      liveTokens: (kind: "block" | "inline", id: BlockId | InlineContentId) =>
        Object.freeze(
          (lives.get(`${kind}:${id}`) ?? []).filter(
            (reference) => !retired.has(encodeRef(reference)),
          ),
        ),
      effectRoot: (actorId: string, effectId: string) =>
        effects.get(JSON.stringify([actorId, effectId])),
    });
  }
}

function assertHeader(document: A.Doc<NativeState>): void {
  if (readCell(document.layout, "Layout") !== LAYOUT)
    throw new TypeError("Immutable-run native layout is invalid.");
  const lineage = readCell(document.lineage, "Lineage");
  if (!isUuid(lineage)) throw new TypeError("Native lineage is invalid.");
  parseBlockId(readCell(document.rootBlock, "Root Block"));
  if (
    Object.keys(document).sort().join(",") !==
    "captures,descriptors,layout,lineage,owners,placements,records,rootBlock,semanticRoot"
  )
    throw new TypeError("Immutable-run native root fields are invalid.");
}

function assertBootstrap(
  left: A.Doc<NativeState>,
  right: A.Doc<NativeState>,
): void {
  assertHeader(left);
  assertHeader(right);
  if (
    readCell(left.rootBlock, "Root Block") !==
    readCell(right.rootBlock, "Root Block")
  )
    throw new TypeError("Native documents have different root identity.");
  const leftRoots = bootstrapHashes(left);
  const rightRoots = bootstrapHashes(right);
  if (
    leftRoots.length !== 1 ||
    rightRoots.length !== 1 ||
    leftRoots[0] !== rightRoots[0]
  )
    throw new TypeError(
      "Native documents do not share the exact replica lineage.",
    );
}

function bootstrapHashes(document: A.Doc<NativeState>): readonly string[] {
  return A.getAllChanges(document)
    .map(A.decodeChange)
    .filter((change) => change.deps.length === 0)
    .map((change) => change.hash)
    .sort();
}

function recordKeysAuthoredBy(change: A.DecodedChange): readonly string[] {
  return change.ops
    .filter(
      (operation) => operation.action === "set" && operation.value === true,
    )
    .map((operation) => operation.key);
}

function rejectHeaderMutation(
  change: A.DecodedChange,
  bootstrap: boolean,
): void {
  if (bootstrap) return;
  const fixed = new Set([
    "layout",
    "lineage",
    "rootBlock",
    "records",
    "placements",
    "owners",
    "descriptors",
    "captures",
  ]);
  if (
    change.ops.some(
      (operation) => operation.obj === "_root" && fixed.has(operation.key),
    )
  )
    throw new TypeError("Immutable native header or registry was rewritten.");
}

function maximalLabels(
  supplied: readonly RecordRef[],
  protocol: ImmutableRunProtocolV1,
): readonly RecordRef[] {
  const unique = new Map(
    supplied.map((reference) => [encodeRef(reference), reference]),
  );
  const values = [...unique.values()];
  return Object.freeze(
    values
      .filter((candidate) =>
        values.every(
          (other) =>
            sameRef(candidate, other) ||
            !protocol
              .closure(other)
              .some((entry) => sameRef(entry.ref, candidate)),
        ),
      )
      .sort((left, right) => encodeRef(left).localeCompare(encodeRef(right))),
  );
}

function joinInputs(entry: CanonicalRecordEntry): readonly RecordRef[] {
  const body = entry.record[10];
  if (
    entry.record[3] !== "join" ||
    !Array.isArray(body) ||
    body.length !== 1 ||
    !Array.isArray(body[0])
  )
    throw new TypeError("Native join record is invalid.");
  return body[0].map(decodeRefValue);
}

function sameRefSets(
  left: readonly RecordRef[],
  right: readonly RecordRef[],
): boolean {
  const a = left.map(encodeRef).sort();
  const b = right.map(encodeRef).sort();
  return JSON.stringify(a) === JSON.stringify(b);
}

function validateRootlessChange(
  change: A.DecodedChange,
  document: A.Doc<NativeState>,
  dependencyLabels: readonly RecordRef[],
): readonly string[] {
  if (change.ops.length === 0) return [];
  const writes = extractCellWrites(change, document.captures, "capture");
  if (change.ops.length !== writes.size * 2)
    throw new TypeError("Rootless native change contains non-capture writes.");
  if (dependencyLabels.length !== 1)
    throw new TypeError(
      "Capture metadata lacks one semantic dependency label.",
    );
  for (const encoded of writes.values()) {
    const parsed: unknown = JSON.parse(encoded);
    if (
      !Array.isArray(parsed) ||
      parsed.length !== 3 ||
      !sameRef(decodeRefValue(parsed[0]), dependencyLabels[0]!) ||
      typeof parsed[1] !== "string" ||
      !isStringArray(parsed[2]) ||
      JSON.stringify([...parsed[2]].sort()) !==
        JSON.stringify([...change.deps].sort())
    )
      throw new TypeError(
        "Capture metadata differs from its actual native frontier.",
      );
  }
  return Object.freeze([...writes.keys()]);
}

function commandEntries(
  manifest: CanonicalRecordEntry,
  byRef: ReadonlyMap<string, CanonicalRecordEntry>,
): readonly CanonicalRecordEntry[] {
  const body = manifest.record[10];
  if (!isCommandBody(body))
    throw new TypeError("Native command manifest body is invalid.");
  const refs: RecordRef[] = [body[2], body[3]];
  if (body[4] !== null) refs.push(body[4]);
  for (const row of body[5])
    for (const reference of row[2]) refs.push(reference);
  refs.push(manifest.ref);
  return refs.map((reference) => {
    const entry = byRef.get(encodeRef(reference));
    if (entry === undefined)
      throw new TypeError("Command native member is absent.");
    return entry;
  });
}

function sameEntries(
  left: readonly CanonicalRecordEntry[],
  right: readonly CanonicalRecordEntry[],
): boolean {
  return (
    JSON.stringify(left.map((entry) => entry.key).sort()) ===
    JSON.stringify(right.map((entry) => entry.key).sort())
  );
}

/** Read the exact ordered writes; repeated replacements must observe their predecessor. */
function extractCellWriteSequence(
  change: A.DecodedChange,
  registry: Registry,
  label: string,
): readonly (readonly [string, string])[] {
  const registryId = A.getObjectId(registry);
  if (registryId === null)
    throw new TypeError(`Native ${label} registry lacks identity.`);
  const result: (readonly [string, string])[] = [];
  const previousByKey = new Map<string, string>();
  for (let index = 0; index < change.ops.length; index++) {
    const operation = change.ops[index]!;
    if (operation.action !== "makeMap" || operation.obj !== registryId)
      continue;
    const previous = previousByKey.get(operation.key);
    if (
      previous !== undefined &&
      (operation.pred.length !== 1 || operation.pred[0] !== previous)
    )
      throw new TypeError(
        `Native ${label} replacement does not observe its preceding write.`,
      );
    const objectId = `${change.startOp + index}@${change.actor}`;
    const values = change.ops.filter((candidate) => candidate.obj === objectId);
    if (
      values.length !== 1 ||
      values[0]!.action !== "set" ||
      values[0]!.value !== true
    )
      throw new TypeError(`Native ${label} cell is malformed.`);
    result.push(Object.freeze([operation.key, values[0]!.key]));
    previousByKey.set(operation.key, objectId);
  }
  return Object.freeze(result);
}

function extractCellWrites(
  change: A.DecodedChange,
  registry: Registry,
  label: string,
): ReadonlyMap<string, string> {
  const registryId = A.getObjectId(registry);
  if (registryId === null)
    throw new TypeError(`Native ${label} registry lacks identity.`);
  const result = new Map<string, string>();
  for (let index = 0; index < change.ops.length; index++) {
    const operation = change.ops[index]!;
    if (operation.action !== "makeMap" || operation.obj !== registryId)
      continue;
    if (result.has(operation.key))
      throw new TypeError(`Native ${label} cell is written twice.`);
    const objectId = `${change.startOp + index}@${change.actor}`;
    const values = change.ops.filter(
      (candidate) => candidate.action === "set" && candidate.obj === objectId,
    );
    if (values.length !== 1 || values[0]!.value !== true)
      throw new TypeError(`Native ${label} cell is malformed.`);
    result.set(operation.key, values[0]!.key);
  }
  return result;
}

function sameStringMaps(
  left: ReadonlyMap<string, string>,
  right: ReadonlyMap<string, string>,
): boolean {
  if (left.size !== right.size) return false;
  for (const [key, value] of left) if (right.get(key) !== value) return false;
  return true;
}

function requireCellWrite(
  change: A.DecodedChange,
  registry: Registry,
  id: string,
  encoded: string,
): void {
  const registryId = A.getObjectId(registry);
  if (registryId === null)
    throw new TypeError("Native registry lacks identity.");
  const index = change.ops.findIndex(
    (operation) =>
      operation.action === "makeMap" &&
      operation.obj === registryId &&
      operation.key === id,
  );
  if (index < 0)
    throw new TypeError("Manifest output lacks its native cell write.");
  const objectId = `${change.startOp + index}@${change.actor}`;
  if (
    !change.ops.some(
      (operation) =>
        operation.action === "set" &&
        operation.obj === objectId &&
        operation.key === encoded &&
        operation.value === true,
    )
  )
    throw new TypeError("Native cell value differs from the manifest output.");
}

function requireRootWrite(
  change: A.DecodedChange,
  document: A.Doc<NativeState>,
  encoded: string,
): void {
  const roots = change.ops
    .map((operation, index) => ({ operation, index }))
    .filter(
      ({ operation }) =>
        operation.obj === "_root" && operation.key === "semanticRoot",
    );
  if (roots.length !== 1 || roots[0]!.operation.action !== "makeMap")
    throw new TypeError(
      "Command did not advance the native root exactly once.",
    );
  const index = roots[0]!.index;
  const objectId = `${change.startOp + index}@${change.actor}`;
  const values = change.ops.filter(
    (operation) => operation.action === "set" && operation.obj === objectId,
  );
  if (
    values.length !== 1 ||
    values[0]!.key !== encoded ||
    values[0]!.value !== true
  )
    throw new TypeError("Command native root differs from its manifest.");
  void document;
}

function validateCommandOps(
  change: A.DecodedChange,
  document: A.Doc<NativeState>,
  expectedRecords: readonly CanonicalRecordEntry[],
  recordDepths: ReadonlyMap<string, number>,
  allowRegistries = true,
): void {
  const allowed = new Set<number>();
  allowCellOps(change, "_root", "semanticRoot", allowed);
  if (allowRegistries) {
    for (const registry of [
      document.placements,
      document.owners,
      document.descriptors,
    ]) {
      const objectId = A.getObjectId(registry);
      if (objectId === null)
        throw new TypeError("Native registry lacks identity.");
      for (let index = 0; index < change.ops.length; index++) {
        const operation = change.ops[index]!;
        if (operation.action === "makeMap" && operation.obj === objectId)
          allowCellOps(
            change,
            objectId,
            operation.key,
            allowed,
            registry === document.placements,
          );
      }
    }
  }
  const expectedKeys = new Set(expectedRecords.map((entry) => entry.key));
  for (let index = 0; index < change.ops.length; index++) {
    const operation = change.ops[index]!;
    const depth = recordDepths.get(operation.obj);
    if (depth === undefined) continue;
    if (
      operation.action === "makeMap" &&
      depth < 32 &&
      /^[0-9a-f]$/.test(operation.key) &&
      recordDepths.get(`${change.startOp + index}@${change.actor}`) ===
        depth + 1
    )
      allowed.add(index);
    else if (
      operation.action === "set" &&
      depth === 32 &&
      operation.value === true &&
      expectedKeys.has(operation.key)
    )
      allowed.add(index);
  }
  if (allowed.size !== change.ops.length)
    throw new TypeError(
      "Command native change contains an extra or hidden delta.",
    );
}

function allowCellOps(
  change: A.DecodedChange,
  parentId: string,
  key: string,
  allowed: Set<number>,
  repeated = false,
): void {
  const indexes = change.ops
    .map((operation, index) => ({ operation, index }))
    .filter(
      ({ operation }) =>
        operation.action === "makeMap" &&
        operation.obj === parentId &&
        operation.key === key,
    );
  if (!repeated && indexes.length !== 1) return;
  for (const { index } of indexes) {
    const childId = `${change.startOp + index}@${change.actor}`;
    const children = change.ops
      .map((operation, childIndex) => ({ operation, childIndex }))
      .filter(
        ({ operation }) =>
          operation.action === "set" && operation.obj === childId,
      );
    if (children.length !== 1 || children[0]!.operation.value !== true) return;
    allowed.add(index);
    allowed.add(children[0]!.childIndex);
  }
}

function collectRecords(
  document: A.Doc<NativeState>,
): Map<string, CanonicalRecordEntry> {
  return collectRecordNamespace(document).records;
}

/** Collects the semantic record union and its native provenance in one read. */
function collectRecordNamespace(document: A.Doc<NativeState>): {
  readonly records: Map<string, CanonicalRecordEntry>;
  readonly objectDepths: ReadonlyMap<string, number>;
} {
  const result = new Map<string, CanonicalRecordEntry>();
  const objectDepths = new Map<string, number>();
  const heads = A.getHeads(document);
  const unchanged = A.change(document, (draft) => {
    const pending: { readonly value: unknown; readonly path: string }[] = [
      { value: draft.records, path: "" },
    ];
    while (pending.length > 0) {
      const current = pending.pop()!;
      const node = nativeMap(current.value);
      const objectId = A.getObjectId(node);
      if (objectId === null)
        throw new TypeError("Record prefix lacks native identity.");
      const previousDepth = objectDepths.get(objectId);
      if (previousDepth !== undefined) {
        if (previousDepth !== current.path.length)
          throw new TypeError("Record prefix is reachable at multiple depths.");
        continue;
      }
      objectDepths.set(objectId, current.path.length);
      for (const key of Object.keys(node)) {
        const conflicts = A.getConflicts(node, key);
        const alternatives =
          conflicts === undefined ? [node[key]] : Object.values(conflicts);
        if (current.path.length < 32) {
          if (!/^[0-9a-f]$/.test(key))
            throw new TypeError("Record prefix key is invalid.");
          for (const alternative of alternatives)
            pending.push({ value: alternative, path: current.path + key });
        } else {
          for (const marker of alternatives) {
            const entry = decodeRecordKeyV1(key, marker);
            if (digits(entry.record[2]) !== current.path)
              throw new TypeError("Record UUID differs from its native path.");
            const previous = result.get(entry.record[2]);
            if (
              previous !== undefined &&
              previous.canonical !== entry.canonical
            )
              throw new TypeError(
                "Immutable record UUID equivocation detected.",
              );
            result.set(entry.record[2], entry);
          }
        }
      }
    }
  });
  if (
    unchanged !== document ||
    JSON.stringify(A.getHeads(unchanged)) !== JSON.stringify(heads)
  )
    throw new Error("Read-only record traversal changed native state.");
  return { records: result, objectDepths };
}

function appendPlainRecord(
  root: Record<string, unknown>,
  entry: CanonicalRecordEntry,
): void {
  let node = root;
  for (const digit of digits(entry.record[2])) {
    const child = node[digit];
    if (child === undefined) node[digit] = {};
    node = plainMap(node[digit]);
  }
  node[entry.key] = true;
}

function appendNativeRecord(
  root: Record<string, unknown>,
  supplied: CanonicalRecordEntry,
): void {
  const entry = decodeRecordKeyV1(supplied.key, true);
  let node = root;
  for (const digit of digits(entry.record[2])) {
    if (node[digit] === undefined) node[digit] = {};
    node = nativeMap(node[digit]);
  }
  node[entry.key] = true;
}

function joinRecord(inputs: readonly RecordRef[]): CanonicalRecordEntry {
  const sorted = [...inputs].sort((left, right) =>
    encodeRef(left).localeCompare(encodeRef(right)),
  );
  return commitRecordV1([
    "coedit-step3-record",
    1,
    crypto.randomUUID(),
    "join",
    ["document"],
    null,
    null,
    null,
    null,
    null,
    [sorted],
  ]);
}

function encodeDescriptor(
  output: DescriptorOutput,
  replacementEffectId: string | undefined,
): string {
  return JSON.stringify([...output, replacementEffectId ?? null]);
}

function decodeDescriptor(encoded: string): ImmutableRunNativeDescriptorV1 {
  const value: unknown = JSON.parse(encoded);
  if (!Array.isArray(value) || typeof value[0] !== "string")
    throw new TypeError("Native descriptor is invalid.");
  if (value[0] === "text") {
    if (
      value.length !== 5 ||
      typeof value[2] !== "string" ||
      !(value[4] === null || typeof value[4] === "string")
    )
      throw new TypeError("Native text descriptor is invalid.");
    return Object.freeze({
      kind: "text",
      mediaType: value[2],
      generation: decodeRefValue(value[3]),
      replacementEffectId: value[4] === null ? undefined : (value[4] as string),
    });
  }
  if (
    value.length !== 6 ||
    value[0] !== "opaque" ||
    typeof value[2] !== "string" ||
    !Array.isArray(value[3]) ||
    !Array.isArray(value[4]) ||
    value[4].length !== 2 ||
    typeof value[4][0] !== "string" ||
    typeof value[4][1] !== "string" ||
    !(value[5] === null || typeof value[5] === "string")
  )
    throw new TypeError("Native opaque descriptor is invalid.");
  const bytes = value[3].map((byte) => {
    if (!Number.isInteger(byte) || byte < 0 || byte > 255)
      throw new TypeError("Native opaque byte is invalid.");
    return byte as number;
  });
  return Object.freeze({
    kind: "opaque",
    mediaType: value[2],
    bytes: Object.freeze(bytes),
    origin: Object.freeze({
      kind: qualificationOriginKind(value[4][0]),
      id: value[4][1],
    }),
    replacementEffectId: value[5] === null ? undefined : (value[5] as string),
  });
}

function descriptorOutputFromEncoded(
  inlineContentId: string,
  encoded: string,
): DescriptorOutput {
  const descriptor = decodeDescriptor(encoded);
  if (descriptor.kind === "text")
    return Object.freeze([
      "text",
      inlineContentId,
      descriptor.mediaType,
      descriptor.generation,
    ]);
  const origin: RecordOrigin = Object.freeze([
    descriptor.origin.kind,
    descriptor.origin.id,
  ]);
  return Object.freeze([
    "opaque",
    inlineContentId,
    descriptor.mediaType,
    descriptor.bytes,
    origin,
  ]);
}

function readRegistry(
  registry: Registry,
  label: string,
): ReadonlyMap<string, string> {
  const result = new Map<string, string>();
  for (const key of Object.keys(registry))
    result.set(key, readCell(registry[key], label));
  return result;
}

function cell(value: string): Cell {
  return { [value]: true };
}

function readCell(value: unknown, label: string): string {
  const candidate = nativeMap(value);
  const keys = Object.keys(candidate);
  if (keys.length !== 1 || candidate[keys[0]!] !== true)
    throw new TypeError(`${label} cell is invalid.`);
  return keys[0]!;
}

/** Track register versions only where their complete causal input is known. */
function nextRootVersions(
  change: A.DecodedChange,
  previous: readonly string[] | null,
): readonly string[] | null {
  if (previous === null) return null;
  const versions = new Set(previous);
  for (let index = 0; index < change.ops.length; index++) {
    const operation = change.ops[index]!;
    if (operation.obj !== "_root" || operation.key !== "semanticRoot") continue;
    for (const predecessor of operation.pred) versions.delete(predecessor);
    if (operation.action !== "del")
      versions.add(`${change.startOp + index}@${change.actor}`);
  }
  return Object.freeze([...versions]);
}

/**
 * A complete causal overwrite has no native winner choice to reproduce.
 *
 * Only the root cell and immutable record namespace may change here. Any other
 * operation, incomplete predecessor coverage, or unknown multi-parent frontier
 * uses the public native diff path instead. Decoded-operation and whole-command
 * checks still validate the resulting projection before it can be accepted.
 */
function projectCompleteRootOverwrite(
  change: A.DecodedChange,
  dependency: NativeMetadataSnapshot,
  versions: readonly string[],
  recordDepths: ReadonlyMap<string, number>,
): NativeMetadataSnapshot | undefined {
  if (change.deps.length !== 1) return undefined;
  const roots = change.ops
    .map((operation, index) => ({ operation, index }))
    .filter(
      ({ operation }) =>
        operation.obj === "_root" && operation.key === "semanticRoot",
    );
  if (roots.length !== 1) return undefined;
  const { operation, index } = roots[0]!;
  if (
    operation.action !== "makeMap" ||
    operation.pred.length !== versions.length ||
    !versions.every((version) => operation.pred.includes(version))
  )
    return undefined;
  const objectId = `${change.startOp + index}@${change.actor}`;
  const leaves = change.ops.filter((candidate) => candidate.obj === objectId);
  if (leaves.length !== 1) return undefined;
  const leaf = leaves[0]!;
  if (leaf.action !== "set" || leaf.value !== true || leaf.pred.length !== 0)
    return undefined;
  if (
    change.ops.some(
      (candidate, candidateIndex) =>
        candidateIndex !== index &&
        candidate !== leaf &&
        !recordDepths.has(candidate.obj),
    )
  )
    return undefined;
  return Object.freeze({ ...dependency, semanticRoot: leaf.key });
}

function emptyMetadataSnapshot(): NativeMetadataSnapshot {
  return Object.freeze({
    layout: "",
    lineage: "",
    rootBlock: "",
    semanticRoot: "",
    placements: new Map(),
    owners: new Map(),
    descriptors: new Map(),
    captures: new Map(),
  });
}

function applyMetadataPatches(
  supplied: NativeMetadataSnapshot,
  patches: ReturnType<typeof A.diff>,
): NativeMetadataSnapshot {
  let layout = supplied.layout;
  let lineage = supplied.lineage;
  let rootBlock = supplied.rootBlock;
  let semanticRoot = supplied.semanticRoot;
  let placements = supplied.placements;
  let owners = supplied.owners;
  let descriptors = supplied.descriptors;
  let captures = supplied.captures;
  let copiedPlacements = false;
  let copiedOwners = false;
  let copiedDescriptors = false;
  let copiedCaptures = false;
  const writablePlacements = (): Map<string, string> => {
    if (!copiedPlacements) {
      placements = new Map(placements);
      copiedPlacements = true;
    }
    return placements as Map<string, string>;
  };
  const writableOwners = (): Map<string, string> => {
    if (!copiedOwners) {
      owners = new Map(owners);
      copiedOwners = true;
    }
    return owners as Map<string, string>;
  };
  const writableDescriptors = (): Map<string, string> => {
    if (!copiedDescriptors) {
      descriptors = new Map(descriptors);
      copiedDescriptors = true;
    }
    return descriptors as Map<string, string>;
  };
  const writableCaptures = (): Map<string, string> => {
    if (!copiedCaptures) {
      captures = new Map(captures);
      copiedCaptures = true;
    }
    return captures as Map<string, string>;
  };
  for (const patch of patches) {
    const [root, key, leaf, ...rest] = patch.path;
    if (root === "records") continue;
    if (typeof root !== "string" || rest.length !== 0)
      throw new TypeError("Native metadata patch path is invalid.");
    if (patch.action === "conflict") continue;
    if (patch.action !== "put")
      throw new TypeError("Native metadata patch action is invalid.");
    const value = patch.value;
    if (key === undefined) {
      if (!isMapPatchValue(value))
        throw new TypeError("Native metadata root patch is invalid.");
      if (root === "layout") layout = "";
      else if (root === "lineage") lineage = "";
      else if (root === "rootBlock") rootBlock = "";
      else if (root === "semanticRoot") semanticRoot = "";
      else if (root === "placements") {
        placements = new Map();
        copiedPlacements = true;
      } else if (root === "owners") {
        owners = new Map();
        copiedOwners = true;
      } else if (root === "descriptors") {
        descriptors = new Map();
        copiedDescriptors = true;
      } else if (root === "captures") {
        captures = new Map();
        copiedCaptures = true;
      } else throw new TypeError("Native metadata root is invalid.");
      continue;
    }
    if (typeof key !== "string")
      throw new TypeError("Native metadata key is invalid.");
    if (leaf === undefined) {
      if (root === "layout" && value === true) layout = key;
      else if (root === "lineage" && value === true) lineage = key;
      else if (root === "rootBlock" && value === true) rootBlock = key;
      else if (root === "semanticRoot" && value === true) semanticRoot = key;
      else if (isMapPatchValue(value)) {
        if (root === "placements") writablePlacements().set(key, "");
        else if (root === "owners") writableOwners().set(key, "");
        else if (root === "descriptors") writableDescriptors().set(key, "");
        else if (root === "captures") writableCaptures().set(key, "");
        else throw new TypeError("Native metadata cell root is invalid.");
      } else {
        throw new TypeError("Native metadata cell patch is invalid.");
      }
      continue;
    }
    if (typeof leaf !== "string" || value !== true)
      throw new TypeError("Native metadata cell leaf is invalid.");
    if (root === "placements") writablePlacements().set(key, leaf);
    else if (root === "owners") writableOwners().set(key, leaf);
    else if (root === "descriptors") writableDescriptors().set(key, leaf);
    else if (root === "captures") writableCaptures().set(key, leaf);
    else throw new TypeError("Native metadata cell root is invalid.");
  }
  return Object.freeze({
    layout,
    lineage,
    rootBlock,
    semanticRoot,
    placements,
    owners,
    descriptors,
    captures,
  });
}

function assertMetadataSnapshot(snapshot: NativeMetadataSnapshot): void {
  if (
    snapshot.layout.length === 0 ||
    snapshot.lineage.length === 0 ||
    snapshot.rootBlock.length === 0 ||
    snapshot.semanticRoot.length === 0
  )
    throw new TypeError("Native metadata header is incomplete.");
  for (const registry of [
    snapshot.placements,
    snapshot.owners,
    snapshot.descriptors,
    snapshot.captures,
  ])
    for (const value of registry.values())
      if (value.length === 0)
        throw new TypeError("Native metadata cell is incomplete.");
}

function isMapPatchValue(value: unknown): boolean {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function captureSnapshot(
  root: RecordRef,
  metadata: NativeMetadataSnapshot,
  protocol: ImmutableRunProtocolV1,
  view: ImmutableRunNativeViewV1,
): IntegratedDocumentSnapshot<string> {
  const blockLiveness = new Map<BlockId, boolean>();
  for (const id of view.blockIdentities?.() ?? [])
    blockLiveness.set(id, view.isBlockLive(id));
  const placements = new Map<BlockId, StructuralPlacement<string>>();
  for (const [id, encoded] of metadata.placements) {
    const blockId = parseBlockId(id);
    if (view.isBlockLive(blockId))
      placements.set(
        blockId,
        decodeStructuralPlacement(encoded, STRING_POSITION_CODEC),
      );
  }
  const inlineContentOwners = new Map<InlineContentId, BlockId>();
  const payloads = new Map<InlineContentId, QualificationPayloadSnapshot>();
  for (const inlineId of view.inlineIdentities?.() ?? []) {
    const owner = view.ownerOf(inlineId);
    const descriptor = view.descriptorOf(inlineId);
    if (
      owner === undefined ||
      descriptor === undefined ||
      !view.isInlineLive(inlineId) ||
      !view.isBlockLive(owner)
    )
      continue;
    inlineContentOwners.set(inlineId, owner);
    if (descriptor.kind === "opaque") {
      payloads.set(
        inlineId,
        Object.freeze({
          kind: "opaque",
          mediaType: descriptor.mediaType,
          bytes: new Uint8Array(descriptor.bytes),
          origin: descriptor.origin,
        }),
      );
    } else {
      const projection = protocol.projectGeneration(
        root,
        descriptor.generation,
      );
      payloads.set(
        inlineId,
        Object.freeze({
          kind: "text",
          mediaType: descriptor.mediaType,
          text: projection.text,
          spans: Object.freeze(
            projection.spans.map((span) =>
              Object.freeze({
                text: span.text,
                origin: Object.freeze({
                  kind: qualificationOriginKind(span.origin.kind),
                  id: span.origin.id,
                }),
              }),
            ),
          ),
        }),
      );
    }
  }
  return Object.freeze({
    rootId: view.rootBlockId,
    blockLiveness,
    placements,
    inlineContentOwners,
    payloads,
  });
}

function sameCaptureSnapshot(
  left: IntegratedDocumentSnapshot<string>,
  right: IntegratedDocumentSnapshot<string>,
): boolean {
  return (
    left.rootId === right.rootId &&
    sameMap(left.blockLiveness, right.blockLiveness) &&
    sameSemanticMap(left.placements, right.placements) &&
    sameMap(left.inlineContentOwners, right.inlineContentOwners) &&
    samePayloadMaps(left.payloads, right.payloads)
  );
}

function sameMap<Value>(
  left: ReadonlyMap<string, Value>,
  right: ReadonlyMap<string, Value>,
): boolean {
  if (left.size !== right.size) return false;
  for (const [key, value] of left) if (right.get(key) !== value) return false;
  return true;
}

function samePayloadMaps(
  left: ReadonlyMap<InlineContentId, QualificationPayloadSnapshot>,
  right: ReadonlyMap<InlineContentId, QualificationPayloadSnapshot>,
): boolean {
  if (left.size !== right.size) return false;
  for (const [id, payload] of left) {
    const other = right.get(id);
    if (other === undefined || payload.kind !== other.kind) return false;
    if (
      payload.mediaType !== other.mediaType ||
      (payload.kind === "opaque" &&
        (other.kind !== "opaque" ||
          payload.origin.kind !== other.origin.kind ||
          payload.origin.id !== other.origin.id ||
          !sameBytes(payload.bytes, other.bytes)))
    )
      return false;
    if (
      payload.kind === "text" &&
      (other.kind !== "text" ||
        payload.text !== other.text ||
        payload.spans.length !== other.spans.length ||
        payload.spans.some(
          (span, index) =>
            span.text !== other.spans[index]!.text ||
            span.origin.kind !== other.spans[index]!.origin.kind ||
            span.origin.id !== other.spans[index]!.origin.id,
        ))
    )
      return false;
  }
  return true;
}

function sameBytes(left: Uint8Array, right: Uint8Array): boolean {
  return (
    left.length === right.length &&
    left.every((value, index) => value === right[index])
  );
}

function sameSemanticMap<Value>(
  left: ReadonlyMap<string, Value>,
  right: ReadonlyMap<string, Value>,
): boolean {
  if (left.size !== right.size) return false;
  for (const [key, value] of left)
    if (JSON.stringify(right.get(key)) !== JSON.stringify(value)) return false;
  return true;
}

function nativeMap(value: unknown): Record<string, unknown> {
  if (value === null || typeof value !== "object" || Array.isArray(value))
    throw new TypeError("Native value is not a map.");
  return value as Record<string, unknown>;
}

function plainMap(value: unknown): Record<string, unknown> {
  if (value === null || typeof value !== "object" || Array.isArray(value))
    throw new TypeError("Plain record prefix is invalid.");
  return value as Record<string, unknown>;
}

function encodeRef(ref: RecordRef): string {
  return JSON.stringify(ref);
}

function decodeRef(encoded: string): RecordRef {
  return decodeRefValue(JSON.parse(encoded));
}

function decodeRefValue(value: unknown): RecordRef {
  if (
    !Array.isArray(value) ||
    value.length !== 2 ||
    !isUuid(value[0]) ||
    typeof value[1] !== "string" ||
    !/^[0-9a-f]{64}$/.test(value[1])
  )
    throw new TypeError("Record Ref is invalid.");
  return Object.freeze([value[0], value[1]]);
}

function digits(id: string): string {
  return id.replaceAll("-", "");
}

function isUuid(value: unknown): value is string {
  return (
    typeof value === "string" &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(
      value,
    )
  );
}

function isStringArray(value: unknown): value is string[] {
  return (
    Array.isArray(value) && value.every((entry) => typeof entry === "string")
  );
}

function sameRef(left: RecordRef, right: RecordRef): boolean {
  return left[0] === right[0] && left[1] === right[1];
}

function isCommandBody(
  value: CanonicalRecordEntry["record"][10],
): value is CommandBody {
  return (
    Array.isArray(value) &&
    value.length === 8 &&
    (value[0] === "apply" || value[0] === "restore")
  );
}

function retireRefs(
  value: CanonicalRecordEntry["record"][10],
): readonly RecordRef[] {
  if (!Array.isArray(value) || value.length !== 1 || !Array.isArray(value[0]))
    throw new TypeError("Native retire body is invalid.");
  return value[0].map(decodeRefValue);
}

function qualificationOriginKind(value: string): QualificationOriginKind {
  if (
    value !== "human" &&
    value !== "imported" &&
    value !== "automation" &&
    value !== "ai" &&
    value !== "unknown"
  )
    throw new TypeError("Native descriptor Origin is invalid.");
  return value;
}
