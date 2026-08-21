import { SelfIcon } from '../SelfIcons';

export function SelfCompactHeader({ header, menuOpen, onMenuToggle, onOpenDayDetails, onNavigateHome, children }) {
  return (
    <header className="self-hub-header">
      <div className="self-hub-header__left">
        {onNavigateHome ? (
          <button
            type="button"
            className="self-hub-header__back"
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
        ) : null}
        {onOpenDayDetails ? (
          <button
            type="button"
            className="self-hub-header__date-btn"
            onClick={onOpenDayDetails}
            aria-label="Λεπτομέρειες ημέρας"
          >
            <span className="self-hub-header__calendar" aria-hidden>
              <SelfIcon name="calendar" />
            </span>
            <p className="self-hub-header__date">{header.dateLabel}</p>
          </button>
        ) : (
          <>
            <span className="self-hub-header__calendar" aria-hidden>
              <SelfIcon name="calendar" />
            </span>
            <p className="self-hub-header__date">{header.dateLabel}</p>
          </>
        )}
      </div>

      {header.displayName ? (
        <p className="self-hub-header__name">{header.displayName}</p>
      ) : (
        <span className="self-hub-header__name-spacer" />
      )}

      <div className="self-hub-header__right">
        <div className="self-hub-header__pill">
          <span className="self-hub-header__pill-dot" />
          <span className="self-hub-header__pill-label">{header.systemStatusLabel}</span>
        </div>
        <button
          type="button"
          className="self-hub-header__menu-btn"
          aria-label="More options"
          aria-expanded={menuOpen}
          onClick={onMenuToggle}
        >
          <SelfIcon name="menu" />
        </button>
        {menuOpen ? children : null}
      </div>

      {header.updatedLabel ? (
        <p className="self-hub-header__updated">{header.updatedLabel}</p>
      ) : null}
    </header>
  );
}
