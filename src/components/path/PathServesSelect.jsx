import { LIFE_WHEEL_AREAS } from '../../lib/path/wheel';

const AREA_PREFIX = 'area:';

/**
 * What a block or template serves: one of the goals, or a life area when it serves no goal.
 * `onChange` gets `{ goalId, lifeAreaId }` with at most one of them set.
 */
export function PathServesSelect({ goalId, lifeAreaId, goals = [], onChange }) {
  const value = goalId || (lifeAreaId ? `${AREA_PREFIX}${lifeAreaId}` : '');
  return (
    <select
      className="input"
      value={value}
      onChange={(event) => {
        const next = event.target.value;
        onChange(next.startsWith(AREA_PREFIX)
          ? { goalId: null, lifeAreaId: next.slice(AREA_PREFIX.length) }
          : { goalId: next || null, lifeAreaId: null });
      }}
    >
      <option value="">No goal</option>
      {goals.length ? (
        <optgroup label="Goals">
          {goals.map((goal) => <option key={goal.id} value={goal.id}>{goal.title}</option>)}
        </optgroup>
      ) : null}
      <optgroup label="Life area · no goal">
        {LIFE_WHEEL_AREAS.map((area) => (
          <option key={area.id} value={`${AREA_PREFIX}${area.id}`}>{area.label}</option>
        ))}
      </optgroup>
    </select>
  );
}
