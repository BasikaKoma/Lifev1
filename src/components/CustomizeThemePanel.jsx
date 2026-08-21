import { useRef } from 'react';
import {
  DEFAULT_MAP_THEME,
  NODE_TYPE_COLOR_KEYS,
  BORDER_THICKNESS_OPTIONS,
  CORNER_RADIUS_OPTIONS,
  PADDING_OPTIONS,
  SHADOW_OPTIONS,
  LINE_STYLE_OPTIONS,
} from '../utils/mapTheme';

const MAP_TYPES = [
  { id: 'standard', title: 'Standard mindmap', desc: 'Central idea with radiating branches.', icon: '◎' },
  { id: 'org', title: 'Org chart', desc: 'Top-down structure for teams and hierarchies.', icon: '▭' },
  { id: 'argument', title: 'Argument visualization', desc: 'Claims, evidence, and counterpoints.', icon: '↔' },
];

const MAP_STYLES = [
  { id: 'bubbles', title: 'Bubbles', desc: 'Rounded nodes with subtle shading.', preview: 'bubble' },
  { id: 'simple', title: 'Simple', desc: 'Clean text nodes with minimal decoration.', preview: 'simple' },
  { id: 'productive', title: 'Productive', desc: 'Auto-colored levels for clarity.', preview: 'productive' },
];

function SegmentedControl({ options, value, onChange, labels }) {
  return (
    <div className="customize-theme__segmented">
      {options.map((opt) => (
        <button
          key={opt}
          type="button"
          className={`customize-theme__segmented-btn${value === opt ? ' customize-theme__segmented-btn--active' : ''}`}
          onClick={() => onChange(opt)}
        >
          {labels?.[opt] || (opt === 'rnd' ? 'Rnd' : opt.charAt(0).toUpperCase() + opt.slice(1))}
        </button>
      ))}
    </div>
  );
}

function ThicknessPicker({ value, onChange, options = BORDER_THICKNESS_OPTIONS }) {
  const sizes = { s: 4, m: 6, l: 8, xl: 10 };
  return (
    <div className="customize-theme__thickness-row">
      {options.map((opt) => (
        <button
          key={opt}
          type="button"
          className={`customize-theme__thickness-dot${value === opt ? ' customize-theme__thickness-dot--active' : ''}`}
          onClick={() => onChange(opt)}
          aria-label={`Thickness ${opt}`}
        >
          <span style={{ width: sizes[opt], height: sizes[opt] }} />
        </button>
      ))}
    </div>
  );
}

function ColorPickerField({ label, value, onChange, allowNone, extraAction }) {
  const inputRef = useRef(null);
  const display = value || '#ffffff';
  const isNone = allowNone && !value;

  return (
    <div className="customize-theme__color-row">
      <span className="customize-theme__color-label">{label}</span>
      <div className="customize-theme__color-controls">
        {extraAction}
        <button
          type="button"
          className={`customize-theme__color-swatch-btn${isNone ? ' customize-theme__color-swatch-btn--none' : ''}`}
          onClick={() => inputRef.current?.click()}
          aria-label={label}
          style={isNone ? undefined : { background: display }}
        />
        <input
          ref={inputRef}
          type="color"
          className="customize-theme__color-input-hidden"
          value={display}
          onChange={(e) => onChange(e.target.value)}
        />
        {allowNone && (
          <button type="button" className="btn btn--text btn--sm" onClick={() => onChange(null)}>
            None
          </button>
        )}
      </div>
    </div>
  );
}

function ThemeSection({ title, onReset, children }) {
  return (
    <section className="customize-theme__panel-section">
      <div className="customize-theme__panel-section-head">
        <h4>{title}</h4>
        {onReset && (
          <button type="button" className="customize-theme__reset-btn" onClick={onReset} title="Reset">
            ↺
          </button>
        )}
      </div>
      {children}
    </section>
  );
}

function LineStylePicker({ value, onChange }) {
  return (
    <div className="customize-theme__line-styles">
      {LINE_STYLE_OPTIONS.map((opt) => (
        <button
          key={opt.id}
          type="button"
          className={`customize-theme__line-style${value === opt.id ? ' customize-theme__line-style--active' : ''}`}
          onClick={() => onChange(opt.id)}
          title={opt.label}
        >
          <svg width="36" height="20" viewBox="0 0 36 20" fill="none" stroke="currentColor" strokeWidth="1.5">
            {opt.id === 'curved' && <path d="M2 10 C 10 2, 26 18, 34 10" />}
            {opt.id === 'angled' && <path d="M2 10 H 18 V 4 H 34" />}
            {opt.id === 'straight' && <path d="M2 10 L 34 10" />}
          </svg>
        </button>
      ))}
    </div>
  );
}

export function CustomizeThemePanel({
  mapTheme,
  onMapThemeChange,
  onAutoLayout,
  onApplyToSelected,
  hasSelection,
}) {
  const theme = mapTheme || DEFAULT_MAP_THEME;
  const tab = theme.panelTab || 'layout';
  const bgImageInputRef = useRef(null);

  const setTab = (panelTab) => onMapThemeChange?.({ panelTab });
  const patch = (updates) => onMapThemeChange?.(updates);

  const updateCanvas = (canvasPatch) =>
    patch({ canvas: { ...theme.canvas, ...canvasPatch } });

  const updateGlobalColors = (colorPatch) =>
    patch({ globalColors: { ...theme.globalColors, ...colorPatch } });

  const updateGlobalShape = (shapePatch) =>
    patch({ globalShape: { ...theme.globalShape, ...shapePatch } });

  const updateGlobalLines = (linesPatch) =>
    patch({ globalLines: { ...theme.globalLines, ...linesPatch } });

  const updateGlobalText = (textPatch) =>
    patch({ globalText: { ...theme.globalText, ...textPatch } });

  const updateLevelOverride = (level, overridePatch) => {
    const overrides = (theme.levelOverrides || []).map((item) =>
      item.level === level ? { ...item, ...overridePatch } : item
    );
    patch({ levelOverrides: overrides });
  };

  const updateNodeTypeColor = (typeId, colorPatch) => {
    const defaults = DEFAULT_MAP_THEME.nodeTypeColors;
    patch({
      nodeTypeColors: {
        ...defaults,
        ...(theme.nodeTypeColors || {}),
        [typeId]: {
          ...(defaults[typeId] || {}),
          ...(theme.nodeTypeColors?.[typeId] || {}),
          ...colorPatch,
        },
      },
    });
  };

  const resetNodeTypeColors = () => {
    patch({ nodeTypeColors: { ...DEFAULT_MAP_THEME.nodeTypeColors } });
  };

  const removeLevelOverride = (level) => {
    patch({
      levelOverrides: (theme.levelOverrides || []).filter((item) => item.level !== level),
    });
  };

  const addLevelOverride = () => {
    const existing = theme.levelOverrides || [];
    const usedLevels = new Set(existing.map((o) => o.level));
    let nextLevel = 0;
    while (usedLevels.has(nextLevel)) nextLevel += 1;
    patch({
      levelOverrides: [
        ...existing,
        {
          id: `level-${nextLevel}`,
          label: nextLevel === 0 ? 'Root node' : `Level ${nextLevel}`,
          level: nextLevel,
          textColor: '#111827',
          fillColor: '#ffffff',
          borderColor: null,
        },
      ],
    });
  };

  const handleBackgroundImage = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => updateCanvas({ backgroundImage: reader.result });
    reader.readAsDataURL(file);
    e.target.value = '';
  };

  return (
    <div className="customize-theme">
      <div className="customize-theme__head">
        <h3 className="customize-theme__title">Customize theme</h3>
      </div>

      <div className="customize-theme__tabs">
        {['layout', 'color', 'text', 'shape'].map((t) => (
          <button
            key={t}
            type="button"
            className={`customize-theme__tab${tab === t ? ' customize-theme__tab--active' : ''}`}
            onClick={() => setTab(t)}
          >
            {t.charAt(0).toUpperCase() + t.slice(1)}
          </button>
        ))}
      </div>

      <div className="customize-theme__body">
        {tab === 'layout' && (
          <>
            <section className="customize-theme__section">
              <h4>Map type</h4>
              <div className="customize-theme__cards">
                {MAP_TYPES.map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    className={`customize-theme__card${theme.mapType === item.id ? ' customize-theme__card--active' : ''}`}
                    onClick={() => patch({ mapType: item.id })}
                  >
                    <span className="customize-theme__card-icon">{item.icon}</span>
                    <span className="customize-theme__card-title">{item.title}</span>
                    <span className="customize-theme__card-desc">{item.desc}</span>
                  </button>
                ))}
              </div>
            </section>

            <section className="customize-theme__section">
              <h4>Map direction</h4>
              <button
                type="button"
                className={`customize-theme__option${theme.direction === 'default' ? ' customize-theme__option--active' : ''}`}
                onClick={() => patch({ direction: 'default' })}
              >
                <strong>Default</strong>
                <span>Branches grow freely around the center.</span>
              </button>
            </section>

            <section className="customize-theme__section">
              <h4>Map style</h4>
              <div className="customize-theme__style-grid">
                {MAP_STYLES.map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    className={`customize-theme__style-card customize-theme__style-card--${item.preview}${theme.mapStyle === item.id ? ' customize-theme__style-card--active' : ''}`}
                    onClick={() => patch({ mapStyle: item.id })}
                  >
                    <span className="customize-theme__style-preview" />
                    <span className="customize-theme__card-title">{item.title}</span>
                    <span className="customize-theme__card-desc">{item.desc}</span>
                  </button>
                ))}
              </div>
            </section>

            <button type="button" className="btn btn--outline btn--sm customize-theme__action" onClick={onAutoLayout}>
              Auto-layout board
            </button>
          </>
        )}

        {tab === 'color' && (
          <>
            <ThemeSection
              title="Canvas"
              onReset={() => patch({ canvas: { ...DEFAULT_MAP_THEME.canvas } })}
            >
              <ColorPickerField
                label="Background color"
                value={theme.canvas?.backgroundColor}
                onChange={(backgroundColor) => updateCanvas({ backgroundColor })}
                extraAction={
                  <>
                    <button
                      type="button"
                      className="customize-theme__image-btn"
                      title="Background image"
                      onClick={() => bgImageInputRef.current?.click()}
                    >
                      🖼
                    </button>
                    <input
                      ref={bgImageInputRef}
                      type="file"
                      accept="image/*"
                      className="customize-theme__color-input-hidden"
                      onChange={handleBackgroundImage}
                    />
                    {theme.canvas?.backgroundImage && (
                      <button
                        type="button"
                        className="btn btn--text btn--sm"
                        onClick={() => updateCanvas({ backgroundImage: null })}
                      >
                        Clear
                      </button>
                    )}
                  </>
                }
              />
            </ThemeSection>

            <ThemeSection title="Global colors">
              <ColorPickerField
                label="Text color"
                value={theme.globalColors?.textColor}
                onChange={(textColor) => updateGlobalColors({ textColor })}
              />
              <ColorPickerField
                label="Fill color"
                value={theme.globalColors?.fillColor}
                onChange={(fillColor) => updateGlobalColors({ fillColor })}
              />
              <ColorPickerField
                label="Border color"
                value={theme.globalColors?.borderColor}
                onChange={(borderColor) => updateGlobalColors({ borderColor })}
                allowNone
              />
            </ThemeSection>

            <ThemeSection title="Χρώματα ανά είδος" onReset={resetNodeTypeColors}>
              <p className="customize-theme__hint">
                Το περίγραμμα και η γραμμή σύνδεσης αλλάζουν χρώμα ανά είδος. Το φόντο μένει σκούρο — άλλαξέ το μόνο αν θέλεις.
              </p>
              {NODE_TYPE_COLOR_KEYS.map(({ id, label }) => {
                const colors = theme.nodeTypeColors?.[id] || DEFAULT_MAP_THEME.nodeTypeColors[id];
                return (
                  <details key={id} className="customize-theme__level-block" open={id === 'milestoneMajor'}>
                    <summary className="customize-theme__level-summary">{label}</summary>
                    <ColorPickerField
                      label="Περίγραμμα / accent"
                      value={colors?.borderColor}
                      onChange={(borderColor) => updateNodeTypeColor(id, { borderColor })}
                    />
                    <ColorPickerField
                      label="Φόντο"
                      value={colors?.fillColor}
                      onChange={(fillColor) => updateNodeTypeColor(id, { fillColor })}
                    />
                    <ColorPickerField
                      label="Κείμενο"
                      value={colors?.textColor}
                      onChange={(textColor) => updateNodeTypeColor(id, { textColor })}
                    />
                  </details>
                );
              })}
            </ThemeSection>

            <ThemeSection title="Level overrides">
              {(theme.levelOverrides || []).map((override) => (
                <details
                  key={override.id}
                  className="customize-theme__level-block"
                  open={override.level === 0}
                >
                  <summary className="customize-theme__level-summary">{override.label}</summary>
                  <ColorPickerField
                    label="Text color"
                    value={override.textColor}
                    onChange={(textColor) => updateLevelOverride(override.level, { textColor })}
                  />
                  <ColorPickerField
                    label="Fill color"
                    value={override.fillColor}
                    onChange={(fillColor) => updateLevelOverride(override.level, { fillColor })}
                  />
                  <ColorPickerField
                    label="Border color"
                    value={override.borderColor}
                    onChange={(borderColor) => updateLevelOverride(override.level, { borderColor })}
                    allowNone
                  />
                  <button
                    type="button"
                    className="customize-theme__remove-level"
                    onClick={() => removeLevelOverride(override.level)}
                  >
                    Remove {override.label.toLowerCase()} override
                  </button>
                </details>
              ))}

              <button type="button" className="customize-theme__add-level" onClick={addLevelOverride}>
                + Add new level
              </button>
            </ThemeSection>
          </>
        )}

        {tab === 'text' && (
          <section className="customize-theme__section">
            <h4>Global typography</h4>
            <p className="customize-theme__hint">Default for nodes without custom text style.</p>
            <label className="customize-theme__field">
              Size
              <select
                className="input"
                value={theme.globalText?.fontSize || 'md'}
                onChange={(e) => updateGlobalText({ fontSize: e.target.value })}
              >
                <option value="sm">Small</option>
                <option value="md">Medium</option>
                <option value="lg">Large</option>
              </select>
            </label>
            <label className="customize-theme__field">
              Weight
              <select
                className="input"
                value={theme.globalText?.fontWeight || 'normal'}
                onChange={(e) => updateGlobalText({ fontWeight: e.target.value })}
              >
                <option value="normal">Regular</option>
                <option value="bold">Bold</option>
              </select>
            </label>
            <label className="customize-theme__field">
              Alignment
              <select
                className="input"
                value={theme.globalText?.textAlign || 'left'}
                onChange={(e) => updateGlobalText({ textAlign: e.target.value })}
              >
                <option value="left">Left</option>
                <option value="center">Center</option>
                <option value="right">Right</option>
              </select>
            </label>

            <h4 style={{ marginTop: 16 }}>Selected node</h4>
            <p className="customize-theme__hint">
              {hasSelection ? 'Overrides global defaults on the selected node.' : 'Select a node on the board first.'}
            </p>
            <label className="customize-theme__field">
              Size
              <select
                className="input"
                disabled={!hasSelection}
                defaultValue="md"
                onChange={(e) => onApplyToSelected?.({ fontSize: e.target.value })}
              >
                <option value="sm">Small</option>
                <option value="md">Medium</option>
                <option value="lg">Large</option>
              </select>
            </label>
            <label className="customize-theme__field">
              Weight
              <select
                className="input"
                disabled={!hasSelection}
                defaultValue="normal"
                onChange={(e) => onApplyToSelected?.({ fontWeight: e.target.value })}
              >
                <option value="normal">Regular</option>
                <option value="bold">Bold</option>
              </select>
            </label>
          </section>
        )}

        {tab === 'shape' && (
          <>
            <ThemeSection title="Global shape">
              <div className="customize-theme__shape-field">
                <span className="customize-theme__color-label">Border thickness</span>
                <ThicknessPicker
                  value={theme.globalShape?.borderThickness || 's'}
                  onChange={(borderThickness) => updateGlobalShape({ borderThickness })}
                />
              </div>
              <div className="customize-theme__shape-field">
                <span className="customize-theme__color-label">Corner radius</span>
                <SegmentedControl
                  options={CORNER_RADIUS_OPTIONS}
                  value={theme.globalShape?.cornerRadius || 'l'}
                  onChange={(cornerRadius) => updateGlobalShape({ cornerRadius })}
                />
              </div>
              <div className="customize-theme__shape-field">
                <span className="customize-theme__color-label">Padding</span>
                <SegmentedControl
                  options={PADDING_OPTIONS}
                  value={theme.globalShape?.padding || 'l'}
                  onChange={(padding) => updateGlobalShape({ padding })}
                />
              </div>
              <div className="customize-theme__shape-field">
                <span className="customize-theme__color-label">Shadow</span>
                <SegmentedControl
                  options={SHADOW_OPTIONS}
                  value={theme.globalShape?.shadow || 's'}
                  onChange={(shadow) => updateGlobalShape({ shadow })}
                  labels={{ none: 'None' }}
                />
              </div>
            </ThemeSection>

            <ThemeSection title="Global lines">
              <div className="customize-theme__shape-field">
                <span className="customize-theme__color-label">Line thickness</span>
                <ThicknessPicker
                  value={theme.globalLines?.lineThickness || 's'}
                  onChange={(lineThickness) => updateGlobalLines({ lineThickness })}
                />
              </div>
              <div className="customize-theme__shape-field">
                <span className="customize-theme__color-label">Line style</span>
                <LineStylePicker
                  value={theme.globalLines?.lineStyle || 'curved'}
                  onChange={(lineStyle) => updateGlobalLines({ lineStyle })}
                />
              </div>
              <ColorPickerField
                label="Line color"
                value={theme.globalLines?.lineColor || '#64748b'}
                onChange={(lineColor) => updateGlobalLines({ lineColor })}
              />
            </ThemeSection>

            {hasSelection && (
              <section className="customize-theme__section">
                <h4>Selected node shape</h4>
                <div className="customize-theme__shape-row">
                  {['rounded', 'sharp', 'pill'].map((shape) => (
                    <button
                      key={shape}
                      type="button"
                      className={`customize-theme__shape-btn customize-theme__shape-btn--${shape}`}
                      onClick={() => onApplyToSelected?.({ shape })}
                    >
                      {shape}
                    </button>
                  ))}
                </div>
              </section>
            )}
          </>
        )}
      </div>
    </div>
  );
}
