import { describe, expect, it } from "vitest";

import { encodeEffectContext } from "../integrated/effectContext.js";
import { encodeAppliedEffectEnvelope } from "../integrated/effectEnvelope.js";
import {
  commitRecordV1,
  type CanonicalRecordEntry,
  type RecordRef,
} from "./record.js";
import { ImmutableRunProtocolV1 } from "./protocol.js";

const uuid = (value: number): string =>
  `a0000000-0000-4000-8000-${value.toString(16).padStart(12, "0")}`;
const origin = ["human", "author"] as const;
const documentScope = ["document"] as const;

interface FixtureCommand {
  readonly entries: readonly CanonicalRecordEntry[];
  readonly root: RecordRef;
  readonly members: readonly CanonicalRecordEntry[];
}

interface MemberInput {
  readonly id: number;
  readonly kind: "generation" | "run" | "erase" | "live" | "retire";
  readonly scope: unknown;
  readonly clock: unknown;
  readonly base: unknown;
  readonly body: unknown;
}

function genesis(runSourceUnits = 256): CanonicalRecordEntry {
  const id = uuid(1);
  const context = encodeEffectContext({
    actorId: "bootstrap",
    effectId: "bootstrap",
  });
  return commitRecordV1([
    "coedit-step3-record",
    1,
    id,
    "manifest",
    documentScope,
    null,
    null,
    ["bootstrap", "bootstrap"],
    id,
    null,
    ["genesis", uuid(2), ["settings", 1, runSourceUnits], context],
  ]);
}

function command(
  acceptedBase: RecordRef,
  batchNumber: number,
  inputs: readonly MemberInput[],
  effectId = `effect-${batchNumber}`,
): FixtureCommand {
  const batch = uuid(batchNumber);
  const effect = ["actor", effectId] as const;
  const context = commitRecordV1([
    "coedit-step3-record",
    1,
    uuid(batchNumber + 10_000),
    "context",
    documentScope,
    null,
    null,
    effect,
    batch,
    ["context", 0, 0],
    [encodeEffectContext({ actorId: effect[0], effectId: effect[1] })],
  ]);
  const envelope = commitRecordV1([
    "coedit-step3-record",
    1,
    uuid(batchNumber + 20_000),
    "envelope",
    documentScope,
    null,
    null,
    effect,
    batch,
    ["envelope", 0, 0],
    ["apply", encodeAppliedEffectEnvelope(batch, [], [], [], undefined)],
  ]);
  const members = inputs.map((input, index) =>
    commitRecordV1([
      "coedit-step3-record",
      1,
      uuid(input.id),
      input.kind,
      input.scope,
      input.clock,
      input.base,
      effect,
      batch,
      ["payload", 0, index],
      input.body,
    ]),
  );
  const manifest = commitRecordV1([
    "coedit-step3-record",
    1,
    batch,
    "manifest",
    documentScope,
    null,
    null,
    effect,
    batch,
    null,
    [
      "apply",
      acceptedBase,
      context.ref,
      envelope.ref,
      null,
      [["payload", 0, members.map((entry) => entry.ref)]],
      [],
      [],
    ],
  ]);
  return {
    entries: [context, envelope, ...members, manifest],
    root: manifest.ref,
    members,
  };
}

function join(id: number, inputs: readonly RecordRef[]): CanonicalRecordEntry {
  return commitRecordV1([
    "coedit-step3-record",
    1,
    uuid(id),
    "join",
    documentScope,
    null,
    null,
    null,
    null,
    null,
    [[...inputs].sort(compareRefs)],
  ]);
}

function compareRefs(left: RecordRef, right: RecordRef): number {
  return left[0].localeCompare(right[0]) || left[1].localeCompare(right[1]);
}

function baseTextFixture() {
  const bootstrap = genesis();
  const inline = uuid(40);
  const generation = uuid(41);
  const replica = uuid(42);
  const initial = command(bootstrap.ref, 100, [
    {
      id: 41,
      kind: "generation",
      scope: ["text", inline, generation],
      clock: ["0", replica],
      base: [bootstrap.ref, null],
      body: ["text/plain"],
    },
    {
      id: 43,
      kind: "run",
      scope: ["text", inline, generation],
      clock: ["1", replica],
      base: [bootstrap.ref, null],
      body: [null, "ab", origin],
    },
  ]);
  // Repair the source predecessor to the exact preceding generation member.
  const repaired = command(bootstrap.ref, 100, [
    {
      id: 41,
      kind: "generation",
      scope: ["text", inline, generation],
      clock: ["0", replica],
      base: [bootstrap.ref, null],
      body: ["text/plain"],
    },
    {
      id: 43,
      kind: "run",
      scope: ["text", inline, generation],
      clock: ["1", replica],
      base: [bootstrap.ref, initial.members[0]!.ref],
      body: [null, "ab", origin],
    },
  ]);
  return {
    bootstrap,
    initial: repaired,
    inline,
    generation: repaired.members[0]!.ref,
    initialRun: repaired.members[1]!.ref,
  };
}

describe("immutable-run cold reference protocol", () => {
  it("projects a deep 12,000-unit source chain without recursive stack growth", () => {
    const source = "a".repeat(12_000);
    const bootstrap = genesis(source.length);
    const scope = ["text", uuid(40), uuid(41)] as const;
    const generation: MemberInput = {
      id: 41,
      kind: "generation",
      scope,
      clock: ["0", uuid(42)],
      base: [bootstrap.ref, null],
      body: ["text/plain"],
    };
    const first = command(bootstrap.ref, 100, [generation]);
    const authored = command(bootstrap.ref, 100, [
      generation,
      {
        id: 43,
        kind: "run",
        scope,
        clock: ["1", uuid(42)],
        base: [bootstrap.ref, first.members[0]!.ref],
        body: [null, source, origin],
      },
    ]);
    const model = ImmutableRunProtocolV1.validate([
      bootstrap,
      ...authored.entries,
    ]);
    const projection = model.projectGeneration(
      authored.root,
      authored.members[0]!.ref,
    );
    expect(projection.text).toBe(source);
    expect(projection.sourceUnits).toHaveLength(source.length);
    expect(projection.maximumCounter).toBe(1n);
  });

  it("keeps exact closure membership through a deep causal chain and joins", () => {
    const bootstrap = genesis();
    let root = bootstrap.ref;
    const entries: CanonicalRecordEntry[] = [bootstrap];
    for (let index = 0; index < 1_024; index++) {
      const authored = command(root, 12_000 + index, []);
      entries.push(...authored.entries);
      root = authored.root;
    }
    const branch = command(bootstrap.ref, 200_000, []);
    const joined = join(300_000, [root, branch.root]);
    entries.push(...branch.entries, joined);
    const model = ImmutableRunProtocolV1.validate([...entries].reverse());
    expect(model.closure(bootstrap.ref)).toEqual([bootstrap]);
    expect(model.closure(root)).toHaveLength(1 + 1_024 * 3);
    expect(model.closure(branch.root)).toHaveLength(4);
    expect(model.closure(joined.ref)).toHaveLength(entries.length);
    expect(model.maximalRoots).toEqual([joined.ref]);
  });
  it("projects deterministic two- and three-way insertion/delete joins in every delivery order", () => {
    const fixture = baseTextFixture();
    const scope = ["text", fixture.inline, fixture.generation[0]] as const;
    const left = command(fixture.initial.root, 200, [
      {
        id: 201,
        kind: "run",
        scope,
        clock: ["2", uuid(901)],
        base: [fixture.initial.root, null],
        body: [[fixture.initialRun, 1], "L", ["human", "left"]],
      },
    ]);
    const right = command(fixture.initial.root, 300, [
      {
        id: 301,
        kind: "run",
        scope,
        clock: ["2", uuid(902)],
        base: [fixture.initial.root, null],
        body: [[fixture.initialRun, 1], "R", ["human", "right"]],
      },
    ]);
    const deletion = command(fixture.initial.root, 400, [
      {
        id: 401,
        kind: "erase",
        scope,
        clock: ["2", uuid(903)],
        base: [fixture.initial.root, null],
        body: [[[fixture.initialRun, 1, 2]]],
      },
    ]);
    const merged = join(500, [left.root, right.root, deletion.root]);
    const entries = [
      fixture.bootstrap,
      ...fixture.initial.entries,
      ...left.entries,
      ...right.entries,
      ...deletion.entries,
      merged,
    ];
    const expected = "aRL";
    for (const order of [entries, [...entries].reverse(), rotate(entries)]) {
      const model = ImmutableRunProtocolV1.validate(order);
      const projection = model.projectGeneration(
        merged.ref,
        fixture.generation,
      );
      expect(projection.text).toBe(expected);
      expect(
        projection.spans.map((span) => [span.text, span.origin.id]),
      ).toEqual([
        ["a", "author"],
        ["R", "right"],
        ["L", "left"],
      ]);
      expect(
        projection.sourceUnits.map((unit) => [unit.text, unit.visible]),
      ).toEqual([
        ["a", true],
        ["R", true],
        ["L", true],
        ["b", false],
      ]);
      expect(projection.runs.map((run) => run.source).sort()).toEqual([
        "L",
        "R",
        "ab",
      ]);
      expect(projection.erasures).toHaveLength(1);
      expect(projection.maximumCounter).toBe(2n);
      expect(model.maximalRoots).toEqual([merged.ref]);
    }
  });

  it("keeps unseen concurrent inserts and descendants of erased old anchors visible", () => {
    const fixture = baseTextFixture();
    const scope = ["text", fixture.inline, fixture.generation[0]] as const;
    const erase = command(fixture.initial.root, 600, [
      {
        id: 601,
        kind: "erase",
        scope,
        clock: ["2", uuid(910)],
        base: [fixture.initial.root, null],
        body: [[[fixture.initialRun, 1, 2]]],
      },
    ]);
    const afterOldB = command(fixture.initial.root, 700, [
      {
        id: 701,
        kind: "run",
        scope,
        clock: ["2", uuid(911)],
        base: [fixture.initial.root, null],
        body: [[fixture.initialRun, 2], "!", origin],
      },
    ]);
    const merged = join(800, [erase.root, afterOldB.root]);
    const model = ImmutableRunProtocolV1.validate([
      fixture.bootstrap,
      ...fixture.initial.entries,
      ...erase.entries,
      ...afterOldB.entries,
      merged,
    ]);
    expect(model.projectGeneration(merged.ref, fixture.generation).text).toBe(
      "a!",
    );
  });

  it("preserves unseen liveness additions when an observed token is retired", () => {
    const bootstrap = genesis();
    const block = uuid(55);
    const initial = command(bootstrap.ref, 900, [
      {
        id: 901,
        kind: "live",
        scope: ["block", block],
        clock: null,
        base: null,
        body: [],
      },
    ]);
    const retire = command(initial.root, 1_000, [
      {
        id: 1_001,
        kind: "retire",
        scope: ["block", block],
        clock: null,
        base: null,
        body: [[initial.members[0]!.ref]],
      },
    ]);
    const concurrent = command(initial.root, 1_100, [
      {
        id: 1_101,
        kind: "live",
        scope: ["block", block],
        clock: null,
        base: null,
        body: [],
      },
    ]);
    const merged = join(1_200, [retire.root, concurrent.root]);
    const entries = [
      bootstrap,
      ...initial.entries,
      ...retire.entries,
      ...concurrent.entries,
      merged,
    ];
    const model = ImmutableRunProtocolV1.validate(entries);
    expect(model.isEntityLive(retire.root, "block", block)).toBe(false);
    expect(model.isEntityLive(merged.ref, "block", block)).toBe(true);
    expect(() =>
      ImmutableRunProtocolV1.validate([...entries, ...entries]),
    ).not.toThrow();
  });

  it("rejects missing commitments, surplus members, effect reuse, bad chains, counters, anchors and intervals", () => {
    const fixture = baseTextFixture();
    const validEntries = [fixture.bootstrap, ...fixture.initial.entries];
    expect(() =>
      ImmutableRunProtocolV1.validate(
        validEntries.filter(
          (entry) => entry.record[2] !== fixture.initialRun[0],
        ),
      ),
    ).toThrow(/missing/iu);
    expect(() =>
      ImmutableRunProtocolV1.validate(validEntries.slice(0, -2)),
    ).toThrow(/missing|contained/iu);

    const surplus = commitRecordV1([
      "coedit-step3-record",
      1,
      uuid(1_300),
      "live",
      ["block", uuid(55)],
      null,
      null,
      ["actor", "surplus"],
      uuid(1_301),
      ["payload", 0, 0],
      [],
    ]);
    expect(() =>
      ImmutableRunProtocolV1.validate([...validEntries, surplus]),
    ).toThrow(/contained/iu);

    const repeatedEffect = command(
      fixture.bootstrap.ref,
      1_400,
      [],
      "effect-100",
    );
    expect(() =>
      ImmutableRunProtocolV1.validate([
        ...validEntries,
        ...repeatedEffect.entries,
      ]),
    ).toThrow(/effect identity/iu);

    const scope = ["text", fixture.inline, fixture.generation[0]] as const;
    const badCounter = command(fixture.initial.root, 1_500, [
      {
        id: 1_501,
        kind: "run",
        scope,
        clock: ["4", uuid(920)],
        base: [fixture.initial.root, null],
        body: [[fixture.initialRun, 1], "x", origin],
      },
    ]);
    expect(() =>
      ImmutableRunProtocolV1.validate([...validEntries, ...badCounter.entries]),
    ).toThrow(/maximum plus one/iu);

    const badAnchor = command(fixture.initial.root, 1_600, [
      {
        id: 1_601,
        kind: "run",
        scope,
        clock: ["2", uuid(921)],
        base: [fixture.initial.root, null],
        body: [[fixture.initialRun, 3], "x", origin],
      },
    ]);
    expect(() =>
      ImmutableRunProtocolV1.validate([...validEntries, ...badAnchor.entries]),
    ).toThrow(/preceding source-unit boundary/iu);

    const badInterval = command(fixture.initial.root, 1_700, [
      {
        id: 1_701,
        kind: "erase",
        scope,
        clock: ["2", uuid(922)],
        base: [fixture.initial.root, null],
        body: [[[fixture.initialRun, 1, 3]]],
      },
    ]);
    expect(() =>
      ImmutableRunProtocolV1.validate([
        ...validEntries,
        ...badInterval.entries,
      ]),
    ).toThrow(/outside/iu);

    const badChain = command(fixture.initial.root, 1_800, [
      {
        id: 1_801,
        kind: "run",
        scope,
        clock: ["2", uuid(923)],
        base: [fixture.initial.root, null],
        body: [[fixture.initialRun, 1], "x", origin],
      },
      {
        id: 1_802,
        kind: "run",
        scope,
        clock: ["3", uuid(923)],
        base: [fixture.initial.root, null],
        body: [[fixture.initialRun, 1], "y", origin],
      },
    ]);
    expect(() =>
      ImmutableRunProtocolV1.validate([...validEntries, ...badChain.entries]),
    ).toThrow(/predecessor/iu);

    const equivocation = commitRecordV1([
      "coedit-step3-record",
      1,
      fixture.bootstrap.record[2],
      "manifest",
      documentScope,
      null,
      null,
      ["other", "bootstrap"],
      fixture.bootstrap.record[2],
      null,
      [
        "genesis",
        uuid(2),
        ["settings", 1, 256],
        encodeEffectContext({ actorId: "other", effectId: "bootstrap" }),
      ],
    ]);
    expect(() =>
      ImmutableRunProtocolV1.validate([...validEntries, equivocation]),
    ).toThrow(/equivocation/iu);
  });
});

function rotate<T>(values: readonly T[]): readonly T[] {
  const middle = Math.floor(values.length / 2);
  return [...values.slice(middle), ...values.slice(0, middle)];
}
