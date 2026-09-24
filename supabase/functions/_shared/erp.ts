export const ERP_DOMAINS = [
  'cash',
  'customers',
  'sales',
  'prices',
  'operations',
  'people',
  'suppliers',
  'documents',
] as const;

export type ErpDomain = typeof ERP_DOMAINS[number];

const SECRET_KEY = /token|secret|password|api[_-]?key|authorization|refresh/i;

export function assertErpBaseUrl(value: string): string {
  let url: URL;
  try {
    url = new URL(String(value || '').trim());
  } catch {
    throw new Error('ERP URL is invalid');
  }
  if (url.username || url.password) throw new Error('ERP URL must not contain credentials');
  const local = url.hostname === 'localhost' || url.hostname === '127.0.0.1';
  if (url.protocol !== 'https:' && !(url.protocol === 'http:' && local)) {
    throw new Error('ERP URL must be https');
  }
  return url.toString().replace(/\/$/, '');
}

export function isErpDomain(value: string): value is ErpDomain {
  return (ERP_DOMAINS as readonly string[]).includes(value);
}

export function redactErpPayload(value: unknown, depth = 0): unknown {
  if (depth > 8) return null;
  if (Array.isArray(value)) return value.slice(0, 40).map((item) => redactErpPayload(item, depth + 1));
  if (value && typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const [key, item] of Object.entries(value as Record<string, unknown>)) {
      if (SECRET_KEY.test(key)) continue;
      out[key] = redactErpPayload(item, depth + 1);
    }
    return out;
  }
  if (typeof value === 'string') return value.slice(0, 800);
  return value;
}

export async function fetchErpDomain(baseUrl: string, apiKey: string, domain: ErpDomain) {
  const url = `${assertErpBaseUrl(baseUrl)}/${domain}`;
  const res = await fetch(url, {
    headers: {
      Authorization: `Bearer ${apiKey}`,
      Accept: 'application/json',
    },
    signal: AbortSignal.timeout(12000),
  });
  const text = await res.text();
  if (!res.ok) {
    throw new Error(`ERP ${domain} failed (${res.status})`);
  }
  let parsed: unknown = {};
  try {
    parsed = text ? JSON.parse(text) : {};
  } catch {
    throw new Error(`ERP ${domain} did not return JSON`);
  }
  const redacted = redactErpPayload(parsed);
  const serialized = JSON.stringify(redacted);
  if (serialized.length > 60000) {
    return { truncated: true, preview: serialized.slice(0, 4000) };
  }
  return redacted;
}
