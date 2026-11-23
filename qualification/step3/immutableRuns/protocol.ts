import {
  decodeRecordKeyV1,
  type CanonicalRecordEntry,
  type CanonicalRecordV1,
  type RecordRef,
} from "./record.js";

type Origin = readonly [kind: string, id: string];

interface RootNode {
  readonly entry: CanonicalRecordEntry;
  readonly parents: readonly CanonicalRecordEntry[];
  readonly members: readonly CanonicalRecordEntry[];
}

interface SourceClosure extends Iterable<string> {
  has(key: string): boolean;
}

/** Internal exact ancestry represented once per root rather than once per member. */
class RootClosure implements SourceClosure {
  public constructor(
    public readonly bits: Uint32Array,
    private readonly ordinalByKey: ReadonlyMap<string, number>,
    private readonly keysByOrdinal: readonly (readonly string[])[],
  ) {}

  public has(key: string): boolean {
    const ordinal = this.ordinalByKey.get(key);
    return (
      ordinal !== undefined &&
      ((this.bits[ordinal >>> 5]! >>> (ordinal & 31)) & 1) !== 0
    );
  }

  public *[Symbol.iterator](): IterableIterator<string> {
    for (let word = 0; word < this.bits.length; word++) {
      let remaining = this.bits[word]!;
      while (remaining !== 0) {
        const least = remaining & -remaining;
        const ordinal = word * 32 + 31 - Math.clz32(least);
        yield* this.keysByOrdinal[ordinal]!;
        remaining = (remaining & (remaining - 1)) >>> 0;
      }
    }
  }
}

/**
 * Disposable source facts for exactly one validated root. No historical view
 * retains this mutable summary. Erased offsets are charged to hidden source
 * units, never to repeated projections of all previously reached source.
 */
interface SourceSummary {
  atRoot: string;
  readonly maxima: Map<string, bigint>;
  readonly generations: Set<string>;
  readonly erased: Map<string, Set<number>>;
}

interface RunFact {
  readonly entry: CanonicalRecordEntry;
  readonly generationKey: string;
  readonly counter: bigint;
  readonly replica: string;
  readonly anchor: readonly [RecordRef, number] | null;
  readonly source: string;
  readonly origin: Origin;
}

interface EraseFact {
  readonly entry: CanonicalRecordEntry;
  readonly generationKey: string;
  readonly intervals: readonly (readonly [RecordRef, number, number])[];
}

interface SourceUnit {
  readonly run: RunFact;
  readonly offset: number;
}

/** Detached Origin retained by a projected immutable source unit. */
export interface ImmutableRunProjectedOriginV1 {
  /** Qualification Origin kind. */
  readonly kind: string;
  /** Exact qualification Origin identifier. */
  readonly id: string;
}

/** One adjacent visible source span sharing an exact Origin. */
export interface ImmutableRunOriginSpanV1 {
  /** Exact visible ECMAScript substring. */
  readonly text: string;
  /** Fixed attribution shared by every source unit in the span. */
  readonly origin: ImmutableRunProjectedOriginV1;
}

/** One exact observed-source interval carried by an erase fact. */
export interface ImmutableRunObservedIntervalV1 {
  /** Exact committed run containing the interval. */
  readonly run: RecordRef;
  /** Inclusive zero-based UTF-16 source offset. */
  readonly start: number;
  /** Exclusive zero-based UTF-16 source offset. */
  readonly end: number;
}

/** One reached immutable authored run, including source hidden by erasures. */
export interface ImmutableRunReachedRunV1 {
  /** Exact committed run Ref. */
  readonly run: RecordRef;
  /** Start sentinel or exact preceding source-unit boundary. */
  readonly anchor: Readonly<{
    /** Exact anchored run Ref. */
    readonly run: RecordRef;
    /** Positive source-end offset in the anchored run. */
    readonly sourceEndOffset: number;
  }> | null;
  /** Complete authoritative ECMAScript source string. */
  readonly source: string;
  /** Fixed attribution for the complete source string. */
  readonly origin: ImmutableRunProjectedOriginV1;
  /** Arbitrary-precision causal rank counter. */
  readonly counter: bigint;
  /** Private replica UUID completing the source rank. */
  readonly replicaUuid: string;
}

/** One reached immutable observed-source erase fact. */
export interface ImmutableRunReachedEraseV1 {
  /** Exact committed erase Ref. */
  readonly erase: RecordRef;
  /** Canonical observed source intervals. */
  readonly intervals: readonly ImmutableRunObservedIntervalV1[];
  /** Arbitrary-precision causal counter. */
  readonly counter: bigint;
  /** Private replica UUID carried by the erase clock. */
  readonly replicaUuid: string;
}

/** One UTF-16 source unit in a cold immutable-run traversal. */
export interface ImmutableRunSourceUnitV1 {
  /** Exact committed run containing this unit. */
  readonly run: RecordRef;
  /** Zero-based UTF-16 offset in the run source. */
  readonly offset: number;
  /** Exact one-unit ECMAScript substring. */
  readonly text: string;
  /** Fixed source attribution carried by the run. */
  readonly origin: ImmutableRunProjectedOriginV1;
  /** Whether no reached erase fact hides this source unit. */
  readonly visible: boolean;
}

/** Complete cold projection of one text generation at one causal root. */
export interface ImmutableRunGenerationProjectionV1 {
  /** Exact generation record Ref. */
  readonly generation: RecordRef;
  /** Visible text after observed-source erasures. */
  readonly text: string;
  /** Visible source units in deterministic RGA-family order. */
  readonly units: readonly ImmutableRunSourceUnitV1[];
  /** Complete deterministic traversal, including erased source units. */
  readonly sourceUnits: readonly ImmutableRunSourceUnitV1[];
  /** Reached immutable run facts, in canonical Ref order. */
  readonly runs: readonly ImmutableRunReachedRunV1[];
  /** Reached immutable erase facts, in canonical Ref order. */
  readonly erasures: readonly ImmutableRunReachedEraseV1[];
  /** Adjacent visible units coalesced only when their Origin is equal. */
  readonly spans: readonly ImmutableRunOriginSpanV1[];
  /** Greatest arbitrary-precision source counter in this generation. */
  readonly maximumCounter: bigint;
}

/**
 * Validated cold reference model for an immutable-run record set.
 *
 * @remarks
 * Construction performs exact record-set, root-closure, bidirectional command
 * membership, source-chain, liveness-reference, anchor, interval, and counter
 * validation. It deliberately does not validate native descriptor/ownership
 * winners, replay payload operations against those native views, or prove
 * transition mapping coverage. Those require the qualification-private native
 * view and retained-referent adapter that this cold source model does not invent.
 * Projection deliberately expands source strings into UTF-16 units and scans
 * causal closures. It is qualification reference code, never an ordinary-edit
 * index or a performance claim.
 */
export class ImmutableRunProtocolV1 {
  readonly #entries: ReadonlyMap<string, CanonicalRecordEntry>;
  readonly #roots: ReadonlyMap<string, RootNode>;
  readonly #closures = new Map<string, RootClosure>();
  readonly #rootOrder: RootNode[] = [];
  readonly #genesis: CanonicalRecordEntry;
  readonly #runSourceUnits: number;
  readonly #maximalRoots: readonly RecordRef[];

  private constructor(
    entries: readonly CanonicalRecordEntry[],
    sourceValidation: "incremental" | "reference",
  ) {
    const byRef = new Map<string, CanonicalRecordEntry>();
    const byUuid = new Map<string, CanonicalRecordEntry>();
    for (const supplied of entries) {
      const entry = decodeRecordKeyV1(supplied.key, true);
      const uuid = entry.record[2];
      const previous = byUuid.get(uuid);
      if (previous !== undefined && previous.canonical !== entry.canonical)
        fail("Immutable-run record UUID equivocation detected.");
      byUuid.set(uuid, entry);
      byRef.set(refKey(entry.ref), entry);
    }
    this.#entries = byRef;

    const roots = new Map<string, RootNode>();
    const genesis: CanonicalRecordEntry[] = [];
    const expectedMembers = new Map<string, string>();
    const claimedMembers = new Set<string>();
    const effectManifests = new Map<string, CanonicalRecordEntry>();

    for (const entry of byRef.values()) {
      const record = entry.record;
      if (record[3] === "manifest") {
        const body = tuple(record[10], undefined, "Manifest body");
        const discriminator = string(body[0], "Manifest discriminator");
        const manifestEffect = requiredEffect(record);
        const effectKey = JSON.stringify(manifestEffect);
        const priorEffect = effectManifests.get(effectKey);
        if (
          priorEffect !== undefined &&
          priorEffect.canonical !== entry.canonical
        )
          fail("Actor/effect identity names conflicting manifests.");
        effectManifests.set(effectKey, entry);
        if (discriminator === "genesis") {
          if (body.length !== 4) fail("Genesis manifest body is invalid.");
          genesis.push(entry);
          roots.set(refKey(entry.ref), { entry, parents: [], members: [] });
          continue;
        }
        if (!(discriminator === "apply" || discriminator === "restore"))
          fail("Command manifest discriminator is invalid.");
        if (body.length !== 8) fail("Command manifest body is invalid.");
        const acceptedBase = this.#resolveRoot(body[1], byRef);
        const memberRefs: unknown[] = [body[2], body[3]];
        if (body[4] !== null) memberRefs.push(body[4]);
        const rows = tuple(body[5], undefined, "Command operation rows");
        for (const candidate of rows) {
          const row = tuple(candidate, 3, "Command operation row");
          for (const member of tuple(row[2], undefined, "Operation members"))
            memberRefs.push(member);
        }
        const members = memberRefs.map((reference) =>
          this.#resolveMember(reference, byRef),
        );
        for (const member of members) {
          const key = refKey(member.ref);
          if (expectedMembers.has(key))
            fail("A semantic member belongs to more than one manifest.");
          expectedMembers.set(key, refKey(entry.ref));
          if (member.record[8] !== record[2])
            fail("Command member batch UUID does not match its manifest.");
          if (!samePair(member.record[7], manifestEffect))
            fail("Command member effect does not match its manifest.");
        }
        this.#validateCommandMembership(entry, members, byRef);
        roots.set(refKey(entry.ref), {
          entry,
          parents: [acceptedBase],
          members,
        });
      } else if (record[3] === "join") {
        const body = tuple(record[10], 1, "Join body");
        const parents = tuple(body[0], undefined, "Join inputs").map(
          (reference) => this.#resolveRoot(reference, byRef),
        );
        roots.set(refKey(entry.ref), { entry, parents, members: [] });
      } else {
        claimedMembers.add(refKey(entry.ref));
      }
    }

    if (genesis.length !== 1)
      fail("Record set must contain exactly one bootstrap genesis manifest.");
    this.#genesis = genesis[0]!;
    const genesisBody = tuple(this.#genesis.record[10], 4, "Genesis body");
    const settings = tuple(genesisBody[2], 3, "Genesis settings");
    this.#runSourceUnits = integer(settings[2], "Run-source units");
    if (this.#runSourceUnits < 1) fail("Run-source units must be positive.");
    this.#roots = roots;
    for (const key of claimedMembers)
      if (!expectedMembers.has(key))
        fail(
          "Semantic record is not contained by exactly one command manifest.",
        );
    for (const key of expectedMembers.keys())
      if (!claimedMembers.has(key))
        fail("Command member Ref names a root record.");

    this.#validateRootGraph();
    this.#validateCommandsInCausalOrder(sourceValidation);

    const parentKeys = new Set<string>();
    for (const root of roots.values())
      for (const parent of root.parents) parentKeys.add(refKey(parent.ref));
    this.#maximalRoots = Object.freeze(
      [...roots.values()]
        .filter((root) => !parentKeys.has(refKey(root.entry.ref)))
        .map((root) => root.entry.ref)
        .sort(compareRefs),
    );
  }

  /** Validate cold graph/source invariants and build their reference model. */
  public static validate(
    entries: readonly CanonicalRecordEntry[],
  ): ImmutableRunProtocolV1 {
    return new ImmutableRunProtocolV1(entries, "incremental");
  }

  /**
   * Validate with the standalone closure/projection source algorithm.
   *
   * @remarks
   * This qualification reference route performs the same graph and membership
   * checks as {@link validate}, without its disposable linear-tail source cache.
   * It remains available for differential validation of valid and hostile input;
   * callers still need the separate native and command validation described
   * by this class contract.
   */
  public static validateReference(
    entries: readonly CanonicalRecordEntry[],
  ): ImmutableRunProtocolV1 {
    return new ImmutableRunProtocolV1(entries, "reference");
  }

  /** Detached frozen snapshot of the protocol's decoded canonical entries. */
  public get canonicalEntries(): readonly CanonicalRecordEntry[] {
    return Object.freeze([...this.#entries.values()]);
  }

  /** The unique trusted-lineage bootstrap manifest Ref. */
  public get genesisRoot(): RecordRef {
    return this.#genesis.ref;
  }

  /** Exact validated bootstrap source-chunk setting for this lineage. */
  public get runSourceUnits(): number {
    return this.#runSourceUnits;
  }

  /** Maximal accepted roots, sorted by exact Ref. */
  public get maximalRoots(): readonly RecordRef[] {
    return this.#maximalRoots;
  }

  /**
   * Return exact records in one root's causal closure.
   *
   * @remarks The result order is canonical Ref order, not authoring order.
   */
  public closure(root: RecordRef): readonly CanonicalRecordEntry[] {
    const resolved = this.#resolveRoot(root, this.#entries);
    const keys = this.#closureKeys(resolved);
    return Object.freeze(
      [...keys]
        .map((key) => this.#entries.get(key)!)
        .sort((left, right) => compareRefs(left.ref, right.ref)),
    );
  }

  /** Project one generation through deterministic source order and erasures. */
  public projectGeneration(
    root: RecordRef,
    generation: RecordRef,
  ): ImmutableRunGenerationProjectionV1 {
    const rootEntry = this.#resolveRoot(root, this.#entries);
    const generationEntry = this.#resolveExact(generation, this.#entries);
    if (generationEntry.record[3] !== "generation")
      fail("Generation Ref does not name a generation record.");
    const closure = this.#closureKeys(rootEntry);
    if (!closure.has(refKey(generationEntry.ref)))
      fail("Generation is outside the requested root closure.");
    return this.#project(closure, generationEntry);
  }

  /** Return observed-token liveness for one entity at a causal root. */
  public isEntityLive(
    root: RecordRef,
    kind: "block" | "inline",
    entityUuid: string,
  ): boolean {
    const closure = this.#closureKeys(this.#resolveRoot(root, this.#entries));
    const retired = new Set<string>();
    const live = new Set<string>();
    for (const key of closure) {
      const entry = this.#entries.get(key)!;
      const record = entry.record;
      if (
        (record[3] === "live" || record[3] === "retire") &&
        record[4][0] === kind &&
        record[4][1] === entityUuid
      ) {
        if (record[3] === "live") live.add(key);
        else {
          const body = tuple(record[10], 1, "Retire body");
          for (const reference of tuple(body[0], undefined, "Retire Refs"))
            retired.add(refKeyValue(reference));
        }
      }
    }
    for (const key of live) if (!retired.has(key)) return true;
    return false;
  }

  #validateCommandMembership(
    manifest: CanonicalRecordEntry,
    members: readonly CanonicalRecordEntry[],
    entries: ReadonlyMap<string, CanonicalRecordEntry>,
  ): void {
    const record = manifest.record;
    const body = tuple(record[10], 8, "Command body");
    const kind = body[0];
    const context = this.#resolveExact(body[2], entries);
    const envelope = this.#resolveExact(body[3], entries);
    if (context.record[3] !== "context" || envelope.record[3] !== "envelope")
      fail("Command metadata Refs have the wrong record kinds.");
    const envelopeBody = tuple(envelope.record[10], 2, "Envelope body");
    if (envelopeBody[0] !== kind)
      fail("Command and envelope kinds do not match.");
    const evidence =
      body[4] === null ? null : this.#resolveExact(body[4], entries);
    if (evidence !== null) {
      if (evidence.record[3] !== "payload-effect-v2")
        fail("Payload evidence Ref has the wrong record kind.");
      const evidenceBody = tuple(
        evidence.record[10],
        3,
        "Payload evidence body",
      );
      if (refKeyValue(evidenceBody[1]) !== refKeyValue(body[1]))
        fail("Payload evidence ancestry differs from the accepted base.");
    }
    const rows = tuple(body[5], undefined, "Command operation rows");
    for (const candidate of rows) {
      const row = tuple(candidate, 3, "Command operation row");
      const category = string(row[0], "Operation category");
      const operationIndex = integer(row[1], "Operation index");
      const refs = tuple(row[2], undefined, "Operation member Refs");
      for (let memberIndex = 0; memberIndex < refs.length; memberIndex++) {
        const member = this.#resolveExact(refs[memberIndex], entries);
        const ordinal = member.record[9];
        if (
          ordinal === null ||
          ordinal[0] !== category ||
          ordinal[1] !== operationIndex ||
          ordinal[2] !== memberIndex
        )
          fail("Command member ordinal differs from its operation position.");
      }
    }
    const metadata: [CanonicalRecordEntry, string][] = [
      [context, "context"],
      [envelope, "envelope"],
    ];
    if (evidence !== null) metadata.push([evidence, "payload-evidence"]);
    for (const [entry, category] of metadata) {
      const ordinal = entry.record[9];
      if (
        ordinal === null ||
        ordinal[0] !== category ||
        ordinal[1] !== 0 ||
        ordinal[2] !== 0
      )
        fail("Command metadata ordinal is invalid.");
    }
    const actual = new Set(members.map((entry) => refKey(entry.ref)));
    if (actual.size !== members.length)
      fail("Command manifest repeats a member Ref.");
  }

  #validateRootGraph(): void {
    const state = new Map<string, "visiting" | "done">();
    for (const first of this.#roots.values()) {
      if (state.get(refKey(first.entry.ref)) === "done") continue;
      const pending: { node: RootNode; nextParent: number }[] = [
        { node: first, nextParent: 0 },
      ];
      state.set(refKey(first.entry.ref), "visiting");
      while (pending.length > 0) {
        const frame = pending.at(-1)!;
        if (frame.nextParent < frame.node.parents.length) {
          const parent = frame.node.parents[frame.nextParent++]!;
          const key = refKey(parent.ref);
          const status = state.get(key);
          if (status === "visiting")
            fail("Causal root graph contains a cycle.");
          if (status === "done") continue;
          const node = this.#roots.get(key);
          if (node === undefined) fail("Causal root dependency is missing.");
          state.set(key, "visiting");
          pending.push({ node, nextParent: 0 });
        } else {
          pending.pop();
          state.set(refKey(frame.node.entry.ref), "done");
          this.#rootOrder.push(frame.node);
        }
      }
    }
    const ordinalByKey = new Map<string, number>();
    const keysByOrdinal = this.#rootOrder.map((node, ordinal) => {
      const keys = [
        refKey(node.entry.ref),
        ...node.members.map((member) => refKey(member.ref)),
      ];
      for (const key of keys) ordinalByKey.set(key, ordinal);
      return Object.freeze(keys);
    });
    const words = Math.ceil(this.#rootOrder.length / 32);
    for (let ordinal = 0; ordinal < this.#rootOrder.length; ordinal++) {
      const node = this.#rootOrder[ordinal]!;
      const bits = new Uint32Array(words);
      for (const parent of node.parents) {
        const inherited = this.#closures.get(refKey(parent.ref));
        if (inherited === undefined) fail("Causal parent closure is absent.");
        for (let word = 0; word < words; word++)
          bits[word] = bits[word]! | inherited.bits[word]!;
      }
      bits[ordinal >>> 5] = bits[ordinal >>> 5]! | (1 << (ordinal & 31));
      const closure = new RootClosure(bits, ordinalByKey, keysByOrdinal);
      this.#closures.set(refKey(node.entry.ref), closure);
      if (!closure.has(refKey(this.#genesis.ref)))
        fail("Causal root belongs to a foreign bootstrap lineage.");
    }
  }

  #validateCommandsInCausalOrder(
    sourceValidation: "incremental" | "reference",
  ): void {
    let summary: SourceSummary | undefined;
    for (const root of this.#rootOrder) {
      if (root.entry.record[3] !== "manifest") {
        summary = undefined;
        continue;
      }
      const body = tuple(root.entry.record[10], undefined, "Manifest body");
      if (body[0] === "genesis") {
        if (sourceValidation === "incremental")
          summary = this.#summarizeSources(root.entry);
        continue;
      }
      // Only a contiguous apply tail advances mutable source facts. A restore,
      // transition, join or branch switch first takes the unchanged reference
      // path. A supported fallback command seeds its own exact resulting root.
      const supported =
        sourceValidation === "incremental" &&
        body[0] === "apply" &&
        !tuple(body[5], undefined, "Command operation rows").some(
          (row) => tuple(row, 3, "Command operation row")[0] === "transition",
        ) &&
        !root.members.some((member) => member.record[3] === "transition-v1");
      const cached =
        supported && summary?.atRoot === refKey(root.parents[0]!.ref)
          ? summary
          : undefined;
      this.#validateCommandSources(root, cached);
      if (!supported) summary = undefined;
      else if (cached === undefined)
        summary = this.#summarizeSources(root.entry);
      else cached.atRoot = refKey(root.entry.ref);
    }
  }

  #summarizeSources(root: CanonicalRecordEntry): SourceSummary {
    const summary: SourceSummary = {
      atRoot: refKey(root.ref),
      maxima: new Map(),
      generations: new Set(),
      erased: new Map(),
    };
    for (const key of this.#closureKeys(root))
      this.#extendSourceSummary(summary, this.#entries.get(key)!);
    return summary;
  }

  #extendSourceSummary(
    summary: SourceSummary,
    entry: CanonicalRecordEntry,
  ): void {
    const record = entry.record;
    if (!(
      record[3] === "generation" ||
      record[3] === "run" ||
      record[3] === "erase"
    ))
      return;
    const key = sourceGenerationKey(record);
    const counter = BigInt(record[5]![0]);
    if (counter > (summary.maxima.get(key) ?? -1n))
      summary.maxima.set(key, counter);
    if (record[3] === "generation") summary.generations.add(key);
    if (record[3] !== "erase") return;
    const body = tuple(record[10], 1, "Erase body");
    for (const candidate of tuple(body[0], undefined, "Observed intervals")) {
      const interval = tuple(candidate, 3, "Observed interval");
      const runKey = refKeyValue(interval[0]);
      let erased = summary.erased.get(runKey);
      if (erased === undefined) {
        erased = new Set();
        summary.erased.set(runKey, erased);
      }
      const start = integer(interval[1], "Observed interval start");
      const end = integer(interval[2], "Observed interval end");
      for (let offset = start; offset < end; offset++) erased.add(offset);
    }
  }

  #validateCommandSources(root: RootNode, summary?: SourceSummary): void {
    const manifest = root.entry;
    const body = tuple(manifest.record[10], 8, "Command body");
    const baseRoot = root.parents[0]!;
    const baseClosure = this.#closureKeys(baseRoot);
    const rows = tuple(body[5], undefined, "Command operation rows");
    const priorByGeneration = new Map<string, CanonicalRecordEntry>();
    const maxima = new Map<string, bigint>();
    let commandReplica: string | undefined;

    for (const candidate of rows) {
      const row = tuple(candidate, 3, "Command operation row");
      for (const reference of tuple(row[2], undefined, "Operation members")) {
        const entry = this.#resolveExact(reference, this.#entries);
        const kind = entry.record[3];
        if (!(kind === "generation" || kind === "run" || kind === "erase"))
          continue;
        const generationKey = sourceGenerationKey(entry.record);
        const base = entry.record[6];
        if (base === null || refKey(base[0]) !== refKey(baseRoot.ref))
          fail(
            "Source record does not name the manifest's exact accepted base.",
          );
        const prior = priorByGeneration.get(generationKey);
        if (
          (prior === undefined && base[1] !== null) ||
          (prior !== undefined &&
            (base[1] === null || refKey(base[1]) !== refKey(prior.ref)))
        )
          fail("Source record predecessor is not the preceding batch member.");
        const clock = entry.record[5];
        if (clock === null) fail("Source record clock is missing.");
        if (commandReplica !== undefined && commandReplica !== clock[1])
          fail(
            "One command's source records use different replica identities.",
          );
        commandReplica = clock[1];
        let maximum = maxima.get(generationKey);
        if (maximum === undefined) {
          maximum =
            summary === undefined
              ? this.#maximumCounter(baseClosure, generationKey)
              : (summary.maxima.get(generationKey) ?? -1n);
        }
        const counter = BigInt(clock[0]);
        if (kind === "generation") {
          if (counter !== 0n || maximum !== -1n)
            fail("Generation zero does not start a fresh source chain.");
        } else if (counter !== maximum + 1n) {
          fail("Source counter is not exactly base maximum plus one.");
        }
        if (kind === "run")
          this.#validateRunAgainstAvailable(
            entry,
            baseClosure,
            priorByGeneration,
          );
        if (kind === "erase")
          this.#validateEraseAgainstAvailable(
            entry,
            baseClosure,
            priorByGeneration,
            summary,
          );
        // The summary is private to this entire validation attempt. A later
        // failure discards it with the candidate; it can never contaminate an
        // adopted protocol or a different exact-root fallback.
        if (summary !== undefined) this.#extendSourceSummary(summary, entry);
        maxima.set(generationKey, counter);
        priorByGeneration.set(generationKey, entry);
      }
    }
    this.#validateRetirements(root, baseClosure);
  }

  #validateRunAgainstAvailable(
    entry: CanonicalRecordEntry,
    baseClosure: SourceClosure,
    priorByGeneration: ReadonlyMap<string, CanonicalRecordEntry>,
  ): void {
    const body = tuple(entry.record[10], 3, "Run body");
    const ownSource = string(body[1], "Run source");
    if (ownSource.length === 0 || ownSource.length > this.#runSourceUnits)
      fail("Run source exceeds the bootstrap run-source setting.");
    if (body[0] === null) return;
    const anchor = tuple(body[0], 2, "Run anchor");
    const target = this.#resolveExact(anchor[0], this.#entries);
    if (target.record[3] !== "run") fail("Run anchor does not name a run.");
    if (
      sourceGenerationKey(target.record) !== sourceGenerationKey(entry.record)
    )
      fail("Run anchor crosses text generations.");
    if (!this.#sourceAvailable(target, baseClosure, priorByGeneration))
      fail("Run anchor is not available in the exact source base.");
    const source = string(
      tuple(target.record[10], 3, "Anchored run body")[1],
      "Run source",
    );
    const end = integer(anchor[1], "Run anchor offset");
    if (end <= 0 || end > source.length)
      fail("Run anchor is not a preceding source-unit boundary.");
  }

  #validateEraseAgainstAvailable(
    entry: CanonicalRecordEntry,
    baseClosure: SourceClosure,
    priorByGeneration: ReadonlyMap<string, CanonicalRecordEntry>,
    summary?: SourceSummary,
  ): void {
    const body = tuple(entry.record[10], 1, "Erase body");
    let visible: ReadonlySet<string> | undefined;
    if (summary === undefined) {
      const available = new Set(baseClosure);
      let prior = priorByGeneration.get(sourceGenerationKey(entry.record));
      while (prior !== undefined) {
        available.add(refKey(prior.ref));
        const previousRef = prior.record[6]?.[1];
        if (previousRef === null || previousRef === undefined) break;
        prior = this.#entries.get(refKey(previousRef));
      }
      const generation = [...available]
        .map((key) => this.#entries.get(key)!)
        .find(
          (candidate) =>
            candidate.record[3] === "generation" &&
            sourceGenerationKey(candidate.record) ===
              sourceGenerationKey(entry.record),
        );
      if (generation === undefined)
        fail("Observed intervals lack their generation source.");
      visible = new Set(
        this.#project(available, generation).units.map((unit) =>
          unitKey(refKey(unit.run), unit.offset),
        ),
      );
    } else if (!summary.generations.has(sourceGenerationKey(entry.record))) {
      fail("Observed intervals lack their generation source.");
    }
    // Every run was checked nonempty and rooted at start or an already
    // available same-generation run. Exact immutable identities and causal
    // source availability prove this graph is acyclic and connected, including
    // across joined closures. Ordering affects position, never visibility:
    // a reached source unit is visible exactly when no reached erase hides it.
    for (const candidate of tuple(body[0], undefined, "Observed intervals")) {
      const interval = tuple(candidate, 3, "Observed interval");
      const run = this.#resolveExact(interval[0], this.#entries);
      if (run.record[3] !== "run")
        fail("Observed interval does not name a run.");
      if (sourceGenerationKey(run.record) !== sourceGenerationKey(entry.record))
        fail("Observed interval crosses text generations.");
      if (!this.#sourceAvailable(run, baseClosure, priorByGeneration))
        fail("Observed interval is not available in the exact source base.");
      const source = string(
        tuple(run.record[10], 3, "Run body")[1],
        "Run source",
      );
      const start = integer(interval[1], "Observed interval start");
      const end = integer(interval[2], "Observed interval end");
      if (start < 0 || start >= end || end > source.length)
        fail("Observed interval is outside its exact run source.");
      for (let offset = start; offset < end; offset++)
        if (
          summary === undefined
            ? !visible!.has(unitKey(refKey(run.ref), offset))
            : summary.erased.get(refKey(run.ref))?.has(offset) === true
        )
          fail(
            "Observed interval contains source not visible in its exact base.",
          );
    }
  }

  #validateRetirements(root: RootNode, baseClosure: SourceClosure): void {
    if (!root.members.some((member) => member.record[3] === "retire")) return;
    const priorLive = new Set<string>();
    const priorRetired = new Set<string>();
    for (const key of baseClosure) {
      const candidate = this.#entries.get(key)!;
      if (candidate.record[3] === "live") priorLive.add(key);
      if (candidate.record[3] === "retire") {
        const body = tuple(candidate.record[10], 1, "Retire body");
        for (const reference of tuple(body[0], undefined, "Retire Refs"))
          priorRetired.add(refKeyValue(reference));
      }
    }
    for (const retired of priorRetired) priorLive.delete(retired);
    for (const member of root.members) {
      if (member.record[3] === "live") priorLive.add(refKey(member.ref));
      if (member.record[3] !== "retire") continue;
      const body = tuple(member.record[10], 1, "Retire body");
      for (const reference of tuple(body[0], undefined, "Retire Refs")) {
        const live = this.#resolveExact(reference, this.#entries);
        if (
          live.record[3] !== "live" ||
          live.record[4][0] !== member.record[4][0] ||
          live.record[4][1] !== member.record[4][1] ||
          !priorLive.delete(refKey(live.ref))
        )
          fail("Retirement does not name an observed live token in scope.");
      }
    }
  }

  #sourceAvailable(
    entry: CanonicalRecordEntry,
    baseClosure: SourceClosure,
    priorByGeneration: ReadonlyMap<string, CanonicalRecordEntry>,
  ): boolean {
    if (baseClosure.has(refKey(entry.ref))) return true;
    let prior = priorByGeneration.get(sourceGenerationKey(entry.record));
    while (prior !== undefined) {
      if (refKey(prior.ref) === refKey(entry.ref)) return true;
      const previousRef = prior.record[6]?.[1];
      if (previousRef === null || previousRef === undefined) break;
      prior = this.#entries.get(refKey(previousRef));
    }
    return false;
  }

  #maximumCounter(closure: SourceClosure, generationKey: string): bigint {
    let maximum = -1n;
    for (const key of closure) {
      const record = this.#entries.get(key)!.record;
      if (
        (record[3] === "generation" ||
          record[3] === "run" ||
          record[3] === "erase") &&
        sourceGenerationKey(record) === generationKey
      ) {
        const clock = record[5];
        if (clock !== null && BigInt(clock[0]) > maximum)
          maximum = BigInt(clock[0]);
      }
    }
    return maximum;
  }

  #project(
    closure: SourceClosure,
    generation: CanonicalRecordEntry,
  ): ImmutableRunGenerationProjectionV1 {
    const generationKey = sourceGenerationKey(generation.record);
    const runs: RunFact[] = [];
    const erases: EraseFact[] = [];
    let maximumCounter = 0n;
    for (const key of closure) {
      const entry = this.#entries.get(key)!;
      const record = entry.record;
      if (
        !(
          record[3] === "generation" ||
          record[3] === "run" ||
          record[3] === "erase"
        ) ||
        sourceGenerationKey(record) !== generationKey
      )
        continue;
      const clock = record[5]!;
      const counter = BigInt(clock[0]);
      if (counter > maximumCounter) maximumCounter = counter;
      if (record[3] === "run") {
        const body = tuple(record[10], 3, "Run body");
        const rawAnchor = body[0];
        const anchor =
          rawAnchor === null
            ? null
            : (() => {
                const value = tuple(rawAnchor, 2, "Run anchor");
                return pair(
                  recordRef(value[0], "Run anchor Ref"),
                  integer(value[1], "Run anchor offset"),
                );
              })();
        const rawOrigin = tuple(body[2], 2, "Run Origin");
        runs.push({
          entry,
          generationKey,
          counter,
          replica: clock[1],
          anchor,
          source: string(body[1], "Run source"),
          origin: Object.freeze([
            string(rawOrigin[0], "Origin kind"),
            string(rawOrigin[1], "Origin ID"),
          ]),
        });
      } else if (record[3] === "erase") {
        const body = tuple(record[10], 1, "Erase body");
        erases.push({
          entry,
          generationKey,
          intervals: tuple(body[0], undefined, "Observed intervals").map(
            (candidate) => {
              const interval = tuple(candidate, 3, "Observed interval");
              return Object.freeze([
                recordRef(interval[0], "Interval run Ref"),
                integer(interval[1], "Interval start"),
                integer(interval[2], "Interval end"),
              ]);
            },
          ),
        });
      }
    }
    const erased = new Set<string>();
    for (const erase of erases)
      for (const [run, start, end] of erase.intervals)
        for (let offset = start; offset < end; offset++)
          erased.add(unitKey(refKey(run), offset));

    const children = new Map<string, SourceUnit[]>();
    const addChild = (anchor: string, unit: SourceUnit): void => {
      const values = children.get(anchor) ?? [];
      values.push(unit);
      children.set(anchor, values);
    };
    for (const run of runs) {
      const firstAnchor =
        run.anchor === null
          ? "start"
          : unitKey(refKey(run.anchor[0]), run.anchor[1] - 1);
      addChild(firstAnchor, { run, offset: 0 });
      for (let offset = 1; offset < run.source.length; offset++)
        addChild(unitKey(refKey(run.entry.ref), offset - 1), { run, offset });
    }
    for (const values of children.values()) values.sort(compareUnitsByRank);
    const ordered: SourceUnit[] = [];
    const visited = new Set<string>();
    const pending: SourceUnit[] = [];
    const pushChildren = (anchor: string): void => {
      const values = children.get(anchor) ?? [];
      for (let index = values.length - 1; index >= 0; index--)
        pending.push(values[index]!);
    };
    pushChildren("start");
    while (pending.length > 0) {
      const unit = pending.pop()!;
      const key = unitKey(refKey(unit.run.entry.ref), unit.offset);
      if (visited.has(key)) fail("Source-unit graph contains a cycle.");
      visited.add(key);
      ordered.push(unit);
      pushChildren(key);
    }
    const totalUnits = runs.reduce((sum, run) => sum + run.source.length, 0);
    if (visited.size !== totalUnits)
      fail("Source-unit graph is disconnected from the generation start.");

    const sourceUnits: ImmutableRunSourceUnitV1[] = [];
    for (const unit of ordered) {
      const key = unitKey(refKey(unit.run.entry.ref), unit.offset);
      sourceUnits.push(
        Object.freeze({
          run: unit.run.entry.ref,
          offset: unit.offset,
          text: unit.run.source.slice(unit.offset, unit.offset + 1),
          origin: Object.freeze({
            kind: unit.run.origin[0],
            id: unit.run.origin[1],
          }),
          visible: !erased.has(key),
        }),
      );
    }
    const units = sourceUnits.filter((unit) => unit.visible);
    const spans: {
      text: string;
      origin: Readonly<{ kind: string; id: string }>;
    }[] = [];
    for (const unit of units) {
      const prior = spans.at(-1);
      if (
        prior !== undefined &&
        prior.origin.kind === unit.origin.kind &&
        prior.origin.id === unit.origin.id
      )
        prior.text += unit.text;
      else spans.push({ text: unit.text, origin: unit.origin });
    }
    return Object.freeze({
      generation: generation.ref,
      text: units.map((unit) => unit.text).join(""),
      units: Object.freeze(units),
      sourceUnits: Object.freeze(sourceUnits),
      runs: Object.freeze(
        runs
          .map((run): ImmutableRunReachedRunV1 =>
            Object.freeze({
              run: run.entry.ref,
              anchor:
                run.anchor === null
                  ? null
                  : Object.freeze({
                      run: run.anchor[0],
                      sourceEndOffset: run.anchor[1],
                    }),
              source: run.source,
              origin: Object.freeze({
                kind: run.origin[0],
                id: run.origin[1],
              }),
              counter: run.counter,
              replicaUuid: run.replica,
            }),
          )
          .sort((left, right) => compareRefs(left.run, right.run)),
      ),
      erasures: Object.freeze(
        erases
          .map((erase): ImmutableRunReachedEraseV1 => {
            const clock = erase.entry.record[5];
            if (clock === null) fail("Erase clock is missing.");
            return Object.freeze({
              erase: erase.entry.ref,
              intervals: Object.freeze(
                erase.intervals.map(([run, start, end]) =>
                  Object.freeze({ run, start, end }),
                ),
              ),
              counter: BigInt(clock[0]),
              replicaUuid: clock[1],
            });
          })
          .sort((left, right) => compareRefs(left.erase, right.erase)),
      ),
      spans: Object.freeze(
        spans.map((span) =>
          Object.freeze({ text: span.text, origin: span.origin }),
        ),
      ),
      maximumCounter,
    });
  }

  #closureKeys(root: CanonicalRecordEntry): SourceClosure {
    const cached = this.#closures.get(refKey(root.ref));
    if (cached === undefined) fail("Ref does not name a causal root.");
    return cached;
  }

  #resolveRoot(
    reference: unknown,
    entries: ReadonlyMap<string, CanonicalRecordEntry>,
  ): CanonicalRecordEntry {
    const entry = this.#resolveExact(reference, entries);
    if (!(entry.record[3] === "manifest" || entry.record[3] === "join"))
      fail("RootRef does not name a manifest or causal join.");
    return entry;
  }

  #resolveMember(
    reference: unknown,
    entries: ReadonlyMap<string, CanonicalRecordEntry>,
  ): CanonicalRecordEntry {
    const entry = this.#resolveExact(reference, entries);
    if (entry.record[3] === "manifest" || entry.record[3] === "join")
      fail("Command member Ref names a root record.");
    return entry;
  }

  #resolveExact(
    reference: unknown,
    entries: ReadonlyMap<string, CanonicalRecordEntry>,
  ): CanonicalRecordEntry {
    const entry = entries.get(refKeyValue(reference));
    if (entry === undefined)
      fail("Committed record Ref is missing or mismatched.");
    return entry;
  }
}

function sourceGenerationKey(record: CanonicalRecordV1): string {
  const scope = record[4];
  if (scope[0] !== "text") fail("Source record lacks a text scope.");
  return `${scope[1]}:${scope[2]}`;
}

function requiredEffect(record: CanonicalRecordV1): readonly [string, string] {
  const effect = record[7];
  if (effect === null) fail("Semantic manifest effect is missing.");
  return effect;
}

function compareUnitsByRank(left: SourceUnit, right: SourceUnit): number {
  if (left.run.counter !== right.run.counter)
    return left.run.counter > right.run.counter ? -1 : 1;
  const replica = compareStrings(right.run.replica, left.run.replica);
  if (replica !== 0) return replica;
  return compareStrings(right.run.entry.record[2], left.run.entry.record[2]);
}

function compareRefs(left: RecordRef, right: RecordRef): number {
  return compareStrings(left[0], right[0]) || compareStrings(left[1], right[1]);
}

function compareStrings(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function samePair(
  left: readonly [string, string] | null,
  right: readonly [string, string],
): boolean {
  return left !== null && left[0] === right[0] && left[1] === right[1];
}

function unitKey(runKey: string, offset: number): string {
  return `${runKey}@${offset}`;
}

function pair<First, Second>(
  first: First,
  second: Second,
): readonly [First, Second] {
  return Object.freeze([first, second]);
}

function refKey(reference: RecordRef): string {
  return `${reference[0]}:${reference[1]}`;
}

function refKeyValue(value: unknown): string {
  return refKey(recordRef(value, "Record Ref"));
}

function recordRef(value: unknown, label: string): RecordRef {
  const valueTuple = tuple(value, 2, label);
  return Object.freeze([
    string(valueTuple[0], `${label} UUID`),
    string(valueTuple[1], `${label} commitment`),
  ]);
}

function tuple(
  value: unknown,
  length: number | undefined,
  label: string,
): readonly unknown[] {
  if (
    !Array.isArray(value) ||
    (length !== undefined && value.length !== length)
  )
    fail(`${label} is invalid.`);
  return value;
}

function string(value: unknown, label: string): string {
  if (typeof value !== "string") fail(`${label} must be a string.`);
  return value;
}

function integer(value: unknown, label: string): number {
  if (
    typeof value !== "number" ||
    !Number.isSafeInteger(value) ||
    value < 0 ||
    Object.is(value, -0)
  )
    fail(`${label} must be a nonnegative safe integer.`);
  return value;
}

function fail(message: string): never {
  throw new TypeError(message);
}
