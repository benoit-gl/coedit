import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App";
import { tauriFileDialogs } from "./persistence/tauriFiles";
import { TauriDocumentGateway } from "./persistence/tauriGateway";
import "./styles.css";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App documentGateway={new TauriDocumentGateway()} fileDialogs={tauriFileDialogs} />
  </StrictMode>,
);
