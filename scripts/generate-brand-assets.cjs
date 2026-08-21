const fs = require('fs');
const path = require('path');
const sharp = require('sharp');
const toIco = require('to-ico');

const ROOT = path.join(__dirname, '..');
const MONOGRAM_SOURCE = path.join(ROOT, 'resources', 'monogramm-source.png');
const LOGO_SOURCE = path.join(ROOT, 'resources', 'logo-source.png');
const NEW_MONOGRAM = path.join(ROOT, 'public', 'new logo mono.png');

const ANDROID_LAUNCHER = {
  'mipmap-mdpi': 48,
  'mipmap-hdpi': 72,
  'mipmap-xhdpi': 96,
  'mipmap-xxhdpi': 144,
  'mipmap-xxxhdpi': 192,
};

const ANDROID_FOREGROUND = {
  'mipmap-mdpi': 108,
  'mipmap-hdpi': 162,
  'mipmap-xhdpi': 216,
  'mipmap-xxhdpi': 324,
  'mipmap-xxxhdpi': 432,
};

/** Crop the square logo source down to the "lifev1" wordmark so it can scale in the UI. */
async function writeWordmark(inputPath, outputPath) {
  const trimmed = await sharp(inputPath).trim({ threshold: 18 }).toBuffer();
  const meta = await sharp(trimmed).metadata();
  const padX = Math.max(16, Math.round((meta.width || 0) * 0.04));
  const padY = Math.max(12, Math.round((meta.height || 0) * 0.08));

  await sharp(trimmed)
    .extend({
      top: padY,
      bottom: padY,
      left: padX,
      right: padX,
      background: { r: 0, g: 0, b: 0, alpha: 1 },
    })
    .png({ compressionLevel: 9 })
    .toFile(outputPath);
}

async function writePng(input, size, outputPath, { trim = true } = {}) {
  await fs.promises.mkdir(path.dirname(outputPath), { recursive: true });

  let pipeline = input.clone();
  if (trim) {
    pipeline = pipeline.trim({ threshold: 10 });
  }

  await pipeline
    .resize(size, size, {
      fit: 'contain',
      background: { r: 0, g: 0, b: 0, alpha: 1 },
    })
    .png({ compressionLevel: 9 })
    .toFile(outputPath);
}

async function ensureSources() {
  if (fs.existsSync(NEW_MONOGRAM)) {
    await fs.promises.copyFile(NEW_MONOGRAM, MONOGRAM_SOURCE);
  }

  const legacyMonogram = path.join(ROOT, 'public', 'lifev1 monogramm.png');
  const legacyLogo = path.join(ROOT, 'public', 'lifev1 logo.png');

  if (!fs.existsSync(MONOGRAM_SOURCE) && fs.existsSync(legacyMonogram)) {
    await fs.promises.copyFile(legacyMonogram, MONOGRAM_SOURCE);
  }
  if (!fs.existsSync(LOGO_SOURCE) && fs.existsSync(legacyLogo)) {
    await fs.promises.copyFile(legacyLogo, LOGO_SOURCE);
  }

  if (!fs.existsSync(MONOGRAM_SOURCE)) {
    throw new Error(`Missing monogram source at ${MONOGRAM_SOURCE}`);
  }
  if (!fs.existsSync(LOGO_SOURCE)) {
    throw new Error(`Missing logo source at ${LOGO_SOURCE}`);
  }
}

async function main() {
  await ensureSources();

  await fs.promises.copyFile(MONOGRAM_SOURCE, path.join(ROOT, 'public', 'monogramm.png'));
  await writeWordmark(LOGO_SOURCE, path.join(ROOT, 'public', 'logo.png'));

  const input = sharp(MONOGRAM_SOURCE);
  const faviconSizes = [16, 32, 48];
  const faviconBuffers = await Promise.all(
    faviconSizes.map((size) =>
      input
        .clone()
        .trim({ threshold: 10 })
        .resize(size, size, {
          fit: 'contain',
          background: { r: 0, g: 0, b: 0, alpha: 1 },
        })
        .png()
        .toBuffer()
    )
  );

  await writePng(input, 16, path.join(ROOT, 'public', 'favicon-16x16.png'));
  await writePng(input, 32, path.join(ROOT, 'public', 'favicon-32x32.png'));
  await writePng(input, 180, path.join(ROOT, 'public', 'apple-touch-icon.png'));

  const favicon = await toIco(faviconBuffers);
  await fs.promises.writeFile(path.join(ROOT, 'public', 'favicon.ico'), favicon);

  const androidRes = path.join(ROOT, 'android', 'app', 'src', 'main', 'res');
  for (const [folder, size] of Object.entries(ANDROID_LAUNCHER)) {
    const dir = path.join(androidRes, folder);
    await writePng(input, size, path.join(dir, 'ic_launcher.png'));
    await writePng(input, size, path.join(dir, 'ic_launcher_round.png'));
  }

  for (const [folder, size] of Object.entries(ANDROID_FOREGROUND)) {
    const dir = path.join(androidRes, folder);
    await writePng(input, size, path.join(dir, 'ic_launcher_foreground.png'));
  }

  console.log('[lifev1] Brand assets generated from resources/*.png');
}

main().catch((error) => {
  console.error('[lifev1] Failed to generate brand assets:', error);
  process.exit(1);
});
