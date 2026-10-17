/**
 * Small, glanceable charts for the Life Summary cards. Every mark carries its
 * own hover tip (data-tip); the card's rows keep the exact numbers readable
 * without hovering.
 */

const STATUS_LABEL = { good: 'Εντός', warn: 'Οριακά', bad: 'Εκτός' };

function percent(value, max) {
  if (!max || value == null) return 0;
  return Math.max(0, Math.min(100, (value / max) * 100));
}

function tipEdge(index, count) {
  if (count <= 2) return '';
  if (index === 0) return ' kpi-tip--start';
  if (index === count - 1) return ' kpi-tip--end';
  return '';
}

export function StatusPill({ status }) {
  if (!STATUS_LABEL[status]) return null;
  return (
    <span className={`kpi-status kpi-status--${status}`}>
      <i aria-hidden="true" />
      {STATUS_LABEL[status]}
    </span>
  );
}

export function KpiMeter({ meter, status }) {
  if (!meter || !meter.max) return null;
  const tone = meter.tone || status || 'neutral';
  return (
    <div className="kpi-meter">
      <div
        className="kpi-meter__track"
        role="meter"
        aria-valuemin={0}
        aria-valuemax={meter.max}
        aria-valuenow={meter.value}
        aria-label={meter.label}
      >
        <div className={`kpi-meter__fill kpi-tone--${tone}`} style={{ width: `${percent(meter.value, meter.max)}%` }} />
        {meter.target != null ? (
          <div className="kpi-meter__tick" style={{ left: `${percent(meter.target, meter.max)}%` }} />
        ) : null}
      </div>
      {meter.label ? <p className="kpi-meter__label">{meter.label}</p> : null}
    </div>
  );
}

function Legend({ items }) {
  if (!items?.length) return null;
  return (
    <ul className="kpi-legend">
      {items.map((item) => (
        <li key={`${item.tone}-${item.text}`}>
          <i
            aria-hidden="true"
            className={`kpi-legend__key kpi-legend__key--${item.marker ? 'marker' : item.tone === 'tick' ? 'tick' : 'swatch'} kpi-tone--${item.tone}`}
          />
          {item.text}
        </li>
      ))}
    </ul>
  );
}

function Axis({ days }) {
  return (
    <div className="kpi-axis" aria-hidden="true">
      {days.map((day) => (
        <span key={day.date}>{day.major ? day.label : ''}</span>
      ))}
    </div>
  );
}

function DayBars({ chart }) {
  const days = chart.days || [];
  const values = days.map((day) => day.value).filter((value) => value != null);
  const max = Math.max(1, ...values, chart.reference?.value ?? 0) * 1.08;
  const hasMarkers = days.some((day) => day.marker);
  return (
    <>
      <div className="kpi-plot" role="img" aria-label={chart.label}>
        {chart.reference ? (
          <div className="kpi-plot__ref" style={{ bottom: `${percent(chart.reference.value, max)}%` }}>
            <span>{chart.reference.label}</span>
          </div>
        ) : null}
        {days.map((day, index) => (
          <div key={day.date} className={`kpi-col kpi-tip${tipEdge(index, days.length)}`} data-tip={day.tip}>
            {day.value != null ? (
              <div
                className={`kpi-bar kpi-tone--${day.tone}`}
                style={{ height: `max(3px, ${percent(day.value, max)}%)` }}
              />
            ) : (
              <div className={`kpi-bar kpi-bar--stub kpi-tone--${day.tone}`} />
            )}
          </div>
        ))}
      </div>
      {hasMarkers ? (
        <div className="kpi-markers" aria-hidden="true">
          {days.map((day) => (
            <span key={day.date}>{day.marker ? <i className={`kpi-tone--${day.marker}`} /> : null}</span>
          ))}
        </div>
      ) : null}
      <Axis days={days} />
    </>
  );
}

function Stack({ chart }) {
  const days = chart.days || [];
  const max = Math.max(1, ...days.map((day) => day.total || 0));
  return (
    <>
      <div className="kpi-plot" role="img" aria-label={chart.label}>
        {days.map((day, index) => (
          <div key={day.date} className={`kpi-col kpi-tip${tipEdge(index, days.length)}`} data-tip={day.tip}>
            {day.total ? (
              <div className="kpi-stack" style={{ height: `${percent(day.total, max)}%` }}>
                {day.segments.map((segment) => (
                  <div
                    key={segment.tone}
                    className={`kpi-stack__seg kpi-tone--${segment.tone}`}
                    style={{ flexGrow: segment.value }}
                  />
                ))}
              </div>
            ) : (
              <div className="kpi-bar kpi-bar--stub kpi-tone--empty" />
            )}
          </div>
        ))}
      </div>
      <Axis days={days} />
    </>
  );
}

function Bullets({ chart }) {
  const items = chart.items || [];
  const max = chart.max || Math.max(1, ...items.map((item) => Math.max(item.value || 0, item.target || 0))) * 1.05;
  return (
    <ul className="kpi-bullets" aria-label={chart.label}>
      {items.map((item) => (
        <li key={item.label} className="kpi-tip kpi-tip--start" data-tip={item.tip}>
          <span className="kpi-bullets__label">{item.label}</span>
          <span className="kpi-bullets__track">
            {/* A goal with a budget but no time still shows a stub, so the miss is visible. */}
            <span
              className={`kpi-bullets__fill kpi-tone--${item.tone}`}
              style={{ width: item.value || item.target ? `max(4px, ${percent(item.value, max)}%)` : 0 }}
            />
            {item.target ? <span className="kpi-bullets__tick" style={{ left: `${percent(item.target, max)}%` }} /> : null}
          </span>
          <strong className="kpi-bullets__value">{item.display}</strong>
        </li>
      ))}
    </ul>
  );
}

function Grid({ chart }) {
  const rows = chart.rows || [];
  if (!rows.length) return null;
  const axisDays = rows[0].cells;
  return (
    <div className="kpi-grid" role="img" aria-label={chart.label}>
      {rows.map((row) => (
        <div key={row.label} className="kpi-grid__row">
          <span className="kpi-grid__label">{row.label}</span>
          <div className="kpi-grid__cells">
            {row.cells.map((cell, index) => (
              <span
                key={cell.date}
                className={`kpi-grid__cell kpi-tone--${cell.tone} kpi-tip${tipEdge(index, row.cells.length)}`}
                data-tip={cell.tip ? `${row.label} · ${cell.tip}` : undefined}
              />
            ))}
          </div>
        </div>
      ))}
      <div className="kpi-grid__row" aria-hidden="true">
        <span className="kpi-grid__label" />
        <div className="kpi-grid__cells kpi-grid__cells--axis">
          {axisDays.map((cell) => (
            <span key={cell.date}>{cell.major ? cell.label : ''}</span>
          ))}
        </div>
      </div>
    </div>
  );
}

const CHARTS = {
  bars: DayBars,
  stack: Stack,
  bullets: Bullets,
  grid: Grid,
};

export function KpiChart({ chart }) {
  const Chart = chart ? CHARTS[chart.type] : null;
  if (!Chart) return null;
  return (
    <figure className={`kpi-chart kpi-chart--${chart.type}`}>
      <Chart chart={chart} />
      <Legend items={chart.legend} />
    </figure>
  );
}
