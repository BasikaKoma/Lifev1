import { Fragment, useEffect, useRef, useState } from 'react';
import { useZoomTransform } from './ZoomCanvas';
import { frontAnchorX, frontOffsetX, FRONT_COLORS, normalizeFronts } from '../utils/projectFronts';

function FrontLabel({ front, onRename, onRemove, onRecolor }) {
  const [open, setOpen] = useState(false);
  const [label, setLabel] = useState(front.label);
  const rootRef = useRef(null);

  useEffect(() => {
    setLabel(front.label);
  }, [front.id, front.label]);

  useEffect(() => {
    if (!open) return undefined;
    const onPointerDown = (event) => {
      if (rootRef.current?.contains(event.target)) return;
      setOpen(false);
    };
    const onKeyDown = (event) => {
      if (event.key === 'Escape') setOpen(false);
    };
    window.addEventListener('pointerdown', onPointerDown, true);
    window.addEventListener('keydown', onKeyDown);
    return () => {
      window.removeEventListener('pointerdown', onPointerDown, true);
      window.removeEventListener('keydown', onKeyDown);
    };
  }, [open]);

  const commit = () => {
    const text = label.trim();
    if (!text) {
      setLabel(front.label);
      return;
    }
    if (text !== front.label) onRename?.(front.id, text);
  };

  return (
    <span className="projects-center-line__front-label" ref={rootRef}>
      <button
        type="button"
        className="projects-center-line__front-title"
        aria-expanded={open}
        aria-label={`Ρυθμίσεις μετώπου ${front.label}`}
        onClick={() => setOpen((value) => !value)}
      >
        {front.label}
      </button>
      {open ? (
        <span className="projects-center-line__front-settings" onPointerDown={(event) => event.stopPropagation()}>
          <input
            className="projects-center-line__front-name"
            value={label}
            aria-label={`Όνομα μετώπου ${front.label}`}
            onChange={(event) => setLabel(event.target.value)}
            onBlur={commit}
            onKeyDown={(event) => {
              if (event.key === 'Enter') {
                event.preventDefault();
                event.currentTarget.blur();
              }
              if (event.key === 'Escape') {
                setLabel(front.label);
                setOpen(false);
              }
            }}
          />
          <span className="projects-center-line__front-palette">
            {FRONT_COLORS.map((color) => (
              <button
                key={color}
                type="button"
                className="projects-center-line__front-swatch"
                style={{ background: color }}
                aria-label={color}
                aria-pressed={front.color === color}
                onClick={() => onRecolor?.(front.id, color)}
              />
            ))}
            <label className="projects-center-line__front-custom">
              <input
                type="color"
                value={front.color}
                aria-label="Άλλο χρώμα"
                onChange={(event) => onRecolor?.(front.id, event.target.value)}
              />
            </label>
          </span>
          <button
            type="button"
            className="projects-center-line__front-close"
            onClick={() => onRemove?.(front.id)}
          >
            Κλείσιμο μετώπου
          </button>
        </span>
      ) : null}
    </span>
  );
}

function FrontLine({
  front,
  index,
  centerX,
  top,
  nodes,
  onRename,
  onRemove,
  onRecolor,
  onOffset,
  renderDot,
}) {
  const { scale } = useZoomTransform();
  const drag = useRef(null);
  const x = frontAnchorX(centerX, index, front);
  const height = Math.max(36, front.atY - top);

  const onPointerDown = (event) => {
    if (event.button !== 0) return;
    if (event.target.closest('.projects-center-line__front-label, .projects-center-line__front-settings, .projects-center-line__front-name, .projects-center-line__dot')) return;
    event.stopPropagation();
    event.preventDefault();
    drag.current = {
      x: event.clientX,
      offset: frontOffsetX(front, index),
    };
    event.currentTarget.setPointerCapture(event.pointerId);
  };

  const onPointerMove = (event) => {
    if (!drag.current) return;
    const dx = (event.clientX - drag.current.x) / (scale || 1);
    onOffset?.(front.id, drag.current.offset + dx);
  };

  const onPointerUp = (event) => {
    drag.current = null;
    event.currentTarget.releasePointerCapture?.(event.pointerId);
  };

  return (
    <div
      className="projects-center-line projects-center-line--front projects-center-line--locked"
      style={{ left: x, top, height, '--front': front.color }}
      title="Σύρε αριστερά ή δεξιά"
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
    >
      <div className="projects-center-line__glow" aria-hidden="true" />
      <div className="projects-center-line__stroke" />
      {nodes.map((node) => (
        <Fragment key={node.id}>{renderDot?.(node, top)}</Fragment>
      ))}
      <FrontLabel front={front} onRename={onRename} onRemove={onRemove} onRecolor={onRecolor} />
    </div>
  );
}

export function ProjectFrontLines({
  lineMetrics,
  fronts = [],
  nodes = [],
  onRename,
  onRemove,
  onRecolor,
  onOffset,
  renderDot,
}) {
  const list = normalizeFronts(fronts);
  if (!lineMetrics || !list.length) return null;
  const { centerX, top } = lineMetrics;

  return (
    <>
      <svg className="project-fronts__forks" aria-hidden="true">
        {list.map((front, index) => {
          const x = frontAnchorX(centerX, index, front);
          const y = front.atY;
          return (
            <path
              key={front.id}
              d={`M ${centerX} ${y} C ${centerX} ${y - 42}, ${x} ${y - 8}, ${x} ${y - 36}`}
              stroke={front.color}
              strokeWidth="2.5"
              fill="none"
              strokeLinecap="round"
            />
          );
        })}
      </svg>
      {list.map((front, index) => (
        <FrontLine
          key={front.id}
          front={front}
          index={index}
          centerX={centerX}
          top={top}
          nodes={nodes.filter((node) => node.frontId === front.id)}
          onRename={onRename}
          onRemove={onRemove}
          onRecolor={onRecolor}
          onOffset={onOffset}
          renderDot={renderDot}
        />
      ))}
    </>
  );
}
