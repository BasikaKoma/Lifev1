import { useState } from 'react';
import { AddMilestoneForm } from './AddMilestoneForm';
import { CustomizeThemePanel } from './CustomizeThemePanel';

function SidePanelItem({ item, onDragStart }) {
  const isMilestone = item.type === 'milestone';
  const isSticky = item.type === 'sticky';
  const icon = isMilestone ? '◆' : isSticky ? '📝' : '💡';

  return (
    <div
      className={`projects-side-item projects-side-item--${item.type}${isMilestone ? ' projects-side-item--major' : ''}`}
      onPointerDown={(e) => onDragStart?.(e, item)}
    >
      <span className="projects-side-item__icon">{icon}</span>
      <div className="projects-side-item__body">
        <span className="projects-side-item__title">{item.title}</span>
        {item.subtitle && (
          <span className="projects-side-item__subtitle">{item.subtitle}</span>
        )}
      </div>
      <span className="projects-side-item__handle" aria-hidden="true">⠿</span>
    </div>
  );
}

export function ProjectsSidePanel({
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
      <aside className="projects-side-panel projects-side-panel--collapsed">
        <button type="button" className="projects-side-panel__toggle" onClick={onToggleCollapse} title="Show panel">
          📋 {totalCount}
        </button>
      </aside>
    );
  }

  return (
    <aside className="projects-side-panel projects-side-panel--wide">
      <div className="projects-side-panel__header">
        <div className="projects-side-panel__main-tabs">
          <button
            type="button"
            className={`projects-side-panel__main-tab${sideTab === 'palette' ? ' projects-side-panel__main-tab--active' : ''}`}
            onClick={() => setSideTab('palette')}
          >
            Palette
          </button>
          <button
            type="button"
            className={`projects-side-panel__main-tab${sideTab === 'theme' ? ' projects-side-panel__main-tab--active' : ''}`}
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
          <p className="projects-side-panel__subtitle">Drag onto the board</p>

          <section className="projects-side-panel__section">
            <div className="projects-side-panel__section-head">
              <h4>Milestones</h4>
              {!addingMilestone && (
                <div className="projects-side-panel__section-actions">
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

            <ul className="projects-side-panel__list">
              {milestoneItems.length === 0 && !addingMilestone && (
                <li className="projects-side-panel__empty">Add a milestone, then drag it to the board</li>
              )}
              {milestoneItems.map((item) => (
                <li key={item.id}>
                  <SidePanelItem item={item} onDragStart={onDragStart} />
                </li>
              ))}
            </ul>
          </section>

          <section className="projects-side-panel__section">
            <div className="projects-side-panel__section-head">
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

            <ul className="projects-side-panel__list">
              {ideaItems.length === 0 && !addingIdea && (
                <li className="projects-side-panel__empty">No ideas yet</li>
              )}
              {ideaItems.map((item) => (
                <li key={item.id}>
                  <SidePanelItem item={item} onDragStart={onDragStart} />
                </li>
              ))}
            </ul>
          </section>

          <section className="projects-side-panel__section">
            <div className="projects-side-panel__section-head">
              <h4>Notes</h4>
              <button type="button" className="btn btn--text btn--sm" onClick={onAddSticky}>
                + Note
              </button>
            </div>
            <ul className="projects-side-panel__list">
              {stickyItems.length === 0 && (
                <li className="projects-side-panel__empty">No notes on palette</li>
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
