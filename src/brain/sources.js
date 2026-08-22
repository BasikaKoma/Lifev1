export function buildSourceIndex({ snapshot, catalog = [] } = {}) {
  const index = [];
  const seen = new Set();

  const add = (entry) => {
    if (!entry?.id || seen.has(entry.id)) return;
    seen.add(entry.id);
    index.push(entry);
  };

  for (const project of catalog || []) {
    if (!project || project.isLifeline) continue;
    add({
      id: project.sourceId,
      kind: 'project',
      label: project.title,
      projectId: project.id,
      projectTitle: project.title,
    });
    for (const checkpoint of project.openCheckpoints || []) {
      add({
        id: checkpoint.sourceId,
        kind: 'checkpoint',
        label: `${project.title} · ${checkpoint.title}`,
        projectId: project.id,
        projectTitle: project.title,
        checkpointId: checkpoint.id,
        stageId: checkpoint.stageId || project.currentStage?.id || null,
      });
    }
    for (const note of project.notes || []) {
      if (!note?.sourceId) continue;
      add({
        id: note.sourceId,
        kind: 'note',
        label: `${project.title} · ${note.title}`,
        projectId: project.id,
        projectTitle: project.title,
        noteId: note.id,
      });
    }
  }

  const self = snapshot?.self;
  if (self?.sourceId) {
    add({
      id: self.sourceId,
      kind: 'self',
      label: `Self · ${self.date || 'σήμερα'}`,
      date: self.date || null,
    });
  }

  const days = [
    snapshot?.lifeline?.focusDay,
    ...(snapshot?.lifeline?.recentDays || []),
  ].filter(Boolean);
  for (const day of days) {
    for (const id of day.sourceIds || []) {
      const kind = String(id).startsWith('self:') ? 'self' : 'lifeline-day';
      add({
        id,
        kind,
        label: kind === 'self' ? `Self · ${day.date}` : `Lifeline · ${day.date}`,
        date: day.date,
      });
    }
  }

  if (snapshot?.brand?.sourceId) {
    add({
      id: snapshot.brand.sourceId,
      kind: 'brand',
      label: 'Personal Brand',
    });
  }

  return index;
}

export function resolveSource(id, index = []) {
  const found = (index || []).find((item) => item.id === id);
  if (found) return found;
  const raw = String(id || '');
  const split = raw.indexOf(':');
  const kind = split >= 0 ? raw.slice(0, split) : 'unknown';
  const rest = split >= 0 ? raw.slice(split + 1) : raw;
  return {
    id: raw,
    kind,
    label: raw,
    raw: rest,
    date: kind === 'lifeline-day' || kind === 'self' ? rest : null,
  };
}
