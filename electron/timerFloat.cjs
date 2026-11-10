const { BrowserWindow, app, ipcMain, screen } = require('electron');
const fs = require('fs');
const path = require('path');

const WIDTH = 272;
const HEIGHT = 100;
const MARGIN = 16;
const COMMANDS = new Set(['pause', 'resume', 'stop', 'open']);

function positionFile() {
  return path.join(app.getPath('userData'), 'timer-float.json');
}

function readPosition() {
  try {
    const raw = JSON.parse(fs.readFileSync(positionFile(), 'utf8'));
    const x = Math.round(Number(raw?.x));
    const y = Math.round(Number(raw?.y));
    if (!Number.isFinite(x) || !Number.isFinite(y)) return null;
    // A display that was unplugged would leave the timer off screen.
    const area = screen.getDisplayMatching({ x, y, width: WIDTH, height: HEIGHT }).workArea;
    const inside = x >= area.x - WIDTH / 2
      && y >= area.y
      && x + WIDTH / 2 <= area.x + area.width
      && y + HEIGHT / 2 <= area.y + area.height;
    return inside ? { x, y } : null;
  } catch {
    return null;
  }
}

function writePosition(bounds) {
  try {
    fs.writeFileSync(positionFile(), JSON.stringify({ x: bounds.x, y: bounds.y }));
  } catch {
    /* the position is only a convenience */
  }
}

function defaultPosition() {
  const area = screen.getPrimaryDisplay().workArea;
  return {
    x: area.x + area.width - WIDTH - MARGIN,
    y: area.y + area.height - HEIGHT - MARGIN,
  };
}

function sanitizeState(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const number = (value) => (Number.isFinite(Number(value)) ? Number(value) : 0);
  return {
    label: String(raw.label || '').slice(0, 160),
    blockType: String(raw.blockType || '').slice(0, 60),
    deep: raw.deep === true,
    running: raw.running === true,
    startedAt: number(raw.startedAt) || null,
    accumulatedMs: Math.max(0, number(raw.accumulatedMs)),
    targetMinutes: Math.max(0, number(raw.targetMinutes)),
  };
}

/**
 * A small always-on-top copy of the work timer, shown while lifev1 is not the
 * focused window so a running timer is never out of sight.
 */
function setupTimerFloat({ onRunningChange } = {}) {
  let mainWindow = null;
  let floatWindow = null;
  let state = null;

  const alive = (win) => Boolean(win && !win.isDestroyed());

  const send = () => {
    if (alive(floatWindow)) floatWindow.webContents.send('timer-float:state', state);
  };

  const createFloat = () => {
    const position = readPosition() || defaultPosition();
    floatWindow = new BrowserWindow({
      ...position,
      width: WIDTH,
      height: HEIGHT,
      show: false,
      frame: false,
      transparent: true,
      backgroundColor: '#00000000',
      hasShadow: false,
      resizable: false,
      minimizable: false,
      maximizable: false,
      fullscreenable: false,
      skipTaskbar: true,
      focusable: false,
      alwaysOnTop: true,
      title: 'lifev1 timer',
      webPreferences: {
        contextIsolation: true,
        nodeIntegration: false,
        sandbox: true,
        preload: path.join(__dirname, 'timerFloatPreload.cjs'),
      },
    });
    // The highest level keeps it above full-screen windows and the taskbar.
    floatWindow.setAlwaysOnTop(true, 'screen-saver');
    floatWindow.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
    floatWindow.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
    floatWindow.webContents.on('will-navigate', (event) => event.preventDefault());
    floatWindow.on('moved', () => {
      if (alive(floatWindow)) writePosition(floatWindow.getBounds());
    });
    floatWindow.on('closed', () => {
      floatWindow = null;
    });
    floatWindow.loadFile(path.join(__dirname, 'timerFloat.html'));
  };

  const shouldShow = () => {
    if (!state || !alive(mainWindow)) return false;
    return !mainWindow.isVisible() || mainWindow.isMinimized() || !mainWindow.isFocused();
  };

  const sync = () => {
    if (!shouldShow()) {
      if (alive(floatWindow) && floatWindow.isVisible()) floatWindow.hide();
      return;
    }
    if (!alive(floatWindow)) createFloat();
    send();
    if (!floatWindow.isVisible()) floatWindow.showInactive();
    floatWindow.setAlwaysOnTop(true, 'screen-saver');
  };

  ipcMain.removeAllListeners('timer-float:update');
  ipcMain.on('timer-float:update', (event, raw) => {
    if (!alive(mainWindow) || event.sender !== mainWindow.webContents) return;
    state = sanitizeState(raw);
    onRunningChange?.(Boolean(state?.running));
    send();
    sync();
  });

  ipcMain.removeAllListeners('timer-float:ready');
  ipcMain.on('timer-float:ready', (event) => {
    if (alive(floatWindow) && event.sender === floatWindow.webContents) send();
  });

  ipcMain.removeAllListeners('timer-float:command');
  ipcMain.on('timer-float:command', (event, action) => {
    if (!alive(floatWindow) || event.sender !== floatWindow.webContents) return;
    if (!COMMANDS.has(action) || !alive(mainWindow)) return;
    if (action === 'open') {
      if (mainWindow.isMinimized()) mainWindow.restore();
      if (!mainWindow.isVisible()) mainWindow.show();
      mainWindow.focus();
    }
    mainWindow.webContents.send('timer-float:action', action);
  });

  const destroy = () => {
    if (alive(floatWindow)) floatWindow.destroy();
    floatWindow = null;
  };

  return {
    attach(win) {
      mainWindow = win;
      state = null;
      onRunningChange?.(false);
      for (const name of ['focus', 'blur', 'show', 'hide', 'minimize', 'restore']) {
        win.on(name, sync);
      }
      // Reloading the app clears what it last reported until it reports again.
      win.webContents.on('did-start-navigation', (details, _url, isInPlace, isMainFrame) => {
        const mainFrame = details?.isMainFrame ?? isMainFrame;
        const sameDocument = details?.isSameDocument ?? isInPlace;
        if (!mainFrame || sameDocument) return;
        state = null;
        onRunningChange?.(false);
        sync();
      });
      // Its own window would otherwise keep the app alive after the main one closes.
      win.on('closed', () => {
        mainWindow = null;
        destroy();
      });
    },
    destroy,
  };
}

module.exports = { setupTimerFloat };
