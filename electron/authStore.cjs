const { app, ipcMain, safeStorage } = require('electron');
const fs = require('fs');
const path = require('path');

function storePath() {
  return path.join(app.getPath('userData'), 'auth-store.json');
}

function emptyStore() {
  return { items: {}, login: null, staySignedOut: false };
}

function readStore() {
  try {
    const raw = JSON.parse(fs.readFileSync(storePath(), 'utf8'));
    if (!raw || typeof raw !== 'object') return emptyStore();
    const items = raw.items && typeof raw.items === 'object' ? raw.items : {};
    return {
      items,
      login: raw.login || null,
      staySignedOut: Boolean(raw.staySignedOut),
    };
  } catch {
    return emptyStore();
  }
}

function writeStore(store) {
  const filePath = storePath();
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  const tmp = `${filePath}.${process.pid}.${Date.now()}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(store), 'utf8');
  try {
    fs.renameSync(tmp, filePath);
  } catch {
    fs.copyFileSync(tmp, filePath);
    fs.unlinkSync(tmp);
  }
}

function encryptValue(plain) {
  const text = String(plain ?? '');
  if (!safeStorage.isEncryptionAvailable()) {
    return { enc: false, value: text };
  }
  return {
    enc: true,
    value: safeStorage.encryptString(text).toString('base64'),
  };
}

function decryptValue(payload) {
  if (payload == null) return null;
  if (typeof payload === 'string') return payload;
  if (typeof payload !== 'object') return null;
  const value = payload.value;
  if (typeof value !== 'string') return null;
  if (!payload.enc) return value;
  if (!safeStorage.isEncryptionAvailable()) return null;
  try {
    return safeStorage.decryptString(Buffer.from(value, 'base64'));
  } catch {
    return null;
  }
}

function storageGet(key) {
  const name = String(key || '');
  if (!name) return null;
  return decryptValue(readStore().items[name]);
}

function storageSet(key, value) {
  const name = String(key || '');
  if (!name) return null;
  const store = readStore();
  store.items[name] = encryptValue(value);
  writeStore(store);
  return true;
}

function storageRemove(key) {
  const name = String(key || '');
  if (!name) return false;
  const store = readStore();
  if (!(name in store.items)) return false;
  delete store.items[name];
  writeStore(store);
  return true;
}

function getLogin() {
  const login = readStore().login;
  if (!login || typeof login !== 'object') return null;
  const email = decryptValue(login.email);
  const password = decryptValue(login.password);
  if (!email || !password) return null;
  return { email, password };
}

function getBootstrap() {
  return {
    login: getLogin(),
    staySignedOut: Boolean(readStore().staySignedOut),
  };
}

function markSignedOut() {
  const store = readStore();
  store.staySignedOut = true;
  writeStore(store);
  return { staySignedOut: true };
}

function clearSignedOut() {
  const store = readStore();
  store.staySignedOut = false;
  writeStore(store);
  return { staySignedOut: false };
}

function saveLogin(payload) {
  const email = String(payload?.email || '').trim();
  const password = String(payload?.password || '');
  if (!email || !password) {
    throw new Error('Email and password are required.');
  }
  if (!safeStorage.isEncryptionAvailable()) {
    throw new Error('OS key encryption is not available.');
  }
  const store = readStore();
  store.login = {
    email: encryptValue(email),
    password: encryptValue(password),
  };
  store.staySignedOut = false;
  writeStore(store);
  return { saved: true };
}

function clearLogin() {
  const store = readStore();
  store.login = null;
  writeStore(store);
  return { saved: false };
}

function wrap(handler) {
  return async (event, ...args) => {
    try {
      return { ok: true, data: await handler(event, ...args) };
    } catch (err) {
      return { ok: false, error: err.message || 'Auth store error' };
    }
  };
}

function setupAuthStoreIpc() {
  const handlers = [
    ['auth:storage-get', wrap(async (_event, key) => storageGet(key))],
    ['auth:storage-set', wrap(async (_event, key, value) => storageSet(key, value))],
    ['auth:storage-remove', wrap(async (_event, key) => storageRemove(key))],
    ['auth:get-login', wrap(async () => getLogin())],
    ['auth:get-bootstrap', wrap(async () => getBootstrap())],
    ['auth:save-login', wrap(async (_event, payload) => saveLogin(payload))],
    ['auth:clear-login', wrap(async () => clearLogin())],
    ['auth:mark-signed-out', wrap(async () => markSignedOut())],
    ['auth:clear-signed-out', wrap(async () => clearSignedOut())],
  ];

  for (const [channel, handler] of handlers) {
    ipcMain.removeHandler(channel);
    ipcMain.handle(channel, handler);
  }
}

module.exports = { setupAuthStoreIpc };
