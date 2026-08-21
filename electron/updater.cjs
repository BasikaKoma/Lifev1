const http = require('http');
const fs = require('fs');
const path = require('path');
const os = require('os');
const { app, dialog, ipcMain } = require('electron');
const { autoUpdater } = require('electron-updater');

const UPDATE_PORT = 17824;
const UPDATE_DIR = path.join(os.homedir(), 'lifev1-release');

const MIME = {
  '.yml': 'text/yaml; charset=utf-8',
  '.yaml': 'text/yaml; charset=utf-8',
  '.exe': 'application/octet-stream',
  '.blockmap': 'application/octet-stream',
  '.json': 'application/json; charset=utf-8',
};

let updateServer = null;
let mainWindowRef = null;
let ipcRegistered = false;

function sendStatus(payload) {
  if (mainWindowRef && !mainWindowRef.isDestroyed()) {
    mainWindowRef.webContents.send('updater:status', payload);
  }
}

/** Dev-only: serve ~/lifev1-release when LIFEV1_UPDATE_URL points to localhost. */
function startLocalUpdateServer() {
  if (updateServer) return Promise.resolve(updateServer);

  return new Promise((resolve, reject) => {
    if (!fs.existsSync(UPDATE_DIR)) {
      fs.mkdirSync(UPDATE_DIR, { recursive: true });
    }

    const server = http.createServer((req, res) => {
      const pathname = decodeURIComponent(new URL(req.url || '/', 'http://127.0.0.1').pathname);
      const safeSuffix = path
        .normalize(pathname)
        .replace(/^(\.\.[/\\])+/, '')
        .replace(/^[/\\]+/, '');
      const filePath = path.join(UPDATE_DIR, safeSuffix);

      if (!filePath.startsWith(UPDATE_DIR + path.sep) && filePath !== UPDATE_DIR) {
        res.writeHead(403);
        res.end('Forbidden');
        return;
      }

      fs.readFile(filePath, (err, data) => {
        if (err) {
          res.writeHead(404);
          res.end('Not found');
          return;
        }
        const ext = path.extname(filePath).toLowerCase();
        res.writeHead(200, { 'Content-Type': MIME[ext] || 'application/octet-stream' });
        res.end(data);
      });
    });

    server.on('error', reject);
    server.listen(UPDATE_PORT, '127.0.0.1', () => {
      updateServer = server;
      resolve(server);
    });
  });
}

function registerUpdaterIpc() {
  if (ipcRegistered) return;
  ipcRegistered = true;

  ipcMain.handle('updater:get-info', () => ({
    version: app.getVersion(),
    feedUrl: autoUpdater.getFeedURL() || null,
  }));

  ipcMain.handle('updater:check', async () => {
    try {
      sendStatus({ state: 'checking' });
      const result = await autoUpdater.checkForUpdates();
      return {
        ok: true,
        version: result?.updateInfo?.version || null,
      };
    } catch (err) {
      sendStatus({ state: 'error', message: err.message || 'Update check failed' });
      return { ok: false, error: err.message || 'Update check failed' };
    }
  });
}

function setupAutoUpdater(mainWindow) {
  mainWindowRef = mainWindow;
  registerUpdaterIpc();

  autoUpdater.autoDownload = true;
  autoUpdater.autoInstallOnAppQuit = true;
  autoUpdater.autoRunAppAfterInstall = true;

  autoUpdater.on('checking-for-update', () => {
    sendStatus({ state: 'checking' });
  });

  autoUpdater.on('update-available', (info) => {
    sendStatus({
      state: 'downloading',
      version: info.version,
      message: `Κατέβασμα έκδοσης ${info.version}…`,
    });
  });

  autoUpdater.on('update-not-available', () => {
    sendStatus({
      state: 'idle',
      version: app.getVersion(),
      message: 'Έχεις την τελευταία έκδοση.',
    });
  });

  autoUpdater.on('download-progress', (progress) => {
    sendStatus({
      state: 'downloading',
      percent: Math.round(progress.percent || 0),
      message: `Κατέβασμα ενημέρωσης… ${Math.round(progress.percent || 0)}%`,
    });
  });

  autoUpdater.on('update-downloaded', (info) => {
    sendStatus({
      state: 'ready',
      version: info.version,
      message: `Η έκδοση ${info.version} είναι έτοιμη.`,
    });

    if (!mainWindowRef) return;
    dialog
      .showMessageBox(mainWindowRef, {
        type: 'info',
        title: 'lifev1',
        message: 'Νέα έκδοση έτοιμη',
        detail: `Έκδοση ${info.version}. Κλείσε και ξαναάνοιξε την εφαρμογή για να εφαρμοστεί η ενημέρωση.`,
        buttons: ['Επανεκκίνηση τώρα', 'Αργότερα'],
        defaultId: 0,
      })
      .then(({ response }) => {
        if (response === 0) autoUpdater.quitAndInstall(false, true);
      });
  });

  autoUpdater.on('error', (err) => {
    const message = err.message || 'Update check failed';
    console.log('Auto-update check:', message);
    sendStatus({ state: 'error', message });
  });

  const override =
    process.env.LIFEV1_UPDATE_URL?.trim() || process.env.NEXT_MOVE_UPDATE_URL?.trim();
  if (override) {
    autoUpdater.setFeedURL({ provider: 'generic', url: override.replace(/\/$/, '') });
    console.log('Auto-update feed (override):', override);
  } else {
    console.log('Auto-update feed:', autoUpdater.getFeedURL());
  }

  setTimeout(() => {
    autoUpdater.checkForUpdates().catch(() => {});
  }, 4000);

  setInterval(() => {
    autoUpdater.checkForUpdates().catch(() => {});
  }, 5 * 60 * 1000);
}

async function initAutoUpdates(mainWindow) {
  if (!mainWindow) return;

  try {
    const override =
    process.env.LIFEV1_UPDATE_URL?.trim() || process.env.NEXT_MOVE_UPDATE_URL?.trim();
    if (override && /^https?:\/\/(127\.0\.0\.1|localhost)(:\d+)?/i.test(override)) {
      await startLocalUpdateServer();
    }
    setupAutoUpdater(mainWindow);
  } catch (err) {
    console.error('Auto-update init failed:', err.message);
  }
}

module.exports = { initAutoUpdates, startLocalUpdateServer };
