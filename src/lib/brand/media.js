import { getSupabaseClient } from '../supabase';

const MAX_BYTES = 8 * 1024 * 1024;
const MAX_WIDTH = 1920;

export async function toJpegBlob(file, { maxWidth = MAX_WIDTH, quality = 0.9 } = {}) {
  if (!file) throw new Error('Διάλεξε εικόνα.');
  if (file.size > MAX_BYTES) throw new Error('Η εικόνα είναι πάνω από 8 MB.');
  if (!/^image\//.test(file.type || '')) throw new Error('Το αρχείο δεν είναι εικόνα.');

  let bitmap;
  try {
    bitmap = await createImageBitmap(file);
  } catch {
    throw new Error('Δεν μπόρεσα να ανοίξω την εικόνα. Δοκίμασε JPG ή PNG.');
  }

  const scale = Math.min(1, maxWidth / Math.max(1, bitmap.width));
  const width = Math.max(1, Math.round(bitmap.width * scale));
  const height = Math.max(1, Math.round(bitmap.height * scale));
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Αποτυχία επεξεργασίας εικόνας.');
  ctx.drawImage(bitmap, 0, 0, width, height);
  bitmap.close?.();

  const blob = await new Promise((resolve, reject) => {
    canvas.toBlob(
      (next) => (next ? resolve(next) : reject(new Error('Αποτυχία μετατροπής σε JPEG.'))),
      'image/jpeg',
      quality,
    );
  });
  return blob;
}

export async function uploadBrandPublishImage(file, itemId) {
  const supabase = getSupabaseClient();
  if (!supabase) throw new Error('Supabase not configured');
  const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
  if (sessionError) throw sessionError;
  const userId = sessionData.session?.user?.id;
  if (!userId) throw new Error('Δεν είσαι συνδεδεμένος.');

  const blob = await toJpegBlob(file);
  const path = `${userId}/${itemId || 'draft'}/${crypto.randomUUID()}.jpg`;
  const { error } = await supabase.storage.from('brand-publish').upload(path, blob, {
    contentType: 'image/jpeg',
    upsert: false,
  });
  if (error) throw error;
  const { data, error: signError } = await supabase.storage
    .from('brand-publish')
    .createSignedUrl(path, 60 * 60 * 2);
  if (signError) throw signError;
  const signedUrl = data?.signedUrl;
  if (!signedUrl) throw new Error('Δεν βγήκε URL για την εικόνα.');
  return signedUrl;
}
