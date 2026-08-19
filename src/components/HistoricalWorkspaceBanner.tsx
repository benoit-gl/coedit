interface HistoricalWorkspaceBannerProps {
  viewedRevision: number;
  currentRevision: number;
  backDisabled: boolean;
  restoreDisabled: boolean;
  onBack: () => void;
  onRestore: () => void;
}

export function HistoricalWorkspaceBanner({
  viewedRevision,
  currentRevision,
  backDisabled,
  restoreDisabled,
  onBack,
  onRestore,
}: HistoricalWorkspaceBannerProps) {
  const announcement = `Viewing revision ${viewedRevision}, read only. Current revision is ${currentRevision}.`;

  return (
    <>
      <section className="historical-banner" aria-label="Historical revision">
        <div className="historical-banner-copy">
          <strong>Viewing revision {viewedRevision}</strong>
          <span>Read only · current revision is {currentRevision}</span>
        </div>
        <div className="historical-banner-actions">
          <button className="primary" type="button" disabled={backDisabled} onClick={onBack}>
            Back to current
          </button>
          <button type="button" disabled={restoreDisabled} onClick={onRestore}>
            Restore as new revision…
          </button>
        </div>
      </section>
      <p className="sr-only" role="status" aria-live="polite" aria-atomic="true">{announcement}</p>
    </>
  );
}
