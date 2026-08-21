import { NO_DATA } from '../../../utils/selfHubSchema';

/** @param {{ capacity: import('../../../utils/selfHubSchema').SelfHubCapacity }} props */
export function SelfCapacityBanner({ capacity }) {
  return (
    <div className="self-capacity">
      <p className="self-capacity__title">CAPACITY</p>
      <p className="self-capacity__value">{capacity.value ?? '—'}</p>
      <p className="self-capacity__label">{capacity.label || NO_DATA}</p>
      {capacity.subtext ? <p className="self-capacity__subtext">{capacity.subtext}</p> : null}
    </div>
  );
}
