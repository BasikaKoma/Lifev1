const path = require('path');
const os = require('os');
const { execSync } = require('child_process');

const outputDir = path.join(os.homedir(), 'lifev1-release');
const configPath = path.join(__dirname, '..', 'electron-builder.config.cjs');
const extraArgs = process.argv.slice(2).join(' ');

execSync(`npx electron-builder --config "${configPath}" ${extraArgs}`, {
  stdio: 'inherit',
});
