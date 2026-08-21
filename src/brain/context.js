export function createEmptyBrainContext() {
  return {
    selectedDate: null,
    selectedProjectId: null,
    selectedCheckpointId: null,
    selectedStageId: null,
    openedFrom: 'lifeline',
    capturedAt: null,
  };
}

export function normalizeBrainContext(raw = {}) {
  return {
    selectedDate: typeof raw.selectedDate === 'string' ? raw.selectedDate : null,
    selectedProjectId: typeof raw.selectedProjectId === 'string' ? raw.selectedProjectId : null,
    selectedCheckpointId: typeof raw.selectedCheckpointId === 'string' ? raw.selectedCheckpointId : null,
    selectedStageId: typeof raw.selectedStageId === 'string' ? raw.selectedStageId : null,
    openedFrom: raw.openedFrom === 'lifeline' ? 'lifeline' : 'lifeline',
    capturedAt: typeof raw.capturedAt === 'string' ? raw.capturedAt : null,
  };
}

export function freezeBrainContext(raw) {
  return {
    ...normalizeBrainContext(raw),
    capturedAt: new Date().toISOString(),
  };
}

export function sourceId(kind, id) {
  if (!id) return null;
  return `${kind}:${id}`;
}

export function formatBrainContextLabel(context, extras = {}) {
  const parts = [];
  if (context?.selectedDate) parts.push(context.selectedDate);
  if (extras.projectTitle) parts.push(extras.projectTitle);
  if (extras.checkpointTitle) parts.push(extras.checkpointTitle);
  if (extras.stageTitle) parts.push(extras.stageTitle);
  if (!parts.length) return 'Lifeline · τώρα';
  return parts.join(' · ');
}
