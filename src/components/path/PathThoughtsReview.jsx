import { useMemo } from 'react';
import { startOfWeekMonday, weekDates } from '../../lib/path/schema';
import { collectThoughtsForRange, formatThoughtCapacityLabel, formatThoughtClock, groupThoughtsByPathBlock } from '../../utils/dayThoughts';

export function PathThoughtsReview({ lifelineDays = {}, weekStart }) {
  const dates = useMemo(() => weekDates(weekStart || startOfWeekMonday()), [weekStart]);
  const thoughts = useMemo(
    () => collectThoughtsForRange(lifelineDays, dates),
    [lifelineDays, dates],
  );
  const groups = useMemo(() => groupThoughtsByPathBlock(thoughts), [thoughts]);

  if (!thoughts.length) {
    return (
      <section className="path-thoughts-review">
        <h2 className="path-thoughts-review__title">Σκέψεις της εβδομάδας</h2>
        <p className="path-thoughts-review__empty">Καμία σκέψη στα Path blocks αυτή την εβδομάδα.</p>
      </section>
    );
  }

  return (
    <section className="path-thoughts-review">
      <h2 className="path-thoughts-review__title">Σκέψεις ενώ δούλευες</h2>
      <p className="path-thoughts-review__lede">
        {thoughts.length} {thoughts.length === 1 ? 'σκέψη' : 'σκέψεις'} · ομαδοποιημένες ανά block
      </p>
      <div className="path-thoughts-review__groups">
        {groups.map((group) => (
          <article key={group.id} className="path-thoughts-review__group">
            <h3>{group.title}</h3>
            <ul>
              {group.thoughts.map((thought) => (
                <li key={thought.id}>
                  <span className="path-thoughts-review__time">{formatThoughtClock(thought.at)}</span>
                  <span className="path-thoughts-review__text">{thought.text}</span>
                  <span className="path-thoughts-review__meta">{formatThoughtCapacityLabel(thought)}</span>
                </li>
              ))}
            </ul>
          </article>
        ))}
      </div>
    </section>
  );
}
