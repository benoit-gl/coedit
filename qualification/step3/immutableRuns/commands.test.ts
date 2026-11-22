import { describe, expect, it } from "vitest";

import {
  parseBlockId,
  parseInlineContentId,
} from "../../../src/domain/index.js";
import { encodeEffectContext } from "../integrated/effectContext.js";
import {
  commitRecordV1,
  type CanonicalRecordEntry,
  type CommandBody,
  type RecordBody,
  type RecordRef,
} from "./record.js";
import {
  prepareImmutableRunApplyCommandV1,
  validateImmutableRunCommandsV1,
  type ImmutableRunAuthoredOutputsV1,
  type ImmutableRunColdViewProviderV1,
  type ImmutableRunNativeDescriptorV1,
  type ImmutableRunNativeViewV1,
  type ImmutableRunUuidSourceV1,
  type PreparedImmutableRunCommandV1,
} from "./commands.js";
import type { ImmutableRunSourceIndex } from "./sourceIndex.js";

const uuid = (value: number): string =>
  `d4000000-0000-4000-8000-${value.toString(16).padStart(12, "0")}`;
const rootId = parseBlockId(uuid(1));
const textId = parseInlineContentId(uuid(2));
const opaqueId = parseInlineContentId(uuid(3));
const origin = { kind: "human", id: "author" } as const;
const automation = { kind: "automation", id: "tool" } as const;
const positionCodec = Object.freeze({
  encode(value: string): string {
    return value;
  },
  decode(value: string): string {
    return value;
  },
});

class Uuids implements ImmutableRunUuidSourceV1 {
  #next: number;
  public constructor(start: number) {
    this.#next = start;
  }
  public nextUuid(): string {
    return uuid(this.#next++);
  }
}

class View implements ImmutableRunNativeViewV1 {
  public readonly rootBlockId = rootId;
  public readonly owners = new Map<string, typeof rootId>();
  public readonly descriptors = new Map<
    string,
    ImmutableRunNativeDescriptorV1
  >();
  public readonly blocks = new Set<string>([rootId]);
  public readonly liveBlocks = new Set<string>([rootId]);
  public readonly inlineIds = new Set<string>();
  public readonly liveInlineIds = new Set<string>();
  public readonly tokens = new Map<string, readonly RecordRef[]>();
  public readonly effects = new Map<string, RecordRef>();

  public constructor(public readonly root: RecordRef) {}

  public hasBlockIdentity(id: string): boolean {
    return this.blocks.has(id);
  }
  public isBlockLive(id: typeof rootId): boolean {
    return this.liveBlocks.has(id);
  }
  public hasInlineIdentity(id: string): boolean {
    return this.inlineIds.has(id);
  }
  public isInlineLive(id: typeof textId): boolean {
    return this.liveInlineIds.has(id);
  }
  public ownerOf(id: typeof textId): typeof rootId | undefined {
    return this.owners.get(id);
  }
  public descriptorOf(
    id: typeof textId,
  ): ImmutableRunNativeDescriptorV1 | undefined {
    return this.descriptors.get(id);
  }
  public liveTokens(
    kind: "block" | "inline",
    id: typeof rootId | typeof textId,
  ): readonly RecordRef[] {
    return this.tokens.get(`${kind}:${id}`) ?? [];
  }
  public effectRoot(actorId: string, effectId: string): RecordRef | undefined {
    return this.effects.get(`${actorId}:${effectId}`);
  }
}

class Provider implements ImmutableRunColdViewProviderV1 {
  public readonly views = new Map<string, View>();
  public readonly bases = new Map<string, View>();
  public readonly outputs = new Map<string, ImmutableRunAuthoredOutputsV1>();

  public view(root: RecordRef): ImmutableRunNativeViewV1 {
    return this.views.get(refKey(root)) ?? fail("missing root view");
  }
  public authoredBase(manifest: RecordRef) {
    const view =
      this.bases.get(refKey(manifest)) ?? fail("missing authored base");
    return { semanticRoot: view.root, view };
  }
  public authoredOutputs(manifest: RecordRef): ImmutableRunAuthoredOutputsV1 {
    return this.outputs.get(refKey(manifest)) ?? fail("missing outputs");
  }
  public captureRoot(): RecordRef | undefined {
    return undefined;
  }
  public resolveReferent(): undefined {
    return undefined;
  }
}

function genesis(): CanonicalRecordEntry {
  const id = uuid(10);
  return commitRecordV1([
    "coedit-step3-record",
    1,
    id,
    "manifest",
    ["document"],
    null,
    null,
    ["bootstrap", "bootstrap"],
    id,
    null,
    [
      "genesis",
      rootId,
      ["settings", 1, 2],
      encodeEffectContext({ actorId: "bootstrap", effectId: "bootstrap" }),
    ],
  ]);
}

function state(
  view: View,
  sourceIndexes: ReadonlyMap<string, ImmutableRunSourceIndex> = new Map(),
) {
  return {
    view,
    replicaUuid: uuid(20),
    runSourceUnits: 2,
    sourceIndexes,
  };
}

function adoptIndexes(
  current: ReadonlyMap<string, ImmutableRunSourceIndex>,
  command: PreparedImmutableRunCommandV1,
): ReadonlyMap<string, ImmutableRunSourceIndex> {
  const next = new Map(current);
  for (const generation of command.cacheReplay.retiredGenerations)
    next.delete(generation);
  for (const [generation, index] of command.cacheReplay.indexUpdates)
    next.set(generation, index);
  return next;
}

function register(
  provider: Provider,
  command: PreparedImmutableRunCommandV1,
  base: View,
): void {
  provider.bases.set(refKey(command.manifest.ref), base);
  provider.outputs.set(refKey(command.manifest.ref), {
    structural: command.nativeDelta.structural,
    descriptors: command.nativeDelta.descriptors,
  });
}

function applyView(prior: View, command: PreparedImmutableRunCommandV1): View {
  const next = new View(command.manifest.ref);
  for (const value of prior.blocks) next.blocks.add(value);
  for (const value of prior.liveBlocks) next.liveBlocks.add(value);
  for (const value of prior.inlineIds) next.inlineIds.add(value);
  for (const value of prior.liveInlineIds) next.liveInlineIds.add(value);
  for (const [id, owner] of prior.owners) next.owners.set(id, owner);
  for (const [id, descriptor] of prior.descriptors)
    next.descriptors.set(id, descriptor);
  for (const output of command.nativeDelta.structural) {
    if (output[0] === "inline-create") {
      next.inlineIds.add(output[1]);
      next.liveInlineIds.add(output[1]);
      next.owners.set(output[1], parseBlockId(output[2]));
    } else if (output[0] === "placement") {
      next.blocks.add(output[1]);
      next.liveBlocks.add(output[1]);
    } else {
      next.liveBlocks.delete(output[1]);
    }
  }
  const effect = command.manifest.record[7]!;
  for (const output of command.nativeDelta.descriptors) {
    if (output[0] === "text")
      next.descriptors.set(output[1], {
        kind: "text",
        mediaType: output[2],
        generation: output[3],
        replacementEffectId: JSON.stringify(effect),
      });
    else
      next.descriptors.set(output[1], {
        kind: "opaque",
        mediaType: output[2],
        bytes: output[3],
        origin: { kind: output[4][0], id: output[4][1] },
        replacementEffectId: JSON.stringify(effect),
      });
  }
  next.effects.set(`${effect[0]}:${effect[1]}`, command.manifest.ref);
  return next;
}

describe("immutable-run command preparation and cold validation", () => {
  it("authors same-command ownership with chunked text and opaque initialization", () => {
    const bootstrap = genesis();
    const base = new View(bootstrap.ref);
    const command = prepareImmutableRunApplyCommandV1({
      state: state(base),
      context: { actorId: "alice", effectId: "create" },
      positionCodec,
      uuids: new Uuids(100),
      change: {
        inlineContents: [
          { inlineContentId: textId, blockId: rootId },
          { inlineContentId: opaqueId, blockId: rootId },
        ],
        payloads: [
          {
            kind: "replace-text",
            inlineContentId: textId,
            mediaType: "text/plain",
            text: "A😀BC",
            origin,
          },
          {
            kind: "replace-opaque",
            inlineContentId: opaqueId,
            mediaType: "application/octet-stream",
            bytes: Uint8Array.of(0, 255, 7),
            origin: automation,
          },
        ],
      },
    });

    expect(command.batchUuid).toBe(uuid(100));
    expect(command.manifest.record[2]).toBe(command.batchUuid);
    const body = command.manifest.record[10];
    expect(body[0]).toBe("apply");
    if (!isApplyBody(body)) throw new Error("unexpected manifest");
    const textRow = body[5].find(
      (row) => row[0] === "payload" && row[1] === 0,
    )!;
    const byRef = new Map(
      command.entries.map((entry) => [refKey(entry.ref), entry]),
    );
    const sources = textRow[2]
      .map((ref) => byRef.get(refKey(ref))!)
      .filter((entry) => entry.record[3] === "run")
      .map((entry) => {
        const value = entry.record[10];
        return value.length === 3 && typeof value[1] === "string"
          ? value[1]
          : undefined;
      });
    expect(sources).toEqual(["A", "😀", "BC"]);
    expect(body[7].map((output) => output[1])).toEqual([textId, opaqueId]);
    expect(command.cacheReplay.indexUpdates.size).toBe(1);

    const provider = new Provider();
    provider.views.set(refKey(bootstrap.ref), base);
    register(provider, command, base);
    expect(
      validateImmutableRunCommandsV1([bootstrap, ...command.entries], provider)
        .commandRoots,
    ).toEqual([command.manifest.ref]);
  });

  it("stages sequential insert/delete/no-op operations without changing the accepted index", () => {
    const bootstrap = genesis();
    const base = new View(bootstrap.ref);
    const created = prepareImmutableRunApplyCommandV1({
      state: state(base),
      context: { actorId: "alice", effectId: "initial" },
      positionCodec,
      uuids: new Uuids(200),
      change: {
        inlineContents: [{ inlineContentId: textId, blockId: rootId }],
        payloads: [
          {
            kind: "replace-text",
            inlineContentId: textId,
            mediaType: "text/plain",
            text: "abcd",
            origin,
          },
        ],
      },
    });
    created.cacheReplay.commit();
    const createdIndexes = adoptIndexes(new Map(), created);
    const current = applyView(base, created);
    const descriptorOutput = created.nativeDelta.descriptors[0];
    if (descriptorOutput?.[0] !== "text") throw new Error("missing generation");
    const generation = descriptorOutput[3];
    const acceptedIndex = createdIndexes.get(generation[0])!;
    const before = acceptedIndex.read(0, acceptedIndex.length);
    const guarded = nonEnumerableMap(
      new Map([...createdIndexes, [uuid(399), acceptedIndex] as const]),
    );

    const edited = prepareImmutableRunApplyCommandV1({
      state: state(current, guarded.map),
      context: { actorId: "alice", effectId: "edit" },
      positionCodec,
      uuids: new Uuids(300),
      change: {
        payloads: [
          {
            kind: "insert-text",
            inlineContentId: textId,
            offset: 1,
            text: "x😀y",
            origin: automation,
          },
          {
            kind: "delete-text",
            inlineContentId: textId,
            start: 0,
            end: 2,
          },
          {
            kind: "delete-text",
            inlineContentId: textId,
            start: 1,
            end: 1,
          },
        ],
      },
    });
    expect(guarded.lookups).toBe(1);
    expect(guarded.enumerations).toBe(0);
    expect(acceptedIndex.read(0, acceptedIndex.length)).toEqual(before);
    expect(edited.nativeDelta.descriptors).toEqual([]);
    const manifestBody = edited.manifest.record[10];
    if (!isApplyBody(manifestBody)) throw new Error("unexpected manifest");
    const rows = manifestBody[5].filter((row) => row[0] === "payload");
    expect(rows.map((row) => row[2].length)).toEqual([5, 3, 0]);
    edited.cacheReplay.commit();
    expect(
      acceptedIndex
        .read(0, acceptedIndex.length)
        .map((span) => span.text)
        .join(""),
    ).toBe("😀ybcd");

    const provider = new Provider();
    provider.views.set(refKey(bootstrap.ref), base);
    provider.views.set(refKey(created.manifest.ref), current);
    register(provider, created, base);
    register(provider, edited, current);
    expect(() =>
      validateImmutableRunCommandsV1(
        [bootstrap, ...created.entries, ...edited.entries],
        provider,
      ),
    ).not.toThrow();
  });

  it("refuses UTF-16 pair splitting and leaves the active index unchanged", () => {
    const bootstrap = genesis();
    const base = new View(bootstrap.ref);
    const created = prepareImmutableRunApplyCommandV1({
      state: state(base),
      context: { actorId: "alice", effectId: "initial-pair" },
      positionCodec,
      uuids: new Uuids(400),
      change: {
        inlineContents: [{ inlineContentId: textId, blockId: rootId }],
        payloads: [
          {
            kind: "replace-text",
            inlineContentId: textId,
            mediaType: "text/plain",
            text: "a😀b",
            origin,
          },
        ],
      },
    });
    created.cacheReplay.commit();
    const createdIndexes = adoptIndexes(new Map(), created);
    const current = applyView(base, created);
    const descriptor = current.descriptorOf(textId);
    if (descriptor?.kind !== "text") throw new Error("missing text descriptor");
    const index = createdIndexes.get(descriptor.generation[0])!;
    const before = index.read(0, index.length);
    expect(() =>
      prepareImmutableRunApplyCommandV1({
        state: state(current, createdIndexes),
        context: { actorId: "alice", effectId: "bad-boundary" },
        positionCodec,
        uuids: new Uuids(500),
        change: {
          payloads: [
            {
              kind: "insert-text",
              inlineContentId: textId,
              offset: 2,
              text: "x",
              origin,
            },
          ],
        },
      }),
    ).toThrow(/surrogate pair/u);
    expect(index.read(0, index.length)).toEqual(before);
    expect(() =>
      prepareImmutableRunApplyCommandV1({
        state: state(current, createdIndexes),
        context: { actorId: "alice", effectId: "bad-source" },
        positionCodec,
        uuids: new Uuids(600),
        change: {
          payloads: [
            {
              kind: "insert-text",
              inlineContentId: textId,
              offset: 0,
              text: "\ud800",
              origin,
            },
          ],
        },
      }),
    ).toThrow(/well-formed UTF-16/u);
    expect(index.read(0, index.length)).toEqual(before);
  });

  it("validates received deletion boundaries before replay without changing the accepted source", () => {
    const bootstrap = genesis();
    const base = new View(bootstrap.ref);
    const created = prepareImmutableRunApplyCommandV1({
      state: state(base),
      context: { actorId: "alice", effectId: "pair-source" },
      positionCodec,
      uuids: new Uuids(1_100),
      change: {
        inlineContents: [{ inlineContentId: textId, blockId: rootId }],
        payloads: [
          {
            kind: "replace-text",
            inlineContentId: textId,
            mediaType: "text/plain",
            text: "😀",
            origin,
          },
        ],
      },
    });
    created.cacheReplay.commit();
    const indexes = adoptIndexes(new Map(), created);
    const current = applyView(base, created);
    const descriptor = current.descriptorOf(textId);
    if (descriptor?.kind !== "text") throw new Error("missing pair source");
    const accepted = indexes.get(descriptor.generation[0])!;
    const before = accepted.read(0, accepted.length);
    const deletion = prepareImmutableRunApplyCommandV1({
      state: state(current, indexes),
      context: { actorId: "alice", effectId: "pair-delete" },
      positionCodec,
      uuids: new Uuids(1_200),
      change: {
        payloads: [
          { kind: "delete-text", inlineContentId: textId, start: 0, end: 2 },
        ],
      },
    });
    const validate = (candidate: ForgedCommand): void => {
      const provider = new Provider();
      provider.views.set(refKey(bootstrap.ref), base);
      provider.views.set(refKey(created.manifest.ref), current);
      register(provider, created, base);
      provider.bases.set(refKey(candidate.manifest.ref), current);
      provider.outputs.set(refKey(candidate.manifest.ref), {
        structural: deletion.nativeDelta.structural,
        descriptors: deletion.nativeDelta.descriptors,
      });
      validateImmutableRunCommandsV1(
        [bootstrap, ...created.entries, ...candidate.entries],
        provider,
      );
    };
    expect(() => validate(deletion)).not.toThrow();
    const evidence = deletion.entries.find(
      (entry) => entry.record[3] === "payload-effect-v2",
    )!;
    const erase = deletion.entries.find(
      (entry) => entry.record[3] === "erase",
    )!;
    const evidenceTuple: unknown[] = [...evidence.record];
    const evidenceBody = evidence.record[10];
    if (typeof evidenceBody[2] !== "string")
      throw new Error("missing encoded operations");
    evidenceTuple[10] = [
      evidenceBody[0],
      evidenceBody[1],
      evidenceBody[2].replace('"end":2', '"end":1'),
    ];
    const changedEvidence = commitRecordV1(evidenceTuple);
    const eraseTuple: unknown[] = [...erase.record];
    const sourceRun = created.entries.find(
      (entry) => entry.record[3] === "run",
    )!;
    eraseTuple[10] = [[[sourceRun.ref, 0, 1]]];
    const changedErase = commitRecordV1(eraseTuple);
    const partialPair = rebuild(
      deletion,
      new Map([
        [refKey(evidence.ref), changedEvidence],
        [refKey(erase.ref), changedErase],
      ]),
    );
    expect(() => validate(partialPair)).toThrow(/cannot preserve/);
    expect(accepted.read(0, accepted.length)).toEqual(before);

    const noOp = prepareImmutableRunApplyCommandV1({
      state: state(current, indexes),
      context: { actorId: "alice", effectId: "pair-no-op" },
      positionCodec,
      uuids: new Uuids(1_300),
      change: {
        payloads: [
          { kind: "delete-text", inlineContentId: textId, start: 1, end: 1 },
        ],
      },
    });
    expect(() => validate(noOp)).not.toThrow();
    const noOpEvidence = noOp.entries.find(
      (entry) => entry.record[3] === "payload-effect-v2",
    )!;
    const noOpBody = noOpEvidence.record[10];
    if (typeof noOpBody[2] !== "string")
      throw new Error("missing no-op operations");
    const outOfRangeTuple: unknown[] = [...noOpEvidence.record];
    outOfRangeTuple[10] = [
      noOpBody[0],
      noOpBody[1],
      noOpBody[2]
        .replace('"start":1', '"start":3')
        .replace('"end":1', '"end":3'),
    ];
    const outOfRange = commitRecordV1(outOfRangeTuple);
    const invalidNoOp = rebuild(
      noOp,
      new Map([[refKey(noOpEvidence.ref), outOfRange]]),
    );
    expect(() => validate(invalidNoOp)).toThrow(
      /outside the current native string/,
    );
    expect(accepted.read(0, accepted.length)).toEqual(before);
    // A failed receive must not corrupt the source used by a later valid replay.
    expect(() => validate(deletion)).not.toThrow();
    expect(accepted.read(0, accepted.length)).toEqual(before);
  });

  it("refuses effect reuse from cached native facts", () => {
    const bootstrap = genesis();
    const view = new View(bootstrap.ref);
    view.effects.set("alice:used", bootstrap.ref);
    expect(() =>
      prepareImmutableRunApplyCommandV1({
        state: state(view),
        context: { actorId: "alice", effectId: "used" },
        positionCodec,
        uuids: new Uuids(700),
        change: {},
      }),
    ).toThrow(/already authored/u);
  });

  it("cold validation rejects forged ownership, surplus liveness, source changes, and cancelling facts", () => {
    const bootstrap = genesis();
    const base = new View(bootstrap.ref);
    const command = prepareImmutableRunApplyCommandV1({
      state: state(base),
      context: { actorId: "mallory", effectId: "forgery-target" },
      positionCodec,
      uuids: new Uuids(800),
      change: {
        inlineContents: [{ inlineContentId: textId, blockId: rootId }],
        payloads: [
          {
            kind: "replace-text",
            inlineContentId: textId,
            mediaType: "text/plain",
            text: "x",
            origin,
          },
        ],
      },
    });
    const body = command.manifest.record[10];
    if (!isApplyBody(body)) throw new Error("unexpected manifest");
    const row = body[5].find(
      (candidate) => candidate[0] === "payload" && candidate[1] === 0,
    )!;
    const byRef = new Map(
      command.entries.map((entry) => [refKey(entry.ref), entry]),
    );
    const members = row[2].map((ref) => byRef.get(refKey(ref))!);
    const run = members.find((entry) => entry.record[3] === "run")!;
    const blockLive = members.find(
      (entry) => entry.record[3] === "live" && entry.record[4][0] === "block",
    )!;

    const changedRunTuple: unknown[] = [...run.record];
    const runBody = run.record[10];
    if (!Array.isArray(runBody) || runBody.length !== 3)
      throw new Error("missing run body");
    changedRunTuple[10] = [runBody[0], "y", runBody[2]];
    const changedRun = commitRecordV1(changedRunTuple);
    const sourceForgery = rebuild(
      command,
      new Map([[refKey(run.ref), changedRun]]),
    );
    expect(() =>
      validateForgery(bootstrap, base, command, sourceForgery),
    ).toThrow(/exact input text|concatenate/u);

    const wrongOwnerTuple: unknown[] = [...blockLive.record];
    wrongOwnerTuple[4] = ["block", uuid(999)];
    const wrongOwner = commitRecordV1(wrongOwnerTuple);
    const ownerForgery = rebuild(
      command,
      new Map([[refKey(blockLive.ref), wrongOwner]]),
    );
    expect(() =>
      validateForgery(bootstrap, base, command, ownerForgery),
    ).toThrow(/liveness|scoped/u);

    const effect = command.manifest.record[7]!;
    const extraLive = commitRecordV1([
      "coedit-step3-record",
      1,
      uuid(990),
      "live",
      ["inline", textId],
      null,
      null,
      effect,
      command.batchUuid,
      ["payload", 0, members.length],
      [],
    ]);
    const livenessForgery = rebuild(command, new Map(), [extraLive]);
    expect(() =>
      validateForgery(bootstrap, base, command, livenessForgery),
    ).toThrow(/extra or missing liveness/u);

    const scope = run.record[4];
    const extraRun = commitRecordV1([
      "coedit-step3-record",
      1,
      uuid(991),
      "run",
      scope,
      ["2", uuid(20)],
      [bootstrap.ref, run.ref],
      effect,
      command.batchUuid,
      ["payload", 0, members.length],
      [[run.ref, 1], "z", [origin.kind, origin.id]],
    ]);
    const cancellingErase = commitRecordV1([
      "coedit-step3-record",
      1,
      uuid(992),
      "erase",
      scope,
      ["3", uuid(20)],
      [bootstrap.ref, extraRun.ref],
      effect,
      command.batchUuid,
      ["payload", 0, members.length + 1],
      [[[extraRun.ref, 0, 1]]],
    ]);
    const cancellingForgery = rebuild(command, new Map(), [
      extraRun,
      cancellingErase,
    ]);
    expect(() =>
      validateForgery(bootstrap, base, command, cancellingForgery),
    ).toThrow(/non-run source output/u);
  });
});

function refKey(ref: RecordRef): string {
  return `${ref[0]}:${ref[1]}`;
}

function fail(message: string): never {
  throw new Error(message);
}

function isApplyBody(body: RecordBody): body is CommandBody {
  return body.length === 8 && body[0] === "apply";
}

interface ForgedCommand {
  readonly entries: readonly CanonicalRecordEntry[];
  readonly manifest: CanonicalRecordEntry;
}

function rebuild(
  command: PreparedImmutableRunCommandV1,
  replacements: ReadonlyMap<string, CanonicalRecordEntry>,
  extras: readonly CanonicalRecordEntry[] = [],
): ForgedCommand {
  const body = command.manifest.record[10];
  if (!isApplyBody(body)) throw new Error("unexpected manifest");
  const rows = body[5].map((row) => {
    const refs = row[2].map((ref) => replacements.get(refKey(ref))?.ref ?? ref);
    if (row[0] === "payload" && row[1] === 0)
      refs.push(...extras.map((entry) => entry.ref));
    return [row[0], row[1], refs];
  });
  const manifestTuple: unknown[] = [...command.manifest.record];
  manifestTuple[10] = [
    "apply",
    body[1],
    replacements.get(refKey(body[2]))?.ref ?? body[2],
    replacements.get(refKey(body[3]))?.ref ?? body[3],
    body[4] === null
      ? null
      : (replacements.get(refKey(body[4]))?.ref ?? body[4]),
    rows,
    body[6],
    body[7],
  ];
  const manifest = commitRecordV1(manifestTuple);
  const entries = command.entries
    .filter(
      (entry) =>
        entry !== command.manifest && !replacements.has(refKey(entry.ref)),
    )
    .map((entry) => replacements.get(refKey(entry.ref)) ?? entry);
  entries.push(...replacements.values(), ...extras, manifest);
  return { entries, manifest };
}

function validateForgery(
  bootstrap: CanonicalRecordEntry,
  base: View,
  original: PreparedImmutableRunCommandV1,
  forged: ForgedCommand,
): void {
  const provider = new Provider();
  provider.views.set(refKey(bootstrap.ref), base);
  provider.bases.set(refKey(forged.manifest.ref), base);
  provider.outputs.set(refKey(forged.manifest.ref), {
    structural: original.nativeDelta.structural,
    descriptors: original.nativeDelta.descriptors,
  });
  validateImmutableRunCommandsV1([bootstrap, ...forged.entries], provider);
}

function nonEnumerableMap(
  source: ReadonlyMap<string, ImmutableRunSourceIndex>,
): {
  readonly map: ReadonlyMap<string, ImmutableRunSourceIndex>;
  readonly lookups: number;
  readonly enumerations: number;
} {
  let lookups = 0;
  let enumerations = 0;
  const refuse = (): never => {
    enumerations += 1;
    throw new Error("warm source-index map was enumerated");
  };
  const map: ReadonlyMap<string, ImmutableRunSourceIndex> = {
    get size() {
      return source.size;
    },
    get(key) {
      lookups += 1;
      return source.get(key);
    },
    has(key) {
      return source.has(key);
    },
    entries: refuse,
    keys: refuse,
    values: refuse,
    forEach: refuse,
    [Symbol.iterator]: refuse,
  };
  return {
    map,
    get lookups() {
      return lookups;
    },
    get enumerations() {
      return enumerations;
    },
  };
}
