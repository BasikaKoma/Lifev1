import { useState } from 'react';
import { resolveOriginThemeStyle } from '../utils/mapTheme';
import { sameNodeRef } from '../utils/canvasNodes';

const ORIGIN_W = 240;
const ORIGIN_H = 120;
const ORIGIN_CONNECTOR_H = 18;
const ORIGIN_GAP = 6;
/** Bottom handle extends 9px past the spine end. */
const ORIGIN_HANDLE_EXTENT = 9;

export { ORIGIN_W, ORIGIN_H };

export function getOriginPosition(centerX, originY) {
  const cardTop = originY + ORIGIN_HANDLE_EXTENT + ORIGIN_CONNECTOR_H + ORIGIN_GAP;
  return {
    left: centerX - ORIGIN_W / 2,
    top: cardTop,
  };
}

export function RoadmapOriginCard({
  origin,
  centerX,
  originY,
  selected,
  onSelect,
  onUpdate,
  mapTheme,
  onConnectClick,
  onNodeSelect,
  connectFrom,
  connectModeActive = false,
  selectedNodeRef,
}) {
  const [editingTitle, setEditingTitle] = useState(false);
  const [editingSubtitle, setEditingSubtitle] = useState(false);
  const pos = getOriginPosition(centerX, originY);
  const themeVars = resolveOriginThemeStyle(mapTheme);
  const nodeRef = { type: 'origin', id: 'origin' };
  const isConnectSource = sameNodeRef(connectFrom, nodeRef);
  const isSelected = selected || sameNodeRef(selectedNodeRef, nodeRef);

  const handlePointerDown = (e) => {
    if (e.button !== 0) return;
    if (e.target.closest('input, textarea, button')) return;
    e.stopPropagation();

    if (e.altKey && onConnectClick) {
      onConnectClick(nodeRef);
      return;
    }
    if (connectModeActive && onConnectClick) {
      onConnectClick(nodeRef);
      return;
    }

    onNodeSelect?.(nodeRef);
    onSelect?.();
  };

  return (
    <article
      className={[
        'roadmap-origin-card',
        'canvas-node',
        'canvas-node--typed',
        isSelected ? 'canvas-node--selected' : '',
        isConnectSource ? 'canvas-node--connect-source' : '',
        connectModeActive ? 'canvas-node--connect-target' : '',
      ]
        .filter(Boolean)
        .join(' ')}
      style={{ left: pos.left, top: pos.top, width: ORIGIN_W, minHeight: ORIGIN_H, ...themeVars }}
      onPointerDown={handlePointerDown}
      role="group"
      aria-label="Roadmap origin"
      title={connectModeActive ? 'Κλικ για σύνδεση · Alt+κλικ για σύνδεση' : 'Αρχή διαδρομής · Alt+κλικ για σύνδεση'}
    >
      <div className="roadmap-origin-card__connector" aria-hidden="true" />

      <div className="roadmap-origin-card__head">
        <span className="roadmap-origin-card__icon" aria-hidden="true">✦</span>
        <span className="roadmap-origin-card__label">Αρχή</span>
      </div>

      {editingTitle ? (
        <input
          className="roadmap-origin-card__input roadmap-origin-card__input--title"
          value={origin.title}
          autoFocus
          onChange={(e) => onUpdate?.({ title: e.target.value })}
          onBlur={() => setEditingTitle(false)}
          onKeyDown={(e) => e.key === 'Enter' && setEditingTitle(false)}
          onPointerDown={(e) => e.stopPropagation()}
        />
      ) : (
        <h3
          className="roadmap-origin-card__title"
          onDoubleClick={() => setEditingTitle(true)}
        >
          {origin.title || 'Η Ιδέα'}
        </h3>
      )}

      {editingSubtitle ? (
        <input
          className="roadmap-origin-card__input roadmap-origin-card__input--subtitle"
          value={origin.subtitle}
          autoFocus
          onChange={(e) => onUpdate?.({ subtitle: e.target.value })}
          onBlur={() => setEditingSubtitle(false)}
          onKeyDown={(e) => e.key === 'Enter' && setEditingSubtitle(false)}
          onPointerDown={(e) => e.stopPropagation()}
        />
      ) : (
        <p
          className="roadmap-origin-card__subtitle"
          onDoubleClick={() => setEditingSubtitle(true)}
        >
          {origin.subtitle || 'Αρχή της διαδρομής'}
        </p>
      )}
    </article>
  );
}
