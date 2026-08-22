import { cloneElement, useCallback, useMemo, useState } from 'react';
import { createEmptyBrainContext, normalizeBrainContext } from '../../brain/context';
import { BrainOrb, BrainShell } from './BrainShell';
import { platform } from '../../platform';
import './brain.css';

export function LifelineWorkspace({
  children,
  brainMode,
  onBrainModeChange,
  onApplyBrainActions,
  onOpenSource,
  snapshotInput,
  contextExtras,
}) {
  const [brainContext, setBrainContext] = useState(createEmptyBrainContext);
  const mode = brainMode || 'closed';
  const isMobile = platform.isMobile;
  const handleContextChange = useCallback((next) => {
    setBrainContext(normalizeBrainContext(next));
  }, []);

  const canvas = useMemo(() => {
    if (!children) return null;
    return cloneElement(children, {
      onBrainContextChange: handleContextChange,
      brainOrb: mode === 'closed' ? (
        <BrainOrb open={false} onClick={() => onBrainModeChange('docked')} />
      ) : null,
    });
  }, [children, handleContextChange, mode, onBrainModeChange]);

  const extras = useMemo(() => {
    const project = (snapshotInput?.projectList || []).find((item) => item.id === brainContext.selectedProjectId);
    return {
      ...contextExtras,
      projectTitle: project?.title || contextExtras?.projectTitle,
    };
  }, [snapshotInput, brainContext.selectedProjectId, contextExtras]);

  return (
    <div
      className={`lifeline-workspace lifeline-workspace--${mode}${isMobile ? ' lifeline-workspace--mobile' : ''}`}
    >
      <div className="lifeline-workspace__canvas">
        {canvas}
      </div>
      {mode !== 'closed' ? (
        <BrainShell
          mode={mode}
          onModeChange={onBrainModeChange}
          onApplyBrainActions={onApplyBrainActions}
          onOpenSource={onOpenSource}
          context={brainContext}
          snapshotInput={snapshotInput}
          contextExtras={extras}
        />
      ) : null}
    </div>
  );
}
