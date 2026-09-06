/** @param {{ todayThree: import('../../../utils/selfHubSchema').SelfHubTodayThree, onOpenDayDetails?: () => void }} props */
export function SelfTodayThreeCard({ todayThree, onOpenDayDetails }) {
  return (
    <article
      className={`self-hub-card self-hub-card--today-three${onOpenDayDetails ? ' self-hub-card--interactive' : ''}`}
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
      <p className="self-hub-card__eyebrow">TODAY&apos;S 3</p>
      {todayThree.items.length === 0 ? (
        <p className="self-hub-card__empty">No tasks yet — add checkpoints in Projects</p>
      ) : (
        <ol className="self-hub-card__list">
          {todayThree.items.map((item, index) => (
            <li key={item.id} className="self-hub-card__list-item">
              <span className="self-hub-card__list-num">{index + 1}</span>
              <span className={`self-hub-card__list-text${item.done ? ' self-hub-card__list-text--done' : ''}`}>
                {item.text}
              </span>
              <span className={`self-hub-card__check${item.done ? ' self-hub-card__check--done' : ''}`} aria-hidden />
            </li>
          ))}
        </ol>
      )}
    </article>
  );
}
