import { ensureStagePositions, DEFAULT_ROADMAP_LAYOUT } from './stageLayout';

export function isCheckpointDone(checkpoint) {
  if (checkpoint.archived || checkpoint.done) return true;
  if (checkpoint.checkpointType === 'Number' || checkpoint.checkpointType === 'Money') {
    return checkpoint.currentValue >= checkpoint.targetValue;
  }
  if (checkpoint.checkpointType === 'Quality') {
    const items = checkpoint.checklistItems || [];
    return items.length > 0 && items.every((item) => item.checked);
  }
  return false;
}

export function syncCheckpointDone(checkpoint) {
  const done = isCheckpointDone(checkpoint);
  const completedAt = done ? (checkpoint.completedAt || new Date().toISOString()) : null;
  return {
    ...checkpoint,
    done,
    completedAt,
    // Keep explicit archive dates; auto-complete does not archive by itself.
    archived: Boolean(checkpoint.archived),
    archivedAt: checkpoint.archived ? (checkpoint.archivedAt || completedAt) : null,
  };
}

export function getStageProgress(stage) {
  const checkpoints = stage.checkpoints || [];
  if (checkpoints.length === 0) return 0;
  const completed = checkpoints.filter((cp) => isCheckpointDone(cp)).length;
  return Math.round((completed / checkpoints.length) * 100);
}

export function getCompletedCheckpointCount(stage) {
  return (stage.checkpoints || []).filter((cp) => isCheckpointDone(cp)).length;
}

export function getOverallProgress(stages) {
  const all = getAllCheckpoints(stages);
  if (all.length === 0) return 0;
  const done = all.filter((cp) => isCheckpointDone(cp)).length;
  return Math.round((done / all.length) * 100);
}

export function getStageHealth(stage) {
  const openBlockers = (stage.blockers || []).filter((b) => b.status === 'Open');
  const hasCritical = openBlockers.some((b) => b.severity === 'Critical');
  if (hasCritical) return 'Blocked';

  const progress = getStageProgress(stage);
  const hasOpenBlockers = openBlockers.length > 0;

  if (progress > 70 && !hasOpenBlockers) return 'Healthy';
  if (progress < 50 && hasOpenBlockers) return 'Needs Attention';
  if (progress > 70 && !hasOpenBlockers) return 'Healthy';
  return 'Needs Attention';
}

export function getCurrentStage(stages) {
  return stages.find((s) => s.status === 'Current') || stages.find((s) => s.status !== 'Done') || stages[0];
}

export function getStageById(stages, id) {
  return stages.find((s) => s.id === id);
}

export function getAllCheckpoints(stages) {
  return stages.flatMap((s) =>
    (s.checkpoints || []).map((cp) => ({ ...cp, stageId: s.id, stageTitle: s.title }))
  );
}

export function updateIdeaStatus(idea, stages) {
  if (idea.status === 'Executed') return idea;

  const unlockStage = idea.unlockStageId ? getStageById(stages, idea.unlockStageId) : null;
  const stageDone = unlockStage?.status === 'Done';

  let checkpointsMet = true;
  if (idea.linkedCheckpointIds?.length > 0) {
    const allCps = getAllCheckpoints(stages);
    checkpointsMet = idea.linkedCheckpointIds.every((cpId) => {
      const cp = allCps.find((c) => c.id === cpId);
      return cp && isCheckpointDone(cp);
    });
  }

  const hasUnlockCondition = idea.unlockStageId || idea.linkedCheckpointIds?.length > 0;

  if (!hasUnlockCondition) return idea;

  let status = 'Locked';
  if (idea.unlockStageId && idea.linkedCheckpointIds?.length > 0) {
    status = stageDone && checkpointsMet ? 'Ready' : 'Locked';
  } else if (idea.unlockStageId) {
    status = stageDone ? 'Ready' : 'Locked';
  } else if (idea.linkedCheckpointIds?.length > 0) {
    status = checkpointsMet ? 'Ready' : 'Locked';
  }

  return { ...idea, status };
}

export function syncAllIdeas(stages) {
  return stages.map((stage) => ({
    ...stage,
    ideas: (stage.ideas || []).map((idea) => updateIdeaStatus(idea, stages)),
  }));
}

export function getIdeaRecommendation(idea) {
  if (idea.status === 'Executed') return null;
  if (idea.timing === 'Too Early') return 'Park';
  if (idea.impact === 'Low' && idea.effort === 'High') return 'Ignore';
  if (idea.impact === 'High' && idea.effort === 'Low' && idea.timing === 'Ready') return 'Do Now';
  return 'Review Later';
}

export function getAllIdeas(stages) {
  return stages.flatMap((s) =>
    (s.ideas || []).map((idea) => ({ ...idea, stageId: s.id, stageTitle: s.title }))
  );
}

export function getReadyIdeas(stages) {
  return getAllIdeas(stages).filter((i) => i.status === 'Ready');
}

export function getTooEarlyIdeas(stages) {
  return getAllIdeas(stages).filter(
    (i) => i.status === 'Locked' && i.timing === 'Too Early'
  );
}

export function getTopBlocker(stages) {
  const all = stages.flatMap((s) =>
    (s.blockers || [])
      .filter((b) => b.status === 'Open')
      .map((b) => ({ ...b, stageTitle: s.title }))
  );
  const severityOrder = { Critical: 0, Medium: 1, Low: 2 };
  all.sort((a, b) => severityOrder[a.severity] - severityOrder[b.severity]);
  return all[0] || null;
}

export function getNextIncompleteCheckpoint(stage) {
  return (stage.checkpoints || []).find((cp) => !isCheckpointDone(cp)) || null;
}

export function getNextBestMove(stages) {
  const currentStage = getCurrentStage(stages);
  if (!currentStage) {
    return { action: 'Set up your business path', reason: 'No stages configured yet.' };
  }

  const topBlocker = getTopBlocker(stages);
  if (topBlocker?.severity === 'Critical') {
    return {
      action: `Resolve blocker: ${topBlocker.title}`,
      reason: 'Critical blockers must be resolved before any other progress can be made.',
      type: 'blocker',
      target: topBlocker,
    };
  }

  const nextCheckpoint = getNextIncompleteCheckpoint(currentStage);
  if (nextCheckpoint) {
    return {
      action: `Complete checkpoint: ${nextCheckpoint.title}`,
      reason: `This is the next milestone in your ${currentStage.title} stage. Finishing checkpoints unlocks the path forward.`,
      type: 'checkpoint',
      target: nextCheckpoint,
    };
  }

  const allDone = (currentStage.checkpoints || []).every((cp) => isCheckpointDone(cp));
  const nextStage = stages.find((s) => s.order === currentStage.order + 1);

  if (allDone && currentStage.status !== 'Done') {
    return {
      action: `Mark "${currentStage.title}" as Done and advance to ${nextStage?.title || 'next stage'}`,
      reason: 'All checkpoints in the current stage are complete. Moving forward keeps momentum.',
      type: 'advance',
      target: currentStage,
    };
  }

  const readyIdeas = getReadyIdeas(stages)
    .filter((i) => getIdeaRecommendation(i) === 'Do Now')
    .sort((a, b) => {
      const impactOrder = { High: 0, Medium: 1, Low: 2 };
      const effortOrder = { Low: 0, Medium: 1, High: 2 };
      if (impactOrder[a.impact] !== impactOrder[b.impact]) {
        return impactOrder[a.impact] - impactOrder[b.impact];
      }
      return effortOrder[a.effort] - effortOrder[b.effort];
    });

  if (readyIdeas.length > 0) {
    const idea = readyIdeas[0];
    return {
      action: `Execute idea: ${idea.title}`,
      reason: 'High impact, low effort, and ready timing make this the best use of your focus right now.',
      type: 'idea',
      target: idea,
    };
  }

  if (topBlocker) {
    return {
      action: `Address blocker: ${topBlocker.title}`,
      reason: 'Open blockers are slowing progress. Clearing them will improve stage health.',
      type: 'blocker',
      target: topBlocker,
    };
  }

  return {
    action: 'Review your weekly progress',
    reason: 'No urgent actions detected. Take time to reflect and plan ahead.',
    type: 'review',
  };
}

export function getWeeklyReviewData(stages) {
  const sevenDaysAgo = new Date();
  sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

  const completedCheckpoints = getAllCheckpoints(stages).filter((cp) => {
    if (!cp.completedAt) return false;
    return new Date(cp.completedAt) >= sevenDaysAgo;
  });

  const newlyUnlocked = getAllIdeas(stages).filter((idea) => idea.status === 'Ready');

  const activeBlockers = stages.flatMap((s) =>
    (s.blockers || [])
      .filter((b) => b.status === 'Open')
      .map((b) => ({ ...b, stageTitle: s.title }))
  );

  const currentStage = getCurrentStage(stages);
  const progress = currentStage ? getStageProgress(currentStage) : 0;
  const nextMove = getNextBestMove(stages);

  return {
    completedCheckpoints,
    newlyUnlocked,
    activeBlockers,
    currentStage,
    progress,
    suggestedFocus: nextMove.action,
  };
}

export function getIdeaUnlockCondition(idea, stages) {
  const parts = [];
  if (idea.unlockStageId) {
    const stage = getStageById(stages, idea.unlockStageId);
    parts.push(`Stage "${stage?.title || 'Unknown'}" must be Done`);
  }
  if (idea.linkedCheckpointIds?.length > 0) {
    const allCps = getAllCheckpoints(stages);
    const missing = idea.linkedCheckpointIds
      .map((id) => allCps.find((c) => c.id === id))
      .filter((cp) => cp && !isCheckpointDone(cp));
    if (missing.length > 0) {
      parts.push(`Complete: ${missing.map((c) => c.title).join(', ')}`);
    }
  }
  return parts.join(' · ') || 'Manual unlock required';
}

export function getMissingCheckpointsForIdea(idea, stages) {
  if (!idea.linkedCheckpointIds?.length) return [];
  const allCps = getAllCheckpoints(stages);
  return idea.linkedCheckpointIds
    .map((id) => allCps.find((c) => c.id === id))
    .filter((cp) => cp && !isCheckpointDone(cp));
}

export function advanceStage(stages, stageId) {
  return setStageComplete(stages, stageId, true);
}

export function isStageDone(stage) {
  return stage?.status === 'Done' || Boolean(stage?.done);
}

export function setStageComplete(stages, stageId, complete, now = new Date().toISOString()) {
  const sorted = [...stages].sort((a, b) => a.order - b.order);
  const idx = sorted.findIndex((s) => s.id === stageId);
  if (idx === -1) return stages;

  return sorted.map((stage, i) => {
    if (stage.id === stageId) {
      return complete
        ? { ...stage, status: 'Done', done: true, completedAt: stage.completedAt || now }
        : { ...stage, status: 'Current', done: false, completedAt: null };
    }
    if (complete) {
      if (i === idx + 1 && stage.status !== 'Done') return { ...stage, status: 'Current' };
      if (i !== idx + 1 && stage.status === 'Current') return { ...stage, status: 'Locked' };
      return stage;
    }
    if (i === idx + 1 && stage.status === 'Current') return { ...stage, status: 'Locked' };
    return stage;
  });
}

export function toggleStageComplete(stages, stageId, now = new Date().toISOString()) {
  const stage = stages.find((s) => s.id === stageId);
  if (!stage) return stages;
  return setStageComplete(stages, stageId, !isStageDone(stage), now);
}

export function syncAllCheckpoints(stages) {
  return stages.map((stage) => ({
    ...stage,
    checkpoints: (stage.checkpoints || []).map(syncCheckpointDone),
  }));
}

export function processStages(stages, layout = DEFAULT_ROADMAP_LAYOUT) {
  let processed = ensureStagePositions(syncAllCheckpoints(stages), layout);
  processed = syncAllIdeas(processed);
  return processed;
}
