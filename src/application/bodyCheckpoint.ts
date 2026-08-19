/**
 * Application-facing request produced by a body checkpoint coordinator.
 * Group identity belongs to the editing episode, not to the controller commit.
 */
export interface BodyCheckpointCommitRequest {
  nodeId: string;
  groupId: string;
  bodyHtml: string;
  yjsUpdate: string;
  yjsState: string;
}
