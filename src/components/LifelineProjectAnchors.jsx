import { useRef, useState } from 'react';

import { useZoomTransform } from './ZoomCanvas';

import { formatDayLabel, snapYToDay, timelineYToDate, LIFELINE_ZOOM_LEVEL } from '../utils/lifeline';



function LifelineProjectAnchor({

  project,

  top,

  centerX,

  side,

  config,

  lineMetrics,

  layout = null,

  zoomLevel = LIFELINE_ZOOM_LEVEL.week,

  onUpdateAnchor,

  onOpenProject,

}) {

  const { scale } = useZoomTransform();

  const drag = useRef(null);

  const [previewTop, setPreviewTop] = useState(null);

  const branchWidth = 100;

  const cardWidth = 180;

  const displayTop = previewTop ?? top;

  const cardX = side === 'left' ? centerX - branchWidth - cardWidth - 12 : centerX + branchWidth + 12;

  const compactDot = zoomLevel === LIFELINE_ZOOM_LEVEL.life;

  const compactMini = zoomLevel === LIFELINE_ZOOM_LEVEL.time;



  const handlePointerDown = (e) => {

    if (e.button !== 0) return;

    e.stopPropagation();

    e.preventDefault();

    drag.current = { y: e.clientY, startTop: top };

    e.currentTarget.setPointerCapture(e.pointerId);

  };



  const handlePointerMove = (e) => {

    if (!drag.current) return;

    const dy = (e.clientY - drag.current.y) / scale;

    setPreviewTop(snapYToDay(drag.current.startTop + dy, config, lineMetrics, layout));

  };



  const handlePointerUp = (e) => {

    if (!drag.current) return;

    const dy = (e.clientY - drag.current.y) / scale;

    const finalTop = snapYToDay(drag.current.startTop + dy, config, lineMetrics, layout);

    drag.current = null;

    setPreviewTop(null);

    e.currentTarget.releasePointerCapture?.(e.pointerId);

    onUpdateAnchor?.(project.id, timelineYToDate(finalTop, config, lineMetrics, layout));

  };



  const lineStartX = side === 'left' ? centerX - branchWidth : centerX;

  const lineEndX = side === 'left' ? centerX : centerX + branchWidth;

  const cardCenterY = 22;



  if (compactDot) {

    return (

      <button

        type="button"

        className="lifeline-project-anchor lifeline-project-anchor--dot-only"

        style={{ top: displayTop - 6, left: centerX - 6 }}

        onClick={() => onOpenProject?.(project.id)}

        title={`${project.title} — ${formatDayLabel(project.lifelineAnchorDate)}`}

        aria-label={project.title}

      />

    );

  }



  if (compactMini) {

    const miniX = side === 'left' ? centerX - 8 : centerX + 8;

    const miniTransform = side === 'left' ? 'translate(-100%, -50%)' : 'translateY(-50%)';

    return (

      <button

        type="button"

        className={`lifeline-project-anchor lifeline-project-anchor--mini lifeline-project-anchor--mini-${side}`}

        style={{ top: displayTop, left: miniX, transform: miniTransform }}

        onPointerDown={handlePointerDown}

        onPointerMove={handlePointerMove}

        onPointerUp={handlePointerUp}

        onPointerCancel={handlePointerUp}

        onClick={() => onOpenProject?.(project.id)}

        title={`${project.title} — ${formatDayLabel(project.lifelineAnchorDate)}`}

      >

        <span className="lifeline-project-anchor__mini-dot" aria-hidden="true" />

        <span className="lifeline-project-anchor__mini-title">{project.title}</span>

      </button>

    );

  }



  return (

    <div className="lifeline-project-anchor" style={{ top: displayTop - cardCenterY }}>

      <svg className="lifeline-project-anchor__branch" aria-hidden="true">

        <line

          x1={lineStartX}

          y1={cardCenterY}

          x2={lineEndX}

          y2={cardCenterY}

          className="lifeline-project-anchor__branch-line"

        />

        <circle cx={centerX} cy={cardCenterY} r="5" className="lifeline-project-anchor__dot" />

      </svg>



      <button

        type="button"

        className="lifeline-project-anchor__card"

        style={{ left: cardX, top: 0, width: cardWidth }}

        onPointerDown={handlePointerDown}

        onPointerMove={handlePointerMove}

        onPointerUp={handlePointerUp}

        onPointerCancel={handlePointerUp}

        onClick={() => onOpenProject?.(project.id)}

        title={`${project.title} — ${formatDayLabel(project.lifelineAnchorDate)}. Σύρε κάθετα για αλλαγή ημερομηνίας.`}

      >

        <span className="lifeline-project-anchor__title">{project.title}</span>

        <span className="lifeline-project-anchor__date">{formatDayLabel(project.lifelineAnchorDate)}</span>

      </button>

    </div>

  );

}



export function LifelineProjectAnchors({

  projects,

  config,

  lineMetrics,

  layout = null,

  centerX,

  zoomLevel = LIFELINE_ZOOM_LEVEL.week,

  onUpdateAnchor,

  onOpenProject,

}) {

  if (!lineMetrics || !projects?.length) return null;



  const anchored = projects.filter((p) => p.lifelineAnchorDate && typeof p._anchorTop === 'number');



  return (

    <div className="lifeline-project-anchors" data-zoom-level={zoomLevel}>

      {anchored.map((project, index) => (

        <LifelineProjectAnchor

          key={project.id}

          project={project}

          top={project._anchorTop}

          centerX={centerX}

          side={index % 2 === 0 ? 'right' : 'left'}

          config={config}

          lineMetrics={lineMetrics}

          layout={layout}

          zoomLevel={zoomLevel}

          onUpdateAnchor={onUpdateAnchor}

          onOpenProject={onOpenProject}

        />

      ))}

    </div>

  );

}



export function LifelineUnanchoredPanel({ projects, onAssignToday, onOpenProject }) {

  const unanchored = projects.filter((p) => !p.lifelineAnchorDate);

  if (!unanchored.length) return null;



  return (

    <div className="lifeline-unanchored-panel">

      <span className="lifeline-unanchored-panel__title">Projects χωρίς ημερομηνία</span>

      <ul className="lifeline-unanchored-panel__list">

        {unanchored.map((project) => (

          <li key={project.id} className="lifeline-unanchored-panel__item">

            <button

              type="button"

              className="lifeline-unanchored-panel__open"

              onClick={() => onOpenProject?.(project.id)}

            >

              {project.title}

            </button>

            <button

              type="button"

              className="btn btn--outline btn--sm"

              onClick={() => onAssignToday?.(project.id)}

            >

              Σήμερα

            </button>

          </li>

        ))}

      </ul>

    </div>

  );

}

