import { getVerificationToken, handleWebhookPost } from '../_shared/ouraWebhook.ts';

declare const EdgeRuntime: { waitUntil(task: Promise<unknown>): void } | undefined;

/**
 * Oura's webhook callback (verify_jwt off: Oura sends no Supabase JWT).
 * GET answers the subscription challenge; POST is a signed data event.
 */
Deno.serve(async (req) => {
  if (req.method === 'GET') {
    const url = new URL(req.url);
    const challenge = url.searchParams.get('challenge');
    let expected = '';
    try {
      expected = getVerificationToken();
    } catch {
      return new Response('Not configured', { status: 500 });
    }
    if (!challenge || url.searchParams.get('verification_token') !== expected) {
      return new Response('Invalid verification token', { status: 401 });
    }
    return new Response(JSON.stringify({ challenge }), {
      headers: { 'Content-Type': 'application/json' },
    });
  }

  if (req.method !== 'POST') {
    return new Response('Method not allowed', { status: 405 });
  }

  const waitUntil = (task: Promise<unknown>) => {
    if (typeof EdgeRuntime !== 'undefined' && EdgeRuntime?.waitUntil) EdgeRuntime.waitUntil(task);
  };
  try {
    return await handleWebhookPost(req, waitUntil);
  } catch (err) {
    console.error('oura-webhook failed:', err);
    return new Response('Error', { status: 500 });
  }
});
