import { createEmptyGoal, createEmptyStage, generateId, reindexGoals } from '../data/templates';
import { findStageIdFromHint } from '../utils/assistantParser';
import { processStages, syncCheckpointDone } from '../utils/logic';
import { userAskedToCreate } from './router';
import { normalizeSearchText } from './snapshot/loadAppCatalog';

export const BRAIN_ACTION_TYPES = [
  'create_project',
  'create_stage',
  'create_checkpoint',
  'create_goal',
  'create_note',
  'create_idea',
  'complete_checkpoint',
  'update_checkpoint',
  'update_note',
  'open_project',
];

const MUTATION_TYPES = [
  'create_stage',
  'create_checkpoint',
  'create_goal',
  'create_note',
  'create_idea',
  'complete_checkpoint',
  'update_checkpoint',
  'update_note',
];

function clean(value) {
  return String(value || '').replace(/\s+/g, ' ').trim();
}

function makeCheckpoint(title) {
  return {
    id: generateId(),
    title,
    checkpointType: 'Quality',
    metricName: title,
    currentValue: 0,
    targetValue: 1,
    unit: '',
    currency: 'EUR',
    checklistItems: [{ id: generateId(), text: title, checked: false }],
    done: false,
    completedAt: null,
  };
}

export function normalizeBrainActions(raw = []) {
  return (Array.isArray(raw) ? raw : [])
    .map((item) => {
      if (!item || typeof item !== 'object') return null;
      const type = BRAIN_ACTION_TYPES.includes(item.type) ? item.type : null;
      const title = clean(item.title);
      if (!type || !title) return null;
      return {
        type,
        title,
        body: clean(item.body),
        stageTitle: clean(item.stageTitle),
        projectTitle: clean(item.projectTitle),
        items: (Array.isArray(item.items) ? item.items : [])
          .map(clean)
          .filter(Boolean)
          .slice(0, 10),
      };
    })
    .filter(Boolean)
    .slice(0, 16);
}

export function buildProjectSeed(actions = []) {
  const project = actions.find((item) => item.type === 'create_project');
  if (!project) return null;

  const stages = [];
  const firstCheckpoints = [
    ...(project.items || []),
    ...actions
      .filter((item) => item.type === 'create_checkpoint' && (!item.stageTitle || item.stageTitle === project.stageTitle))
      .map((item) => item.title),
  ].filter(Boolean).slice(0, 10);

  stages.push({
    ...createEmptyStage(1, true),
    title: project.stageTitle || 'Milestone 1',
    description: project.body || '',
    checkpoints: firstCheckpoints.map(makeCheckpoint),
  });

  for (const extra of actions.filter((item) => item.type === 'create_stage')) {
    stages.push({
      ...createEmptyStage(stages.length + 1, false),
      title: extra.title || extra.stageTitle || `Milestone ${stages.length + 1}`,
      description: extra.body || '',
      checkpoints: (extra.items || []).map(makeCheckpoint),
    });
  }

  const goals = actions
    .filter((item) => item.type === 'create_goal')
    .map((item, index) => ({
      ...createEmptyGoal(index + 1, index === 0),
      title: item.title,
      description: item.body || '',
    }));
  if (!goals.length) {
    goals.push({
      ...createEmptyGoal(1, true),
      title: project.title,
      description: project.body || '',
    });
  }

  const now = new Date().toISOString();
  const notes = actions
    .filter((item) => item.type === 'create_note')
    .map((item) => ({
      id: generateId(),
      title: item.title,
      body: item.body || item.title,
      relatedStageId: null,
      relatedGoalId: null,
      createdAt: now,
      updatedAt: now,
    }));
  if (project.body && !notes.length) {
    notes.push({
      id: generateId(),
      title: project.title,
      body: project.body,
      relatedStageId: null,
      relatedGoalId: null,
      createdAt: now,
      updatedAt: now,
    });
  }

  return {
    stages: processStages(stages),
    goals: reindexGoals(goals),
    notes,
  };
}

export function toAssistantIntents(actions = []) {
  return actions
    .filter((item) => item.type !== 'create_project')
    .map((item) => {
      if (item.type === 'create_checkpoint') {
        return { type: 'checkpoint', title: item.title, stageHint: item.stageTitle || null };
      }
      if (item.type === 'create_goal') {
        return { type: 'goal', title: item.title, description: item.body || '' };
      }
      if (item.type === 'create_note') {
        return { type: 'note', title: item.title, body: item.body || item.title };
      }
      if (item.type === 'create_idea') {
        return { type: 'idea', title: item.title, stageHint: item.stageTitle || null };
      }
      return null;
    })
    .filter(Boolean);
}

export function shouldConfirmBrainActions(actions = [], question = '') {
  return (actions || []).some((item) => item.type === 'create_project') && !userAskedToCreate(question);
}

function matchTitle(value, hint) {
  const needle = normalizeSearchText(hint);
  const title = normalizeSearchText(value);
  if (!needle || !title) return 0;
  if (title === needle) return 3;
  if (title.includes(needle) || needle.includes(title)) return 2;
  return 0;
}

export function findCheckpointInStages(stages, hint) {
  let best = null;
  let bestScore = 0;
  for (const stage of stages || []) {
    for (const checkpoint of stage.checkpoints || []) {
      const score = matchTitle(checkpoint.title, hint);
      if (score > bestScore) {
        bestScore = score;
        best = { stageId: stage.id, checkpoint };
      }
    }
  }
  return best;
}

function findNoteInList(notes, hint) {
  let best = null;
  let bestScore = 0;
  for (const note of notes || []) {
    const score = Math.max(matchTitle(note.title, hint), matchTitle(note.body, hint) ? 1 : 0);
    if (score > bestScore) {
      bestScore = score;
      best = note;
    }
  }
  return best;
}

export function applyBrainMutationsToState(state, actions = []) {
  if (!state) throw new Error('No project state to update');
  let stages = [...(state.stages || [])];
  let notes = [...(state.notes || [])];
  let goals = [...(state.goals || [])];
  const columns = new Set();
  const parts = [];
  const now = new Date().toISOString();

  for (const action of actions || []) {
    if (action.type === 'create_checkpoint') {
      const stageId = findStageIdFromHint(stages, action.stageTitle);
      if (!stageId) {
        parts.push(`δεν βρήκα milestone για «${action.title}»`);
        continue;
      }
      const checkpoint = makeCheckpoint(action.title);
      stages = stages.map((stage) => (
        stage.id === stageId
          ? { ...stage, checkpoints: [...(stage.checkpoints || []), checkpoint] }
          : stage
      ));
      columns.add('stages');
      parts.push(`checkpoint «${action.title}»`);
      continue;
    }

    if (action.type === 'create_stage') {
      stages = [
        ...stages,
        {
          ...createEmptyStage(stages.length + 1, false),
          title: action.title || action.stageTitle || `Milestone ${stages.length + 1}`,
          description: action.body || '',
          checkpoints: (action.items || []).map(makeCheckpoint),
        },
      ];
      columns.add('stages');
      parts.push(`milestone «${action.title}»`);
      continue;
    }

    if (action.type === 'create_goal') {
      const sorted = [...goals].sort((a, b) => a.order - b.order);
      const maxOrder = sorted.length ? Math.max(...sorted.map((goal) => goal.order)) : 0;
      goals = [
        ...sorted,
        {
          ...createEmptyGoal(maxOrder + 1, sorted.length === 0),
          title: action.title,
          description: action.body || '',
        },
      ];
      columns.add('goals');
      parts.push(`στόχο «${action.title}»`);
      continue;
    }

    if (action.type === 'create_note') {
      notes = [
        {
          id: generateId(),
          title: action.title,
          body: action.body || action.title,
          relatedStageId: findStageIdFromHint(stages, action.stageTitle) || null,
          relatedGoalId: null,
          createdAt: now,
          updatedAt: now,
        },
        ...notes,
      ];
      columns.add('notes');
      parts.push(`σημείωση «${action.title}»`);
      continue;
    }

    if (action.type === 'create_idea') {
      const stageId = findStageIdFromHint(stages, action.stageTitle);
      if (!stageId) {
        parts.push(`δεν βρήκα milestone για ιδέα «${action.title}»`);
        continue;
      }
      const idea = {
        id: generateId(),
        title: action.title,
        description: action.body || '',
        reasonToWait: '',
        unlockStageId: null,
        linkedCheckpointIds: [],
        actionAfterUnlock: '',
        impact: 'Medium',
        effort: 'Medium',
        timing: 'Too Early',
        status: 'Locked',
        reviewDate: null,
      };
      stages = stages.map((stage) => (
        stage.id === stageId ? { ...stage, ideas: [...(stage.ideas || []), idea] } : stage
      ));
      columns.add('stages');
      parts.push(`ιδέα «${action.title}»`);
      continue;
    }

    if (action.type === 'complete_checkpoint') {
      const found = findCheckpointInStages(stages, action.title);
      if (!found) {
        parts.push(`δεν βρήκα checkpoint «${action.title}»`);
        continue;
      }
      stages = stages.map((stage) => {
        if (stage.id !== found.stageId) return stage;
        return {
          ...stage,
          checkpoints: (stage.checkpoints || []).map((checkpoint) => {
            if (checkpoint.id !== found.checkpoint.id) return checkpoint;
            const numeric = checkpoint.checkpointType === 'Number' || checkpoint.checkpointType === 'Money';
            return syncCheckpointDone({
              ...checkpoint,
              done: true,
              currentValue: numeric ? (checkpoint.targetValue || checkpoint.currentValue || 1) : checkpoint.currentValue,
              checklistItems: (checkpoint.checklistItems || []).map((item) => ({ ...item, checked: true })),
            });
          }),
        };
      });
      columns.add('stages');
      parts.push(`ολοκλήρωσα «${found.checkpoint.title}»`);
      continue;
    }

    if (action.type === 'update_checkpoint') {
      const found = findCheckpointInStages(stages, action.title);
      if (!found) {
        parts.push(`δεν βρήκα checkpoint «${action.title}»`);
        continue;
      }
      stages = stages.map((stage) => {
        if (stage.id !== found.stageId) return stage;
        return {
          ...stage,
          checkpoints: (stage.checkpoints || []).map((checkpoint) => {
            if (checkpoint.id !== found.checkpoint.id) return checkpoint;
            return {
              ...checkpoint,
              title: action.title || checkpoint.title,
              checklistItems: action.body
                ? [{ id: generateId(), text: action.body, checked: false }, ...(checkpoint.checklistItems || [])]
                : checkpoint.checklistItems,
            };
          }),
        };
      });
      columns.add('stages');
      parts.push(`ενημέρωσα checkpoint «${found.checkpoint.title}»`);
      continue;
    }

    if (action.type === 'update_note') {
      const found = findNoteInList(notes, action.title);
      if (!found) {
        parts.push(`δεν βρήκα σημείωση «${action.title}»`);
        continue;
      }
      notes = notes.map((note) => (
        note.id === found.id
          ? {
            ...note,
            title: action.title || note.title,
            body: action.body || note.body,
            updatedAt: now,
          }
          : note
      ));
      columns.add('notes');
      parts.push(`ενημέρωσα σημείωση «${found.title}»`);
    }
  }

  return {
    state: {
      ...state,
      stages: processStages(stages),
      notes,
      goals: reindexGoals(goals),
    },
    columns: [...columns],
    parts,
  };
}

export function mutationActions(actions = []) {
  return (actions || []).filter((item) => MUTATION_TYPES.includes(item.type));
}

export function openProjectActions(actions = []) {
  return (actions || []).filter((item) => item.type === 'open_project');
}
