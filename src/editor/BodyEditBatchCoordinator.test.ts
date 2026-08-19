import { afterEach, describe, expect, it, vi } from "vitest";
import {
  BodyEditBatchCoordinator,
  MAX_PENDING_BODY_CHECKPOINTS,
  type CapturedBodyCheckpoint,
} from "./BodyEditBatchCoordinator";
import { countGraphemeClusters } from "./bodyEditTransaction";

interface Deferred<T> {
  promise: Promise<T>;
  resolve: (value: T) => void;
  reject: (reason: unknown) => void;
}

function deferred<T>(): Deferred<T> {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((onResolve, onReject) => {
    resolve = onResolve;
    reject = onReject;
  });
  return { promise, resolve, reject };
}

async function microtasks(): Promise<void> {
  await Promise.resolve();
  await Promise.resolve();
}

interface Harness {
  coordinator: BodyEditBatchCoordinator;
  captures: CapturedBodyCheckpoint[];
  commits: CapturedBodyCheckpoint[];
  body(): string;
  insert(text: string): ReturnType<BodyEditBatchCoordinator["acceptChange"]>;
  delete(change?: (body: string) => string): ReturnType<BodyEditBatchCoordinator["acceptChange"]>;
  atomic(change: (body: string) => string): ReturnType<BodyEditBatchCoordinator["acceptChange"]>;
  beginComposition(): ReturnType<BodyEditBatchCoordinator["beginComposition"]>;
  compose(text: string): ReturnType<BodyEditBatchCoordinator["acceptCompositionChange"]>;
}

function harness(options: {
  threshold?: number;
  idleTimeoutMs?: number;
  commit?: (checkpoint: Readonly<CapturedBodyCheckpoint>) => Promise<void>;
  captureFailure?: () => unknown | null;
} = {}): Harness {
  let body = "";
  let pendingUpdate = false;
  let group = 0;
  const captures: CapturedBodyCheckpoint[] = [];
  const commits: CapturedBodyCheckpoint[] = [];
  const coordinator = new BodyEditBatchCoordinator({
    nodeId: "node-1",
    policy: {
      batchCharacterThreshold: options.threshold ?? 3,
      idleTimeoutMs: options.idleTimeoutMs ?? 1_000,
    },
    allocateGroupId: () => `group-${++group}`,
    captureCheckpoint: (request) => {
      const failure = options.captureFailure?.();
      if (failure) throw failure;
      if (!pendingUpdate) return null;
      pendingUpdate = false;
      const checkpoint = Object.freeze({
        ...request,
        bodyHtml: body,
        yjsUpdate: `update:${body}`,
        yjsState: `state:${body}`,
      });
      captures.push(checkpoint);
      return checkpoint;
    },
    commitCheckpoint: async (checkpoint) => {
      commits.push(checkpoint);
      await options.commit?.(checkpoint);
    },
  });
  return {
    coordinator,
    captures,
    commits,
    body: () => body,
    insert: (text) => coordinator.acceptChange(
      { kind: "insertion", graphemeCount: countGraphemeClusters(text) },
      () => { body += text; pendingUpdate = true; },
    ),
    delete: (change = (value) => value.slice(0, -1)) => coordinator.acceptChange(
      { kind: "deletion" },
      () => { body = change(body); pendingUpdate = true; },
    ),
    atomic: (change) => coordinator.acceptChange(
      { kind: "atomic" },
      () => { body = change(body); pendingUpdate = true; },
    ),
    beginComposition: () => coordinator.beginComposition(),
    compose: (text) => coordinator.acceptCompositionChange(() => {
      body += text;
      pendingUpdate = true;
    }),
  };
}

afterEach(() => {
  vi.useRealTimers();
});

describe("BodyEditBatchCoordinator edit groups", () => {
  it("captures the preceding segment before the threshold grapheme and retains its group", async () => {
    const test = harness({ threshold: 3 });
    expect(test.insert("a")).toEqual({ accepted: true });
    expect(test.insert("b")).toEqual({ accepted: true });
    expect(test.captures).toEqual([]);

    expect(test.insert("c")).toEqual({ accepted: true });
    expect(test.body()).toBe("abc");
    expect(test.captures).toHaveLength(1);
    expect(test.captures[0]).toMatchObject({
      groupId: "group-1",
      reason: "character-threshold",
      bodyHtml: "ab",
    });
    expect(test.coordinator.getSnapshot()).toMatchObject({
      mode: "inserting",
      groupId: "group-1",
      segmentGraphemeCount: 1,
      dirty: true,
    });

    await test.coordinator.retry();
    expect(test.coordinator.focusChanged()).toBe(true);
    await test.coordinator.retry();
    expect(test.commits.map((checkpoint) => checkpoint.bodyHtml)).toEqual(["ab", "abc"]);
    expect(test.commits[1]).toMatchObject({ groupId: "group-1", reason: "focus-change" });

    test.insert("d");
    expect(test.coordinator.getSnapshot().groupId).toBe("group-2");
  });

  it("captures a large insertion atomically without synthesizing partial changes", async () => {
    const test = harness({ threshold: 3 });
    test.insert("abcd");

    expect(test.body()).toBe("abcd");
    expect(test.captures).toHaveLength(1);
    expect(test.captures[0]).toMatchObject({
      groupId: "group-1",
      reason: "character-threshold",
      bodyHtml: "abcd",
    });
    expect(test.coordinator.getSnapshot()).toMatchObject({
      mode: "inserting",
      groupId: "group-1",
      segmentGraphemeCount: 0,
      dirty: false,
    });
    await test.coordinator.retry();
  });

  it("seals insertion and deletion modes once at their transitions", async () => {
    const test = harness({ threshold: 20 });
    test.insert("ab");
    test.delete();
    test.delete();
    await test.coordinator.retry();
    test.insert("c");
    await test.coordinator.retry();
    test.coordinator.selectionChanged();
    await test.coordinator.retry();

    expect(test.commits).toMatchObject([
      { groupId: "group-1", reason: "insert-to-delete", bodyHtml: "ab" },
      { groupId: "group-2", reason: "delete-to-insert", bodyHtml: "" },
      { groupId: "group-3", reason: "cursor-move", bodyHtml: "c" },
    ]);
    expect(test.coordinator.selectionChanged()).toBe(true);
    expect(test.commits).toHaveLength(3);
  });

  it("seals prior work and persists an atomic edit in its own group", async () => {
    const test = harness({ threshold: 20 });
    test.insert("draft");
    expect(test.atomic(() => "final")).toEqual({ accepted: true });
    expect(test.coordinator.getSnapshot()).toMatchObject({
      mode: "clean",
      groupId: null,
      dirty: false,
      pendingCheckpointCount: 2,
      bodyChangesBlocked: true,
    });
    await test.coordinator.retry();

    expect(test.commits).toMatchObject([
      { groupId: "group-1", reason: "atomic-edit", bodyHtml: "draft" },
      { groupId: "group-2", reason: "atomic-edit", bodyHtml: "final" },
    ]);
  });

  it("seals prior work before composition and captures the final IME result once", async () => {
    const test = harness({ threshold: 20 });
    test.insert("draft");

    expect(test.beginComposition()).toEqual({ accepted: true });
    expect(test.captures).toMatchObject([
      { groupId: "group-1", reason: "atomic-edit", bodyHtml: "draft" },
    ]);
    expect(test.compose("に")).toEqual({ accepted: true });
    expect(test.compose("ほ")).toEqual({ accepted: true });
    expect(test.captures).toHaveLength(1);
    expect(test.coordinator.getSnapshot()).toMatchObject({
      compositionActive: true,
      dirty: true,
      groupId: "group-2",
    });

    expect(test.coordinator.endComposition()).toBe(true);
    await test.coordinator.retry();
    expect(test.commits).toMatchObject([
      { groupId: "group-1", reason: "atomic-edit", bodyHtml: "draft" },
      { groupId: "group-2", reason: "atomic-edit", bodyHtml: "draftにほ" },
    ]);
    expect(test.coordinator.getSnapshot()).toMatchObject({
      compositionActive: false,
      mode: "clean",
      dirty: false,
    });
  });

  it("reserves composition capacity before allowing browser changes", async () => {
    const gate = deferred<void>();
    const test = harness({
      threshold: 2,
      commit: () => gate.promise,
    });
    test.insert("a");
    test.insert("b");
    test.insert("c");
    expect(test.coordinator.getSnapshot().pendingCheckpointCount).toBe(2);

    expect(test.beginComposition()).toEqual({ accepted: false, reason: "blocked" });
    expect(test.compose("x")).toEqual({ accepted: false, reason: "blocked" });
    expect(test.body()).toBe("abc");

    gate.resolve();
    await microtasks();
    test.coordinator.dispose();
  });

  it("seals once after the injected idle timeout, including deletion", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-01-01T00:00:00.000Z"));
    const test = harness({ idleTimeoutMs: 50, threshold: 20 });
    test.insert("ab");
    test.delete();
    await test.coordinator.retry();

    await vi.advanceTimersByTimeAsync(49);
    expect(test.captures).toHaveLength(1);
    await vi.advanceTimersByTimeAsync(1);
    expect(test.captures).toHaveLength(2);
    expect(test.captures[1]).toMatchObject({
      groupId: "group-2",
      reason: "idle-timeout",
      bodyHtml: "a",
    });
    expect(test.coordinator.getSnapshot()).toMatchObject({ mode: "clean", groupId: null });
    await test.coordinator.retry();
  });

  it("closes an already-checkpointed group after idle without a no-op revision", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-01-01T00:00:00.000Z"));
    const test = harness({ threshold: 3, idleTimeoutMs: 50 });
    test.insert("abc");
    await test.coordinator.retry();
    expect(test.coordinator.getSnapshot().groupId).toBe("group-1");

    await vi.advanceTimersByTimeAsync(50);
    expect(test.coordinator.getSnapshot()).toMatchObject({ mode: "clean", groupId: null });
    expect(test.commits).toHaveLength(1);
    test.insert("d");
    expect(test.coordinator.getSnapshot().groupId).toBe("group-2");
  });

  it("resets the injected idle timer and cancels it on disposal", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-01-01T00:00:00.000Z"));
    const test = harness({ threshold: 20, idleTimeoutMs: 50 });
    test.insert("a");
    await vi.advanceTimersByTimeAsync(40);
    test.insert("b");
    await vi.advanceTimersByTimeAsync(40);
    expect(test.captures).toHaveLength(0);

    test.coordinator.dispose();
    await vi.advanceTimersByTimeAsync(100);
    expect(test.captures).toHaveLength(0);
  });
});

describe("BodyEditBatchCoordinator persistence", () => {
  it("enforces the two-checkpoint high-water mark and resumes after progress", async () => {
    expect(MAX_PENDING_BODY_CHECKPOINTS).toBe(2);
    const gates: Deferred<void>[] = [];
    const test = harness({
      threshold: 2,
      commit: () => {
        const gate = deferred<void>();
        gates.push(gate);
        return gate.promise;
      },
    });

    test.insert("a");
    test.insert("b");
    test.insert("c");
    expect(test.commits).toHaveLength(1);
    expect(test.coordinator.getSnapshot()).toMatchObject({
      pendingCheckpointCount: 2,
      bodyChangesBlocked: true,
      dirty: true,
    });
    expect(test.insert("d")).toEqual({ accepted: false, reason: "blocked" });
    expect(test.body()).toBe("abc");

    gates[0].resolve();
    await microtasks();
    expect(test.commits).toHaveLength(2);
    expect(test.coordinator.getSnapshot()).toMatchObject({
      pendingCheckpointCount: 1,
      bodyChangesBlocked: false,
    });
    gates[1].resolve();
    await microtasks();
    test.coordinator.dispose();
  });

  it("retains a failed immutable head and retries the exact object", async () => {
    const failure = new Error("save failed");
    let fail = true;
    const test = harness({
      threshold: 20,
      commit: async () => {
        if (fail) throw failure;
      },
    });
    test.insert("draft");
    test.coordinator.focusChanged();
    await microtasks();

    expect(test.coordinator.getSnapshot()).toMatchObject({
      persistenceState: "failed",
      failure,
      failurePhase: "persistence",
      pendingCheckpointCount: 1,
      bodyChangesBlocked: true,
    });
    expect(Object.isFrozen(test.commits[0])).toBe(true);
    expect(test.insert("x")).toEqual({ accepted: false, reason: "blocked" });
    test.coordinator.freeze();
    await expect(test.coordinator.flush()).rejects.toBe(failure);
    test.coordinator.unfreeze();
    expect(test.coordinator.getSnapshot().bodyChangesBlocked).toBe(true);

    fail = false;
    await test.coordinator.retry();
    expect(test.commits).toHaveLength(2);
    expect(test.commits[1]).toBe(test.commits[0]);
    expect(test.coordinator.getSnapshot()).toMatchObject({
      persistenceState: "idle",
      pendingCheckpointCount: 0,
      bodyChangesBlocked: false,
    });
  });

  it("keeps a queued successor behind a failed head without reordering", async () => {
    const firstAttempt = deferred<void>();
    const test = harness({
      threshold: 2,
      commit: (checkpoint) => test.commits.length === 1
        ? firstAttempt.promise
        : Promise.resolve(),
    });
    test.insert("a");
    test.insert("b");
    test.insert("c");
    const captured = [...test.captures];

    firstAttempt.reject(new Error("offline"));
    await microtasks();
    expect(test.coordinator.getSnapshot()).toMatchObject({
      persistenceState: "failed",
      pendingCheckpointCount: 2,
    });

    await test.coordinator.retry();
    expect(test.commits).toEqual([captured[0], captured[0], captured[1]]);
    expect(test.commits.map((checkpoint) => checkpoint.bodyHtml)).toEqual(["a", "a", "ab"]);
  });

  it("freezes and waits for capacity before capturing a controlled transition", async () => {
    const gates: Deferred<void>[] = [];
    const test = harness({
      threshold: 2,
      commit: () => {
        const gate = deferred<void>();
        gates.push(gate);
        return gate.promise;
      },
    });
    test.insert("a");
    test.insert("b");
    test.insert("c");
    test.coordinator.freeze();
    let flushed = false;
    const flushing = test.coordinator.flush().then(() => { flushed = true; });
    await microtasks();
    expect(flushed).toBe(false);
    expect(test.captures.map((checkpoint) => checkpoint.bodyHtml)).toEqual(["a", "ab"]);

    gates[0].resolve();
    await microtasks();
    expect(test.captures.map((checkpoint) => checkpoint.bodyHtml)).toEqual(["a", "ab", "abc"]);
    expect(test.coordinator.getSnapshot().pendingCheckpointCount).toBe(2);
    expect(test.captures[2].reason).toBe("controlled-transition");

    gates[1].resolve();
    await microtasks();
    gates[2].resolve();
    await flushing;
    expect(flushed).toBe(true);
    expect(test.coordinator.getSnapshot()).toMatchObject({
      mode: "clean",
      groupId: null,
      pendingCheckpointCount: 0,
      transitionFrozen: true,
    });
    test.coordinator.unfreeze();
    expect(test.coordinator.getSnapshot().bodyChangesBlocked).toBe(false);
  });

  it("retains a capture failure for explicit retry", async () => {
    const failure = new Error("checkpoint too large");
    let failCapture = true;
    const test = harness({
      threshold: 20,
      captureFailure: () => failCapture ? failure : null,
    });
    test.insert("draft");
    let caught: unknown;
    try {
      test.coordinator.focusChanged();
    } catch (error) {
      caught = error;
    }
    expect(caught).toBe(failure);
    expect(test.coordinator.getSnapshot()).toMatchObject({
      dirty: true,
      pendingCaptureReason: "focus-change",
      failure,
      failurePhase: "capture",
      bodyChangesBlocked: true,
    });

    failCapture = false;
    let retryError: unknown;
    try {
      await test.coordinator.retry();
    } catch (error) {
      retryError = error;
    }
    expect(retryError).toBeUndefined();
    expect(test.commits).toHaveLength(1);
    expect(test.commits[0]).toMatchObject({ bodyHtml: "draft", reason: "focus-change" });
    expect(test.coordinator.getSnapshot()).toMatchObject({
      mode: "clean",
      pendingCaptureReason: null,
      failure: null,
    });
  });

  it("creates no persistence work when synchronous capture reports no changes", async () => {
    const coordinator = new BodyEditBatchCoordinator({
      nodeId: "node-1",
      policy: { batchCharacterThreshold: 3, idleTimeoutMs: 50 },
      allocateGroupId: () => "group-1",
      captureCheckpoint: () => null,
      commitCheckpoint: vi.fn(async () => undefined),
    });
    coordinator.acceptChange({ kind: "insertion", graphemeCount: 1 }, () => undefined);
    expect(coordinator.focusChanged()).toBe(true);
    await coordinator.retry();
    expect(coordinator.getSnapshot()).toMatchObject({ mode: "clean", pendingCheckpointCount: 0 });
  });
});
