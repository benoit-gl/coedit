import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App";
import { MemoryDocumentGateway } from "./persistence/memoryGateway";
import "./styles.css";
import "./historyGroups.css";

const documentGateway = new MemoryDocumentGateway();

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App
      documentGateway={documentGateway}
      revisionQueryCapability={documentGateway.revisionQueryCapability}
    />
  </StrictMode>,
);
