import { formatActiveBrainLabel, getBrainLevelMeta, loadBrainConfig } from '../../brain/config';
import { BrainPanel } from './BrainPanel';

export function BrainOrb({ open, onClick }) {
  const config = loadBrainConfig();
  const level = getBrainLevelMeta(config.level);
  const activeLabel = formatActiveBrainLabel(config);

  return (
    <button
      type="button"
      className={`brain-orb${open ? ' brain-orb--open' : ''}`}
      onClick={onClick}
      title={`Brain · ${activeLabel}`}
      aria-label={`Άνοιγμα Brain, ${activeLabel}`}
    >
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" aria-hidden="true">
        <path d="M8 8a3 3 0 0 1 3-3h2a3 3 0 0 1 3 3v1a3 3 0 0 1 2 2.8V14a3 3 0 0 1-2 2.8V17a3 3 0 0 1-3 3h-2a3 3 0 0 1-3-3v-.2A3 3 0 0 1 6 14v-2.2A3 3 0 0 1 8 9V8Z" />
        <path d="M12 8v10M9 12h6" />
      </svg>
      <span className="brain-orb__level">
        {config.providerId === 'openai' ? level.label : (config.model || 'Local')}
      </span>
    </button>
  );
}

export function BrainShell({
  mode,
  onModeChange,
  onApplyBrainActions,
  onOpenSource,
  context,
  snapshotInput,
  contextExtras,
}) {
  return (
    <>
      {mode === 'closed' ? (
        <BrainOrb open={false} onClick={() => onModeChange('docked')} />
      ) : null}
      {mode !== 'closed' ? (
        <aside className="lifeline-workspace__panel">
          <BrainPanel
            mode={mode}
            context={context}
            snapshotInput={snapshotInput}
            contextExtras={contextExtras}
            onApplyBrainActions={onApplyBrainActions}
            onOpenSource={onOpenSource}
            onClose={() => onModeChange('closed')}
            onExpand={() => onModeChange('expanded')}
            onCollapse={() => onModeChange('docked')}
          />
        </aside>
      ) : null}
    </>
  );
}
