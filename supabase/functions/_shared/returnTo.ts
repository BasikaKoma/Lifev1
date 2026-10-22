// The app's own places an OAuth flow may send the browser back to. Extra origins (e.g. a LAN dev
// server) go in the APP_ALLOWED_ORIGINS secret, comma-separated.
const APP_ORIGINS = [
  'https://lifev1-app.pages.dev',
  'https://app.lifev1.com',
  'http://127.0.0.1:17823',
  'http://localhost:5173',
];

function allowedOrigins(): string[] {
  const extra = (Deno.env.get('APP_ALLOWED_ORIGINS') ?? '')
    .split(',')
    .map((item) => {
      try {
        return new URL(item.trim()).origin;
      } catch {
        return '';
      }
    })
    .filter(Boolean);
  return [...APP_ORIGINS, ...extra];
}

/** Keeps return_to on the app (its deep link or its own origins); anything else gets the fallback. */
export function sanitizeReturnTo(value: unknown, fallback: string): string {
  if (typeof value !== 'string' || !value.trim()) return fallback;
  try {
    const url = new URL(value);
    if (url.protocol === 'lifev1:') return url.toString();
    if (allowedOrigins().includes(url.origin)) return url.toString();
    return fallback;
  } catch {
    return fallback;
  }
}
