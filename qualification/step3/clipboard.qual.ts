import { describe, expect, it } from "vitest";

import type { InlineContentValue, OriginRecord } from "../../src/domain/content.js";
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
  type CoeditQualificationFragment,
} from "./clipboard.js";

const sourceDocumentId = parseDocumentId(
  "6e000000-0000-4000-8000-000000000001",
);
const otherDocumentId = parseDocumentId(
  "6e000000-0000-4000-8000-000000000002",
);
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
      canPreservePrivateFragmentOrigins(fragment, sourceDocumentId, (candidate) =>
        candidate.id === sourceOrigin.id ? sourceOrigin : undefined,
      ),
    ).toBe(true);
    expect(
      canPreservePrivateFragmentOrigins(fragment, otherDocumentId, () => sourceOrigin),
    ).toBe(false);
    expect(
      canPreservePrivateFragmentOrigins(fragment, sourceDocumentId, () => ({
        ...sourceOrigin,
        kind: "imported",
      })),
    ).toBe(false);
  });
});

function origin(index: number): OriginRecord {
  const suffix = index.toString().padStart(12, "0");
  return {
    id: parseOriginId(`6f000000-0000-4000-8000-${suffix}`),
    agentId: parseContributorId(`70000000-0000-4000-8000-${suffix}`),
    kind: "human",
    createdBy: parseContributionId(`71000000-0000-4000-8000-${suffix}`),
  };
}
