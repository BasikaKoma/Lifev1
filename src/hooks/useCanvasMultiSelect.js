import { createContext, useContext } from 'react';
import { nodeRefKey } from '../utils/canvasNodes';

export const CanvasMultiSelectContext = createContext(null);
export const CanvasGroupDragContext = createContext(null);

export function useIsNodeSelected(nodeRef) {
  const keys = useContext(CanvasMultiSelectContext);
  if (!keys || !nodeRef) return false;
  return keys.has(nodeRefKey(nodeRef));
}

export function useCanvasGroupDrag() {
  return useContext(CanvasGroupDragContext);
}
