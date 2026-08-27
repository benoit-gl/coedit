import { getApplicationName } from "./appInfo";
import "./index.css";

/** Renders the minimal Step 1 browser page. */
export function App(): React.JSX.Element {
  return (
    <main className="shell">
      <section aria-labelledby="coedit-heading" className="card">
        <p className="eyebrow">Document-engine prototype</p>
        <h1 id="coedit-heading">{getApplicationName()}</h1>
        <p>
          The browser scaffold is ready. Document-domain implementation starts
          in Step 2.
        </p>
      </section>
    </main>
  );
}
