export const APP_VIEWS = ['overview', 'roadmap', 'workspace', 'self', 'settings'];

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

  if (APP_VIEWS.includes(view)) {
    return { activeView: view, selectedStageId: null };
  }

  return { activeView: 'roadmap', selectedStageId: null };
}

export function pathFromNavigation({ activeView, selectedStageId }) {
  if (activeView === 'roadmap' && selectedStageId) {
    return `/roadmap/${encodeURIComponent(selectedStageId)}`;
  }
  if (activeView === 'roadmap') return '/roadmap';
  return `/${activeView}`;
}

export function isRootPath(pathname) {
  const path = (pathname || '/').replace(/\/+$/, '') || '/';
  return path === '/' || path === '/app';
}
