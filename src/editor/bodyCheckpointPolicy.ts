export interface BodyCheckpointPolicy {
  /**
   * Capture the preceding insertion segment before this numbered grapheme
   * would be applied.
   */
  batchCharacterThreshold: number;

  /** Seal a dirty edit group after this many milliseconds without a change. */
  idleTimeoutMs: number;
}

export const MAX_BODY_CHECKPOINT_IDLE_TIMEOUT_MS = 2_147_483_647;

export const DEFAULT_BODY_CHECKPOINT_POLICY: Readonly<BodyCheckpointPolicy> =
  Object.freeze({
    batchCharacterThreshold: 20,
    idleTimeoutMs: 30_000,
  });

function positiveSafeInteger(value: number, name: keyof BodyCheckpointPolicy): void {
  if (!Number.isSafeInteger(value) || value < 1) {
    throw new RangeError(`${name} must be a positive safe integer.`);
  }
}

export function validateBodyCheckpointPolicy(
  policy: BodyCheckpointPolicy,
): Readonly<BodyCheckpointPolicy> {
  positiveSafeInteger(policy.batchCharacterThreshold, "batchCharacterThreshold");
  positiveSafeInteger(policy.idleTimeoutMs, "idleTimeoutMs");
  if (policy.idleTimeoutMs > MAX_BODY_CHECKPOINT_IDLE_TIMEOUT_MS) {
    throw new RangeError(
      `idleTimeoutMs must not exceed ${MAX_BODY_CHECKPOINT_IDLE_TIMEOUT_MS}.`,
    );
  }
  return Object.freeze({
    batchCharacterThreshold: policy.batchCharacterThreshold,
    idleTimeoutMs: policy.idleTimeoutMs,
  });
}
