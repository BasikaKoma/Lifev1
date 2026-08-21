const fs = require('fs');
const path = require('path');
const os = require('os');
const { execSync } = require('child_process');

const releaseDir = path.join(os.homedir(), 'lifev1-release');
const projectDist = path.join(__dirname, '..', 'dist');

for (const exe of ['lifev1.exe', 'Next Move.exe']) {
  try {
    execSync(`taskkill /F /IM "${exe}" /T`, { stdio: 'ignore' });
  } catch {
    /* not running */
  }
}

try {
  execSync('taskkill /F /IM electron.exe /T', { stdio: 'ignore' });
} catch {
  /* not running */
}

function rm(dir) {
  if (!fs.existsSync(dir)) return;
  fs.rmSync(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 400 });
}

rm(releaseDir);

// Remove stale electron-builder artifacts from dist (when config was not loaded)
if (fs.existsSync(projectDist)) {
  rm(path.join(projectDist, 'win-unpacked'));
  for (const name of fs.readdirSync(projectDist)) {
    if (/Setup.*\.exe$/i.test(name) || name.endsWith('.blockmap') || name === 'builder-debug.yml') {
      rm(path.join(projectDist, name));
    }
  }
}

console.log(`Cleaned ${releaseDir}`);
