import { useMemo } from 'react';
import { startOfWeekMonday } from '../../lib/path/schema';
import { formatDuration, formatWeekRange } from '../../lib/path/logic';
import { neglectedLifeAreas, weekLifeAreaTime } from '../../lib/path/areaTime';

const PARTS_SHOWN = 4;

function time(minutes) {
  return minutes > 0 ? formatDuration(Math.round(minutes)) : '—';
}

function partsLine(parts) {
  if (!parts.length) return null;
  const names = parts.slice(0, PARTS_SHOWN).map((part) => part.title);
  if (parts.length > PARTS_SHOWN) names.push(`+${parts.length - PARTS_SHOWN} ακόμα`);
  return names.join(' · ');
}

function Row({ name, color, score, row, scale, muted = false }) {
  const width = (minutes) => `${scale ? Math.min(100, (minutes / scale) * 100) : 0}%`;
  const parts = partsLine(row.parts);
  return (
    <li className={`path-area-time__row${muted ? ' path-area-time__row--muted' : ''}`} style={color ? { '--path-area-color': color } : undefined}>
      <span className="path-area-time__name">
        <span className="path-area-time__dot" aria-hidden="true" />
        {name}
      </span>
      <span className="path-area-time__num">{score ?? '–'}</span>
      <span className="path-area-time__num">{time(row.logged)}</span>
      <span className="path-area-time__num">{time(row.planned)}</span>
      <span className="path-area-time__bar" aria-hidden="true">
        <i className="path-area-time__bar-planned" style={{ width: width(row.planned) }} />
        <i className="path-area-time__bar-logged" style={{ width: width(row.logged) }} />
      </span>
      {parts ? <span className="path-area-time__parts">{parts}</span> : null}
    </li>
  );
}

/** Review: the week's block time per life-wheel area, next to the score each area has on the wheel. */
export function PathAreaTimeReview({ path, weekStart }) {
  const week = weekStart || startOfWeekMonday();
  const data = useMemo(
    () => weekLifeAreaTime({ plan: path.plan, goals: path.goals, blocks: path.blocks }, week),
    [path.plan, path.goals, path.blocks, week],
  );
  const neglected = neglectedLifeAreas(data.areas);
  const scale = Math.max(
    0,
    ...data.areas.map((area) => Math.max(area.planned, area.logged)),
    data.unassigned.planned,
    data.unassigned.logged,
  );
  const hasUnassigned = data.unassigned.planned > 0 || data.unassigned.logged > 0;

  return (
    <section className="path-area-time">
      <h2 className="path-area-time__title">Χρόνος ανά τομέα ζωής</h2>
      {!data.planned && !data.logged ? (
        <p className="path-area-time__lede">{formatWeekRange(week)} · Κανένα block με διάρκεια αυτή την εβδομάδα.</p>
      ) : (
        <>
          <p className="path-area-time__lede">
            {formatWeekRange(week)} · έγιναν {time(data.logged)} από {time(data.planned)} στο πρόγραμμα
          </p>
          <ul className="path-area-time__list">
            <li className="path-area-time__row path-area-time__row--head" aria-hidden="true">
              <span className="path-area-time__name">Τομέας</span>
              <span className="path-area-time__num">Wheel</span>
              <span className="path-area-time__num">Έγιναν</span>
              <span className="path-area-time__num">Πλάνο</span>
            </li>
            {data.areas.map((area) => (
              <Row key={area.id} name={area.label} color={area.color} score={area.score} row={area} scale={scale} />
            ))}
            {hasUnassigned ? (
              <Row name="Χωρίς τομέα" score="" row={data.unassigned} scale={scale} muted />
            ) : null}
          </ul>
          {hasUnassigned ? (
            <p className="path-area-time__note">
              Για να μετρήσουν σε τομέα: όρισε «Wheel area» στο goal, ή τομέα στο block που δεν έχει goal.
            </p>
          ) : null}
          {neglected.length ? (
            <p className="path-area-time__note path-area-time__note--attention">
              Χαμηλό σκορ στο Wheel και κανένα block αυτή την εβδομάδα:{' '}
              {neglected.map((area) => `${area.label} (${area.score})`).join(', ')}.
            </p>
          ) : null}
        </>
      )}
    </section>
  );
}
