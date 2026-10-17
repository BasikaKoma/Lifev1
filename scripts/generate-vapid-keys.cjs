/**
 * Generate a VAPID key pair for Web Push (iPhone home-screen app + browsers).
 *
 *   npm run push:vapid
 *
 * Put the public key in .env as VITE_VAPID_PUBLIC_KEY (it ships in the app),
 * and both keys in Supabase → Edge Functions → Secrets as VAPID_PUBLIC_KEY / VAPID_PRIVATE_KEY.
 * Generate once: rotating the keys invalidates every existing subscription.
 */
const crypto = require('crypto');

function toBase64Url(buffer) {
  return Buffer.from(buffer).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

const ecdh = crypto.createECDH('prime256v1');
ecdh.generateKeys();

const publicKey = toBase64Url(ecdh.getPublicKey());
// JWK "d" must be exactly 32 bytes; OpenSSL drops leading zero bytes.
const rawPrivate = ecdh.getPrivateKey();
const privateKey = toBase64Url(Buffer.concat([Buffer.alloc(32 - rawPrivate.length), rawPrivate]));

console.log('\n.env (app build):');
console.log(`VITE_VAPID_PUBLIC_KEY=${publicKey}`);
console.log('\nSupabase Edge Function secrets:');
console.log(`VAPID_PUBLIC_KEY=${publicKey}`);
console.log(`VAPID_PRIVATE_KEY=${privateKey}`);
console.log('VAPID_SUBJECT=https://lifev1-app.pages.dev\n');
