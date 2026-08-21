import { useCallback, useMemo, useRef, useState } from 'react';
import { ZoomCanvas } from './ZoomCanvas';
import { InkLayer } from './InkLayer';
import { InkGestureHost } from './InkGestureHost';
import { InkSelectionHost } from './InkSelectionHost';
import { InkDragHost } from './InkDragHost';
import { InkConvertModal } from './InkConvertModal';
import { DrawingToolbar } from './DrawingToolbar';
import { DEFAULT_INK_SIZE, getInkSurfaceSize } from '../utils/inkStrokes';
import { getStrokesRectBounds } from '../utils/inkSelection';
import { strokesToPngDataUrl } from '../utils/inkToImage';
import { recognizeHandwriting } from '../utils/inkRecognize';
import { applyInkConversion } from '../utils/inkConvert';

export function WhiteboardView({
  strokes = [],
  onAddStroke,
  onRemoveStrokes,
  onMoveStrokes,
  onClear,
  onUndo,
  onAddMilestone,
  onAddCanvasSticky,
  onAddBacklogIdea,
  onAddNote,
  onAddGoal,
}) {
  const [tool, setTool] = useState('pan');
  const [color, setColor] = useState('#f5f5f5');
  const [size, setSize] = useState(DEFAULT_INK_SIZE);
  const [liveStroke, setLiveStroke] = useState(null);
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
  const inkDownRef = useRef(null);
  const selectDownRef = useRef(null);
  const inkDragDownRef = useRef(null);

  const surfaceSize = useMemo(() => getInkSurfaceSize(null, strokes), [strokes]);
  const interactionMode =
    tool === 'eraser' ? 'erase' : tool === 'pen' ? 'draw' : tool === 'select' ? 'select' : 'pan';

  const handleRecognizeInk = useCallback(async () => {
    const ids = selectedStrokeIds.length ? selectedStrokeIds : strokes.map((s) => s.id);
    const selected = strokes.filter((s) => ids.includes(s.id));
    if (!selected.length) {
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

    const bounds = getStrokesRectBounds(selected, 40);
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
      const preview = strokesToPngDataUrl(selected, bounds);
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
  }, [selectedStrokeIds, strokes]);

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
      onRemoveStrokes(convertModal.strokeIds);
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
    onRemoveStrokes,
  ]);

  return (
    <section className="whiteboard-view">
      <div className="whiteboard-view__toolbar">
        <DrawingToolbar
          tool={tool}
          color={color}
          size={size}
          onToolChange={setTool}
          onColorChange={setColor}
          onSizeChange={setSize}
          onClear={onClear}
          onUndo={onUndo}
          onRecognize={handleRecognizeInk}
          recognizing={recognizingInk}
          selectedCount={selectedStrokeIds.length}
          showPan
        />
      </div>

      <InkConvertModal
        open={convertModal.open}
        loading={convertModal.loading}
        error={convertModal.error}
        text={convertModal.text}
        convertType={convertModal.convertType}
        previewUrl={convertModal.previewUrl}
        onTextChange={(text) => setConvertModal((m) => ({ ...m, text }))}
        onTypeChange={(convertType) => setConvertModal((m) => ({ ...m, convertType }))}
        onConfirm={handleConvertConfirm}
        onClose={() => setConvertModal((m) => ({ ...m, open: false }))}
        removeInk={convertModal.removeInk}
        onRemoveInkChange={(removeInk) => setConvertModal((m) => ({ ...m, removeInk }))}
      />

      <div className="whiteboard-view__stage">
        <ZoomCanvas
          className="whiteboard-view__zoom zoom-canvas--no-toolbar"
          defaultScale={0.85}
          defaultPan={{ x: 40, y: 40 }}
          minScale={0.2}
          maxScale={2.5}
          showToolbar={false}
          interactionMode={interactionMode}
          onInkPointerDown={(e) => inkDownRef.current?.(e)}
          onSelectPointerDown={(e) => selectDownRef.current?.(e)}
          onInkDragPointerDown={(e) => inkDragDownRef.current?.(e)}
          viewportStyle={{ background: '#000000' }}
          panExcludeSelector=".drawing-toolbar"
        >
          <InkGestureHost
            tool={tool}
            color={color}
            size={size}
            strokes={strokes}
            onAddStroke={onAddStroke}
            onRemoveStrokes={onRemoveStrokes}
            bindDownRef={inkDownRef}
            onLiveStroke={setLiveStroke}
          />
          <InkDragHost
            strokes={strokes}
            selectedStrokeIds={selectedStrokeIds}
            onSelectionChange={setSelectedStrokeIds}
            onMoveStrokes={onMoveStrokes}
            bindDownRef={inkDragDownRef}
          />
          <div
            className="whiteboard-view__board"
            style={{ width: surfaceSize.width, height: surfaceSize.height }}
          >
            <InkLayer
              strokes={strokes}
              liveStroke={liveStroke}
              selectedStrokeIds={selectedStrokeIds}
              width={surfaceSize.width}
              height={surfaceSize.height}
            />
            <InkSelectionHost
              strokes={strokes}
              onSelectionChange={setSelectedStrokeIds}
              bindDownRef={selectDownRef}
            />
          </div>
        </ZoomCanvas>
      </div>
    </section>
  );
}
