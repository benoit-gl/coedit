import type { AiProposal, AiProviderMetadata } from "../domain/types";

export interface AiRequest {
  nodeId: string;
  prompt: string;
  contextHtml: string;
  signal: AbortSignal;
}

export interface AiProvider {
  readonly metadata: AiProviderMetadata;
  propose(request: AiRequest): Promise<AiProposal>;
}

// Deliberately no network provider is registered in the offline MVP. An Ollama
// implementation must be explicitly configured and must only run after a user action.

