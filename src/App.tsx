import { getApplicationName } from "./appInfo";
import "./index.css";

/** Renders the minimal browser status page. */
export function App(): React.JSX.Element {
  return (
    <main className="shell">
      <section aria-labelledby="coedit-heading" className="card">
        <p className="eyebrow">Document-engine prototype</p>
        <h1 id="coedit-heading">{getApplicationName()}</h1>
        <p>
          The browser scaffold and pure Block domain are ready. Attributed
          content implementation starts in Step 3.
        </p>
      </section>
    </main>
  );
}
