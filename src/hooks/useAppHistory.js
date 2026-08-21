import { useEffect, useRef, useCallback } from 'react';
import {
  navigationFromPath,
  pathFromNavigation,
  isRootPath,
} from '../utils/appNavigation';

export function useAppHistory(state, setState, loading) {
  const historyReady = useRef(false);
  const skipHistoryPush = useRef(false);

  useEffect(() => {
    const onPopState = () => {
      const nav = navigationFromPath(window.location.pathname);
      skipHistoryPush.current = true;
      setState((prev) =>
        prev
          ? {
              ...prev,
              activeView: nav.activeView,
              selectedStageId: nav.selectedStageId,
              focusMode: false,
            }
          : prev
      );
    };

    window.addEventListener('popstate', onPopState);
    return () => window.removeEventListener('popstate', onPopState);
  }, [setState]);

  useEffect(() => {
    if (!state || loading) return;

    if (!historyReady.current) {
      historyReady.current = true;
      const fromUrl = navigationFromPath(window.location.pathname);
      const view =
        isRootPath(window.location.pathname)
          ? state.activeView || 'self'
          : fromUrl.activeView || 'self';
      const nav = {
        activeView: view === 'overview' ? 'roadmap' : view,
        selectedStageId: null,
      };

      skipHistoryPush.current = true;
      setState((prev) =>
        prev
          ? {
              ...prev,
              activeView: nav.activeView,
              selectedStageId: null,
              focusMode: false,
            }
          : prev
      );

      window.history.replaceState(nav, '', pathFromNavigation(nav));
      return;
    }

    if (skipHistoryPush.current) {
      skipHistoryPush.current = false;
      return;
    }

    const nav = {
      activeView: state.activeView,
      selectedStageId: state.selectedStageId,
    };
    const path = pathFromNavigation(nav);

    if (path !== window.location.pathname) {
      window.history.pushState(nav, '', path);
    }
  }, [state?.activeView, state?.selectedStageId, loading, setState]);

  const closeStage = useCallback(() => {
    skipHistoryPush.current = true;
    const nav = { activeView: 'roadmap', selectedStageId: null };
    setState((prev) => (prev ? { ...prev, ...nav, focusMode: false } : prev));
    window.history.replaceState(nav, '', pathFromNavigation(nav));
  }, [setState]);

  return { closeStage };
}
