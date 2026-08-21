import { SelfIcon } from '../SelfIcons';

/** @param {{ nextAction: import('../../../utils/selfHubSchema').SelfHubNextAction, onStartFocus?: () => void, onOpenDayDetails?: () => void }} props */
export function SelfNextBestActionCard({ nextAction, onStartFocus, onOpenDayDetails }) {
  const lines = nextAction.message.split('. ').filter(Boolean);
  const title = lines[0] || nextAction.message;
  const detail = lines.slice(1).join('. ');

  return (
    <article
      className={`self-hub-card self-hub-card--next-action${onOpenDayDetails ? ' self-hub-card--interactive' : ''}`}
      role={onOpenDayDetails ? 'button' : undefined}
      tabIndex={onOpenDayDetails ? 0 : undefined}
      onClick={onOpenDayDetails}
      onKeyDown={
        onOpenDayDetails
          ? (event) => {
              if (event.key === 'Enter' || event.key === ' ') {
                event.preventDefault();
                onOpenDayDetails();
              }
            }
          : undefined
      }
      aria-label={onOpenDayDetails ? 'Λεπτομέρειες ημέρας' : undefined}
    >
      <div className="self-hub-card__split self-hub-card__split--action">
        <div className="self-hub-card__copy">
          <p className="self-hub-card__eyebrow">{nextAction.title}</p>
          <h3 className="self-hub-card__action-title">{title}</h3>
          {detail ? <p className="self-hub-card__body">{detail}</p> : null}
        </div>
        <button
          type="button"
          className="self-hub-card__focus-btn"
          onClick={(event) => {
            event.stopPropagation();
            onStartFocus?.();
          }}
        >
          <SelfIcon name="play" />
          <span>{nextAction.buttonLabel}</span>
        </button>
      </div>
    </article>
  );
}
