import { useEffect, useState } from 'react';
import { loadAllProjectsOverview } from '../utils/supabaseDb';
import { BusinessPath } from './BusinessPath';
import { ZoomCanvas } from './ZoomCanvas';

export function GlobalRoadmapView({ currentProjectId, projectList, onSelectStage, onOpenProject }) {
  const [projects, setProjects] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    let cancelled = false;

    loadAllProjectsOverview()
      .then((data) => {
        if (!cancelled) setProjects(data);
      })
      .catch((err) => {
        if (!cancelled) setError(err.message || 'Failed to load projects');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [projectList]);

  if (loading) {
    return (
      <section className="global-roadmap">
        <div className="global-roadmap__loading">Loading all roadmaps…</div>
      </section>
    );
  }

  if (error) {
    return (
      <section className="global-roadmap">
        <div className="global-roadmap__error">{error}</div>
      </section>
    );
  }

  if (projects.length === 0) {
    return (
      <section className="global-roadmap">
        <div className="empty-state">No projects yet. Create one from the sidebar.</div>
      </section>
    );
  }

  return (
    <section className="global-roadmap">
      <div className="global-roadmap__header">
        <div>
          <h2 className="view-section__title">Overview</h2>
          <p className="view-section__desc">
            All roadmaps together — zoom in for detail, zoom out for the big picture.
          </p>
        </div>
        <span className="global-roadmap__count">{projects.length} project(s)</span>
      </div>

      <ZoomCanvas className="global-roadmap__canvas">
        <div className="global-roadmap__board">
          {projects.map((project) => (
            <div
              key={project.id}
              className={`global-roadmap__item ${project.id === currentProjectId ? 'global-roadmap__item--active' : ''}`}
            >
              <button
                type="button"
                className="global-roadmap__open-btn btn btn--outline btn--sm"
                onClick={() => onOpenProject?.(project.id)}
              >
                Open project
              </button>
              <BusinessPath
                embedded
                projectTitle={project.title}
                stages={project.stages}
                isActive={project.id === currentProjectId}
                disableAutoScroll
                onSelectStage={(stageId) => onSelectStage(project.id, stageId)}
              />
            </div>
          ))}
        </div>
      </ZoomCanvas>
    </section>
  );
}
