import type {
  QualificationOrigin,
  QualificationTextSpan,
} from "../payload/carrier.js";

import type { QualificationWorkCounters } from "./carrier.js";

type Counters = NonNullable<QualificationWorkCounters["indexed"]>;

interface Node {
  readonly text: string;
  readonly origin: QualificationOrigin;
  readonly height: number;
  readonly left: Node | undefined;
  readonly right: Node | undefined;
  readonly length: number;
}

function length(node: Node | undefined): number {
  return node?.length ?? 0;
}

function height(tree: Node | undefined): number {
  return tree?.height ?? 0;
}

function node(
  text: string,
  origin: QualificationOrigin,
  left?: Node,
  right?: Node,
): Node {
  return {
    text,
    origin,
    left,
    right,
    length: length(left) + text.length + length(right),
    height: 1 + Math.max(height(left), height(right)),
  };
}

// Persistent AVL joins keep path length bounded even after adversarial repeated
// splits of the same piece. Untouched text and subtrees are never flattened.
function balance(tree: Node): Node {
  const left = tree.left;
  const right = tree.right;
  if (left && height(left) > height(right) + 1) {
    if (height(left.left) >= height(left.right))
      return node(
        left.text,
        left.origin,
        left.left,
        node(tree.text, tree.origin, left.right, right),
      );
    const pivot = left.right!;
    return node(
      pivot.text,
      pivot.origin,
      node(left.text, left.origin, left.left, pivot.left),
      node(tree.text, tree.origin, pivot.right, right),
    );
  }
  if (right && height(right) > height(left) + 1) {
    if (height(right.right) >= height(right.left))
      return node(
        right.text,
        right.origin,
        node(tree.text, tree.origin, left, right.left),
        right.right,
      );
    const pivot = right.left!;
    return node(
      pivot.text,
      pivot.origin,
      node(tree.text, tree.origin, left, pivot.left),
      node(right.text, right.origin, pivot.right, right.right),
    );
  }
  return tree;
}

function join(
  left: Node | undefined,
  text: string,
  origin: QualificationOrigin,
  right: Node | undefined,
  counters?: Counters,
): Node {
  if (counters) counters.pathVisits++;
  if (left && height(left) > height(right) + 1)
    return balance(
      node(
        left.text,
        left.origin,
        left.left,
        join(left.right, text, origin, right, counters),
      ),
    );
  if (right && height(right) > height(left) + 1)
    return balance(
      node(
        right.text,
        right.origin,
        join(left, text, origin, right.left, counters),
        right.right,
      ),
    );
  return node(text, origin, left, right);
}

function takeFirst(tree: Node, counters?: Counters): [Node, Node | undefined] {
  if (counters) counters.pathVisits++;
  if (!tree.left) return [tree, tree.right];
  const [first, rest] = takeFirst(tree.left, counters);
  return [first, balance(node(tree.text, tree.origin, rest, tree.right))];
}

function merge(
  left: Node | undefined,
  right: Node | undefined,
  counters?: Counters,
): Node | undefined {
  if (counters) counters.pathVisits++;
  if (!left) return right;
  if (!right) return left;
  const [first, rest] = takeFirst(right, counters);
  return join(left, first.text, first.origin, rest, counters);
}

function split(
  tree: Node | undefined,
  offset: number,
  counters?: Counters,
): [Node | undefined, Node | undefined] {
  if (counters) counters.pathVisits++;
  if (!tree) return [undefined, undefined];
  const leftLength = length(tree.left);
  if (offset < leftLength) {
    const [a, b] = split(tree.left, offset, counters);
    return [a, join(b, tree.text, tree.origin, tree.right, counters)];
  }
  if (offset > leftLength + tree.text.length) {
    const [a, b] = split(
      tree.right,
      offset - leftLength - tree.text.length,
      counters,
    );
    return [join(tree.left, tree.text, tree.origin, a, counters), b];
  }
  const inside = offset - leftLength;
  const prefix = tree.text.slice(0, inside);
  const suffix = tree.text.slice(inside);
  return [
    prefix
      ? join(tree.left, prefix, tree.origin, undefined, counters)
      : tree.left,
    suffix
      ? join(undefined, suffix, tree.origin, tree.right, counters)
      : tree.right,
  ];
}

function collect(
  tree: Node | undefined,
  start: number,
  end: number,
  result: QualificationTextSpan[],
  counters?: Counters,
): void {
  if (counters) counters.pathVisits += 1;
  if (!tree || start >= end) return;
  const leftLength = length(tree.left);
  if (start < leftLength)
    collect(tree.left, start, Math.min(end, leftLength), result, counters);
  const from = Math.max(start - leftLength, 0);
  const to = Math.min(end - leftLength, tree.text.length);
  if (from < to && counters) {
    counters.readPieces += 1;
    counters.readUnits += to - from;
  }
  if (from < to)
    result.push({
      text: tree.text.slice(from, to),
      origin: { ...tree.origin },
    });
  const rightStart = leftLength + tree.text.length;
  if (end > rightStart)
    collect(
      tree.right,
      Math.max(0, start - rightStart),
      end - rightStart,
      result,
      counters,
    );
}

/** Indexed attributed text for the incremental qualification experiment.
 *
 * Each version shares untouched AVL tree nodes. Reads and edits visit tree paths
 * and returned or removed pieces rather than reconstructing the full payload.
 */
export class IndexedText {
  private root: Node | undefined;
  private currentRevision = 0;

  /** Build one cache from an already validated detached projection. */
  public constructor(
    spans: readonly QualificationTextSpan[],
    private readonly counters?: Counters,
  ) {
    for (const span of spans)
      this.root = merge(
        this.root,
        this.pieces(span.text, span.origin),
        this.counters,
      );
  }

  /** UTF-16 length of the current version. */
  public get length(): number {
    return length(this.root);
  }
  /** Local revision; callers must reject stale editor operations. */
  public get revision(): number {
    return this.currentRevision;
  }

  /** Stage a transaction without mutating the published cache version. */
  public fork(): IndexedText {
    const copy = new IndexedText([], this.counters);
    copy.root = this.root;
    copy.currentRevision = this.currentRevision;
    return copy;
  }

  /** Read a detached attributed UTF-16 slice, rejecting out-of-range offsets. */
  public read(start: number, end: number): readonly QualificationTextSpan[] {
    this.assertRange(start, end);
    const result: QualificationTextSpan[] = [];
    collect(this.root, start, end, result, this.counters);
    return result;
  }

  /** Atomically replace a range if the expected local revision still matches. */
  public replace(
    start: number,
    end: number,
    text: string,
    origin: QualificationOrigin,
    expectedRevision: number,
  ): void {
    if (expectedRevision !== this.currentRevision)
      throw new Error("Stale indexed text revision.");
    this.assertRange(start, end);
    const [before, tail] = split(this.root, start, this.counters);
    const [, after] = split(tail, end - start, this.counters);
    this.root = merge(
      merge(before, this.pieces(text, origin), this.counters),
      after,
      this.counters,
    );
    this.currentRevision += 1;
  }

  private assertRange(start: number, end: number): void {
    if (
      !Number.isSafeInteger(start) ||
      !Number.isSafeInteger(end) ||
      start < 0 ||
      start > end ||
      end > this.length
    )
      throw new RangeError("Indexed text range is outside the native string.");
  }

  private pieces(text: string, origin: QualificationOrigin): Node | undefined {
    let result: Node | undefined;
    for (let i = 0; i < text.length;) {
      let end = Math.min(i + 256, text.length);
      // An inverse slice may become a separate native insertion. Never turn a
      // supported scalar into two individually ill-formed insertion spans.
      if (
        end < text.length &&
        text.charCodeAt(end - 1) >= 0xd800 &&
        text.charCodeAt(end - 1) <= 0xdbff &&
        text.charCodeAt(end) >= 0xdc00 &&
        text.charCodeAt(end) <= 0xdfff
      )
        end--;
      result = merge(
        result,
        node(text.slice(i, end), { ...origin }),
        this.counters,
      );
      i = end;
    }
    return result;
  }
}
