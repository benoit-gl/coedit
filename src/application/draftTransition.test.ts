import { describe, expect, it } from "vitest";
import { DraftTransitionCoordinator, type DraftParticipant } from "./draftTransition";

function participant(name: string, events: string[], failure?: Error): DraftParticipant {
  return {
    freeze: () => events.push(`${name}:freeze`),
    flush: async () => {
      events.push(`${name}:flush`);
      if (failure) throw failure;
    },
    unfreeze: () => events.push(`${name}:unfreeze`),
  };
}

describe("DraftTransitionCoordinator", () => {
  it("freezes synchronously and flushes every participant before a transition", async () => {
    const events: string[] = [];
    const coordinator = new DraftTransitionCoordinator();
    coordinator.register("title", participant("title", events));
    coordinator.register("editor", participant("editor", events));

    const transition = coordinator.begin();
    expect(transition).not.toBeNull();
    expect(events).toEqual(["title:freeze", "editor:freeze"]);
    expect(coordinator.begin()).toBeNull();

    await transition!.flush();
    events.push("workspace:transition");
    transition!.release();

    expect(events).toEqual([
      "title:freeze",
      "editor:freeze",
      "title:flush",
      "editor:flush",
      "workspace:transition",
      "editor:unfreeze",
      "title:unfreeze",
    ]);
    expect(coordinator.begin()).not.toBeNull();
  });

  it("blocks the transition when a draft flush fails and can be released for retry", async () => {
    const events: string[] = [];
    const failure = new Error("save failed");
    const coordinator = new DraftTransitionCoordinator();
    coordinator.register("editor", participant("editor", events, failure));

    const transition = coordinator.begin()!;
    await expect(transition.flush()).rejects.toBe(failure);
    expect(events).toEqual(["editor:freeze", "editor:flush"]);
    transition.release();
    expect(events).toEqual(["editor:freeze", "editor:flush", "editor:unfreeze"]);
    expect(coordinator.begin()).not.toBeNull();
  });

  it("does not unregister a replacement participant through a stale cleanup", () => {
    const events: string[] = [];
    const coordinator = new DraftTransitionCoordinator();
    const unregisterOld = coordinator.register("editor", participant("old", events));
    coordinator.register("editor", participant("new", events));
    unregisterOld();

    coordinator.begin();
    expect(events).toEqual(["new:freeze"]);
  });
});
