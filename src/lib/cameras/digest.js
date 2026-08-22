import { md5 } from './md5';

export function parseWwwAuthenticate(header) {
  const raw = Array.isArray(header) ? header.find((item) => /digest/i.test(item)) : header;
  if (!raw || !/digest/i.test(String(raw))) return null;

  const params = {};
  const body = String(raw).replace(/^Digest\s+/i, '');
  const re = /([a-zA-Z0-9_-]+)=(?:"([^"]*)"|([^,]*))/g;
  let match;
  while ((match = re.exec(body))) {
    params[match[1].toLowerCase()] = (match[2] ?? match[3] ?? '').trim();
  }
  if (!params.realm || !params.nonce) return null;
  return params;
}

export function buildDigestAuthorization({
  username,
  password,
  method,
  uri,
  challenge,
  nc = '00000001',
  cnonce,
}) {
  const algo = (challenge.algorithm || 'MD5').toUpperCase();
  if (algo !== 'MD5' && algo !== 'MD5-SESS') {
    throw new Error('Η κάμερα ζητά μη υποστηριζόμενο authentication.');
  }

  const qop = (challenge.qop || '')
    .split(',')
    .map((part) => part.trim())
    .find((part) => part === 'auth') || (challenge.qop ? challenge.qop.split(',')[0].trim() : '');

  const nonceCount = nc;
  const clientNonce = cnonce || Math.random().toString(16).slice(2) + Date.now().toString(16);
  let ha1 = md5(`${username}:${challenge.realm}:${password}`);
  if (algo === 'MD5-SESS') {
    ha1 = md5(`${ha1}:${challenge.nonce}:${clientNonce}`);
  }
  const ha2 = md5(`${method}:${uri}`);
  const response = qop
    ? md5(`${ha1}:${challenge.nonce}:${nonceCount}:${clientNonce}:${qop}:${ha2}`)
    : md5(`${ha1}:${challenge.nonce}:${ha2}`);

  const parts = [
    `username="${username}"`,
    `realm="${challenge.realm}"`,
    `nonce="${challenge.nonce}"`,
    `uri="${uri}"`,
    `response="${response}"`,
  ];
  if (challenge.opaque) parts.push(`opaque="${challenge.opaque}"`);
  if (challenge.algorithm) parts.push(`algorithm=${challenge.algorithm}`);
  if (qop) {
    parts.push(`qop=${qop}`);
    parts.push(`nc=${nonceCount}`);
    parts.push(`cnonce="${clientNonce}"`);
  }

  return `Digest ${parts.join(', ')}`;
}

export function pickHeader(headers, name) {
  if (!headers) return null;
  const wanted = name.toLowerCase();
  for (const [key, value] of Object.entries(headers)) {
    if (key.toLowerCase() === wanted) return value;
  }
  return null;
}
