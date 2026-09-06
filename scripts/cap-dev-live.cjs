/**
 * Live-reload dev on Android: phone loads Vite from your PC (no new APK per code change).
 *
 * Usage:
 *   Terminal 1: npm run cap:dev
 *   Terminal 2: npm run dev:mobile
 *   Then Run ▶ in Android Studio (or: npx cap run android)
 *
 * Restore production config: npm run cap:dev:restore
 */
const fs = require('fs');
const path = require('path');
const os = require('os');
const { execSync } = require('child_process');

const projectRoot = path.resolve(__dirname, '..');
const configPath = path.join(projectRoot, 'capacitor.config.json');
const backupPath = path.join(projectRoot, 'capacitor.config.prod.json');

function getLocalIp() {
  for (const ifaces of Object.values(os.networkInterfaces())) {
    for (const iface of ifaces || []) {
      if (iface.family === 'IPv4' && !iface.internal) return iface.address;
    }
  }
  return null;
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function writeJson(filePath, data) {
  fs.writeFileSync(filePath, `${JSON.stringify(data, null, 2)}\n`, 'utf8');
}

function restore() {
  if (!fs.existsSync(backupPath)) {
    console.log('No dev backup found — capacitor.config.json unchanged.');
    return;
  }
  fs.copyFileSync(backupPath, configPath);
  console.log('Restored production capacitor.config.json');
}

function enableDev() {
  const ip = getLocalIp();
  if (!ip) {
    console.error('Could not detect local IPv4. Connect Wi-Fi and retry.');
    process.exit(1);
  }

  if (!fs.existsSync(backupPath)) {
    fs.copyFileSync(configPath, backupPath);
  }

  const base = readJson(configPath);
  const devConfig = {
    ...base,
    server: {
      url: `http://${ip}:5173`,
      cleartext: true,
    },
  };
  writeJson(configPath, devConfig);

  console.log('');
  console.log('=== Android live dev ===');
  console.log(`Phone will load: http://${ip}:5173`);
  console.log('');
  console.log('1) Keep this config, then in another terminal:');
  console.log('     npm run dev:mobile');
  console.log('');
  console.log('2) Phone + PC on the SAME Wi-Fi');
  console.log('');
  console.log('3) Run once from Android Studio (green ▶) or:');
  console.log('     npx cap run android');
  console.log('');
  console.log('Code changes appear after save (Vite HMR).');
  console.log('When done: npm run cap:dev:restore && npm run cap:sync');
  console.log('');

  console.log('Syncing Android project...');
  execSync('npx cap sync android', { cwd: projectRoot, stdio: 'inherit', shell: true });
  const iosDir = path.join(projectRoot, 'ios');
  if (fs.existsSync(iosDir)) {
    execSync('npx cap sync ios', { cwd: projectRoot, stdio: 'inherit', shell: true });
  }
}

const mode = process.argv[2];
if (mode === 'restore') {
  restore();
} else {
  enableDev();
}
