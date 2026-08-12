import { open, save } from "@tauri-apps/plugin-dialog";
import type { ExportFormat } from "../domain/types";
import { safeFilenameStem, type DocumentFileDialogs } from "./fileDialogs";

async function chooseDocumentToOpen(): Promise<string | null> {
  const result = await open({
    multiple: false,
    directory: false,
    filters: [{ name: "Coedit document", extensions: ["coedit"] }],
  });
  return typeof result === "string" ? result : null;
}

async function chooseDocumentToCreate(suggestedName: string): Promise<string | null> {
  return save({
    defaultPath: `${safeFilenameStem(suggestedName)}.coedit`,
    filters: [{ name: "Coedit document", extensions: ["coedit"] }],
  });
}

async function chooseExportPath(format: ExportFormat, title: string): Promise<string | null> {
  const extension = format === "json" ? "json" : "md";
  return save({
    defaultPath: `${safeFilenameStem(title)}.${extension}`,
    filters: [{ name: format === "json" ? "JSON" : "Markdown", extensions: [extension] }],
  });
}

async function chooseBackupPath(title: string): Promise<string | null> {
  return save({
    defaultPath: `${safeFilenameStem(title)}.coedit-backup`,
    filters: [{ name: "Coedit backup", extensions: ["coedit-backup"] }],
  });
}

export const tauriFileDialogs: DocumentFileDialogs = {
  chooseDocumentToOpen,
  chooseDocumentToCreate,
  chooseExportPath,
  chooseBackupPath,
};
