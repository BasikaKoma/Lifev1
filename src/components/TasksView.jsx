import { isCheckpointDone } from '../utils/logic';

export function TasksView({ stages, onSelectStage }) {
  const sorted = [...stages].sort((a, b) => a.order - b.order);
  const incomplete = sorted.reduce((acc, stage) => {
    const items = (stage.checkpoints || []).filter((cp) => !isCheckpointDone(cp));
    acc.push({ stage, items });
    return acc;
  }, []);

  const totalIncomplete = incomplete.reduce((n, g) => n + g.items.length, 0);

  return (
    <section className="section view-section">
      <h2 className="view-section__title">Tasks</h2>
      <p className="view-section__desc">
        Open checkpoints across your project milestones. {totalIncomplete} task(s) remaining.
      </p>

      {sorted.length === 0 ? (
        <div className="empty-state">Add milestones in Projects first — checkpoints live inside each phase.</div>
      ) : totalIncomplete === 0 ? (
        <div className="empty-state">All checkpoints complete!</div>
      ) : (
        incomplete.map(({ stage, items }) =>
          items.length === 0 ? null : (
            <div key={stage.id} className="tasks-group">
              <button type="button" className="tasks-group__header" onClick={() => onSelectStage(stage.id)}>
                <span>{stage.title}</span>
                <span className="tasks-group__count">{items.length}</span>
              </button>
              <ul className="tasks-group__list">
                {items.map((cp) => (
                  <li key={cp.id} className="tasks-group__item">
                    <span className="tasks-group__dot" />
                    <span>{cp.title}</span>
                    <span className={`badge badge--type badge--${cp.checkpointType.toLowerCase()}`}>
                      {cp.checkpointType}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          )
        )
      )}
    </section>
  );
}
