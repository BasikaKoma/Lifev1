import { useId, useMemo, useRef, useState } from 'react';

function formatHeartRateTooltipTime(isoString) {
  if (!isoString) return null;
  const date = new Date(isoString);
  if (Number.isNaN(date.getTime())) return null;
  return new Intl.DateTimeFormat('el-GR', {
    hour: 'numeric',
    minute: '2-digit',
  }).format(date);
}

function EmptyChart() {
  return (
    <div className="self-chart self-chart--empty">
      <span>No data</span>
    </div>
  );
}

function SleepBarsChart({ bars, startLabel, endLabel }) {
  if (!bars?.length) return <EmptyChart />;

  const max = Math.max(...bars, 1);

  return (
    <div className="self-chart self-chart--sleep">
      <div className="self-chart__sleep-bars">
        {bars.map((value, i) => (
          <span
            key={i}
            className="self-chart__sleep-bar"
            style={{ height: `${(value / max) * 100}%` }}
          />
        ))}
      </div>
      <div className="self-chart__sleep-labels">
        <span>{startLabel}</span>
        <span>{endLabel}</span>
      </div>
    </div>
  );
}

function ProgressBarChart({ value, max }) {
  if (typeof value !== 'number' || !Number.isFinite(value)) return <EmptyChart />;

  const pct = Math.min(100, (value / max) * 100);

  return (
    <div className="self-chart self-chart--progress">
      <div className="self-chart__progress-track">
        <div className="self-chart__progress-fill" style={{ width: `${pct}%` }} />
      </div>
      <div className="self-chart__progress-labels">
        <span>0</span>
        <span>50</span>
        <span>100</span>
      </div>
    </div>
  );
}

function ActivityBarsChart({ bars, labels }) {
  if (!bars?.length) return <EmptyChart />;

  const max = Math.max(...bars, 1);

  return (
    <div className="self-chart self-chart--activity">
      <div className="self-chart__activity-bars">
        {bars.map((value, i) => (
          <span key={i} className="self-chart__activity-col">
            <span
              className="self-chart__activity-bar"
              style={{ height: `${(value / max) * 100}%` }}
            />
            {value > max * 0.55 && <span className="self-chart__activity-dot" />}
          </span>
        ))}
      </div>
      <div className="self-chart__activity-labels">
        {labels.map((label) => (
          <span key={label}>{label}</span>
        ))}
      </div>
    </div>
  );
}

function WaveLineChart({ points }) {
  if (!points?.length) return <EmptyChart />;

  const width = 200;
  const height = 56;
  const step = width / (points.length - 1);
  const max = Math.max(...points);
  const min = Math.min(...points);
  const range = max - min || 1;

  const coords = points.map((p, i) => {
    const x = i * step;
    const y = height - ((p - min) / range) * (height - 12) - 6;
    return [x, y];
  });

  const linePath = coords.map(([x, y], i) => `${i === 0 ? 'M' : 'L'} ${x} ${y}`).join(' ');
  const areaPath = `${linePath} L ${width} ${height} L 0 ${height} Z`;
  const peakIdx = points.indexOf(max);
  const [peakX, peakY] = coords[peakIdx];

  return (
    <div className="self-chart self-chart--wave">
      <svg viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none">
        <defs>
          <linearGradient id="selfWaveFill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="rgba(16, 185, 129, 0.35)" />
            <stop offset="100%" stopColor="rgba(16, 185, 129, 0)" />
          </linearGradient>
          <linearGradient id="selfWaveStroke" x1="0" y1="0" x2="1" y2="0">
            <stop offset="0%" stopColor="#059669" />
            <stop offset="100%" stopColor="#34d399" />
          </linearGradient>
        </defs>
        <path d={areaPath} fill="url(#selfWaveFill)" />
        <path d={linePath} fill="none" stroke="url(#selfWaveStroke)" strokeWidth="1.5" />
        <circle cx={peakX} cy={peakY} r="3" fill="#34d399" className="self-chart__wave-dot" />
      </svg>
    </div>
  );
}

function DotRingChart({ value, max }) {
  if (typeof value !== 'number' || !Number.isFinite(value)) return <EmptyChart />;

  const total = 48;
  const filled = Math.round((value / max) * total);

  return (
    <div className="self-chart self-chart--ring">
      <svg viewBox="0 0 80 80">
        {Array.from({ length: total }, (_, i) => {
          const angle = (i / total) * 360 - 90;
          const rad = (angle * Math.PI) / 180;
          const cx = 40 + Math.cos(rad) * 28;
          const cy = 40 + Math.sin(rad) * 28;
          const active = i < filled;

          return (
            <circle
              key={i}
              cx={cx}
              cy={cy}
              r="1.8"
              className={active ? 'self-chart__ring-dot self-chart__ring-dot--active' : 'self-chart__ring-dot'}
            />
          );
        })}
        <text x="40" y="44" textAnchor="middle" className="self-chart__ring-value">
          {value}
        </text>
      </svg>
    </div>
  );
}

function AuraRingsChart({ value, max, layers }) {
  if (typeof value !== 'number' || !layers?.length) return <EmptyChart />;

  const intensity = value / max;
  const ringLayers = layers.map((layer, index) => {
    const rx = 18 + index * 16;
    const ry = 10 + index * 8;
    const opacity = layer * intensity;
    return { rx, ry, opacity };
  });

  return (
    <div className="self-chart self-chart--aura">
      <svg viewBox="0 0 200 56" preserveAspectRatio="xMidYMid meet">
        <defs>
          <radialGradient id="selfAuraCore" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor="#fbbf24" stopOpacity="0.55" />
            <stop offset="45%" stopColor="#10b981" stopOpacity="0.75" />
            <stop offset="100%" stopColor="#10b981" stopOpacity="0" />
          </radialGradient>
          <linearGradient id="selfAuraRing" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="#34d399" stopOpacity="0.9" />
            <stop offset="100%" stopColor="#059669" stopOpacity="0.35" />
          </linearGradient>
        </defs>

        {ringLayers.map(({ rx, ry, opacity }, index) => (
          <ellipse
            key={index}
            cx="100"
            cy="28"
            rx={rx}
            ry={ry}
            fill="none"
            stroke="url(#selfAuraRing)"
            strokeWidth={index === 0 ? 1.4 : 1}
            opacity={opacity}
          />
        ))}

        <ellipse cx="100" cy="28" rx="14" ry="8" fill="url(#selfAuraCore)" opacity={0.55 + intensity * 0.35} />
        <circle cx="100" cy="28" r="2.5" fill="#34d399" opacity="0.95" />
      </svg>
    </div>
  );
}

function CaloriesBalanceChart({ intake, burned, goal, unit, intakeLabel, burnedLabel }) {
  if (typeof intake !== 'number' && typeof burned !== 'number') return <EmptyChart />;

  const safeGoal = goal || Math.max(intake, burned, 1);
  const intakePct = Math.min(100, (intake / safeGoal) * 100);
  const burnedPct = Math.min(100, (burned / safeGoal) * 100);

  return (
    <div className="self-chart self-chart--calories">
      <div className="self-chart__calories-rows">
        <div className="self-chart__calories-row">
          <span className="self-chart__calories-label">{intakeLabel || 'In'}</span>
          <div className="self-chart__calories-track">
            <div
              className="self-chart__calories-fill self-chart__calories-fill--in"
              style={{ width: `${intakePct}%` }}
            />
          </div>
          <span className="self-chart__calories-num">
            {new Intl.NumberFormat('en-US').format(intake)}
            <span className="self-chart__calories-unit">{unit || 'kcal'}</span>
          </span>
        </div>
        <div className="self-chart__calories-row">
          <span className="self-chart__calories-label">{burnedLabel || 'Out'}</span>
          <div className="self-chart__calories-track">
            <div
              className="self-chart__calories-fill self-chart__calories-fill--out"
              style={{ width: `${burnedPct}%` }}
            />
          </div>
          <span className="self-chart__calories-num">
            {new Intl.NumberFormat('en-US').format(burned)}
            <span className="self-chart__calories-unit">{unit || 'kcal'}</span>
          </span>
        </div>
      </div>
    </div>
  );
}

function HeartRateTrendChart({ points, samples, startLabel, endLabel }) {
  if (!points?.length) return <EmptyChart />;

  const containerRef = useRef(null);
  const [hoverIndex, setHoverIndex] = useState(null);
  const width = 200;
  const height = 56;
  const safePoints = points;

  const chartSamples = useMemo(() => {
    if (samples?.length === safePoints.length) {
      return samples.map((sample) => ({
        bpm: sample.bpm ?? sample,
        timestamp: sample.timestamp ?? null,
      }));
    }
    return safePoints.map((bpm) => ({ bpm, timestamp: null }));
  }, [samples, safePoints]);

  const step = width / Math.max(safePoints.length - 1, 1);
  const max = Math.max(...safePoints);
  const min = Math.min(...safePoints);
  const range = max - min || 1;

  const coords = safePoints.map((point, index) => {
    const x = index * step;
    const y = height - ((point - min) / range) * (height - 12) - 6;
    return [x, y];
  });

  const linePath = coords.map(([x, y], index) => `${index === 0 ? 'M' : 'L'} ${x} ${y}`).join(' ');
  const areaPath = `${linePath} L ${width} ${height} L 0 ${height} Z`;

  const activeIndex = hoverIndex ?? null;
  const activeCoord = activeIndex != null ? coords[activeIndex] : null;
  const activeSample = activeIndex != null ? chartSamples[activeIndex] : null;

  const pickIndexFromClientX = (clientX) => {
    const rect = containerRef.current?.getBoundingClientRect();
    if (!rect?.width || chartSamples.length === 0) return null;
    const ratio = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
    return Math.round(ratio * (chartSamples.length - 1));
  };

  const handlePointerMove = (event) => {
    const index = pickIndexFromClientX(event.clientX);
    if (index != null) setHoverIndex(index);
  };

  const handlePointerLeave = () => {
    setHoverIndex(null);
  };

  return (
    <div
      ref={containerRef}
      className="self-chart self-chart--heart-rate"
      onMouseMove={handlePointerMove}
      onMouseLeave={handlePointerLeave}
    >
      {activeSample && activeCoord && (
        <div
          className="self-chart__hr-tooltip"
          style={{ left: `${(activeCoord[0] / width) * 100}%` }}
        >
          <span className="self-chart__hr-tooltip-bpm">{activeSample.bpm} bpm</span>
          {activeSample.timestamp && (
            <span className="self-chart__hr-tooltip-time">
              {formatHeartRateTooltipTime(activeSample.timestamp)}
            </span>
          )}
        </div>
      )}
      <svg viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none">
        <defs>
          <linearGradient id="selfHeartRateFill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="rgba(251, 113, 133, 0.35)" />
            <stop offset="100%" stopColor="rgba(251, 113, 133, 0)" />
          </linearGradient>
          <linearGradient id="selfHeartRateStroke" x1="0" y1="0" x2="1" y2="0">
            <stop offset="0%" stopColor="#fb7185" />
            <stop offset="100%" stopColor="#f43f5e" />
          </linearGradient>
        </defs>
        <path d={areaPath} fill="url(#selfHeartRateFill)" />
        <path d={linePath} fill="none" stroke="url(#selfHeartRateStroke)" strokeWidth="1.5" strokeLinejoin="round" />
        {activeCoord && (
          <>
            <line
              x1={activeCoord[0]}
              y1={0}
              x2={activeCoord[0]}
              y2={height}
              stroke="rgba(251, 113, 133, 0.35)"
              strokeWidth="1"
              strokeDasharray="2 2"
            />
            <circle cx={activeCoord[0]} cy={activeCoord[1]} r="3.5" fill="#fb7185" stroke="#fff" strokeWidth="1" />
          </>
        )}
      </svg>
      {(startLabel || endLabel) && (
        <div className="self-chart__sleep-labels">
          <span>{startLabel ?? ''}</span>
          <span>{endLabel ?? ''}</span>
        </div>
      )}
    </div>
  );
}

function PulseLineChart({ points }) {
  const width = 200;
  const height = 56;
  const step = width / Math.max(points.length - 1, 1);
  const max = Math.max(...points, 1);
  const min = Math.min(...points);
  const range = max - min || 1;

  const coords = points.map((point, index) => {
    const x = index * step;
    const y = height - ((point - min) / range) * (height - 10) - 5;
    return [x, y];
  });

  const linePath = coords.map(([x, y], index) => `${index === 0 ? 'M' : 'L'} ${x} ${y}`).join(' ');
  const peakIdx = points.indexOf(max);
  const [peakX, peakY] = coords[peakIdx] ?? coords[0];

  return (
    <div className="self-chart self-chart--pulse">
      <svg viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none">
        <defs>
          <linearGradient id="selfPulseStroke" x1="0" y1="0" x2="1" y2="0">
            <stop offset="0%" stopColor="#f87171" />
            <stop offset="50%" stopColor="#fb7185" />
            <stop offset="100%" stopColor="#f43f5e" />
          </linearGradient>
        </defs>
        <path
          d={linePath}
          fill="none"
          stroke="url(#selfPulseStroke)"
          strokeWidth="1.8"
          strokeLinejoin="round"
        />
        <circle cx={peakX} cy={peakY} r="2.5" fill="#fb7185" className="self-chart__pulse-dot" />
      </svg>
    </div>
  );
}

function SmokeChart() {
  return (
    <div className="self-chart self-chart--smoke" aria-hidden="true">
      <svg viewBox="0 0 140 90" preserveAspectRatio="none">
        <defs>
          <linearGradient id="selfSmokeGrad" x1="0" y1="1" x2="1" y2="0">
            <stop offset="0%" stopColor="rgba(16, 185, 129, 0)" />
            <stop offset="40%" stopColor="rgba(16, 185, 129, 0.08)" />
            <stop offset="100%" stopColor="rgba(16, 185, 129, 0.28)" />
          </linearGradient>
        </defs>
        <path
          d="M0 90 C35 70, 50 50, 80 42 S120 25, 140 15 L140 90 Z"
          fill="url(#selfSmokeGrad)"
        />
        <path
          d="M10 90 C45 65, 65 48, 95 38 S130 22, 140 12"
          fill="none"
          stroke="rgba(16, 185, 129, 0.25)"
          strokeWidth="1.2"
        />
        <path
          d="M30 90 C60 72, 75 58, 105 48"
          fill="none"
          stroke="rgba(16, 185, 129, 0.12)"
          strokeWidth="0.8"
        />
      </svg>
    </div>
  );
}

function formatKgLabel(value) {
  return Number(value).toFixed(1);
}

function WeightLineChart({ points = [] }) {
  const uid = useId().replace(/:/g, '');
  const fillId = `weightFill-${uid}`;
  const strokeId = `weightStroke-${uid}`;

  if (!points.length) return <EmptyChart />;

  const values = points.map((point) => point.value);
  const rawMin = Math.min(...values);
  const rawMax = Math.max(...values);
  const rawRange = Math.max(rawMax - rawMin, 0.4);
  const pad = rawRange * 0.45;
  const min = rawMin - pad;
  const max = rawMax + pad;
  const range = max - min;

  const width = 320;
  const height = 168;
  const padL = 6;
  const padR = 6;
  const padT = 22;
  const padB = 6;
  const plotWidth = width - padL - padR;
  const plotHeight = height - padT - padB;
  const plotBottom = height - padB;
  const plotRight = width - padR;

  const coords = points.map((point, index) => {
    const x = padL + (plotWidth * index) / Math.max(points.length - 1, 1);
    const y = padT + plotHeight - ((point.value - min) / range) * plotHeight;
    return { ...point, x, y };
  });

  const linePath = coords.map((coord, index) => `${index === 0 ? 'M' : 'L'} ${coord.x} ${coord.y}`).join(' ');
  const last = coords[coords.length - 1];
  const areaPath = `${linePath} L ${last.x} ${plotBottom} L ${coords[0].x} ${plotBottom} Z`;
  const gridYs = [0, 0.5, 1].map((t) => padT + plotHeight * t);

  return (
    <div className="self-chart self-chart--weight-line">
      <div className="self-chart__weight-plot">
        <svg
          viewBox={`0 0 ${width} ${height}`}
          preserveAspectRatio="none"
          className="self-chart__weight-svg"
          role="img"
          aria-label="Weight trend"
        >
          <defs>
            <linearGradient id={fillId} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="rgba(52, 211, 153, 0.42)" />
              <stop offset="70%" stopColor="rgba(52, 211, 153, 0.08)" />
              <stop offset="100%" stopColor="rgba(52, 211, 153, 0)" />
            </linearGradient>
            <linearGradient id={strokeId} x1="0" y1="0" x2="1" y2="0">
              <stop offset="0%" stopColor="#059669" />
              <stop offset="100%" stopColor="#34d399" />
            </linearGradient>
          </defs>

          <rect
            x={padL}
            y={padT}
            width={plotWidth}
            height={plotHeight}
            fill="rgba(16, 185, 129, 0.045)"
          />

          {gridYs.map((y) => (
            <line
              key={y}
              x1={padL}
              y1={y}
              x2={plotRight}
              y2={y}
              stroke="rgba(52, 211, 153, 0.14)"
              strokeWidth="1"
              vectorEffect="non-scaling-stroke"
            />
          ))}

          <line
            x1={padL}
            y1={padT}
            x2={padL}
            y2={plotBottom}
            stroke="rgba(52, 211, 153, 0.28)"
            strokeWidth="1.25"
            vectorEffect="non-scaling-stroke"
          />
          <line
            x1={padL}
            y1={plotBottom}
            x2={plotRight}
            y2={plotBottom}
            stroke="rgba(52, 211, 153, 0.32)"
            strokeWidth="1.4"
            vectorEffect="non-scaling-stroke"
          />

          <path d={areaPath} fill={`url(#${fillId})`} />
          <path
            d={linePath}
            fill="none"
            stroke={`url(#${strokeId})`}
            strokeWidth="2.25"
            strokeLinejoin="round"
            strokeLinecap="round"
            vectorEffect="non-scaling-stroke"
          />

          {coords.map((coord, index) => (
            <g key={`${coord.label}-${index}`}>
              <line
                x1={coord.x}
                y1={coord.y}
                x2={coord.x}
                y2={plotBottom}
                stroke="rgba(52, 211, 153, 0.28)"
                strokeWidth="1"
                strokeDasharray="2.5 3"
                vectorEffect="non-scaling-stroke"
              />
              <circle cx={coord.x} cy={coord.y} r="4.5" fill="rgba(52, 211, 153, 0.2)" />
              <circle cx={coord.x} cy={coord.y} r="2.6" fill="#34d399" stroke="#07140f" strokeWidth="1.2" />
            </g>
          ))}
        </svg>
        {coords.map((coord, index) => {
          const edge = index === 0 ? 'start' : index === coords.length - 1 ? 'end' : 'mid';
          return (
            <span
              key={`${coord.label}-${index}`}
              className={`self-chart__weight-point self-chart__weight-point--${edge}`}
              style={{ left: `${(coord.x / width) * 100}%`, top: `${(coord.y / height) * 100}%` }}
            >
              {formatKgLabel(coord.value)}
            </span>
          );
        })}
      </div>
      <div className="self-chart__weight-labels">
        {points.map((point, index) => (
          <span key={`${point.label}-${index}`} className="self-chart__weight-label">
            {point.label ? <small>{point.label}</small> : null}
          </span>
        ))}
      </div>
    </div>
  );
}

export function SelfChart({ chart, value, max, intake, burned, goal, unit }) {
  if (!chart) return null;

  switch (chart.type) {
    case 'sleepBars':
      return <SleepBarsChart bars={chart.bars} startLabel={chart.startLabel} endLabel={chart.endLabel} />;
    case 'weightLine':
      return <WeightLineChart points={chart.points} />;
    case 'progressBar':
      return <ProgressBarChart value={value} max={max} />;
    case 'activityBars':
      return <ActivityBarsChart bars={chart.bars} labels={chart.labels} />;
    case 'waveLine':
      return <WaveLineChart points={chart.points} />;
    case 'auraRings':
      return <AuraRingsChart value={value} max={max} layers={chart.layers} />;
    case 'caloriesBalance':
      return (
        <CaloriesBalanceChart
          intake={intake}
          burned={burned}
          goal={goal}
          unit={unit}
          intakeLabel={chart.intakeLabel}
          burnedLabel={chart.burnedLabel}
        />
      );
    case 'dotRing':
      return <DotRingChart value={value} max={max} />;
    case 'heartRateTrend':
      return (
        <HeartRateTrendChart
          points={chart.points}
          samples={chart.samples}
          startLabel={chart.startLabel}
          endLabel={chart.endLabel}
        />
      );
    case 'pulseLine':
      return <PulseLineChart points={chart.points} />;
    case 'smoke':
      return <SmokeChart />;
    case 'empty':
      return <EmptyChart />;
    default:
      return null;
  }
}
