import { useMemo } from 'react';
import {
  checkpointLinkOptions,
  normalizeLinkedCheckpointIds,
  toggleLinkedCheckpointId,
} from '../utils/checkpointLinks';

export function CheckpointLinkSelect({
  stages = [],
  value = [],
  onChange,
  className = '',
  emptyLabel = 'Χωρίς σύνδεση με checkpoint',
}) {
  const options = useMemo(() => checkpointLinkOptions(stages), [stages]);
  const selected = normalizeLinkedCheckpointIds(value);

  if (options.length === 0) {
    return (
      <p className={`checkpoint-link-select checkpoint-link-select--empty ${className}`.trim()}>
        Δεν υπάρχουν checkpoints ακόμα
      </p>
    );
  }

  return (
    <fieldset className={`checkpoint-link-select ${className}`.trim()}>
      <legend className="checkpoint-link-select__legend">Checkpoints</legend>
      <p className="checkpoint-link-select__hint">{emptyLabel}</p>
      <ul className="checkpoint-link-select__list">
        {options.map((opt) => {
          const checked = selected.includes(opt.id);
          return (
            <li key={opt.id}>
              <label className={`checkpoint-link-select__option${checked ? ' is-checked' : ''}${opt.done ? ' is-done' : ''}`}>
                <input
                  type="checkbox"
                  checked={checked}
                  onChange={() => onChange?.(toggleLinkedCheckpointId(selected, opt.id))}
                />
                <span>{opt.label}</span>
              </label>
            </li>
          );
        })}
      </ul>
    </fieldset>
  );
}

export function CheckpointLinkBadges({ ids, stages = [] }) {
  const labels = useMemo(() => {
    const wanted = new Set(normalizeLinkedCheckpointIds(ids));
    if (!wanted.size) return [];
    return checkpointLinkOptions(stages)
      .filter((opt) => wanted.has(opt.id))
      .map((opt) => opt.label);
  }, [ids, stages]);

  if (!labels.length) return null;

  return (
    <div className="checkpoint-link-badges">
      {labels.map((label) => (
        <span key={label} className="checkpoint-link-badge" title={label}>
          {label}
        </span>
      ))}
    </div>
  );
}
