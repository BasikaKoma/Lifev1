import { useMemo, useState } from 'react';
import { usePath } from '../../hooks/usePath';
import { PATH_TABS, startOfWeekMonday } from '../../lib/path/schema';
import { collectLinkableTasks } from '../../lib/path/logic';
import { hasImportDraft } from '../../lib/path/importPlan';
import { filterRegularProjects } from '../../utils/lifeline';
import { pathTabFromPathname } from '../../utils/appNavigation';
import { CallsView } from '../CallsView';
import { PathGoals } from './PathGoals';
import { PathWeek } from './PathWeek';
import { PathMetrics } from './PathMetrics';
import { PathImportPlan } from './PathImportPlan';
import './path.css';

function initialPathTab(requested) {
  if (PATH_TABS.some((item) => item.id === requested)) return requested;
  const fromUrl = typeof window !== 'undefined' ? pathTabFromPathname(window.location.pathname) : null;
  return fromUrl || 'goals';
}

export function PathView({
  projectList = [],
  projectId,
  projectTitle,
  stages = [],
  canvasTasks = [],
  projectActivity = [],
  onCompleteLinkedTask,
  initialTab,
}) {
  const path = usePath();
  const [tab, setTab] = useState(() => initialPathTab(initialTab));
  const [importing, setImporting] = useState(() => hasImportDraft());
  const [weekStart, setWeekStart] = useState(() => startOfWeekMonday());

  const projects = useMemo(
    () => filterRegularProjects(projectList).map((project) => ({ id: project.id, title: project.title })),
    [projectList],
  );
  const tasks = useMemo(
    () => collectLinkableTasks({ stages, canvasTasks, projectActivity, projectId, projectTitle }),
    [stages, canvasTasks, projectActivity, projectId, projectTitle],
  );

  if (path.loading) {
    return (
      <section className="path-view">
        <p className="path-empty">Loading Path…</p>
      </section>
    );
  }

  return (
    <section className="path-view">
      <header className="path-view__header">
        <div>
          <h1 className="path-view__title">Path</h1>
          <p className="path-view__lede">
            {path.plan.title || '90-day goals → weekly plan → time blocks → execution → measurements.'}
            {path.plan.startDate && path.plan.endDate ? ` ${path.plan.startDate} – ${path.plan.endDate}` : ''}
          </p>
        </div>
      </header>

      <nav className="path-tabs" aria-label="Path">
        {PATH_TABS.map((item) => (
          <button
            key={item.id}
            type="button"
            aria-current={tab === item.id ? 'page' : undefined}
            onClick={() => {
              setTab(item.id);
              setImporting(false);
            }}
          >
            {item.label}
          </button>
        ))}
      </nav>

      {path.error ? <p className="path-error">{path.error}</p> : null}

      {tab === 'goals' && importing ? (
        <PathImportPlan
          path={path}
          projects={projects}
          onClose={() => setImporting(false)}
          onCreated={() => setImporting(false)}
        />
      ) : null}

      {tab === 'goals' && !importing ? (
        <PathGoals
          path={path}
          projects={projects}
          tasks={tasks}
          weekStart={weekStart}
          onImport={() => setImporting(true)}
        />
      ) : null}

      {tab === 'week' ? (
        <PathWeek
          path={path}
          tasks={tasks}
          weekStart={weekStart}
          onWeekStart={setWeekStart}
          onCompleteLinkedTask={onCompleteLinkedTask}
        />
      ) : null}

      {tab === 'metrics' ? <PathMetrics path={path} /> : null}

      {tab === 'review' ? (
        <div className="path-review">
          <CallsView />
        </div>
      ) : null}
    </section>
  );
}
