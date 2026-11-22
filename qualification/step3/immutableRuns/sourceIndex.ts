import type {
  ImmutableRunGenerationProjectionV1,
  ImmutableRunObservedIntervalV1,
  ImmutableRunOriginSpanV1,
  ImmutableRunReachedRunV1,
} from "./protocol.js";
import type { RecordRef } from "./record.js";

/** Passive derived-index counters, independent of native and reference-model work. */
export interface ImmutableRunIndexWork {
  /** Tree nodes visited by navigation, splitting, joining and explicit reads. */
  pathVisits: number;
  /** Source units processed during a cold index build. */
  rebuiltUnits: number;
  /** Visible units copied by requested reads. */
  readUnits: number;
  /** Source-unit leaves allocated, including explicit cold construction. */
  allocatedUnits: number;
}

/** A private same-generation boundary; this is not a portable Range encoding. */
export interface ImmutableRunIndexPosition {
  /** Exact payload generation at capture. */
  readonly generation: RecordRef;
  /** Immediately preceding visible source unit's end, or the start sentinel. */
  readonly left: Readonly<{
    /** Exact preceding run commitment. */ run: RecordRef;
    /** Exclusive source-unit end. */ end: number;
  }> | null;
  /** Immediately following visible source unit's start, or the end sentinel. */
  readonly right: Readonly<{
    /** Exact following run commitment. */ run: RecordRef;
    /** Inclusive source-unit start. */ start: number;
  }> | null;
  /** Whether insertion at this gap stays before or after the position. */
  readonly affinity: "before" | "after";
}

/** A staged, already-reverted index mutation prepared before native publication. */
export interface ImmutableRunPreparedIndexChange<T> {
  /** Data returned by the trusted preparation callback. */
  readonly value: T;
  /** Checks the unchanged index version before entering native mutation. */
  assertCurrent(): void;
  /** Replays only prepared assignments once; no source projection or validation. */
  commit(): void;
}

interface Run {
  readonly fact: ImmutableRunReachedRunV1;
  readonly leaves: Leaf[];
}
interface Common {
  parent: Branch | undefined;
  visible: number;
  readonly height: number;
  readonly size: number;
}
interface Leaf extends Common {
  readonly kind: "leaf";
  readonly run: Run;
  readonly offset: number;
}
interface Branch extends Common {
  readonly kind: "branch";
  readonly left: Node;
  readonly right: Node;
}
type Node = Leaf | Branch;
interface Assignment {
  readonly undo: () => void;
  readonly redo: () => void;
}

function sameRef(a: RecordRef, b: RecordRef): boolean {
  return a[0] === b[0] && a[1] === b[1];
}
function refCopy(ref: RecordRef): RecordRef {
  return Object.freeze([ref[0], ref[1]]);
}
function branchOf(node: Node): Branch {
  if (node.kind !== "branch") throw new Error("AVL shape invariant failed.");
  return node;
}

/**
 * Derived weighted AVL rope over stable source-unit handles.
 *
 * @remarks
 * Construction consumes a validated cold reference projection, including hidden
 * source. Ordinary local inserts must advance beyond the complete observed
 * counter maximum. They are consequently the first child of their source
 * anchor; inserting immediately after its entry handle avoids ancestry or
 * descendant scans. Lower-ranked inbound facts require an explicit cold rebuild.
 * Local leaves are not replicated records. Memory and their allocation cost
 * remain qualification obligations.
 *
 * Preparation mutates only this private index under an undo journal and then
 * restores it before returning. Native publication precedes replay of the
 * prepared assignments. Callers must keep the engine publication boundary
 * private and synchronous; no application callbacks may observe preparation.
 */
export class ImmutableRunSourceIndex {
  readonly #generation: RecordRef;
  readonly #runs = new Map<string, Run>();
  readonly #work: ImmutableRunIndexWork | undefined;
  #root: Node | undefined;
  #maximum: bigint;
  #version = Symbol("immutable-source-index");
  #journal: Assignment[] | undefined;

  /** Builds balanced local state at an explicit activation/recovery boundary. */
  public constructor(
    projection: ImmutableRunGenerationProjectionV1,
    work?: ImmutableRunIndexWork,
  ) {
    this.#generation = refCopy(projection.generation);
    this.#maximum = projection.maximumCounter;
    this.#work = work;
    for (const fact of projection.runs) {
      if (
        this.#runs.has(fact.run[0]) ||
        fact.source.length === 0 ||
        fact.counter > this.#maximum
      )
        throw new TypeError("Invalid trusted source-run projection.");
      const owned: ImmutableRunReachedRunV1 = Object.freeze({
        ...fact,
        run: refCopy(fact.run),
        origin: Object.freeze({ ...fact.origin }),
        anchor:
          fact.anchor === null
            ? null
            : Object.freeze({
                run: refCopy(fact.anchor.run),
                sourceEndOffset: fact.anchor.sourceEndOffset,
              }),
      });
      this.#runs.set(owned.run[0], {
        fact: owned,
        leaves: new Array<Leaf>(owned.source.length),
      });
    }
    const ordered: Leaf[] = [];
    for (const unit of projection.sourceUnits) {
      const run = this.requireRun(unit.run);
      if (
        !Number.isSafeInteger(unit.offset) ||
        unit.offset < 0 ||
        unit.offset >= run.fact.source.length ||
        run.leaves[unit.offset] !== undefined ||
        unit.text !== run.fact.source.charAt(unit.offset) ||
        unit.origin.kind !== run.fact.origin.kind ||
        unit.origin.id !== run.fact.origin.id
      )
        throw new TypeError("Invalid trusted source-unit projection.");
      const leaf = this.leaf(run, unit.offset, unit.visible);
      run.leaves[unit.offset] = leaf;
      ordered.push(leaf);
    }
    let expectedUnits = 0;
    for (const run of this.#runs.values())
      expectedUnits += run.fact.source.length;
    if (ordered.length !== expectedUnits)
      throw new TypeError("Source projection omits units.");
    this.#root = this.build(ordered, 0, ordered.length);
    if (this.#root) this.#root.parent = undefined;
    if (this.length !== projection.text.length)
      throw new TypeError("Source projection length differs.");
    if (this.#work) this.#work.rebuiltUnits += ordered.length;
  }

  /** Visible UTF-16 length without materializing text. */
  public get length(): number {
    return this.#root?.visible ?? 0;
  }
  /** Retained source units, including hidden history. */
  public get sourceLength(): number {
    return this.#root?.size ?? 0;
  }
  /** Current balanced-tree height for structural qualification. */
  public get height(): number {
    return this.#root?.height ?? 0;
  }
  /** Maximum observed run/erase counter in this generation. */
  public get maximumCounter(): bigint {
    return this.#maximum;
  }

  /** Returns exact detached spans for the requested visible range only. */
  public read(start: number, end: number): readonly ImmutableRunOriginSpanV1[] {
    const leaves = this.range(start, end);
    const groups: {
      origin: ImmutableRunReachedRunV1["origin"];
      parts: string[];
    }[] = [];
    for (const leaf of leaves) {
      const origin = leaf.run.fact.origin;
      let group = groups.at(-1);
      if (
        !group ||
        group.origin.kind !== origin.kind ||
        group.origin.id !== origin.id
      ) {
        group = { origin, parts: [] };
        groups.push(group);
      }
      group.parts.push(leaf.run.fact.source.charAt(leaf.offset));
    }
    if (this.#work) this.#work.readUnits += leaves.length;
    return Object.freeze(
      groups.map((group) =>
        Object.freeze({ text: group.parts.join(""), origin: group.origin }),
      ),
    );
  }

  /** Resolves the preceding visible unit without scanning hidden source. */
  public anchorAt(offset: number): ImmutableRunReachedRunV1["anchor"] {
    this.boundary(offset);
    if (offset === 0) return null;
    const leaf = this.select(offset - 1);
    return Object.freeze({
      run: leaf.run.fact.run,
      sourceEndOffset: leaf.offset + 1,
    });
  }

  /**
   * Stages trusted local preparation, restores the accepted index, and returns a
   * one-use publication patch. Callback failure restores every prepared change.
   */
  public stage<T>(
    prepare: (index: ImmutableRunSourceIndex) => T,
  ): ImmutableRunPreparedIndexChange<T> {
    if (this.#journal !== undefined)
      throw new Error("Source index preparation is already active.");
    const journal: Assignment[] = [];
    const before = this.#version;
    const after = Symbol("immutable-source-index");
    this.#journal = journal;
    let value: T;
    try {
      value = prepare(this);
    } finally {
      for (let i = journal.length - 1; i >= 0; i--) journal[i]!.undo();
      this.#journal = undefined;
    }
    let committed = false;
    const assertCurrent = (): void => {
      if (committed || this.#journal !== undefined || this.#version !== before)
        throw new Error(
          "Source index preparation is stale or already consumed.",
        );
    };
    return {
      value,
      assertCurrent,
      commit: (): void => {
        assertCurrent();
        for (const assignment of journal) assignment.redo();
        this.#version = after;
        committed = true;
      },
    };
  }

  /**
   * Stages a fresh causally later run at its exact visible insertion offset.
   * The caller commits its body first to obtain the supplied immutable Ref.
   */
  public insert(offset: number, fact: ImmutableRunReachedRunV1): void {
    this.requirePreparation();
    this.boundary(offset);
    if (
      fact.counter !== this.#maximum + 1n ||
      fact.source.length === 0 ||
      this.#runs.has(fact.run[0])
    )
      throw new TypeError(
        "Local source insertion must be fresh and causally next.",
      );
    const expected = this.anchorAt(offset);
    if (
      (expected === null) !== (fact.anchor === null) ||
      (expected &&
        fact.anchor &&
        (!sameRef(expected.run, fact.anchor.run) ||
          expected.sourceEndOffset !== fact.anchor.sourceEndOffset))
    )
      throw new TypeError(
        "Source insertion anchor differs from the authored offset.",
      );
    const owned: ImmutableRunReachedRunV1 = Object.freeze({
      ...fact,
      run: refCopy(fact.run),
      origin: Object.freeze({ ...fact.origin }),
      anchor: expected,
    });
    const run: Run = { fact: owned, leaves: [] };
    for (let i = 0; i < owned.source.length; i++)
      run.leaves.push(this.leaf(run, i, true));
    const at =
      expected === null
        ? 0
        : this.rank(
            this.requireLeaf(expected.run, expected.sourceEndOffset - 1),
            false,
          ) + 1;
    const [left, right] = this.split(this.#root, at);
    const inserted = this.build(run.leaves, 0, run.leaves.length);
    this.rootTo(this.concat(this.concat(left, inserted), right));
    this.change(
      () => this.#runs.delete(owned.run[0]),
      () => this.#runs.set(owned.run[0], run),
    );
    this.counterTo(fact.counter);
  }

  /** Stages an observed visible deletion and returns its canonical source intervals. */
  public erase(
    start: number,
    end: number,
    counter: bigint,
  ): readonly ImmutableRunObservedIntervalV1[] {
    this.requirePreparation();
    const selected = this.range(start, end);
    if (selected.length === 0) return [];
    if (counter !== this.#maximum + 1n)
      throw new TypeError("Erase counter must be causally next.");
    for (const leaf of selected) this.visibleTo(leaf, 0);
    this.counterTo(counter);
    const sorted = [...selected].sort((a, b) => {
      const x = a.run.fact.run,
        y = b.run.fact.run;
      return x[0] < y[0]
        ? -1
        : x[0] > y[0]
          ? 1
          : x[1] < y[1]
            ? -1
            : x[1] > y[1]
              ? 1
              : a.offset - b.offset;
    });
    const intervals: { run: RecordRef; start: number; end: number }[] = [];
    for (const leaf of sorted) {
      const previous = intervals.at(-1);
      if (
        previous &&
        sameRef(previous.run, leaf.run.fact.run) &&
        previous.end === leaf.offset
      )
        previous.end++;
      else
        intervals.push({
          run: leaf.run.fact.run,
          start: leaf.offset,
          end: leaf.offset + 1,
        });
    }
    return Object.freeze(intervals.map((interval) => Object.freeze(interval)));
  }

  /** Captures source neighbours without registering a holder or rewriting it on edits. */
  public createPosition(
    offset: number,
    affinity: "before" | "after",
  ): ImmutableRunIndexPosition {
    this.boundary(offset);
    const left = offset === 0 ? undefined : this.select(offset - 1);
    const right = offset === this.length ? undefined : this.select(offset);
    return Object.freeze({
      generation: this.#generation,
      affinity,
      left: left
        ? Object.freeze({ run: left.run.fact.run, end: left.offset + 1 })
        : null,
      right: right
        ? Object.freeze({ run: right.run.fact.run, start: right.offset })
        : null,
    });
  }

  /** Resolves source neighbours in this exact generation; obsolete generations refuse. */
  public resolvePosition(
    position: ImmutableRunIndexPosition,
  ): number | undefined {
    if (!sameRef(position.generation, this.#generation)) return undefined;
    const edge =
      position.affinity === "before" ? position.left : position.right;
    if (edge === null) return position.affinity === "before" ? 0 : this.length;
    const offset = "end" in edge ? edge.end - 1 : edge.start;
    const run = this.#runs.get(edge.run[0]);
    if (
      !run ||
      !sameRef(run.fact.run, edge.run) ||
      !Number.isSafeInteger(offset) ||
      offset < 0
    )
      return undefined;
    const leaf = run.leaves[offset];
    if (!leaf) return undefined;
    if (position.affinity === "after" && leaf.visible === 0) {
      // The selected right unit was deleted. Preserve its observed gap via
      // the paired left source boundary, before fresh same-gap children.
      // The editor separately verifies any text it intends to undo there.
      if (position.left === null) return 0;
      const left = position.left;
      const leftRun = this.#runs.get(left.run[0]);
      if (
        !leftRun ||
        !sameRef(leftRun.fact.run, left.run) ||
        !Number.isSafeInteger(left.end) ||
        left.end <= 0
      )
        return undefined;
      const leftLeaf = leftRun.leaves[left.end - 1];
      if (!leftLeaf) return undefined;
      return this.rank(leftLeaf, true) + leftLeaf.visible;
    }
    return (
      this.rank(leaf, true) +
      (position.affinity === "before" ? leaf.visible : 0)
    );
  }

  private requirePreparation(): void {
    if (this.#journal === undefined)
      throw new Error("Source mutation requires staged preparation.");
  }
  private visit(): void {
    if (this.#work) this.#work.pathVisits++;
  }
  private boundary(offset: number): void {
    if (!Number.isSafeInteger(offset) || offset < 0 || offset > this.length)
      throw new RangeError("Source offset is outside the visible text.");
  }
  private requireRun(ref: RecordRef): Run {
    const run = this.#runs.get(ref[0]);
    if (!run || !sameRef(run.fact.run, ref))
      throw new TypeError(
        "Source run is absent or has a different commitment.",
      );
    return run;
  }
  private requireLeaf(ref: RecordRef, offset: number): Leaf {
    const leaf = this.requireRun(ref).leaves[offset];
    if (!leaf) throw new RangeError("Source boundary is outside its run.");
    return leaf;
  }
  private leaf(run: Run, offset: number, visible: boolean): Leaf {
    if (this.#work) this.#work.allocatedUnits++;
    return {
      kind: "leaf",
      run,
      offset,
      parent: undefined,
      visible: visible ? 1 : 0,
      height: 1,
      size: 1,
    };
  }
  private change(undo: () => void, redo: () => void): void {
    redo();
    this.#journal?.push({ undo, redo });
  }
  private parentTo(node: Node, after: Branch | undefined): void {
    const before = node.parent;
    if (before !== after)
      this.change(
        () => {
          node.parent = before;
        },
        () => {
          node.parent = after;
        },
      );
  }
  private rootTo(after: Node | undefined): void {
    const before = this.#root;
    this.change(
      () => {
        this.#root = before;
      },
      () => {
        this.#root = after;
      },
    );
    if (after) this.parentTo(after, undefined);
  }
  private counterTo(after: bigint): void {
    const before = this.#maximum;
    this.change(
      () => {
        this.#maximum = before;
      },
      () => {
        this.#maximum = after;
      },
    );
  }
  private visibleTo(leaf: Leaf, after: number): void {
    let node: Node | undefined = leaf;
    while (node) {
      this.visit();
      const current: Node = node,
        before = current.visible;
      const value =
        current.kind === "leaf"
          ? after
          : current.left.visible + current.right.visible;
      if (before !== value)
        this.change(
          () => {
            current.visible = before;
          },
          () => {
            current.visible = value;
          },
        );
      node = current.parent;
    }
  }
  private branch(left: Node, right: Node): Branch {
    const result: Branch = {
      kind: "branch",
      left,
      right,
      parent: undefined,
      visible: left.visible + right.visible,
      height: 1 + Math.max(left.height, right.height),
      size: left.size + right.size,
    };
    this.parentTo(left, result);
    this.parentTo(right, result);
    return result;
  }
  private balance(tree: Branch): Node {
    const { left, right } = tree;
    if (left.height > right.height + 1) {
      const l = branchOf(left);
      if (l.left.height >= l.right.height)
        return this.branch(l.left, this.branch(l.right, right));
      const p = branchOf(l.right);
      return this.branch(
        this.branch(l.left, p.left),
        this.branch(p.right, right),
      );
    }
    if (right.height > left.height + 1) {
      const r = branchOf(right);
      if (r.right.height >= r.left.height)
        return this.branch(this.branch(left, r.left), r.right);
      const p = branchOf(r.left);
      return this.branch(
        this.branch(left, p.left),
        this.branch(p.right, r.right),
      );
    }
    return tree;
  }
  private concat(
    left: Node | undefined,
    right: Node | undefined,
  ): Node | undefined {
    this.visit();
    if (!left) return right;
    if (!right) return left;
    if (left.height > right.height + 1) {
      const l = branchOf(left);
      return this.balance(this.branch(l.left, this.concat(l.right, right)!));
    }
    if (right.height > left.height + 1) {
      const r = branchOf(right);
      return this.balance(this.branch(this.concat(left, r.left)!, r.right));
    }
    return this.branch(left, right);
  }
  private split(
    tree: Node | undefined,
    at: number,
  ): readonly [Node | undefined, Node | undefined] {
    this.visit();
    if (!tree) return [undefined, undefined];
    if (at === 0) return [undefined, tree];
    if (at === tree.size) return [tree, undefined];
    const branch = branchOf(tree);
    if (at < branch.left.size) {
      const [a, b] = this.split(branch.left, at);
      return [a, this.concat(b, branch.right)];
    }
    if (at === branch.left.size) return [branch.left, branch.right];
    const [a, b] = this.split(branch.right, at - branch.left.size);
    return [this.concat(branch.left, a), b];
  }
  private build(
    leaves: readonly Leaf[],
    start: number,
    end: number,
  ): Node | undefined {
    if (start === end) return undefined;
    if (end - start === 1) return leaves[start]!;
    const middle = start + Math.floor((end - start) / 2);
    return this.branch(
      this.build(leaves, start, middle)!,
      this.build(leaves, middle, end)!,
    );
  }
  private select(offset: number): Leaf {
    let tree = this.#root;
    if (!tree || offset < 0 || offset >= tree.visible)
      throw new RangeError("No visible source unit at this offset.");
    while (tree.kind === "branch") {
      this.visit();
      if (offset < tree.left.visible) tree = tree.left;
      else {
        offset -= tree.left.visible;
        tree = tree.right;
      }
    }
    this.visit();
    return tree;
  }
  private rank(leaf: Leaf, visible: boolean): number {
    let node: Node = leaf,
      result = 0;
    while (node.parent) {
      this.visit();
      const parent: Branch = node.parent;
      if (parent.right === node)
        result += visible ? parent.left.visible : parent.left.size;
      node = parent;
    }
    this.visit();
    return result;
  }
  private range(start: number, end: number): Leaf[] {
    this.boundary(start);
    this.boundary(end);
    if (start > end)
      throw new RangeError("Source range start follows its end.");
    const result: Leaf[] = [];
    const collect = (node: Node | undefined, a: number, b: number): void => {
      this.visit();
      if (!node || a === b) return;
      if (node.kind === "leaf") {
        result.push(node);
        return;
      }
      const left = node.left.visible;
      if (a < left) collect(node.left, a, Math.min(b, left));
      if (b > left) collect(node.right, Math.max(0, a - left), b - left);
    };
    collect(this.#root, start, end);
    return result;
  }
}
