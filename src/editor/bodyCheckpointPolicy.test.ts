import { describe, expect, it } from "vitest";
import {
  DEFAULT_BODY_CHECKPOINT_POLICY,
  MAX_BODY_CHECKPOINT_IDLE_TIMEOUT_MS,
  validateBodyCheckpointPolicy,
} from "./bodyCheckpointPolicy";

describe("body checkpoint policy", () => {
  it("exports the one immutable production default", () => {
    expect(DEFAULT_BODY_CHECKPOINT_POLICY).toEqual({
      batchCharacterThreshold: 20,
      idleTimeoutMs: 30_000,
    });
    expect(Object.isFrozen(DEFAULT_BODY_CHECKPOINT_POLICY)).toBe(true);
  });

  it("returns a validated immutable copy and permits independent overrides", () => {
    const source = { batchCharacterThreshold: 3, idleTimeoutMs: 50 };
    const policy = validateBodyCheckpointPolicy(source);
    source.batchCharacterThreshold = 99;

    expect(policy).toEqual({ batchCharacterThreshold: 3, idleTimeoutMs: 50 });
    expect(Object.isFrozen(policy)).toBe(true);
    expect(validateBodyCheckpointPolicy({
      ...DEFAULT_BODY_CHECKPOINT_POLICY,
      batchCharacterThreshold: 7,
    })).toEqual({ batchCharacterThreshold: 7, idleTimeoutMs: 30_000 });
    expect(validateBodyCheckpointPolicy({
      ...DEFAULT_BODY_CHECKPOINT_POLICY,
      idleTimeoutMs: 75,
    })).toEqual({ batchCharacterThreshold: 20, idleTimeoutMs: 75 });
  });

  it.each([0, -1, 1.5, Number.NaN, Number.POSITIVE_INFINITY, Number.MAX_VALUE])(
    "rejects unsafe batchCharacterThreshold %s",
    (batchCharacterThreshold) => {
      expect(() => validateBodyCheckpointPolicy({
        batchCharacterThreshold,
        idleTimeoutMs: 50,
      })).toThrow(/batchCharacterThreshold/);
    },
  );

  it.each([0, -1, 1.5, Number.NaN, Number.POSITIVE_INFINITY])(
    "rejects unsafe idleTimeoutMs %s",
    (idleTimeoutMs) => {
      expect(() => validateBodyCheckpointPolicy({
        batchCharacterThreshold: 3,
        idleTimeoutMs,
      })).toThrow(/idleTimeoutMs/);
    },
  );

  it("rejects a timeout above the portable browser timer ceiling", () => {
    expect(() => validateBodyCheckpointPolicy({
      batchCharacterThreshold: 3,
      idleTimeoutMs: MAX_BODY_CHECKPOINT_IDLE_TIMEOUT_MS + 1,
    })).toThrow(`${MAX_BODY_CHECKPOINT_IDLE_TIMEOUT_MS}`);
  });
});
