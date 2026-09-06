import { buildWeeklyPlanPreview } from '../../../lib/path/logic';
import { goalColorStyle, startOfWeekMonday } from '../../../lib/path/schema';

/** @param {{ pathBundle?: object|null, onOpenPathWeek?: () => void }} props */
export function SelfPathWeekCard({ pathBundle, onOpenPathWeek }) {
  const week = buildWeeklyPlanPreview(pathBundle, startOfWeekMonday());
  const preview = week.todayBlocks.slice(0, 3);

  return (
    <article
      className={`self-hub-card self-hub-card--path-week${onOpenPathWeek ? ' self-hub-card--interactive' : ''}`}
      role={onOpenPathWeek ? 'button' : undefined}
      tabIndex={onOpenPathWeek ? 0 : undefined}
      onClick={onOpenPathWeek}
      onKeyDown={
        onOpenPathWeek
          ? (event) => {
              if (event.key === 'Enter' || event.key === ' ') {
                event.preventDefault();
                onOpenPathWeek();
              }
            }
          : undefined
      }
      aria-label="Open Path weekly plan"
    >
      <div className="self-path-week__head">
        <div>
          <p className="self-hub-card__eyebrow">WEEKLY PLAN</p>
          <h3 className="self-hub-card__action-title">{week.planTitle || week.weekLabel}</h3>
          {week.planTitle ? <p className="self-hub-card__body">{week.weekLabel}</p> : null}
        </div>
        <span className="self-path-week__open">
          Open Path
          <span aria-hidden>→</span>
        </span>
      </div>

      <div className="self-path-week__days" aria-hidden>
        {week.days.map((day) => (
          <div
            key={day.date}
            className={`self-path-week__day${day.isToday ? ' self-path-week__day--today' : ''}${day.isPast ? ' self-path-week__day--past' : ''}${day.count ? ' self-path-week__day--has' : ''}`}
          >
            <span>{day.short}</span>
            <strong>{day.count}</strong>
          </div>
        ))}
      </div>

      {week.total === 0 ? (
        <p className="self-hub-card__empty">No blocks this week — tap to plan in Path</p>
      ) : (
        <div className="self-path-week__today">
          <p className="self-path-week__meta">
            Today
            {week.total ? ` · ${week.done}/${week.total} done this week` : ''}
          </p>
          {preview.length === 0 ? (
            <p className="self-hub-card__empty">Nothing scheduled today</p>
          ) : (
            <ul className="self-path-week__list">
              {preview.map((block) => (
                <li key={block.id} style={goalColorStyle(block.color)}>
                  {block.color ? <span className="self-path-week__dot" /> : null}
                  <span className="self-path-week__time">{block.startTime || '—'}</span>
                  <span className={`self-path-week__title${block.status === 'Done' ? ' self-path-week__title--done' : ''}`}>
                    {block.title}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </article>
  );
}
