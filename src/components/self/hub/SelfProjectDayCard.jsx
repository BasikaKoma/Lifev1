import { SelfIcon } from '../SelfIcons';
import { formatNoteClock, kindLabel } from '../../../utils/lifelineDays';

const MAX_ITEMS = 4;

const SECTIONS = [
  {
    key: 'completed',
    title: 'Ολοκληρώθηκαν',
    icon: 'checkCircle',
    emptyLabel: 'Τίποτα ολοκληρωμένο σήμερα',
  },
  {
    key: 'notes',
    title: 'Σημειώσεις',
    icon: 'note',
    emptyLabel: 'Καμία νέα σημείωση',
  },
  {
    key: 'scheduled',
    title: 'Σήμερα',
    icon: 'calendar',
    emptyLabel: 'Κανένα task με σημερινή ημερομηνία',
  },
];

function itemTimeLabel(item) {
  if (item.timeLabel) return item.timeLabel;
  const raw = item.timestamp || item.completedAt;
  return raw ? formatNoteClock(raw) : '';
}

function ProjectDayPanel({ title, icon, count, emptyLabel, items, showKind = false, onOpenDayDetails }) {
  const visible = items.slice(0, MAX_ITEMS);
  const overflow = items.length - visible.length;

  return (
    <article
      className={`self-project-day__panel${onOpenDayDetails ? ' self-project-day__panel--interactive' : ''}`}
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
      role={onOpenDayDetails ? 'button' : undefined}
      tabIndex={onOpenDayDetails ? 0 : undefined}
      aria-label={onOpenDayDetails ? `${title} — λεπτομέρειες ημέρας` : undefined}
    >
      <header className="self-project-day__panel-head">
        <span className="self-project-day__panel-icon" aria-hidden>
          <SelfIcon name={icon} />
        </span>
        <div className="self-project-day__panel-heading">
          <h4 className="self-project-day__panel-title">{title}</h4>
          <span className="self-project-day__panel-count">{count}</span>
        </div>
      </header>

      <div className="self-project-day__panel-body">
        {items.length === 0 ? (
          <p className="self-project-day__empty">{emptyLabel}</p>
        ) : (
          <ul className="self-project-day__list">
            {visible.map((item) => {
              const timeLabel = itemTimeLabel(item);
              return (
              <li key={item.id} className="self-project-day__item">
                <span
                  className={`self-project-day__dot self-project-day__dot--${item.kind || 'checkpoint'}${
                    item.done ? ' self-project-day__dot--done' : ''
                  }`}
                  aria-hidden
                />
                <div className="self-project-day__item-copy">
                  <span
                    className={`self-project-day__item-title${
                      item.done ? ' self-project-day__item-title--done' : ''
                    }`}
                    title={item.title}
                  >
                    {item.title}
                  </span>
                  <span className="self-project-day__item-meta">
                    {[timeLabel, item.projectTitle, item.stageTitle].filter(Boolean).join(' · ')}
                    {showKind && item.kind ? ` · ${kindLabel(item.kind)}` : ''}
                  </span>
                </div>
              </li>
              );
            })}
          </ul>
        )}
      </div>

      {overflow > 0 ? (
        <p className="self-project-day__overflow">+{overflow} ακόμα</p>
      ) : null}
    </article>
  );
}

/** @param {{ projectDay: import('../../../utils/selfHubSchema').SelfHubProjectDay, onOpenDayDetails?: () => void }} props */
export function SelfProjectDayCard({ projectDay, onOpenDayDetails }) {
  const itemsByKey = {
    completed: projectDay.completed,
    notes: projectDay.notes,
    scheduled: projectDay.scheduled,
  };

  return (
    <section className="self-project-day" aria-label="Σήμερα σε projects">
      <header className="self-project-day__header">
        <p className="self-project-day__eyebrow">ΣΗΜΕΡΑ ΣΕ PROJECTS</p>
        {onOpenDayDetails ? (
          <button
            type="button"
            className="self-project-day__details-btn"
            onClick={onOpenDayDetails}
          >
            Λεπτομέρειες ημέρας
            <span aria-hidden>→</span>
          </button>
        ) : null}
      </header>

      <div className="self-project-day__grid">
        {SECTIONS.map((section) => (
          <ProjectDayPanel
            key={section.key}
            title={section.title}
            icon={section.icon}
            count={itemsByKey[section.key].length}
            emptyLabel={section.emptyLabel}
            items={itemsByKey[section.key]}
            showKind={section.key !== 'notes'}
            onOpenDayDetails={onOpenDayDetails}
          />
        ))}
      </div>
    </section>
  );
}
