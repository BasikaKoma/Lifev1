import { detectPlatform } from './capabilities';
import * as save from './save';
import * as updater from './updater';
import * as deepLink from './deepLink';
import * as brain from './brain';
import { getPlatformInfo, hasBleSupport, isMobilePlatform } from './capabilities';

export const platform = {
  get id() {
    return detectPlatform();
  },
  get isElectron() {
    return detectPlatform() === 'electron';
  },
  get isCapacitor() {
    return detectPlatform() === 'capacitor';
  },
  get isWeb() {
    return detectPlatform() === 'web';
  },
  get isMobile() {
    return isMobilePlatform();
  },
  hasBLE: hasBleSupport,
  hasAutoUpdate() {
    return getPlatformInfo().hasAutoUpdate();
  },
  hasBackgroundSync() {
    return getPlatformInfo().hasBackgroundSync();
  },
  save,
  updater,
  deepLink,
  brain,
};

export { detectPlatform, getPlatformInfo };
