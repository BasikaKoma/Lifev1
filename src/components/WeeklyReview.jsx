import { getWeeklyReviewData } from '../utils/logic';

export function WeeklyReview({ stages }) {
  const data = getWeeklyReviewData(stages);

  return (
    <section className="section weekly-review">
      <h2 className="section__title">Weekly Review</h2>
      <div className="weekly-review__grid">
        <div className="review-card">
          <span className="review-card__label">Completed Checkpoints (7 days)</span>
          <span className="review-card__value">{data.completedCheckpoints.length}</span>
          {data.completedCheckpoints.length > 0 && (
            <ul className="review-card__list">
              {data.completedCheckpoints.map((cp) => (
                <li key={cp.id}>{cp.title} <span className="review-card__stage">({cp.stageTitle})</span></li>
              ))}
            </ul>
          )}
        </div>

        <div className="review-card">
          <span className="review-card__label">Newly Unlocked Ideas</span>
          <span className="review-card__value">{data.newlyUnlocked.length}</span>
          {data.newlyUnlocked.length > 0 && (
            <ul className="review-card__list">
              {data.newlyUnlocked.map((idea) => (
                <li key={idea.id}>{idea.title}</li>
              ))}
            </ul>
          )}
        </div>

        <div className="review-card">
          <span className="review-card__label">Active Blockers</span>
          <span className="review-card__value">{data.activeBlockers.length}</span>
          {data.activeBlockers.length > 0 && (
            <ul className="review-card__list">
              {data.activeBlockers.map((b) => (
                <li key={b.id}>{b.title} <span className="review-card__stage">({b.stageTitle})</span></li>
              ))}
            </ul>
          )}
        </div>

        <div className="review-card">
          <span className="review-card__label">Current Stage Progress</span>
          <span className="review-card__value">{data.progress}%</span>
          <span className="review-card__meta">{data.currentStage?.title}</span>
        </div>
      </div>

      <div className="panel panel--highlight weekly-review__focus">
        <span className="panel__label">Suggested Focus for Next Week</span>
        <p className="weekly-review__focus-text">{data.suggestedFocus}</p>
      </div>
    </section>
  );
}
