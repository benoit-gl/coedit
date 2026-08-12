export interface DraftParticipant {
  freeze(): void;
  flush(): Promise<void>;
  unfreeze(): void;
}

export type RegisterDraftParticipant = (
  key: string,
  participant: DraftParticipant,
) => () => void;

/**
 * Coordinates UI drafts around workspace transitions. `begin()` freezes the
 * current participants synchronously, before the caller reaches its first
 * await, so no new draft can slip between the flush and the transition.
 */
export class DraftTransitionCoordinator {
  private readonly participants = new Map<string, DraftParticipant>();
  private active = false;

  register(key: string, participant: DraftParticipant): () => void {
    this.participants.set(key, participant);
    return () => {
      if (this.participants.get(key) === participant) this.participants.delete(key);
    };
  }

  begin(): DraftTransition | null {
    if (this.active) return null;
    this.active = true;
    const participants = [...this.participants.values()];
    for (const participant of participants) participant.freeze();
    return new DraftTransition(participants, () => { this.active = false; });
  }
}

export class DraftTransition {
  private released = false;

  constructor(
    private readonly participants: DraftParticipant[],
    private readonly releaseCoordinator: () => void,
  ) {}

  async flush(): Promise<void> {
    for (const participant of this.participants) await participant.flush();
  }

  release(): void {
    if (this.released) return;
    this.released = true;
    for (const participant of [...this.participants].reverse()) participant.unfreeze();
    this.releaseCoordinator();
  }
}
