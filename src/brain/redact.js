const SECRET_KEY = /token|secret|password|api[_-]?key|authorization|refresh/i;

export function redactSecrets(value, depth = 0) {
  if (depth > 8) return null;
  if (Array.isArray(value)) return value.slice(0, 40).map((item) => redactSecrets(item, depth + 1));
  if (value && typeof value === 'object') {
    const out = {};
    for (const [key, item] of Object.entries(value)) {
      if (SECRET_KEY.test(key)) continue;
      out[key] = redactSecrets(item, depth + 1);
    }
    return out;
  }
  if (typeof value === 'string') {
    const cleaned = value.replace(/ya29\.[A-Za-z0-9_\-]+/g, '[redacted]');
    return cleaned.length > 800 ? `${cleaned.slice(0, 799)}…` : cleaned;
  }
  return value;
}
