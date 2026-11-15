import { useMemo, useState } from 'react';
import {
  BLOCK_STATUSES,
  BUSINESS_BLOCK_AREAS,
  GOAL_COLORS,
  GOAL_ROLES,
  GOAL_STATUSES,
  LIFE_BLOCK_AREAS,
  NO_AREA,
  WEEKDAYS,
  WORK_DEPTHS,
  blockArea,
  blockKindLabel,
  blockServesLabel,
  normalizeGoalColor,
  weekdayFromDate,
} from '../../lib/path/schema';
import {
  BLOCK_DURATION_CHOICES,
  DEFAULT_BLOCK_MINUTES,
  blockEndClock,
  blockLinkedProject,
  formatBlockStatusStamp,
  formatDuration,
  minutesBetweenClocks,
  recentBlockTitles,
  tasksForBlockProject,
  templateFromBlock,
  withBlockDuration,
} from '../../lib/path/logic';
import { platform } from '../../platform';
import { LIFE_WHEEL_AREAS } from '../../lib/path/wheel';
import { PathServesSelect } from './PathServesSelect';

/** `as="div"` for a field with more than one control, where a wrapping label would steal clicks. */
export function PathField({ label, hint, needs, wide, as: Tag = 'label', children }) {
  return (
    <Tag className={`path-field${wide ? ' path-field--wide' : ''}${needs ? ' path-field--needs' : ''}`}>
      <span>{label}</span>
      {children}
      {needs ? <span className="path-field__hint">{hint || 'Needs completion'}</span> : null}
    </Tag>
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
      <PathField label="Wheel area">
        <select className="input" value={goal.lifeAreaId || ''} onChange={(event) => onChange({ lifeAreaId: event.target.value || null })}>
          <option value="">Not set</option>
          {LIFE_WHEEL_AREAS.map((area) => <option key={area.id} value={area.id}>{area.label}</option>)}
        </select>
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

/** Enter in a single-line field saves the form; not while an input method is still composing. */
function submitOnEnter(onSubmit) {
  return (event) => {
    if (event.key !== 'Enter' || event.nativeEvent.isComposing || !onSubmit) return;
    event.preventDefault();
    onSubmit();
  };
}

/**
 * Title input that offers the titles of earlier blocks; picking one also brings its goal, type and length.
 * Enter picks the highlighted title, or saves the form when none is highlighted.
 */
function BlockTitleField({ block, blocks, goals, onChange, onPick, onSubmit }) {
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const options = useMemo(
    () => recentBlockTitles(blocks, { excludeId: block.id, query: block.title }),
    [blocks, block.id, block.title],
  );
  const shown = open && options.length > 0;

  const pick = (option) => {
    onPick(option);
    setOpen(false);
    setActive(-1);
  };

  const onKeyDown = (event) => {
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      if (!options.length) return;
      event.preventDefault();
      const step = event.key === 'ArrowDown' ? 1 : -1;
      setOpen(true);
      setActive((prev) => {
        if (!shown || prev < 0) return step > 0 ? 0 : options.length - 1;
        return (prev + step + options.length) % options.length;
      });
    } else if (event.key === 'Enter' && shown && options[active]) {
      event.preventDefault();
      pick(options[active]);
    } else if (event.key === 'Enter') {
      submitOnEnter(onSubmit)(event);
    } else if (event.key === 'Escape' && shown) {
      event.stopPropagation();
      setOpen(false);
    }
  };

  return (
    <PathField label="Title" wide as="div">
      <div className="path-combo">
        <input
          className="input"
          aria-label="Title"
          role="combobox"
          aria-expanded={shown}
          aria-controls="path-block-titles"
          aria-autocomplete="list"
          autoComplete="off"
          autoFocus={!block.title && !platform.isMobile}
          placeholder="What is this block for?"
          value={block.title || ''}
          onChange={(event) => {
            onChange({ title: event.target.value });
            setOpen(true);
            setActive(-1);
          }}
          onFocus={() => setOpen(true)}
          onBlur={() => setOpen(false)}
          onKeyDown={onKeyDown}
        />
        {shown ? (
          <ul className="path-combo__list" id="path-block-titles" role="listbox">
            {options.map((option, index) => {
              const goal = goals.find((item) => item.id === option.goalId);
              const meta = [blockServesLabel(option, goal), blockKindLabel(option), formatDuration(option.duration)].filter(Boolean).join(' · ');
              return (
                <li key={option.title} role="option" aria-selected={index === active}>
                  <button
                    type="button"
                    tabIndex={-1}
                    className={`path-combo__option${index === active ? ' path-combo__option--active' : ''}`}
                    onMouseDown={(event) => event.preventDefault()}
                    onMouseEnter={() => setActive(index)}
                    onClick={() => pick(option)}
                  >
                    <span className="path-combo__title">{option.title}</span>
                    {meta ? <span className="path-combo__meta">{meta}</span> : null}
                  </button>
                </li>
              );
            })}
          </ul>
        ) : null}
      </div>
    </PathField>
  );
}

/**
 * Start and end in one field, with one-click lengths underneath. A block or template stores
 * a start and a duration; the end is worked out from them. `onChange` gets `{ startTime }`
 * and/or `{ duration }`; a null duration means "no end", which saves as the default length.
 */
function TimeRangeField({ startTime, duration, onChange }) {
  // An end typed at or before the start, kept so the input does not jump back while it is corrected.
  const [badEnd, setBadEnd] = useState('');
  const hasStart = Boolean(startTime);
  const minutes = Number(duration) > 0 ? Number(duration) : null;
  const end = hasStart ? (badEnd || blockEndClock(startTime, minutes)) : '';
  const invalid = Boolean(badEnd && hasStart);
  const fallback = formatDuration(DEFAULT_BLOCK_MINUTES);

  const setStart = (value) => {
    const next = value || null;
    const fixed = badEnd ? minutesBetweenClocks(next, badEnd) : null;
    if (fixed || !next) setBadEnd('');
    onChange(fixed ? { startTime: next, duration: fixed } : { startTime: next });
  };

  const setEnd = (value) => {
    const next = minutesBetweenClocks(startTime, value);
    setBadEnd(value && !next ? value : '');
    onChange({ duration: next });
  };

  // The lit button already says a standard length; the note covers the rest.
  let note = null;
  if (invalid) note = `End is not after the start → saves as ${fallback}`;
  else if (!minutes) note = `${hasStart ? 'No end time' : 'No length picked'} → ${fallback}`;
  else if (!BLOCK_DURATION_CHOICES.includes(minutes)) note = formatDuration(minutes);

  return (
    <PathField label="Time" as="div">
      <div className="path-time-range">
        <input className="input" type="time" aria-label="Start time" value={startTime || ''} onChange={(event) => setStart(event.target.value)} />
        <span aria-hidden="true">–</span>
        <input className="input" type="time" aria-label="End time" value={end} disabled={!hasStart} onChange={(event) => setEnd(event.target.value)} />
      </div>
      <div className="path-duration-chips" role="group" aria-label="Length">
        {BLOCK_DURATION_CHOICES.map((choice) => {
          const active = !invalid && minutes === choice;
          return (
            <button
              key={choice}
              type="button"
              className={`path-duration-chip${active ? ' path-duration-chip--active' : ''}`}
              aria-pressed={active}
              onClick={() => {
                setBadEnd('');
                onChange({ duration: active ? null : choice });
              }}
            >
              {formatDuration(choice)}
            </button>
          );
        })}
      </div>
      {note ? <span className={invalid ? 'path-field__hint' : 'path-field__note'}>{note}</span> : null}
    </PathField>
  );
}

/**
 * "Type" and "Area" of a block or template. Type says how demanding the work is. Area says
 * which part of a business or of life it is; the week's "Κατανομή ωρών" counts hours by it.
 * Picking a part of life (a meal, a workout) sets the type to shallow: it is not deep work.
 */
function TypeAndAreaFields({ item, onChange }) {
  return (
    <>
      <PathField label="Type">
        <select className="input" value={item.workDepth || WORK_DEPTHS[0]} onChange={(event) => onChange({ workDepth: event.target.value })}>
          {WORK_DEPTHS.map((depth) => <option key={depth} value={depth}>{depth}</option>)}
        </select>
      </PathField>
      <PathField label="Area">
        <select
          className="input"
          value={blockArea(item) || ''}
          onChange={(event) => {
            const area = event.target.value;
            onChange({
              blockType: area || NO_AREA,
              ...(LIFE_BLOCK_AREAS.includes(area) ? { workDepth: 'Shallow Work' } : {}),
            });
          }}
        >
          <option value="">No area</option>
          <optgroup label="Business">
            {BUSINESS_BLOCK_AREAS.map((area) => <option key={area} value={area}>{area}</option>)}
          </optgroup>
          <optgroup label="Life">
            {LIFE_BLOCK_AREAS.map((area) => <option key={area} value={area}>{area}</option>)}
          </optgroup>
        </select>
      </PathField>
    </>
  );
}

/** Saves a block from the form. "Repeat every week" also adds the weekly template it then belongs to. */
export function saveBlockDraft(path, draft) {
  const { repeatWeekly, ...block } = withBlockDuration(draft);
  const template = repeatWeekly && !block.templateId ? templateFromBlock(block) : null;
  if (template) path.upsertTemplate(template);
  return path.upsertBlock(template ? { ...block, templateId: template.id } : block);
}

/**
 * The block form. A new block (`isNew`) asks only for what places it on the week; status
 * shows when editing. `allowRepeat` offers to repeat it weekly (saved through
 * `saveBlockDraft`). `onSubmit` saves on Enter in the title.
 */
export function BlockFields({
  block,
  onChange,
  goals = [],
  tasks = [],
  blocks = [],
  showCompleteTask = false,
  isNew = false,
  allowRepeat = false,
  onSubmit,
}) {
  const selectedGoal = goals.find((item) => item.id === block.goalId) || null;
  const projectTasks = tasksForBlockProject(tasks, block, selectedGoal);
  const { projectId } = blockLinkedProject(block, selectedGoal);

  /** Linking a goal brings its project along and drops a linked task from another project. */
  const goalPatch = (goal) => {
    const nextProjectId = goal ? (goal.projectId || null) : block.projectId;
    const nextProjectTitle = goal ? (goal.projectTitle || null) : block.projectTitle;
    const nextTasks = tasksForBlockProject(tasks, {
      ...block,
      goalId: goal?.id || null,
      projectId: nextProjectId,
      projectTitle: nextProjectTitle,
    }, goal || null);
    const keepTask = Boolean(block.taskId && nextTasks.some((task) => task.id === block.taskId));
    return {
      goalId: goal?.id || null,
      projectId: nextProjectId,
      projectTitle: nextProjectTitle,
      ...(keepTask ? {} : { taskId: null, taskTitle: null, taskSource: null, completeLinkedTask: false }),
    };
  };

  // A remembered title brings its type and area, and fills what is still open: the goal or
  // life area if neither is chosen, the length if no end is set.
  const pickTitle = (option) => {
    const servesOpen = !block.goalId && !block.lifeAreaId;
    const goal = servesOpen ? goals.find((item) => item.id === option.goalId) : null;
    onChange({
      title: option.title,
      ...(option.blockType ? { blockType: option.blockType } : {}),
      ...(option.workDepth ? { workDepth: option.workDepth } : {}),
      ...(goal ? goalPatch(goal) : {}),
      ...(servesOpen && !goal && option.lifeAreaId ? { lifeAreaId: option.lifeAreaId } : {}),
      ...(!(Number(block.duration) > 0) && option.duration > 0 ? { duration: option.duration } : {}),
    });
  };

  const showStatus = !isNew;
  const weekdayLabel = WEEKDAYS.find((day) => day.id === weekdayFromDate(block.date))?.label;

  return (
    <div className="path-form">
      <BlockTitleField block={block} blocks={blocks} goals={goals} onChange={onChange} onPick={pickTitle} onSubmit={onSubmit} />
      <PathField label="Goal or life area" wide>
        <PathServesSelect
          goalId={block.goalId}
          lifeAreaId={block.lifeAreaId}
          goals={goals}
          onChange={({ goalId, lifeAreaId }) => onChange({
            ...goalPatch(goals.find((item) => item.id === goalId)),
            lifeAreaId,
          })}
        />
      </PathField>
      <TypeAndAreaFields item={block} onChange={onChange} />
      <PathField label="Date">
        <input className="input" type="date" value={block.date || ''} onChange={(event) => onChange({ date: event.target.value || null })} />
      </PathField>
      <TimeRangeField startTime={block.startTime} duration={block.duration} onChange={onChange} />
      {showStatus ? (
        <PathField label="Status">
          <select className="input" value={block.status || 'Planned'} onChange={(event) => onChange({ status: event.target.value })}>
            {BLOCK_STATUSES.map((status) => <option key={status} value={status}>{status}</option>)}
          </select>
          {formatBlockStatusStamp(block) ? (
            <span className="path-field__note">{block.status} at {formatBlockStatusStamp(block)}</span>
          ) : null}
        </PathField>
      ) : null}
      <PathField label="Linked task" wide={!showStatus}>
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
          <span className="path-field__note">Link a project goal to see that project’s tasks.</span>
        ) : projectId && !projectTasks.length ? (
          <span className="path-field__note">No open tasks in this project.</span>
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
      {allowRepeat && !block.templateId ? (
        <label className="path-check path-field--wide">
          <input
            type="checkbox"
            checked={Boolean(block.repeatWeekly)}
            disabled={!block.date}
            onChange={(event) => onChange({ repeatWeekly: event.target.checked })}
          />
          {weekdayLabel ? `Repeat every ${weekdayLabel}` : 'Repeat every week'}
        </label>
      ) : null}
    </div>
  );
}

export function TemplateFields({ template, onChange, goals = [], onSubmit }) {
  return (
    <div className="path-form">
      <PathField label="Title" wide>
        <input
          className="input"
          value={template.title || ''}
          onChange={(event) => onChange({ title: event.target.value })}
          onKeyDown={submitOnEnter(onSubmit)}
        />
      </PathField>
      <PathField label="Goal or life area">
        <PathServesSelect goalId={template.goalId} lifeAreaId={template.lifeAreaId} goals={goals} onChange={onChange} />
      </PathField>
      <PathField label="Weekday">
        <select className="input" value={template.weekday || 1} onChange={(event) => onChange({ weekday: Number(event.target.value) })}>
          {WEEKDAYS.map((day) => <option key={day.id} value={day.id}>{day.label}</option>)}
        </select>
      </PathField>
      <TypeAndAreaFields item={template} onChange={onChange} />
      <TimeRangeField startTime={template.startTime} duration={template.duration} onChange={onChange} />
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
