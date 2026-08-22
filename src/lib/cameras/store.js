const STORAGE_KEY = 'lifev1-dahua-cameras';

export function createCameraId() {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID();
  return `cam-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

export function parseCameraHostInput(raw) {
  const text = String(raw || '').trim();
  if (!text) return { host: '', port: 80, protocol: 'http' };

  let protocol = 'http';
  let rest = text;
  const protoMatch = rest.match(/^(https?):\/\//i);
  if (protoMatch) {
    protocol = protoMatch[1].toLowerCase();
    rest = rest.slice(protoMatch[0].length);
  }

  rest = rest.replace(/\/.*$/, '');
  const [hostPart, portPart] = rest.split(':');
  const host = (hostPart || '').trim();
  const port = portPart ? Number(portPart) : protocol === 'https' ? 443 : 80;

  return {
    host,
    port: Number.isFinite(port) && port > 0 ? port : protocol === 'https' ? 443 : 80,
    protocol,
  };
}

export function normalizeCamera(input = {}) {
  const parsed = parseCameraHostInput(input.host || input.address || '');
  const protocol = input.protocol === 'https' ? 'https' : parsed.protocol || 'http';
  const port = Number(input.port) || parsed.port || (protocol === 'https' ? 443 : 80);
  const channel = Math.max(1, Number(input.channel) || 1);

  return {
    id: input.id || createCameraId(),
    name: String(input.name || '').trim() || `Κάμερα ${channel}`,
    host: String(parsed.host || input.host || '').trim(),
    port,
    protocol,
    username: String(input.username || 'admin').trim() || 'admin',
    password: String(input.password ?? ''),
    channel,
    createdAt: input.createdAt || new Date().toISOString(),
  };
}

export function buildSnapshotUrl(camera) {
  const cam = normalizeCamera(camera);
  if (!cam.host) throw new Error('Βάλε την IP της κάμερας ή του NVR.');
  const defaultPort = cam.protocol === 'https' ? 443 : 80;
  const portPart = Number(cam.port) === defaultPort ? '' : `:${cam.port}`;
  const path = `/cgi-bin/snapshot.cgi?channel=${cam.channel}`;
  return {
    url: `${cam.protocol}://${cam.host}${portPart}${path}`,
    uri: path,
    method: 'GET',
  };
}

export function readCameras() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    if (!Array.isArray(parsed)) return [];
    return parsed.map((item) => normalizeCamera(item)).filter((item) => item.host);
  } catch {
    return [];
  }
}

export function persistCameras(cameras) {
  const next = (cameras || []).map((item) => normalizeCamera(item));
  localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  return next;
}

export function upsertCamera(camera) {
  const nextCam = normalizeCamera(camera);
  if (!nextCam.host) throw new Error('Βάλε την IP της κάμερας ή του NVR.');
  const current = readCameras();
  const index = current.findIndex((item) => item.id === nextCam.id);
  if (index >= 0) current[index] = { ...current[index], ...nextCam };
  else current.push(nextCam);
  return persistCameras(current);
}

export function removeCamera(id) {
  return persistCameras(readCameras().filter((item) => item.id !== id));
}

export function getCamera(id) {
  return readCameras().find((item) => item.id === id) || null;
}
