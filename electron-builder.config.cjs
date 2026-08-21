const path = require('path');
const os = require('os');
const { loadEnv } = require('./scripts/load-env.cjs');
const { tryGetUpdateFeedUrl } = require('./electron/updateConfig.cjs');

loadEnv();

/** Build outside the project folder to avoid Windows EPERM on paths with non-ASCII chars. */
const outputDir = path.join(os.homedir(), 'lifev1-release');

const updateFeedUrl = tryGetUpdateFeedUrl();
if (!updateFeedUrl) {
  console.warn(
    '[lifev1] GITHUB_OWNER / GITHUB_REPO not set — build will succeed, but auto-update URL is omitted until .env is configured.'
  );
}

/** @type {import('electron-builder').Configuration} */
module.exports = {
  appId: 'com.lifev1.app',
  productName: 'lifev1',
  icon: path.join(__dirname, 'public', 'monogramm.png'),
  directories: {
    output: outputDir,
  },
  files: ['dist/**/*', 'electron/**/*'],
  win: {
    target: ['nsis'],
    artifactName: 'lifev1-Setup-${version}.${ext}',
  },
  nsis: {
    oneClick: false,
    allowToChangeInstallationDirectory: true,
    createDesktopShortcut: true,
    createStartMenuShortcut: true,
    shortcutName: 'lifev1',
    include: path.join(__dirname, 'build', 'installer.nsh'),
  },
  ...(updateFeedUrl
    ? {
        publish: {
          provider: 'generic',
          url: updateFeedUrl,
        },
      }
    : {}),
};
