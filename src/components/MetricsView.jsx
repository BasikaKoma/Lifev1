import {
  getStageProgress,
  getCompletedCheckpointCount,
  getOverallProgress,
  getWeeklyReviewData,
} from '../utils/logic';

export function MetricsView({ stages }) {
  const overall = getOverallProgress(stages);
  const weekly = getWeeklyReviewData(stages);
  const sorted = [...stages].sort((a, b) => a.order - b.order);

  return (
    <section className="section view-section">
      <h2 className="view-section__title">Metrics</h2>
      <p className="view-section__desc">Progress and health across your business evolution path.</p>

      <div className="metrics-grid">
        <div className="metric-card metric-card--hero">
          <span className="metric-card__label">Overall Progress</span>
          <span className="metric-card__value">{overall}%</span>
        </div>
        <div className="metric-card">
          <span className="metric-card__label">Current Stage</span>
          <span className="metric-card__value metric-card__value--sm">{weekly.currentStage?.title || '—'}</span>
          <span className="metric-card__meta">{weekly.progress}% complete</span>
        </div>
        <div className="metric-card">
          <span className="metric-card__label">Completed (7 days)</span>
          <span className="metric-card__value">{weekly.completedCheckpoints.length}</span>
        </div>
        <div className="metric-card">
          <span className="metric-card__label">Active Blockers</span>
          <span className="metric-card__value">{weekly.activeBlockers.length}</span>
        </div>
        <div className="metric-card">
          <span className="metric-card__label">Ready Ideas</span>
          <span className="metric-card__value">{weekly.newlyUnlocked.length}</span>
        </div>
      </div>

      <h3 className="view-section__subtitle">Progress by Phase</h3>
      <div className="metrics-phases">
        {sorted.map((stage) => {
          const progress = getStageProgress(stage);
          const completed = getCompletedCheckpointCount(stage);
          const total = (stage.checkpoints || []).length;
          return (
            <div key={stage.id} className="metrics-phase">
              <div className="metrics-phase__header">
                <span className="metrics-phase__title">{stage.title}</span>
                <span className="metrics-phase__percent">{progress}%</span>
              </div>
              <div className="progress-bar progress-bar--lg">
                <div className="progress-bar__fill" style={{ width: `${progress}%` }} />
              </div>
              <span className="metrics-phase__meta">{completed}/{total} checkpoints · {stage.status}</span>
            </div>
          );
        })}
      </div>
    </section>
  );
}
