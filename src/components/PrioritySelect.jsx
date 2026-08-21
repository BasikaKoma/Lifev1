import { PRIORITY_LEVELS, getPriorityMeta, normalizePriority } from '../constants/priority';

export function PriorityBadge({ priority, className = '' }) {
  const meta = getPriorityMeta(priority);
  if (!meta.value) return null;
  return (
    <span
      className={`priority-badge priority-badge--${meta.className} ${className}`.trim()}
      title={`Προτεραιότητα: ${meta.label}`}
    >
      {meta.label}
    </span>
  );
}

export function PrioritySelect({
  value = '',
  onChange,
  id,
  className = '',
  compact = false,
  ariaLabel = 'Προτεραιότητα',
}) {
  const normalized = normalizePriority(value);
  const meta = getPriorityMeta(normalized);

  if (compact) {
    return (
      <select
        id={id}
        className={[
          'priority-select',
          'priority-select--compact',
          'priority-select--premium',
          meta.className !== 'none' ? `priority-select--${meta.className}` : '',
          className,
        ]
          .filter(Boolean)
          .join(' ')}
        value={normalized}
        onChange={(e) => onChange?.(normalizePriority(e.target.value))}
        onClick={(e) => e.stopPropagation()}
        onPointerDown={(e) => e.stopPropagation()}
        aria-label={ariaLabel}
        title={meta.value ? `Προτεραιότητα: ${meta.label}` : ariaLabel}
      >
        {PRIORITY_LEVELS.map((level) => (
          <option key={level.value || 'none'} value={level.value}>
            {level.value ? level.label : '—'}
          </option>
        ))}
      </select>
    );
  }

  return (
    <label className={`priority-select-wrap ${className}`.trim()} htmlFor={id}>
      <span className="priority-select-wrap__label">Προτεραιότητα</span>
      <select
        id={id}
        className={[
          'input',
          'input--sm',
          'priority-select',
          'priority-select--premium',
          meta.className !== 'none' ? `priority-select--${meta.className}` : '',
        ]
          .filter(Boolean)
          .join(' ')}
        value={normalized}
        onChange={(e) => onChange?.(normalizePriority(e.target.value))}
        aria-label={ariaLabel}
      >
        {PRIORITY_LEVELS.map((level) => (
          <option key={level.value || 'none'} value={level.value}>
            {level.value ? level.label : 'Χωρίς'}
          </option>
        ))}
      </select>
    </label>
  );
}
