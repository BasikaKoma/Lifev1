import { useCallback, useRef, useState } from 'react';
import { useZoomTransform } from '../components/ZoomCanvas';

const MIN_WIDTH = 120;
const MIN_HEIGHT = 80;

export function useCanvasNodeResize({ readOnly, onResize, getSize, getPosition }) {
  const { scale } = useZoomTransform();
  const [resizing, setResizing] = useState(false);
  const sessionRef = useRef(null);

  const handleResizePointerDown = useCallback(
    (handle, e) => {
      if (readOnly || !onResize) return;
      e.preventDefault();
      e.stopPropagation();

      const startX = e.clientX;
      const startY = e.clientY;
      const { width, height } = getSize();
      const { x, y } = getPosition();

      setResizing(true);
      sessionRef.current = { handle, startX, startY, width, height, x, y };

      const onMove = (ev) => {
        const session = sessionRef.current;
        if (!session) return;

        const dx = (ev.clientX - session.startX) / scale;
        const dy = (ev.clientY - session.startY) / scale;

        let widthNext = session.width;
        let heightNext = session.height;
        let xNext = session.x;
        let yNext = session.y;

        if (session.handle.includes('e')) widthNext = session.width + dx;
        if (session.handle.includes('w')) {
          widthNext = session.width - dx;
          xNext = session.x + dx;
        }
        if (session.handle.includes('s')) heightNext = session.height + dy;
        if (session.handle.includes('n')) {
          heightNext = session.height - dy;
          yNext = session.y + dy;
        }

        if (widthNext < MIN_WIDTH) {
          if (session.handle.includes('w')) {
            xNext = session.x + session.width - MIN_WIDTH;
          }
          widthNext = MIN_WIDTH;
        }

        if (heightNext < MIN_HEIGHT) {
          if (session.handle.includes('n')) {
            yNext = session.y + session.height - MIN_HEIGHT;
          }
          heightNext = MIN_HEIGHT;
        }

        onResize({
          width: Math.round(widthNext),
          height: Math.round(heightNext),
          canvasX: Math.round(xNext),
          canvasY: Math.round(yNext),
        });
      };

      const onUp = () => {
        sessionRef.current = null;
        setResizing(false);
        window.removeEventListener('pointermove', onMove);
        window.removeEventListener('pointerup', onUp);
        window.removeEventListener('pointercancel', onUp);
      };

      window.addEventListener('pointermove', onMove);
      window.addEventListener('pointerup', onUp);
      window.addEventListener('pointercancel', onUp);
    },
    [readOnly, onResize, getSize, getPosition, scale]
  );

  return { resizing, handleResizePointerDown };
}

export const STICKY_RESIZE_HANDLES = ['n', 's', 'e', 'w', 'ne', 'nw', 'se', 'sw'];
