import { useMemo, useState } from 'react';
import { createEmptyBlock, createEmptyGoal, goalColorStyle, nextGoalColor, nowIso, startOfWeekMonday } from '../../lib/path/schema';
import {
  computeGoalProgress,
  computeTrackStatus,
  formatDateLabel,
  formatGoalAim,
  metricsForGoal,
  progressPercent,
  resolveCurrentValue,
  sortGoals,
  weekBlockStats,
} from '../../lib/path/logic';
import { BlockFields, GoalFields, PathModal } from './PathFields';

const TRACK_CLASS = {
  'On track': 'path-pill--ontrack',
  'At risk': 'path-pill--atrisk',
  'No data': 'path-pill--nodata',
};

const ROLE_CLASS = {
  Primary: 'path-pill--primary',
  Growth: 'path-pill--growth',
  Maintenance: 'path-pill--maintenance',
};

function GoalCard({ goal, metrics, blocks, weekStart, onOpen }) {
  const current = resolveCurrentValue(goal, metrics);
  const progress = progressPercent(computeGoalProgress(goal, metrics));
  const track = computeTrackStatus(goal, metrics);
  const week = weekBlockStats(blocks, goal.id, weekStart);
  const area = goal.projectTitle || goal.lifeArea;

  return (
    <button type="button" className={`path-card${goal.color ? ' path-card--goal' : ''}`} style={goalColorStyle(goal.color)} onClick={() => onOpen(goal)}>
      <div className="path-card__top">
        <h3 className="path-card__title">
          {goal.color ? <span className="path-color-dot" style={{ background: goal.color }} /> : null}
          {goal.title || 'Untitled goal'}
        </h3>
        <span className={`path-pill ${ROLE_CLASS[goal.role] || ''}`}>{goal.role}</span>
      </div>
      <p className="path-card__meta">
        {formatGoalAim(goal, current)}
        {goal.deadline ? ` · ${formatDateLabel(goal.deadline)}` : ''}
      </p>
      <div className="path-progress" aria-hidden>
        <span style={{ width: `${progress ?? 0}%` }} />
      </div>
      <div className="path-pills">
        <span className={`path-pill ${TRACK_CLASS[track] || ''}`}>{track}</span>
        <span className="path-pill">{goal.status}</span>
        {area ? <span className="path-pill">{area}</span> : null}
      </div>
      <p className="path-card__meta">
        This week: {week.done} done · {week.planned} planned
      </p>
    </button>
  );
}

export function PathGoals({
  path,
  projects = [],
  tasks = [],
  weekStart,
  onImport,
}) {
  const [includeArchived, setIncludeArchived] = useState(false);
  const [editor, setEditor] = useState(null);
  const [detail, setDetail] = useState(null);
  const [blockDraft, setBlockDraft] = useState(null);

  const goals = useMemo(
    () => sortGoals(path.goals).filter((goal) => includeArchived || goal.status !== 'Archived'),
    [path.goals, includeArchived],
  );

  const openNew = () => setEditor(createEmptyGoal({
    title: '',
    role: 'Primary',
    status: 'Active',
    color: nextGoalColor(path.goals),
  }));
  const saveEditor = () => {
    if (!editor?.title?.trim()) return;
    path.upsertGoal(editor);
    setEditor(null);
    if (detail?.id === editor.id) setDetail(editor);
  };

  const selected = detail ? path.goals.find((goal) => goal.id === detail.id) || detail : null;
  const selectedMetrics = selected ? metricsForGoal(path.metrics, selected.id) : [];
  const selectedBlocks = selected
    ? path.blocks.filter((block) => block.goalId === selected.id)
    : [];
  const project = selected
    ? projects.find((item) => item.id === selected.projectId) || null
    : null;

  return (
    <div>
      <div className="path-toolbar">
        <div className="path-toolbar__filters">
          <label className="path-check">
            <input type="checkbox" checked={includeArchived} onChange={(event) => setIncludeArchived(event.target.checked)} />
            Show archived
          </label>
        </div>
        <div className="path-view__actions">
          <button type="button" className="btn" onClick={onImport}>Import Plan</button>
          <button type="button" className="btn btn--primary" onClick={openNew}>New Goal</button>
        </div>
      </div>

      {goals.length === 0 ? (
        <section className="path-panel" style={{ marginTop: 16 }}>
          <p className="path-empty">
            Decide the 90-day goals here, then follow them in Week. Import a plan PDF or create the first goal.
          </p>
        </section>
      ) : (
        <div className="path-grid" style={{ marginTop: 16 }}>
          {goals.map((goal) => (
            <GoalCard
              key={goal.id}
              goal={goal}
              metrics={path.metrics}
              blocks={path.blocks}
              weekStart={weekStart}
              onOpen={setDetail}
            />
          ))}
        </div>
      )}

      {selected ? (
        <section className="path-detail" style={{ marginTop: 20 }}>
          <div className={`path-panel${selected.color ? ' path-card--goal' : ''}`} style={goalColorStyle(selected.color)}>
            <div className="path-card__top">
              <h2 className="path-card__title">{selected.title}</h2>
              <div className="path-view__actions">
                <button type="button" className="btn" onClick={() => setEditor(selected)}>Edit</button>
                {selected.status !== 'Archived' ? (
                  <button type="button" className="btn" onClick={() => { path.archiveGoal(selected.id); setDetail(null); }}>
                    Archive
                  </button>
                ) : null}
              </div>
            </div>
            <p className="path-empty">{selected.why || 'No why captured yet.'}</p>
            <p className="path-card__meta" style={{ marginTop: 10 }}>
              Minimum action: {selected.minimumAction || '—'}
              {selected.weeklyAllocation ? ` · ${selected.weeklyAllocation} / week` : ''}
            </p>
            <GoalFields
              goal={selected}
              projects={projects}
              onChange={(patch) => {
                const next = { ...selected, ...patch, updatedAt: nowIso() };
                path.upsertGoal(next);
                setDetail(next);
              }}
            />
          </div>
          <div className="path-detail__side">
            <section className="path-panel">
              <p className="path-card__meta">Project</p>
              <p className="path-card__title">{project?.title || selected.projectTitle || selected.lifeArea || 'No project linked'}</p>
            </section>
            <section className="path-panel">
              <div className="path-card__top">
                <p className="path-card__meta">Metrics</p>
              </div>
              {selectedMetrics.length ? (
                <ul className="path-side-list">
                  {selectedMetrics.map((metric) => (
                    <li key={metric.id}>{metric.type}: {metric.name}</li>
                  ))}
                </ul>
              ) : (
                <p className="path-empty">No linked metrics yet.</p>
              )}
            </section>
            <section className="path-panel">
              <div className="path-card__top">
                <p className="path-card__meta">This week&apos;s blocks</p>
                <button
                  type="button"
                  className="path-day__add"
                  onClick={() => setBlockDraft(createEmptyBlock({
                    goalId: selected.id,
                    title: selected.minimumAction || selected.title,
                    date: startOfWeekMonday(),
                    projectId: selected.projectId,
                    projectTitle: selected.projectTitle,
                    minimumAction: selected.minimumAction,
                  }))}
                >
                  + Block
                </button>
              </div>
              {selectedBlocks.length ? (
                <ul className="path-side-list">
                  {selectedBlocks.slice(0, 8).map((block) => (
                    <li key={block.id}>{block.date} · {block.title} · {block.status}</li>
                  ))}
                </ul>
              ) : (
                <p className="path-empty">No blocks linked to this goal.</p>
              )}
            </section>
          </div>
        </section>
      ) : null}

      <PathModal open={Boolean(editor)} title={editor?.createdAt && path.goals.some((goal) => goal.id === editor.id) ? 'Edit goal' : 'New goal'} onClose={() => setEditor(null)}>
        {editor ? (
          <>
            <GoalFields goal={editor} projects={projects} onChange={(patch) => setEditor((prev) => ({ ...prev, ...patch }))} />
            <div className="path-modal__actions">
              <button type="button" className="btn" onClick={() => setEditor(null)}>Cancel</button>
              <button type="button" className="btn btn--primary" onClick={saveEditor} disabled={!editor.title?.trim()}>Save goal</button>
            </div>
          </>
        ) : null}
      </PathModal>

      <PathModal open={Boolean(blockDraft)} title="New block" onClose={() => setBlockDraft(null)}>
        {blockDraft ? (
          <>
            <BlockFields
              block={blockDraft}
              goals={path.goals}
              tasks={tasks}
              onChange={(patch) => setBlockDraft((prev) => ({ ...prev, ...patch }))}
            />
            <div className="path-modal__actions">
              <button type="button" className="btn" onClick={() => setBlockDraft(null)}>Cancel</button>
              <button
                type="button"
                className="btn btn--primary"
                onClick={() => {
                  path.upsertBlock(blockDraft);
                  setBlockDraft(null);
                }}
              >
                Save block
              </button>
            </div>
          </>
        ) : null}
      </PathModal>
    </div>
  );
}
