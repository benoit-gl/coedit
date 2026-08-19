import type { BodyCheckpointCommitRequest } from "../application/bodyCheckpoint";
import { newId } from "../domain/ids";
import type { BodyContentChange } from "./bodyEditTransaction";
import {
  type BodyCheckpointPolicy,
  validateBodyCheckpointPolicy,
} from "./bodyCheckpointPolicy";

export const MAX_PENDING_BODY_CHECKPOINTS = 2;

export type BodyCheckpointReason =
  | "character-threshold"
  | "insert-to-delete"
  | "delete-to-insert"
  | "cursor-move"
  | "focus-change"
  | "idle-timeout"
  | "atomic-edit"
  | "controlled-transition";

export interface BodyCheckpointContent {
  bodyHtml: string;
  yjsUpdate: string;
  yjsState: string;
}

export interface BodyCheckpointCaptureRequest {
  nodeId: string;
  groupId: string;
  reason: BodyCheckpointReason;
}

export interface CapturedBodyCheckpoint extends BodyCheckpointCommitRequest {
  reason: BodyCheckpointReason;
}

export interface BodyCheckpointClock {
  now(): number;
  setTimeout(callback: () => void, delayMs: number): number;
  clearTimeout(handle: number): void;
}

export type BodyEditMode = "clean" | "inserting" | "deleting";
export type BodyCheckpointFailurePhase = "capture" | "persistence";

export interface BodyEditBatchSnapshot {
  mode: BodyEditMode;
  groupId: string | null;
  segmentGraphemeCount: number;
  dirty: boolean;
  pendingCheckpointCount: number;
  persistenceState: "idle" | "persisting" | "failed";
  bodyChangesBlocked: boolean;
  transitionFrozen: boolean;
  pendingCaptureReason: BodyCheckpointReason | null;
  failure: unknown | null;
  failurePhase: BodyCheckpointFailurePhase | null;
}

export type BodyChangeResult =
  | { accepted: true }
  | { accepted: false; reason: "blocked" | "capacity" };

export interface BodyEditBatchCoordinatorOptions {
  nodeId: string;
  policy: BodyCheckpointPolicy;
  captureCheckpoint: (
    request: Readonly<BodyCheckpointCaptureRequest>,
  ) => BodyCheckpointContent | null;
  commitCheckpoint: (checkpoint: Readonly<CapturedBodyCheckpoint>) => Promise<void>;
  allocateGroupId?: () => string;
  clock?: BodyCheckpointClock;
}

interface PendingCapture {
  reason: BodyCheckpointReason;
  seal: boolean;
}

interface PromiseWaiter {
  resolve: () => void;
  reject: (reason: unknown) => void;
}

const DEFAULT_CLOCK: BodyCheckpointClock = {
  now: () => Date.now(),
  setTimeout: (callback, delayMs) => globalThis.setTimeout(callback, delayMs),
  clearTimeout: (handle) => globalThis.clearTimeout(handle),
};

function requiredPositiveSafeInteger(value: number, name: string): void {
  if (!Number.isSafeInteger(value) || value < 1) {
    throw new RangeError(`${name} must be a positive safe integer.`);
  }
}

/**
 * UI-neutral body edit batching and persistence coordinator.
 *
 * The editor integration supplies semantic changes plus synchronous capture.
 * This class never reads React, Tiptap, ProseMirror, or Yjs directly.
 */
export class BodyEditBatchCoordinator {
  readonly policy: Readonly<BodyCheckpointPolicy>;

  private readonly nodeId: string;
  private readonly captureCheckpoint: BodyEditBatchCoordinatorOptions["captureCheckpoint"];
  private readonly commitCheckpoint: BodyEditBatchCoordinatorOptions["commitCheckpoint"];
  private readonly allocateGroupId: () => string;
  private readonly clock: BodyCheckpointClock;
  private readonly queue: CapturedBodyCheckpoint[] = [];
  private readonly listeners = new Set<() => void>();
  private readonly capacityWaiters: PromiseWaiter[] = [];
  private readonly drainWaiters: PromiseWaiter[] = [];

  private mode: BodyEditMode = "clean";
  private groupId: string | null = null;
  private segmentGraphemeCount = 0;
  private dirty = false;
  private transitionFrozen = false;
  private pendingCapture: PendingCapture | null = null;
  private failure: unknown | null = null;
  private failurePhase: BodyCheckpointFailurePhase | null = null;
  private pumpRunning = false;
  private idleTimer: number | null = null;
  private lastBodyChangeAt: number | null = null;
  private disposed = false;
  private cachedSnapshot: Readonly<BodyEditBatchSnapshot> | null = null;

  constructor(options: BodyEditBatchCoordinatorOptions) {
    if (!options.nodeId.trim()) throw new Error("nodeId must not be empty.");
    this.nodeId = options.nodeId;
    this.policy = validateBodyCheckpointPolicy(options.policy);
    this.captureCheckpoint = options.captureCheckpoint;
    this.commitCheckpoint = options.commitCheckpoint;
    this.allocateGroupId = options.allocateGroupId ?? newId;
    this.clock = options.clock ?? DEFAULT_CLOCK;
  }

  getSnapshot(): Readonly<BodyEditBatchSnapshot> {
    if (this.cachedSnapshot) return this.cachedSnapshot;
    this.cachedSnapshot = Object.freeze({
      mode: this.mode,
      groupId: this.groupId,
      segmentGraphemeCount: this.segmentGraphemeCount,
      dirty: this.dirty,
      pendingCheckpointCount: this.queue.length,
      persistenceState: this.failure !== null
        ? "failed"
        : this.pumpRunning || this.queue.length > 0
          ? "persisting"
          : "idle",
      bodyChangesBlocked: this.bodyChangesBlocked(),
      transitionFrozen: this.transitionFrozen,
      pendingCaptureReason: this.pendingCapture?.reason ?? null,
      failure: this.failure,
      failurePhase: this.failurePhase,
    });
    return this.cachedSnapshot;
  }

  subscribe(listener: () => void): () => void {
    this.assertAvailable();
    this.listeners.add(listener);
    return () => { this.listeners.delete(listener); };
  }

  acceptChange(change: BodyContentChange, applyChange: () => void): BodyChangeResult {
    this.assertAvailable();
    this.validateChange(change);
    if (this.bodyChangesBlocked()) return { accepted: false, reason: "blocked" };

    const requiredSlots = this.requiredCheckpointSlots(change);
    if (this.queue.length + requiredSlots > MAX_PENDING_BODY_CHECKPOINTS) {
      return { accepted: false, reason: "capacity" };
    }

    this.cancelIdleTimer();
    if (change.kind === "insertion") this.acceptInsertion(change.graphemeCount, applyChange);
    else if (change.kind === "deletion") this.acceptDeletion(applyChange);
    else this.acceptAtomic(applyChange);

    this.lastBodyChangeAt = this.clock.now();
    this.startPump();
    this.scheduleIdleTimer();
    this.emit();
    return { accepted: true };
  }

  selectionChanged(): boolean {
    return this.sealAtBoundary("cursor-move");
  }

  focusChanged(): boolean {
    return this.sealAtBoundary("focus-change");
  }

  /** DraftParticipant-compatible synchronous freeze. */
  freeze(): void {
    this.assertAvailable();
    this.transitionFrozen = true;
    this.cancelIdleTimer();
    this.emit();
  }

  /** DraftParticipant-compatible controlled-transition drain. */
  async flush(): Promise<void> {
    this.assertAvailable();
    while (this.dirty) {
      if (this.failure !== null) throw this.failure;
      if (this.pendingCapture !== null) {
        this.capturePendingIfPossible();
        if (this.failure !== null) throw this.failure;
        if (!this.dirty) break;
      }
      if (this.queue.length >= MAX_PENDING_BODY_CHECKPOINTS) {
        this.startPump();
        await this.waitForCapacity();
        continue;
      }
      this.captureCurrent("controlled-transition", true);
      this.startPump();
    }
    if (this.groupId !== null) this.closeGroupWithoutCapture();
    this.emit();
    await this.drainQueue();
  }

  /** DraftParticipant-compatible release; failures/backpressure still block. */
  unfreeze(): void {
    if (this.disposed) return;
    this.transitionFrozen = false;
    this.scheduleIdleTimer();
    this.emit();
  }

  async retry(): Promise<void> {
    this.assertAvailable();
    if (this.failure === null) {
      await this.drainQueue();
      return;
    }
    this.failure = null;
    this.failurePhase = null;
    this.capturePendingIfPossible();
    this.startPump();
    this.scheduleIdleTimer();
    this.emit();
    await this.drainQueue();
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.cancelIdleTimer();
    this.listeners.clear();
    this.cachedSnapshot = null;
    const error = new Error("The body edit batch coordinator was disposed.");
    this.rejectWaiters(this.capacityWaiters, error);
    this.rejectWaiters(this.drainWaiters, error);
  }

  private acceptInsertion(graphemeCount: number, applyChange: () => void): void {
    if (this.mode === "deleting" && this.dirty) {
      this.captureCurrent("delete-to-insert", true);
    } else if (
      this.mode === "inserting"
      && this.dirty
      && this.segmentGraphemeCount > 0
      && this.segmentGraphemeCount + graphemeCount >= this.policy.batchCharacterThreshold
    ) {
      this.captureCurrent("character-threshold", false);
    }

    const groupId = this.groupId ?? this.nextGroupId();
    applyChange();
    this.mode = "inserting";
    this.groupId = groupId;
    this.dirty = true;
    this.segmentGraphemeCount += graphemeCount;

    if (graphemeCount >= this.policy.batchCharacterThreshold) {
      this.captureCurrent("character-threshold", false);
    }
  }

  private acceptDeletion(applyChange: () => void): void {
    if (this.mode === "inserting" && this.dirty) {
      this.captureCurrent("insert-to-delete", true);
    }
    const groupId = this.mode === "deleting" && this.groupId
      ? this.groupId
      : this.nextGroupId();
    applyChange();
    this.mode = "deleting";
    this.groupId = groupId;
    this.segmentGraphemeCount = 0;
    this.dirty = true;
  }

  private acceptAtomic(applyChange: () => void): void {
    if (this.dirty) this.captureCurrent("atomic-edit", true);
    const groupId = this.nextGroupId();
    applyChange();
    this.mode = "inserting";
    this.groupId = groupId;
    this.segmentGraphemeCount = 0;
    this.dirty = true;
    this.captureCurrent("atomic-edit", true);
  }

  private requiredCheckpointSlots(change: BodyContentChange): number {
    if (change.kind === "atomic") return (this.dirty ? 1 : 0) + 1;
    if (change.kind === "deletion") {
      return this.mode === "inserting" && this.dirty ? 1 : 0;
    }

    let slots = this.mode === "deleting" && this.dirty ? 1 : 0;
    if (
      this.mode === "inserting"
      && this.dirty
      && this.segmentGraphemeCount > 0
      && this.segmentGraphemeCount + change.graphemeCount >= this.policy.batchCharacterThreshold
    ) slots += 1;
    if (change.graphemeCount >= this.policy.batchCharacterThreshold) slots += 1;
    return slots;
  }

  private sealAtBoundary(reason: "cursor-move" | "focus-change" | "idle-timeout"): boolean {
    this.assertAvailable();
    this.cancelIdleTimer();
    if (this.groupId === null) return true;
    if (!this.dirty) {
      this.closeGroupWithoutCapture();
      this.emit();
      return true;
    }
    if (this.failure !== null || this.queue.length >= MAX_PENDING_BODY_CHECKPOINTS) {
      this.pendingCapture ??= { reason, seal: true };
      this.emit();
      return false;
    }
    this.captureCurrent(reason, true);
    this.startPump();
    this.emit();
    return true;
  }

  private captureCurrent(reason: BodyCheckpointReason, seal: boolean): void {
    if (!this.dirty || !this.groupId) return;
    const request = Object.freeze({ nodeId: this.nodeId, groupId: this.groupId, reason });
    let content: BodyCheckpointContent | null;
    try {
      content = this.captureCheckpoint(request);
    } catch (error) {
      this.pendingCapture = { reason, seal };
      throw this.recordFailure(error, "capture");
    }

    if (content) {
      if (this.queue.length >= MAX_PENDING_BODY_CHECKPOINTS) {
        throw new Error("Body checkpoint capacity was exceeded.");
      }
      this.queue.push(Object.freeze({
        nodeId: this.nodeId,
        groupId: this.groupId,
        reason,
        bodyHtml: content.bodyHtml,
        yjsUpdate: content.yjsUpdate,
        yjsState: content.yjsState,
      }));
    }
    this.dirty = false;
    this.segmentGraphemeCount = 0;
    this.lastBodyChangeAt = null;
    if (seal) {
      this.mode = "clean";
      this.groupId = null;
    }
  }

  private capturePendingIfPossible(): void {
    if (
      !this.pendingCapture
      || this.failure !== null
      || this.queue.length >= MAX_PENDING_BODY_CHECKPOINTS
    ) return;
    const pending = this.pendingCapture;
    try {
      this.captureCurrent(pending.reason, pending.seal);
      this.pendingCapture = null;
    } catch {
      // captureCurrent retained the exact pending request and failure.
    }
  }

  private startPump(): void {
    if (this.pumpRunning || this.failure !== null || this.queue.length === 0) return;
    this.pumpRunning = true;
    this.emit();
    void this.runPump();
  }

  private async runPump(): Promise<void> {
    try {
      while (this.queue.length > 0 && this.failure === null) {
        const checkpoint = this.queue[0];
        try {
          await this.commitCheckpoint(checkpoint);
        } catch (error) {
          this.recordFailure(error, "persistence");
          return;
        }
        if (this.queue[0] === checkpoint) this.queue.shift();
        this.capturePendingIfPossible();
        this.resolveCapacityWaitersIfPossible();
        if (this.queue.length === 0 && this.pendingCapture === null) {
          this.resolveWaiters(this.drainWaiters);
        }
        this.scheduleIdleTimer();
        this.emit();
      }
    } finally {
      this.pumpRunning = false;
      if (this.failure === null && this.queue.length === 0 && this.pendingCapture === null) {
        this.resolveWaiters(this.drainWaiters);
      }
      this.emit();
    }
  }

  private waitForCapacity(): Promise<void> {
    if (this.failure !== null) return Promise.reject(this.failure);
    if (this.queue.length < MAX_PENDING_BODY_CHECKPOINTS && this.pendingCapture === null) {
      return Promise.resolve();
    }
    return new Promise<void>((resolve, reject) => {
      this.capacityWaiters.push({ resolve, reject });
    });
  }

  private drainQueue(): Promise<void> {
    if (this.failure !== null) return Promise.reject(this.failure);
    if (this.queue.length === 0 && this.pendingCapture === null) return Promise.resolve();
    this.startPump();
    return new Promise<void>((resolve, reject) => {
      this.drainWaiters.push({ resolve, reject });
    });
  }

  private resolveCapacityWaitersIfPossible(): void {
    if (this.queue.length < MAX_PENDING_BODY_CHECKPOINTS && this.pendingCapture === null) {
      this.resolveWaiters(this.capacityWaiters);
    }
  }

  private recordFailure(error: unknown, phase: BodyCheckpointFailurePhase): unknown {
    const failure = error ?? new Error(`Body checkpoint ${phase} failed.`);
    this.failure = failure;
    this.failurePhase = phase;
    this.cancelIdleTimer();
    this.rejectWaiters(this.capacityWaiters, failure);
    this.rejectWaiters(this.drainWaiters, failure);
    this.emit();
    return failure;
  }

  private scheduleIdleTimer(): void {
    this.cancelIdleTimer();
    if (this.groupId === null || this.lastBodyChangeAt === null || this.bodyChangesBlocked()) return;
    const elapsed = Math.max(0, this.clock.now() - this.lastBodyChangeAt);
    const remaining = this.policy.idleTimeoutMs - elapsed;
    if (remaining <= 0) {
      this.sealAtBoundary("idle-timeout");
      return;
    }
    this.idleTimer = this.clock.setTimeout(() => {
      this.idleTimer = null;
      try {
        this.sealAtBoundary("idle-timeout");
      } catch {
        // The snapshot exposes capture failure for an explicit retry.
      }
    }, remaining);
  }

  private cancelIdleTimer(): void {
    if (this.idleTimer === null) return;
    this.clock.clearTimeout(this.idleTimer);
    this.idleTimer = null;
  }

  private nextGroupId(): string {
    const groupId = this.allocateGroupId();
    if (!groupId.trim()) throw new Error("allocateGroupId must return a non-empty ID.");
    return groupId;
  }

  private closeGroupWithoutCapture(): void {
    this.mode = "clean";
    this.groupId = null;
    this.segmentGraphemeCount = 0;
    this.dirty = false;
    this.lastBodyChangeAt = null;
    this.cancelIdleTimer();
  }

  private bodyChangesBlocked(): boolean {
    return this.disposed
      || this.transitionFrozen
      || this.failure !== null
      || this.pendingCapture !== null
      || this.queue.length >= MAX_PENDING_BODY_CHECKPOINTS;
  }

  private validateChange(change: BodyContentChange): void {
    if (change.kind === "insertion") {
      requiredPositiveSafeInteger(change.graphemeCount, "graphemeCount");
    }
  }

  private assertAvailable(): void {
    if (this.disposed) throw new Error("The body edit batch coordinator was disposed.");
  }

  private resolveWaiters(waiters: PromiseWaiter[]): void {
    for (const waiter of waiters.splice(0)) waiter.resolve();
  }

  private rejectWaiters(waiters: PromiseWaiter[], error: unknown): void {
    for (const waiter of waiters.splice(0)) waiter.reject(error);
  }

  private emit(): void {
    this.cachedSnapshot = null;
    for (const listener of this.listeners) listener();
  }
}
