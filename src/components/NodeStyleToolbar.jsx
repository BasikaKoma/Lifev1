import {
  NODE_COLOR_PRESETS,
  getCanvasStyle,
} from '../utils/canvasNodes';

export function NodeStyleToolbar({ nodeRef, currentStyle, onUpdate, onClose }) {
  if (!nodeRef) return null;
  const style = getCanvasStyle({ canvasStyle: currentStyle });

  return (
    <div className="node-style-toolbar">
      <div className="node-style-toolbar__head">
        <span>Style</span>
        <button type="button" className="btn btn--text btn--sm" onClick={onClose}>×</button>
      </div>

      <label className="node-style-toolbar__label">Color</label>
      <div className="node-style-toolbar__colors">
        {NODE_COLOR_PRESETS.map((color) => (
          <button
            key={color}
            type="button"
            className={`node-style-toolbar__swatch${style.color === color ? ' node-style-toolbar__swatch--active' : ''}`}
            style={{ background: color }}
            onClick={() => onUpdate({ color })}
            aria-label={`Color ${color}`}
          />
        ))}
      </div>

      <label className="node-style-toolbar__label">Shape</label>
      <div className="node-style-toolbar__row">
        {['rounded', 'sharp', 'pill'].map((shape) => (
          <button
            key={shape}
            type="button"
            className={`btn btn--outline btn--sm${style.shape === shape ? ' btn--primary' : ''}`}
            onClick={() => onUpdate({ shape })}
          >
            {shape}
          </button>
        ))}
      </div>

      <label className="node-style-toolbar__label">Text</label>
      <div className="node-style-toolbar__row">
        {['sm', 'md', 'lg'].map((fontSize) => (
          <button
            key={fontSize}
            type="button"
            className={`btn btn--outline btn--sm${style.fontSize === fontSize ? ' btn--primary' : ''}`}
            onClick={() => onUpdate({ fontSize })}
          >
            {fontSize.toUpperCase()}
          </button>
        ))}
        <button
          type="button"
          className={`btn btn--outline btn--sm${style.fontWeight === 'bold' ? ' btn--primary' : ''}`}
          onClick={() => onUpdate({ fontWeight: style.fontWeight === 'bold' ? 'normal' : 'bold' })}
        >
          B
        </button>
      </div>
    </div>
  );
}
