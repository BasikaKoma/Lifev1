/**
 * Build Android debug APK on Windows paths with non-ASCII characters.
 * Uses subst X: to give Gradle/Kotlin an ASCII-only project root.
 */
const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const projectRoot = path.resolve(__dirname, '..');
const androidDir = path.join(projectRoot, 'android');
const apkSource = path.join(androidDir, 'app', 'build', 'outputs', 'apk', 'debug', 'app-debug.apk');
const releaseDir = path.join(projectRoot, 'release-android');
const drive = 'X:';

function findJavaHome() {
  const candidates = [
    path.join(process.env['ProgramFiles'] || '', 'Android', 'Android Studio', 'jbr'),
    path.join(process.env.LOCALAPPDATA || '', 'Programs', 'Android Studio', 'jbr'),
  ];
  for (const candidate of candidates) {
    if (fs.existsSync(path.join(candidate, 'bin', 'java.exe'))) return candidate;
  }
  return process.env.JAVA_HOME || '';
}

function run(cmd, opts = {}) {
  execSync(cmd, { stdio: 'inherit', ...opts });
}

function ensureProdCapacitorConfig() {
  const configPath = path.join(projectRoot, 'capacitor.config.json');
  const prodPath = path.join(projectRoot, 'capacitor.config.prod.json');
  if (fs.existsSync(prodPath)) {
    fs.copyFileSync(prodPath, configPath);
    console.log('Using production Capacitor config (bundled assets, no live-reload URL).');
  }
}

function main() {
  ensureProdCapacitorConfig();
  console.log('Building web assets and syncing Capacitor...');
  run('npm run cap:sync', { cwd: projectRoot, shell: true });

  const javaHome = findJavaHome();
  if (!javaHome) {
    console.error('Java not found. Install Android Studio or set JAVA_HOME.');
    process.exit(1);
  }

  console.log(`Using JAVA_HOME: ${javaHome}`);
  console.log(`Mapping ${drive} -> ${projectRoot}`);

  try {
    try {
      run(`subst ${drive} /D`, { shell: true });
    } catch {
      // drive may not exist
    }
    run(`subst ${drive} "${projectRoot}"`, { shell: true });

    console.log('Running Gradle assembleDebug...');
    run('.\\gradlew.bat assembleDebug', {
      cwd: `${drive}\\android`,
      shell: true,
      env: { ...process.env, JAVA_HOME: javaHome },
    });
  } finally {
    try {
      run(`subst ${drive} /D`, { shell: true });
    } catch {
      // ignore
    }
  }

  if (!fs.existsSync(apkSource)) {
    console.error('APK not found at expected path:', apkSource);
    process.exit(1);
  }

  fs.mkdirSync(releaseDir, { recursive: true });
  const pkg = require(path.join(projectRoot, 'package.json'));
  const version = pkg.version || '1.0.0';
  const dest = path.join(releaseDir, `lifev1-${version}-debug.apk`);
  fs.copyFileSync(apkSource, dest);

  const sizeMb = (fs.statSync(dest).size / (1024 * 1024)).toFixed(1);
  console.log('');
  console.log('APK ready:');
  console.log(`  ${dest}`);
  console.log(`  (${sizeMb} MB)`);
  console.log('');
  console.log('Transfer to phone (email, Drive, USB) and open to install.');
}

main();
