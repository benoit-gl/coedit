import type { DocumentGateway } from "./gateway";
import { MemoryDocumentGateway } from "./memoryGateway";
import { TauriDocumentGateway } from "./tauriGateway";

declare global {
  interface Window {
    __TAURI_INTERNALS__?: unknown;
  }
}

export const documentGateway: DocumentGateway = window.__TAURI_INTERNALS__
  ? new TauriDocumentGateway()
  : new MemoryDocumentGateway();

