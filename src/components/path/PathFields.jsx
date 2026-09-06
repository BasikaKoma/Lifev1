import {
  BLOCK_STATUSES,
  BLOCK_TYPES,
  GOAL_COLORS,
  GOAL_ROLES,
  GOAL_STATUSES,
  METRIC_DIRECTIONS,
  METRIC_FREQUENCIES,
  METRIC_TYPES,
  WEEKDAYS,
  normalizeGoalColor,
} from '../../lib/path/schema';
import { blockLinkedProject, formatBlockStatusStamp, tasksForBlockProject } from '../../lib/path/logic';

export function PathField({ label, hint, needs, wide, children }) {
  return (
    <label className={`path-field${wide ? ' path-field--wide' : ''}${needs ? ' path-field--needs' : ''}`}>
      <span>{label}</span>
      {children}
      {needs ? <span className="path-field__hint">{hint || 'Needs completion'}</span> : null}
    </label>
  );
}

export function GoalFields({ goal, onChange, projects = [], showStatus = true, showCurrent = true, highlightMissing = false }) {
  const missing = new Set(highlightMissing ? (goal.missing || []) : []);
  const needs = (key) => highlightMissing && (
    (key === 'title' && !goal.title?.trim())
    || (key === 'role' && !goal.role)
    || (key === 'area' && !goal.projectTitle && !goal.lifeArea)
    || (key === 'baseline' && !goal.baseline)
    || (key === 'target' && !String(goal.target || '').trim())
    || (key === 'deadline' && !goal.deadline)
    || (key === 'why' && !goal.why)
    || (key === 'weeklyAllocation' && !goal.weeklyAllocation)
    || (key === 'minimumAction' && !goal.minimumAction)
    || missing.has(key)
  );

  return (
    <div className="path-form">
      <PathField label="Title" wide needs={needs('title')}>
        <input className="input" value={goal.title || ''} onChange={(event) => onChange({ title: event.target.value })} />
      </PathField>
      <PathField label="Project" needs={needs('area')}>
        <select
          className="input"
          value={goal.projectId || ''}
          onChange={(event) => {
            const project = projects.find((item) => item.id === event.target.value);
            onChange({
              projectId: project?.id || null,
              projectTitle: project?.title || null,
              lifeArea: project ? null : goal.lifeArea,
            });
          }}
        >
          <option value="">No project</option>
          {projects.map((project) => (
            <option key={project.id} value={project.id}>{project.title}</option>
          ))}
        </select>
      </PathField>
      <PathField label="Life area" needs={needs('area')}>
        <input
          className="input"
          value={goal.lifeArea || ''}
          onChange={(event) => onChange({ lifeArea: event.target.value || null, projectTitle: goal.projectId ? goal.projectTitle : (event.target.value || null) })}
          placeholder="e.g. Health, Sales"
        />
      </PathField>
      <PathField label="Role" needs={needs('role')}>
        <select className="input" value={goal.role || ''} onChange={(event) => onChange({ role: event.target.value || null })}>
          {highlightMissing ? <option value="">Select role</option> : null}
          {GOAL_ROLES.map((role) => <option key={role} value={role}>{role}</option>)}
        </select>
      </PathField>
      {showStatus ? (
        <PathField label="Status">
          <select className="input" value={goal.status || 'Active'} onChange={(event) => onChange({ status: event.target.value })}>
            {GOAL_STATUSES.map((status) => <option key={status} value={status}>{status}</option>)}
          </select>
        </PathField>
      ) : null}
      <PathField label="Color" wide>
        <div className="path-color-picker">
          {GOAL_COLORS.map((color) => (
            <button
              key={color}
              type="button"
              className={`path-color-swatch${goal.color === color ? ' path-color-swatch--active' : ''}`}
              style={{ background: color }}
              aria-label={`Color ${color}`}
              aria-pressed={goal.color === color}
              onClick={() => onChange({ color })}
            />
          ))}
          <label className="path-color-custom">
            <input
              type="color"
              value={normalizeGoalColor(goal.color) || '#38bdf8'}
              onChange={(event) => onChange({ color: event.target.value })}
              aria-label="Custom color"
            />
            Custom
          </label>
        </div>
      </PathField>
      <PathField label="Baseline — where you are now" needs={needs('baseline')}>
        <input
          className="input"
          value={goal.baseline || ''}
          onChange={(event) => onChange({ baseline: event.target.value || null })}
          placeholder="π.χ. 80 κιλά, μέση 92 cm"
        />
      </PathField>
      <PathField label="Target" wide needs={needs('target')}>
        <input
          className="input"
          value={goal.target || ''}
          onChange={(event) => onChange({ target: event.target.value || null })}
          placeholder="π.χ. 72 kg με 12% λίπος"
        />
      </PathField>
      {showCurrent ? (
        <PathField label="Current">
          <input className="input" type="number" value={goal.currentValue ?? ''} onChange={(event) => onChange({ currentValue: event.target.value === '' ? null : Number(event.target.value) })} />
        </PathField>
      ) : null}
      <PathField label="Unit">
        <input className="input" value={goal.unit || ''} onChange={(event) => onChange({ unit: event.target.value || null })} placeholder="e.g. kg, €, calls" />
      </PathField>
      <PathField label="Deadline" needs={needs('deadline')}>
        <input className="input" type="date" value={goal.deadline || ''} onChange={(event) => onChange({ deadline: event.target.value || null })} />
      </PathField>
      <PathField label="Weekly allocation" needs={needs('weeklyAllocation')}>
        <input className="input" value={goal.weeklyAllocation || ''} onChange={(event) => onChange({ weeklyAllocation: event.target.value || null })} placeholder="e.g. 6h" />
      </PathField>
      <PathField label="Minimum action" wide needs={needs('minimumAction')}>
        <input className="input" value={goal.minimumAction || ''} onChange={(event) => onChange({ minimumAction: event.target.value || null })} />
      </PathField>
      <PathField label="Why" wide needs={needs('why')}>
        <textarea className="input" rows={3} value={goal.why || ''} onChange={(event) => onChange({ why: event.target.value || null })} />
      </PathField>
    </div>
  );
}

export function BlockFields({ block, onChange, goals = [], tasks = [], showCompleteTask = false }) {
  const selectedGoal = goals.find((item) => item.id === block.goalId) || null;
  const projectTasks = tasksForBlockProject(tasks, block, selectedGoal);
  const { projectId } = blockLinkedProject(block, selectedGoal);

  return (
    <div className="path-form">
      <PathField label="Title" wide>
        <input className="input" value={block.title || ''} onChange={(event) => onChange({ title: event.target.value })} />
      </PathField>
      <PathField label="Goal">
        <select
          className="input"
          value={block.goalId || ''}
          onChange={(event) => {
            const goal = goals.find((item) => item.id === event.target.value);
            const nextProjectId = goal ? (goal.projectId || null) : block.projectId;
            const nextProjectTitle = goal ? (goal.projectTitle || null) : block.projectTitle;
            const nextTasks = tasksForBlockProject(tasks, {
              ...block,
              goalId: goal?.id || null,
              projectId: nextProjectId,
              projectTitle: nextProjectTitle,
            }, goal || null);
            const keepTask = Boolean(block.taskId && nextTasks.some((task) => task.id === block.taskId));
            onChange({
              goalId: goal?.id || null,
              projectId: nextProjectId,
              projectTitle: nextProjectTitle,
              ...(keepTask ? {} : { taskId: null, taskTitle: null, taskSource: null, completeLinkedTask: false }),
            });
          }}
        >
          <option value="">No goal</option>
          {goals.map((goal) => <option key={goal.id} value={goal.id}>{goal.title}</option>)}
        </select>
      </PathField>
      <PathField label="Type">
        <select className="input" value={block.blockType || 'Deep Work'} onChange={(event) => onChange({ blockType: event.target.value })}>
          {BLOCK_TYPES.map((type) => <option key={type} value={type}>{type}</option>)}
        </select>
      </PathField>
      <PathField label="Date">
        <input className="input" type="date" value={block.date || ''} onChange={(event) => onChange({ date: event.target.value || null })} />
      </PathField>
      <PathField label="Start time">
        <input className="input" type="time" value={block.startTime || ''} onChange={(event) => onChange({ startTime: event.target.value || null })} />
      </PathField>
      <PathField label="Duration (min)">
        <input className="input" type="number" value={block.duration ?? ''} onChange={(event) => onChange({ duration: event.target.value === '' ? null : Number(event.target.value) })} />
      </PathField>
      <PathField label="Normal duration (min)">
        <input className="input" type="number" value={block.normalDuration ?? ''} onChange={(event) => onChange({ normalDuration: event.target.value === '' ? null : Number(event.target.value) })} />
      </PathField>
      <PathField label="Minimum duration (min)">
        <input className="input" type="number" value={block.minimumDuration ?? ''} onChange={(event) => onChange({ minimumDuration: event.target.value === '' ? null : Number(event.target.value) })} />
      </PathField>
      <PathField label="Minimum action" wide>
        <input className="input" value={block.minimumAction || ''} onChange={(event) => onChange({ minimumAction: event.target.value || null })} />
      </PathField>
      <PathField label="Status">
        <select className="input" value={block.status || 'Planned'} onChange={(event) => onChange({ status: event.target.value })}>
          {BLOCK_STATUSES.map((status) => <option key={status} value={status}>{status}</option>)}
        </select>
        {formatBlockStatusStamp(block) ? (
          <span className="path-field__hint">{block.status} at {formatBlockStatusStamp(block)}</span>
        ) : null}
      </PathField>
      <PathField label="Linked task">
        <select
          className="input"
          value={block.taskId || ''}
          onChange={(event) => {
            const task = projectTasks.find((item) => item.id === event.target.value);
            onChange({
              taskId: task?.id || null,
              taskTitle: task?.title || null,
              taskSource: task?.source || null,
            });
          }}
        >
          <option value="">None — time commitment only</option>
          {projectTasks.map((task) => (
            <option key={task.id} value={task.id}>{task.title}</option>
          ))}
        </select>
        {!projectId && !projectTasks.length ? (
          <span className="path-field__hint">Link a project goal to see that project’s tasks.</span>
        ) : projectId && !projectTasks.length ? (
          <span className="path-field__hint">No open tasks in this project.</span>
        ) : null}
      </PathField>
      {showCompleteTask && block.taskId ? (
        <label className="path-check path-field--wide">
          <input
            type="checkbox"
            checked={Boolean(block.completeLinkedTask)}
            onChange={(event) => onChange({ completeLinkedTask: event.target.checked })}
          />
          Also complete the linked task
        </label>
      ) : null}
    </div>
  );
}

export function TemplateFields({ template, onChange, goals = [] }) {
  return (
    <div className="path-form">
      <PathField label="Title" wide>
        <input className="input" value={template.title || ''} onChange={(event) => onChange({ title: event.target.value })} />
      </PathField>
      <PathField label="Goal">
        <select className="input" value={template.goalId || ''} onChange={(event) => onChange({ goalId: event.target.value || null })}>
          <option value="">No goal</option>
          {goals.map((goal) => <option key={goal.id} value={goal.id}>{goal.title}</option>)}
        </select>
      </PathField>
      <PathField label="Weekday">
        <select className="input" value={template.weekday || 1} onChange={(event) => onChange({ weekday: Number(event.target.value) })}>
          {WEEKDAYS.map((day) => <option key={day.id} value={day.id}>{day.label}</option>)}
        </select>
      </PathField>
      <PathField label="Start time">
        <input className="input" type="time" value={template.startTime || ''} onChange={(event) => onChange({ startTime: event.target.value || null })} />
      </PathField>
      <PathField label="Duration (min)">
        <input className="input" type="number" value={template.duration ?? ''} onChange={(event) => onChange({ duration: event.target.value === '' ? null : Number(event.target.value) })} />
      </PathField>
      <PathField label="Type">
        <select className="input" value={template.blockType || 'Deep Work'} onChange={(event) => onChange({ blockType: event.target.value })}>
          {BLOCK_TYPES.map((type) => <option key={type} value={type}>{type}</option>)}
        </select>
      </PathField>
      <PathField label="Minimum action" wide>
        <input className="input" value={template.minimumAction || ''} onChange={(event) => onChange({ minimumAction: event.target.value || null })} />
      </PathField>
    </div>
  );
}

export function MetricFields({ metric, onChange, goals = [] }) {
  return (
    <div className="path-form">
      <PathField label="Name" wide>
        <input className="input" value={metric.name || ''} onChange={(event) => onChange({ name: event.target.value })} />
      </PathField>
      <PathField label="Goal">
        <select className="input" value={metric.goalId || ''} onChange={(event) => onChange({ goalId: event.target.value || null })}>
          <option value="">No goal</option>
          {goals.map((goal) => <option key={goal.id} value={goal.id}>{goal.title}</option>)}
        </select>
      </PathField>
      <PathField label="Type">
        <select className="input" value={metric.type || 'Outcome'} onChange={(event) => onChange({ type: event.target.value })}>
          {METRIC_TYPES.map((type) => <option key={type} value={type}>{type}</option>)}
        </select>
      </PathField>
      <PathField label="Direction">
        <select className="input" value={metric.direction || 'Increase'} onChange={(event) => onChange({ direction: event.target.value })}>
          {METRIC_DIRECTIONS.map((direction) => <option key={direction} value={direction}>{direction}</option>)}
        </select>
      </PathField>
      <PathField label="Frequency">
        <select className="input" value={metric.frequency || 'Weekly'} onChange={(event) => onChange({ frequency: event.target.value })}>
          {METRIC_FREQUENCIES.map((frequency) => <option key={frequency} value={frequency}>{frequency}</option>)}
        </select>
      </PathField>
      <PathField label="Unit">
        <input className="input" value={metric.unit || ''} onChange={(event) => onChange({ unit: event.target.value || null })} />
      </PathField>
      <PathField label="Baseline">
        <input className="input" type="number" value={metric.baseline ?? ''} onChange={(event) => onChange({ baseline: event.target.value === '' ? null : Number(event.target.value) })} />
      </PathField>
      <PathField label="Target">
        <input className="input" type="number" value={metric.target ?? ''} onChange={(event) => onChange({ target: event.target.value === '' ? null : Number(event.target.value) })} />
      </PathField>
    </div>
  );
}

export function PathModal({ open, title, children, onClose }) {
  if (!open) return null;
  return (
    <div className="path-modal" role="dialog" aria-modal="true" aria-labelledby="path-modal-title">
      <button type="button" className="path-modal__backdrop" onClick={onClose} aria-label="Close" />
      <div className="path-modal__panel">
        <h2 id="path-modal-title">{title}</h2>
        {children}
      </div>
    </div>
  );
}
