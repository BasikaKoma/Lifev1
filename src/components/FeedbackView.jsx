import { getAllIdeas, getIdeaRecommendation } from '../utils/logic';
import { IdeaCard } from './IdeaCard';

export function FeedbackView({ stages, onUpdateIdea, onSelectStage }) {
  const ideas = getAllIdeas(stages);
  const decisions = stages.flatMap((s) =>
    (s.decisions || []).map((d) => ({ ...d, stageId: s.id, stageTitle: s.title }))
  );

  return (
    <section className="section view-section">
      <h2 className="view-section__title">Feedback</h2>
      <p className="view-section__desc">Ideas, decisions, and strategic notes across all phases.</p>

      <div className="feedback-sections">
        <div className="feedback-block">
          <h3 className="view-section__subtitle">Ideas ({ideas.length})</h3>
          {ideas.length === 0 ? (
            <div className="empty-state empty-state--sm">No ideas yet</div>
          ) : (
            <div className="detail-section__list">
              {ideas.map((idea) => (
                <div key={idea.id}>
                  <p className="feedback-stage-label">{idea.stageTitle}</p>
                  <IdeaCard
                    idea={idea}
                    stageId={idea.stageId}
                    onUpdate={onUpdateIdea}
                  />
                  {getIdeaRecommendation(idea) === 'Park' && (
                    <span className="feedback-tag">Parked — too early</span>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="feedback-block">
          <h3 className="view-section__subtitle">Decisions ({decisions.length})</h3>
          {decisions.length === 0 ? (
            <div className="empty-state empty-state--sm">No decisions logged</div>
          ) : (
            <div className="decisions-list">
              {decisions.map((d) => (
                <button
                  key={d.id}
                  type="button"
                  className="decision-row"
                  onClick={() => onSelectStage(d.stageId)}
                >
                  <div className="decision-row__main">
                    <span className="decision-row__title">{d.title}</span>
                    <span className="decision-row__stage">{d.stageTitle}</span>
                  </div>
                  <span className={`badge badge--status-sm badge--${d.status.toLowerCase()}`}>{d.status}</span>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
