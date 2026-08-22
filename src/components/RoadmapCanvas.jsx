import { startTransition, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ZoomCanvas, useZoomTransform } from './ZoomCanvas';
import { MilestoneCanvasCard } from './MilestoneCanvasCard';
import { ObstacleCanvasCard } from './ObstacleCanvasCard';
import { ResourceCanvasCard } from './ResourceCanvasCard';
import { TaskCanvasCard } from './TaskCanvasCard';
import { CheckpointRoadmapItem } from './CheckpointRoadmapItem';
import { IdeaCanvasCard } from './IdeaCanvasCard';
import { StickyNoteCard } from './StickyNoteCard';
import { CanvasConnections } from './CanvasConnections';
import { CanvasFloatingToolbar } from './CanvasFloatingToolbar';
import { CanvasTopBar } from './CanvasTopBar';
import { CanvasInkSurface } from './CanvasInkSurface';
import { InkSelectionHost } from './InkSelectionHost';
import { InkDragHost } from './InkDragHost';
import { InkConvertModal } from './InkConvertModal';
import { AddCheckpointModal, EditCheckpointModal } from './AddCheckpointModal';
import { CheckpointNotesModal } from './CheckpointNotesModal';
import { ArchiveCelebration } from './ArchiveCelebration';
import { buildToggleCompletePatch } from '../utils/archive';
import {
  DEFAULT_INK_SIZE,
  getInkSurfaceSize,
  clientToBoardPoint,
  boardPointForInsert,
} from '../utils/inkStrokes';
import { getStrokesRectBounds } from '../utils/inkSelection';
import { strokesToPngDataUrl } from '../utils/inkToImage';
import { recognizeHandwriting } from '../utils/inkRecognize';
import { applyInkConversion } from '../utils/inkConvert';
import {
  IMAGE_STICKY_STYLE,
  isEditablePasteTarget,
  prepareImageFromFile,
  readClipboardPayload,
} from '../utils/canvasClipboard';
import {
  collectCanvasIdeas,
  collectCanvasStages,
  collectRoadmapCheckpoints,
  collectLifelineHiddenTickRanges,
  collectPlanWindows,
  collectPlanProgressSegments,
  getPlanStartY,
  getPlanEndY,
  getNextFreeCanvasPosition,
  getCenterLineMetrics,
  isOnRoadmap,
  isItemOnRoadmap,
  ORIGIN_X,
  ORIGIN_Y,
  CARD_W,
  CARD_H,
  MAJOR_W,
} from '../utils/stageLayout';
import {
  collectCanvasStickies,
  collectCanvasObstacles,
  collectCanvasResources,
  collectCanvasTasks,
  getBoardSizeWithStickies,
  getNodeToolbarPosition,
  sameNodeRef,
  nodeRefKey,
} from '../utils/canvasNodes';
import {
  getChildRefs,
  getConnectedRefs,
  getRegistryNode,
  offsetPosition,
} from '../utils/canvasNodeActions';
import { computeNodeLevels, canvasViewportStyle, DEFAULT_MAP_THEME, getRoadmapLayout, getRoadmapOrigin, getThemedConnectionPath, connectionLineStyle } from '../utils/mapTheme';
import { matchInsertShortcut } from '../utils/canvasInsertShortcuts';
import { collectProjectCategories } from '../utils/categories';
import { RoadmapOriginCard } from './RoadmapOriginCard';
import { LifelineDayTicks } from './LifelineDayTicks';
import { LifelineDayModal } from './LifelineDayModal';
import { LifelineProjectAnchors, LifelineUnanchoredPanel } from './LifelineProjectAnchors';
import {
  getLifelineConfig,
  generateDayTicks,
  generateLifelineDayBands,
  dateToTimelineY,
  syncLifelineMapTheme,
  isLifelineSpineReady,
  getLifelineTodayScrollPoint,
  getLifelineZoomLevelMeta,
  resolveLifelineZoomLevel,
  getDayTickCanvasY,
  collectLifelineBoundDates,
  applyLifelineDayHeightZoom,
  resetLifelineDayZoom,
  getLifelineZoomPercent,
  getLifelineSpineMetrics,
  timelineYToDate,
  LIFELINE_ZOOM,
  DEFAULT_LIFELINE_CONFIG,
} from '../utils/lifeline';
import { generatePlanDayTicks, buildLifelinePlanContext, collectLifelinePlanDateLabels } from '../utils/planMode';
import { platform } from '../platform';
import { collectLifelineActivityDates } from '../utils/lifelineDays';
import { viewportClientPoint } from '../utils/inkStrokes';
import { getCurrentStage, getNextIncompleteCheckpoint, isCheckpointDone } from '../utils/logic';
import { CheckpointPlanPanel } from './CheckpointPlanPanel';
import { useLifelineDayView, DAY_VIEW_PHASE } from '../hooks/useLifelineDayView';
import {
  getNoteSettledAt,
  isNoteSettled,
  isNoteSettledByCheckpoints,
  isSettledNoteVisibleOnRoadmap,
  checkpointHasSettledLinkedNotes,
} from '../utils/noteSettle';

const ROADMAP_OPEN_SCALE = 0.55;

function getRoadmapOpenFocusPoint(checkpoints, stages, layout) {
  const current = getCurrentStage(stages);
  const next = current ? getNextIncompleteCheckpoint(current) : null;
  const fromCurrent = next
    ? checkpoints.find((cp) => cp.id === next.id && cp.stageId === current.id)
    : null;
  const firstOpen = checkpoints.find((cp) => !isCheckpointDone(cp));
  const target = fromCurrent || firstOpen;
  if (!target || typeof target.timelineY !== 'number') return null;
  return {
    x: layout?.centerX ?? 480,
    y: target.timelineY,
  };
}

function ConnectPreviewLine({
  connectFrom,
  stages,
  backlog,
  stickies,
  obstacles,
  resources,
  tasks,
  layout,
  mousePos,
  mapTheme,
}) {
  if (!connectFrom || !mousePos) return null;
  const node = getRegistryNode(stages, backlog, stickies, connectFrom, obstacles, resources, tasks, layout);
  if (!node?.bounds) return null;

  const lineTheme = connectionLineStyle(mapTheme);
  const d = getThemedConnectionPath(node.bounds, {
    cx: mousePos.x,
    cy: mousePos.y,
    x: mousePos.x,
    y: mousePos.y,
    w: 0,
    h: 0,
  }, lineTheme.lineStyle);

  return (
    <svg className="canvas-connect-preview" aria-hidden="true">
      <path
        d={d}
        className="canvas-connect-preview__line"
        stroke={lineTheme.color || '#888888'}
        strokeWidth={lineTheme.strokeWidth}
        strokeDasharray="6 4"
      />
    </svg>
  );
}

function PlanDayTicks({ ticks, lineTop }) {
  if (!ticks?.length) return null;
  return (
    <div className="plan-day-ticks" aria-hidden="true">
      {ticks.map((tick) => (
        <div
          key={tick.id}
          className={`plan-day-tick plan-day-tick--${tick.kind}`}
          style={{ top: tick.top - lineTop }}
        >
          <span className="plan-day-tick__label">{tick.label}</span>
        </div>
      ))}
    </div>
  );
}

function RoadmapTimelineDot({ node, lineTop, onMoveTimelineY, onReorderCheckpoint, onSelect }) {
  const { scale } = useZoomTransform();
  const dragging = useRef(false);
  const origin = useRef(null);
  const [dragOffsetY, setDragOffsetY] = useState(0);

  const handlePointerDown = (e) => {
    if (e.button !== 0) return;
    e.stopPropagation();
    e.preventDefault();
    dragging.current = true;
    origin.current = { y: e.clientY, top: node.top };
    setDragOffsetY(0);
    onSelect?.(node);
    e.currentTarget.setPointerCapture(e.pointerId);
  };

  const handlePointerMove = (e) => {
    if (!dragging.current || !origin.current) return;
    const dy = (e.clientY - origin.current.y) / scale;
    if (node.kind === 'checkpoint') {
      setDragOffsetY(dy);
      return;
    }
    onMoveTimelineY?.(node, origin.current.top + dy);
  };

  const handlePointerUp = (e) => {
    if (!dragging.current || !origin.current) {
      dragging.current = false;
      origin.current = null;
      setDragOffsetY(0);
      return;
    }
    if (node.kind === 'checkpoint') {
      const dropY = origin.current.top + dragOffsetY;
      onReorderCheckpoint?.(node.stageId, node.refId, dropY);
    }
    dragging.current = false;
    origin.current = null;
    setDragOffsetY(0);
    e.currentTarget.releasePointerCapture?.(e.pointerId);
  };

  if (node.kind === 'checkpoint') {
    return (
      <button
        type="button"
        className={`roadmap-center-line__dot roadmap-center-line__dot--${(node.status || 'Locked').toLowerCase()} roadmap-center-line__dot--checkpoint roadmap-center-line__dot--draggable`}
        style={{ top: node.top - lineTop - 9 + dragOffsetY }}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerUp}
        title={`${node.title} — σύρε για αλλαγή σειράς`}
        aria-label={`Checkpoint: ${node.title}`}
      />
    );
  }

  if (node.kind === 'planStart') {
    return (
      <button
        type="button"
        className="roadmap-center-line__dot roadmap-center-line__dot--plan-start roadmap-center-line__dot--draggable"
        style={{ top: node.top - lineTop - 10 }}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerUp}
        title={`Έναρξη πλάνου — σύρε για αλλαγή ημερομηνίας`}
        aria-label={`Plan start: ${node.title}`}
      />
    );
  }

  return (
    <button
      type="button"
      className={`roadmap-center-line__dot roadmap-center-line__dot--${(node.status || 'Locked').toLowerCase()} roadmap-center-line__dot--${node.kind || 'milestone'} roadmap-center-line__dot--draggable`}
      style={{ top: node.top - lineTop - 10 }}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerCancel={handlePointerUp}
      title="Drag up/down on timeline"
      aria-label="Move item on timeline"
    />
  );
}

function RoadmapCenterLine({
  lineMetrics,
  selected,
  onSelect,
  onMoveTimelineY,
  onReorderCheckpoint,
  onSelectNode,
  onApplySpineMove,
  onResizeSpine,
  lifelineDayTicks = null,
  planWindows = [],
  planDayTicks = null,
  planProgressSegments = [],
  planCheckpoints = [],
  lifelineDaySpacing = null,
  lifelineConfig = null,
}) {
  const { scale } = useZoomTransform();
  const drag = useRef(null);

  if (!lineMetrics) return null;

  const startMove = (e) => {
    if (e.button !== 0) return;
    if (e.target.closest('.roadmap-center-line__handle, .roadmap-center-line__dot, .lifeline-day-tick')) return;
    e.stopPropagation();
    e.preventDefault();
    onSelect?.();
    drag.current = {
      mode: 'move',
      x: e.clientX,
      y: e.clientY,
      centerX: lineMetrics.centerX,
      top: lineMetrics.configured?.top ?? lineMetrics.top,
      height: lineMetrics.configured?.height ?? lineMetrics.height,
      lastDx: 0,
      lastDy: 0,
    };
    e.currentTarget.setPointerCapture(e.pointerId);
  };

  const startResize = (edge) => (e) => {
    if (e.button !== 0) return;
    e.stopPropagation();
    e.preventDefault();
    onSelect?.();
    drag.current = {
      mode: edge,
      y: e.clientY,
      top: lineMetrics.configured?.top ?? lineMetrics.top,
      height: lineMetrics.configured?.height ?? lineMetrics.height,
      originStartDate: lifelineConfig?.startDate || null,
      originEndDate: lifelineConfig?.endDate || null,
      originOriginStartDate: lifelineConfig?.originStartDate || lifelineConfig?.startDate || null,
      originFutureDays: lifelineConfig?.fullFutureDays ?? lifelineConfig?.futureDays ?? null,
      spacing: lifelineDaySpacing || lifelineConfig?.dayHeight || null,
    };
    e.currentTarget.setPointerCapture(e.pointerId);
  };

  const onPointerMove = (e) => {
    if (!drag.current) return;
    const d = drag.current;
    if (d.mode === 'move') {
      const dx = (e.clientX - d.x) / scale;
      const dy = (e.clientY - d.y) / scale;
      d.lastDx = dx;
      d.lastDy = dy;
      onApplySpineMove?.({
        centerX: d.centerX + dx,
        top: d.top + dy,
        height: d.height,
      });
      return;
    }
    const dy = (e.clientY - d.y) / scale;
    const meta = d.originEndDate
      ? {
          edge: d.mode,
          originTop: d.top,
          originHeight: d.height,
          originStartDate: d.originStartDate,
          originEndDate: d.originEndDate,
          originOriginStartDate: d.originOriginStartDate,
          originFutureDays: d.originFutureDays,
          spacing: d.spacing,
        }
      : undefined;
    if (d.mode === 'top') {
      onResizeSpine?.(d.top + dy, Math.max(240, d.height - dy), meta);
    } else if (d.mode === 'bottom') {
      onResizeSpine?.(d.top, Math.max(240, d.height + dy), meta);
    }
  };

  const onPointerUp = (e) => {
    drag.current = null;
    e.currentTarget.releasePointerCapture?.(e.pointerId);
  };

  return (
    <div
      className={`roadmap-center-line${selected ? ' roadmap-center-line--selected' : ''}${lifelineDayTicks ? ' roadmap-center-line--lifeline' : ''}${planWindows?.length ? ' roadmap-center-line--plan-active' : ''}`}
      style={{
        left: lineMetrics.centerX,
        top: lineMetrics.top,
        height: lineMetrics.height,
        ...(lifelineDaySpacing != null ? { '--ll-day-spacing': `${lifelineDaySpacing}px` } : {}),
      }}
      onPointerDown={startMove}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
      role="presentation"
    >
      <div className="roadmap-center-line__glow" aria-hidden="true" />
      <div className="roadmap-center-line__stroke" />
      {(planWindows || []).map((win) => (
        <div
          key={win.stageId}
          className="roadmap-center-line__plan-segment"
          style={{
            top: win.top - lineMetrics.top,
            height: win.height,
          }}
          title={`${win.title}: ${win.planStartDate} → ${win.planEndDate}`}
          aria-hidden="true"
        />
      ))}
      {(planProgressSegments || []).map((seg) => (
        <div
          key={`progress:${seg.stageId}`}
          className="roadmap-center-line__plan-progress"
          style={{
            top: seg.top - lineMetrics.top,
            height: seg.height,
          }}
          aria-hidden="true"
        />
      ))}
      {(planProgressSegments || []).map((seg) => (
        <div
          key={`progress-glow:${seg.stageId}`}
          className="roadmap-center-line__plan-progress-glow"
          style={{
            top: seg.top - lineMetrics.top,
            height: seg.height,
          }}
          aria-hidden="true"
        />
      ))}
      {(planProgressSegments || []).filter((seg) => !seg.complete).map((seg) => (
        <div
          key={`progress-head:${seg.stageId}`}
          className="roadmap-center-line__plan-progress-head"
          style={{ top: seg.endY - lineMetrics.top }}
          aria-hidden="true"
        />
      ))}
      {planDayTicks && !lifelineDayTicks && (
        <PlanDayTicks ticks={planDayTicks} lineTop={lineMetrics.top} />
      )}
      {(planCheckpoints || []).map((cp) => (
        <div
          key={`plan-cp:${cp.stageId}:${cp.id}`}
          className={`roadmap-center-line__plan-cp-dot${cp.done || cp.archived ? ' roadmap-center-line__plan-cp-dot--done' : ''}`}
          style={{ top: cp.timelineY - lineMetrics.top, transform: 'translateY(-50%)' }}
          aria-hidden="true"
        />
      ))}
      {lifelineDayTicks}
      <button
        type="button"
        className="roadmap-center-line__handle roadmap-center-line__handle--top"
        onPointerDown={startResize('top')}
        title={lifelineConfig ? 'Τράβηξε πάνω για πιο μετά' : 'Μεγέθυνση από πάνω'}
        aria-label={lifelineConfig ? 'Επέκταση Lifeline προς το μέλλον' : 'Resize roadmap from top'}
      />
      <button
        type="button"
        className="roadmap-center-line__handle roadmap-center-line__handle--bottom"
        onPointerDown={startResize('bottom')}
        title={lifelineConfig ? 'Τράβηξε κάτω για πιο πριν' : 'Μεγέθυνση από κάτω'}
        aria-label={lifelineConfig ? 'Επέκταση Lifeline προς το παρελθόν' : 'Resize roadmap from bottom'}
      />
      {(lineMetrics.nodes || []).map((node) => (
        <RoadmapTimelineDot
          key={node.id}
          node={node}
          lineTop={lineMetrics.top}
          onMoveTimelineY={onMoveTimelineY}
          onReorderCheckpoint={onReorderCheckpoint}
          onSelect={onSelectNode}
        />
      ))}
    </div>
  );
}

function resolveNodeStyle(nodeRef, stages, backlog, stickies, obstacles, resources, tasks) {
  if (!nodeRef) return null;
  if (nodeRef.type === 'milestone') {
    return stages.find((s) => s.id === nodeRef.id)?.canvasStyle;
  }
  if (nodeRef.type === 'idea') {
    if (nodeRef.source === 'backlog') {
      return backlog.find((i) => i.id === nodeRef.id)?.canvasStyle;
    }
    const stage = stages.find((s) => s.id === nodeRef.stageId);
    return stage?.ideas?.find((i) => i.id === nodeRef.id)?.canvasStyle;
  }
  if (nodeRef.type === 'sticky') {
    return stickies.find((s) => s.id === nodeRef.id)?.canvasStyle;
  }
  if (nodeRef.type === 'obstacle') {
    return obstacles.find((item) => item.id === nodeRef.id)?.canvasStyle;
  }
  if (nodeRef.type === 'resource') {
    return resources.find((item) => item.id === nodeRef.id)?.canvasStyle;
  }
  if (nodeRef.type === 'task') {
    return tasks.find((item) => item.id === nodeRef.id)?.canvasStyle;
  }
  return null;
}

/** Keeps live zoom/pan/viewport in a ref for insert-position math (parent sits outside ZoomCanvas). */
function CanvasTransformBridge({ bridgeRef }) {
  const transform = useZoomTransform();
  bridgeRef.current = transform;
  return null;
}

function CanvasBoard({
  canvasStages,
  canvasIdeas,
  canvasStickies,
  canvasObstacles,
  canvasResources,
  canvasTasks,
  categoryOptions,
  boardSize,
  connections,
  stages,
  backlog,
  stickies,
  obstacles,
  resources,
  tasks,
  connectFrom,
  connectModeActive = false,
  connectPreviewPos,
  onBoardPointerMove,
  onBoardPointerLeave,
  selectedNodeRef,
  selectedStyle,
  toolbarPosition = null,
  mapTheme,
  nodeLevels,
  onSelectStage,
  onOpenCheckpointNotes,
  onEditCheckpoint,
  onUpdateStage,
  onOpenCheckpointModal,
  onUpdateCheckpoint,
  onRemoveCheckpoint,
  onReorderCheckpoint,
  onMoveStage,
  onMoveIdea,
  onMoveSticky,
  onUpdateSticky,
  onMoveObstacle,
  onUpdateObstacle,
  onMoveResource,
  onUpdateResource,
  onMoveTask,
  onUpdateTask,
  onRemoveIdeaFromCanvas,
  onRemoveStageFromCanvas,
  onClearStickyFromCanvas,
  onConnectClick,
  onNodeSelect,
  onRemoveConnection,
  onStyleUpdate,
  onToolbarStartConnect,
  onToolbarAddSticky,
  onToolbarAddImage,
  onToolbarAddLink,
  onToolbarClose,
  onToolbarAction,
  canPasteNode,
  canPasteStyle,
  roadmapLayout,
  lineMetrics,
  roadmapCheckpoints = [],
  isPremium,
  onArchiveCheckpoint,
  onDeleteMilestone,
  onDeleteIdea,
  onDeleteSticky,
  onDeleteObstacle,
  onDeleteResource,
  onDeleteTask,
  onMoveTimelineY,
  onSelectMilestone,
  spineSelected,
  onSelectSpine,
  onApplySpineMove,
  onResizeSpine,
  origin,
  originSelected,
  onSelectOrigin,
  onUpdateOrigin,
  planWindows = [],
  planDayTicks = null,
  planProgressSegments = [],
  planCheckpoints = [],
  onOpenPlanPanel,
  canvasInk = [],
  selectedStrokeIds = [],
  inkSurfaceSize,
  inkTool = 'pan',
  inkColor = '#f5f5f5',
  inkSize = 3,
  onAddInkStroke,
  onRemoveInkStrokes,
  inkBindDownRef,
  selectBindRef,
  onInkSelectionChange,
  autoEditStickyId = null,
  onAutoEditStickyConsumed,
  isLifeline = false,
  lifelineConfig = null,
  lifelineDayTicks = null,
  lifelineAnchorsWithPos = [],
  onUpdateLifelineAnchor,
  onAssignLifelineToday,
  onOpenLifelineProject,
  lifelineDays = {},
  onDayClick,
  lifelinePlanContext = null,
  lifelinePlanDateLabels = null,
  lifelineHiddenTickRanges = [],
  lifelineZoomLevel = null,
  lifelineDayBands = null,
  selectedDayDate = null,
  dayViewPhase = DAY_VIEW_PHASE.timeline,
  routineTemplates = [],
}) {
  const layoutWithOrigin =
    roadmapLayout?.direction === 'vertical' && typeof lineMetrics?.bottomY === 'number'
      ? {
          ...roadmapLayout,
          originAnchor: { centerX: roadmapLayout.centerX, originY: lineMetrics.bottomY },
        }
      : roadmapLayout;

  const visibleStickies = canvasStickies.filter((sticky) =>
    isSettledNoteVisibleOnRoadmap(sticky, stages, connections, selectedNodeRef)
  );

  return (
    <div
      className="roadmap-canvas-surface"
      style={{ width: inkSurfaceSize.width, height: inkSurfaceSize.height }}
    >
      <CanvasInkSurface
        tool={inkTool}
        color={inkColor}
        size={inkSize}
        strokes={canvasInk}
        onAddStroke={onAddInkStroke}
        onRemoveStrokes={onRemoveInkStrokes}
        bindDownRef={inkBindDownRef}
        selectedStrokeIds={selectedStrokeIds}
        width={inkSurfaceSize.width}
        height={inkSurfaceSize.height}
      />

      <InkSelectionHost
        strokes={canvasInk}
        onSelectionChange={onInkSelectionChange}
        bindDownRef={selectBindRef}
      />

      <div
        className={`roadmap-canvas-board${roadmapLayout?.direction === 'vertical' ? ' roadmap-canvas-board--vertical' : ''}${isPremium ? ' roadmap-canvas-board--premium' : ''}${connectModeActive ? ' roadmap-canvas-board--connecting' : ''}${selectedDayDate ? ' roadmap-canvas-board--day-view' : ''}`}
        data-day-view={selectedDayDate ? '1' : '0'}
        data-day-view-phase={dayViewPhase}
        data-lifeline-zoom={isLifeline && lifelineZoomLevel ? lifelineZoomLevel : undefined}
        style={{ width: boardSize.width, height: boardSize.height }}
        onPointerMove={onBoardPointerMove}
        onPointerLeave={onBoardPointerLeave}
      >

      {roadmapLayout?.direction === 'vertical' && (
        <RoadmapCenterLine
          lineMetrics={lineMetrics}
          selected={spineSelected}
          onSelect={onSelectSpine}
          onMoveTimelineY={onMoveTimelineY}
          onReorderCheckpoint={onReorderCheckpoint}
          onSelectNode={onSelectMilestone}
          onApplySpineMove={onApplySpineMove}
          onResizeSpine={onResizeSpine}
          lifelineConfig={isLifeline ? lifelineConfig : null}
          lifelineDayTicks={
            isLifeline && lifelineDayTicks ? (
              <LifelineDayTicks
                ticks={lifelineDayTicks}
                dayBands={lifelineDayBands}
                lineTop={lineMetrics.top}
                lifelineDays={lifelineDays}
                onDayClick={onDayClick}
                planLabels={lifelinePlanDateLabels}
                daySpacing={lifelinePlanContext?.daySpacing ?? 0}
                zoomLevel={lifelineZoomLevel}
                lifelineConfig={lifelineConfig}
                lineMetrics={lineMetrics}
                layout={roadmapLayout}
                hiddenTickRanges={lifelineHiddenTickRanges}
                selectedDate={selectedDayDate}
                routineTemplates={routineTemplates}
              />
            ) : null
          }
          planWindows={planWindows}
          planDayTicks={isLifeline ? null : planDayTicks}
          planProgressSegments={planProgressSegments}
          planCheckpoints={planCheckpoints}
          lifelineDaySpacing={isLifeline ? lifelinePlanContext?.daySpacing : null}
        />
      )}

      {isLifeline && (
        <>
          <LifelineProjectAnchors
            projects={lifelineAnchorsWithPos}
            config={lifelineConfig}
            lineMetrics={lineMetrics}
            layout={roadmapLayout}
            centerX={roadmapLayout.centerX}
            zoomLevel={lifelineZoomLevel}
            onUpdateAnchor={onUpdateLifelineAnchor}
            onOpenProject={onOpenLifelineProject}
          />
          {lifelineZoomLevel == null || lifelineZoomLevel > 1 ? (
            <LifelineUnanchoredPanel
              projects={lifelineAnchorsWithPos}
              onAssignToday={onAssignLifelineToday}
              onOpenProject={onOpenLifelineProject}
            />
          ) : null}
        </>
      )}

      {roadmapLayout?.direction === 'vertical'
        && origin
        && typeof lineMetrics?.bottomY === 'number'
        && !(isLifeline && lifelineConfig?.windowed) && (
        <RoadmapOriginCard
          origin={origin}
          centerX={roadmapLayout.centerX}
          originY={lineMetrics.bottomY}
          selected={originSelected}
          onSelect={onSelectOrigin}
          onUpdate={onUpdateOrigin}
          mapTheme={mapTheme}
          onConnectClick={onConnectClick}
          onNodeSelect={onNodeSelect}
          connectFrom={connectFrom}
          connectModeActive={connectModeActive}
          selectedNodeRef={selectedNodeRef}
        />
      )}

      <CanvasConnections
        connections={connections}
        stages={stages}
        backlog={backlog}
        stickies={visibleStickies}
        obstacles={obstacles}
        resources={resources}
        tasks={tasks}
        layout={layoutWithOrigin}
        mapTheme={mapTheme}
        onRemoveConnection={onRemoveConnection}
      />

      {connectModeActive && (
        <ConnectPreviewLine
          connectFrom={connectFrom}
          stages={stages}
          backlog={backlog}
          stickies={visibleStickies}
          obstacles={obstacles}
          resources={resources}
          tasks={tasks}
          layout={layoutWithOrigin}
          mousePos={connectPreviewPos}
          mapTheme={mapTheme}
        />
      )}

      {selectedNodeRef && toolbarPosition && (
        <CanvasFloatingToolbar
          position={toolbarPosition}
          currentStyle={selectedStyle}
          onUpdate={onStyleUpdate}
          onStartConnect={onToolbarStartConnect}
          onAddSticky={onToolbarAddSticky}
          onAddImage={onToolbarAddImage}
          onAddLink={onToolbarAddLink}
          onClose={onToolbarClose}
          onAction={onToolbarAction}
          canPaste={canPasteNode}
          canPasteStyle={canPasteStyle}
        />
      )}

      {canvasStages.map((stage) => (
        <MilestoneCanvasCard
          key={stage.id}
          stage={stage}
          mapTheme={mapTheme}
          nodeLevel={nodeLevels.get(nodeRefKey({ type: 'milestone', id: stage.id }))}
          side={isOnRoadmap(stage) ? (stage.roadmapSide || 'right') : 'free'}
          onSelect={onSelectStage}
          onUpdateStage={onUpdateStage}
          onAddCheckpoint={onOpenCheckpointModal}
          onOpenCheckpoint={onOpenPlanPanel}
          onMove={(x, y) => onMoveStage(stage.id, x, y)}
          onMoveEnd={
            isLifeline && stage.planMode
              ? (x, y) => onMoveStage(stage.id, x, y, { commit: true })
              : undefined
          }
          onRemove={onDeleteMilestone}
          onRemoveFromCanvas={onRemoveStageFromCanvas}
          onConnectClick={onConnectClick}
          onNodeSelect={onNodeSelect}
          connectFrom={connectFrom}
          connectModeActive={connectModeActive}
          selectedNodeRef={selectedNodeRef}
        />
      ))}

      {roadmapLayout?.direction === 'vertical' &&
        roadmapCheckpoints.map((cp) => (
          <CheckpointRoadmapItem
            key={`${cp.stageId}:${cp.id}`}
            checkpoint={cp}
            centerX={lineMetrics?.centerX ?? roadmapLayout.centerX}
            side={cp.side}
            stageId={cp.stageId}
            onSelectStage={onSelectStage}
            onOpenCheckpoint={onOpenCheckpointNotes}
            onOpenPlanPanel={onOpenPlanPanel}
            onEditCheckpoint={onEditCheckpoint}
            onToggleComplete={onArchiveCheckpoint}
            onUpdateCheckpoint={onUpdateCheckpoint}
            onSideChange={(stageId, checkpointId, roadmapSide) =>
              onUpdateCheckpoint?.(stageId, checkpointId, { roadmapSide })
            }
            onRemove={(stageId, checkpointId) => onRemoveCheckpoint?.(stageId, checkpointId)}
            onReorder={(stageId, checkpointId, dropTimelineY) =>
              onReorderCheckpoint?.(stageId, checkpointId, dropTimelineY)
            }
            onPriorityChange={(stageId, checkpointId, priority) =>
              onUpdateCheckpoint?.(stageId, checkpointId, { priority })
            }
            onConnectClick={onConnectClick}
            onNodeSelect={onNodeSelect}
            connectFrom={connectFrom}
            connectModeActive={connectModeActive}
            selectedNodeRef={selectedNodeRef}
            lifelinePlanContext={lifelinePlanContext}
            isLifeline={isLifeline}
            lifelineZoomLevel={lifelineZoomLevel}
            hasSettledLinkedNotes={checkpointHasSettledLinkedNotes(
              cp.id,
              canvasStickies,
              stages,
              connections
            )}
          />
        ))}

      {canvasIdeas.map((idea) => (
        <IdeaCanvasCard
          key={`${idea.source}-${idea.stageId || 'b'}-${idea.id}`}
          idea={idea}
          source={idea.source}
          stageId={idea.stageId}
          stageTitle={idea.stageTitle}
          mapTheme={mapTheme}
          nodeLevel={nodeLevels.get(nodeRefKey({
            type: 'idea',
            id: idea.id,
            source: idea.source,
            stageId: idea.stageId || undefined,
          }))}
          onMove={onMoveIdea}
          onRemove={onDeleteIdea}
          onRemoveFromCanvas={onRemoveIdeaFromCanvas}
          onSelect={onSelectStage}
          onConnectClick={onConnectClick}
          onNodeSelect={onNodeSelect}
          connectFrom={connectFrom}
          connectModeActive={connectModeActive}
          selectedNodeRef={selectedNodeRef}
          side={isItemOnRoadmap(idea) ? (idea.roadmapSide || 'right') : 'free'}
        />
      ))}

      {visibleStickies.map((sticky) => (
        <StickyNoteCard
          key={sticky.id}
          sticky={sticky}
          nodeRef={{ type: 'sticky', id: sticky.id }}
          mapTheme={mapTheme}
          nodeLevel={nodeLevels.get(nodeRefKey({ type: 'sticky', id: sticky.id }))}
          onMove={onMoveSticky}
          onUpdate={onUpdateSticky}
          onRemove={onDeleteSticky}
          onConnectClick={onConnectClick}
          onNodeSelect={onNodeSelect}
          connectFrom={connectFrom}
          connectModeActive={connectModeActive}
          selectedNodeRef={selectedNodeRef}
          side={isItemOnRoadmap(sticky) ? (sticky.roadmapSide || 'right') : 'free'}
          autoEdit={autoEditStickyId === sticky.id}
          onAutoEditConsumed={onAutoEditStickyConsumed}
          settled={isNoteSettled(sticky, stages, connections)}
          settledAt={getNoteSettledAt(sticky, stages, connections)}
          settledByCheckpoints={isNoteSettledByCheckpoints(sticky, stages, connections)}
        />
      ))}

      {canvasObstacles.map((obstacle) => (
        <ObstacleCanvasCard
          key={obstacle.id}
          obstacle={obstacle}
          mapTheme={mapTheme}
          nodeLevel={nodeLevels.get(nodeRefKey({ type: 'obstacle', id: obstacle.id }))}
          onMove={onMoveObstacle}
          onUpdate={onUpdateObstacle}
          onRemove={onDeleteObstacle}
          onConnectClick={onConnectClick}
          onNodeSelect={onNodeSelect}
          connectFrom={connectFrom}
          connectModeActive={connectModeActive}
          selectedNodeRef={selectedNodeRef}
          side={isItemOnRoadmap(obstacle) ? (obstacle.roadmapSide || 'right') : 'free'}
        />
      ))}

      {canvasResources.map((resource) => (
        <ResourceCanvasCard
          key={resource.id}
          resource={resource}
          mapTheme={mapTheme}
          nodeLevel={nodeLevels.get(nodeRefKey({ type: 'resource', id: resource.id }))}
          onMove={onMoveResource}
          onUpdate={onUpdateResource}
          onRemove={onDeleteResource}
          onConnectClick={onConnectClick}
          onNodeSelect={onNodeSelect}
          connectFrom={connectFrom}
          connectModeActive={connectModeActive}
          selectedNodeRef={selectedNodeRef}
          side={isItemOnRoadmap(resource) ? (resource.roadmapSide || 'right') : 'free'}
        />
      ))}

      {canvasTasks.map((task) => (
        <TaskCanvasCard
          key={task.id}
          task={task}
          categoryOptions={categoryOptions}
          mapTheme={mapTheme}
          nodeLevel={nodeLevels.get(nodeRefKey({ type: 'task', id: task.id }))}
          onMove={onMoveTask}
          onUpdate={onUpdateTask}
          onRemove={onDeleteTask}
          onConnectClick={onConnectClick}
          onNodeSelect={onNodeSelect}
          connectFrom={connectFrom}
          connectModeActive={connectModeActive}
          selectedNodeRef={selectedNodeRef}
          side={isItemOnRoadmap(task) ? (task.roadmapSide || 'right') : 'free'}
        />
      ))}
      </div>
    </div>
  );
}

export function RoadmapCanvas({
  stages,
  backlog = [],
  canvasConnections = [],
  canvasStickies = [],
  canvasObstacles = [],
  canvasResources = [],
  canvasTasks = [],
  canvasInk = [],
  onSelectStage,
  onUpdateStage,
  onAddCheckpoint,
  onOpenCheckpointModal,
  onUpdateCheckpoint,
  onRemoveCheckpoint,
  onReorderCheckpoint,
  onAddMilestone,
  onMoveStagePosition,
  onMoveStageTimelineY,
  onMoveItemTimelineY,
  onApplyRoadmapSpine,
  onResizeRoadmapSpine,
  onClearStageFromCanvas,
  onMoveIdeaPosition,
  onMoveBacklogIdeaPosition,
  onAddBacklogIdea,
  onClearIdeaFromCanvas,
  onAddCanvasConnection,
  onRemoveCanvasConnection,
  onAddCanvasSticky,
  onUpdateCanvasSticky,
  onMoveCanvasSticky,
  onClearStickyFromCanvas,
  onUpdateNodeCanvasStyle,
  onApplyAutoLayout,
  onRemoveStage,
  onRemoveBacklogIdea,
  onRemoveIdea,
  onRemoveCanvasSticky,
  onAddCanvasObstacle,
  onUpdateCanvasObstacle,
  onMoveCanvasObstacle,
  onRemoveCanvasObstacle,
  onAddCanvasResource,
  onUpdateCanvasResource,
  onMoveCanvasResource,
  onRemoveCanvasResource,
  onAddCanvasTask,
  onUpdateCanvasTask,
  onMoveCanvasTask,
  onRemoveCanvasTask,
  onAddCanvasInkStroke,
  onRemoveCanvasInkStrokes,
  onMoveCanvasInkStrokes,
  onClearCanvasInk,
  onUndo,
  onAddNote,
  onAddGoal,
  mapTheme,
  onMapThemeChange,
  isFullscreen = false,
  onFullscreenChange,
  isLifeline = false,
  lifelineAnchors = [],
  onUpdateLifelineAnchor,
  onAssignLifelineToday,
  onOpenLifelineProject,
  lifelineDays = {},
  selfHubDays = {},
  onUpdateLifelineDay,
  projectActivity = [],
  onRefreshProjectActivity,
  lifelineFocusToken = 0,
  syncing = false,
  hasUnsavedChanges = false,
  onSave,
  onOpenWorkspace,
  onBrainContextChange,
  brainOrb = null,
}) {
  const [connectFrom, setConnectFrom] = useState(null);
  const [connectPreviewPos, setConnectPreviewPos] = useState(null);
  const dayView = useLifelineDayView();

  const cancelConnectMode = useCallback(() => {
    setConnectFrom(null);
    setConnectPreviewPos(null);
  }, []);
  const [selectedNodeRef, setSelectedNodeRef] = useState(null);

  useEffect(() => {
    if (!isLifeline || !onBrainContextChange) return;
    const projectOnDay = (lifelineAnchors || []).find((project) => (
      project.lifelineAnchorDate === dayView.date
    ));
    onBrainContextChange({
      selectedDate: dayView.date || null,
      selectedProjectId: projectOnDay?.id || null,
      selectedCheckpointId: selectedNodeRef?.type === 'checkpoint' ? selectedNodeRef.id : null,
      selectedStageId: selectedNodeRef?.type === 'milestone' ? selectedNodeRef.id : null,
      openedFrom: 'lifeline',
    });
  }, [isLifeline, onBrainContextChange, dayView.date, selectedNodeRef, lifelineAnchors]);

  const [autoEditStickyId, setAutoEditStickyId] = useState(null);
  const transformRef = useRef({ scale: ROADMAP_OPEN_SCALE, pan: { x: 48, y: 24 }, viewportRef: null });
  const zoomCanvasRef = useRef(null);
  const canvasTransformRef = useRef(null);
  const containerRef = useRef(null);
  const [zoomPercent, setZoomPercent] = useState(Math.round(ROADMAP_OPEN_SCALE * 100));
  const [lifelineCssScale, setLifelineCssScale] = useState(0.9);
  const lifelineSyncedThemeRef = useRef(null);
  const lastPointerClientRef = useRef(null);
  const pointerOnCanvasRef = useRef(false);
  const imageFileInputRef = useRef(null);
  const nodeClipboardRef = useRef(null);
  const [nodeClipboard, setNodeClipboard] = useState(null);
  const [styleClipboard, setStyleClipboard] = useState(null);

  useEffect(() => {
    nodeClipboardRef.current = nodeClipboard;
  }, [nodeClipboard]);
  const [drawTool, setDrawTool] = useState('pan');
  const [drawColor, setDrawColor] = useState('#f5f5f5');
  const [drawSize, setDrawSize] = useState(DEFAULT_INK_SIZE);
  const inkDownRef = useRef(null);
  const selectDownRef = useRef(null);
  const inkDragDownRef = useRef(null);
  const [selectedStrokeIds, setSelectedStrokeIds] = useState([]);
  const [recognizingInk, setRecognizingInk] = useState(false);
  const [convertModal, setConvertModal] = useState({
    open: false,
    loading: false,
    error: null,
    text: '',
    convertType: 'sticky',
    previewUrl: null,
    strokeIds: [],
    position: null,
    removeInk: true,
  });
  const [checkpointModal, setCheckpointModal] = useState({
    open: false,
    stageId: null,
    stageTitle: '',
    requirePlanDate: false,
    planStartDate: null,
    planEndDate: null,
  });
  const [checkpointNotesModal, setCheckpointNotesModal] = useState({
    open: false,
    stageId: null,
    checkpointId: null,
  });
  const [checkpointPlanPanel, setCheckpointPlanPanel] = useState({
    open: false,
    stageId: null,
    checkpointId: null,
  });
  const [editCheckpointModal, setEditCheckpointModal] = useState({
    open: false,
    stageId: null,
    checkpointId: null,
  });
  const [archiveCelebration, setArchiveCelebration] = useState(null);
  const [spineSelected, setSpineSelected] = useState(false);
  const [originSelected, setOriginSelected] = useState(false);

  const handleOpenCheckpointNotes = useCallback((stageId, checkpointId) => {
    setCheckpointNotesModal({ open: true, stageId, checkpointId });
  }, []);

  const handleCloseCheckpointNotes = useCallback(() => {
    setCheckpointNotesModal({ open: false, stageId: null, checkpointId: null });
  }, []);

  const handleOpenPlanPanel = useCallback((stageId, checkpointId) => {
    setCheckpointPlanPanel({ open: true, stageId, checkpointId });
  }, []);

  const handleClosePlanPanel = useCallback(() => {
    setCheckpointPlanPanel({ open: false, stageId: null, checkpointId: null });
  }, []);

  const handleOpenEditCheckpoint = useCallback((stageId, checkpointId) => {
    setEditCheckpointModal({ open: true, stageId, checkpointId });
  }, []);

  const handleCloseEditCheckpoint = useCallback(() => {
    setEditCheckpointModal({ open: false, stageId: null, checkpointId: null });
  }, []);

  const editCheckpointTarget = useMemo(() => {
    if (!editCheckpointModal.open || !editCheckpointModal.stageId || !editCheckpointModal.checkpointId) {
      return null;
    }
    const stage = stages.find((s) => s.id === editCheckpointModal.stageId);
    const checkpoint = stage?.checkpoints?.find((cp) => cp.id === editCheckpointModal.checkpointId);
    if (!stage || !checkpoint) return null;
    return { stage, checkpoint };
  }, [editCheckpointModal, stages]);

  const handleSaveEditCheckpoint = useCallback(
    (patch) => {
      if (!editCheckpointModal.stageId || !editCheckpointModal.checkpointId) return;
      onUpdateCheckpoint?.(editCheckpointModal.stageId, editCheckpointModal.checkpointId, patch);
    },
    [editCheckpointModal.stageId, editCheckpointModal.checkpointId, onUpdateCheckpoint]
  );

  const handleToggleCheckpointComplete = useCallback(
    (stageId, checkpoint) => {
      if (!checkpoint) return;
      const wasDone = Boolean(checkpoint.done || checkpoint.archived);
      const patch = buildToggleCompletePatch(checkpoint);
      onUpdateCheckpoint?.(stageId, checkpoint.id, patch);
      if (!wasDone) {
        setArchiveCelebration({
          title: checkpoint.title,
          subtitle: 'Checkpoint',
          completedAt: patch.completedAt,
        });
      }
    },
    [onUpdateCheckpoint]
  );

  const canvasStages = collectCanvasStages(stages);
  const canvasIdeas = collectCanvasIdeas(stages, backlog);
  const canvasStickiesOnBoard = collectCanvasStickies(canvasStickies);
  const canvasObstaclesOnBoard = collectCanvasObstacles(canvasObstacles);
  const canvasResourcesOnBoard = collectCanvasResources(canvasResources);
  const canvasTasksOnBoard = collectCanvasTasks(canvasTasks);
  const canvasPlacementExtras = useMemo(
    () => ({ obstacles: canvasObstacles, resources: canvasResources, tasks: canvasTasks }),
    [canvasObstacles, canvasResources, canvasTasks]
  );
  const categoryOptions = useMemo(
    () => collectProjectCategories({
      stages,
      notes: [],
      backlog,
      canvasStickies,
      canvasObstacles,
      canvasResources,
      canvasTasks,
    }),
    [stages, backlog, canvasStickies, canvasObstacles, canvasResources, canvasTasks]
  );
  const lifelineAnchorDates = useMemo(
    () => lifelineAnchors.map((p) => p.lifelineAnchorDate).filter(Boolean),
    [lifelineAnchors]
  );
  const lifelineBoundDates = useMemo(
    () =>
      collectLifelineBoundDates({
        stages,
        lifelineDays,
        extraDates: [
          ...lifelineAnchorDates,
          ...collectLifelineActivityDates(projectActivity),
        ],
      }),
    [stages, lifelineDays, lifelineAnchorDates, projectActivity]
  );
  const activeTheme = useMemo(() => {
    const base = mapTheme || DEFAULT_MAP_THEME;
    if (!isLifeline) {
      lifelineSyncedThemeRef.current = null;
      return base;
    }
    const config = getLifelineConfig(base, lifelineBoundDates);
    const layout = getRoadmapLayout(base);
    if (isLifelineSpineReady(config, layout, lifelineBoundDates)) {
      lifelineSyncedThemeRef.current = null;
      return base;
    }
    const synced = syncLifelineMapTheme(base, lifelineBoundDates);
    const cacheKey = [
      synced.roadmap?.height,
      synced.roadmap?.top,
      synced.lifeline?.dayHeight,
      synced.lifeline?.viewCenterDate,
      synced.lifeline?.startDate,
    ].join('|');
    if (lifelineSyncedThemeRef.current?.key === cacheKey) {
      return lifelineSyncedThemeRef.current.theme;
    }
    lifelineSyncedThemeRef.current = { key: cacheKey, theme: synced };
    return synced;
  }, [mapTheme, isLifeline, lifelineBoundDates]);
  useEffect(() => {
    if (!isLifeline || !onMapThemeChange) return;
    const base = mapTheme || DEFAULT_MAP_THEME;
    const config = getLifelineConfig(base, lifelineBoundDates);
    const layout = getRoadmapLayout(base);
    if (isLifelineSpineReady(config, layout, lifelineBoundDates)) return;
    const synced = syncLifelineMapTheme(base, lifelineBoundDates);
    // Bail if sync wouldn't change persisted viewport — prevents save/render loops.
    if (
      synced.roadmap?.height === layout.height
      && synced.lifeline?.dayHeight === (base.lifeline?.dayHeight ?? config.dayHeight)
      && synced.lifeline?.viewCenterDate === (base.lifeline?.viewCenterDate ?? null)
      && synced.roadmap?.top === layout.top
    ) {
      return;
    }
    onMapThemeChange({ lifeline: synced.lifeline, roadmap: synced.roadmap });
  }, [isLifeline, mapTheme, lifelineBoundDates, onMapThemeChange]);
  const roadmapLayout = useMemo(() => getRoadmapLayout(activeTheme), [activeTheme]);
  const roadmapOrigin = useMemo(() => getRoadmapOrigin(activeTheme), [activeTheme]);
  const lifelineConfig = useMemo(
    () => (isLifeline ? getLifelineConfig(activeTheme, lifelineBoundDates) : null),
    [isLifeline, activeTheme, lifelineBoundDates]
  );
  const lifelinePlanContext = useMemo(
    () =>
      lifelineConfig
        ? buildLifelinePlanContext(lifelineConfig, roadmapLayout, lifelineBoundDates)
        : null,
    [lifelineConfig, roadmapLayout, lifelineBoundDates]
  );
  const lifelineZoomLevel = useMemo(() => {
    if (!isLifeline || !lifelinePlanContext) return null;
    return resolveLifelineZoomLevel(lifelinePlanContext.daySpacing, lifelineCssScale);
  }, [isLifeline, lifelinePlanContext, lifelineCssScale]);
  const lifelineZoomMeta = useMemo(
    () => (lifelineZoomLevel ? getLifelineZoomLevelMeta(lifelineZoomLevel) : null),
    [lifelineZoomLevel]
  );
  const lineMetrics = useMemo(
    () => getCenterLineMetrics(stages, roadmapLayout, {
      ideas: canvasIdeas,
      stickies: canvasStickiesOnBoard,
      obstacles: canvasObstaclesOnBoard,
      resources: canvasResourcesOnBoard,
      tasks: canvasTasksOnBoard,
      lifelineContext: lifelinePlanContext,
    }),
    [stages, roadmapLayout, canvasIdeas, canvasStickiesOnBoard, canvasObstaclesOnBoard, canvasResourcesOnBoard, canvasTasksOnBoard, lifelinePlanContext]
  );
  const lifelinePlanDateLabels = useMemo(
    () => (isLifeline ? collectLifelinePlanDateLabels(stages, lifelinePlanContext) : null),
    [isLifeline, stages, lifelinePlanContext]
  );
  const lifelineActivityDates = useMemo(
    () => (isLifeline ? collectLifelineActivityDates(projectActivity) : null),
    [isLifeline, projectActivity]
  );
  const lifelineDayTicks = useMemo(
    () =>
      isLifeline && lifelineConfig
        ? generateDayTicks(lifelineConfig, lineMetrics, roadmapLayout, {
            planDates: lifelinePlanDateLabels,
            lifelineDays,
            zoomLevel: lifelineZoomLevel ?? undefined,
            activityDates: lifelineActivityDates,
          })
        : null,
    [isLifeline, lifelineConfig, lineMetrics, roadmapLayout, lifelinePlanDateLabels, lifelineDays, lifelineZoomLevel, lifelineActivityDates]
  );
  const lifelineDayBands = useMemo(
    () =>
      isLifeline && lifelineConfig && lifelineZoomLevel
        ? generateLifelineDayBands(
            lifelineConfig,
            lineMetrics,
            roadmapLayout,
            lifelineDays,
            lifelineZoomLevel,
            lifelineActivityDates
          )
        : null,
    [isLifeline, lifelineConfig, lineMetrics, roadmapLayout, lifelineDays, lifelineZoomLevel, lifelineActivityDates]
  );
  const lifelineAnchorsWithPos = useMemo(() => {
    if (!isLifeline || !lifelineConfig) return lifelineAnchors;
    return lifelineAnchors.map((project) => ({
      ...project,
      _anchorTop: project.lifelineAnchorDate
        ? dateToTimelineY(project.lifelineAnchorDate, lifelineConfig, lineMetrics, roadmapLayout)
        : null,
    }));
  }, [isLifeline, lifelineConfig, lifelineAnchors, lineMetrics, roadmapLayout]);

  const openDayView = dayView.open;
  const closeDayView = dayView.close;

  const handleOpenLifelineDay = useCallback((date, originEl = null) => {
    if (!date || !isLifeline) return;
    onRefreshProjectActivity?.();

    const ctx = transformRef.current || {};
    const scale = ctx.scale ?? zoomCanvasRef.current?.getScale?.() ?? 0.9;
    const pan = ctx.pan ?? zoomCanvasRef.current?.getPan?.() ?? { x: 0, y: 0 };
    const viewportEl = ctx.viewportRef?.current;

    let originRect = null;
    if (originEl?.getBoundingClientRect && !originEl.classList?.contains('lifeline-day-grid')) {
      const r = originEl.getBoundingClientRect();
      originRect = {
        top: r.top,
        left: r.left,
        width: r.width,
        height: r.height,
      };
    } else if (viewportEl && lifelineConfig) {
      const dayY = getDayTickCanvasY(date, lifelineConfig, roadmapLayout, lifelineBoundDates);
      const centerX = roadmapLayout?.centerX ?? 480;
      if (dayY != null) {
        const vr = viewportEl.getBoundingClientRect();
        const screenX = vr.left + pan.x + centerX * scale;
        const screenY = vr.top + pan.y + dayY * scale;
        originRect = { top: screenY - 14, left: screenX - 24, width: 48, height: 28 };
      }
    }

    // Prefer the actual tick button if present (more accurate origin).
    if (!originRect || originEl?.classList?.contains('lifeline-day-grid')) {
      const tickEl = viewportEl?.ownerDocument?.querySelector?.(
        `.lifeline-day-tick[data-date="${date}"]`
      );
      if (tickEl?.getBoundingClientRect) {
        const r = tickEl.getBoundingClientRect();
        originRect = { top: r.top, left: r.left, width: r.width, height: r.height };
      }
    }

    const snapshot = {
      scale,
      pan: { ...pan },
      dayHeight: activeTheme?.lifeline?.dayHeight ?? DEFAULT_LIFELINE_CONFIG.dayHeight,
      viewCenterDate: activeTheme?.lifeline?.viewCenterDate ?? null,
      date,
    };

    // Soft pan to center the day, then Premium Day Lab fades in (no exaggerated dive).
    let targetPan = pan;
    if (viewportEl && lifelineConfig) {
      const dayY = getDayTickCanvasY(date, lifelineConfig, roadmapLayout, lifelineBoundDates);
      const centerX = roadmapLayout?.centerX ?? 480;
      if (dayY != null) {
        const w = viewportEl.clientWidth;
        const h = viewportEl.clientHeight;
        targetPan = {
          x: w / 2 - centerX * scale,
          y: h / 2 - dayY * scale,
        };
      }
    }

    openDayView({
      date,
      originRect,
      snapshot,
      zoomApi: zoomCanvasRef.current,
      targetPan,
      targetScale: scale,
    });
  }, [
    isLifeline,
    onRefreshProjectActivity,
    lifelineConfig,
    roadmapLayout,
    lifelineBoundDates,
    activeTheme,
    openDayView,
  ]);

  const handleCloseLifelineDay = useCallback(() => {
    closeDayView(zoomCanvasRef.current);
  }, [closeDayView]);

  const lifelineScrollTarget = useMemo(() => {
    if (!isLifeline || !lifelineConfig) return null;
    // Wait until spine matches day grid — otherwise the first pan lands on the wrong date.
    if (!isLifelineSpineReady(lifelineConfig, roadmapLayout)) return null;
    // Prefer the rendered today tick; fall back to spine math (never tip / -420).
    const todayTick = lifelineDayTicks?.find((tick) => tick.isToday);
    const point = todayTick
      ? { x: lineMetrics.centerX, y: todayTick.top }
      : getLifelineTodayScrollPoint(lifelineConfig, roadmapLayout, lineMetrics, lifelineBoundDates);
    if (!point || typeof point.y !== 'number' || Number.isNaN(point.y)) return null;
    // Trigger ONLY on focus/open — never on dayHeight zoom (height/y change),
    // or zoom would yank the viewport back to "today".
    return {
      x: point.x,
      y: point.y,
      trigger: `${lifelineFocusToken || 'init'}`,
    };
  }, [
    isLifeline,
    lifelineConfig,
    lifelineFocusToken,
    lifelineDayTicks,
    roadmapLayout,
    lineMetrics,
    lifelineBoundDates,
  ]);
  const lifelineDefaultPan = useMemo(() => {
    const target = lifelineScrollTarget || (
      lifelineConfig
        ? getLifelineTodayScrollPoint(lifelineConfig, roadmapLayout, lineMetrics, lifelineBoundDates)
        : null
    );
    if (!target) {
      // Mid-spine fallback — never y:-420 (that lands on the future tip / ~today+1y).
      const midY = (roadmapLayout.top || 80) + (roadmapLayout.height || 1000) * 0.5;
      const s = 0.9;
      return { x: 480 - (roadmapLayout.centerX || 480) * s, y: 360 - midY * s };
    }
    const s = 0.9;
    return {
      x: 480 - target.x * s,
      y: 360 - target.y * s,
    };
  }, [lifelineScrollTarget, lifelineConfig, roadmapLayout, lineMetrics, lifelineBoundDates]);
  const roadmapCheckpoints = useMemo(
    () => collectRoadmapCheckpoints(stages, roadmapLayout, lifelinePlanContext),
    [stages, roadmapLayout, lifelinePlanContext]
  );
  const roadmapScrollTarget = useMemo(() => {
    if (isLifeline) return null;
    const point = getRoadmapOpenFocusPoint(roadmapCheckpoints, stages, roadmapLayout);
    if (!point) return null;
    return { ...point, trigger: 'open' };
  }, [isLifeline, roadmapCheckpoints, stages, roadmapLayout]);
  const roadmapDefaultPan = useMemo(() => {
    const target = roadmapScrollTarget;
    const s = ROADMAP_OPEN_SCALE;
    if (!target) return { x: 48, y: 24 };
    return {
      x: 480 - target.x * s,
      y: 360 - target.y * s,
    };
  }, [roadmapScrollTarget]);
  const lifelineHiddenTickRanges = useMemo(
    () => (isLifeline ? collectLifelineHiddenTickRanges(roadmapCheckpoints) : []),
    [isLifeline, roadmapCheckpoints]
  );
  const planWindows = useMemo(
    () => collectPlanWindows(stages, roadmapLayout, undefined, lifelinePlanContext),
    [stages, roadmapLayout, lifelinePlanContext]
  );
  const planDayTicks = useMemo(
    () =>
      isLifeline
        ? null
        : generatePlanDayTicks(stages, getPlanStartY, getPlanEndY, undefined, lifelinePlanContext),
    [stages, lifelinePlanContext, isLifeline]
  );
  const planProgressSegments = useMemo(
    () => collectPlanProgressSegments(stages, roadmapLayout, lifelinePlanContext),
    [stages, roadmapLayout, lifelinePlanContext]
  );
  const planCheckpoints = useMemo(
    () => roadmapCheckpoints.filter((cp) => cp.stagePlanMode),
    [roadmapCheckpoints]
  );
  const boardSize = useMemo(
    () => getBoardSizeWithStickies(stages, canvasIdeas, canvasStickies, roadmapLayout),
    [stages, canvasIdeas, canvasStickies, roadmapLayout]
  );
  const inkSurfaceSize = useMemo(
    () => getInkSurfaceSize(boardSize, canvasInk),
    [boardSize, canvasInk]
  );
  const isPremium = activeTheme.mapStyle === 'premium';

  const nodeLevels = useMemo(
    () => computeNodeLevels(stages, backlog, canvasStickies, canvasConnections),
    [stages, backlog, canvasStickies, canvasConnections]
  );

  const viewportThemeStyle = useMemo(
    () => canvasViewportStyle(activeTheme),
    [activeTheme]
  );

  const toggleFullscreen = useCallback(async () => {
    if (isFullscreen) {
      if (document.fullscreenElement) {
        try {
          await document.exitFullscreen();
        } catch {
          onFullscreenChange?.(false);
        }
      } else {
        onFullscreenChange?.(false);
      }
      return;
    }

    onFullscreenChange?.(true);
    const el = containerRef.current;
    if (el?.requestFullscreen) {
      try {
        await el.requestFullscreen();
      } catch {
        /* in-app fullscreen still active */
      }
    }
  }, [isFullscreen, onFullscreenChange]);

  useEffect(() => {
    const onKey = (e) => {
      if (e.key === 'Escape') {
        if (isFullscreen) {
          if (document.fullscreenElement) {
            document.exitFullscreen().catch(() => {});
          } else {
            onFullscreenChange?.(false);
          }
          return;
        }
        cancelConnectMode();
        setSelectedNodeRef(null);
        setOriginSelected(false);
        setCheckpointModal({
          open: false,
          stageId: null,
          stageTitle: '',
          requirePlanDate: false,
          planStartDate: null,
          planEndDate: null,
        });
      }
      if (e.key === 'f' && !e.metaKey && !e.ctrlKey && !e.altKey) {
        const tag = e.target?.tagName?.toLowerCase();
        if (tag === 'input' || tag === 'textarea' || tag === 'select') return;
        if (e.target?.closest?.('[contenteditable="true"]')) return;
        e.preventDefault();
        toggleFullscreen();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [isFullscreen, onFullscreenChange, toggleFullscreen, cancelConnectMode]);

  const selectedStyle = useMemo(
    () => resolveNodeStyle(selectedNodeRef, stages, backlog, canvasStickies, canvasObstacles, canvasResources, canvasTasks),
    [selectedNodeRef, stages, backlog, canvasStickies, canvasObstacles, canvasResources, canvasTasks]
  );

  const toolbarPosition = useMemo(
    () =>
      selectedNodeRef
        ? getNodeToolbarPosition(
            stages,
            backlog,
            canvasStickies,
            selectedNodeRef,
            canvasObstacles,
            canvasResources,
            canvasTasks,
            roadmapLayout
          )
        : null,
    [
      selectedNodeRef,
      stages,
      backlog,
      canvasStickies,
      canvasObstacles,
      canvasResources,
      canvasTasks,
      roadmapLayout,
    ]
  );

  const handleOpenCheckpointModal = useCallback((stageId) => {
    const stage = stages.find((s) => s.id === stageId);
    setCheckpointModal({
      open: true,
      stageId,
      stageTitle: stage?.title || '',
      requirePlanDate: Boolean(stage?.planMode && stage?.planStartDate && stage?.planEndDate),
      planStartDate: stage?.planStartDate || null,
      planEndDate: stage?.planEndDate || null,
    });
  }, [stages]);

  const handleAddCheckpointFromModal = useCallback((checkpoint) => {
    if (!checkpointModal.stageId) return;
    onAddCheckpoint?.(checkpointModal.stageId, checkpoint);
    setCheckpointModal({
      open: false,
      stageId: null,
      stageTitle: '',
      requirePlanDate: false,
      planStartDate: null,
      planEndDate: null,
    });
  }, [checkpointModal.stageId, onAddCheckpoint]);

  const getInsertBoardPosition = useCallback((size = { w: 200, h: 140 }) => {
    const { scale, pan, viewportRef } = canvasTransformRef.current || {};
    const viewport = viewportRef?.current;
    if (viewport) {
      return boardPointForInsert(
        viewport,
        pan,
        scale,
        lastPointerClientRef.current,
        size,
        { pointerOnCanvas: pointerOnCanvasRef.current }
      );
    }
    return getNextFreeCanvasPosition(
      stages,
      backlog,
      canvasStickies,
      roadmapLayout,
      size,
      canvasPlacementExtras
    );
  }, [stages, backlog, canvasStickies, roadmapLayout, canvasPlacementExtras]);

  const handleAddMilestone = useCallback(() => {
    const pos = getInsertBoardPosition({ w: MAJOR_W, h: CARD_H + 24 });
    const stage = onAddMilestone({
      title: 'New milestone',
      posX: pos.x,
      posY: pos.y,
      onRoadmap: false,
    });
    if (stage) setSelectedNodeRef({ type: 'milestone', id: stage.id });
  }, [getInsertBoardPosition, onAddMilestone]);

  const handleAddObstacle = useCallback(() => {
    const pos = getInsertBoardPosition({ w: 240, h: 120 });
    const obstacle = onAddCanvasObstacle({
      title: 'New obstacle',
      canvasX: pos.x,
      canvasY: pos.y,
      onRoadmap: false,
    });
    if (obstacle) setSelectedNodeRef({ type: 'obstacle', id: obstacle.id });
  }, [getInsertBoardPosition, onAddCanvasObstacle]);

  const handleAddResource = useCallback(() => {
    const pos = getInsertBoardPosition({ w: 240, h: 120 });
    const resource = onAddCanvasResource({
      title: 'New resource',
      canvasX: pos.x,
      canvasY: pos.y,
      onRoadmap: false,
    });
    if (resource) setSelectedNodeRef({ type: 'resource', id: resource.id });
  }, [getInsertBoardPosition, onAddCanvasResource]);

  const handleAddTask = useCallback(() => {
    const pos = getInsertBoardPosition({ w: 240, h: 120 });
    const task = onAddCanvasTask({
      title: 'New task',
      canvasX: pos.x,
      canvasY: pos.y,
      onRoadmap: false,
    });
    if (task) setSelectedNodeRef({ type: 'task', id: task.id });
  }, [getInsertBoardPosition, onAddCanvasTask]);

  const handleAddSticky = useCallback(() => {
    const pos = getInsertBoardPosition({ w: 200, h: 140 });
    const sticky = onAddCanvasSticky({
      text: '',
      canvasX: pos.x,
      canvasY: pos.y,
      onRoadmap: false,
      timelineY: null,
      roadmapSide: null,
    });
    if (sticky) {
      setSelectedNodeRef({ type: 'sticky', id: sticky.id });
      setAutoEditStickyId(sticky.id);
    }
  }, [getInsertBoardPosition, onAddCanvasSticky]);

  const trackPointerClient = useCallback((clientX, clientY) => {
    lastPointerClientRef.current = { x: clientX, y: clientY };
    pointerOnCanvasRef.current = true;
  }, []);

  const handleCanvasPointerLeave = useCallback(() => {
    pointerOnCanvasRef.current = false;
  }, []);

  const getPasteBoardPosition = useCallback((size = { w: 200, h: 140 }) => {
    const { scale, pan, viewportRef } = canvasTransformRef.current || {};
    const viewport = viewportRef?.current;
    if (viewport) {
      return boardPointForInsert(
        viewport,
        pan,
        scale,
        lastPointerClientRef.current,
        size,
        { pointerOnCanvas: pointerOnCanvasRef.current }
      );
    }
    return getInsertBoardPosition(size);
  }, [getInsertBoardPosition]);

  const insertTextAtPointer = useCallback((text, { autoEdit = true } = {}) => {
    const pos = getPasteBoardPosition({ w: 200, h: 140 });
    const sticky = onAddCanvasSticky({
      text: text || '',
      canvasX: pos.x,
      canvasY: pos.y,
      onRoadmap: false,
      timelineY: null,
      roadmapSide: null,
    });
    if (sticky) {
      setSelectedNodeRef({ type: 'sticky', id: sticky.id });
      if (autoEdit) setAutoEditStickyId(sticky.id);
    }
    return sticky;
  }, [getPasteBoardPosition, onAddCanvasSticky]);

  const insertImageFileAtPointer = useCallback(async (file) => {
    try {
      const prepared = await prepareImageFromFile(file);
      const pos = getPasteBoardPosition({ w: prepared.width, h: prepared.height });
      const sticky = onAddCanvasSticky({
        text: '',
        imageSrc: prepared.imageSrc,
        width: prepared.width,
        height: prepared.height,
        canvasX: pos.x,
        canvasY: pos.y,
        canvasStyle: { ...IMAGE_STICKY_STYLE },
        onRoadmap: false,
        timelineY: null,
        roadmapSide: null,
      });
      if (sticky) {
        setSelectedNodeRef({ type: 'sticky', id: sticky.id });
      }
      return sticky;
    } catch (err) {
      console.warn('Could not paste image onto canvas', err);
      return null;
    }
  }, [getPasteBoardPosition, onAddCanvasSticky]);

  const handleToolbarAddImage = useCallback(() => {
    imageFileInputRef.current?.click();
  }, []);

  const handleImageFilePicked = useCallback(async (e) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    await insertImageFileAtPointer(file);
  }, [insertImageFileAtPointer]);

  const handleCanvasDrop = useCallback(async (e) => {
    trackPointerClient(e.clientX, e.clientY);
    const payload = readClipboardPayload(e.dataTransfer);
    if (!payload) return;
    e.preventDefault();
    if (payload.kind === 'image') {
      await insertImageFileAtPointer(payload.file);
    } else if (payload.kind === 'text') {
      insertTextAtPointer(payload.text, { autoEdit: false });
    }
  }, [trackPointerClient, insertImageFileAtPointer, insertTextAtPointer]);

  const handleCanvasDragOver = useCallback((e) => {
    if (!e.dataTransfer) return;
    const types = Array.from(e.dataTransfer.types || []);
    if (types.includes('Files') || types.includes('text/plain')) {
      e.preventDefault();
      e.dataTransfer.dropEffect = 'copy';
      trackPointerClient(e.clientX, e.clientY);
    }
  }, [trackPointerClient]);

  useEffect(() => {
    const onKey = (e) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      if (e.target?.closest?.('input, textarea, select, [contenteditable="true"]')) return;

      const insertAction = matchInsertShortcut(e.key);
      if (!insertAction) return;

      e.preventDefault();
      if (insertAction === 'note') handleAddSticky();
      else if (insertAction === 'milestone') handleAddMilestone();
      else if (insertAction === 'obstacle') handleAddObstacle();
      else if (insertAction === 'resource') handleAddResource();
      else if (insertAction === 'task') handleAddTask();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [handleAddSticky, handleAddMilestone, handleAddObstacle, handleAddResource, handleAddTask]);

  const handleDeleteObstacle = useCallback((obstacleId) => {
    onRemoveCanvasObstacle(obstacleId);
    setSelectedNodeRef(null);
  }, [onRemoveCanvasObstacle]);

  const handleDeleteResource = useCallback((resourceId) => {
    onRemoveCanvasResource(resourceId);
    setSelectedNodeRef(null);
  }, [onRemoveCanvasResource]);

  const handleDeleteTask = useCallback((taskId) => {
    onRemoveCanvasTask(taskId);
    setSelectedNodeRef(null);
  }, [onRemoveCanvasTask]);

  const handleDeleteMilestone = useCallback((stageId) => {
    onRemoveStage(stageId);
    setSelectedNodeRef(null);
  }, [onRemoveStage]);

  const handleDeleteIdea = useCallback((source, stageId, ideaId) => {
    if (source === 'backlog') onRemoveBacklogIdea(ideaId);
    else onRemoveIdea(stageId, ideaId);
    setSelectedNodeRef(null);
  }, [onRemoveBacklogIdea, onRemoveIdea]);

  const handleDeleteSticky = useCallback((stickyId) => {
    onRemoveCanvasSticky(stickyId);
    setSelectedNodeRef(null);
  }, [onRemoveCanvasSticky]);

  const handleMoveTimelineY = useCallback((node, timelineY) => {
    onMoveItemTimelineY?.(node, timelineY);
  }, [onMoveItemTimelineY]);

  const handleSelectFromTimeline = useCallback((node) => {
    setSpineSelected(false);
    setOriginSelected(false);
    if (node.kind === 'milestone') {
      setSelectedNodeRef({ type: 'milestone', id: node.refId });
    } else if (node.kind === 'idea') {
      const isBacklog = String(node.id).includes(':backlog:');
      setSelectedNodeRef({
        type: 'idea',
        id: node.refId,
        source: isBacklog ? 'backlog' : 'stage',
      });
    } else if (node.kind === 'sticky') {
      setSelectedNodeRef({ type: 'sticky', id: node.refId });
    } else if (node.kind === 'obstacle') {
      setSelectedNodeRef({ type: 'obstacle', id: node.refId });
    } else if (node.kind === 'resource') {
      setSelectedNodeRef({ type: 'resource', id: node.refId });
    } else if (node.kind === 'task') {
      setSelectedNodeRef({ type: 'task', id: node.refId });
    } else if (node.kind === 'checkpoint') {
      setSelectedNodeRef({
        type: 'checkpoint',
        id: node.refId,
        stageId: node.stageId,
      });
    }
    cancelConnectMode();
  }, [cancelConnectMode, onSelectStage]);

  const handleSelectSpine = useCallback(() => {
    setSpineSelected(true);
    setOriginSelected(false);
    setSelectedNodeRef(null);
    cancelConnectMode();
  }, [cancelConnectMode]);

  const handleSelectOrigin = useCallback(() => {
    setOriginSelected(true);
    setSpineSelected(false);
    setSelectedNodeRef({ type: 'origin', id: 'origin' });
    cancelConnectMode();
  }, [cancelConnectMode]);

  const handleUpdateOrigin = useCallback((updates) => {
    onMapThemeChange?.({
      roadmap: {
        origin: {
          ...roadmapOrigin,
          ...updates,
        },
      },
    });
  }, [onMapThemeChange, roadmapOrigin]);

  const handleNodeSelect = useCallback((nodeRef) => {
    if (connectFrom) {
      if (sameNodeRef(connectFrom, nodeRef)) {
        cancelConnectMode();
        return;
      }
      onAddCanvasConnection(connectFrom, nodeRef);
      cancelConnectMode();
      return;
    }
    startTransition(() => {
      setSelectedNodeRef(nodeRef);
      setSelectedStrokeIds([]);
      setSpineSelected(false);
      setOriginSelected(nodeRef?.type === 'origin');
    });
  }, [connectFrom, onAddCanvasConnection, cancelConnectMode]);

  const handleMoveIdea = useCallback((source, stageId, ideaId, canvasX, canvasY) => {
    if (source === 'backlog') {
      onMoveBacklogIdeaPosition(ideaId, canvasX, canvasY);
    } else {
      onMoveIdeaPosition(stageId, ideaId, canvasX, canvasY);
    }
  }, [onMoveBacklogIdeaPosition, onMoveIdeaPosition]);

  const handleConnectClick = useCallback((nodeRef) => {
    if (!connectFrom) {
      setConnectFrom(nodeRef);
      setSelectedNodeRef(null);
      setConnectPreviewPos(null);
      return;
    }
    if (sameNodeRef(connectFrom, nodeRef)) {
      cancelConnectMode();
      return;
    }
    onAddCanvasConnection(connectFrom, nodeRef);
    cancelConnectMode();
  }, [connectFrom, onAddCanvasConnection, cancelConnectMode]);

  const handleToggleConnectMode = useCallback(() => {
    if (connectFrom) {
      cancelConnectMode();
      return;
    }
    if (selectedNodeRef) {
      setConnectFrom(selectedNodeRef);
      setSelectedNodeRef(null);
      setConnectPreviewPos(null);
    }
  }, [connectFrom, selectedNodeRef, cancelConnectMode]);

  const handleBoardPointerMove = useCallback((e) => {
    trackPointerClient(e.clientX, e.clientY);
    if (!connectFrom) return;
    const board = e.currentTarget;
    const rect = board.getBoundingClientRect();
    setConnectPreviewPos({
      x: e.clientX - rect.left,
      y: e.clientY - rect.top,
    });
  }, [connectFrom, trackPointerClient]);

  const handleBoardPointerLeave = useCallback(() => {
    setConnectPreviewPos(null);
  }, []);

  const handleStyleUpdate = useCallback((updates) => {
    if (!selectedNodeRef) return;
    onUpdateNodeCanvasStyle(selectedNodeRef, updates);
  }, [selectedNodeRef, onUpdateNodeCanvasStyle]);

  const handleToolbarStartConnect = useCallback(() => {
    if (!selectedNodeRef) return;
    handleConnectClick(selectedNodeRef);
  }, [selectedNodeRef, handleConnectClick]);

  const handleToolbarAddSticky = useCallback(() => {
    if (!selectedNodeRef) return;
    const pos = getNodeToolbarPosition(
      stages,
      backlog,
      canvasStickies,
      selectedNodeRef,
      canvasObstacles,
      canvasResources,
      canvasTasks,
      roadmapLayout
    );
    if (!pos) return;
    const linkToMilestone =
      selectedNodeRef.type === 'milestone' ? selectedNodeRef.id : null;
    const linkToCheckpoint =
      selectedNodeRef.type === 'checkpoint' ? selectedNodeRef.id : null;
    const sticky = onAddCanvasSticky({
      text: '',
      canvasX: pos.left + 40,
      canvasY: pos.top + 20,
      ...(linkToMilestone ? { relatedStageId: linkToMilestone } : {}),
      ...(linkToCheckpoint ? { linkedCheckpointIds: [linkToCheckpoint] } : {}),
    });
    if (sticky) {
      if (linkToMilestone || linkToCheckpoint) {
        onAddCanvasConnection(selectedNodeRef, { type: 'sticky', id: sticky.id });
      }
      setSelectedNodeRef({ type: 'sticky', id: sticky.id });
      setAutoEditStickyId(sticky.id);
    }
  }, [selectedNodeRef, stages, backlog, canvasStickies, canvasObstacles, canvasResources, canvasTasks, roadmapLayout, onAddCanvasSticky, onAddCanvasConnection]);

  const handleToolbarAddImageNearSelection = useCallback(() => {
    if (selectedNodeRef) {
      const pos = getNodeToolbarPosition(
        stages,
        backlog,
        canvasStickies,
        selectedNodeRef,
        canvasObstacles,
        canvasResources,
        canvasTasks,
        roadmapLayout
      );
      if (pos) {
        // Prefer dropping near the selected node when picking from the toolbar.
        const { scale, pan, viewportRef } = canvasTransformRef.current || {};
        if (viewportRef?.current) {
          const rect = viewportRef.current.getBoundingClientRect();
          lastPointerClientRef.current = {
            x: rect.left + pan.x + (pos.left + 40) * (scale || 1),
            y: rect.top + pan.y + (pos.top + 20) * (scale || 1),
          };
        }
      }
    }
    handleToolbarAddImage();
  }, [selectedNodeRef, stages, backlog, canvasStickies, canvasObstacles, canvasResources, canvasTasks, handleToolbarAddImage, roadmapLayout]);

  const handleToolbarAddLink = useCallback(() => {
    if (!selectedNodeRef) return;
    const url = window.prompt('Link URL');
    if (url?.trim()) {
      onUpdateNodeCanvasStyle(selectedNodeRef, { linkUrl: url.trim() });
    }
  }, [selectedNodeRef, onUpdateNodeCanvasStyle]);

  const placeNodeOnCanvas = useCallback((ref, pos) => {
    if (ref.type === 'milestone') onMoveStagePosition(ref.id, pos.x, pos.y);
    else if (ref.type === 'sticky') onMoveCanvasSticky(ref.id, pos.x, pos.y);
    else if (ref.type === 'obstacle') onMoveCanvasObstacle(ref.id, pos.x, pos.y);
    else if (ref.type === 'resource') onMoveCanvasResource(ref.id, pos.x, pos.y);
    else if (ref.type === 'task') onMoveCanvasTask(ref.id, pos.x, pos.y);
    else if (ref.source === 'backlog') onMoveBacklogIdeaPosition(ref.id, pos.x, pos.y);
    else onMoveIdeaPosition(ref.stageId, ref.id, pos.x, pos.y);
  }, [onMoveStagePosition, onMoveCanvasSticky, onMoveCanvasObstacle, onMoveCanvasResource, onMoveCanvasTask, onMoveBacklogIdeaPosition, onMoveIdeaPosition]);

  const deleteSelectedNode = useCallback(() => {
    if (!selectedNodeRef) return;
    const ref = selectedNodeRef;
    if (ref.type === 'milestone') onRemoveStage(ref.id);
    else if (ref.type === 'checkpoint') onRemoveCheckpoint?.(ref.stageId, ref.id);
    else if (ref.type === 'sticky') onRemoveCanvasSticky(ref.id);
    else if (ref.type === 'obstacle') onRemoveCanvasObstacle(ref.id);
    else if (ref.type === 'resource') onRemoveCanvasResource(ref.id);
    else if (ref.type === 'task') onRemoveCanvasTask(ref.id);
    else if (ref.source === 'backlog') onRemoveBacklogIdea(ref.id);
    else onRemoveIdea(ref.stageId, ref.id);
    setSelectedNodeRef(null);
  }, [selectedNodeRef, onRemoveStage, onRemoveCheckpoint, onRemoveCanvasSticky, onRemoveCanvasObstacle, onRemoveCanvasResource, onRemoveCanvasTask, onRemoveBacklogIdea, onRemoveIdea]);

  const handleRemoveSelected = useCallback(() => {
    deleteSelectedNode();
  }, [deleteSelectedNode]);

  const handleToolbarAction = useCallback((action) => {
    if (!selectedNodeRef && !['paste'].includes(action)) return;

    const node = selectedNodeRef
      ? getRegistryNode(
          stages,
          backlog,
          canvasStickies,
          selectedNodeRef,
          canvasObstacles,
          canvasResources,
          canvasTasks,
          roadmapLayout
        )
      : null;
    const bounds = node?.bounds;
    const pasteAnchor = node
      ? offsetPosition(bounds, 'paste')
      : getPasteBoardPosition({ w: 200, h: 140 });

    const connectNewNode = (newRef) => {
      if (selectedNodeRef && newRef) onAddCanvasConnection(selectedNodeRef, newRef);
    };

    switch (action) {
      case 'addChild': {
        const pos = offsetPosition(bounds, 'child');
        const idea = onAddBacklogIdea({
          title: 'New idea',
          canvasStyle: selectedStyle || undefined,
        });
        onMoveBacklogIdeaPosition(idea.id, pos.x, pos.y);
        const newRef = { type: 'idea', id: idea.id, source: 'backlog' };
        connectNewNode(newRef);
        setSelectedNodeRef(newRef);
        break;
      }
      case 'addSibling': {
        const pos = offsetPosition(bounds, 'sibling');
        if (selectedNodeRef.type === 'milestone') {
          const stage = onAddMilestone({
            title: 'New milestone',
            posX: pos.x,
            posY: pos.y,
            canvasStyle: selectedStyle || undefined,
          });
          if (stage) setSelectedNodeRef({ type: 'milestone', id: stage.id });
        } else {
          const idea = onAddBacklogIdea({
            title: 'New idea',
            canvasStyle: selectedStyle || undefined,
          });
          onMoveBacklogIdeaPosition(idea.id, pos.x, pos.y);
          setSelectedNodeRef({ type: 'idea', id: idea.id, source: 'backlog' });
        }
        break;
      }
      case 'addParent': {
        const pos = offsetPosition(bounds, 'parent');
        const stage = onAddMilestone({ title: 'New milestone', posX: pos.x, posY: pos.y });
        if (stage) {
          const newRef = { type: 'milestone', id: stage.id };
          onAddCanvasConnection(newRef, selectedNodeRef);
          setSelectedNodeRef(newRef);
        }
        break;
      }
      case 'selectConnected': {
        const refs = getConnectedRefs(selectedNodeRef, canvasConnections);
        if (refs[0]) setSelectedNodeRef(refs[0]);
        break;
      }
      case 'selectChildren': {
        const refs = getChildRefs(selectedNodeRef, canvasConnections);
        if (refs[0]) setSelectedNodeRef(refs[0]);
        break;
      }
      case 'selectParent': {
        const parent = canvasConnections.find((c) => sameNodeRef(c.to, selectedNodeRef));
        if (parent) setSelectedNodeRef(parent.from);
        break;
      }
      case 'copy':
      case 'cut': {
        if (!node) return;
        const clipText = node.entity?.imageSrc
          ? `__nm_img__:${node.entity.id}`
          : String(node.entity?.text || node.entity?.title || '');
        setNodeClipboard({
          mode: action === 'cut' ? 'cut' : 'copy',
          ref: selectedNodeRef,
          entity: node.entity,
          style: selectedStyle,
          clipText,
        });
        if (clipText && navigator.clipboard?.writeText) {
          navigator.clipboard.writeText(clipText).catch(() => {});
        }
        if (action === 'cut') {
          deleteSelectedNode();
        }
        break;
      }
      case 'paste': {
        if (!nodeClipboard) return;
        if (nodeClipboard.mode === 'cut') {
          placeNodeOnCanvas(nodeClipboard.ref, pasteAnchor);
          setSelectedNodeRef(nodeClipboard.ref);
          setNodeClipboard(null);
          break;
        }
        const clip = nodeClipboard;
        if (clip.ref.type === 'milestone') {
          const stage = onAddMilestone({
            title: clip.entity.title || 'Copy',
            posX: pasteAnchor.x,
            posY: pasteAnchor.y,
            canvasStyle: clip.style || undefined,
          });
          if (stage) setSelectedNodeRef({ type: 'milestone', id: stage.id });
        } else if (clip.ref.type === 'sticky') {
          const sticky = onAddCanvasSticky({
            text: clip.entity.text || '',
            imageSrc: clip.entity.imageSrc || null,
            width: clip.entity.width,
            height: clip.entity.height,
            canvasX: pasteAnchor.x,
            canvasY: pasteAnchor.y,
            canvasStyle: clip.style || undefined,
          });
          if (sticky) setSelectedNodeRef({ type: 'sticky', id: sticky.id });
        } else {
          const idea = onAddBacklogIdea({
            title: clip.entity.title || 'Copy',
            canvasStyle: clip.style || undefined,
          });
          onMoveBacklogIdeaPosition(idea.id, pasteAnchor.x, pasteAnchor.y);
          setSelectedNodeRef({ type: 'idea', id: idea.id, source: 'backlog' });
        }
        break;
      }
      case 'copyStyle':
        setStyleClipboard(selectedStyle || null);
        break;
      case 'pasteStyle':
        if (styleClipboard && selectedNodeRef) {
          onUpdateNodeCanvasStyle(selectedNodeRef, styleClipboard);
        }
        break;
      case 'resetStyle':
        if (selectedNodeRef) onUpdateNodeCanvasStyle(selectedNodeRef, { resetStyle: true });
        break;
      case 'detach':
        deleteSelectedNode();
        break;
      case 'resetPosition':
        if (selectedNodeRef) placeNodeOnCanvas(selectedNodeRef, { x: ORIGIN_X, y: ORIGIN_Y });
        break;
      case 'delete':
        deleteSelectedNode();
        break;
      default:
        break;
    }
  }, [
    selectedNodeRef,
    stages,
    backlog,
    canvasStickies,
    canvasConnections,
    selectedStyle,
    nodeClipboard,
    styleClipboard,
    onAddBacklogIdea,
    onMoveBacklogIdeaPosition,
    onAddMilestone,
    onAddCanvasConnection,
    onAddCanvasSticky,
    placeNodeOnCanvas,
    onUpdateNodeCanvasStyle,
    deleteSelectedNode,
    getPasteBoardPosition,
  ]);

  useEffect(() => {
    const onPaste = (e) => {
      if (isEditablePasteTarget(e.target)) return;

      const payload = readClipboardPayload(e.clipboardData);
      const clip = nodeClipboardRef.current;

      if (payload?.kind === 'image') {
        e.preventDefault();
        insertImageFileAtPointer(payload.file);
        return;
      }

      if (payload?.kind === 'text') {
        const clipText = clip?.clipText ?? clip?.entity?.text ?? clip?.entity?.title ?? '';
        if (clip && payload.text === String(clipText)) {
          e.preventDefault();
          handleToolbarAction('paste');
          return;
        }
        // Ignore internal image-copy markers if clipboard state was cleared.
        if (payload.text.startsWith('__nm_img__:')) {
          e.preventDefault();
          if (clip) handleToolbarAction('paste');
          return;
        }
        e.preventDefault();
        insertTextAtPointer(payload.text, { autoEdit: false });
        return;
      }

      if (clip) {
        e.preventDefault();
        handleToolbarAction('paste');
      }
    };

    window.addEventListener('paste', onPaste);
    return () => window.removeEventListener('paste', onPaste);
  }, [handleToolbarAction, insertImageFileAtPointer, insertTextAtPointer]);

  useEffect(() => {
    if (!selectedNodeRef) return;

    const onKey = (e) => {
      if (e.target.closest('input, textarea, select, [contenteditable="true"]')) return;

      const mod = e.ctrlKey || e.metaKey;
      if (mod && e.altKey && e.key.toLowerCase() === 'c') {
        e.preventDefault();
        handleToolbarAction('copyStyle');
        return;
      }
      if (mod && e.altKey && e.key.toLowerCase() === 'v') {
        e.preventDefault();
        handleToolbarAction('pasteStyle');
        return;
      }
      if (mod && e.key.toLowerCase() === 'x') {
        e.preventDefault();
        handleToolbarAction('cut');
        return;
      }
      if (mod && e.key.toLowerCase() === 'c') {
        e.preventDefault();
        handleToolbarAction('copy');
        return;
      }
      // Ctrl/Cmd+V is handled by the window paste listener (OS clipboard + node clipboard).
      if (e.key === 'Delete' || e.key === 'Backspace') {
        e.preventDefault();
        handleToolbarAction('delete');
        return;
      }
      if (e.key.toLowerCase() === 'd' && !mod) {
        e.preventDefault();
        handleToolbarAction('detach');
        return;
      }
      if (e.key === 'Tab' && !e.shiftKey) {
        e.preventDefault();
        handleToolbarAction('addChild');
        return;
      }
      if (e.key === 'Tab' && e.shiftKey) {
        e.preventDefault();
        handleToolbarAction('addParent');
        return;
      }
      if (e.key === 'Enter' && !mod) {
        e.preventDefault();
        handleToolbarAction('addSibling');
      }
    };

    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [selectedNodeRef, handleToolbarAction]);

  const handleApplyThemeToSelected = useCallback((updates) => {
    if (!selectedNodeRef) return;
    onUpdateNodeCanvasStyle(selectedNodeRef, updates);
  }, [selectedNodeRef, onUpdateNodeCanvasStyle]);

  const handleMapThemeChange = useCallback((updates) => {
    onMapThemeChange?.(updates);
  }, [onMapThemeChange]);

  const lifelineDayHeight =
    activeTheme?.lifeline?.dayHeight ?? DEFAULT_LIFELINE_CONFIG.dayHeight;

  const handleTransformChange = useCallback((transform) => {
    transformRef.current = transform;
    const scale = transform?.scale || 1;
    if (isLifeline) {
      setLifelineCssScale((prev) => (prev === scale ? prev : scale));
      const dayPercent = getLifelineZoomPercent({ lifeline: { dayHeight: lifelineDayHeight } });
      const nextPercent = scale < 0.995 ? Math.round(scale * 100) : dayPercent;
      setZoomPercent((prev) => (prev === nextPercent ? prev : nextPercent));
      return;
    }
    const nextPercent = Math.round(scale * 100);
    setZoomPercent((prev) => (prev === nextPercent ? prev : nextPercent));
  }, [isLifeline, lifelineDayHeight]);

  useEffect(() => {
    if (!isLifeline) return;
    const dayPercent = getLifelineZoomPercent({ lifeline: { dayHeight: lifelineDayHeight } });
    const scale = transformRef.current?.scale || 1;
    const nextPercent = scale < 0.995 ? Math.round(scale * 100) : dayPercent;
    setZoomPercent((prev) => (prev === nextPercent ? prev : nextPercent));
  }, [isLifeline, lifelineDayHeight]);

  const resolveLifelineDateAtClientPoint = useCallback(
    (clientX, clientY) => {
      const ctx = transformRef.current;
      const viewport = ctx?.viewportRef?.current;
      if (!viewport) return null;

      const base = activeTheme || DEFAULT_MAP_THEME;
      const rect = viewport.getBoundingClientRect();
      const { y: pointY } = viewportClientPoint(
        clientX ?? rect.left + viewport.clientWidth / 2,
        clientY ?? rect.top + viewport.clientHeight / 2,
        viewport
      );
      const canvasY = (pointY - (ctx.pan?.y || 0)) / (ctx.scale || 1);
      const spine = getLifelineSpineMetrics(roadmapLayout);
      const metrics = {
        bottomY: spine.bottom,
        top: spine.top,
        height: spine.height,
        centerX: spine.centerX,
      };
      return {
        date: timelineYToDate(
          canvasY,
          getLifelineConfig(base, lifelineBoundDates),
          metrics,
          roadmapLayout
        ),
        pointY,
        canvasY,
      };
    },
    [activeTheme, lifelineBoundDates, roadmapLayout]
  );

  const applyLifelineDensityZoom = useCallback(
    (zoomIn, clientX, clientY, setPanFn) => {
      const ctx = transformRef.current;
      const viewport = ctx?.viewportRef?.current;
      if (!viewport) return false;

      const base = activeTheme || DEFAULT_MAP_THEME;
      const resolved = resolveLifelineDateAtClientPoint(clientX, clientY);
      if (!resolved) return false;
      const { date: anchorDate, pointY } = resolved;

      const result = applyLifelineDayHeightZoom(base, lifelineBoundDates, zoomIn, anchorDate);
      if (!result) return false;

      onMapThemeChange?.({
        lifeline: result.mapTheme.lifeline,
        roadmap: result.mapTheme.roadmap,
      });
      if (result.anchorY != null) {
        const nextPan = {
          x: ctx.pan.x,
          y: pointY - result.anchorY * (ctx.scale || 1),
        };
        if (typeof setPanFn === 'function') setPanFn(nextPan);
        else zoomCanvasRef.current?.setPan?.(nextPan);
      }
      return true;
    },
    [activeTheme, lifelineBoundDates, onMapThemeChange, resolveLifelineDateAtClientPoint]
  );

  const enterDayViewFromZoom = useCallback(
    (clientX, clientY) => {
      if (dayView.isActive) return true;
      const resolved = resolveLifelineDateAtClientPoint(clientX, clientY);
      const date = resolved?.date;
      if (!date) return false;
      const tickEl =
        typeof document !== 'undefined'
          ? document.querySelector(`.lifeline-day-tick[data-date="${date}"]`)
          : null;
      handleOpenLifelineDay(date, tickEl);
      return true;
    },
    [dayView.isActive, resolveLifelineDateAtClientPoint, handleOpenLifelineDay]
  );

  const handleLifelineWheel = useCallback(
    (e, ctx) => {
      if (!isLifeline || !(e.ctrlKey || e.metaKey)) return false;

      const zoomIn = e.deltaY < 0;
      const scale = ctx.scale || 1;
      const dayHeight = activeTheme?.lifeline?.dayHeight ?? DEFAULT_LIFELINE_CONFIG.dayHeight;

      if (dayView.isActive) {
        if (!zoomIn) handleCloseLifelineDay();
        return true;
      }

      if (zoomIn && scale >= 0.995) {
        const stepped = applyLifelineDensityZoom(true, e.clientX, e.clientY, ctx.setPan);
        if (stepped) return true;
        if (dayHeight >= LIFELINE_ZOOM.dayViewEnterAt) {
          return enterDayViewFromZoom(e.clientX, e.clientY);
        }
        return true;
      }
      if (!zoomIn && dayHeight > DEFAULT_LIFELINE_CONFIG.dayHeight) {
        return applyLifelineDensityZoom(false, e.clientX, e.clientY, ctx.setPan);
      }

      return false;
    },
    [
      isLifeline,
      activeTheme,
      dayView.isActive,
      applyLifelineDensityZoom,
      enterDayViewFromZoom,
      handleCloseLifelineDay,
    ]
  );

  const handleZoomIn = useCallback(() => {
    if (!isLifeline) {
      zoomCanvasRef.current?.zoomBy(0.1);
      return;
    }
    if (dayView.isActive) return;
    const scale = transformRef.current?.scale || 1;
    if (scale < 0.995) {
      zoomCanvasRef.current?.zoomBy(0.1);
      return;
    }
    if (applyLifelineDensityZoom(true)) return;
    const dayHeight = activeTheme?.lifeline?.dayHeight ?? DEFAULT_LIFELINE_CONFIG.dayHeight;
    if (dayHeight >= LIFELINE_ZOOM.dayViewEnterAt) {
      enterDayViewFromZoom();
    }
  }, [isLifeline, dayView.isActive, applyLifelineDensityZoom, activeTheme, enterDayViewFromZoom]);

  const handleZoomOut = useCallback(() => {
    if (!isLifeline) {
      zoomCanvasRef.current?.zoomBy(-0.1);
      return;
    }
    if (dayView.isActive) {
      handleCloseLifelineDay();
      return;
    }
    const dayHeight = activeTheme?.lifeline?.dayHeight ?? DEFAULT_LIFELINE_CONFIG.dayHeight;
    if (dayHeight > DEFAULT_LIFELINE_CONFIG.dayHeight) {
      applyLifelineDensityZoom(false);
      return;
    }
    zoomCanvasRef.current?.zoomBy(-0.1);
  }, [isLifeline, dayView.isActive, activeTheme, applyLifelineDensityZoom, handleCloseLifelineDay]);

  const handleResetZoom = useCallback(() => {
    if (isLifeline) {
      const synced = resetLifelineDayZoom(activeTheme || DEFAULT_MAP_THEME, lifelineBoundDates);
      onMapThemeChange?.({ lifeline: synced.lifeline, roadmap: synced.roadmap });
    }
    zoomCanvasRef.current?.resetZoomTo100();
  }, [isLifeline, activeTheme, lifelineBoundDates, onMapThemeChange]);

  const isEmptyBoard =
    canvasStages.length === 0 && canvasIdeas.length === 0 && canvasStickiesOnBoard.length === 0;

  const inkInteractionMode = platform.isMobile
    ? 'pan'
    : drawTool === 'eraser'
      ? 'erase'
      : drawTool === 'pen'
        ? 'draw'
        : drawTool === 'select'
          ? 'select'
          : 'pan';

  const handleRecognizeInk = useCallback(async () => {
    const ids = selectedStrokeIds.length
      ? selectedStrokeIds
      : canvasInk.map((s) => s.id);
    const strokes = canvasInk.filter((s) => ids.includes(s.id));
    if (!strokes.length) {
      setConvertModal({
        open: true,
        loading: false,
        error: 'Γράψε κάτι πρώτα ή επίλεξε περιοχή με Select.',
        text: '',
        convertType: 'sticky',
        previewUrl: null,
        strokeIds: [],
        position: null,
        removeInk: true,
      });
      return;
    }

    const bounds = getStrokesRectBounds(strokes, 40);
    if (!bounds) return;

    setRecognizingInk(true);
    setConvertModal({
      open: true,
      loading: true,
      error: null,
      text: '',
      convertType: 'sticky',
      previewUrl: null,
      strokeIds: ids,
      position: { x: bounds.centerX, y: bounds.centerY },
      removeInk: true,
    });

    try {
      const preview = strokesToPngDataUrl(strokes, bounds);
      const { text, suggestedType } = await recognizeHandwriting(preview);
      setConvertModal((m) => ({
        ...m,
        loading: false,
        text,
        convertType: suggestedType,
        previewUrl: preview,
      }));
    } catch (err) {
      setConvertModal((m) => ({
        ...m,
        loading: false,
        error: err.message || 'Αποτυχία αναγνώρισης',
      }));
    } finally {
      setRecognizingInk(false);
    }
  }, [selectedStrokeIds, canvasInk]);

  const handleConvertConfirm = useCallback(() => {
    if (!convertModal.text?.trim()) return;
    applyInkConversion({
      type: convertModal.convertType,
      text: convertModal.text,
      position: convertModal.position,
      addStage: onAddMilestone,
      addCanvasSticky: onAddCanvasSticky,
      addBacklogIdea: onAddBacklogIdea,
      addNote: onAddNote,
      addGoal: onAddGoal,
    });
    if (convertModal.removeInk && convertModal.strokeIds?.length) {
      onRemoveCanvasInkStrokes(convertModal.strokeIds);
    }
    setSelectedStrokeIds([]);
    setConvertModal((m) => ({ ...m, open: false }));
  }, [
    convertModal,
    onAddMilestone,
    onAddCanvasSticky,
    onAddBacklogIdea,
    onAddNote,
    onAddGoal,
    onRemoveCanvasInkStrokes,
  ]);

  return (
    <section
      ref={containerRef}
      className={`roadmap-canvas-view${isFullscreen ? ' roadmap-canvas-view--fullscreen' : ''}${dayView.isActive ? ' roadmap-canvas-view--day-view' : ''}`}
      data-day-view-phase={dayView.phase}
    >
      <input
        ref={imageFileInputRef}
        type="file"
        accept="image/*"
        className="sr-only"
        aria-hidden="true"
        tabIndex={-1}
        onChange={handleImageFilePicked}
      />
      {archiveCelebration && (
        <ArchiveCelebration
          title={archiveCelebration.title}
          subtitle={archiveCelebration.subtitle}
          completedAt={archiveCelebration.completedAt}
          archivedAt={archiveCelebration.archivedAt}
          onDone={() => setArchiveCelebration(null)}
        />
      )}
      {connectFrom && (
        <p className="roadmap-canvas__connect-hint roadmap-canvas__connect-hint--floating">
          Σύνδεση… κάνε κλικ στο στοιχείο-στόχο ή Esc για ακύρωση
        </p>
      )}

      <div className="roadmap-canvas-panel">
        <CanvasTopBar
          hasSelection={Boolean(selectedNodeRef)}
          isConnecting={Boolean(connectFrom)}
          canConnect={Boolean(selectedNodeRef) || Boolean(connectFrom)}
          onToggleConnect={handleToggleConnectMode}
          mapTheme={activeTheme}
          onMapThemeChange={handleMapThemeChange}
          onAddMilestone={handleAddMilestone}
          onAddTask={handleAddTask}
          onAddObstacle={handleAddObstacle}
          onAddResource={handleAddResource}
          onAddSticky={handleAddSticky}
          onAddImage={handleToolbarAddImage}
          onRemoveSelected={handleRemoveSelected}
          onAddChild={() => handleToolbarAction('addChild')}
          onAddSibling={() => handleToolbarAction('addSibling')}
          onAddParent={() => handleToolbarAction('addParent')}
          onApplyThemeToSelected={handleApplyThemeToSelected}
          onAutoLayout={onApplyAutoLayout}
          syncing={syncing}
          hasUnsavedChanges={hasUnsavedChanges}
          onSave={onSave}
          drawTool={drawTool}
          drawColor={drawColor}
          drawSize={drawSize}
          onDrawToolChange={setDrawTool}
          onDrawColorChange={setDrawColor}
          onDrawSizeChange={setDrawSize}
          onClearInk={onClearCanvasInk}
          onUndoInk={onUndo}
          onRecognizeInk={handleRecognizeInk}
          recognizingInk={recognizingInk}
          selectedInkCount={selectedStrokeIds.length}
        />

      <div
        className="roadmap-canvas__stage"
        onPointerMove={(e) => trackPointerClient(e.clientX, e.clientY)}
        onPointerLeave={handleCanvasPointerLeave}
        onDragOver={handleCanvasDragOver}
        onDrop={handleCanvasDrop}
      >
          {brainOrb}
          {onOpenWorkspace && (
            <button
              type="button"
              className="workspace-nav-btn workspace-nav-btn--canvas"
              onClick={onOpenWorkspace}
              title="Workspace"
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" aria-hidden="true">
                <rect x="3" y="3" width="7" height="7" rx="1.5" />
                <rect x="14" y="3" width="7" height="7" rx="1.5" />
                <rect x="3" y="14" width="7" height="7" rx="1.5" />
                <rect x="14" y="14" width="7" height="7" rx="1.5" />
              </svg>
              <span>Workspace</span>
            </button>
          )}
          <ZoomCanvas
            ref={zoomCanvasRef}
            key={isLifeline ? 'lifeline-v4' : 'roadmap'}
            className="roadmap-canvas zoom-canvas--no-toolbar"
            defaultScale={isLifeline ? 0.9 : ROADMAP_OPEN_SCALE}
            defaultPan={isLifeline ? lifelineDefaultPan : roadmapDefaultPan}
            minScale={isLifeline ? LIFELINE_ZOOM.minScale : 0.25}
            maxScale={isLifeline ? LIFELINE_ZOOM.maxScale : 2}
            interceptWheel={isLifeline ? handleLifelineWheel : undefined}
            showToolbar={false}
            viewportStyle={viewportThemeStyle}
            onTransformChange={handleTransformChange}
            interactionMode={inkInteractionMode}
            onInkPointerDown={(e) => inkDownRef.current?.(e)}
            onSelectPointerDown={(e) => selectDownRef.current?.(e)}
            onInkDragPointerDown={(e) => inkDragDownRef.current?.(e)}
            scrollToCanvasPoint={isLifeline ? lifelineScrollTarget : roadmapScrollTarget}
            panExcludeSelector=".milestone-canvas-card, .idea-canvas-card, .sticky-note-card, .obstacle-canvas-card, .resource-canvas-card, .task-canvas-card, .checkpoint-roadmap-item, .canvas-floating-toolbar, .canvas-top-bar, .drawing-toolbar, .roadmap-center-line, .roadmap-row, .roadmap__header, .roadmap-card, .roadmap-node, .roadmap-canvas__fab-dock, .workspace-nav-btn, .brain-orb, .add-milestone-form, .canvas-connection__hit"
          >
            <CanvasTransformBridge bridgeRef={canvasTransformRef} />
            <InkDragHost
              strokes={canvasInk}
              selectedStrokeIds={selectedStrokeIds}
              onSelectionChange={setSelectedStrokeIds}
              onMoveStrokes={onMoveCanvasInkStrokes}
              onClearNodeSelection={() => setSelectedNodeRef(null)}
              bindDownRef={inkDragDownRef}
            />
            <CanvasBoard
            canvasStages={canvasStages}
            canvasIdeas={canvasIdeas}
            canvasStickies={canvasStickiesOnBoard}
            canvasObstacles={canvasObstaclesOnBoard}
            canvasResources={canvasResourcesOnBoard}
            canvasTasks={canvasTasksOnBoard}
            categoryOptions={categoryOptions}
            boardSize={boardSize}
            connections={canvasConnections}
            stages={stages}
            backlog={backlog}
            stickies={canvasStickies}
            obstacles={canvasObstacles}
            resources={canvasResources}
            tasks={canvasTasks}
            connectFrom={connectFrom}
            connectModeActive={Boolean(connectFrom)}
            connectPreviewPos={connectPreviewPos}
            onBoardPointerMove={handleBoardPointerMove}
            onBoardPointerLeave={handleBoardPointerLeave}
            selectedNodeRef={selectedNodeRef}
            selectedStyle={selectedStyle}
            toolbarPosition={toolbarPosition}
            mapTheme={activeTheme}
            nodeLevels={nodeLevels}
            onSelectStage={onSelectStage}
            onOpenCheckpointNotes={handleOpenCheckpointNotes}
            onEditCheckpoint={handleOpenEditCheckpoint}
            onUpdateStage={onUpdateStage}
            onOpenCheckpointModal={handleOpenCheckpointModal}
            onUpdateCheckpoint={onUpdateCheckpoint}
            onRemoveCheckpoint={onRemoveCheckpoint}
            onReorderCheckpoint={onReorderCheckpoint}
            onMoveStage={onMoveStagePosition}
            onMoveIdea={handleMoveIdea}
            onMoveSticky={onMoveCanvasSticky}
            onUpdateSticky={onUpdateCanvasSticky}
            onMoveObstacle={onMoveCanvasObstacle}
            onUpdateObstacle={onUpdateCanvasObstacle}
            onMoveResource={onMoveCanvasResource}
            onUpdateResource={onUpdateCanvasResource}
            onMoveTask={onMoveCanvasTask}
            onUpdateTask={onUpdateCanvasTask}
            onRemoveIdeaFromCanvas={onClearIdeaFromCanvas}
            onRemoveStageFromCanvas={onClearStageFromCanvas}
            onClearStickyFromCanvas={onClearStickyFromCanvas}
            onConnectClick={handleConnectClick}
            onNodeSelect={handleNodeSelect}
            onRemoveConnection={onRemoveCanvasConnection}
            onStyleUpdate={handleStyleUpdate}
            onToolbarStartConnect={handleToolbarStartConnect}
            onToolbarAddSticky={handleToolbarAddSticky}
            onToolbarAddImage={handleToolbarAddImageNearSelection}
            onToolbarAddLink={handleToolbarAddLink}
            onToolbarClose={() => setSelectedNodeRef(null)}
            onToolbarAction={handleToolbarAction}
            canPasteNode={Boolean(nodeClipboard)}
            canPasteStyle={Boolean(styleClipboard)}
            roadmapLayout={roadmapLayout}
            lineMetrics={lineMetrics}
            roadmapCheckpoints={roadmapCheckpoints}
            isPremium={isPremium}
            onArchiveCheckpoint={handleToggleCheckpointComplete}
            onDeleteMilestone={handleDeleteMilestone}
            onDeleteIdea={handleDeleteIdea}
            onDeleteSticky={handleDeleteSticky}
            onDeleteObstacle={handleDeleteObstacle}
            onDeleteResource={handleDeleteResource}
            onDeleteTask={handleDeleteTask}
            onMoveTimelineY={handleMoveTimelineY}
            onSelectMilestone={handleSelectFromTimeline}
            spineSelected={spineSelected}
            onSelectSpine={handleSelectSpine}
            onApplySpineMove={onApplyRoadmapSpine}
            onResizeSpine={onResizeRoadmapSpine}
            origin={roadmapOrigin}
            originSelected={originSelected}
            onSelectOrigin={handleSelectOrigin}
            onUpdateOrigin={handleUpdateOrigin}
            planWindows={planWindows}
            planDayTicks={planDayTicks}
            planProgressSegments={planProgressSegments}
            planCheckpoints={planCheckpoints}
            onOpenPlanPanel={handleOpenPlanPanel}
            canvasInk={canvasInk}
            inkSurfaceSize={inkSurfaceSize}
            inkTool={platform.isMobile ? 'pan' : drawTool}
            inkColor={drawColor}
            inkSize={drawSize}
            onAddInkStroke={onAddCanvasInkStroke}
            onRemoveInkStrokes={onRemoveCanvasInkStrokes}
            inkBindDownRef={inkDownRef}
            selectedStrokeIds={selectedStrokeIds}
            selectBindRef={selectDownRef}
            onInkSelectionChange={setSelectedStrokeIds}
            autoEditStickyId={autoEditStickyId}
            onAutoEditStickyConsumed={() => setAutoEditStickyId(null)}
            isLifeline={isLifeline}
            lifelineConfig={lifelineConfig}
            lifelineDayTicks={lifelineDayTicks}
            lifelineAnchorsWithPos={lifelineAnchorsWithPos}
            onUpdateLifelineAnchor={onUpdateLifelineAnchor}
            onAssignLifelineToday={onAssignLifelineToday}
            onOpenLifelineProject={onOpenLifelineProject}
            lifelineDays={lifelineDays}
            onDayClick={handleOpenLifelineDay}
            lifelinePlanContext={lifelinePlanContext}
            lifelinePlanDateLabels={lifelinePlanDateLabels}
            lifelineHiddenTickRanges={lifelineHiddenTickRanges}
            lifelineZoomLevel={lifelineZoomLevel}
            lifelineDayBands={lifelineDayBands}
            selectedDayDate={dayView.date}
            dayViewPhase={dayView.phase}
            routineTemplates={(mapTheme || activeTheme)?.lifeline?.routineTemplates ?? []}
          />
          </ZoomCanvas>

          <div className={`roadmap-canvas__fab-dock${platform.isMobile ? ' roadmap-canvas__fab-dock--mobile' : ''}`}>
            <div className="roadmap-canvas__spacing" title={isLifeline && lifelineZoomMeta ? lifelineZoomMeta.description : 'Zoom'}>
              <button
                type="button"
                className="roadmap-canvas__fab-btn roadmap-canvas__fab-btn--sm"
                onClick={handleZoomOut}
                title="Zoom out"
                aria-label="Zoom out"
              >
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
                  <path d="M5 12h14" />
                </svg>
              </button>
              <button
                type="button"
                className={`roadmap-canvas__spacing-label roadmap-canvas__spacing-label--btn${isLifeline && lifelineZoomMeta && !platform.isMobile ? ' roadmap-canvas__spacing-label--lifeline' : ''}`}
                onClick={handleResetZoom}
                title={
                  isLifeline && lifelineZoomMeta
                    ? `${lifelineZoomMeta.label} — ${lifelineZoomMeta.description}`
                    : 'Επαναφορά στο 100%'
                }
                aria-label="Reset zoom to 100 percent"
              >
                {isLifeline && lifelineZoomMeta && !platform.isMobile ? (
                  <>
                    <span className="roadmap-canvas__spacing-level">{lifelineZoomMeta.shortLabel}</span>
                    <span className="roadmap-canvas__spacing-sublabel">{zoomPercent}%</span>
                  </>
                ) : (
                  `${zoomPercent}%`
                )}
              </button>
              <button
                type="button"
                className="roadmap-canvas__fab-btn roadmap-canvas__fab-btn--sm"
                onClick={handleZoomIn}
                title="Zoom in"
                aria-label="Zoom in"
              >
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
                  <path d="M12 5v14" />
                  <path d="M5 12h14" />
                </svg>
              </button>
            </div>
            {!platform.isMobile && (
              <>
            <button
              type="button"
              className={`roadmap-canvas__fab-btn${isFullscreen ? ' roadmap-canvas__fab-btn--active' : ''}`}
              onClick={toggleFullscreen}
              title={isFullscreen ? 'Exit full screen (Esc)' : 'Full screen (F)'}
              aria-label={isFullscreen ? 'Exit full screen' : 'Full screen'}
            >
              {isFullscreen ? (
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <path d="M8 3v3a2 2 0 0 1-2 2H3" />
                  <path d="M21 8h-3a2 2 0 0 1-2-2V3" />
                  <path d="M3 16h3a2 2 0 0 1 2 2v3" />
                  <path d="M16 21v-3a2 2 0 0 1 2-2h3" />
                </svg>
              ) : (
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <path d="M15 3h6v6" />
                  <path d="M9 21H3v-6" />
                  <path d="M21 3l-7 7" />
                  <path d="M3 21l7-7" />
                </svg>
              )}
            </button>
            <button
              type="button"
              className="roadmap-canvas__fab-btn"
              onClick={onApplyAutoLayout}
              title="Auto-layout board"
              aria-label="Auto-layout board"
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <rect x="3" y="3" width="7" height="7" rx="1" />
                <rect x="14" y="3" width="7" height="7" rx="1" />
                <rect x="3" y="14" width="7" height="7" rx="1" />
                <path d="M17.5 14v7" />
                <path d="M14 17.5h7" />
              </svg>
            </button>
              </>
            )}
          </div>
        </div>

      {isEmptyBoard && (
        <div className="roadmap-canvas__empty">
          <p className="roadmap-canvas__empty-title">Άδειο roadmap</p>
          <p className="roadmap-canvas__empty-hint">
            Πρόσθεσε το πρώτο σου milestone για να ξεκινήσεις.
          </p>
          <button
            type="button"
            className="btn btn--primary"
            onClick={handleAddMilestone}
          >
            + Πρώτο Milestone
          </button>
        </div>
      )}

      <LifelineDayModal
        open={dayView.isOpen}
        date={dayView.date}
        phase={dayView.phase}
        originRect={dayView.originRect}
        lifelineDays={lifelineDays}
        selfHubDays={selfHubDays}
        routineTemplates={(mapTheme || activeTheme)?.lifeline?.routineTemplates ?? []}
        projectActivity={projectActivity}
        onUpdateDay={onUpdateLifelineDay}
        onUpdateRoutineTemplates={(templates) => {
          handleMapThemeChange({
            lifeline: {
              ...(mapTheme?.lifeline || activeTheme?.lifeline || {}),
              routineTemplates: templates,
            },
          });
        }}
        onClose={handleCloseLifelineDay}
      />
      </div>

      <AddCheckpointModal
        open={checkpointModal.open}
        stageTitle={checkpointModal.stageTitle}
        categoryOptions={categoryOptions}
        requirePlanDate={checkpointModal.requirePlanDate}
        planStartDate={checkpointModal.planStartDate}
        planEndDate={checkpointModal.planEndDate}
        onAdd={handleAddCheckpointFromModal}
        onClose={() => setCheckpointModal({
          open: false,
          stageId: null,
          stageTitle: '',
          requirePlanDate: false,
          planStartDate: null,
          planEndDate: null,
        })}
      />

      <CheckpointNotesModal
        open={checkpointNotesModal.open}
        stageId={checkpointNotesModal.stageId}
        checkpointId={checkpointNotesModal.checkpointId}
        stages={stages}
        mapTheme={activeTheme}
        onUpdateCheckpoint={onUpdateCheckpoint}
        onClose={handleCloseCheckpointNotes}
        onUndo={onUndo}
      />

      <CheckpointPlanPanel
        open={checkpointPlanPanel.open}
        stageId={checkpointPlanPanel.stageId}
        checkpointId={checkpointPlanPanel.checkpointId}
        stages={stages}
        onUpdateCheckpoint={onUpdateCheckpoint}
        onClose={handleClosePlanPanel}
      />

      <EditCheckpointModal
        open={editCheckpointModal.open}
        checkpoint={editCheckpointTarget?.checkpoint}
        stageTitle={editCheckpointTarget?.stage?.title}
        categoryOptions={categoryOptions}
        requirePlanDate={Boolean(
          editCheckpointTarget?.stage?.planMode
          && editCheckpointTarget?.stage?.planStartDate
          && editCheckpointTarget?.stage?.planEndDate
        )}
        planStartDate={editCheckpointTarget?.stage?.planStartDate}
        planEndDate={editCheckpointTarget?.stage?.planEndDate}
        onSave={handleSaveEditCheckpoint}
        onClose={handleCloseEditCheckpoint}
      />

      <InkConvertModal
        open={convertModal.open}
        loading={convertModal.loading}
        error={convertModal.error}
        text={convertModal.text}
        convertType={convertModal.convertType}
        previewUrl={convertModal.previewUrl}
        removeInk={convertModal.removeInk}
        onTextChange={(text) => setConvertModal((m) => ({ ...m, text }))}
        onTypeChange={(convertType) => setConvertModal((m) => ({ ...m, convertType }))}
        onRemoveInkChange={(removeInk) => setConvertModal((m) => ({ ...m, removeInk }))}
        onConfirm={handleConvertConfirm}
        onClose={() => setConvertModal((m) => ({ ...m, open: false, error: null }))}
      />
    </section>
  );
}
