import { BRAIN_LEVELS } from '../../brain/config';

export function BrainLevelPicker({ level, onChange }) {
  return (
    <div className="brain-levels" role="radiogroup" aria-label="Επίπεδο Brain">
      {BRAIN_LEVELS.map((item) => {
        const active = item.id === level;
        return (
          <button
            key={item.id}
            type="button"
            role="radio"
            aria-checked={active}
            className={`brain-level${active ? ' brain-level--active' : ''}`}
            onClick={() => onChange(item.id)}
          >
            <span className="brain-level__name">{item.label}</span>
            <span className="brain-level__product">{item.productName}</span>
            <span className="brain-level__desc">{item.description}</span>
          </button>
        );
      })}
    </div>
  );
}
