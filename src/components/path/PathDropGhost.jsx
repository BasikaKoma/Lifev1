import { formatBlockWindow, minutesToClock } from '../../lib/path/logic';

// The browser drags a picture of the card. That picture carries the old time and
// covers the drop preview, so a blank one is dragged and the preview shows the block.
const blankDragImage = typeof Image === 'undefined' ? null : new Image();
if (blankDragImage) {
  blankDragImage.src = 'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7';
}

export function hideDragImage(event) {
  if (blankDragImage) event.dataTransfer?.setDragImage?.(blankDragImage, 0, 0);
}

/**
 * Keeps the grab point inside the preview. A card opened by hover is taller than
 * its slot, and grabbing it low would leave the preview far above the pointer.
 */
export function grabOffsetWithin(offsetY, height) {
  return Math.max(0, Math.min(offsetY, height - 6));
}

/** Where the dragged block lands on the hour grid, with the time it gets there. */
export function PathDropGhost({ top, height, start, span, title }) {
  return (
    <div className="path-cal__ghost" style={{ top, height }}>
      <span className="path-cal__ghost-time">{formatBlockWindow(minutesToClock(start), span)}</span>
      {title ? <span className="path-cal__ghost-title">{title}</span> : null}
    </div>
  );
}
