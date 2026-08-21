import { SelfIcon } from '../SelfIcons';
import { SelfHubMenu } from './SelfHubMenu';

export function SelfDesktopHeader({
  header,
  systemStatus,
  menuOpen,
  onMenuToggle,
  ouraStatus,
  ouraLoading,
  ouraBusy,
  scaleConnected,
  onOpenOuraModal,
  onOpenScaleModal,
  onSyncOura,
  onNavigateHome,
  children,
}) {
  const updatedLine =
    header.updatedLabel || (header.dataDay ? `data ${header.dataDay}` : null);

  return (
    <header className="self-view__header">
      {onNavigateHome ? (
        <button
          type="button"
          className="self-view__home"
          onClick={onNavigateHome}
          aria-label="Πίσω"
        >
          <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <path
              d="M15 6L9 12l6 6"
              stroke="currentColor"
              strokeWidth="1.75"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </button>
      ) : (
        <span className="self-view__home-spacer" aria-hidden />
      )}

      <div className="self-view__date">
        <p className="self-view__today">{header.dateLabel}</p>
        {updatedLine ? <p className="self-view__date-formatted">{updatedLine}</p> : null}
      </div>

      <div className="self-view__status-group">
        <div className="self-view__status">
          <span className="self-view__status-dot" aria-hidden />
          <div className="self-view__status-text">
            <span className="self-view__status-label">{systemStatus.label}</span>
            {systemStatus.sublabel ? (
              <span className="self-view__status-sublabel">{systemStatus.sublabel}</span>
            ) : null}
          </div>
        </div>

        <div className="self-view__oura-actions">
          <button
            type="button"
            className="self-view__oura-btn self-view__oura-btn--ghost"
            onClick={onOpenOuraModal}
          >
            {ouraStatus?.connected ? 'Oura' : 'Connect Oura'}
          </button>
          {ouraStatus?.connected ? (
            <button
              type="button"
              className="self-view__oura-btn"
              disabled={ouraBusy || ouraLoading}
              onClick={onSyncOura}
            >
              {ouraBusy ? 'Syncing…' : 'Sync'}
            </button>
          ) : null}
          <button type="button" className="self-view__oura-btn self-view__oura-btn--ghost" onClick={onOpenScaleModal}>
            {scaleConnected ? 'Scale' : 'Connect Scale'}
          </button>
        </div>

        <div className="self-view__menu-wrap">
          <button
            type="button"
            className="self-view__menu"
            aria-label="More options"
            aria-expanded={menuOpen}
            onClick={onMenuToggle}
          >
            <SelfIcon name="menu" />
          </button>
          {menuOpen ? children : null}
        </div>
      </div>
    </header>
  );
}
