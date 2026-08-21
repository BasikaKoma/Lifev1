/** Max edge length when embedding clipboard/drop images into the project. */
export const PASTE_IMAGE_MAX_EDGE = 1600;
/** Max display size on the board (CSS pixels). */
export const PASTE_IMAGE_DISPLAY_MAX_W = 420;
export const PASTE_IMAGE_DISPLAY_MAX_H = 320;
const MAX_RAW_BYTES = 8 * 1024 * 1024;

export function isEditablePasteTarget(target) {
  if (!target || typeof target.closest !== 'function') return false;
  return Boolean(target.closest('input, textarea, select, [contenteditable="true"]'));
}

export function fileToDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ''));
    reader.onerror = () => reject(reader.error || new Error('Failed to read file'));
    reader.readAsDataURL(file);
  });
}

function loadImageElement(src) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('Failed to decode image'));
    img.src = src;
  });
}

/** Scale down large images and re-encode as JPEG to keep project JSON smaller. */
export async function optimizeImageDataUrl(dataUrl, maxEdge = PASTE_IMAGE_MAX_EDGE) {
  const img = await loadImageElement(dataUrl);
  const w = img.naturalWidth || img.width;
  const h = img.naturalHeight || img.height;
  if (!w || !h) return dataUrl;

  const scale = Math.min(1, maxEdge / w, maxEdge / h);
  const outW = Math.max(1, Math.round(w * scale));
  const outH = Math.max(1, Math.round(h * scale));

  if (scale >= 1 && dataUrl.startsWith('data:image/jpeg')) {
    return dataUrl;
  }

  const canvas = document.createElement('canvas');
  canvas.width = outW;
  canvas.height = outH;
  const ctx = canvas.getContext('2d');
  if (!ctx) return dataUrl;
  ctx.drawImage(img, 0, 0, outW, outH);
  try {
    return canvas.toDataURL('image/jpeg', 0.85);
  } catch {
    return dataUrl;
  }
}

export function getImageDisplaySize(naturalW, naturalH) {
  const w = naturalW || PASTE_IMAGE_DISPLAY_MAX_W;
  const h = naturalH || Math.round(PASTE_IMAGE_DISPLAY_MAX_W * 0.75);
  const scale = Math.min(
    1,
    PASTE_IMAGE_DISPLAY_MAX_W / w,
    PASTE_IMAGE_DISPLAY_MAX_H / h
  );
  return {
    width: Math.max(120, Math.round(w * scale)),
    height: Math.max(90, Math.round(h * scale)),
  };
}

export async function prepareImageFromFile(file) {
  if (!file || !String(file.type || '').startsWith('image/')) {
    throw new Error('Not an image file');
  }
  if (file.size > MAX_RAW_BYTES) {
    throw new Error('Image is too large (max 8 MB)');
  }
  const raw = await fileToDataUrl(file);
  const optimized = await optimizeImageDataUrl(raw);
  const img = await loadImageElement(optimized);
  const size = getImageDisplaySize(img.naturalWidth, img.naturalHeight);
  return {
    imageSrc: optimized,
    width: size.width,
    height: size.height,
  };
}

/**
 * Read OS clipboard / dataTransfer payload.
 * @returns {{ kind: 'image', file: File } | { kind: 'text', text: string } | null}
 */
export function readClipboardPayload(dataTransfer) {
  if (!dataTransfer) return null;

  const items = dataTransfer.items ? Array.from(dataTransfer.items) : [];
  for (const item of items) {
    if (item.kind === 'file' && item.type.startsWith('image/')) {
      const file = item.getAsFile();
      if (file) return { kind: 'image', file };
    }
  }

  const files = dataTransfer.files ? Array.from(dataTransfer.files) : [];
  for (const file of files) {
    if (String(file.type || '').startsWith('image/')) {
      return { kind: 'image', file };
    }
  }

  const text = dataTransfer.getData?.('text/plain');
  if (typeof text === 'string' && text.trim()) {
    return { kind: 'text', text: text.replace(/\r\n/g, '\n') };
  }

  return null;
}

export const IMAGE_STICKY_STYLE = {
  color: '#f8fafc',
  shape: 'rounded',
  fontSize: 'md',
  fontWeight: 'normal',
};
