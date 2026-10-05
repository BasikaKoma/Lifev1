import ActivityModal from './ActivityModal';

const ACCENTS = {
  workout: '#dfbb7e',
  meditation: '#b3a7e1',
  pulse: '#f43f5e',
  other: '#78d8b7',
};

function activityKind(event) {
  if (event.type === 'workout') return 'workout';
  if (event.type === 'session') return 'meditation';
  if (event.type === 'pulse') return 'pulse';
  return 'other';
}

/** @param {{ event: import('../../../utils/selfHubTimelineEvents').SelfTimelineEvent, entry?: { note?: string, detail?: string }, onClose: () => void, onSave: (eventId: string, fields: { note: string, detail: string }) => void }} props */
export function SelfTimelineEventDialog({ event, entry, onClose, onSave }) {
  const kind = activityKind(event);
  const metrics = (event.facts || []).map((fact) => ({
    id: fact.label,
    label: fact.label,
    value: fact.value,
    unit: fact.unit || '',
    hint: fact.detail || '',
  }));

  return (
    <ActivityModal
      open
      accent={ACCENTS[kind]}
      activity={{
        id: event.id,
        type: kind,
        title: event.label,
        source: metrics.length ? 'Oura' : (event.typeLabel || 'Δραστηριότητα'),
        time: event.timeLabel || '',
        subtitle: metrics.length ? event.typeLabel : '',
        metrics,
        note: entry?.note || '',
        details: entry?.detail || '',
      }}
      onClose={onClose}
      onSave={({ note, details }) => {
        onSave(event.id, { note, detail: details });
      }}
    />
  );
}
