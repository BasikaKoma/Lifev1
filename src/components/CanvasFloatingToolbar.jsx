import { useState, useRef, useEffect } from 'react';
import {
  NODE_COLOR_PRESETS,
  getCanvasStyle,
} from '../utils/canvasNodes';

function ToolbarIcon({ children }) {
  return <span className="canvas-ftoolbar__icon">{children}</span>;
}

function ToolbarDivider() {
  return <span className="canvas-ftoolbar__divider" aria-hidden="true" />;
}

function ToolbarMenu({ label, open, onToggle, children, className = '', dropdownClassName = '' }) {
  const ref = useRef(null);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e) => {
      if (ref.current && !ref.current.contains(e.target)) onToggle(false);
    };
    document.addEventListener('pointerdown', onDoc);
    return () => document.removeEventListener('pointerdown', onDoc);
  }, [open, onToggle]);

  return (
    <div className={`canvas-ftoolbar__menu-wrap ${className}`.trim()} ref={ref}>
      <button type="button" className="canvas-ftoolbar__btn" onClick={() => onToggle(!open)}>
        {label}
      </button>
      {open && (
        <div className={`canvas-ftoolbar__dropdown ${dropdownClassName}`.trim()}>
          {children}
        </div>
      )}
    </div>
  );
}

function ActionShortcut({ children }) {
  return <span className="canvas-ftoolbar__action-shortcut">{children}</span>;
}

function ActionsDivider() {
  return <div className="canvas-ftoolbar__action-divider" role="separator" />;
}

function ActionsItem({ label, shortcut, onClick, disabled, danger, hasSubmenu }) {
  return (
    <button
      type="button"
      className={`canvas-ftoolbar__action-item${danger ? ' canvas-ftoolbar__action-item--danger' : ''}`}
      onClick={onClick}
      disabled={disabled}
    >
      <span className="canvas-ftoolbar__action-label">
        {label}
        {hasSubmenu && <span className="canvas-ftoolbar__action-chevron">›</span>}
      </span>
      {shortcut && <ActionShortcut>{shortcut}</ActionShortcut>}
    </button>
  );
}

function ActionsSubmenu({ label, items, onClose }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e) => {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false);
    };
    document.addEventListener('pointerdown', onDoc);
    return () => document.removeEventListener('pointerdown', onDoc);
  }, [open]);

  return (
    <div
      className={`canvas-ftoolbar__action-submenu${open ? ' canvas-ftoolbar__action-submenu--open' : ''}`}
      ref={ref}
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={() => setOpen(false)}
    >
      <ActionsItem
        label={label}
        hasSubmenu
        onClick={() => setOpen((v) => !v)}
      />
      {open && (
        <div className="canvas-ftoolbar__action-flyout">
          {items.map((item) => (
            <button
              key={item.id}
              type="button"
              className="canvas-ftoolbar__action-item"
              disabled={item.disabled}
              onClick={() => {
                item.onClick?.();
                onClose?.();
                setOpen(false);
              }}
            >
              <span className="canvas-ftoolbar__action-label">{item.label}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

const FONT_SIZE_OPTIONS = [
  { id: 'sm', label: 'Small' },
  { id: 'md', label: 'Medium' },
  { id: 'lg', label: 'Large' },
];

const FONT_WEIGHT_OPTIONS = [
  { id: 'normal', label: 'Regular' },
  { id: 'medium', label: 'Medium' },
  { id: 'bold', label: 'Bold' },
];

const ALIGN_OPTIONS = [
  { id: 'left', label: 'Left' },
  { id: 'center', label: 'Center' },
  { id: 'right', label: 'Right' },
];

function ColorGrid({ value, onPick }) {
  return (
    <div className="canvas-ftoolbar__color-grid">
      {NODE_COLOR_PRESETS.map((color) => (
        <button
          key={color}
          type="button"
          className={`canvas-ftoolbar__color-swatch${value === color ? ' canvas-ftoolbar__color-swatch--active' : ''}`}
          style={{ background: color }}
          onClick={() => onPick(color)}
          aria-label={`Color ${color}`}
        />
      ))}
    </div>
  );
}

export function CanvasFloatingToolbar({
  position,
  currentStyle,
  onUpdate,
  onStartConnect,
  onAddSticky,
  onAddImage,
  onAddLink,
  onClose,
  onAction,
  canPaste = false,
  canPasteStyle = false,
}) {
  const style = getCanvasStyle({ canvasStyle: currentStyle });
  const [openMenu, setOpenMenu] = useState(null);

  const closeMenus = () => setOpenMenu(null);
  const toggle = (id) => setOpenMenu((cur) => (cur === id ? null : id));

  const runAction = (actionId) => {
    onAction?.(actionId);
    closeMenus();
  };

  const selectItems = [
    { id: 'select-connected', label: 'All connected', onClick: () => runAction('selectConnected') },
    { id: 'select-children', label: 'Children', onClick: () => runAction('selectChildren') },
    { id: 'select-parent', label: 'Parent', onClick: () => runAction('selectParent') },
  ];

  const foldItems = [
    { id: 'fold', label: 'Fold', onClick: () => runAction('fold'), disabled: true },
    { id: 'unfold', label: 'Unfold', onClick: () => runAction('unfold'), disabled: true },
  ];

  if (!position) return null;

  const weightLabel =
    FONT_WEIGHT_OPTIONS.find((o) => o.id === (style.fontWeight === 'bold' ? 'bold' : style.fontWeight === 'medium' ? 'medium' : 'normal'))?.label || 'Medium';
  const sizeLabel =
    FONT_SIZE_OPTIONS.find((o) => o.id === style.fontSize)?.label || 'Medium';

  return (
    <div
      className="canvas-floating-toolbar"
      style={{ left: position.left, top: position.top }}
      onPointerDown={(e) => e.stopPropagation()}
    >
      <ToolbarMenu
        open={openMenu === 'fill'}
        onToggle={(v) => (v ? setOpenMenu('fill') : closeMenus())}
        label={
          <>
            <ToolbarIcon>
              <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
                <path d="M11 2.5a2.5 2.5 0 0 0-3.5 0L2 8v4.5A1.5 1.5 0 0 0 3.5 14H7l6.5-6.5a2.5 2.5 0 0 0 0-3.5zM5.5 12a1 1 0 1 1 0-2 1 1 0 0 1 0 2z" />
              </svg>
            </ToolbarIcon>
            <span className="canvas-ftoolbar__chev">▾</span>
          </>
        }
      >
        <ColorGrid value={style.color} onPick={(color) => { onUpdate({ color }); closeMenus(); }} />
      </ToolbarMenu>

      <ToolbarDivider />

      <ToolbarMenu
        open={openMenu === 'size'}
        onToggle={(v) => (v ? setOpenMenu('size') : closeMenus())}
        label={
          <>
            <span className="canvas-ftoolbar__aa">Aa</span>
            <span className="canvas-ftoolbar__chev">▾</span>
          </>
        }
      >
        {FONT_SIZE_OPTIONS.map((opt) => (
          <button
            key={opt.id}
            type="button"
            className={`canvas-ftoolbar__dropdown-item${style.fontSize === opt.id ? ' canvas-ftoolbar__dropdown-item--active' : ''}`}
            onClick={() => { onUpdate({ fontSize: opt.id }); closeMenus(); }}
          >
            {opt.label}
          </button>
        ))}
      </ToolbarMenu>

      <ToolbarMenu
        open={openMenu === 'weight'}
        onToggle={(v) => (v ? setOpenMenu('weight') : closeMenus())}
        label={
          <>
            <span className="canvas-ftoolbar__text-label">{weightLabel}</span>
            <span className="canvas-ftoolbar__chev">▾</span>
          </>
        }
      >
        {FONT_WEIGHT_OPTIONS.map((opt) => (
          <button
            key={opt.id}
            type="button"
            className={`canvas-ftoolbar__dropdown-item${(style.fontWeight || 'normal') === opt.id || (opt.id === 'medium' && !style.fontWeight) ? ' canvas-ftoolbar__dropdown-item--active' : ''}`}
            onClick={() => { onUpdate({ fontWeight: opt.id === 'medium' ? 'normal' : opt.id }); closeMenus(); }}
          >
            {opt.label}
          </button>
        ))}
      </ToolbarMenu>

      <ToolbarMenu
        open={openMenu === 'color'}
        onToggle={(v) => (v ? setOpenMenu('color') : closeMenus())}
        label={
          <>
            <span className="canvas-ftoolbar__color-chip" style={{ background: style.color }} />
            <span className="canvas-ftoolbar__chev">▾</span>
          </>
        }
      >
        <ColorGrid value={style.color} onPick={(color) => { onUpdate({ color }); closeMenus(); }} />
      </ToolbarMenu>

      <ToolbarDivider />

      <button
        type="button"
        className={`canvas-ftoolbar__btn${style.fontWeight === 'bold' ? ' canvas-ftoolbar__btn--active' : ''}`}
        title="Bold"
        onClick={() => onUpdate({ fontWeight: style.fontWeight === 'bold' ? 'normal' : 'bold' })}
      >
        <strong>B</strong>
      </button>

      <ToolbarMenu
        open={openMenu === 'align'}
        onToggle={(v) => (v ? setOpenMenu('align') : closeMenus())}
        label={
          <>
            <ToolbarIcon>
              <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
                <path d="M2 3h12v1.5H2V3zm0 3.5h8v1.5H2V6.5zm0 3.5h12v1.5H2V10zm0 3.5h6v1.5H2V13.5z" />
              </svg>
            </ToolbarIcon>
            <span className="canvas-ftoolbar__chev">▾</span>
          </>
        }
      >
        {ALIGN_OPTIONS.map((opt) => (
          <button
            key={opt.id}
            type="button"
            className={`canvas-ftoolbar__dropdown-item${(style.textAlign || 'left') === opt.id ? ' canvas-ftoolbar__dropdown-item--active' : ''}`}
            onClick={() => { onUpdate({ textAlign: opt.id }); closeMenus(); }}
          >
            {opt.label}
          </button>
        ))}
      </ToolbarMenu>

      <ToolbarMenu
        open={openMenu === 'list'}
        onToggle={(v) => (v ? setOpenMenu('list') : closeMenus())}
        label={
          <>
            <ToolbarIcon>
              <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
                <path d="M2 4h2v2H2V4zm0 4h2v2H2V8zm0 4h2v2H2v-2zm4-8h8v2H6V4zm0 4h8v2H6V8zm0 4h8v2H6v-2z" />
              </svg>
            </ToolbarIcon>
            <span className="canvas-ftoolbar__chev">▾</span>
          </>
        }
      >
        <button type="button" className="canvas-ftoolbar__dropdown-item" onClick={closeMenus}>
          Bullet list (soon)
        </button>
      </ToolbarMenu>

      <ToolbarDivider />

      <button type="button" className="canvas-ftoolbar__btn" title="Add link" onClick={onAddLink}>
        <ToolbarIcon>
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
            <path d="M6.5 9.5a3 3 0 0 0 4.24 0l2-2a3 3 0 0 0-4.24-4.24l-1 1" />
            <path d="M9.5 6.5a3 3 0 0 0-4.24 0l-2 2a3 3 0 0 0 4.24 4.24l1-1" />
          </svg>
        </ToolbarIcon>
      </button>

      <button type="button" className="canvas-ftoolbar__btn" title="Sticky note" onClick={onAddSticky}>
        <ToolbarIcon>
          <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
            <path d="M3 2h10a1 1 0 0 1 1 1v9l-3 3H3a1 1 0 0 1-1-1V3a1 1 0 0 1 1-1zm8 9.5V11H4v1h7v-.5z" />
          </svg>
        </ToolbarIcon>
      </button>

      <button
        type="button"
        className="canvas-ftoolbar__btn"
        title="Add image"
        onClick={onAddImage}
        disabled={!onAddImage}
      >
        <ToolbarIcon>
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
            <rect x="2" y="3" width="12" height="10" rx="1" />
            <circle cx="5.5" cy="6.5" r="1.2" fill="currentColor" stroke="none" />
            <path d="M2 11l3-3 2.5 2.5L11 7l3 3" />
          </svg>
        </ToolbarIcon>
      </button>

      <button type="button" className="canvas-ftoolbar__btn" title="Attachment (soon)" disabled>
        <ToolbarIcon>
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
            <path d="M8.5 3.5l4 4a3 3 0 0 1-4.24 4.24L4.5 7.98a2 2 0 1 1 2.83-2.83l4.95 4.95" />
          </svg>
        </ToolbarIcon>
      </button>

      <button type="button" className="canvas-ftoolbar__btn" title="Note (soon)" disabled>
        <ToolbarIcon>
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
            <path d="M4 2.5h8v11l-2.5-2H4a1.5 1.5 0 0 1-1.5-1.5v-7A1.5 1.5 0 0 1 4 2.5z" />
          </svg>
        </ToolbarIcon>
      </button>

      <button
        type="button"
        className={`canvas-ftoolbar__btn${openMenu === 'connect' ? ' canvas-ftoolbar__btn--active' : ''}`}
        title="Connect to another node"
        onClick={() => { onStartConnect?.(); closeMenus(); }}
      >
        <ToolbarIcon>
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
            <path d="M3 8c0-2.2 1.8-4 4-4s4 1.8 4 4-1.8 4-4 4" />
            <circle cx="11" cy="8" r="2" fill="currentColor" stroke="none" />
          </svg>
        </ToolbarIcon>
      </button>

      <ToolbarDivider />

      <ToolbarMenu
        open={openMenu === 'more'}
        onToggle={(v) => (v ? setOpenMenu('more') : closeMenus())}
        dropdownClassName="canvas-ftoolbar__dropdown--actions"
        label={<span className="canvas-ftoolbar__dots">⋯</span>}
      >
        <div className="canvas-ftoolbar__actions">
          <ActionsItem label="Add child node" shortcut="Tab" onClick={() => runAction('addChild')} />
          <ActionsItem label="Add sibling node" shortcut="Enter" onClick={() => runAction('addSibling')} />
          <ActionsItem label="Add parent node" shortcut="Shift Tab" onClick={() => runAction('addParent')} />

          <ActionsDivider />

          <ActionsSubmenu label="Select..." items={selectItems} onClose={closeMenus} />
          <ActionsSubmenu label="Fold/Unfold" items={foldItems} onClose={closeMenus} />

          <ActionsDivider />

          <ActionsItem label="Cut" shortcut="Ctrl X" onClick={() => runAction('cut')} />
          <ActionsItem label="Copy" shortcut="Ctrl C" onClick={() => runAction('copy')} />
          <ActionsItem label="Paste" shortcut="Ctrl V" onClick={() => runAction('paste')} disabled={!canPaste} />

          <ActionsDivider />

          <ActionsItem label="Copy style" shortcut="Ctrl Alt C" onClick={() => runAction('copyStyle')} />
          <ActionsItem
            label="Paste style"
            shortcut="Ctrl Alt V"
            onClick={() => runAction('pasteStyle')}
            disabled={!canPasteStyle}
          />
          <ActionsItem label="Reset style" onClick={() => runAction('resetStyle')} />

          <ActionsDivider />

          <ActionsItem label="Detach node" shortcut="D" onClick={() => runAction('detach')} />
          <ActionsItem label="Reset node position" onClick={() => runAction('resetPosition')} />
          <ActionsItem label="Make a linked submap" onClick={() => runAction('linkedSubmap')} disabled />

          <ActionsDivider />

          <ActionsItem
            label="Delete"
            shortcut="⌫"
            danger
            onClick={() => runAction('delete')}
          />
        </div>
      </ToolbarMenu>
    </div>
  );
}
