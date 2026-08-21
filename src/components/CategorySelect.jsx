import { useMemo, useState } from 'react';
import { DEFAULT_CATEGORIES, normalizeCategory } from '../utils/categories';

export function CategorySelect({
  value = '',
  onChange,
  options,
  id,
  className = '',
  allowCustom = true,
  placeholder = 'Κατηγορία',
}) {
  const [customMode, setCustomMode] = useState(false);
  const [customValue, setCustomValue] = useState('');

  const list = useMemo(() => {
    const base = options?.length ? options : DEFAULT_CATEGORIES;
    const current = normalizeCategory(value);
    const set = new Set(base.map((c) => normalizeCategory(c)).filter(Boolean));
    if (current) set.add(current);
    return Array.from(set);
  }, [options, value]);

  if (customMode) {
    return (
      <div className={`category-select category-select--custom ${className}`.trim()}>
        <input
          id={id}
          className="input input--sm category-select__input"
          value={customValue}
          onChange={(e) => setCustomValue(e.target.value)}
          placeholder="π.χ. Marketing"
          autoFocus
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              const next = normalizeCategory(customValue);
              if (next) onChange?.(next);
              setCustomMode(false);
              setCustomValue('');
            }
            if (e.key === 'Escape') {
              setCustomMode(false);
              setCustomValue('');
            }
          }}
        />
        <button
          type="button"
          className="btn btn--primary btn--sm"
          onClick={() => {
            const next = normalizeCategory(customValue);
            if (next) onChange?.(next);
            setCustomMode(false);
            setCustomValue('');
          }}
        >
          OK
        </button>
        <button
          type="button"
          className="btn btn--text btn--sm"
          onClick={() => {
            setCustomMode(false);
            setCustomValue('');
          }}
        >
          Cancel
        </button>
      </div>
    );
  }

  return (
    <select
      id={id}
      className={`input input--sm category-select ${className}`.trim()}
      value={normalizeCategory(value) || ''}
      onChange={(e) => {
        const next = e.target.value;
        if (next === '__custom__') {
          setCustomMode(true);
          return;
        }
        onChange?.(next || '');
      }}
      aria-label={placeholder}
    >
      <option value="">{placeholder}</option>
      {list.map((cat) => (
        <option key={cat} value={cat}>
          {cat}
        </option>
      ))}
      {allowCustom && <option value="__custom__">+ Νέα κατηγορία…</option>}
    </select>
  );
}

export function CategoryBadge({ category, className = '' }) {
  const label = normalizeCategory(category);
  if (!label) return null;
  return <span className={`category-badge ${className}`.trim()}>{label}</span>;
}
