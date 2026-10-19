import { useEffect, useMemo, useRef, useState } from 'react';
import { WaistLogForm } from '../WaistLogForm';
import { appendCircumferenceReading, todayIsoDate } from '../../../lib/health/healthMetrics';
import { circumferenceSpec } from '../../../lib/health/circumferenceReadings';
import { BODY_MEASURES } from '../selfOrganSpec';
import { setOrganHover } from './SelfOrganLinks';

function formatCm(value) {
  if (value == null || value === '—') return null;
  return typeof value === 'number' ? value.toFixed(1) : String(value);
}

/**
 * One circumference beside the body: today's value when logged, otherwise an empty
 * "+ σήμερα" prompt that opens the inline log form.
 */
function BodyMeasureLabel({ kind, side, value, labelRef, handlers }) {
  const spec = circumferenceSpec(kind);
  // Bridges the gap until the saved reading comes back through the health refresh.
  const [saved, setSaved] = useState(null);
  const [adding, setAdding] = useState(false);
  const shown = formatCm(value ?? (saved?.day === todayIsoDate() ? saved.cm : null));
  if (!spec) return null;

  return (
    <div
      ref={labelRef}
      className={`self-body-measure self-body-measure--${side > 0 ? 'left' : 'right'}${shown ? '' : ' self-body-measure--log'}`}
      data-measure-key={kind}
      {...handlers}
    >
      <span className="self-body-measure__label">{spec.label}</span>
      {shown ? (
        <span className="self-body-measure__value">
          {shown}
          <span className="self-body-measure__unit">cm</span>
        </span>
      ) : adding ? (
        <WaistLogForm
          kind={kind}
          compact
          inline
          autoFocus
          submitLabel="OK"
          onCancel={() => setAdding(false)}
          onSave={async (cm) => {
            const reading = await appendCircumferenceReading({ kind, cm });
            if (reading?.value != null) {
              setSaved({ cm: reading.value, day: reading.day });
              setAdding(false);
            }
            return reading;
          }}
        />
      ) : (
        <button
          type="button"
          className="self-body-measure__add"
          onClick={() => setAdding(true)}
          title={`Καταγραφή σημερινής μέτρησης: ${spec.label}`}
          aria-label={`Καταγραφή σημερινής μέτρησης: ${spec.label}`}
        >
          <span className="self-body-measure__add-icon" aria-hidden>+</span>
          σήμερα
        </button>
      )}
    </div>
  );
}

/**
 * Waist, upper-arm and thigh circumferences placed beside the figure at the spot they
 * measure. OrganLinkProjector positions each label every frame and draws its tick line.
 * @param {{ runtime: object, metric: import('../../../utils/selfHubSchema').SelfHubMetric }} props
 */
export function SelfBodyMeasures({ runtime, metric }) {
  const timer = useRef(0);
  useEffect(() => () => window.clearTimeout(timer.current), []);

  const labelRefs = useMemo(() => Object.fromEntries(BODY_MEASURES.map((item) => [item.key, (node) => {
    const element = runtime.measures[item.key] || (runtime.measures[item.key] = {});
    element.label = node;
    element.width = 0;
    element.height = 0;
    runtime.needsMeasure = true;
  }])), [runtime]);

  const handlers = useMemo(() => Object.fromEntries(BODY_MEASURES.map((item) => {
    const activate = () => {
      window.clearTimeout(timer.current);
      setOrganHover(runtime, item.key);
    };
    const release = (delay) => {
      window.clearTimeout(timer.current);
      timer.current = window.setTimeout(() => {
        if (runtime.hoverKey === item.key) setOrganHover(runtime, null);
      }, delay);
    };
    return [item.key, {
      onPointerEnter: activate,
      onPointerLeave: (event) => release(event.pointerType === 'touch' ? 1200 : 0),
      onFocus: activate,
      onBlur: () => release(0),
    }];
  })), [runtime]);

  return BODY_MEASURES.map((item) => (
    <BodyMeasureLabel
      key={item.key}
      kind={item.key}
      side={item.side}
      value={metric?.[`${item.key}Cm`]}
      labelRef={labelRefs[item.key]}
      handlers={handlers[item.key]}
    />
  ));
}
