export const APP_VIEWS = ['projects', 'workspace', 'self', 'path', 'brand', 'nutrition', 'settings', 'devices'];

const VIEW_ALIASES = {
  overview: 'projects',
  calls: 'path',
  review: 'path',
  cameras: 'devices',
  whiteboard: 'projects',
  goals: 'workspace',
  tasks: 'workspace',
  notes: 'workspace',
  metrics: 'projects',
  feedback: 'projects',
  roadmap: 'projects',
};

const PATH_TABS = ['goals', 'week', 'metrics', 'review'];

export function pathTabFromPathname(pathname) {
  const path = (pathname || '/').replace(/\/+$/, '') || '/';
  const parts = path.split('/').filter(Boolean);
  const [view, tab] = parts;
  if (view === 'review' || view === 'calls' || (view === 'path' && tab === 'review')) {
    return 'review';
  }
  if (view === 'path' && PATH_TABS.includes(tab)) return tab;
  return null;
}

export function normalizeActiveView(view) {
  if (!view) return 'projects';
  const mapped = VIEW_ALIASES[view] || view;
  return APP_VIEWS.includes(mapped) ? mapped : 'projects';
}

export function navigationFromPath(pathname) {
  const path = (pathname || '/').replace(/\/+$/, '') || '/';
  const parts = path.split('/').filter(Boolean);

  if (parts.length === 0 || parts[0] === 'app') {
    return { activeView: 'self', selectedStageId: null };
  }

  const [view, stageId] = parts;

  if (view === 'projects' || view === 'roadmap') {
    return {
      activeView: 'projects',
      selectedStageId: stageId || null,
    };
  }

  if (view === 'whiteboard') {
    return { activeView: 'projects', selectedStageId: null };
  }

  const activeView = normalizeActiveView(view);
  if (APP_VIEWS.includes(VIEW_ALIASES[view] || view)) {
    return { activeView, selectedStageId: null };
  }

  return { activeView: 'projects', selectedStageId: null };
}

export function pathFromNavigation({ activeView, selectedStageId }) {
  const view = normalizeActiveView(activeView);
  if (view === 'projects' && selectedStageId) {
    return `/projects/${encodeURIComponent(selectedStageId)}`;
  }
  if (view === 'projects') return '/projects';
  return `/${view}`;
}

export function isRootPath(pathname) {
  const path = (pathname || '/').replace(/\/+$/, '') || '/';
  return path === '/' || path === '/app';
}
