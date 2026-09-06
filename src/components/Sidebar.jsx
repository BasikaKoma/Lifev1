import { BrandMark } from './BrandMark';
import { APP_NAME, LOGO_SRC } from '../constants/branding';
import { ProjectSwitcher } from './ProjectSwitcher';
import { filterRegularProjects } from '../utils/lifeline';
import { SaveStatusIndicator } from './SaveStatusIndicator';

const LIFELINE_ITEM = {
  id: 'lifeline',
  label: 'Lifeline',
  icon: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <line x1="12" y1="2" x2="12" y2="22" />
      <line x1="8" y1="6" x2="16" y2="6" />
      <line x1="8" y1="10" x2="16" y2="10" />
      <line x1="8" y1="14" x2="16" y2="14" />
      <line x1="8" y1="18" x2="16" y2="18" />
      <circle cx="12" cy="22" r="2" fill="currentColor" stroke="none" />
    </svg>
  ),
};

const MENU_ITEMS = [
  {
    id: 'self',
    label: 'Self',
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="12" cy="7" r="3" />
        <path d="M6 21v-1a6 6 0 0 1 12 0v1" />
        <path d="M12 10v4" />
        <circle cx="12" cy="14" r="1.5" fill="currentColor" stroke="none" />
      </svg>
    ),
  },
  {
    id: 'path',
    label: 'Path',
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="6" cy="6" r="2.2" />
        <circle cx="18" cy="12" r="2.2" />
        <circle cx="8" cy="19" r="2.2" />
        <path d="M8 7.5c3 1 6 1.2 8 3.2" />
        <path d="M16.5 13.8c-2.2 1.4-5.2 3.2-7 4.4" />
      </svg>
    ),
  },
  {
    id: 'projects',
    label: 'Projects',
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <polygon points="1 6 1 22 8 18 16 22 23 18 23 2 16 6 8 2 1 6" />
        <line x1="8" y1="2" x2="8" y2="18" />
        <line x1="16" y1="6" x2="16" y2="22" />
      </svg>
    ),
  },
  {
    id: 'brand',
    label: 'Personal Brand',
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="12" cy="8" r="3" />
        <path d="M6 20v-1a6 6 0 0 1 12 0v1" />
        <path d="M19 4l1.5 1.5L19 7" />
        <path d="M19 4l-1.5 1.5" />
      </svg>
    ),
  },
  {
    id: 'nutrition',
    label: 'Nutrition',
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M12 3c2.5 4 6 6.2 6 10a6 6 0 0 1-12 0c0-3.8 3.5-6 6-10z" />
        <path d="M9.5 14.5c.5 1.5 1.5 2.5 2.5 3" />
      </svg>
    ),
  },
];

const DEVICES_ITEM = {
  id: 'devices',
  label: 'Devices',
  icon: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="4" y="4" width="16" height="16" rx="2" />
      <rect x="9" y="9" width="6" height="6" />
      <path d="M9 1v3M15 1v3M9 20v3M15 20v3M1 9h3M1 15h3M20 9h3M20 15h3" />
    </svg>
  ),
};

const SETTINGS_ITEM = {
  id: 'settings',
  label: 'Settings',
  icon: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="3" />
      <path d="M12 1v2M12 21v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M1 12h2M21 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42" />
    </svg>
  ),
};

export function Sidebar({
  activeView,
  onNavigate,
  projectTitle,
  projectId,
  projectList,
  onSwitchProject,
  onCreateProject,
  onDeleteProject,
  isLifeline = false,
  lifelineProjectId,
  lastRegularProjectId,
  onOpenLifeline,
  syncing = false,
  hasUnsavedChanges = false,
  onSave,
  syncError = null,
  syncConflict = false,
  onReloadCloud,
  collapsed = false,
  onToggleCollapse,
  children,
}) {
  const regularProjects = filterRegularProjects(projectList);
  const switcherProjectId = isLifeline ? lastRegularProjectId : projectId;
  const switcherProject = regularProjects.find((p) => p.id === switcherProjectId) || regularProjects[0];
  const switcherProjectTitle = switcherProject?.title || projectTitle;

  return (
    <aside className={`sidebar${collapsed ? ' sidebar--collapsed' : ''}`}>
      <div className="sidebar__brand">
        <div className="sidebar__brand-lockup">
          <BrandMark className="sidebar__logo" size={40} />
          {!collapsed && (
            <img src={LOGO_SRC} alt={APP_NAME} className="sidebar__logo-wordmark" draggable={false} />
          )}
        </div>
        <button
          type="button"
          className="sidebar__collapse-btn"
          onClick={onToggleCollapse}
          aria-label={collapsed ? 'Άνοιγμα μενού' : 'Κλείσιμο μενού'}
          title={collapsed ? 'Άνοιγμα μενού' : 'Κλείσιμο μενού'}
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
            {collapsed ? (
              <path d="M9 18l6-6-6-6" strokeLinecap="round" strokeLinejoin="round" />
            ) : (
              <path d="M15 18l-6-6 6-6" strokeLinecap="round" strokeLinejoin="round" />
            )}
          </svg>
        </button>
      </div>

      <nav className="sidebar__nav">
        <button
          type="button"
          className={`sidebar__link sidebar__link--lifeline ${isLifeline ? 'sidebar__link--active' : ''}`}
          onClick={() => onOpenLifeline?.()}
          disabled={!lifelineProjectId}
          title="Lifeline"
        >
          <span className="sidebar__link-icon">{LIFELINE_ITEM.icon}</span>
          {!collapsed && <span className="sidebar__link-label">{LIFELINE_ITEM.label}</span>}
        </button>

        {MENU_ITEMS.map((item) => (
          <button
            key={item.id}
            type="button"
            className={`sidebar__link ${activeView === item.id && !(isLifeline && item.id === 'projects') ? 'sidebar__link--active' : ''}`}
            onClick={() => onNavigate(item.id)}
            title={item.label}
          >
            <span className="sidebar__link-icon">{item.icon}</span>
            {!collapsed && <span className="sidebar__link-label">{item.label}</span>}
          </button>
        ))}
      </nav>

      <div className="sidebar__capture">
        {children}
      </div>

      <div className="sidebar__widgets">
        <SaveStatusIndicator
          syncing={syncing}
          hasUnsavedChanges={hasUnsavedChanges}
          onSave={onSave}
          syncError={syncError}
          syncConflict={syncConflict}
          onReloadCloud={onReloadCloud}
          className="sidebar__save-status"
          compact={collapsed}
        />
      </div>

      <div className="sidebar__footer">
        <button
          type="button"
          className={`sidebar__link ${activeView === DEVICES_ITEM.id ? 'sidebar__link--active' : ''}`}
          onClick={() => onNavigate(DEVICES_ITEM.id)}
          title={DEVICES_ITEM.label}
        >
          <span className="sidebar__link-icon">{DEVICES_ITEM.icon}</span>
          {!collapsed && <span className="sidebar__link-label">{DEVICES_ITEM.label}</span>}
        </button>

        <button
          type="button"
          className={`sidebar__link ${!isLifeline && activeView === SETTINGS_ITEM.id ? 'sidebar__link--active' : ''}`}
          onClick={() => onNavigate(SETTINGS_ITEM.id)}
          title={SETTINGS_ITEM.label}
        >
          <span className="sidebar__link-icon">{SETTINGS_ITEM.icon}</span>
          {!collapsed && <span className="sidebar__link-label">{SETTINGS_ITEM.label}</span>}
        </button>

        {!collapsed && (
          <ProjectSwitcher
            projectTitle={switcherProjectTitle}
            projectId={switcherProjectId}
            projectList={regularProjects}
            onSwitch={onSwitchProject}
            onCreate={onCreateProject}
            onDelete={onDeleteProject}
          />
        )}
      </div>
    </aside>
  );
}
