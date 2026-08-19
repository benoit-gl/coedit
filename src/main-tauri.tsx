import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App";
import { tauriFileDialogs } from "./persistence/tauriFiles";
import { TauriDocumentGateway } from "./persistence/tauriGateway";
import "./styles.css";
import "./historyGroups.css";

const documentGateway = new TauriDocumentGateway();

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App
      documentGateway={documentGateway}
      revisionQueryCapability={documentGateway.revisionQueryCapability}
      fileDialogs={tauriFileDialogs}
    />
  </StrictMode>,
);
