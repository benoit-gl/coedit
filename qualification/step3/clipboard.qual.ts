import { describe, expect, it } from "vitest";

import type {
  InlineContentValue,
  OriginRecord,
} from "../../src/domain/content.js";
import {
  parseContributionId,
  parseContributorId,
  parseDocumentId,
  parseOriginId,
} from "../../src/domain/ids.js";
import {
  canPreservePrivateFragmentOrigins,
  coeditFragmentFormatVersion,
  encodeCoeditQualificationFragment,
  parseCoeditQualificationFragment,
  routeCoeditQualificationClipboard,
  type CoeditQualificationClipboardGuards,
  type CoeditQualificationFragment,
} from "./clipboard.js";

const sourceDocumentId = parseDocumentId(
  "6e000000-0000-4000-8000-000000000001",
);
const otherDocumentId = parseDocumentId("6e000000-0000-4000-8000-000000000002");
const sourceOrigin = origin(1);

const content: InlineContentValue = {
  items: [
    {
      kind: "text",
      text: "copied",
      originId: sourceOrigin.id,
      marks: [],
    },
  ],
  origins: [sourceOrigin],
};

const fragment: CoeditQualificationFragment = {
  formatVersion: coeditFragmentFormatVersion,
  sourceDocumentId,
  sourceVersion: "qualification-version-1",
  content,
};
const guards: CoeditQualificationClipboardGuards = {
  maxEncodedBytes: 16_384,
  maxDecodedNodes: 128,
  maxNestingDepth: 12,
  maxItems: 32,
  maxOrigins: 32,
};

describe("Step 3 private clipboard qualification", () => {
  it("round trips a validated same-document fragment", () => {
    const parsed = parseCoeditQualificationFragment(
      encodeCoeditQualificationFragment(fragment),
    );
    expect(parsed).toEqual({ ok: true, value: fragment });
  });

  it("rejects malformed, unknown-version, and invalid-content payloads", () => {
    expect(parseCoeditQualificationFragment("not-json").ok).toBe(false);
    expect(
      parseCoeditQualificationFragment(
        JSON.stringify({ ...fragment, formatVersion: 2 }),
      ).ok,
    ).toBe(false);
    expect(
      parseCoeditQualificationFragment(
        JSON.stringify({
          ...fragment,
          content: {
            items: [
              {
                kind: "text",
                text: "x",
                originId: "6f000000-0000-4000-8000-000000000099",
                marks: [],
              },
            ],
            origins: [],
          },
        }),
      ).ok,
    ).toBe(false);
  });

  it("preserves Origins only for a matching document and conflict-free catalog", () => {
    expect(
      canPreservePrivateFragmentOrigins(
        fragment,
        sourceDocumentId,
        (candidate) =>
          candidate.id === sourceOrigin.id ? sourceOrigin : undefined,
      ),
    ).toBe(true);
    expect(
      canPreservePrivateFragmentOrigins(
        fragment,
        otherDocumentId,
        () => sourceOrigin,
      ),
    ).toBe(false);
    expect(
      canPreservePrivateFragmentOrigins(fragment, sourceDocumentId, () => ({
        ...sourceOrigin,
        kind: "imported",
      })),
    ).toBe(false);
  });

  it("rejects each configured hostile-input dimension before use", () => {
    const encoded = encodeCoeditQualificationFragment(fragment);
    expectFailureReason(
      parseCoeditQualificationFragment(encoded, {
        ...guards,
        maxEncodedBytes: 1,
      }),
      /encoded/u,
    );
    expectFailureReason(
      parseCoeditQualificationFragment(encoded, {
        ...guards,
        maxDecodedNodes: 1,
      }),
      /decoded/u,
    );
    expectFailureReason(
      parseCoeditQualificationFragment(encoded, {
        ...guards,
        maxNestingDepth: 1,
      }),
      /nesting/u,
    );

    const secondOrigin = origin(2);
    const expanded: CoeditQualificationFragment = {
      ...fragment,
      content: {
        items: [
          ...content.items,
          {
            kind: "text",
            text: "again",
            originId: secondOrigin.id,
            marks: [],
          },
        ],
        origins: [sourceOrigin, secondOrigin],
      },
    };
    expectFailureReason(
      parseCoeditQualificationFragment(
        encodeCoeditQualificationFragment(expanded),
        { ...guards, maxItems: 1 },
      ),
      /collection/u,
    );
    expectFailureReason(
      parseCoeditQualificationFragment(
        encodeCoeditQualificationFragment(expanded),
        { ...guards, maxOrigins: 1 },
      ),
      /collection/u,
    );
  });

  it("keeps ordinary clipboard fallback available after private-data failure", () => {
    expect(
      routeCoeditQualificationClipboard(
        "not-json",
        { sanitizedHtml: "<strong>safe</strong>", plainText: "safe" },
        guards,
      ),
    ).toEqual({
      kind: "html",
      sanitizedHtml: "<strong>safe</strong>",
      privateFailure: "Private clipboard payload is not valid JSON.",
    });
    expect(
      routeCoeditQualificationClipboard(
        undefined,
        { plainText: "safe" },
        guards,
      ),
    ).toEqual({ kind: "text", plainText: "safe" });
  });
});

function expectFailureReason(
  result: ReturnType<typeof parseCoeditQualificationFragment>,
  pattern: RegExp,
): void {
  expect(result.ok).toBe(false);
  if (!result.ok) {
    expect(result.reason).toMatch(pattern);
  }
}

function origin(index: number): OriginRecord {
  const suffix = index.toString().padStart(12, "0");
  return {
    id: parseOriginId(`6f000000-0000-4000-8000-${suffix}`),
    agentId: parseContributorId(`70000000-0000-4000-8000-${suffix}`),
    kind: "human",
    createdBy: parseContributionId(`71000000-0000-4000-8000-${suffix}`),
  };
}
