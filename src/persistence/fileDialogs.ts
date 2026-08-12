import type { ExportFormat } from "../domain/types";

const WINDOWS_RESERVED_FILENAME = /^(?:con|prn|aux|nul|com[1-9]|lpt[1-9])$/i;

/** Produces a normalized, portable download/path suggestion without splitting Unicode code points. */
export function safeFilenameStem(value: string): string {
  const normalized = value
    .normalize("NFKD")
    .replace(/\p{M}+/gu, "")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}_-]+/gu, "-")
    .replace(/-+/g, "-")
    .replace(/^[-_]+|[-_]+$/g, "");
  const stem = Array.from(normalized).slice(0, 100).join("").replace(/^[-_]+|[-_]+$/g, "");
  return stem && !WINDOWS_RESERVED_FILENAME.test(stem) ? stem : "document";
}

export interface DocumentFileDialogs {
  chooseDocumentToOpen(): Promise<string | null>;
  chooseDocumentToCreate(suggestedName: string): Promise<string | null>;
  chooseExportPath(format: ExportFormat, title: string): Promise<string | null>;
  chooseBackupPath(title: string): Promise<string | null>;
}
