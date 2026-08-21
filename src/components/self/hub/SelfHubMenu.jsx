export function SelfHubMenu({
  ouraStatus,
  ouraLoading,
  ouraBusy,
  scaleConnected,
  onOpenOuraModal,
  onOpenScaleModal,
  onSyncOura,
  onClose,
}) {
  return (
    <div className="self-hub-menu" role="menu">
      <button type="button" className="self-hub-menu__item" role="menuitem" onClick={() => { onOpenOuraModal?.(); onClose?.(); }}>
        {ouraStatus?.connected ? 'Oura settings' : 'Connect Oura'}
      </button>
      {ouraStatus?.connected ? (
        <button
          type="button"
          className="self-hub-menu__item"
          role="menuitem"
          disabled={ouraBusy || ouraLoading}
          onClick={() => { onSyncOura?.(); onClose?.(); }}
        >
          {ouraBusy ? 'Syncing…' : 'Sync Oura'}
        </button>
      ) : null}
      <button type="button" className="self-hub-menu__item" role="menuitem" onClick={() => { onOpenScaleModal?.(); onClose?.(); }}>
        {scaleConnected ? 'Scale settings' : 'Connect Scale'}
      </button>
    </div>
  );
}
