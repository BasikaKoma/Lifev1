import { useRef, useState } from 'react';
import { useZoomTransform } from '../components/ZoomCanvas';

export function useCanvasNodeCard({
  readOnly,
  onMove,
  onMoveEnd,
  getPosition,
  onConnectClick,
  onNodeSelect,
  nodeRef,
  connectModeActive = false,
}) {
  const { scale } = useZoomTransform();
  const [dragging, setDragging] = useState(false);
  const dragOrigin = useRef(null);
  const moved = useRef(false);
  const pendingDrag = useRef(false);
  const pointerIdRef = useRef(null);
  const DRAG_THRESHOLD_PX = 5;

  const handlePointerDown = (e) => {
    if (readOnly) return;
    if (e.button !== 0) return;
    if (e.target.closest('button, a, input, textarea, select')) return;

    if (e.altKey && onConnectClick) {
      e.preventDefault();
      e.stopPropagation();
      onConnectClick(nodeRef);
      return;
    }

    if (connectModeActive && onConnectClick) {
      e.preventDefault();
      e.stopPropagation();
      onConnectClick(nodeRef);
      return;
    }

    if (!onMove) {
      if (onNodeSelect) {
        e.preventDefault();
        e.stopPropagation();
        onNodeSelect(nodeRef);
      }
      return;
    }

    e.stopPropagation();
    moved.current = false;
    pendingDrag.current = true;
    pointerIdRef.current = e.pointerId;
    const pos = getPosition();
    dragOrigin.current = { x: e.clientX, y: e.clientY, posX: pos.x, posY: pos.y };
  };

  const handlePointerMove = (e) => {
    if (readOnly || !onMove || !dragOrigin.current) return;

    if (pendingDrag.current && !dragging) {
      const dxPx = e.clientX - dragOrigin.current.x;
      const dyPx = e.clientY - dragOrigin.current.y;
      if (Math.abs(dxPx) <= DRAG_THRESHOLD_PX && Math.abs(dyPx) <= DRAG_THRESHOLD_PX) return;

      pendingDrag.current = false;
      setDragging(true);
      moved.current = true;
      if (pointerIdRef.current != null) {
        e.currentTarget.setPointerCapture(pointerIdRef.current);
      }
    }

    if (!dragging) return;

    const dx = (e.clientX - dragOrigin.current.x) / scale;
    const dy = (e.clientY - dragOrigin.current.y) / scale;
    if (Math.abs(dx) > 2 || Math.abs(dy) > 2) moved.current = true;
    onMove(dragOrigin.current.posX + dx, dragOrigin.current.posY + dy);
  };

  const handlePointerUp = (e) => {
    if (pendingDrag.current && !dragging) {
      pendingDrag.current = false;
      if (!e.altKey) {
        if (connectModeActive && onConnectClick) {
          onConnectClick(nodeRef);
        } else if (onNodeSelect) {
          onNodeSelect(nodeRef);
        }
      }
    } else if (dragging && moved.current && onMoveEnd && dragOrigin.current) {
      const dx = (e.clientX - dragOrigin.current.x) / scale;
      const dy = (e.clientY - dragOrigin.current.y) / scale;
      onMoveEnd(dragOrigin.current.posX + dx, dragOrigin.current.posY + dy);
    } else if (dragging && !moved.current && !e.altKey) {
      if (connectModeActive && onConnectClick) {
        onConnectClick(nodeRef);
      } else if (onNodeSelect) {
        onNodeSelect(nodeRef);
      }
    }

    pendingDrag.current = false;
    setDragging(false);
    dragOrigin.current = null;
    pointerIdRef.current = null;
  };

  return {
    dragging,
    handlePointerDown,
    handlePointerMove,
    handlePointerUp,
  };
}
