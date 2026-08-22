export const APP_VIEWS = ['review', 'roadmap', 'workspace', 'self', 'brand', 'settings', 'devices'];

const VIEW_ALIASES = {
  overview: 'roadmap',
  calls: 'review',
  cameras: 'devices',
  whiteboard: 'roadmap',
  goals: 'workspace',
  tasks: 'workspace',
  notes: 'workspace',
  metrics: 'roadmap',
  feedback: 'roadmap',
};

export function normalizeActiveView(view) {
  if (!view) return 'roadmap';
  const mapped = VIEW_ALIASES[view] || view;
  return APP_VIEWS.includes(mapped) ? mapped : 'roadmap';
}

export function navigationFromPath(pathname) {
  const path = (pathname || '/').replace(/\/+$/, '') || '/';
  const parts = path.split('/').filter(Boolean);

  if (parts.length === 0 || parts[0] === 'app') {
    return { activeView: 'self', selectedStageId: null };
  }

  const [view, stageId] = parts;

  if (view === 'roadmap') {
    return {
      activeView: 'roadmap',
      selectedStageId: stageId || null,
    };
  }

  if (view === 'whiteboard') {
    return { activeView: 'roadmap', selectedStageId: null };
  }

  const activeView = normalizeActiveView(view);
  if (APP_VIEWS.includes(VIEW_ALIASES[view] || view)) {
    return { activeView, selectedStageId: null };
  }

  return { activeView: 'roadmap', selectedStageId: null };
}

export function pathFromNavigation({ activeView, selectedStageId }) {
  const view = normalizeActiveView(activeView);
  if (view === 'roadmap' && selectedStageId) {
    return `/roadmap/${encodeURIComponent(selectedStageId)}`;
  }
  if (view === 'roadmap') return '/roadmap';
  return `/${view}`;
}

export function isRootPath(pathname) {
  const path = (pathname || '/').replace(/\/+$/, '') || '/';
  return path === '/' || path === '/app';
}
