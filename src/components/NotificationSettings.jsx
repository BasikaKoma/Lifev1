import { useEffect, useState } from 'react';
import {
  BLOCK_LEAD_OPTIONS,
  HEART_RATE_LIMITS,
  getPushSettings,
  savePushSettings,
  subscribePushSettings,
} from '../lib/push/settings';
import {
  disablePushOnThisDevice,
  enablePushOnThisDevice,
  getPushSupport,
  isPushEnabledOnThisDevice,
  subscribePushDevice,
} from '../lib/push/device';
import { getKeepInTray, setKeepInTray, applyDesktopBackground } from '../lib/push/desktop';
import { sendTestPush } from '../lib/push/schedule';
import { getSupabaseClient } from '../lib/supabase';

const REASON_TEXT = {
  'ios-install':
    'Στο iPhone οι ειδοποιήσεις έρχονται μόνο στην εφαρμογή της Αρχικής οθόνης. Στο Safari πάτα Κοινοποίηση → «Προσθήκη στην οικ. οθόνη» και άνοιξε το lifev1 από το εικονίδιο.',
  'ios-version': 'Χρειάζεται iOS 16.4 ή νεότερο για ειδοποιήσεις στην εφαρμογή της Αρχικής οθόνης.',
  'no-vapid': 'Το build δεν έχει VITE_VAPID_PUBLIC_KEY, οπότε το Web Push δεν είναι ρυθμισμένο.',
  'no-fcm': 'Αυτό το Android build δεν έχει Firebase (android/app/google-services.json).',
  denied: 'Οι ειδοποιήσεις είναι μπλοκαρισμένες. Επίτρεψέ τες από τις ρυθμίσεις του browser ή της συσκευής.',
  unsupported: 'Αυτή η συσκευή δεν υποστηρίζει ειδοποιήσεις.',
};

const KIND_LABEL = {
  electron: 'Desktop · ειδοποιήσεις Windows',
  android: 'Android app',
  web: 'Web app',
};

function leadLabel(minutes) {
  return minutes ? `${minutes}′ πριν` : 'Στην ώρα του';
}

export function NotificationSettings({ user, ouraConnected = false }) {
  const userId = user?.id || null;
  const [settings, setSettings] = useState(getPushSettings);
  const [deviceOn, setDeviceOn] = useState(isPushEnabledOnThisDevice);
  const [keepInTray, setKeepInTrayState] = useState(getKeepInTray);
  const [devices, setDevices] = useState([]);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState(null);
  const [error, setError] = useState(null);
  const [thresholdDraft, setThresholdDraft] = useState(() => String(getPushSettings().heartRateThreshold));
  const support = getPushSupport();

  useEffect(() => subscribePushSettings(setSettings), []);
  useEffect(() => setThresholdDraft(String(settings.heartRateThreshold)), [settings.heartRateThreshold]);
  useEffect(() => subscribePushDevice(() => setDeviceOn(isPushEnabledOnThisDevice())), []);

  useEffect(() => {
    const supabase = getSupabaseClient();
    if (!supabase || !userId) return undefined;
    let cancelled = false;
    supabase
      .from('push_devices')
      .select('id, label, platform, last_seen_at')
      .eq('user_id', userId)
      .order('last_seen_at', { ascending: false })
      .then(({ data }) => {
        if (!cancelled) setDevices(data || []);
      });
    return () => {
      cancelled = true;
    };
  }, [userId, deviceOn]);

  const update = async (patch) => {
    setError(null);
    try {
      await savePushSettings(userId, patch);
    } catch (err) {
      setError(err?.message || 'Οι ρυθμίσεις δεν αποθηκεύτηκαν.');
    }
  };

  const handleEnable = async () => {
    setError(null);
    setMessage(null);
    setBusy(true);
    try {
      // First await must be the permission prompt (iOS needs the tap).
      await enablePushOnThisDevice();
      if (!settings.enabled) await savePushSettings(userId, { enabled: true });
      setMessage('Οι ειδοποιήσεις ενεργοποιήθηκαν σε αυτή τη συσκευή.');
    } catch (err) {
      setError(err?.message || 'Η ενεργοποίηση απέτυχε.');
    } finally {
      setBusy(false);
    }
  };

  const handleDisable = async () => {
    setError(null);
    setMessage(null);
    setBusy(true);
    try {
      await disablePushOnThisDevice();
    } catch (err) {
      setError(err?.message || 'Η απενεργοποίηση απέτυχε.');
    } finally {
      setBusy(false);
    }
  };

  const handleTest = async () => {
    setError(null);
    setMessage(null);
    setBusy(true);
    try {
      const result = await sendTestPush(userId);
      const parts = [];
      if (result?.delivered) parts.push(`${result.delivered} ${result.delivered === 1 ? 'συσκευή' : 'συσκευές'}`);
      if (support.kind === 'electron' && deviceOn) parts.push('αυτό το desktop');
      setMessage(parts.length ? `Στάλθηκε σε: ${parts.join(' + ')}.` : 'Δεν βρέθηκε συσκευή με ενεργές ειδοποιήσεις.');
      if (result?.failed && result.errors?.length) setError(`Αποτυχίες: ${result.errors[0]}`);
    } catch (err) {
      setError(err?.message || 'Η δοκιμή απέτυχε.');
    } finally {
      setBusy(false);
    }
  };

  const commitThreshold = () => {
    const value = Math.round(Number(thresholdDraft));
    if (Number.isFinite(value) && value >= HEART_RATE_LIMITS.min && value <= HEART_RATE_LIMITS.max) {
      if (value !== settings.heartRateThreshold) update({ heartRateThreshold: value });
    } else {
      setThresholdDraft(String(settings.heartRateThreshold));
    }
  };

  const handleKeepInTray = (value) => {
    setKeepInTray(value);
    setKeepInTrayState(value);
    applyDesktopBackground(settings.enabled && deviceOn);
  };

  if (!userId) return null;

  const optionsDisabled = !settings.enabled;

  return (
    <div className="settings-block">
      <h3 className="settings-block__title">Ειδοποιήσεις</h3>
      <p className="settings-block__desc">
        Υπενθυμίσεις για Path blocks, το τέλος του timer και το πρόγραμμα της ημέρας — σε desktop, Android και iPhone.
      </p>

      <span className="settings-label">Αυτή η συσκευή</span>
      {support.supported ? (
        <p className={`settings-block__desc${deviceOn ? ' settings-block__desc--ok' : ''}`}>
          {KIND_LABEL[support.kind] || 'Συσκευή'} · {deviceOn ? 'ενεργές' : 'ανενεργές'}
        </p>
      ) : (
        <p className="settings-block__desc">{REASON_TEXT[support.reason] || REASON_TEXT.unsupported}</p>
      )}

      <div className="settings-inline-actions">
        {support.supported && !deviceOn && (
          <button type="button" className="btn btn--primary" onClick={handleEnable} disabled={busy}>
            {busy ? 'Ενεργοποίηση…' : 'Ενεργοποίηση σε αυτή τη συσκευή'}
          </button>
        )}
        {deviceOn && (
          <button type="button" className="btn btn--outline" onClick={handleDisable} disabled={busy}>
            Απενεργοποίηση σε αυτή τη συσκευή
          </button>
        )}
        {settings.enabled && (
          <button type="button" className="btn btn--outline" onClick={handleTest} disabled={busy}>
            Δοκιμαστική ειδοποίηση
          </button>
        )}
      </div>

      {support.kind === 'electron' && deviceOn && (
        <label className="settings-check">
          <input type="checkbox" checked={keepInTray} onChange={(e) => handleKeepInTray(e.target.checked)} />
          <span>Μείνε στο tray όταν κλείνω το παράθυρο, για να έρχονται οι ειδοποιήσεις</span>
        </label>
      )}

      {message && <p className="settings-meta">{message}</p>}
      {error && <p className="settings-error">{error}</p>}

      <label className="settings-check">
        <input
          type="checkbox"
          checked={settings.enabled}
          onChange={(e) => update({ enabled: e.target.checked })}
        />
        <span>Υπενθυμίσεις ενεργές για όλες τις συσκευές μου</span>
      </label>

      <label className="settings-check">
        <input
          type="checkbox"
          checked={settings.blocks}
          disabled={optionsDisabled}
          onChange={(e) => update({ blocks: e.target.checked })}
        />
        <span>Path blocks με ώρα έναρξης</span>
      </label>
      {settings.blocks && (
        <select
          className="input notification-settings__select"
          value={settings.blockLeadMinutes}
          disabled={optionsDisabled}
          onChange={(e) => update({ blockLeadMinutes: Number(e.target.value) })}
        >
          {BLOCK_LEAD_OPTIONS.map((minutes) => (
            <option key={minutes} value={minutes}>{leadLabel(minutes)}</option>
          ))}
        </select>
      )}

      <label className="settings-check">
        <input
          type="checkbox"
          checked={settings.timer}
          disabled={optionsDisabled}
          onChange={(e) => update({ timer: e.target.checked })}
        />
        <span>Τέλος χρόνου στον timer ενός block</span>
      </label>

      <label className="settings-check">
        <input
          type="checkbox"
          checked={settings.dayPlan}
          disabled={optionsDisabled}
          onChange={(e) => update({ dayPlan: e.target.checked })}
        />
        <span>Πρόγραμμα της ημέρας</span>
      </label>
      {settings.dayPlan && (
        <input
          type="time"
          className="input notification-settings__select"
          value={settings.dayPlanTime}
          disabled={optionsDisabled}
          onChange={(e) => e.target.value && update({ dayPlanTime: e.target.value })}
        />
      )}

      <label className="settings-check">
        <input
          type="checkbox"
          checked={settings.routines}
          disabled={optionsDisabled}
          onChange={(e) => update({ routines: e.target.checked })}
        />
        <span>Ρουτίνες (στην ώρα κάθε ρουτίνας, αν δεν έχει γίνει)</span>
      </label>

      <label className="settings-check">
        <input
          type="checkbox"
          checked={settings.rhythm}
          disabled={optionsDisabled}
          onChange={(e) => update({ rhythm: e.target.checked })}
        />
        <span>Project rhythm με ώρα</span>
      </label>

      <label className="settings-check">
        <input
          type="checkbox"
          checked={settings.moodCheckin}
          disabled={optionsDisabled}
          onChange={(e) => update({ moodCheckin: e.target.checked })}
        />
        <span>Πρωινή διάθεση 1–10 (μόλις συγχρονιστεί ο ύπνος στο Oura, αλλιώς 07:00)</span>
      </label>

      <label className="settings-check">
        <input
          type="checkbox"
          checked={settings.heartRate}
          disabled={optionsDisabled}
          onChange={(e) => update({ heartRate: e.target.checked })}
        />
        <span>Υψηλοί παλμοί από το Oura</span>
      </label>
      {settings.heartRate && (
        <>
          <div className="notification-settings__inline">
            <span>Πάνω από</span>
            <input
              type="number"
              inputMode="numeric"
              className="input notification-settings__number"
              min={HEART_RATE_LIMITS.min}
              max={HEART_RATE_LIMITS.max}
              value={thresholdDraft}
              disabled={optionsDisabled}
              onChange={(e) => setThresholdDraft(e.target.value)}
              onBlur={commitThreshold}
              onKeyDown={(e) => {
                if (e.key === 'Enter') e.currentTarget.blur();
              }}
            />
            <span>bpm</span>
          </div>
          <p className="settings-meta notification-settings__sub">
            {ouraConnected
              ? 'Η ειδοποίηση φεύγει μόλις φτάσουν στο lifev1 νέοι παλμοί πάνω από το όριο, σε κάθε συγχρονισμό του Oura. Γράφει την ώρα της μέτρησης.'
              : 'Χρειάζεται σύνδεση με Oura (Διασυνδέσεις).'}
          </p>
        </>
      )}

      {devices.length > 0 && (
        <p className="settings-meta">
          Κινητά/browsers με ειδοποιήσεις: {devices.map((device) => device.label || device.platform).join(' · ')}
        </p>
      )}
    </div>
  );
}
