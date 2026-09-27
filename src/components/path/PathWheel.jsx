import { useState } from 'react';
import {
  LIFE_WHEEL_AREAS,
  WORK_WHEEL_AREAS,
  lowestWheelAreas,
  normalizeWheel,
} from '../../lib/path/wheel';

function polar(cx, cy, radius, degFromTop) {
  const rad = ((degFromTop - 90) * Math.PI) / 180;
  return [cx + radius * Math.cos(rad), cy + radius * Math.sin(rad)];
}

function sectorPath(cx, cy, radius, start, end) {
  const [x1, y1] = polar(cx, cy, radius, start);
  const [x2, y2] = polar(cx, cy, radius, end);
  const large = end - start > 180 ? 1 : 0;
  return `M ${cx} ${cy} L ${x1} ${y1} A ${radius} ${radius} 0 ${large} 1 ${x2} ${y2} Z`;
}

function textAnchor(deg) {
  const angle = ((deg % 360) + 360) % 360;
  if (angle > 24 && angle < 156) return 'start';
  if (angle > 204 && angle < 336) return 'end';
  return 'middle';
}

function WheelChart({ areas, scores, focusId, onFocus, size = 420, label = 'Τροχός της ζωής' }) {
  const cx = size / 2;
  const cy = size / 2;
  const radius = size * 0.42;
  const pad = Math.round(size * 0.14);
  const sweep = 360 / areas.length;
  const gap = areas.length > 4 ? 1.4 : 2.2;
  const rings = [0.2, 0.4, 0.6, 0.8, 1];

  return (
    <svg
      className="path-wheel__chart"
      viewBox={`${-pad} ${-pad} ${size + pad * 2} ${size + pad * 2}`}
      role="img"
      aria-label={label}
    >
      {rings.map((step) => (
        <circle
          key={step}
          cx={cx}
          cy={cy}
          r={radius * step}
          fill="none"
          stroke="rgba(255,255,255,0.08)"
          strokeWidth="1"
        />
      ))}
      {areas.map((area, index) => {
        const start = index * sweep - sweep / 2 + gap;
        const end = (index + 1) * sweep - sweep / 2 - gap;
        const mid = index * sweep;
        const score = scores?.[area.id] ?? null;
        const active = focusId === area.id;
        const dim = focusId && !active;
        const fillRadius = score ? radius * (score / 10) : 0;
        const [lx, ly] = polar(cx, cy, radius + 28, mid);
        const anchor = textAnchor(mid);
        const numberRadius = score ? Math.max(18, fillRadius - 16) : 0;
        const [nx, ny] = score ? polar(cx, cy, numberRadius, mid) : [0, 0];
        return (
          <g key={area.id} className="path-wheel__slice" onMouseEnter={() => onFocus?.(area.id)} onMouseLeave={() => onFocus?.(null)}>
            <path d={sectorPath(cx, cy, radius, start, end)} fill="rgba(255,255,255,0.045)" />
            {fillRadius > 0 ? (
              <path
                d={sectorPath(cx, cy, fillRadius, start, end)}
                fill={area.color}
                opacity={dim ? 0.28 : 0.88}
              />
            ) : null}
            <path
              d={sectorPath(cx, cy, radius, start, end)}
              fill="transparent"
              className="path-wheel__hit"
              onClick={() => onFocus?.(area.id)}
            >
              <title>{`${area.label}${score ? `: ${score}` : ''}`}</title>
            </path>
            {score && fillRadius > 28 ? (
              <text x={nx} y={ny} textAnchor="middle" dominantBaseline="middle" className="path-wheel__score" fill={dim ? 'rgba(255,255,255,0.45)' : '#081018'}>
                {score}
              </text>
            ) : null}
            <text
              x={lx}
              y={ly}
              textAnchor={anchor}
              dominantBaseline="middle"
              className="path-wheel__label"
              fill={active ? '#f4f7f8' : 'rgba(255,255,255,0.62)'}
            >
              {area.short}
            </text>
          </g>
        );
      })}
      <circle cx={cx} cy={cy} r="3" fill="rgba(255,255,255,0.35)" />
    </svg>
  );
}

function ScoreScale({ area, score, onChange }) {
  return (
    <div className="path-wheel__scale" role="radiogroup" aria-label={area.label}>
      {Array.from({ length: 10 }, (_, index) => index + 1).map((value) => (
        <button
          key={value}
          type="button"
          role="radio"
          aria-checked={score === value}
          className={score === value ? 'is-on' : ''}
          style={score === value ? { background: area.color, color: '#081018', borderColor: area.color } : undefined}
          onClick={() => onChange(score === value ? null : value)}
        >
          {value}
        </button>
      ))}
    </div>
  );
}

function AreaList({ areas, scores, focusId, onFocus, onChange }) {
  return (
    <div className="path-wheel__list">
      {areas.map((area) => {
        const score = scores?.[area.id] ?? null;
        const active = focusId === area.id;
        return (
          <div
            key={area.id}
            className={`path-wheel__row${active ? ' is-active' : ''}`}
            onMouseEnter={() => onFocus(area.id)}
            onMouseLeave={() => onFocus(null)}
          >
            <div className="path-wheel__row-head">
              <span className="path-wheel__dot" style={{ background: area.color }} />
              <div>
                <h3>{area.label}</h3>
                <p>{area.hint}</p>
              </div>
              <strong>{score ?? '–'}</strong>
            </div>
            <ScoreScale area={area} score={score} onChange={(value) => onChange(area.id, value)} />
          </div>
        );
      })}
    </div>
  );
}

function AttentionList({ title, calmTitle, areas }) {
  if (!areas.length) return null;
  const calm = areas.every((area) => area.score > 6);
  return (
    <div className="path-wheel__attention">
      <h3>{calm ? calmTitle : title}</h3>
      <ul>
        {areas.map((area) => (
          <li key={area.id}>
            <span className="path-wheel__dot" style={{ background: area.color }} />
            <span>{area.label}</span>
            <strong>{area.score}</strong>
          </li>
        ))}
      </ul>
    </div>
  );
}

function formatStamp(iso) {
  if (!iso) return '';
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleString('el-GR', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
}

export function PathWheel({ path }) {
  const wheel = normalizeWheel(path.plan?.wheel);
  const [focusId, setFocusId] = useState(null);
  const [workFocus, setWorkFocus] = useState(null);
  const lifeAttention = lowestWheelAreas(LIFE_WHEEL_AREAS, wheel.scores);
  const workAttention = lowestWheelAreas(WORK_WHEEL_AREAS, wheel.businesses);
  const stamp = formatStamp(wheel.updatedAt);

  function save(next) {
    path.updateWheel(next);
  }

  return (
    <div className="path-wheel">
      <div className="path-wheel__layout">
        <WheelChart
          areas={LIFE_WHEEL_AREAS}
          scores={wheel.scores}
          focusId={focusId}
          onFocus={setFocusId}
        />
        <AreaList
          areas={LIFE_WHEEL_AREAS}
          scores={wheel.scores}
          focusId={focusId}
          onFocus={setFocusId}
          onChange={(id, value) => save({ scores: { [id]: value } })}
        />
      </div>

      <AttentionList title="Πού ζητάει προσοχή" calmTitle="Ο χαμηλότερος τομέας" areas={lifeAttention} />

      <section className="path-wheel__work">
        <div>
          <h2>Μέσα στην Εργασία</h2>
          <p>
            Δεύτερη αξιολόγηση, ξεχωριστά από τον τροχό. Εδώ φαίνεται ποια επιχείρηση προχωρά, ποια σε στηρίζει
            και ποια ζητά περισσότερο χρόνο από όσο θέλεις να της δώσεις.
          </p>
        </div>
        <div className="path-wheel__work-grid">
          <WheelChart
            areas={WORK_WHEEL_AREAS}
            scores={wheel.businesses}
            focusId={workFocus}
            onFocus={setWorkFocus}
            size={320}
            label="Τροχός επιχειρήσεων"
          />
          <AreaList
            areas={WORK_WHEEL_AREAS}
            scores={wheel.businesses}
            focusId={workFocus}
            onFocus={setWorkFocus}
            onChange={(id, value) => save({ businesses: { [id]: value } })}
          />
        </div>
        <AttentionList title="Ποια ζητάει περισσότερα" calmTitle="Η χαμηλότερη επιχείρηση" areas={workAttention} />
      </section>

      <label className="path-field path-wheel__note">
        <span>Σημείωση αυτής της περιόδου</span>
        <textarea
          rows={3}
          value={wheel.note}
          placeholder="Τι χρειάζεται προσοχή τώρα"
          onChange={(event) => save({ note: event.target.value })}
        />
      </label>
      {stamp ? <p className="path-wheel__stamp">Τελευταία αλλαγή {stamp}</p> : null}
    </div>
  );
}
