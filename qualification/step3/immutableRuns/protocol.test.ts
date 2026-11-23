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
  commandKind: "apply" | "restore" = "apply",
  category: "payload" | "restore" | "transition" = commandKind === "restore"
    ? "restore"
    : "payload",
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
    [
      commandKind,
      commandKind === "apply"
        ? encodeAppliedEffectEnvelope(batch, [], [], [], undefined)
        : JSON.stringify({
            kind: "restore",
            authoringNonce: batch,
            target: JSON.stringify({
              rootId: uuid(2),
              blockLiveness: [],
              placements: [],
              inlineContentOwners: [],
              payloads: [],
            }),
          }),
    ],
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
      [category, 0, index],
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
      commandKind,
      acceptedBase,
      context.ref,
      envelope.ref,
      null,
      [[category, 0, members.map((entry) => entry.ref)]],
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

// Build exact same-generation predecessor refs while allowing interleaved
// generations. Recommitting prefixes preserves each earlier member's ordinal.
function sourceCommand(
  root: RecordRef,
  batch: number,
  inputs: readonly MemberInput[],
): FixtureCommand {
  const preceding = new Map<string, RecordRef>();
  const prepared: MemberInput[] = [];
  for (const input of inputs) {
    const key = JSON.stringify(input.scope);
    prepared.push({ ...input, base: [root, preceding.get(key) ?? null] });
    const prefix = command(root, batch, prepared);
    preceding.set(key, prefix.members.at(-1)!.ref);
  }
  return command(root, batch, prepared);
}

function expectEquivalent(
  entries: readonly CanonicalRecordEntry[],
  roots: readonly RecordRef[],
  generations: readonly RecordRef[],
): void {
  const cached = ImmutableRunProtocolV1.validate(entries);
  const reference = ImmutableRunProtocolV1.validateReference(entries);
  expect(cached.maximalRoots).toEqual(reference.maximalRoots);
  for (const root of roots) {
    expect(cached.closure(root)).toEqual(reference.closure(root));
    const reached = reference.closure(root);
    for (const generation of generations)
      if (reached.some((entry) => compareRefs(entry.ref, generation) === 0))
        expect(cached.projectGeneration(root, generation)).toEqual(
          reference.projectGeneration(root, generation),
        );
  }
}

function expectSameRejection(
  entries: readonly CanonicalRecordEntry[],
  expected?: RegExp,
): void {
  const error = (validate: typeof ImmutableRunProtocolV1.validate): string => {
    try {
      validate(entries);
    } catch (caught) {
      expect(caught).toBeInstanceOf(TypeError);
      return (caught as TypeError).message;
    }
    throw new Error("Expected malformed source fixture to reject.");
  };
  const cachedError = error((input) => ImmutableRunProtocolV1.validate(input));
  expect(cachedError).toBe(
    error((input) => ImmutableRunProtocolV1.validateReference(input)),
  );
  if (expected !== undefined) expect(cachedError).toMatch(expected);
}

function randomSequence(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (Math.imul(state, 1_664_525) + 1_013_904_223) >>> 0;
    return state / 2 ** 32;
  };
}

describe("immutable-run cold reference protocol", () => {
  it.each([7, 91, 2026])(
    "matches reference validation and complete projections on mixed source history seed %i",
    // Revalidating every hostile prefix with the deliberately unoptimized
    // reference algorithm is qualification work, not a latency assertion.
    { timeout: 30_000 },
    (seed) => {
      const random = randomSequence(seed);
      const fixture = baseTextFixture();
      const entries = [fixture.bootstrap, ...fixture.initial.entries];
      const replacement = sourceCommand(fixture.initial.root, 50_000, [
        {
          id: 600_000,
          kind: "generation",
          scope: ["text", fixture.inline, uuid(600_000)],
          clock: ["0", uuid(42)],
          base: null,
          body: ["text/plain"],
        },
      ]);
      entries.push(...replacement.entries);
      const generations = [fixture.generation, replacement.members[0]!.ref];
      const roots = [replacement.root];
      let root = replacement.root;
      for (let index = 0; index < 32; index++) {
        // Deliberately switch exact roots, not just source text or generation.
        if (index % 7 === 6) root = roots[Math.floor(random() * roots.length)]!;
        const reference = ImmutableRunProtocolV1.validateReference(entries);
        const inputs: MemberInput[] = [];
        for (const generation of generations) {
          const projection = reference.projectGeneration(root, generation);
          const counter = projection.maximumCounter + 1n;
          const scope = ["text", fixture.inline, generation[0]];
          const id = 700_000 + index * 10 + inputs.length;
          if (projection.units.length > 0 && random() < 0.55) {
            const unit =
              projection.units[Math.floor(random() * projection.units.length)]!;
            inputs.push({
              id,
              kind: "erase",
              scope,
              clock: [counter.toString(), uuid(42)],
              base: null,
              body: [[[unit.run, unit.offset, unit.offset + 1]]],
            });
          } else {
            const anchor =
              projection.sourceUnits.length === 0 || random() < 0.25
                ? null
                : (() => {
                    const unit =
                      projection.sourceUnits[
                        Math.floor(random() * projection.sourceUnits.length)
                      ]!;
                    return [unit.run, unit.offset + 1];
                  })();
            inputs.push({
              id,
              kind: "run",
              scope,
              clock: [counter.toString(), uuid(42)],
              base: null,
              body: [
                anchor,
                ["x", "😀", "é", "\ud800"][Math.floor(random() * 4)],
                ["human", `seed-${seed}`],
              ],
            });
          }
        }
        const authored = sourceCommand(root, 51_000 + index, inputs);
        entries.push(...authored.entries);
        root = authored.root;
        roots.push(root);
        if (index % 8 === 7) {
          const joined = join(90_000 + index, [root, roots[roots.length - 3]!]);
          entries.push(joined);
          root = joined.ref;
          roots.push(root);
        }
        // Invalid exact counters include arbitrary precision values; never
        // round clocks through Number, even when the valid fixture is small.
        const malformed = command(root, 100_000 + index, [
          {
            id: 1_100_000 + index,
            kind: "run",
            scope: ["text", fixture.inline, fixture.generation[0]],
            clock: [(2n ** 70n + BigInt(index)).toString(), uuid(42)],
            base: [root, null],
            body: [null, "bad", origin],
          },
        ]);
        expectSameRejection(
          [...entries, ...malformed.entries],
          /maximum plus one/u,
        );
        const nextCounter =
          ImmutableRunProtocolV1.validateReference(entries).projectGeneration(
            root,
            fixture.generation,
          ).maximumCounter + 1n;
        const invalidReference = command(root, 120_000 + index, [
          {
            id: 1_200_000 + index,
            kind: index % 2 === 0 ? "run" : "erase",
            scope: ["text", fixture.inline, fixture.generation[0]],
            clock: [nextCounter.toString(), uuid(42)],
            base: [root, null],
            body:
              index % 2 === 0
                ? [[[fixture.initialRun[0], "0".repeat(64)], 1], "bad", origin]
                : [[[fixture.initialRun, 0, 3]]],
          },
        ]);
        for (const order of [entries, [...entries].reverse()])
          expectSameRejection(
            [...order, ...invalidReference.entries],
            index % 2 === 0 ? /missing or mismatched/u : /outside/u,
          );
      }
      for (const order of [entries, [...entries].reverse(), rotate(entries)])
        expectEquivalent(order, roots, generations);
    },
  );

  it("preserves missing-generation and unavailable or cross-generation reference rejection", () => {
    const bootstrap = genesis();
    const scope = ["text", uuid(40), uuid(41)];
    const orphan = sourceCommand(bootstrap.ref, 240_000, [
      {
        id: 240_001,
        kind: "run",
        scope,
        clock: ["1", uuid(42)],
        base: null,
        body: [null, "source", origin],
      },
    ]);
    // With no generation zero, the first run cannot use a positive counter.
    // Preserve that rejection rather than synthesizing a generation in cache.
    expectSameRejection([bootstrap, ...orphan.entries], /maximum plus one/u);
    const noGeneration = sourceCommand(orphan.root, 241_000, [
      {
        id: 241_001,
        kind: "erase",
        scope,
        clock: ["2", uuid(42)],
        base: null,
        body: [[[orphan.members[0]!.ref, 0, 1]]],
      },
    ]);
    expectSameRejection(
      [bootstrap, ...orphan.entries, ...noGeneration.entries],
      /maximum plus one/u,
    );

    const fixture = baseTextFixture();
    const sibling = sourceCommand(fixture.initial.root, 242_000, [
      {
        id: 242_001,
        kind: "run",
        scope,
        clock: ["2", uuid(42)],
        base: null,
        body: [null, "sibling", origin],
      },
    ]);
    const foreign = sourceCommand(fixture.initial.root, 245_000, [
      {
        id: 245_001,
        kind: "generation",
        scope: ["text", fixture.inline, uuid(245_001)],
        clock: ["0", uuid(42)],
        base: null,
        body: ["text/plain"],
      },
    ]);
    const entries = [
      fixture.bootstrap,
      ...fixture.initial.entries,
      ...sibling.entries,
      ...foreign.entries,
    ];
    for (const kind of ["run", "erase"] as const) {
      const unseen = sourceCommand(fixture.initial.root, 243_000, [
        {
          id: 243_001,
          kind,
          scope,
          clock: ["2", uuid(42)],
          base: null,
          body:
            kind === "run"
              ? [[sibling.members[0]!.ref, 1], "x", origin]
              : [[[sibling.members[0]!.ref, 0, 1]]],
        },
      ]);
      expectSameRejection([...entries, ...unseen.entries], /not available/u);
      const cross = sourceCommand(foreign.root, 244_000, [
        {
          id: 244_001,
          kind,
          scope: ["text", fixture.inline, uuid(245_001)],
          clock: ["1", uuid(42)],
          base: null,
          body:
            kind === "run"
              ? [[fixture.initialRun, 1], "x", origin]
              : [[[fixture.initialRun, 0, 1]]],
        },
      ]);
      expectSameRejection(
        [...entries, ...cross.entries],
        /crosses text generations/u,
      );
    }
  });

  it("keeps same-batch visibility, per-generation predecessors and UTF-16 boundaries identical", () => {
    const fixture = baseTextFixture();
    const scope = ["text", fixture.inline, fixture.generation[0]];
    const runInput: MemberInput = {
      id: 210_001,
      kind: "run",
      scope,
      clock: ["2", uuid(42)],
      base: null,
      body: [[fixture.initialRun, 1], "😀xyz", origin],
    };
    const first = sourceCommand(fixture.initial.root, 210_000, [runInput]);
    const inputs: MemberInput[] = [
      runInput,
      {
        id: 210_004,
        kind: "generation",
        scope: ["text", fixture.inline, uuid(210_004)],
        clock: ["0", uuid(42)],
        base: null,
        body: ["text/plain"],
      },
      {
        id: 210_002,
        kind: "erase",
        scope,
        clock: ["3", uuid(42)],
        base: null,
        // Standalone protocol permits UTF-16 unit boundaries; command replay
        // separately enforces allowed splice boundaries. Preserve that contract.
        body: [
          [
            [first.members[0]!.ref, 1, 2],
            [first.members[0]!.ref, 3, 4],
          ],
        ],
      },
    ];
    const authored = sourceCommand(fixture.initial.root, 210_000, inputs);
    const entries = [
      fixture.bootstrap,
      ...fixture.initial.entries,
      ...authored.entries,
    ];
    expectEquivalent(
      entries,
      [authored.root],
      [fixture.generation, authored.members[1]!.ref],
    );
    // A no-op deletion emits no source member, not an empty erase interval.
    const noOp = command(authored.root, 211_000, []);
    expectEquivalent(
      [...entries, ...noOp.entries],
      [noOp.root],
      [fixture.generation],
    );
    const malformed = sourceCommand(fixture.initial.root, 210_000, [
      ...inputs,
      {
        id: 210_003,
        kind: "erase",
        scope,
        clock: ["4", uuid(42)],
        base: null,
        body: [[[first.members[0]!.ref, 0, 3]]],
      },
    ]);
    expectSameRejection([
      fixture.bootstrap,
      ...fixture.initial.entries,
      ...malformed.entries,
    ]);
  });

  it("reseeds exact branch and join erasures and falls back across restore and transition roots", () => {
    const fixture = baseTextFixture();
    const scope = ["text", fixture.inline, fixture.generation[0]];
    const left = sourceCommand(fixture.initial.root, 220_000, [
      {
        id: 220_001,
        kind: "erase",
        scope,
        clock: ["2", uuid(42)],
        base: null,
        body: [[[fixture.initialRun, 0, 1]]],
      },
    ]);
    const right = sourceCommand(fixture.initial.root, 221_000, [
      {
        id: 221_001,
        kind: "erase",
        scope,
        clock: ["2", uuid(42)],
        base: null,
        body: [[[fixture.initialRun, 1, 2]]],
      },
    ]);
    const joined = join(222_000, [left.root, right.root]);
    const restored = command(joined.ref, 223_000, [], undefined, "restore");
    const transition = command(
      restored.root,
      224_000,
      [],
      undefined,
      "apply",
      "transition",
    );
    const inserted = sourceCommand(transition.root, 225_000, [
      {
        id: 225_001,
        kind: "run",
        scope,
        clock: ["3", uuid(42)],
        base: null,
        body: [[fixture.initialRun, 1], "tail", origin],
      },
    ]);
    const erased = sourceCommand(inserted.root, 226_000, [
      {
        id: 226_001,
        kind: "erase",
        scope,
        clock: ["4", uuid(42)],
        base: null,
        body: [[[inserted.members[0]!.ref, 0, 4]]],
      },
    ]);
    const entries = [
      fixture.bootstrap,
      ...fixture.initial.entries,
      ...left.entries,
      ...right.entries,
      joined,
      ...restored.entries,
      ...transition.entries,
      ...inserted.entries,
      ...erased.entries,
    ];
    for (const order of [entries, [...entries].reverse(), rotate(entries)])
      expectEquivalent(
        order,
        [
          left.root,
          right.root,
          joined.ref,
          restored.root,
          inserted.root,
          erased.root,
        ],
        [fixture.generation],
      );
    for (const base of [
      joined.ref,
      restored.root,
      transition.root,
      inserted.root,
      erased.root,
    ]) {
      const bad = sourceCommand(base, 227_000, [
        {
          id: 227_001,
          kind: "erase",
          scope,
          clock: [
            base === erased.root ? "5" : base === inserted.root ? "4" : "3",
            uuid(42),
          ],
          base: null,
          body: [[[fixture.initialRun, 0, 1]]],
        },
      ]);
      expectSameRejection([...entries, ...bad.entries]);
    }
  });

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
