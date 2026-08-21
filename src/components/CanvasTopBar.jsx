import { useState } from 'react';
import { CustomizeThemePanel } from './CustomizeThemePanel';
import { DrawingToolbar } from './DrawingToolbar';
import { SaveStatusIndicator } from './SaveStatusIndicator';
import { platform } from '../platform';

export function CanvasTopBar({
  hasSelection,
  mapTheme,
  syncing = false,
  hasUnsavedChanges = false,
  onSave,
  onMapThemeChange,
  onAddMilestone,
  onAddTask,
  onAddObstacle,
  onAddResource,
  onAddSticky,
  onAddImage,
  onRemoveSelected,
  isConnecting = false,
  canConnect = false,
  onToggleConnect,
  onAddChild,
  onAddSibling,
  onAddParent,
  onApplyThemeToSelected,
  onAutoLayout,
  drawTool = 'pan',
  drawColor = '#f5f5f5',
  drawSize = 3,
  onDrawToolChange,
  onDrawColorChange,
  onDrawSizeChange,
  onClearInk,
  onUndoInk,
  onRecognizeInk,
  recognizingInk = false,
  selectedInkCount = 0,
}) {
  const [themeOpen, setThemeOpen] = useState(false);
  const isMobile = platform.isMobile;

  const insertActions = [
    { label: isMobile ? 'Note' : '+ Note', shortcut: 'N', title: 'Add note (N)', onClick: onAddSticky },
    ...(onAddImage
      ? [{ label: isMobile ? 'Image' : '+ Image', title: 'Add image', onClick: onAddImage }]
      : []),
    { label: isMobile ? 'Milestone' : '+ Milestone', shortcut: 'M', title: 'Add milestone (M)', onClick: onAddMilestone },
    { label: isMobile ? 'Task' : '+ Task', shortcut: 'T', title: 'Add task (T)', onClick: onAddTask },
    { label: isMobile ? 'Obstacle' : '+ Obstacle', shortcut: 'O', title: 'Add obstacle (O)', onClick: onAddObstacle },
    { label: isMobile ? 'Resource' : '+ Resource', shortcut: 'R', title: 'Add resource (R)', onClick: onAddResource },
  ];

  return (
    <div className={`canvas-top-bar canvas-top-bar--premium${isMobile ? ' canvas-top-bar--mobile' : ''}`}>
      <div className="canvas-top-bar__row">
        <div className="canvas-top-bar__scroll">
        <div className="canvas-top-bar__group canvas-top-bar__group--insert">
          {!isMobile && <span className="canvas-top-bar__label">Insert</span>}
          {insertActions.map((action) => (
            <button
              key={action.label}
              type="button"
              className="canvas-top-bar__btn"
              onClick={action.onClick}
              title={action.title}
            >
              {action.label}
              {!isMobile && action.shortcut && (
                <kbd className="canvas-top-bar__kbd">{action.shortcut}</kbd>
              )}
            </button>
          ))}
        </div>

        {!isMobile && (
          <>
            <div className="canvas-top-bar__divider" aria-hidden="true" />

            <DrawingToolbar
              embedded
              tool={drawTool}
              color={drawColor}
              size={drawSize}
              onToolChange={onDrawToolChange}
              onColorChange={onDrawColorChange}
              onSizeChange={onDrawSizeChange}
              onClear={onClearInk}
              onUndo={onUndoInk}
              onRecognize={onRecognizeInk}
              recognizing={recognizingInk}
              selectedCount={selectedInkCount}
            />

            <div className="canvas-top-bar__divider" aria-hidden="true" />
          </>
        )}

        <div className="canvas-top-bar__group canvas-top-bar__group--edit">
          {!isMobile && <span className="canvas-top-bar__label">Edit</span>}
          <button
            type="button"
            className={`canvas-top-bar__btn${isConnecting ? ' canvas-top-bar__btn--active' : ''}`}
            onClick={onToggleConnect}
            disabled={!canConnect}
            title="Σύνδεση στοιχείων"
          >
            {isConnecting ? 'Ακύρωση' : 'Σύνδεση'}
          </button>
          <button
            type="button"
            className="canvas-top-bar__btn canvas-top-bar__btn--danger"
            onClick={onRemoveSelected}
            disabled={!hasSelection}
            title="Delete selected"
          >
            {isMobile ? 'Del' : 'Remove'}
          </button>
        </div>

        {!isMobile && <div className="canvas-top-bar__divider" aria-hidden="true" />}

        <div className="canvas-top-bar__group canvas-top-bar__group--structure">
          {!isMobile && <span className="canvas-top-bar__label">Structure</span>}
          <button
            type="button"
            className="canvas-top-bar__btn"
            onClick={onAddChild}
            disabled={!hasSelection}
            title="Add child (Tab)"
          >
            Child
          </button>
          <button
            type="button"
            className="canvas-top-bar__btn"
            onClick={onAddSibling}
            disabled={!hasSelection}
            title="Add sibling (Enter)"
          >
            Sibling
          </button>
          <button
            type="button"
            className="canvas-top-bar__btn"
            onClick={onAddParent}
            disabled={!hasSelection}
            title="Add parent (Shift+Tab)"
          >
            Parent
          </button>
        </div>
        </div>

        {!isMobile && <div className="canvas-top-bar__spacer" />}

        <div className="canvas-top-bar__group canvas-top-bar__group--meta">
          <SaveStatusIndicator
            syncing={syncing}
            hasUnsavedChanges={hasUnsavedChanges}
            onSave={onSave}
            compact={isMobile}
          />
          <button
            type="button"
            className={`canvas-top-bar__btn canvas-top-bar__btn--ghost${themeOpen ? ' canvas-top-bar__btn--active' : ''}${isMobile ? ' canvas-top-bar__btn--icon' : ''}`}
            onClick={() => setThemeOpen((v) => !v)}
            aria-label="Theme settings"
            title="Theme"
          >
            {isMobile ? (
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
                <circle cx="12" cy="12" r="3" />
                <path d="M12 1v2M12 21v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M1 12h2M21 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42" />
              </svg>
            ) : (
              'Theme'
            )}
          </button>
        </div>
      </div>

      {themeOpen && (
        <div className="canvas-top-bar__theme">
          <CustomizeThemePanel
            mapTheme={mapTheme}
            onMapThemeChange={onMapThemeChange}
            onAutoLayout={onAutoLayout}
            onApplyToSelected={onApplyThemeToSelected}
            hasSelection={hasSelection}
          />
        </div>
      )}
    </div>
  );
}
