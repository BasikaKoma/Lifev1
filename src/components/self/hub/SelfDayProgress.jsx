import { SelfIcon } from '../SelfIcons';

/** @param {{ dayProgress: import('../../../utils/selfHubSchema').SelfHubDayProgress, onOpenDayDetails?: () => void }} props */
export function SelfDayProgress({ dayProgress, onOpenDayDetails }) {
  const { currentHour, markers, segments } = dayProgress;
  const pct = Math.max(0, Math.min(100, (currentHour / 24) * 100));

  return (
    <section className="self-day-progress" aria-label="Day progress">
      <div className="self-day-progress__row">
        <button
          type="button"
          className="self-day-progress__play"
          aria-label="Λεπτομέρειες ημέρας"
          onClick={onOpenDayDetails}
        >
          <SelfIcon name="timelinePlay" />
        </button>
        <button
          type="button"
          className="self-day-progress__track-btn"
          onClick={onOpenDayDetails}
          aria-label="Λεπτομέρειες ημέρας"
        >
          <div className="self-day-progress__track-wrap">
            <div className="self-day-progress__track">
              <span className="self-day-progress__track-future" aria-hidden />
              {segments?.map((seg, i) => {
                const left = (seg.start / 24) * 100;
                const width = ((seg.end - seg.start) / 24) * 100;
                return (
                  <span
                    key={`${seg.tone}-${i}`}
                    className={`self-day-progress__segment self-day-progress__segment--${seg.tone}`}
                    style={{ left: `${left}%`, width: `${width}%` }}
                    title={seg.label}
                  />
                );
              })}
              <span className="self-day-progress__filled" style={{ width: `${pct}%` }} />
              <span className="self-day-progress__now" style={{ left: `${pct}%` }} aria-hidden />
            </div>
            <div className="self-day-progress__markers">
              {markers.map((marker) => (
                <span key={marker} className="self-day-progress__marker">
                  {marker}
                </span>
              ))}
            </div>
          </div>
        </button>
      </div>
      <div className="self-day-progress__footer">
        <span className="self-day-progress__sun" aria-hidden>
          <SelfIcon name="sun" />
        </span>
        <p className="self-day-progress__caption">Ημέρα</p>
      </div>
    </section>
  );
}
