import {
  DEFAULT_INK_COLORS,
  DEFAULT_INK_SIZE,
  MAX_INK_SIZE,
  MIN_INK_SIZE,
} from '../utils/inkStrokes';

export function DrawingToolbar({
  tool = 'pan',
  color = '#f5f5f5',
  size = DEFAULT_INK_SIZE,
  onToolChange,
  onColorChange,
  onSizeChange,
  onClear,
  onUndo,
  onRecognize,
  recognizing = false,
  selectedCount = 0,
  embedded = false,
  showPan = true,
}) {
  const colors = DEFAULT_INK_COLORS;

  return (
    <div className={`drawing-toolbar${embedded ? ' drawing-toolbar--embedded' : ''}`}>
      <div className="drawing-toolbar__group">
        <span className="drawing-toolbar__label">Draw</span>
        {showPan && (
          <button
            type="button"
            className={`drawing-toolbar__btn${tool === 'pan' ? ' drawing-toolbar__btn--active' : ''}`}
            onClick={() => onToolChange?.('pan')}
            title="Pan"
            aria-pressed={tool === 'pan'}
          >
            Pan
          </button>
        )}
        <button
          type="button"
          className={`drawing-toolbar__btn${tool === 'pen' ? ' drawing-toolbar__btn--active' : ''}`}
          onClick={() => onToolChange?.('pen')}
          title="Pen (stylus always draws)"
          aria-pressed={tool === 'pen'}
        >
          Pen
        </button>
        <button
          type="button"
          className={`drawing-toolbar__btn${tool === 'eraser' ? ' drawing-toolbar__btn--active' : ''}`}
          onClick={() => onToolChange?.('eraser')}
          title="Eraser"
          aria-pressed={tool === 'eraser'}
        >
          Eraser
        </button>
        <button
          type="button"
          className={`drawing-toolbar__btn${tool === 'select' ? ' drawing-toolbar__btn--active' : ''}`}
          onClick={() => onToolChange?.('select')}
          title="Select handwriting (drag rectangle)"
          aria-pressed={tool === 'select'}
        >
          Select
        </button>
      </div>

      <div className="drawing-toolbar__divider" aria-hidden="true" />

      <div className="drawing-toolbar__group">
        <button
          type="button"
          className="drawing-toolbar__btn drawing-toolbar__btn--accent"
          onClick={onRecognize}
          disabled={!onRecognize || recognizing}
          title="Recognize handwriting → Milestone, Note, etc. (needs OpenAI key)"
        >
          {recognizing ? 'Reading…' : 'Recognize'}
        </button>
        {selectedCount > 0 && (
          <span className="drawing-toolbar__hint">{selectedCount} selected</span>
        )}
      </div>

      <div className="drawing-toolbar__divider" aria-hidden="true" />

      <div className="drawing-toolbar__group drawing-toolbar__group--colors">
        {colors.map((c) => (
          <button
            key={c}
            type="button"
            className={`drawing-toolbar__swatch${color === c ? ' drawing-toolbar__swatch--active' : ''}`}
            style={{ background: c }}
            onClick={() => onColorChange?.(c)}
            title={c}
            aria-label={`Color ${c}`}
            aria-pressed={color === c}
          />
        ))}
      </div>

      <div className="drawing-toolbar__divider" aria-hidden="true" />

      <div className="drawing-toolbar__group">
        <label className="drawing-toolbar__size">
          <span className="drawing-toolbar__size-label">{size}px</span>
          <input
            type="range"
            min={MIN_INK_SIZE}
            max={MAX_INK_SIZE}
            value={size}
            onChange={(e) => onSizeChange?.(Number(e.target.value))}
            aria-label="Stroke size"
          />
        </label>
      </div>

      <div className="drawing-toolbar__divider" aria-hidden="true" />

      <div className="drawing-toolbar__group">
        {onUndo && (
          <button type="button" className="drawing-toolbar__btn" onClick={onUndo} title="Undo (Ctrl+Z)">
            Undo
          </button>
        )}
        <button
          type="button"
          className="drawing-toolbar__btn drawing-toolbar__btn--danger"
          onClick={onClear}
          title="Clear all ink"
        >
          Clear
        </button>
      </div>
    </div>
  );
}
