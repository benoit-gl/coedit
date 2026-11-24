import { digest } from "lib0/hash/sha256";
import { describe, expect, it, vi } from "vitest";

import { encodeEffectContext } from "../integrated/effectContext.js";
import { encodeQualificationOrigin } from "../payload/carrier.js";
import {
  commitRecordV1,
  decodeRecordKeyV1,
  decodeRecordSetV1,
  decodeRecordV1,
  encodeRecordV1,
  matchRecordRefV1,
} from "./record.js";

const uuid = (value: number): string =>
  `00000000-0000-4000-8000-${value.toString(16).padStart(12, "0")}`;
const hash = (value: number): string => value.toString(16).padStart(64, "0");
const ref = (value: number): readonly [string, string] => [
  uuid(value),
  hash(value),
];

const actor = "actor";
const effectId = "effect";
const effect = [actor, effectId];
const context = encodeEffectContext({ actorId: actor, effectId });
const documentScope = ["document"];
const batch = uuid(10);
const rootBlock = uuid(1);
const inline = uuid(2);
const generation = uuid(3);
const replica = uuid(4);
const placement = JSON.stringify({ position: "fixture-position", depth: 1 });

function genesisRecord(): unknown[] {
  return [
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
    ["genesis", rootBlock, ["settings", 1, 256], context],
  ];
}

function joinRecord(id = uuid(11), input = ref(10)): unknown[] {
  return [
    "coedit-step3-record",
    1,
    id,
    "join",
    documentScope,
    null,
    null,
    null,
    null,
    null,
    [[input]],
  ];
}

function memberRecord(
  id: string,
  kind: string,
  scope: unknown,
  clock: unknown,
  base: unknown,
  ordinal: unknown,
  body: unknown,
): unknown[] {
  return [
    "coedit-step3-record",
    1,
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
}

function generationRecord(): unknown[] {
  return memberRecord(
    generation,
    "generation",
    ["text", inline, generation],
    ["0", replica],
    [ref(10), null],
    ["payload", 0, 0],
    ["text/plain"],
  );
}

function runRecord(source = "source"): unknown[] {
  return memberRecord(
    uuid(12),
    "run",
    ["text", inline, generation],
    ["184467440737095516160", replica],
    [ref(10), ref(3)],
    ["payload", 0, 1],
    [[ref(13), 1], source, ["human", "origin"]],
  );
}

function applyEnvelope(extra = false): string {
  return JSON.stringify({
    kind: "apply",
    authoringNonce: batch,
    placements: [[rootBlock, placement]],
    inlineContents: [[inline, rootBlock]],
    deleteBlockIds: [rootBlock],
    payloadEffectId: null,
    ...(extra ? { extra: true } : {}),
  });
}

function restoreEnvelope(): string {
  const target = JSON.stringify({
    rootId: rootBlock,
    blockLiveness: [[rootBlock, true]],
    placements: [],
    inlineContentOwners: [],
    payloads: [],
  });
  return JSON.stringify({
    kind: "restore",
    authoringNonce: batch,
    target,
  });
}

function payloadOperations(): string {
  return JSON.stringify([
    {
      kind: "insert-text",
      inlineContentId: inline,
      offset: 0,
      text: "x",
      origin: encodeQualificationOrigin({ id: "origin", kind: "human" }),
      baseReplacementEffectId: "base-effect",
    },
    {
      kind: "delete-text",
      inlineContentId: inline,
      start: 0,
      end: 1,
      baseReplacementEffectId: "base-effect",
    },
    {
      kind: "replace-text",
      inlineContentId: inline,
      mediaType: "text/plain",
      text: "replacement",
      origin: encodeQualificationOrigin({ id: "origin", kind: "human" }),
    },
    {
      kind: "replace-opaque",
      inlineContentId: inline,
      mediaType: "application/octet-stream",
      bytes: [0, 255],
      origin: encodeQualificationOrigin({ id: "origin", kind: "human" }),
    },
  ]);
}

function commandRecord(kind: "apply" | "restore" = "apply"): unknown[] {
  const rows =
    kind === "restore"
      ? [["restore", 0, [ref(60), ref(61)]]]
      : [
          ["block-delete", 0, [ref(60)]],
          ["placement", 0, [ref(61)]],
          ["inline-create", 0, [ref(62)]],
          ["payload", 0, [ref(63)]],
          ["transition", 0, [ref(64)]],
        ];
  return [
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
      kind,
      ref(10),
      ref(50),
      ref(51),
      kind === "apply" ? ref(52) : null,
      rows,
      [
        ["block-delete", rootBlock],
        ["placement", uuid(5), placement],
        ["inline-create", inline, rootBlock],
      ],
      [
        ["text", inline, "text/plain", ref(3)],
        [
          "opaque",
          uuid(6),
          "application/octet-stream",
          [0, 255],
          ["imported", "fixture"],
        ],
      ],
    ],
  ];
}

function transitionRecord(
  relation = "lineage",
  firstDestinationEnd = 3,
): unknown[] {
  const source = [rootBlock, inline, ref(3)];
  const left = [rootBlock, uuid(20), ref(21)];
  const right = [rootBlock, uuid(22), ref(23)];
  return memberRecord(
    uuid(24),
    "transition-v1",
    documentScope,
    null,
    null,
    ["transition", 0, 0],
    [
      1,
      "split",
      ref(10),
      [source],
      [left, right],
      [
        [
          source,
          ref(12),
          0,
          2,
          left,
          ref(25),
          1,
          firstDestinationEnd,
          relation,
        ],
        [source, ref(12), 2, 4, right, ref(26), 0, 2, "lineage"],
      ],
      [[source, ["at", ref(12), 2], left, ["empty", ref(21)], "lineage"]],
    ],
  );
}

describe("canonical immutable-run record codec", () => {
  it("round-trips every closed record kind and command body", () => {
    const records = [
      genesisRecord(),
      commandRecord(),
      commandRecord("restore"),
      joinRecord(),
      generationRecord(),
      runRecord(),
      memberRecord(
        uuid(13),
        "erase",
        ["text", inline, generation],
        ["2", replica],
        [ref(10), ref(12)],
        ["payload", 1, 0],
        [[[ref(12), 0, 2]]],
      ),
      memberRecord(
        uuid(14),
        "live",
        ["block", rootBlock],
        null,
        null,
        ["placement", 0, 0],
        [],
      ),
      memberRecord(
        uuid(15),
        "retire",
        ["inline", inline],
        null,
        null,
        ["block-delete", 0, 0],
        [[ref(14)]],
      ),
      memberRecord(
        uuid(16),
        "context",
        documentScope,
        null,
        null,
        ["context", 0, 0],
        [context],
      ),
      memberRecord(
        uuid(17),
        "envelope",
        documentScope,
        null,
        null,
        ["envelope", 0, 0],
        ["apply", applyEnvelope()],
      ),
      memberRecord(
        uuid(18),
        "envelope",
        documentScope,
        null,
        null,
        ["envelope", 0, 0],
        ["restore", restoreEnvelope()],
      ),
      memberRecord(
        uuid(19),
        "payload-effect-v2",
        documentScope,
        null,
        null,
        ["payload-evidence", 0, 0],
        [JSON.stringify(effect), ref(10), payloadOperations()],
      ),
      transitionRecord(),
    ];

    for (const record of records) {
      const encoded = encodeRecordV1(record);
      expect(encodeRecordV1(decodeRecordV1(encoded))).toBe(encoded);
    }
  });

  it("preserves exact lone surrogates through well-formed JSON", () => {
    const source = "\ud800A\udfff";
    const encoded = encodeRecordV1(runRecord(source));
    expect(encoded).toContain("\\ud800A\\udfff");
    const decoded = decodeRecordV1(encoded);
    expect(decoded[10][1]).toBe(source);
  });

  it("uses the public lib0 SHA-256 implementation with the standard known answer", () => {
    let actual = "";
    for (const byte of digest(new TextEncoder().encode("abc")))
      actual += byte.toString(16).padStart(2, "0");
    expect(actual).toBe(
      "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad",
    );
    expect(commitRecordV1(genesisRecord()).commitment).toBe(
      "660510e6b0405f40c74c659cbdb1a7792ddcc6cf3274c85e0edf73dafef9be4b",
    );
  });

  it("owns immutable source and commitment copies", () => {
    const body: unknown[] = [null, "before", ["human", "origin"]];
    const input = memberRecord(
      uuid(12),
      "run",
      ["text", inline, generation],
      ["1", replica],
      [ref(10), null],
      ["payload", 0, 0],
      body,
    );
    const entry = commitRecordV1(input);
    body[1] = "after";
    input[2] = uuid(99);

    expect(entry.record[2]).toBe(uuid(12));
    expect(entry.record[10][1]).toBe("before");
    expect(entry.key).toBe(`${entry.commitment}:${entry.canonical}`);
    expect(Object.isFrozen(entry.record)).toBe(true);
    expect(Object.isFrozen(entry.record[10])).toBe(true);
  });

  it("never invokes caller toJSON and snapshots proxy fields once", () => {
    const hook = vi.fn(() => ["untrusted"]);
    const input = genesisRecord();
    Object.defineProperty(input, "toJSON", { value: hook });
    expect(encodeRecordV1(input)).toBe(JSON.stringify(genesisRecord()));
    expect(hook).not.toHaveBeenCalled();

    let idReads = 0;
    const proxy = new Proxy(genesisRecord(), {
      get(target, property) {
        if (property === "2") {
          idReads += 1;
          return idReads === 1 ? batch : "not-a-uuid";
        }
        if (property === "length") return target.length;
        if (typeof property === "string" && /^[0-9]+$/u.test(property))
          return target[Number(property)];
        return undefined;
      },
    });
    expect(() => encodeRecordV1(proxy)).not.toThrow();
    expect(idReads).toBe(1);
  });

  it("rejects unknown kinds, tuple extensions, and invalid UUID spelling", () => {
    const unknownKind = genesisRecord();
    unknownKind[3] = "future-kind";
    expect(() => encodeRecordV1(unknownKind)).toThrow(TypeError);

    const extended = genesisRecord();
    extended.push("extension");
    expect(() => encodeRecordV1(extended)).toThrow(/arity 11/u);

    const uppercase = genesisRecord();
    uppercase[2] = batch.toUpperCase();
    expect(() => encodeRecordV1(uppercase)).toThrow(/canonical lowercase/u);
  });

  it("rejects malformed digests, counters, and negative-zero indices", () => {
    const badDigest = joinRecord(uuid(11), [uuid(10), "A".repeat(64)]);
    expect(() => encodeRecordV1(badDigest)).toThrow(/commitment/u);

    for (const counter of ["01", "-0", "1e2", ""]) {
      const record = generationRecord();
      record[5] = [counter, replica];
      expect(() => encodeRecordV1(record)).toThrow(/counter/u);
    }

    const negativeZero = memberRecord(
      uuid(16),
      "context",
      documentScope,
      null,
      null,
      ["context", -0, 0],
      [context],
    );
    expect(() => encodeRecordV1(negativeZero)).toThrow(/nonnegative/u);
  });

  it("rejects noncanonical ordering, duplicate Refs, and body arity", () => {
    const unsortedJoin = joinRecord();
    unsortedJoin[10] = [[ref(12), ref(11)]];
    expect(() => encodeRecordV1(unsortedJoin)).toThrow(/sorted and unique/u);

    const duplicateMembers = commandRecord();
    duplicateMembers[10] = [
      "apply",
      ref(10),
      ref(50),
      ref(51),
      null,
      [["payload", 0, [ref(50)]]],
      [],
      [],
    ];
    expect(() => encodeRecordV1(duplicateMembers)).toThrow(/must not repeat/u);

    const run = runRecord();
    run[10] = [null, "source"];
    expect(() => encodeRecordV1(run)).toThrow(/arity 3/u);
  });

  it("rejects unknown and duplicate embedded JSON fields by exact re-encoding", () => {
    const unknownEnvelope = memberRecord(
      uuid(17),
      "envelope",
      documentScope,
      null,
      null,
      ["envelope", 0, 0],
      ["apply", applyEnvelope(true)],
    );
    expect(() => encodeRecordV1(unknownEnvelope)).toThrow(
      /unknown or missing/u,
    );

    const duplicateContext =
      '{"effectId":"effect","actorId":"actor","actorId":"actor"}';
    const contextRecord = memberRecord(
      uuid(16),
      "context",
      documentScope,
      null,
      null,
      ["context", 0, 0],
      [duplicateContext],
    );
    expect(() => encodeRecordV1(contextRecord)).toThrow(/canonically encoded/u);

    const whitespace = encodeRecordV1(genesisRecord()).replace(
      '["coedit-step3-record"',
      '[ "coedit-step3-record"',
    );
    expect(() => decodeRecordV1(whitespace)).toThrow(/not canonical/u);
  });

  it("verifies key markers, commitments, and exact Refs", () => {
    const entry = commitRecordV1(genesisRecord());
    expect(decodeRecordKeyV1(entry.key, true)).toEqual(entry);
    expect(() => decodeRecordKeyV1(entry.key, 1)).toThrow(/exactly true/u);

    const first = entry.commitment[0] === "0" ? "1" : "0";
    const tamperedKey = `${first}${entry.key.slice(1)}`;
    expect(() => decodeRecordKeyV1(tamperedKey, true)).toThrow(
      /does not match/u,
    );
    expect(matchRecordRefV1(entry.ref, entry)).toEqual(entry.ref);
    expect(() => matchRecordRefV1([entry.ref[0], hash(99)], entry)).toThrow(
      /does not match/u,
    );
  });

  it("deduplicates exact entries and rejects UUID equivocation atomically", () => {
    const first = commitRecordV1(joinRecord(uuid(11), ref(10)));
    const equivalent = decodeRecordSetV1([
      [first.key, true],
      [first.key, true],
    ]);
    expect(equivalent).toHaveLength(1);

    const conflicting = commitRecordV1(joinRecord(uuid(11), ref(12)));
    expect(() =>
      decodeRecordSetV1([
        [first.key, true],
        [conflicting.key, true],
      ]),
    ).toThrow(/equivocation/u);
  });

  it("rejects invalid transition relation and unequal span lengths", () => {
    expect(() => encodeRecordV1(transitionRecord("copy"))).toThrow(/relation/u);
    expect(() => encodeRecordV1(transitionRecord("lineage", 4))).toThrow(
      /equal positive lengths/u,
    );
  });
});
