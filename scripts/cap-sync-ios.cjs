/**
 * Sync the iOS Capacitor project when it exists.
 * Adding/building iOS still requires a Mac (or a cloud macOS builder).
 */
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const projectRoot = path.resolve(__dirname, '..');
const iosDir = path.join(projectRoot, 'ios');

if (!fs.existsSync(iosDir)) {
  console.log('No ios/ folder — skip. On a Mac: npm install && npx cap add ios && npm run cap:sync');
  process.exit(0);
}

execSync('npx cap sync ios', { cwd: projectRoot, stdio: 'inherit', shell: true });
execSync('node scripts/patch-ios-info-plist.cjs', { cwd: projectRoot, stdio: 'inherit', shell: true });
