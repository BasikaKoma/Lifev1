import { isCheckpointDone } from './logic';

export const CHAPTER_STATUS_LABELS = {
  Done: 'Ολοκληρώθηκε',
  Current: 'Τώρα',
  Next: 'Επόμενο',
  Locked: 'Κλειδωμένο',
};

export function getChapterStatusLabel(status) {
  return CHAPTER_STATUS_LABELS[status] || status;
}

export function getStageDisplayStatus(stage, sortedStages) {
  if (stage.status === 'Done') return 'Done';
  if (stage.status === 'Current') return 'Current';

  const currentIndex = sortedStages.findIndex((s) => s.status === 'Current');
  const stageIndex = sortedStages.findIndex((s) => s.id === stage.id);
  if (currentIndex >= 0 && stageIndex === currentIndex + 1) return 'Next';
  return 'Locked';
}

/** Project milestones → workspace chapter rows (live projection, no separate store). */
export function stagesAsChapters(stages = []) {
  const sorted = [...stages].sort((a, b) => a.order - b.order);
  return sorted.map((stage, index) => ({
    id: stage.id,
    number: String(index + 1).padStart(2, '0'),
    title: stage.title,
    goal: stage.description?.trim() || '—',
    status: getStageDisplayStatus(stage, sorted),
    stage,
  }));
}

export function getChapterCheckpointProgress(stage) {
  let total = 0;
  let done = 0;
  for (const cp of stage.checkpoints || []) {
    total += 1;
    if (isCheckpointDone(cp)) done += 1;
  }
  return { total, done };
}
