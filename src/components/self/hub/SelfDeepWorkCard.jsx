/** @param {{ deepWork: import('../../../utils/selfHubSchema').SelfHubDeepWork, onOpenDayDetails?: () => void }} props */
export function SelfDeepWorkCard({ deepWork, onOpenDayDetails }) {
  return (
    <article
      className={`self-hub-card self-hub-card--deep-work${onOpenDayDetails ? ' self-hub-card--interactive' : ''}`}
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
      <div className="self-hub-card__split">
        <div className="self-hub-card__copy">
          <p className="self-hub-card__eyebrow">TODAY&apos;S MODE</p>
          <h3 className="self-hub-card__title">{deepWork.mode}</h3>
          <p className="self-hub-card__body">{deepWork.message}</p>
        </div>
        <div className="self-hub-card__curve" aria-hidden>
          <svg viewBox="0 0 120 80" preserveAspectRatio="xMidYMid meet">
            <defs>
              <linearGradient id="deepWorkGlow" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#34d399" stopOpacity="0.55" />
                <stop offset="100%" stopColor="#34d399" stopOpacity="0" />
              </linearGradient>
              <filter id="deepWorkBlur">
                <feGaussianBlur stdDeviation="2" result="blur" />
              </filter>
            </defs>
            <path
              d="M8 58 C28 56, 42 18, 58 22 S88 52, 112 38"
              fill="none"
              stroke="#34d399"
              strokeWidth="2.5"
              strokeLinecap="round"
              filter="url(#deepWorkBlur)"
            />
            <path
              d="M8 58 C28 56, 42 18, 58 22 S88 52, 112 38 L112 70 L8 70 Z"
              fill="url(#deepWorkGlow)"
            />
          </svg>
        </div>
      </div>
    </article>
  );
}
