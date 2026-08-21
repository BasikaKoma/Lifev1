export const OPENAI_KEY_STORAGE = 'nm-openai-api-key';

const envKey = import.meta.env.VITE_OPENAI_API_KEY;

function readStoredKey() {
  try {
    return localStorage.getItem(OPENAI_KEY_STORAGE);
  } catch {
    return null;
  }
}

export function getOpenAiKey() {
  const stored = readStoredKey();
  const key = stored || envKey;
  if (!key || key === 'your-openai-key-here') return null;
  return key;
}

export function isOpenAiConfigured() {
  return Boolean(getOpenAiKey());
}

export function saveOpenAiKey(key) {
  localStorage.setItem(OPENAI_KEY_STORAGE, key.trim());
}

export function clearOpenAiKey() {
  localStorage.removeItem(OPENAI_KEY_STORAGE);
}
