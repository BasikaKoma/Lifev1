import './cameras.css';

function formatStamp(iso) {
  if (!iso) return '';
  try {
    return new Date(iso).toLocaleTimeString('el-GR', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  } catch {
    return '';
  }
}

export function CamerasView({
  cameras = [],
  frames = {},
  supported = false,
  liveId = null,
  onSetLiveId,
  onOpenManage,
  onRefreshAll,
}) {
  return (
    <section className="cameras-view">
      <header className="cameras-view__header">
        <div>
          <h1 className="cameras-view__title">Devices</h1>
          <p className="cameras-view__subtitle">
            {supported
              ? 'Live snapshots από Dahua / NVR στο τοπικό δίκτυο.'
              : 'Χρειάζεται η εφαρμογή Windows ή Android στο ίδιο Wi‑Fi.'}
          </p>
        </div>
        <div className="cameras-view__actions">
          <button type="button" className="btn btn--outline" onClick={onRefreshAll} disabled={!cameras.length}>
            Ανανέωση
          </button>
          <button type="button" className="btn btn--primary" onClick={onOpenManage}>
            {cameras.length ? 'Διαχείριση' : 'Σύνδεση καμερών'}
          </button>
        </div>
      </header>

      {!cameras.length && (
        <div className="cameras-empty">
          <p>Δεν υπάρχουν κάμερες ακόμα.</p>
          <p className="cameras-empty__hint">
            Βάλε την LAN IP από το DMSS (συσκευή → πληροφορίες), χρήστη <strong>admin</strong> και κωδικό. Για NVR πρόσθεσε ένα κανάλι ανά κάμερα.
          </p>
        </div>
      )}

      {cameras.length > 0 && (
        <div className={`cameras-grid${liveId ? ' cameras-grid--live' : ''}`}>
          {cameras.map((camera) => {
            const frame = frames[camera.id];
            const isLive = liveId === camera.id;
            return (
              <article
                key={camera.id}
                className={`camera-card${isLive ? ' camera-card--live' : ''}`}
              >
                <button
                  type="button"
                  className="camera-card__frame"
                  onClick={() => onSetLiveId?.(isLive ? null : camera.id)}
                >
                  {frame?.dataUrl ? (
                    <img src={frame.dataUrl} alt={camera.name} />
                  ) : (
                    <span className="camera-card__placeholder">
                      {frame?.error ? 'Χωρίς εικόνα' : 'Σύνδεση…'}
                    </span>
                  )}
                  {isLive && <span className="camera-card__live">LIVE</span>}
                </button>
                <div className="camera-card__meta">
                  <div>
                    <h2 className="camera-card__name">{camera.name}</h2>
                    <p className="camera-card__addr">
                      {camera.host} · ch {camera.channel}
                    </p>
                  </div>
                  <p className={`camera-card__status${frame?.error ? ' camera-card__status--err' : ''}`}>
                    {frame?.error || formatStamp(frame?.at) || '—'}
                  </p>
                </div>
              </article>
            );
          })}
        </div>
      )}
    </section>
  );
}
