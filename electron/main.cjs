const { app, BrowserWindow, Menu, Tray, nativeImage, session, shell, ipcMain } = require('electron');
const http = require('http');
const fs = require('fs');
const path = require('path');
const { initAutoUpdates } = require('./updater.cjs');
const { setupBrainIpc } = require('./brain.cjs');
const { setupCamerasIpc } = require('./cameras.cjs');

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
let tray = null;

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
    if (allowWindowClose) return;
    if (scaleBackgroundEnabled) {
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
    completeClose();
  });
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
  tray.setToolTip('lifev1 · ζυγαριά σε αναμονή');
  tray.setContextMenu(
    Menu.buildFromTemplate([
      {
        label: 'Άνοιγμα',
        click: () => focusMainWindow(),
      },
      {
        label: 'Έξοδος',
        click: () => {
          scaleBackgroundEnabled = false;
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

function setupScaleBackgroundIpc() {
  ipcMain.removeAllListeners('scale-background-enabled');
  ipcMain.on('scale-background-enabled', (_event, enabled) => {
    scaleBackgroundEnabled = Boolean(enabled);
    if (scaleBackgroundEnabled) {
      ensureTray();
    } else if (tray && !tray.isDestroyed() && (!mainWindow || mainWindow.isVisible())) {
      tray.destroy();
      tray = null;
    }
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

  app.whenReady().then(async () => {
    setupPermissions();
    setupScaleBackgroundIpc();
    setupBrainIpc();
    setupCamerasIpc();
    if (app.isPackaged) {
      await clearStaleServiceWorkers();
    }
    createWindow();
    await loadApp();

    if (app.isPackaged) {
      initAutoUpdates(mainWindow);
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
