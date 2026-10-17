import { getServiceClient } from './supabase.ts';
import { getVapidKeys, sendWebPush } from './webpush.ts';
import { getFcmServiceAccount, sendFcm } from './fcm.ts';

/** Reminders that missed their minute by more than this are marked sent but not delivered. */
const STALE_AFTER_MS = 15 * 60 * 1000;

type ScheduledPush = {
  id: string;
  user_id: string;
  key: string;
  kind: string;
  fire_at: string;
  title: string;
  body: string;
  url: string | null;
};

type PushDevice = {
  id: string;
  user_id: string;
  platform: 'web' | 'android';
  token: string;
  keys: { p256dh?: string; auth?: string } | null;
};

/** Notification tag: the same reminder replaces itself instead of stacking. */
function tagFor(push: ScheduledPush): string {
  return push.key.replace(/@.*$/, '').slice(0, 64);
}

async function deliver(push: ScheduledPush, device: PushDevice) {
  const tag = tagFor(push);
  const url = push.url || '/';
  if (device.platform === 'web') {
    const vapid = getVapidKeys();
    if (!vapid || !device.keys?.p256dh || !device.keys?.auth) {
      return { ok: false, expired: false, error: 'web push not configured' };
    }
    return sendWebPush(
      { endpoint: device.token, keys: { p256dh: device.keys.p256dh, auth: device.keys.auth } },
      { title: push.title, body: push.body, url, tag, id: push.id },
      vapid,
      { topic: tag }
    );
  }
  const account = getFcmServiceAccount();
  if (!account) return { ok: false, expired: false, error: 'FCM not configured' };
  return sendFcm(device.token, { title: push.title, body: push.body, tag, data: { url, tag, id: push.id } }, account);
}

/** Send every due reminder (for one user, or for everyone when called by cron). */
export async function dispatchDuePushes(userId: string | null = null) {
  const admin = getServiceClient();
  const { data: claimed, error } = await admin.rpc('claim_due_pushes', { p_user: userId, p_limit: 200 });
  if (error) throw new Error(error.message);

  const now = Date.now();
  const due = ((claimed || []) as ScheduledPush[]).filter(
    (push) => now - new Date(push.fire_at).getTime() <= STALE_AFTER_MS
  );
  if (!due.length) return { claimed: claimed?.length || 0, delivered: 0, failed: 0, removedDevices: 0 };

  const userIds = [...new Set(due.map((push) => push.user_id))];
  const { data: devices, error: devicesError } = await admin
    .from('push_devices')
    .select('id, user_id, platform, token, keys')
    .in('user_id', userIds);
  if (devicesError) throw new Error(devicesError.message);

  const byUser = new Map<string, PushDevice[]>();
  for (const device of (devices || []) as PushDevice[]) {
    const list = byUser.get(device.user_id) || [];
    list.push(device);
    byUser.set(device.user_id, list);
  }

  const jobs: Promise<{ deviceId: string; ok: boolean; expired: boolean; error?: string }>[] = [];
  for (const push of due) {
    for (const device of byUser.get(push.user_id) || []) {
      jobs.push(deliver(push, device).then((result) => ({ deviceId: device.id, ...result })));
    }
  }
  const results = await Promise.all(jobs);

  const expired = [...new Set(results.filter((result) => result.expired).map((result) => result.deviceId))];
  if (expired.length) {
    await admin.from('push_devices').delete().in('id', expired);
  }
  const reached = new Set(results.filter((result) => result.ok).map((result) => result.deviceId));
  if (reached.size) {
    await admin.from('push_devices').update({ last_seen_at: new Date().toISOString() }).in('id', [...reached]);
  }

  const failures = results.filter((result) => !result.ok && !result.expired);
  return {
    claimed: claimed?.length || 0,
    delivered: results.filter((result) => result.ok).length,
    failed: failures.length,
    removedDevices: expired.length,
    errors: [...new Set(failures.map((result) => result.error).filter(Boolean))].slice(0, 5),
  };
}
