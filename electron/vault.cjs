const { app, dialog, ipcMain, BrowserWindow, shell } = require('electron');
const fs = require('fs');
const path = require('path');

function configPath() {
  return path.join(app.getPath('userData'), 'vault-root.json');
}

function readConfig() {
  try {
    const raw = JSON.parse(fs.readFileSync(configPath(), 'utf8'));
    if (raw && typeof raw.path === 'string' && raw.path.trim()) {
      return { path: raw.path };
    }
  } catch {
    /* missing or invalid */
  }
  return { path: null };
}

function writeConfig(value) {
  fs.writeFileSync(configPath(), JSON.stringify(value, null, 2), 'utf8');
}

function getRootPath() {
  const stored = readConfig().path;
  if (!stored) return null;
  try {
    const real = fs.realpathSync(stored);
    const stat = fs.statSync(real);
    if (!stat.isDirectory()) return null;
    return real;
  } catch {
    return null;
  }
}

function normalizeRel(relativePath) {
  const rel = String(relativePath || '')
    .replace(/\\/g, '/')
    .replace(/^\/+/, '');
  if (!rel) throw new Error('Invalid path');
  const parts = rel.split('/').filter(Boolean);
  if (!parts.length || parts.some((part) => part === '.' || part === '..')) {
    throw new Error('Invalid path');
  }
  if (path.isAbsolute(rel)) throw new Error('Invalid path');
  return parts.join('/');
}

function resolveSafe(relativePath) {
  const root = getRootPath();
  if (!root) throw new Error('No vault folder selected');
  const rel = normalizeRel(relativePath);
  const rootReal = fs.realpathSync(root);
  const joined = path.resolve(rootReal, ...rel.split('/'));
  const prefix = rootReal.endsWith(path.sep) ? rootReal : `${rootReal}${path.sep}`;
  if (joined !== rootReal && !joined.startsWith(prefix)) {
    throw new Error('Path escapes vault folder');
  }
  return { rootReal, target: joined, rel };
}

function ensureParent(filePath) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
}

function writeFileAtomic(filePath, contents) {
  ensureParent(filePath);
  const tmp = `${filePath}.${process.pid}.${Date.now()}.tmp`;
  fs.writeFileSync(tmp, contents, 'utf8');
  try {
    fs.renameSync(tmp, filePath);
  } catch {
    fs.copyFileSync(tmp, filePath);
    fs.unlinkSync(tmp);
  }
}

function publicStatus() {
  const root = getRootPath();
  if (!root) return { connected: false, path: null, displayName: null };
  return {
    connected: true,
    path: root,
    displayName: path.basename(root) || 'Folder',
    kind: 'electron',
  };
}

async function pickFolder(event) {
  const win = BrowserWindow.fromWebContents(event.sender);
  const result = await dialog.showOpenDialog(win || undefined, {
    title: 'Φάκελος αποθήκευσης Next Move',
    properties: ['openDirectory', 'createDirectory'],
  });
  if (result.canceled || !result.filePaths?.[0]) {
    return { ...publicStatus(), canceled: true };
  }
  const chosen = fs.realpathSync(result.filePaths[0]);
  writeConfig({ path: chosen });
  return publicStatus();
}

function writeText(relativePath, contents) {
  const { target } = resolveSafe(relativePath);
  writeFileAtomic(target, String(contents ?? ''));
  return { ok: true, path: relativePath };
}

function readText(relativePath) {
  const { target } = resolveSafe(relativePath);
  if (!fs.existsSync(target)) return null;
  const stat = fs.statSync(target);
  if (!stat.isFile()) return null;
  return fs.readFileSync(target, 'utf8');
}

function exists(relativePath) {
  try {
    const { target } = resolveSafe(relativePath);
    return fs.existsSync(target);
  } catch {
    return false;
  }
}

function listDir(relativePath = '') {
  const root = getRootPath();
  if (!root) throw new Error('No vault folder selected');
  const target = relativePath ? resolveSafe(relativePath).target : root;
  if (!fs.existsSync(target)) return [];
  const entries = fs.readdirSync(target, { withFileTypes: true });
  const prefix = relativePath ? `${normalizeRel(relativePath)}/` : '';
  return entries.map((entry) => ({
    name: entry.name,
    kind: entry.isDirectory() ? 'dir' : 'file',
    relativePath: `${prefix}${entry.name}`.replace(/\\/g, '/'),
  }));
}

function removePath(relativePath) {
  const { target } = resolveSafe(relativePath);
  if (!fs.existsSync(target)) return { ok: true };
  fs.rmSync(target, { recursive: true, force: true });
  return { ok: true };
}

async function reveal() {
  const root = getRootPath();
  if (!root) throw new Error('No vault folder selected');
  const error = await shell.openPath(root);
  if (error) throw new Error(error);
  return { ok: true };
}

function disconnect() {
  writeConfig({ path: null });
  return publicStatus();
}

function wrap(handler) {
  return async (event, ...args) => {
    try {
      return { ok: true, data: await handler(event, ...args) };
    } catch (err) {
      return { ok: false, error: err.message || 'Vault error' };
    }
  };
}

function setupVaultIpc() {
  const handlers = [
    ['vault:get-status', wrap(async () => publicStatus())],
    ['vault:pick-folder', wrap(async (event) => pickFolder(event))],
    ['vault:disconnect', wrap(async () => disconnect())],
    ['vault:write-text', wrap(async (_event, relativePath, contents) => writeText(relativePath, contents))],
    ['vault:read-text', wrap(async (_event, relativePath) => readText(relativePath))],
    ['vault:exists', wrap(async (_event, relativePath) => exists(relativePath))],
    ['vault:list-dir', wrap(async (_event, relativePath) => listDir(relativePath))],
    ['vault:remove', wrap(async (_event, relativePath) => removePath(relativePath))],
    ['vault:reveal', wrap(async () => reveal())],
  ];

  for (const [channel, handler] of handlers) {
    ipcMain.removeHandler(channel);
    ipcMain.handle(channel, handler);
  }
}

module.exports = { setupVaultIpc };
