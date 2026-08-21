const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');

const distIndex = path.join(__dirname, '..', 'dist', 'index.html');
const electronBin = path.join(__dirname, '..', 'node_modules', 'electron', 'cli.js');
const mainEntry = path.join(__dirname, '..', 'electron', 'main.cjs');

function waitForDist() {
  return new Promise((resolve) => {
    if (fs.existsSync(distIndex)) {
      resolve();
      return;
    }
    const interval = setInterval(() => {
      if (fs.existsSync(distIndex)) {
        clearInterval(interval);
        resolve();
      }
    }, 300);
  });
}

function startElectron() {
  return spawn(process.execPath, [electronBin, mainEntry], {
    stdio: 'inherit',
    env: { ...process.env, ELECTRON_START_URL: 'http://127.0.0.1:17823' },
  });
}

async function main() {
  console.log('Waiting for Vite build…');
  await waitForDist();

  let electronProcess = startElectron();
  let lastMtime = fs.statSync(distIndex).mtimeMs;

  fs.watch(path.join(__dirname, '..', 'dist'), { recursive: true }, () => {
    try {
      const mtime = fs.statSync(distIndex).mtimeMs;
      if (mtime === lastMtime) return;
      lastMtime = mtime;
      console.log('Rebuild detected — restarting Electron…');
      electronProcess.kill();
      electronProcess = startElectron();
    } catch {
      /* ignore transient build states */
    }
  });

  electronProcess.on('exit', (code) => {
    if (code !== null) process.exit(code);
  });
}

main();
