import { open, save } from "@tauri-apps/plugin-dialog";
import type { DocumentFileDialogs } from "./fileDialogs";

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
    defaultPath: `${suggestedName.replace(/[^a-z0-9_-]+/gi, "-").toLocaleLowerCase() || "document"}.coedit`,
    filters: [{ name: "Coedit document", extensions: ["coedit"] }],
  });
}

async function chooseExportPath(format: "json" | "markdown", title: string): Promise<string | null> {
  const extension = format === "json" ? "json" : "md";
  return save({
    defaultPath: `${title.replace(/[^a-z0-9_-]+/gi, "-").toLocaleLowerCase() || "document"}.${extension}`,
    filters: [{ name: format === "json" ? "JSON" : "Markdown", extensions: [extension] }],
  });
}

async function chooseBackupPath(title: string): Promise<string | null> {
  return save({
    defaultPath: `${title.replace(/[^a-z0-9_-]+/gi, "-").toLocaleLowerCase() || "document"}.coedit-backup`,
    filters: [{ name: "Coedit backup", extensions: ["coedit-backup"] }],
  });
}

export const tauriFileDialogs: DocumentFileDialogs = {
  chooseDocumentToOpen,
  chooseDocumentToCreate,
  chooseExportPath,
  chooseBackupPath,
};
