import { useState } from 'react';
import { AddMilestoneForm } from './AddMilestoneForm';
import { CustomizeThemePanel } from './CustomizeThemePanel';

function SidePanelItem({ item, onDragStart }) {
  const isMilestone = item.type === 'milestone';
  const isSticky = item.type === 'sticky';
  const icon = isMilestone ? '◆' : isSticky ? '📝' : '💡';

  return (
    <div
      className={`roadmap-side-item roadmap-side-item--${item.type}${isMilestone ? ' roadmap-side-item--major' : ''}`}
      onPointerDown={(e) => onDragStart?.(e, item)}
    >
      <span className="roadmap-side-item__icon">{icon}</span>
      <div className="roadmap-side-item__body">
        <span className="roadmap-side-item__title">{item.title}</span>
        {item.subtitle && (
          <span className="roadmap-side-item__subtitle">{item.subtitle}</span>
        )}
      </div>
      <span className="roadmap-side-item__handle" aria-hidden="true">⠿</span>
    </div>
  );
}

export function RoadmapSidePanel({
  milestoneItems,
  ideaItems,
  stickyItems = [],
  onAddMilestone,
  onAddIdea,
  onAddSticky,
  onDragStart,
  collapsed,
  onToggleCollapse,
  mapTheme,
  onMapThemeChange,
  onAutoLayout,
  onApplyThemeToSelected,
  hasSelection,
}) {
  const [sideTab, setSideTab] = useState('palette');
  const [addingIdea, setAddingIdea] = useState(false);
  const [ideaTitle, setIdeaTitle] = useState('');
  const [addingMilestone, setAddingMilestone] = useState(false);

  const totalCount = milestoneItems.length + ideaItems.length + stickyItems.length;

  const handleIdeaSubmit = (e) => {
    e.preventDefault();
    if (!ideaTitle.trim()) return;
    onAddIdea({ title: ideaTitle.trim() });
    setIdeaTitle('');
    setAddingIdea(false);
  };

  const handleMilestoneAdd = (options) => {
    onAddMilestone?.(options);
    setAddingMilestone(false);
  };

  if (collapsed) {
    return (
      <aside className="roadmap-side-panel roadmap-side-panel--collapsed">
        <button type="button" className="roadmap-side-panel__toggle" onClick={onToggleCollapse} title="Show panel">
          📋 {totalCount}
        </button>
      </aside>
    );
  }

  return (
    <aside className="roadmap-side-panel roadmap-side-panel--wide">
      <div className="roadmap-side-panel__header">
        <div className="roadmap-side-panel__main-tabs">
          <button
            type="button"
            className={`roadmap-side-panel__main-tab${sideTab === 'palette' ? ' roadmap-side-panel__main-tab--active' : ''}`}
            onClick={() => setSideTab('palette')}
          >
            Palette
          </button>
          <button
            type="button"
            className={`roadmap-side-panel__main-tab${sideTab === 'theme' ? ' roadmap-side-panel__main-tab--active' : ''}`}
            onClick={() => setSideTab('theme')}
          >
            Customize theme
          </button>
        </div>
        <button type="button" className="btn btn--text btn--sm" onClick={onToggleCollapse} aria-label="Collapse">
          ‹
        </button>
      </div>

      {sideTab === 'theme' ? (
        <CustomizeThemePanel
          mapTheme={mapTheme}
          onMapThemeChange={onMapThemeChange}
          onAutoLayout={onAutoLayout}
          onApplyToSelected={onApplyThemeToSelected}
          hasSelection={hasSelection}
        />
      ) : (
        <>
          <p className="roadmap-side-panel__subtitle">Drag onto the board</p>

          <section className="roadmap-side-panel__section">
            <div className="roadmap-side-panel__section-head">
              <h4>Milestones</h4>
              {!addingMilestone && (
                <div className="roadmap-side-panel__section-actions">
                  <button type="button" className="btn btn--text btn--sm" onClick={() => setAddingMilestone(true)}>
                    + Milestone
                  </button>
                </div>
              )}
            </div>

            {addingMilestone && (
              <AddMilestoneForm
                onAdd={handleMilestoneAdd}
                onCancel={() => setAddingMilestone(false)}
              />
            )}

            <ul className="roadmap-side-panel__list">
              {milestoneItems.length === 0 && !addingMilestone && (
                <li className="roadmap-side-panel__empty">Add a milestone, then drag it to the board</li>
              )}
              {milestoneItems.map((item) => (
                <li key={item.id}>
                  <SidePanelItem item={item} onDragStart={onDragStart} />
                </li>
              ))}
            </ul>
          </section>

          <section className="roadmap-side-panel__section">
            <div className="roadmap-side-panel__section-head">
              <h4>Ideas & nodes</h4>
              {!addingIdea && (
                <button type="button" className="btn btn--text btn--sm" onClick={() => setAddingIdea(true)}>
                  + Idea
                </button>
              )}
            </div>

            {addingIdea && (
              <form className="add-form" onSubmit={handleIdeaSubmit}>
                <input
                  className="input"
                  placeholder="Idea title"
                  value={ideaTitle}
                  onChange={(e) => setIdeaTitle(e.target.value)}
                  autoFocus
                />
                <div className="add-form__actions">
                  <button type="submit" className="btn btn--primary btn--sm">Add</button>
                  <button type="button" className="btn btn--text btn--sm" onClick={() => setAddingIdea(false)}>
                    Cancel
                  </button>
                </div>
              </form>
            )}

            <ul className="roadmap-side-panel__list">
              {ideaItems.length === 0 && !addingIdea && (
                <li className="roadmap-side-panel__empty">No ideas yet</li>
              )}
              {ideaItems.map((item) => (
                <li key={item.id}>
                  <SidePanelItem item={item} onDragStart={onDragStart} />
                </li>
              ))}
            </ul>
          </section>

          <section className="roadmap-side-panel__section">
            <div className="roadmap-side-panel__section-head">
              <h4>Notes</h4>
              <button type="button" className="btn btn--text btn--sm" onClick={onAddSticky}>
                + Note
              </button>
            </div>
            <ul className="roadmap-side-panel__list">
              {stickyItems.length === 0 && (
                <li className="roadmap-side-panel__empty">No notes on palette</li>
              )}
              {stickyItems.map((item) => (
                <li key={item.id}>
                  <SidePanelItem item={item} onDragStart={onDragStart} />
                </li>
              ))}
            </ul>
          </section>
        </>
      )}
    </aside>
  );
}
