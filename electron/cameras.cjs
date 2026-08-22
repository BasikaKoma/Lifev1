const { ipcMain } = require('electron');
const http = require('http');
const https = require('https');
const crypto = require('crypto');

const TIMEOUT_MS = 10000;
const MAX_BYTES = 4 * 1024 * 1024;

function md5(value) {
  return crypto.createHash('md5').update(String(value ?? ''), 'utf8').digest('hex');
}

function parseWwwAuthenticate(header) {
  const raw = Array.isArray(header) ? header.find((item) => /digest/i.test(item)) : header;
  if (!raw || !/digest/i.test(String(raw))) return null;
  const params = {};
  const body = String(raw).replace(/^Digest\s+/i, '');
  const re = /([a-zA-Z0-9_-]+)=(?:"([^"]*)"|([^,]*))/g;
  let match;
  while ((match = re.exec(body))) {
    params[match[1].toLowerCase()] = (match[2] ?? match[3] ?? '').trim();
  }
  if (!params.realm || !params.nonce) return null;
  return params;
}

function buildDigestAuthorization({ username, password, method, uri, challenge }) {
  const algo = (challenge.algorithm || 'MD5').toUpperCase();
  const qop = (challenge.qop || '')
    .split(',')
    .map((part) => part.trim())
    .find((part) => part === 'auth') || '';
  const nc = '00000001';
  const cnonce = crypto.randomBytes(8).toString('hex');
  let ha1 = md5(`${username}:${challenge.realm}:${password}`);
  if (algo === 'MD5-SESS') ha1 = md5(`${ha1}:${challenge.nonce}:${cnonce}`);
  const ha2 = md5(`${method}:${uri}`);
  const response = qop
    ? md5(`${ha1}:${challenge.nonce}:${nc}:${cnonce}:${qop}:${ha2}`)
    : md5(`${ha1}:${challenge.nonce}:${ha2}`);
  const parts = [
    `username="${username}"`,
    `realm="${challenge.realm}"`,
    `nonce="${challenge.nonce}"`,
    `uri="${uri}"`,
    `response="${response}"`,
  ];
  if (challenge.opaque) parts.push(`opaque="${challenge.opaque}"`);
  if (challenge.algorithm) parts.push(`algorithm=${challenge.algorithm}`);
  if (qop) {
    parts.push(`qop=${qop}`, `nc=${nc}`, `cnonce="${cnonce}"`);
  }
  return `Digest ${parts.join(', ')}`;
}

function sanitizeCamera(input = {}) {
  const protocol = input.protocol === 'https' ? 'https' : 'http';
  const host = String(input.host || '').trim();
  if (!/^[a-zA-Z0-9.-]+$/.test(host)) {
    throw new Error('Μη έγκυρη διεύθυνση κάμερας.');
  }
  const port = Number(input.port) || (protocol === 'https' ? 443 : 80);
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error('Μη έγκυρο port.');
  }
  const channel = Math.max(1, Number(input.channel) || 1);
  return {
    protocol,
    host,
    port,
    username: String(input.username || 'admin'),
    password: String(input.password ?? ''),
    channel,
  };
}

function requestOnce(url, headers = {}) {
  return new Promise((resolve, reject) => {
    const parsed = new URL(url);
    const lib = parsed.protocol === 'https:' ? https : http;
    const req = lib.request(
      {
        protocol: parsed.protocol,
        hostname: parsed.hostname,
        port: parsed.port || (parsed.protocol === 'https:' ? 443 : 80),
        path: `${parsed.pathname}${parsed.search}`,
        method: 'GET',
        headers,
        timeout: TIMEOUT_MS,
      },
      (res) => {
        const chunks = [];
        let size = 0;
        res.on('data', (chunk) => {
          size += chunk.length;
          if (size > MAX_BYTES) {
            req.destroy(new Error('Πολύ μεγάλο snapshot.'));
            return;
          }
          chunks.push(chunk);
        });
        res.on('end', () => {
          resolve({
            status: res.statusCode || 0,
            headers: res.headers || {},
            body: Buffer.concat(chunks),
          });
        });
      },
    );
    req.on('timeout', () => req.destroy(new Error('Timeout — η κάμερα δεν απάντησε.')));
    req.on('error', reject);
    req.end();
  });
}

function toResult(body, headers) {
  const type = String(headers['content-type'] || 'image/jpeg').split(';')[0].trim() || 'image/jpeg';
  if (!type.startsWith('image/') && body.slice(0, 3).toString('latin1') !== '\xff\xd8\xff') {
    throw new Error('Η κάμερα απάντησε, αλλά όχι με εικόνα. Έλεγξε χρήστη, κωδικό και κανάλι.');
  }
  const mime = type.startsWith('image/') ? type : 'image/jpeg';
  return {
    ok: true,
    dataUrl: `data:${mime};base64,${body.toString('base64')}`,
    at: new Date().toISOString(),
  };
}

async function fetchSnapshot(input) {
  const cam = sanitizeCamera(input);
  const defaultPort = cam.protocol === 'https' ? 443 : 80;
  const portPart = cam.port === defaultPort ? '' : `:${cam.port}`;
  const uris = [`/cgi-bin/snapshot.cgi?channel=${cam.channel}`];
  if (cam.channel === 1) uris.push('/cgi-bin/snapshot.cgi');

  let lastError = null;
  for (const uri of uris) {
    try {
      const url = `${cam.protocol}://${cam.host}${portPart}${uri}`;
      return await fetchSnapshotAt(url, uri, cam);
    } catch (err) {
      lastError = err;
    }
  }
  throw lastError || new Error('Δεν συνδέθηκε η κάμερα.');
}

async function fetchSnapshotAt(url, uri, cam) {
  const first = await requestOnce(url);
  const challenge = parseWwwAuthenticate(first.headers['www-authenticate']);

  if (first.status === 401 && challenge) {
    const authorization = buildDigestAuthorization({
      username: cam.username,
      password: cam.password,
      method: 'GET',
      uri,
      challenge,
    });
    const second = await requestOnce(url, { Authorization: authorization });
    if (second.status >= 200 && second.status < 300) return toResult(second.body, second.headers);
    if (second.status === 401) throw new Error('Λάθος χρήστης ή κωδικός (Digest).');
    throw new Error(`Η κάμερα επέστρεψε σφάλμα ${second.status}.`);
  }

  if (first.status === 401) {
    const basic = `Basic ${Buffer.from(`${cam.username}:${cam.password}`).toString('base64')}`;
    const second = await requestOnce(url, { Authorization: basic });
    if (second.status >= 200 && second.status < 300) return toResult(second.body, second.headers);
    throw new Error('Λάθος χρήστης ή κωδικός.');
  }

  if (first.status >= 200 && first.status < 300) return toResult(first.body, first.headers);
  throw new Error(`Δεν συνδέθηκε η κάμερα (${first.status || 'timeout'}).`);
}

function setupCamerasIpc() {
  ipcMain.removeHandler('cameras:snapshot');
  ipcMain.handle('cameras:snapshot', async (_event, camera) => {
    try {
      return await fetchSnapshot(camera);
    } catch (err) {
      return { ok: false, error: err?.message || 'Αποτυχία snapshot.' };
    }
  });
}

module.exports = { setupCamerasIpc };
