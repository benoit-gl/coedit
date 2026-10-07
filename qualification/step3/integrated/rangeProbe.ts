import type { BlockId, InlineContentId } from "../../../src/domain/index.js";
import { assertTextRange } from "../payload/carrier.js";
import type {
  IntegratedDocumentCarrier,
  IntegratedDocumentSnapshot,
} from "./carrier.js";

/**
 * Step 3 probe source member. Coordinates are fixture-native UTF-16 offsets,
 * not the public Step 6 Range API or a persistent lineage representation.
 */
export interface ProbeMember {
  /** Original or currently resolved owning Block. */
  readonly blockId: BlockId;
  /** Original or currently resolved InlineContent. */
  readonly inlineContentId: InlineContentId;
  /** Inclusive text offset. */
  readonly start: number;
  /** Exclusive text offset; equals start for a position. */
  readonly end: number;
}

/** Immutable qualification Range whose historical token acts as a Version surrogate. */
export interface ProbeRange {
  /** Distinct greedy Span and preceding-sticky Positional behavior. */
  readonly kind: "span" | "position";
  /** Opaque captured-state token; not a product VersionToken. */
  readonly creationToken: string;
  /** Source order, including duplicate, overlapping, and zero-length members. */
  readonly members: readonly ProbeMember[];
}

/** Fixture-supplied text operation for one historical transition. */
export type ProbeTextEdit =
  | {
      /** Fine-grained insertion. */
      readonly kind: "insert";
      /** Edited InlineContent. */
      readonly inlineContentId: InlineContentId;
      /** Native-string insertion offset. */
      readonly offset: number;
      /** Inserted UTF-16 length. */
      readonly length: number;
    }
  | {
      /** Fine-grained deletion. */
      readonly kind: "delete";
      /** Edited InlineContent. */
      readonly inlineContentId: InlineContentId;
      /** Inclusive start. */
      readonly start: number;
      /** Exclusive end. */
      readonly end: number;
    }
  | {
      /** Atomic fine-grained replacement; deletion and boundary-greedy insertion. */
      readonly kind: "replace";
      /** Edited InlineContent. */
      readonly inlineContentId: InlineContentId;
      /** Inclusive start. */
      readonly start: number;
      /** Exclusive end. */
      readonly end: number;
      /** Replacement native-string length. */
      readonly length: number;
    };

/**
 * One fixture-designated structural lineage segment.
 *
 * The fixture, not the carrier or probe, decides continuing identities.
 * Mapping several source segments to one target proves merge feasibility;
 * mapping one source to several targets proves split feasibility.
 */
export interface ProbeLineageSegment {
  /** Source InlineContent. */
  readonly sourceInlineContentId: InlineContentId;
  /** Inclusive source segment start. */
  readonly sourceStart: number;
  /** Exclusive source segment end. */
  readonly sourceEnd: number;
  /** Fixture-designated target Block. */
  readonly targetBlockId: BlockId;
  /** Fixture-designated target InlineContent. */
  readonly targetInlineContentId: InlineContentId;
  /** Target offset for the first source character. */
  readonly targetStart: number;
  /** Explicit owner of an exactly coincident zero-length boundary, if applicable. */
  readonly ownsZeroLengthBoundary?: boolean;
}

/** One historical edge, supplied and checked by the qualification fixture. */
export interface ProbeTransition {
  /** Retained before-state token. */
  readonly from: string;
  /** Retained after-state token. */
  readonly to: string;
  /** Fine-grained edits performed during this edge, in semantic order. */
  readonly edits?: readonly ProbeTextEdit[];
  /** Supplied one-to-many/many-to-one structural lineage. */
  readonly lineage?: readonly ProbeLineageSegment[];
  /** Whole-replaced InlineContents without explicitly continuing text lineage. */
  readonly invalidated?: readonly InlineContentId[];
}

/** One resolved surviving text span, in source/descendant order. */
export interface ResolvedProbeSpan extends ProbeMember {
  /** Exact material at the selected historical state, without separators. */
  readonly text: string;
}

/** Validate all creation members before returning any probe Range. */
export function createProbeRange<Position>(
  carrier: IntegratedDocumentCarrier<Position>,
  token: string,
  kind: ProbeRange["kind"],
  members: readonly ProbeMember[],
): ProbeRange {
  const snapshot = carrier.materializeHistoricalState(token);
  if (
    kind === "position" &&
    (members.length !== 1 || members[0]?.start !== members[0]?.end)
  )
    throw new TypeError(
      "A positional probe requires exactly one zero-length member.",
    );
  for (const member of members) requireMember(snapshot, member);
  return {
    kind,
    creationToken: token,
    members: members.map((member) => ({ ...member })),
  };
}

/**
 * Resolve only when asked: no stored holder ledger or per-Range edit updates.
 * The fixture supplies the path from creation to the selected descendant.
 * A missing, out-of-order, or unrelated path is rejected, not guessed.
 */
export function resolveProbeRange<Position>(
  carrier: IntegratedDocumentCarrier<Position>,
  range: ProbeRange,
  selectedToken: string,
  transitions: readonly ProbeTransition[],
): readonly ResolvedProbeSpan[] {
  let token = range.creationToken;
  let current: ProbeMember[] = range.members.map((member) => ({ ...member }));
  for (const transition of transitions) {
    if (transition.from !== token)
      throw new TypeError("Probe transition is not a descendant edge.");
    const before = carrier.materializeHistoricalState(token);
    const after = carrier.materializeHistoricalState(transition.to);
    for (const member of current) requireMember(before, member);
    for (const edit of transition.edits ?? []) {
      assertEdit(edit);
      current = current.map((member) =>
        member.inlineContentId !== edit.inlineContentId
          ? member
          : applyEdit(member, edit, range.kind),
      );
    }
    const mapped: ProbeMember[] = [];
    for (const member of current) {
      if ((transition.invalidated ?? []).includes(member.inlineContentId))
        continue;
      const lineage = (transition.lineage ?? []).filter(
        (segment) => segment.sourceInlineContentId === member.inlineContentId,
      );
      if (lineage.length === 0) {
        mapped.push(member);
        continue;
      }
      for (const segment of lineage) {
        assertTextRange(
          segment.sourceStart,
          segment.sourceEnd,
          beforeText(before, member.inlineContentId),
        );
        if (
          !Number.isSafeInteger(segment.targetStart) ||
          segment.targetStart < 0
        )
          throw new RangeError("Probe lineage target offset is invalid.");
        const start = Math.max(member.start, segment.sourceStart);
        const end = Math.min(member.end, segment.sourceEnd);
        if (
          start > end ||
          (start === end &&
            (member.start !== member.end ||
              segment.ownsZeroLengthBoundary !== true))
        )
          continue;
        mapped.push({
          blockId: segment.targetBlockId,
          inlineContentId: segment.targetInlineContentId,
          start: segment.targetStart + start - segment.sourceStart,
          end: segment.targetStart + end - segment.sourceStart,
        });
      }
    }
    // Invalidated or deleted text never silently reattaches when a later
    // payload happens to regain the same ID, Media Type, or text bytes.
    current = mapped.filter((member) => isMember(after, member));
    token = transition.to;
  }
  if (token !== selectedToken)
    throw new TypeError(
      "Probe selected state is not on the supplied descendant path.",
    );
  const snapshot = carrier.materializeHistoricalState(selectedToken);
  return current.map((member) => ({
    ...member,
    text: beforeText(snapshot, member.inlineContentId).slice(
      member.start,
      member.end,
    ),
  }));
}

/** Concatenate exactly, without generated Block or InlineContent separators. */
export function resolveProbeText<Position>(
  carrier: IntegratedDocumentCarrier<Position>,
  range: ProbeRange,
  selectedToken: string,
  transitions: readonly ProbeTransition[],
): string {
  return resolveProbeRange(carrier, range, selectedToken, transitions)
    .map((span) => span.text)
    .join("");
}

function beforeText<Position>(
  snapshot: IntegratedDocumentSnapshot<Position>,
  id: InlineContentId,
): string {
  const payload = snapshot.payloads.get(id);
  if (payload?.kind !== "text")
    throw new TypeError("Probe member requires live allowlisted text.");
  return payload.text;
}

function requireMember<Position>(
  snapshot: IntegratedDocumentSnapshot<Position>,
  member: ProbeMember,
): void {
  if (!isMember(snapshot, member))
    throw new TypeError(
      "Probe member is not a live text target in this historical state.",
    );
}

function isMember<Position>(
  snapshot: IntegratedDocumentSnapshot<Position>,
  member: ProbeMember,
): boolean {
  if (
    snapshot.inlineContentOwners.get(member.inlineContentId) !== member.blockId
  )
    return false;
  const payload = snapshot.payloads.get(member.inlineContentId);
  return (
    payload?.kind === "text" &&
    Number.isSafeInteger(member.start) &&
    Number.isSafeInteger(member.end) &&
    member.start >= 0 &&
    member.start <= member.end &&
    member.end <= payload.text.length
  );
}

function assertEdit(edit: ProbeTextEdit): void {
  if (edit.kind === "insert") {
    if (
      !Number.isSafeInteger(edit.offset) ||
      edit.offset < 0 ||
      !Number.isSafeInteger(edit.length) ||
      edit.length < 0
    )
      throw new RangeError("Probe insertion is invalid.");
  } else {
    if (
      !Number.isSafeInteger(edit.start) ||
      !Number.isSafeInteger(edit.end) ||
      edit.start < 0 ||
      edit.end < edit.start ||
      (edit.kind === "replace" &&
        (!Number.isSafeInteger(edit.length) || edit.length < 0))
    )
      throw new RangeError("Probe deletion or replacement is invalid.");
  }
}

function applyEdit(
  member: ProbeMember,
  edit: ProbeTextEdit,
  kind: ProbeRange["kind"],
): ProbeMember {
  let start = member.start;
  let end = member.end;
  if (edit.kind !== "insert") {
    const boundary = (offset: number): number =>
      offset < edit.start
        ? offset
        : offset <= edit.end
          ? edit.start
          : offset - (edit.end - edit.start);
    start = boundary(start);
    end = boundary(end);
  }
  if (edit.kind !== "delete") {
    const offset = edit.kind === "insert" ? edit.offset : edit.start;
    const length = edit.length;
    if (offset < start) start += length;
    if (kind === "span" ? offset <= end : offset < end) end += length;
  }
  return { ...member, start, end };
}
