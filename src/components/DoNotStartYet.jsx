import {
  getTooEarlyIdeas,
  getIdeaUnlockCondition,
  getMissingCheckpointsForIdea,
} from '../utils/logic';

export function DoNotStartYet({ stages }) {
  const ideas = getTooEarlyIdeas(stages);

  return (
    <section className="section do-not-start">
      <div className="section__header">
        <h2 className="section__title">Do Not Start Yet</h2>
        <p className="section__desc">Ideas that are too early — park them until the business is ready.</p>
      </div>
      {ideas.length === 0 ? (
        <div className="empty-state">No parked ideas. Good focus!</div>
      ) : (
        <div className="do-not-start__list">
          {ideas.map((idea) => {
            const unlockCondition = getIdeaUnlockCondition(idea, stages);
            const missing = getMissingCheckpointsForIdea(idea, stages);
            return (
              <div key={idea.id} className="card card--parked">
                <div className="card__icon">🔒</div>
                <div className="card__body">
                  <h4 className="card__title">{idea.title}</h4>
                  <p className="card__text">{idea.reasonToWait}</p>
                  <div className="card__meta">
                    <span className="meta-tag">Unlock: {unlockCondition}</span>
                    {missing.length > 0 && (
                      <span className="meta-tag meta-tag--warn">
                        Missing: {missing.map((c) => c.title).join(', ')}
                      </span>
                    )}
                    {idea.reviewDate && (
                      <span className="meta-tag">Review: {idea.reviewDate}</span>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}
