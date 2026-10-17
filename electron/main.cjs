const { app, BrowserWindow, Menu, Notification, Tray, nativeImage, session, shell, ipcMain } = require('electron');
const http = require('http');
const fs = require('fs');
const path = require('path');
const { initAutoUpdates } = require('./updater.cjs');
const { setupAuthStoreIpc } = require('./authStore.cjs');
const { setupBrainIpc } = require('./brain.cjs');
const { setupCamerasIpc } = require('./cameras.cjs');
const { setupVaultIpc } = require('./vault.cjs');

const APP_PORT = 17823;
const DEV_URL = 'http://localhost:5173';
const APP_URL = `http://127.0.0.1:${APP_PORT}`;
const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.svg': 'image/svg+xml',
  '.webp': 'image/webp',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ico': 'image/x-icon',
  '.map': 'application/json',
};

let mainWindow = null;
let staticServer = null;
let allowWindowClose = false;
let scaleBackgroundEnabled = false;
let notificationsBackgroundEnabled = false;
let tray = null;
let updateDownloaded = false;
let quittingForUpdate = false;

function getDistPath() {
  return path.join(__dirname, '..', 'dist');
}

function getAppIcon() {
  const iconPath = path.join(__dirname, '..', 'public', 'monogramm.png');
  const icon = nativeImage.createFromPath(iconPath);
  return icon.isEmpty() ? undefined : icon;
}

function createStaticServer(rootDir) {
  return new Promise((resolve, reject) => {
    const normalizedRoot = path.resolve(rootDir);

    const server = http.createServer((req, res) => {
      const requestUrl = new URL(req.url || '/', 'http://127.0.0.1');
      const pathname = decodeURIComponent(requestUrl.pathname);
      const safeSuffix = path
        .normalize(pathname)
        .replace(/^(\.\.[/\\])+/, '')
        .replace(/^[/\\]+/, '');
      let filePath = path.join(normalizedRoot, safeSuffix);

      if (!filePath.startsWith(normalizedRoot + path.sep) && filePath !== normalizedRoot) {
        res.writeHead(403);
        res.end('Forbidden');
        return;
      }

      fs.stat(filePath, (statErr, stats) => {
        if (statErr || !stats.isFile()) {
          filePath = path.join(normalizedRoot, 'index.html');
        }

        fs.readFile(filePath, (readErr, data) => {
          if (readErr) {
            res.writeHead(404);
            res.end('Not found');
            return;
          }

          const ext = path.extname(filePath).toLowerCase();
          res.writeHead(200, { 'Content-Type': MIME_TYPES[ext] || 'application/octet-stream' });
          res.end(data);
        });
      });
    });

    server.on('error', reject);
    server.listen(APP_PORT, '127.0.0.1', () => resolve(server));
  });
}

async function getAppUrl() {
  if (!app.isPackaged) {
    return process.env.ELECTRON_START_URL || DEV_URL;
  }

  staticServer = await createStaticServer(getDistPath());
  return APP_URL;
}

async function clearStaleServiceWorkers() {
  try {
    await session.defaultSession.clearStorageData({
      storages: ['serviceworkers', 'cachestorage'],
    });
  } catch (err) {
    console.warn('Failed to clear service worker storage:', err.message);
  }
}

function setupPermissions() {
  session.defaultSession.setPermissionRequestHandler((_webContents, permission, callback) => {
    const allowed = ['media', 'mediaKeySystem', 'clipboard-read', 'bluetooth', 'bluetooth-scanning'];
    callback(allowed.includes(permission));
  });
}

/** Closing the window hides to the tray while the scale or reminders need the app running. */
function keepsRunningInBackground() {
  return scaleBackgroundEnabled || notificationsBackgroundEnabled;
}

function stopBackgroundModes() {
  scaleBackgroundEnabled = false;
  notificationsBackgroundEnabled = false;
}

function getPreloadPath() {
  return path.join(__dirname, 'preload.cjs');
}

function setupCloseGuard(win) {
  allowWindowClose = false;
  let closeFlushTimer = null;

  const completeClose = () => {
    if (closeFlushTimer) {
      clearTimeout(closeFlushTimer);
      closeFlushTimer = null;
    }
    if (mainWindow && !mainWindow.isDestroyed()) {
      allowWindowClose = true;
      mainWindow.close();
    }
  };

  win.on('close', (event) => {
    if (allowWindowClose || quittingForUpdate) return;
    // A pending update must actually quit — hiding to tray would skip the installer.
    if (keepsRunningInBackground() && !updateDownloaded) {
      event.preventDefault();
      win.hide();
      ensureTray();
      return;
    }

    event.preventDefault();

    if (win.webContents.isDestroyed() || win.webContents.isLoading()) {
      completeClose();
      return;
    }

    win.webContents.send('request-flush-save');
    closeFlushTimer = setTimeout(completeClose, 8000);
  });

  ipcMain.removeAllListeners('flush-save-complete');
  ipcMain.on('flush-save-complete', () => {
    if (quittingForUpdate) return;
    completeClose();
  });
}

function prepareQuitForUpdate() {
  quittingForUpdate = true;
  stopBackgroundModes();
  allowWindowClose = true;
  if (tray && !tray.isDestroyed()) {
    tray.destroy();
    tray = null;
  }
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1440,
    height: 920,
    minWidth: 960,
    minHeight: 640,
    title: 'lifev1',
    icon: getAppIcon(),
    autoHideMenuBar: true,
    show: false,
    backgroundColor: '#0a0a0a',
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      preload: getPreloadPath(),
    },
  });

  setupCloseGuard(mainWindow);

  // Chromium caret browsing (F7) draws a text caret on every click.
  mainWindow.webContents.on('before-input-event', (event, input) => {
    if (input.key === 'F7') event.preventDefault();
  });

  mainWindow.once('ready-to-show', () => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.show();
    }
  });

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: 'deny' };
  });

  mainWindow.webContents.on('did-fail-load', (_event, errorCode, errorDescription, validatedURL) => {
    console.error('Failed to load:', validatedURL, errorCode, errorDescription);
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

async function loadApp() {
  const url = await getAppUrl();
  await mainWindow.loadURL(url);
}

function ensureTray() {
  if (tray && !tray.isDestroyed()) return tray;
  const icon = getAppIcon();
  tray = new Tray(icon || nativeImage.createEmpty());
  tray.setToolTip(trayTooltip());
  tray.setContextMenu(
    Menu.buildFromTemplate([
      {
        label: 'Άνοιγμα',
        click: () => focusMainWindow(),
      },
      {
        label: 'Έξοδος',
        click: () => {
          stopBackgroundModes();
          allowWindowClose = true;
          if (tray && !tray.isDestroyed()) {
            tray.destroy();
            tray = null;
          }
          app.quit();
        },
      },
    ]),
  );
  tray.on('click', () => focusMainWindow());
  return tray;
}

function trayTooltip() {
  if (scaleBackgroundEnabled && notificationsBackgroundEnabled) return 'lifev1 · ζυγαριά και ειδοποιήσεις';
  if (scaleBackgroundEnabled) return 'lifev1 · ζυγαριά σε αναμονή';
  return 'lifev1 · ειδοποιήσεις ενεργές';
}

function syncBackgroundTray() {
  if (keepsRunningInBackground()) {
    ensureTray().setToolTip(trayTooltip());
  } else if (tray && !tray.isDestroyed() && (!mainWindow || mainWindow.isVisible())) {
    tray.destroy();
    tray = null;
  }
  // A hidden window is throttled by Chromium; reminders need the Realtime socket alive.
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.setBackgroundThrottling(!notificationsBackgroundEnabled);
  }
}

function setupScaleBackgroundIpc() {
  ipcMain.removeAllListeners('scale-background-enabled');
  ipcMain.on('scale-background-enabled', (_event, enabled) => {
    scaleBackgroundEnabled = Boolean(enabled);
    syncBackgroundTray();
  });
}

const shownNotifications = new Map();

function setupNotificationsIpc() {
  ipcMain.removeAllListeners('notifications-background-enabled');
  ipcMain.on('notifications-background-enabled', (_event, enabled) => {
    notificationsBackgroundEnabled = Boolean(enabled);
    syncBackgroundTray();
  });

  ipcMain.removeHandler('notifications:show');
  ipcMain.handle('notifications:show', (_event, payload) => {
    if (!Notification.isSupported()) return { ok: false };
    const title = String(payload?.title || 'lifev1').slice(0, 160);
    const body = String(payload?.body || '').slice(0, 400);
    const url = typeof payload?.url === 'string' ? payload.url : '/';
    const tag = String(payload?.tag || `n-${Date.now()}`);

    shownNotifications.get(tag)?.close();
    const notification = new Notification({ title, body, icon: getAppIcon() });
    // Keep a reference: a garbage-collected Notification loses its click handler.
    shownNotifications.set(tag, notification);
    notification.on('click', () => {
      focusMainWindow();
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('notifications:open', url);
      }
    });
    notification.on('close', () => {
      if (shownNotifications.get(tag) === notification) shownNotifications.delete(tag);
    });
    notification.show();
    return { ok: true };
  });
}

function focusMainWindow() {
  if (!mainWindow || mainWindow.isDestroyed()) return;
  if (mainWindow.isMinimized()) mainWindow.restore();
  if (!mainWindow.isVisible()) mainWindow.show();
  mainWindow.focus();
}

const gotSingleInstanceLock = app.requestSingleInstanceLock();

if (!gotSingleInstanceLock) {
  // Exit immediately — app.quit() can leave a brief zombie on Windows that blocks the installer.
  app.exit(0);
} else {
  app.on('second-instance', () => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      focusMainWindow();
      return;
    }
    app.whenReady().then(() => focusMainWindow());
  });

  // Windows toasts are attributed by AppUserModelID; it must match the installer's appId.
  if (process.platform === 'win32') app.setAppUserModelId('com.lifev1.app');

  app.whenReady().then(async () => {
    setupPermissions();
    setupScaleBackgroundIpc();
    setupNotificationsIpc();
    setupAuthStoreIpc();
    setupBrainIpc();
    setupCamerasIpc();
    setupVaultIpc();
    if (app.isPackaged) {
      await clearStaleServiceWorkers();
    }
    createWindow();
    await loadApp();

    if (app.isPackaged) {
      initAutoUpdates(mainWindow, {
        prepareQuitForUpdate,
        onUpdateDownloaded: () => {
          updateDownloaded = true;
        },
      });
    }

    app.on('activate', async () => {
      if (BrowserWindow.getAllWindows().length === 0) {
        createWindow();
        await loadApp();
      } else {
        focusMainWindow();
      }
    });
  });

  app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') {
      app.quit();
    }
  });

  app.on('before-quit', () => {
    allowWindowClose = true;
    stopBackgroundModes();
    if (tray && !tray.isDestroyed()) {
      tray.destroy();
      tray = null;
    }
    if (staticServer) {
      staticServer.close();
      staticServer = null;
    }
  });
}
