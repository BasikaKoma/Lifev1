import { useState, useRef, useEffect } from 'react';

function getInitials(name) {
  return (name || 'B')
    .split(' ')
    .map((w) => w[0])
    .join('')
    .slice(0, 2)
    .toUpperCase();
}

export function ProjectSwitcher({
  projectTitle,
  projectId,
  projectList,
  onSwitch,
  onCreate,
  onDelete,
}) {
  const [open, setOpen] = useState(false);
  const [newTitle, setNewTitle] = useState('');
  const [showCreate, setShowCreate] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    if (open && projectList.length === 0) {
      setShowCreate(true);
      setNewTitle((current) => current || 'New Business');
    }
  }, [open, projectList.length]);

  useEffect(() => {
    const handleClick = (e) => {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false);
    };
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

  const handleCreate = () => {
    const title = newTitle.trim();
    if (!title) return;
    onCreate(title);
    setNewTitle('');
    setShowCreate(false);
    setOpen(false);
  };

  const handleDelete = (id, title) => {
    if (projectList.length <= 1) {
      window.alert('You need at least one project.');
      return;
    }
    if (window.confirm(`Delete "${title}"? All data in this project will be lost.`)) {
      onDelete(id);
      setOpen(false);
    }
  };

  return (
    <div className="project-switcher" ref={ref}>
      <button
        type="button"
        className="project-switcher__trigger sidebar__profile"
        onClick={() => setOpen(!open)}
        aria-expanded={open}
      >
        <div className="sidebar__avatar">{getInitials(projectTitle)}</div>
        <div className="sidebar__profile-info">
          <span className="sidebar__profile-name">{projectTitle || 'My Business'}</span>
          <span className="sidebar__profile-role">{projectList.length} project(s)</span>
        </div>
        <svg
          className={`sidebar__profile-chevron ${open ? 'sidebar__profile-chevron--open' : ''}`}
          viewBox="0 0 16 16"
          fill="currentColor"
          width="14"
          height="14"
        >
          <path d="M4.427 6.427a.75.75 0 0 1 1.06 0L8 8.94l2.513-2.513a.75.75 0 1 1 1.06 1.06l-3.043 3.043a.75.75 0 0 1-1.06 0L4.427 7.487a.75.75 0 0 1 0-1.06z" />
        </svg>
      </button>

      {open && (
        <div className="project-switcher__menu">
          <span className="project-switcher__label">Projects</span>
          <ul className="project-switcher__list">
            {projectList.length === 0 ? (
              <li className="project-switcher__empty">Δεν έχεις projects ακόμα.</li>
            ) : (
              projectList.map((p) => (
              <li key={p.id}>
                <button
                  type="button"
                  className={`project-switcher__item ${p.id === projectId ? 'project-switcher__item--active' : ''}`}
                  onClick={() => {
                    if (p.id !== projectId) onSwitch(p.id);
                    setOpen(false);
                  }}
                >
                  <span className="project-switcher__item-title">{p.title}</span>
                  {p.isCollaborator && (
                    <span className="project-switcher__badge project-switcher__badge--shared">Shared</span>
                  )}
                  {p.hasCollaborators && (
                    <span className="project-switcher__badge project-switcher__badge--shared">Team</span>
                  )}
                  {p.id === projectId && <span className="project-switcher__badge">Active</span>}
                </button>
                {projectList.length > 1 && p.isOwner !== false && (
                  <button
                    type="button"
                    className="project-switcher__delete"
                    onClick={() => handleDelete(p.id, p.title)}
                    title="Delete project"
                  >
                    ×
                  </button>
                )}
              </li>
            ))
            )}
          </ul>

          {showCreate ? (
            <div className="project-switcher__create-form">
              <input
                type="text"
                className="input"
                value={newTitle}
                onChange={(e) => setNewTitle(e.target.value)}
                placeholder="Project name"
                autoFocus
                onKeyDown={(e) => {
                  if (e.key === 'Enter') handleCreate();
                  if (e.key === 'Escape') setShowCreate(false);
                }}
              />
              <div className="project-switcher__create-actions">
                <button type="button" className="btn btn--primary btn--sm" onClick={handleCreate}>
                  Create
                </button>
                <button type="button" className="btn btn--text btn--sm" onClick={() => setShowCreate(false)}>
                  Cancel
                </button>
              </div>
            </div>
          ) : (
            <button
              type="button"
              className="project-switcher__new btn btn--outline btn--sm"
              onClick={() => {
                setShowCreate(true);
                setNewTitle('New Business');
              }}
            >
              + New Project
            </button>
          )}
        </div>
      )}
    </div>
  );
}
