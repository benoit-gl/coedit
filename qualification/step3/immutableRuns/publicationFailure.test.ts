import * as A from "@automerge/automerge";
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  parseBlockId,
  parseInlineContentId,
} from "../../../src/domain/index.js";
import {
  applyAutomergeImmutableRunFixtureTransitionV1,
  createAutomergeImmutableRunCarrierFactory,
  inspectAutomergeImmutableRunTransitionsV1,
} from "./automergeCarrier.js";
import * as commands from "./commands.js";
import {
  AutomergeImmutableRunDocument,
  ImmutableRunNativePublicationError,
} from "./nativeDocument.js";

vi.mock("@automerge/automerge", async (importOriginal) => {
  const actual = await importOriginal<typeof A>();
  return { ...actual, change: vi.fn(actual.change) };
});
vi.mock("./commands.js", async (importOriginal) => {
  const actual = await importOriginal<typeof commands>();
  return {
    ...actual,
    prepareImmutableRunApplyCommandV1: vi.fn(
      actual.prepareImmutableRunApplyCommandV1,
    ),
  };
});

const actualNative = await vi.importActual<typeof A>("@automerge/automerge");
const actualCommands = await vi.importActual<typeof commands>("./commands.js");
const root = parseBlockId("e9000000-0000-4000-8000-000000000001");
const inline = parseInlineContentId("e9000000-0000-4000-8000-000000000002");
const otherInline = parseInlineContentId(
  "e9000000-0000-4000-8000-000000000003",
);
const origin = { kind: "human", id: "author" } as const;
const codec = {
  encode: (v: string): string => v,
  decode: (v: string): string => v,
};
const compare = (a: string, b: string): -1 | 0 | 1 =>
  a < b ? -1 : a > b ? 1 : 0;
const factory = createAutomergeImmutableRunCarrierFactory(
  codec,
  { compare, comparePrimary: compare },
  { purePositionDecoder: true },
);
type Carrier = ReturnType<typeof factory.create>;
const insertion = {
  context: { actorId: "author", effectId: "insert" },
  payloads: [
    {
      kind: "insert-text" as const,
      inlineContentId: inline,
      offset: 1,
      text: "X",
      origin,
    },
  ],
};

function created(): Carrier {
  const carrier = factory.create(root);
  carrier.applyChange({
    context: { actorId: "author", effectId: "create" },
    inlineContents: [{ inlineContentId: inline, blockId: root }],
    payloads: [
      {
        kind: "replace-text",
        inlineContentId: inline,
        mediaType: "text/plain",
        text: "abc",
        origin,
      },
    ],
  });
  return carrier;
}

function failNativeChange(failure: Error): void {
  vi.mocked(A.change).mockImplementation((document, options, callback) => {
    // Cold activation also uses a supported no-write callback to inspect the
    // native conflict union. Inject only at the actual publication boundary.
    if (typeof options === "function")
      return actualNative.change(document, options);
    vi.mocked(A.change).mockImplementation(actualNative.change);
    return actualNative.change(document, options, (draft) => {
      callback?.(draft);
      // Throw after the real mutation callback has staged all writes. The
      // supported Automerge transaction must abort them before returning.
      throw failure;
    });
  });
}

function expectUnavailable(carrier: Carrier, revision: symbol): void {
  expect(carrier.readOrdinaryTextRange(inline, 0, 0)).toBeUndefined();
  expect(() => carrier.snapshot()).toThrow(/explicit recovery/u);
  expect(() => carrier.projectEditorPayload(inline)).toThrow(
    /explicit recovery/u,
  );
  expect(() => carrier.effects()).toThrow(/explicit recovery/u);
  expect(() => inspectAutomergeImmutableRunTransitionsV1(carrier)).toThrow(
    /explicit recovery/u,
  );
  expect(() => carrier.applyChange(insertion)).toThrow(/explicit recovery/u);
  expect(() => carrier.applyOrdinaryChange(insertion, revision)).toThrow(
    /explicit recovery/u,
  );
}

afterEach(() => {
  vi.restoreAllMocks();
  vi.mocked(A.change).mockImplementation(actualNative.change).mockClear();
  vi.mocked(commands.prepareImmutableRunApplyCommandV1)
    .mockImplementation(actualCommands.prepareImmutableRunApplyCommandV1)
    .mockClear();
});

describe("immutable-run attempted-publication failure boundary", () => {
  const paths: readonly {
    name: string;
    publish(carrier: Carrier, token: string, revision: symbol): void;
  }[] = [
    { name: "apply", publish: (carrier) => carrier.applyChange(insertion) },
    {
      name: "ordinary apply",
      publish: (carrier, _token, revision) => {
        carrier.applyOrdinaryChange(insertion, revision);
      },
    },
    {
      name: "restore",
      publish: (carrier, token) => carrier.restoreHistoricalState(token),
    },
    {
      name: "inferred copy",
      publish: (carrier, token) =>
        carrier.applyChange({
          context: {
            actorId: "author",
            effectId: "copy",
            source: { kind: "copy", reference: token },
          },
          payloads: [
            {
              kind: "insert-text",
              inlineContentId: inline,
              offset: 3,
              text: "ab",
              origin,
            },
          ],
        }),
    },
    {
      name: "fixture split",
      publish: (carrier) =>
        applyAutomergeImmutableRunFixtureTransitionV1(carrier, {
          kind: "split",
          sources: [{ blockId: root, inlineContentId: inline }],
          destinations: [
            {
              blockId: root,
              inlineContentId: inline,
              mediaType: "text/plain",
              spans: [{ text: "a", origin }],
            },
            {
              blockId: root,
              inlineContentId: otherInline,
              mediaType: "text/plain",
              spans: [{ text: "bc", origin }],
            },
          ],
          context: { actorId: "author", effectId: "split" },
        }),
    },
    {
      name: "capture",
      publish: (carrier) => {
        carrier.captureHistoricalState();
      },
    },
  ];

  for (const path of paths) {
    it(`invalidates ${path.name} receipts after a native callback throw and recovers unchanged accepted state`, () => {
      const carrier = created();
      const token = carrier.captureHistoricalState();
      const before = carrier.encode();
      const snapshot = carrier.snapshot();
      const revision = carrier.readOrdinaryTextRange(inline, 0, 0)!.revision;
      const position = carrier.createStableTextPosition(inline, 1, "before");
      const failure = new Error("Injected native failure after draft writes.");
      failNativeChange(failure);
      let reported: unknown;
      try {
        path.publish(carrier, token, revision);
      } catch (error) {
        reported = error;
      }
      expect(reported).toBeInstanceOf(ImmutableRunNativePublicationError);
      expect((reported as Error).cause).toBe(failure);
      expect(carrier.encode()).toEqual(before);
      expectUnavailable(carrier, revision);
      expect(carrier.resolveStableTextPosition(position)).toBeUndefined();
      expect(() =>
        carrier.createStableTextPosition(inline, 1, "before"),
      ).toThrow(/explicit recovery/u);
      expect(carrier.prepareOrdinaryText()).toBe(true);
      expect(carrier.snapshot()).toEqual(snapshot);
      expect(carrier.readOrdinaryTextRange(inline, 0, 0)!.revision).not.toBe(
        revision,
      );
      expect(() => carrier.applyOrdinaryChange(insertion, revision)).toThrow(
        /stale/u,
      );
      const fresh = carrier.readOrdinaryTextRange(inline, 0, 0)!.revision;
      carrier.applyOrdinaryChange(insertion, fresh);
      expect(carrier.projectEditorPayload(inline)).toMatchObject({
        text: "aXbc",
      });
      expect(factory.load(carrier.encode()).snapshot()).toEqual(
        carrier.snapshot(),
      );
    });
  }

  it("preserves the receipt and accepted state when preparation fails before native mutation", () => {
    const carrier = created();
    const before = carrier.encode();
    const revision = carrier.readOrdinaryTextRange(inline, 0, 0)!.revision;
    vi.mocked(A.change).mockClear();
    expect(() =>
      carrier.applyOrdinaryChange(
        {
          payloads: [
            { kind: "delete-text", inlineContentId: inline, start: 0, end: 99 },
          ],
        },
        revision,
      ),
    ).toThrow();
    expect(A.change).not.toHaveBeenCalled();
    expect(carrier.encode()).toEqual(before);
    expect(carrier.readOrdinaryTextRange(inline, 0, 0)!.revision).toBe(
      revision,
    );
    carrier.applyOrdinaryChange(insertion, revision);
    expect(carrier.projectEditorPayload(inline)).toMatchObject({
      text: "aXbc",
    });
  });

  it("preserves the receipt when native publication preflight rejects a stale staged replay", () => {
    const carrier = created();
    const before = carrier.encode();
    const revision = carrier.readOrdinaryTextRange(inline, 0, 0)!.revision;
    const failure = new Error("Injected stale staged replay.");
    vi.mocked(
      commands.prepareImmutableRunApplyCommandV1,
    ).mockImplementationOnce((input) => {
      const command = actualCommands.prepareImmutableRunApplyCommandV1(input);
      return {
        ...command,
        cacheReplay: {
          ...command.cacheReplay,
          assertCurrent() {
            throw failure;
          },
        },
      };
    });
    vi.mocked(A.change).mockClear();
    expect(() => carrier.applyOrdinaryChange(insertion, revision)).toThrow(
      failure,
    );
    expect(A.change).not.toHaveBeenCalled();
    expect(carrier.encode()).toEqual(before);
    expect(carrier.readOrdinaryTextRange(inline, 0, 0)!.revision).toBe(
      revision,
    );
    carrier.applyOrdinaryChange(insertion, revision);
  });

  it("recovers actual committed native state after a replay throws following native success", () => {
    const carrier = created();
    const revision = carrier.readOrdinaryTextRange(inline, 0, 0)!.revision;
    vi.mocked(
      commands.prepareImmutableRunApplyCommandV1,
    ).mockImplementationOnce((input) => {
      const command = actualCommands.prepareImmutableRunApplyCommandV1(input);
      return {
        ...command,
        cacheReplay: {
          ...command.cacheReplay,
          commit() {
            command.cacheReplay.commit();
            throw new Error("Injected post-native replay failure.");
          },
        },
      };
    });
    expect(() => carrier.applyOrdinaryChange(insertion, revision)).toThrow(
      ImmutableRunNativePublicationError,
    );
    expectUnavailable(carrier, revision);
    expect(carrier.prepareOrdinaryText()).toBe(true);
    expect(carrier.projectEditorPayload(inline)).toMatchObject({
      text: "aXbc",
    });
    expect(factory.load(carrier.encode()).snapshot()).toEqual(
      carrier.snapshot(),
    );
    expect(() => carrier.applyOrdinaryChange(insertion, revision)).toThrow(
      /stale/u,
    );
  });

  it("recovers actual committed native state when carrier adoption throws", () => {
    const carrier = created();
    const revision = carrier.readOrdinaryTextRange(inline, 0, 0)!.revision;
    vi.mocked(
      commands.prepareImmutableRunApplyCommandV1,
    ).mockImplementationOnce((input) => {
      const command = actualCommands.prepareImmutableRunApplyCommandV1(input);
      return {
        ...command,
        cacheReplay: {
          ...command.cacheReplay,
          get indexUpdates(): typeof command.cacheReplay.indexUpdates {
            throw new Error("Injected carrier adoption failure.");
          },
        },
      };
    });
    expect(() => carrier.applyOrdinaryChange(insertion, revision)).toThrow(
      /carrier adoption failure/u,
    );
    expectUnavailable(carrier, revision);
    expect(carrier.prepareOrdinaryText()).toBe(true);
    expect(carrier.projectEditorPayload(inline)).toMatchObject({
      text: "aXbc",
    });
    expect(factory.load(carrier.encode()).snapshot()).toEqual(
      carrier.snapshot(),
    );
  });

  it("recovers the general decoder path explicitly without granting ordinary eligibility", () => {
    const carrier = createAutomergeImmutableRunCarrierFactory(codec, {
      compare,
      comparePrimary: compare,
    }).load(created().encode());
    const before = carrier.encode();
    failNativeChange(new Error("Injected general-path native failure."));
    expect(() => carrier.applyChange(insertion)).toThrow(
      ImmutableRunNativePublicationError,
    );
    expect(carrier.encode()).toEqual(before);
    expect(() => carrier.snapshot()).toThrow(/explicit recovery/u);
    expect(carrier.prepareOrdinaryText()).toBe(false);
    expect(carrier.snapshot().payloads.get(inline)).toMatchObject({
      text: "abc",
    });
    expect(carrier.readOrdinaryTextRange(inline, 0, 0)).toBeUndefined();
    carrier.applyChange(insertion);
    expect(carrier.projectEditorPayload(inline)).toMatchObject({
      text: "aXbc",
    });
  });

  it("keeps recovery closed if validation fails and retries only at the next explicit boundary", () => {
    const carrier = created();
    const revision = carrier.readOrdinaryTextRange(inline, 0, 0)!.revision;
    failNativeChange(new Error("Injected native failure."));
    expect(() => carrier.applyOrdinaryChange(insertion, revision)).toThrow(
      ImmutableRunNativePublicationError,
    );
    vi.spyOn(
      AutomergeImmutableRunDocument.prototype,
      "activate",
    ).mockImplementationOnce(() => {
      throw new Error("Injected cold validation failure.");
    });
    expect(() => carrier.prepareOrdinaryText()).toThrow(
      /cold validation failure/u,
    );
    expectUnavailable(carrier, revision);
    expect(carrier.prepareOrdinaryText()).toBe(true);
    expect(carrier.projectEditorPayload(inline)).toMatchObject({ text: "abc" });
  });
});
