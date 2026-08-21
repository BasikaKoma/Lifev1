import { createClient, type SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2';

type AuthUser = {
  id: string;
  email?: string | null;
};

export function getServiceClient(): SupabaseClient {
  const url = Deno.env.get('SUPABASE_URL');
  const key = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!url || !key) {
    throw new Error('Missing Supabase service configuration');
  }
  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

function decodeJwtPayload(token: string): Record<string, unknown> | null {
  try {
    const part = token.split('.')[1];
    if (!part) return null;
    const json = atob(part.replace(/-/g, '+').replace(/_/g, '/'));
    return JSON.parse(json);
  } catch {
    return null;
  }
}

function getBearerToken(req: Request): string {
  const authHeader = req.headers.get('Authorization');
  if (!authHeader?.startsWith('Bearer ')) {
    throw new Error('Missing authorization');
  }
  return authHeader.slice('Bearer '.length).trim();
}

export async function getUserFromRequest(req: Request): Promise<AuthUser> {
  const token = getBearerToken(req);
  const payload = decodeJwtPayload(token);
  const subject = typeof payload?.sub === 'string' ? payload.sub : null;
  const role = payload?.role;

  if (!subject || role !== 'authenticated') {
    throw new Error('Invalid session');
  }

  return {
    id: subject,
    email: typeof payload?.email === 'string' ? payload.email : null,
  };
}

/** Authorize cron / admin callers (service role JWT or vault cron secret). */
export async function assertServiceOrCronAuth(req: Request): Promise<void> {
  const token = getBearerToken(req);
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
  if (serviceKey && token === serviceKey) return;

  const payload = decodeJwtPayload(token);
  if (payload?.role === 'service_role') return;

  const cronSecret = Deno.env.get('OURA_CRON_SECRET') ?? '';
  if (cronSecret && token === cronSecret) return;

  const { data, error } = await getServiceClient().rpc('internal_get_oura_cron_secret');
  if (!error && typeof data === 'string' && data && token === data) return;

  throw new Error('Missing authorization');
}
