export interface DocumentFileDialogs {
  chooseDocumentToOpen(): Promise<string | null>;
  chooseDocumentToCreate(suggestedName: string): Promise<string | null>;
  chooseExportPath(format: "json" | "markdown", title: string): Promise<string | null>;
  chooseBackupPath(title: string): Promise<string | null>;
}
