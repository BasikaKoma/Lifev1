import {
  getCurrentStage,
  getNextBestMove,
  getTopBlocker,
  getNextIncompleteCheckpoint,
  getReadyIdeas,
  getStageProgress,
} from '../utils/logic';

export function NextBestMove({ stages }) {
  const move = getNextBestMove(stages);

  return (
    <div className="panel panel--highlight next-best-move">
      <div className="panel__label">Next Best Move</div>
      <h3 className="next-best-move__action">{move.action}</h3>
      <p className="next-best-move__reason">{move.reason}</p>
    </div>
  );
}

export function CurrentFocusPanel({ stages }) {
  const currentStage = getCurrentStage(stages);
  const topBlocker = getTopBlocker(stages);
  const nextCheckpoint = currentStage ? getNextIncompleteCheckpoint(currentStage) : null;
  const readyIdeas = getReadyIdeas(stages);
  const progress = currentStage ? getStageProgress(currentStage) : 0;

  return (
    <section className="section current-focus">
      <h2 className="section__title">Current Focus</h2>
      <div className="current-focus__grid">
        <div className="focus-item">
          <span className="focus-item__label">Current Stage</span>
          <span className="focus-item__value">{currentStage?.title || '—'}</span>
          <span className="focus-item__meta">{progress}% complete</span>
        </div>
        <div className="focus-item">
          <span className="focus-item__label">Top Blocker</span>
          <span className="focus-item__value">{topBlocker?.title || 'None'}</span>
          {topBlocker && (
            <span className={`badge badge--severity badge--${topBlocker.severity.toLowerCase()}`}>
              {topBlocker.severity}
            </span>
          )}
        </div>
        <div className="focus-item">
          <span className="focus-item__label">Next Checkpoint</span>
          <span className="focus-item__value">{nextCheckpoint?.title || 'All complete'}</span>
        </div>
        <div className="focus-item">
          <span className="focus-item__label">Ready Ideas</span>
          <span className="focus-item__value">{readyIdeas.length}</span>
          {readyIdeas.length > 0 && (
            <ul className="focus-item__list">
              {readyIdeas.slice(0, 3).map((idea) => (
                <li key={idea.id}>{idea.title}</li>
              ))}
            </ul>
          )}
        </div>
      </div>
      <NextBestMove stages={stages} />
    </section>
  );
}
